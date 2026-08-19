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
const DETAIL_PHASE_BUDGET_MS = 20000;

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
  fresh: boolean,
): Promise<string> {
  try {
    const html = await fetchHtml(href, {
      timeoutMs: DETAIL_FETCH_TIMEOUT_MS,
      revalidate: fresh ? false : 3600,
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
    () => fetchBetterPhoto(href, expectedDate, false),
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

export async function getVicharan(
  { fresh = false }: { fresh?: boolean } = {},
): Promise<VicharanData> {
  const sourceUrl = SOURCES.vicharan;
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchHtml(sourceUrl, { revalidate: fresh ? false : 1800 });
    const $ = cheerio.load(html);

    const contentImages = toContentImages(collectImages($, sourceUrl));

    // The caption text ("4-Aug-2026 - Sarangpur, India") sits outside the
    // <a> in the listing markup, so the DOM scan often comes back with an
    // empty caption. The thumbnail filename carries the date regardless
    // (.../Thumbnails/20260804_i.jpg), and captionByDate recovers the
    // location by matching that date against the page's own text.
    const captionByDate = collectCaptionsByDate($);
    const detailByDate = collectDetailLinksByDate($, sourceUrl);

    const parsed = contentImages
      .map((img) => {
        const fromCaption = splitDateLocation(img.caption || undefined);
        const date = fromCaption.date ?? dateFromFilename(img.src);
        if (!date) return undefined;
        const location =
          fromCaption.location ?? captionByDate.get(date) ?? "";
        return {
          date,
          location,
          thumbnail: img.src,
          href: img.href ?? detailByDate.get(date),
        };
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    // Listing order is chronological ascending (oldest day first); take the
    // most recent slice and show newest-first, matching how the source site
    // itself highlights the latest Vicharan first.
    const recent = parsed.slice(-MAX_ENTRIES).reverse();

    // Hard deadline for the whole detail-fetch phase: past it, remaining
    // entries just keep their listing thumbnail rather than risking the
    // function timing out and losing the entire dashboard.
    const detailDeadline = Date.now() + DETAIL_PHASE_BUDGET_MS;
    const betterPhotos = await mapWithConcurrency(
      recent,
      DETAIL_FETCH_CONCURRENCY,
      (entry, i) => {
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
          return Promise.resolve(undefined);
        }
        const lookup = fresh
          ? fetchBetterPhoto(entry.href, entry.date, true)
          : cachedBetterPhoto(entry.href, entry.date);
        return lookup.catch(() => undefined);
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
