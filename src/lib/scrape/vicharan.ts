import * as cheerio from "cheerio";
import { unstable_cache } from "next/cache";
import { SOURCES } from "@/lib/config";
import type { VicharanData, VicharanEntry } from "@/lib/types";
import { absoluteUrl, cleanText, fetchHtml } from "./fetchHtml";
import {
  DATE_TOKEN_RE,
  collectImages,
  dateFromFilename,
  findHeading,
  toContentImages,
} from "./heuristics";

const LOCATION_SPLIT_RE = /[—–-]\s*/;

// Each entry's better photo lives on its own detail page, and every one of
// those is a real browser navigation (see lib/scrape/clearance.ts) — so
// these cost both memory and time, and all of it has to fit inside the
// function's 60s ceiling alongside Chromium cold-start and the Cloudflare
// solve. Hence: few of them, a handful at a time, short per-page timeout,
// and a hard deadline for the phase as a whole.
const MAX_ENTRIES = 6;
// A day page never changes once published, so its photo is worth caching
// far longer than the dashboard itself.
const DETAIL_PHOTO_TTL_S = 24 * 60 * 60;
// Detail pages are fetched one at a time. Two simultaneous navigations to
// baps.org prompt Cloudflare to re-issue a challenge mid-flight — the same
// race that made one of the two top-level sources fail while the other
// succeeded (see lib/data.ts). Running them concurrently is why every
// entry was falling back to its listing thumbnail.
const MAX_DETAIL_FETCHES = MAX_ENTRIES;
const DETAIL_FETCH_CONCURRENCY = 1;
const DETAIL_PHASE_BUDGET_MS = 24000;
// Day pages come back challenged when fetched back-to-back, even though the
// host is cleared and the listing page itself loads fine — Cloudflare is
// reacting to the burst, not to us. A pause between them buys far more
// photos than the second or so it costs.
const DETAIL_FETCH_SPACING_MS = 1500;

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Each Vicharan thumbnail links to that day's own page, which — per a live
 * screenshot from the actual site — holds a better photo than the listing
 * thumbnail (the thumbnails there carry a video-play badge, i.e. they're
 * video posters, not necessarily the best still photo for that day). Falls
 * back to the listing thumbnail if the detail page fails to load or has no
 * usable image, so one bad detail page never drops an entry entirely.
 */
// Short timeout — these are bonus fetches with a graceful thumbnail
// fallback, so failing fast on a slow detail page beats risking the whole
// route's maxDuration budget.
const DETAIL_FETCH_TIMEOUT_MS = 9000;

const THUMBNAIL_PATH_RE = /\/Thumbnails\//i;

async function fetchBetterPhoto(
  href: string,
  expectedDate: string,
): Promise<string> {
  try {
    const html = await fetchHtml(href, {
      timeoutMs: DETAIL_FETCH_TIMEOUT_MS,
      // Two, not three: a challenged day page gets one genuine re-solve,
      // because Cloudflare stops honouring the session's clearance after a
      // couple of rapid page loads and every day page after that is refused
      // until it's re-earned. Beyond two, the thumbnail fallback plus the
      // day-photo cache is the better trade.
      maxAttempts: 2,
    });
    const $ = cheerio.load(html);
    const candidates = toContentImages(collectImages($, href));

    // Detail pages serve the full-size photo out of the same /Media/ tree as
    // the listing, just outside /Thumbnails/ — that path segment is the only
    // reliable full-vs-blurry signal, since both share a filename.
    const full = candidates.filter((c) => !THUMBNAIL_PATH_RE.test(c.src));

    // A day's page also links out to neighbouring days, so prefer a photo
    // whose own filename stamp matches the day we asked for before falling
    // back to document order.
    const sameDay = full.find((c) => dateFromFilename(c.src) === expectedDate);
    const src = (sameDay ?? full[0] ?? candidates[0])?.src;
    if (!src) throw new Error(`no usable photo on ${href}`);
    return src;
  } catch {
    // Deliberately rethrown rather than resolved as undefined: the caller
    // caches this, and caching "no photo" for a day would pin the blurry
    // thumbnail in place long after a transient failure.
    throw new Error(`no photo for ${href}`);
  }
}

/**
 * Day-page photos are cached per URL, well beyond the dashboard's own 30
 * minutes. Only a genuinely new day costs a navigation, so after the first
 * couple of runs every entry shows its full-size photo rather than only the
 * few that fit inside one run's detail budget.
 */
function cachedBetterPhoto(href: string, expectedDate: string): Promise<string> {
  return unstable_cache(
    () => fetchBetterPhoto(href, expectedDate),
    ["vicharan-detail-photo", href],
    { revalidate: DETAIL_PHOTO_TTL_S, tags: ["dashboard"] },
  )();
}

