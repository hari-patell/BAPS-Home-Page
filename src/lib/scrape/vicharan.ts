import * as cheerio from "cheerio";
import { revalidateTag, unstable_cache } from "next/cache";
import { SOURCES } from "@/lib/config";
import type { VicharanData, VicharanPhoto } from "@/lib/types";
import { absoluteUrl, cleanText, fetchHtml } from "./fetchHtml";
import {
  DATE_TOKEN_RE,
  collectImages,
  dateFromFilename,
  findHeading,
  toContentImages,
} from "./heuristics";

const LOCATION_SPLIT_RE = /[—–-]\s*/;

// A day page never changes once published, so its photos are worth caching
// far longer than the dashboard itself.
const DETAIL_PHOTO_TTL_S = 24 * 60 * 60;
// The whole feature now hangs on one detail navigation — the newest day's
// page — so it gets a real timeout and a genuine re-solve budget rather than
// the clipped one the old "bonus photo per day" fetches used.
const DETAIL_FETCH_TIMEOUT_MS = 15000;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function splitDateLocation(
  caption: string | undefined,
): { date?: string; location?: string } {
  if (!caption) return {};
  const dateMatch = caption.match(DATE_TOKEN_RE);
  if (!dateMatch) return { location: caption };
  const date = dateMatch[0];
  const rest = caption.slice(dateMatch.index! + date.length);
  const location = cleanText(rest.split(LOCATION_SPLIT_RE).slice(-1)[0]) || undefined;
  return { date, location };
}

/**
 * Maps each `D-Mon-YYYY` date on the listing page to the location that
 * follows it, by scanning the page's own text for the site's
 * "1-Aug-2026 - Sarangpur, India" caption format. Keyed on a normalised
 * date so it lines up with dates recovered from thumbnail filenames.
 */
function collectCaptionsByDate($: cheerio.CheerioAPI): Map<string, string> {
  const byDate = new Map<string, string>();
  const text = cleanText($("body").text());
  // The trailing group stops at the first character that can't be part of a
  // place name — without that bound it ran on into adjacent markup text
  // ("Ahmedabad, India .socialmedia").
  const pattern = new RegExp(
    `(${DATE_TOKEN_RE.source})\\s*[-–—]\\s*([A-Za-z][A-Za-z .'-]{0,40},\\s*[A-Za-z][A-Za-z .'-]{0,40}?)(?=\\s*(?:[.#]|$|\\d{1,2}[-\\s][A-Z]))`,
    "gi",
  );
  for (const m of text.matchAll(pattern)) {
    const date = normaliseDate(m[1]);
    const location = cleanText(m[2]);
    if (date && location && !byDate.has(date)) byDate.set(date, location);
  }
  return byDate;
}

/** `01-Aug-2026` / `1 Aug 2026` -> `1-Aug-2026`, matching dateFromFilename. */
function normaliseDate(raw: string): string | undefined {
  const m = raw.match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{4})/);
  if (!m) return undefined;
  const month = m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase();
  return `${Number(m[1])}-${month}-${m[3]}`;
}

