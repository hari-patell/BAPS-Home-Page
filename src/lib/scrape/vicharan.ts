import * as cheerio from "cheerio";
import { SOURCES } from "@/lib/config";
import type { VicharanData, VicharanEntry } from "@/lib/types";
import { absoluteUrl, cleanText, fetchHtml, fetchHtmlWithLinks } from "./fetchHtml";
import { DATE_TOKEN_RE, findHeading, toContentImages } from "./heuristics";

const LOCATION_SPLIT_RE = /[—–-]\s*/;

// The listing page has ~30+ entries per month (58+ across the "upcoming"
// window shown on-site); following every single one into its own detail
// page for a better photo would mean 30+ extra headless-browser page loads
// per scrape, which is both slow (risks the function's time budget) and
// wasteful for a carousel nobody scrolls that deep into. Cap to the most
// recent handful instead.
const MAX_DETAIL_FETCHES = 12;
const DETAIL_FETCH_CONCURRENCY = 4;

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

async function fetchBetterPhoto(href: string): Promise<string | undefined> {
  try {
    const { images } = await fetchHtml(href, DETAIL_FETCH_TIMEOUT_MS);
    const candidates = toContentImages(images);
    if (candidates.length === 0) return undefined;
    return candidates.reduce((best, c) =>
      c.width * c.height > best.width * best.height ? c : best,
    ).src;
  } catch {
    return undefined;
  }
}

export async function getVicharan(): Promise<VicharanData> {
  const sourceUrl = SOURCES.vicharan;
  const fetchedAt = new Date().toISOString();

  try {
    const { html, images } = await fetchHtmlWithLinks(sourceUrl);
    const $ = cheerio.load(html);

    const contentImages = toContentImages(images);

    const parsed = contentImages
      .map((img) => {
        const { date, location } = splitDateLocation(img.caption || undefined);
        if (!date && !location) return undefined;
        return {
          date: date ?? "",
          location: location ?? cleanText(img.caption) ?? "",
          thumbnail: img.src,
          href: img.href,
        };
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    // Listing order is chronological ascending (oldest day first); take the
    // most recent slice and show newest-first, matching how the source site
    // itself highlights the latest Vicharan first.
    const recent = parsed.slice(-MAX_DETAIL_FETCHES).reverse();

    const betterPhotos = await mapWithConcurrency(recent, DETAIL_FETCH_CONCURRENCY, (entry) =>
      entry.href ? fetchBetterPhoto(entry.href) : Promise.resolve(undefined),
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
