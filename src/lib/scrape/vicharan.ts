import * as cheerio from "cheerio";
import { SOURCES } from "@/lib/config";
import type { VicharanData, VicharanEntry } from "@/lib/types";
import { absoluteUrl, cleanText, fetchHtml } from "./fetchHtml";
import { DATE_TOKEN_RE, collectImages, findHeading } from "./heuristics";

const LOCATION_SPLIT_RE = /[—–-]\s*/;

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

export async function getVicharan(): Promise<VicharanData> {
  const sourceUrl = SOURCES.vicharan;
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchHtml(sourceUrl);
    const $ = cheerio.load(html);

    const images = collectImages($, sourceUrl, { minWidth: 100 });

    const entries: VicharanEntry[] = images
      .map((img): VicharanEntry | undefined => {
        const { date, location } = splitDateLocation(img.caption);
        if (!date && !location) return undefined;
        return {
          date: date ?? "",
          location: location ?? cleanText(img.caption) ?? "",
          image: img.src,
        };
      })
      .filter((e): e is VicharanEntry => Boolean(e));

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