/** `18-Aug-2026` -> 20260818, so days sort chronologically as numbers. */
function dateSortKey(date: string): number {
  const m = date.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return 0;
  const month = MONTHS.indexOf(m[2]) + 1;
  if (month === 0) return 0;
  return Number(m[3]) * 10000 + month * 100 + Number(m[1]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const THUMBNAIL_PATH_RE = /\/Thumbnails\//i;

/**
 * Reads every full-size photo off a single Vicharan day page, in document
 * order, keeping each one's on-page caption ("BAPS Shri Swaminarayan Mandir,
 * Ahmedabad", "Shri Ghanshyam Maharaj", ...).
 *
 * Day pages serve the full-size photo out of the same /Media/ tree as the
 * listing, just outside /Thumbnails/ — that path segment is the only
 * reliable full-vs-blurry signal, and it also drops the small
 * neighbouring-day links a day page carries at the bottom.
 */
async function fetchDayPhotos(href: string): Promise<VicharanPhoto[]> {
  const html = await fetchHtml(href, {
    timeoutMs: DETAIL_FETCH_TIMEOUT_MS,
    // One detail page per scrape now, not six — it can afford the full
    // re-solve budget the old per-day bonus fetches had to skimp on.
    maxAttempts: 3,
  });
  const $ = cheerio.load(html);
  const candidates = toContentImages(collectImages($, href));

  const photos: VicharanPhoto[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (THUMBNAIL_PATH_RE.test(c.src) || seen.has(c.src)) continue;
    seen.add(c.src);
    // The caption heuristic already caps length and looks outward from the
    // image; drop a caption that is only the day's date/location line, since
    // that's shown once in the header rather than on every photo.
    const caption = cleanText(c.caption) || undefined;
    photos.push({ image: c.src, caption });
  }
  if (photos.length === 0) throw new Error(`no photos on ${href}`);
  return photos;
}

/**
 * Day-page photos are cached per URL, well beyond the dashboard's own 30
 * minutes: a published day page never changes, and re-reading it costs a
 * headless navigation and a Cloudflare solve each time.
 */
function cachedDayPhotos(href: string): Promise<VicharanPhoto[]> {
  return unstable_cache(
    () => fetchDayPhotos(href),
    ["vicharan-day-photos", href],
    // Its own tag, not the dashboard's: refreshing the dashboard should never
    // throw away the day's photos, which don't change and cost a navigation
    // to re-earn.
    { revalidate: DETAIL_PHOTO_TTL_S, tags: ["vicharan-detail-photo"] },
  )();
}

// Day pages live at /Vicharan/2026/18-August-2026-31775.aspx. Reading the
// date straight off the URL is steadier than relying on each thumbnail
// sitting inside its own <a> — on the listing page the caption sits outside
// the link, and some thumbnails aren't wrapped in one at all, which left
// `href` undefined.
const DETAIL_HREF_RE = /\/Vicharan\/\d{4}\/(\d{1,2})-([A-Za-z]{3,9})-(\d{4})-\d+\.aspx/i;

export function collectDetailLinksByDate(
  $: cheerio.CheerioAPI,
  baseUrl: string,
): Map<string, string> {
  const byDate = new Map<string, string>();
  $("a[href]").each((_, el) => {
    const href = absoluteUrl(baseUrl, $(el).attr("href"));
    if (!href) return;
    const m = href.match(DETAIL_HREF_RE);
    if (!m) return;
    const date = normaliseDate(`${m[1]}-${m[2]}-${m[3]}`);
    if (date && !byDate.has(date)) byDate.set(date, href);
  });
  return byDate;
}

interface ListingEntry {
  date: string;
  location: string;
  thumbnail: string;
  href?: string;
}

/**
 * Reads the listing page and returns one entry per day, newest day first.
 *
 * The caption text ("4-Aug-2026 - Sarangpur, India") sits outside the <a>
 * in the listing markup, so the DOM scan often comes back with an empty
 * caption. The thumbnail filename carries the date regardless
 * (.../Thumbnails/20260804_i.jpg), and captionByDate recovers the location
 * by matching that date against the page's own text.
 */
function parseListing($: cheerio.CheerioAPI, sourceUrl: string): ListingEntry[] {
  const contentImages = toContentImages(collectImages($, sourceUrl));
  const captionByDate = collectCaptionsByDate($);
  const detailByDate = collectDetailLinksByDate($, sourceUrl);

  const byDate = new Map<string, ListingEntry>();
  for (const img of contentImages) {
    const fromCaption = splitDateLocation(img.caption || undefined);
    const date = fromCaption.date ?? dateFromFilename(img.src);
    if (!date || byDate.has(date)) continue;
    byDate.set(date, {
      date,
      location: fromCaption.location ?? captionByDate.get(date) ?? "",
      thumbnail: img.src,
      href: img.href ?? detailByDate.get(date),
    });
  }

  // A day page may be linked without its thumbnail sitting in the content
  // scan — fold those in so the newest day is never missed just because its
  // image didn't parse.
  for (const [date, href] of detailByDate) {
    if (byDate.has(date)) continue;
    byDate.set(date, {
      date,
      location: captionByDate.get(date) ?? "",
      thumbnail: "",
      href,
    });
  }

  return [...byDate.values()].sort(
    (a, b) => dateSortKey(b.date) - dateSortKey(a.date),
  );
}

/** The single newest day on the listing page, or undefined if none parsed. */
function latestDay($: cheerio.CheerioAPI, sourceUrl: string): ListingEntry | undefined {
  return parseListing($, sourceUrl)[0];
}

export async function getVicharan(
  { fresh = false, deadline }: { fresh?: boolean; deadline?: number } = {},
): Promise<VicharanData> {
  const sourceUrl = SOURCES.vicharan;
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchHtml(sourceUrl, {
      revalidate: fresh ? false : 1800,
      deadline,
    });
    const $ = cheerio.load(html);

    const latest = latestDay($, sourceUrl);

    // Pull every photo off the newest day's own page. Not conditioned on
    // `fresh`: a published day page is immutable, so a manual refresh has
    // nothing to gain from re-navigating it.
    let photos: VicharanPhoto[] = [];
    if (latest?.href) {
      photos = await cachedDayPhotos(latest.href).catch(() => []);
    }
    // If the day page couldn't be read, fall back to the listing thumbnail so
    // the panel shows something rather than an empty state.
    if (photos.length === 0 && latest?.thumbnail) {
      photos = [{ image: latest.thumbnail, caption: latest.location || undefined }];
    }

    const scheduleHeading = findHeading($, /vicharan schedule/i);
    let scheduleHref: string | undefined;
    let scheduleNote: string | undefined;
    if (scheduleHeading) {
      scheduleNote = cleanText(scheduleHeading.text());
      const anchor = scheduleHeading.is("a")
        ? scheduleHeading
        : scheduleHeading.closest("a").length
          ? scheduleHeading.closest("a")
          : scheduleHeading.find("a").first();
      scheduleHref = absoluteUrl(sourceUrl, anchor?.attr("href"));
    }

    return {
      date: latest?.date,
      location: latest?.location || undefined,
      detailUrl: latest?.href,
      photos,
      scheduleNote,
      scheduleHref,
      sourceUrl,
      fetchedAt,
      ok: true,
    };
  } catch (err) {
    return {
      photos: [],
      sourceUrl,
      fetchedAt,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Reads the newest day page through the day-photo cache and reports what it
 * resolved to. A normal scrape already primes exactly this one page, so this
 * exists only to force the cache after a deploy rather than wait it out. It
 * is exposed only through /api/debug.
 */
export async function primeDetailPhotos(): Promise<
  { date?: string; photos?: number; sample?: string[]; error?: string }[]
> {
  const sourceUrl = SOURCES.vicharan;
  let latest: ListingEntry | undefined;
  try {
    latest = latestDay(cheerio.load(await fetchHtml(sourceUrl)), sourceUrl);
  } catch (err) {
    return [{ error: err instanceof Error ? err.message : String(err) }];
  }

  if (!latest?.href) {
    return [{ date: latest?.date, error: "no day-page link on the newest entry" }];
  }

  let result: { date?: string; photos?: number; sample?: string[]; error?: string };
  try {
    const photos = await cachedDayPhotos(latest.href);
    result = {
      date: latest.date,
      photos: photos.length,
      sample: photos.slice(0, 4).map((p) => p.caption ?? p.image.split("/").pop() ?? ""),
    };
  } catch (err) {
    result = { date: latest.date, error: err instanceof Error ? err.message : String(err) };
  }
  await sleep(0);

  // Mark the cached dashboard stale so the page picks the newly primed photos
  // up on its next visit rather than at the end of its 30-minute window.
  // "max" is stale-while-revalidate: the current blob is still served while
  // the re-scrape runs, so nobody waits on it.
  if (result.photos) revalidateTag("dashboard", "max");

  return [result];
}
