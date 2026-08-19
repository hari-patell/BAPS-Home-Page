import * as cheerio from "cheerio";
import { SOURCES } from "@/lib/config";
import type { DailySatsangData, TextBlock } from "@/lib/types";
import { cleanText, fetchHtml } from "./fetchHtml";
import {
  type ImageCandidate,
  SAMVAT_RE,
  collectAudioSources,
  collectImages,
  findHeading,
  findLargestGujaratiBlock,
  toContentImages,
} from "./heuristics";

const VACHANAMRUT_TITLE_RE = /vachan[aā]mrut/i;

// Daily Satsang lays its two darshan photos out as:
//   "Murti Darshan <caption> Swamishri's Darshan <caption> પ્રેરણા પરિમલ"
// Pulling both captions in one pass off the page text is far steadier than
// hunting for them relative to each <img>, since the photos carry no alt
// text and their nearest text node is a layout spacer.
const DARSHAN_CAPTIONS_RE =
  /Murti\s+Darshan\s+(.{3,160}?)\s+Swamishri'?s\s+Darshan\s+(.{3,160}?)(?=\s*(?:પ્રેરણા|Prerna|Vachanamrut\s+Gems))/i;

// Swamishri's photo is the one whose filename ends in an S before the
// extension (e.g. 260818S.jpg); the Murti photo is the other daily one
// (e.g. 260818-nashville.jpg).
const SWAMISHRI_FILE_RE = /\d+S\.(?:jpe?g|png|webp)$/i;
const DAILY_SATSANG_MEDIA_RE = /\/dailysatsang\//i;

/**
 * Removes <script>/<style> before any text extraction. Without this, the
 * page's large inline jPlayer/datepicker scripts dominate every
 * "longest text block" heuristic — Prerna Parimal was resolving to a slab
 * of CSS.
 */
function stripNonContent($: cheerio.CheerioAPI): void {
  $("script, style, noscript").remove();
}

function extractPrernaParimal($: cheerio.CheerioAPI): TextBlock | undefined {
  const block = findLargestGujaratiBlock($);
  if (!block) return undefined;

  // Try to find a short bold "title" line right before the paragraph.
  const prev = block.el.prevAll("strong,b,h1,h2,h3,h4,h5").first();
  const title = cleanText(prev.text()) || undefined;

  const heading = findHeading($, /prerna|પ્રેરણા/i);
  return {
    heading: heading ? cleanText(heading.text()) : "Prerna Parimal",
    title,
    body: block.text,
  };
}

function extractVachanamrutGems($: cheerio.CheerioAPI): TextBlock | undefined {
  const heading = findHeading($, /vachanamrut gems?/i);
  const container = heading?.closest("div,section,article,td");
  if (!container || container.length === 0) return undefined;

  const titleEl = container
    .find("h1,h2,h3,h4,h5,strong,b,a")
    .filter((_, el) => VACHANAMRUT_TITLE_RE.test($(el).text()))
    .first();
  const title = cleanText(titleEl.text()) || undefined;

  // Longest paragraph inside the container is treated as the quote body.
  let body = "";
  container.find("p,div,span").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > body.length && text.length > 40) body = text;
  });
  if (!body) body = cleanText(container.text()).slice(0, 600);

  const citationMatch = cleanText(container.text()).match(
    /\[?\s*(Gadhad[aā]|Sarangpur|Kariyani|Loya|Panchala|Vartal|Amdavad|Ashlali|Jetalpur)[^[\]]{0,60}[-–]?\s*\d+(\.\d+)?\s*\]?/i,
  );

  return {
    heading: cleanText(heading!.text()) || "Vachanamrut Gems",
    title,
    body,
    citation: citationMatch?.[0]?.replace(/[[\]]/g, "").trim(),
  };
}

function bucketDarshanImages(
  images: ImageCandidate[],
  bodyText: string,
): DailySatsangData["darshan"] {
  const captions = bodyText.match(DARSHAN_CAPTIONS_RE);
  const murtiCaption = captions ? cleanText(captions[1]) : undefined;
  const swamishriCaption = captions ? cleanText(captions[2]) : undefined;

  const daily = toContentImages(images).filter((img) =>
    DAILY_SATSANG_MEDIA_RE.test(img.src),
  );
  // Fall back to every content image if the day's photos aren't under the
  // usual path, rather than showing nothing.
  const pool = daily.length > 0 ? daily : toContentImages(images);

  const murti: DailySatsangData["darshan"]["murti"] = [];
  const swamishri: DailySatsangData["darshan"]["swamishri"] = [];

  for (const img of pool) {
    if (SWAMISHRI_FILE_RE.test(img.src)) {
      swamishri.push({ src: img.src, caption: swamishriCaption || img.caption || undefined });
    } else {
      murti.push({ src: img.src, caption: murtiCaption || img.caption || undefined });
    }
  }

  return { murti, swamishri };
}

/**
 * Labels the day's audio in the order baps.org lays the players out:
 * Vachanamrut, then Swamini Vato, then Katha.
 */
const AUDIO_TITLES = ["Vachanamrut", "Swamini Vato", "Katha"];

export async function getDailySatsang(
  { fresh = false }: { fresh?: boolean } = {},
): Promise<DailySatsangData> {
  const sourceUrl = SOURCES.dailySatsang;
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchHtml(sourceUrl, { revalidate: fresh ? false : 1800 });
    const $ = cheerio.load(html);
    const images = collectImages($, sourceUrl);

    // Audio URLs live inside inline <script> jPlayer calls, so read those
    // out before stripping scripts for the text heuristics.
    const audio = collectAudioSources($, sourceUrl).map((a, i) => ({
      title: a.label || AUDIO_TITLES[i] || `Track ${i + 1}`,
      src: a.src,
    }));

    stripNonContent($);
    const bodyText = cleanText($("body").text());

    return {
      hinduDate: bodyText.match(SAMVAT_RE)?.[1],
      prernaParimal: extractPrernaParimal($),
      vachanamrutGems: extractVachanamrutGems($),
      audio,
      darshan: bucketDarshanImages(images, bodyText),
      sourceUrl,
      fetchedAt,
      ok: true,
    };
  } catch (err) {
    return {
      audio: [],
      darshan: { murti: [], swamishri: [] },
      sourceUrl,
      fetchedAt,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
