import * as cheerio from "cheerio";
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

// The listing page has ~30+ entries per month (58+ across the "upcoming"
// window shown on-site); following every single one into its own detail
// page for a better photo would mean 30+ extra headless-browser page loads
// per scrape, which is both slow (risks the function's time budget) and
// wasteful for a carousel nobody scrolls that deep into. Cap to the most
// recent handful instead.
const MAX_DETAIL_FETCHES = 12;
const DETAIL_FETCH_CONCURRENCY = 2;

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
  const pattern = new RegExp(
    `(${DATE_TOKEN_RE.source})\\s*[-–—]\\s*([A-Za-z][^,]{0,40},\\s*[A-Za-z][A-Za-z .]{0,40})`,
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
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
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
const DETAIL_FETCH_TIMEOUT_MS = 12000;

async function fetchBetterPhoto(
  href: string,
  fresh: boolean,
): Promise<string | undefined> {
  try {
    const html = await fetchHtml(href, {
      timeoutMs: DETAIL_FETCH_TIMEOUT_MS,
      revalidate: fresh ? false : 3600,
    });
    const $ = cheerio.load(html);
    const candidates = toContentImages(collectImages($, href));
    // Detail pages put the full-size photo under the same /Media/ tree but
    // outside /Thumbnails/ — prefer that over any thumbnail echo.
    const full = candidates.find((c) => !/\/Thumbnails\//i.test(c.src));
    return (full ?? candidates[0])?.src;
  } catch {
    return undefined;
  }
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

    const parsed = contentImages
      .map((img) => {
        const fromCaption = splitDateLocation(img.caption || undefined);
        const date = fromCaption.date ?? dateFromFilename(img.src);
        if (!date) return undefined;
        const location =
          fromCaption.location ?? captionByDate.get(date) ?? "";
        return { date, location, thumbnail: img.src, href: img.href };
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    // Listing order is chronological ascending (oldest day first); take the
    // most recent slice and show newest-first, matching how the source site
    // itself highlights the latest Vicharan first.
    const recent = parsed.slice(-MAX_DETAIL_FETCHES).reverse();

    const betterPhotos = await mapWithConcurrency(recent, DETAIL_FETCH_CONCURRENCY, (entry) =>
      entry.href ? fetchBetterPhoto(entry.href, fresh) : Promise.resolve(undefined),
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