// Day pages live at /Vicharan/2026/18-August-2026-31775.aspx. Reading the
// date straight off the URL is steadier than relying on each thumbnail
// sitting inside its own <a> — on the listing page the caption sits outside
// the link, and some thumbnails aren't wrapped in one at all, which left
// `href` undefined and skipped the detail fetch entirely.
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
 * Reads the listing page down to the newest few days, newest first.
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

  const parsed = contentImages
    .map((img): ListingEntry | undefined => {
      const fromCaption = splitDateLocation(img.caption || undefined);
      const date = fromCaption.date ?? dateFromFilename(img.src);
      if (!date) return undefined;
      const location = fromCaption.location ?? captionByDate.get(date) ?? "";
      return {
        date,
        location,
        thumbnail: img.src,
        href: img.href ?? detailByDate.get(date),
      };
    })
    .filter((e): e is ListingEntry => Boolean(e));

  // Listing order is chronological ascending (oldest day first); take the
  // most recent slice and show newest-first, matching how the source site
  // itself highlights the latest Vicharan first.
  return parsed.slice(-MAX_ENTRIES).reverse();
}

export async function getVicharan(
  { fresh = false }: { fresh?: boolean } = {},
): Promise<VicharanData> {
  const sourceUrl = SOURCES.vicharan;
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchHtml(sourceUrl, { revalidate: fresh ? false : 1800 });
    const $ = cheerio.load(html);

    const recent = parseListing($, sourceUrl);

    // Hard deadline for the whole detail-fetch phase: past it, remaining
    // entries just keep their listing thumbnail rather than risking the
    // function timing out and losing the entire dashboard.
    const detailDeadline = Date.now() + DETAIL_PHASE_BUDGET_MS;
    const betterPhotos = await mapWithConcurrency(
      recent,
      DETAIL_FETCH_CONCURRENCY,
      async (entry, i) => {
        // Newest days first, so if the budget runs out it's the older
        // entries that keep their thumbnail rather than the headline photo.
        // Deadline is checked against the point this fetch could *finish*,
        // not the point it starts — otherwise a fetch begun one millisecond
        // inside the budget could still overrun it by a full timeout.
        if (
          !entry.href ||
          i >= MAX_DETAIL_FETCHES ||
          Date.now() + DETAIL_FETCH_TIMEOUT_MS > detailDeadline
        ) {
          return undefined;
        }
        // Not conditioned on `fresh`: a day page is immutable once
        // published, so the manual refresh has nothing to gain from
        // re-fetching six of them and a whole budget to lose.
        const startedAt = Date.now();
        const photo = await cachedBetterPhoto(entry.href, entry.date).catch(
          () => undefined,
        );
        // Only a fast *success* is a cache hit. A challenge rejection also
        // comes back in milliseconds, and treating that as a cache hit meant
        // the spacing never engaged for exactly the runs that needed it —
        // five day pages were refused in barely a second between them.
        const cacheHit = photo !== undefined && Date.now() - startedAt < 300;
        if (!cacheHit && i < recent.length - 1) {
          await sleep(DETAIL_FETCH_SPACING_MS);
        }
        return photo;
      },
    );

    const entries: VicharanEntry[] = recent.map((entry, i) => ({
      date: entry.date,
      location: entry.location,
      image: betterPhotos[i] ?? entry.thumbnail,
      href: entry.href,
    }));

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
      entries,
      scheduleNote,
      scheduleHref,
      sourceUrl,
      fetchedAt,
      ok: true,
    };
  } catch (err) {
    return {
      entries: [],
      sourceUrl,
      fetchedAt,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Walks the newest `count` day pages through the day-photo cache, one
 * navigation at a time, and reports what each one resolved to.
 *
 * A scrape only has budget for a couple of uncached day pages, so the
 * carousel fills in over successive runs. This exists so that can be done
 * deliberately — after a deploy, say — rather than waited out. It is
 * exposed only through /api/debug.
 */
export async function primeDetailPhotos(
  count: number,
): Promise<{ date: string; photo?: string; error?: string }[]> {
  const sourceUrl = SOURCES.vicharan;
  let recent: ListingEntry[];
  try {
    recent = parseListing(cheerio.load(await fetchHtml(sourceUrl)), sourceUrl);
  } catch (err) {
    return [{ date: "listing", error: err instanceof Error ? err.message : String(err) }];
  }

  const out: { date: string; photo?: string; error?: string }[] = [];
  for (const entry of recent.slice(0, Math.min(count, MAX_ENTRIES))) {
    if (!entry.href) {
      out.push({ date: entry.date, error: "no day-page link" });
      continue;
    }
    try {
      out.push({
        date: entry.date,
        photo: await cachedBetterPhoto(entry.href, entry.date),
      });
    } catch (err) {
      out.push({
        date: entry.date,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await sleep(DETAIL_FETCH_SPACING_MS);
  }

  return out;
}
