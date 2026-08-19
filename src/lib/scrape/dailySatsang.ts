import * as cheerio from "cheerio";
import { REVALIDATE_SECONDS, SOURCES } from "@/lib/config";
import type { DailySatsangData, TextBlock } from "@/lib/types";
import { cleanText } from "./fetchHtml";
import { fetchHtml } from "./fetchHtml";
import {
  SAMVAT_RE,
  collectAudioSources,
  collectImages,
  findHeading,
  findLargestGujaratiBlock,
} from "./heuristics";

const VACHANAMRUT_TITLE_RE = /vachan[aā]mrut/i;
const MURTI_RE = /murti/i;
const SWAMISHRI_RE = /swamishri|swāmīshrī/i;

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

function extractVachanamrutGems(
  $: cheerio.CheerioAPI,
): TextBlock | undefined {
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
  $: cheerio.CheerioAPI,
  baseUrl: string,
): DailySatsangData["darshan"] {
  const all = collectImages($, baseUrl, { minWidth: 120 });

  const murti: DailySatsangData["darshan"]["murti"] = [];
  const swamishri: DailySatsangData["darshan"]["swamishri"] = [];
  const unclassified: DailySatsangData["darshan"]["murti"] = [];

  for (const img of all) {
    const haystack = `${img.caption ?? ""} ${img.src}`;
    if (MURTI_RE.test(haystack)) murti.push(img);
    else if (SWAMISHRI_RE.test(haystack)) swamishri.push(img);
    else unclassified.push(img);
  }

  // If we couldn't tell Murti/Swamishri apart, put everything under
  // Swamishri (the more common daily-darshan subject) rather than drop it.
  if (murti.length === 0 && swamishri.length === 0) {
    swamishri.push(...unclassified);
  }

  return { murti, swamishri };
}

export async function getDailySatsang(): Promise<DailySatsangData> {
  const sourceUrl = SOURCES.dailySatsang;
  const fetchedAt = new Date().toISOString();

  try {
    const html = await fetchHtml(sourceUrl, REVALIDATE_SECONDS.dailySatsang);
    const $ = cheerio.load(html);
    const bodyText = cleanText($("body").text());

    const hinduDate = bodyText.match(SAMVAT_RE)?.[1];
    const audio = collectAudioSources($, sourceUrl).map((a, i) => ({
      title: a.label || (i === 0 ? "Vachanamrut" : "Swamini Vato"),
      src: a.src,
    }));

    return {
      hinduDate,
      prernaParimal: extractPrernaParimal($),
      vachanamrutGems: extractVachanamrutGems($),
      audio,
      darshan: bucketDarshanImages($, sourceUrl),
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
