import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { absoluteUrl, cleanText } from "./fetchHtml";
import type { ImageCandidate } from "./browserFetch";

export const GUJARATI_RE = /[઀-૿]/;
export const SAMVAT_RE =
  /([A-Za-z]+\s+(?:Sud|Vad)\s+[A-Za-z઀-૿]+\s*,?\s*Samvat\s*\d{4})/i;
export const DATE_TOKEN_RE =
  /\b\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{4}\b/i;

const CHROME_HINT_RE = /\b(icon|logo|sprite|spacer|pixel|bullet|arrow|favicon)\b/i;

/**
 * Secondary filter on top of browserFetch's size threshold — catches
 * oversized logos/banners by looking at alt/title/src text instead of just
 * rendered dimensions.
 */
export function isLikelyChromeImage(candidate: {
  src: string;
  alt: string;
  title: string;
}): boolean {
  return CHROME_HINT_RE.test(`${candidate.alt} ${candidate.title} ${candidate.src}`);
}

export function toContentImages<T extends ImageCandidate>(candidates: T[]): T[] {
  return candidates.filter((c) => !isLikelyChromeImage(c));
}

/**
 * Finds the first element whose own trimmed text matches `re` and is short
 * enough to be a label/heading (not a whole paragraph). Used to locate
 * section anchors like "Prerna Parimal" or "Vachanamrut Gems" without
 * depending on exact class names, which we can't inspect from this
 * environment (baps.org is unreachable from the dev sandbox — see README).
 */
export function findHeading(
  $: CheerioAPI,
  re: RegExp,
): Cheerio<AnyNode> | undefined {
  let found: Cheerio<AnyNode> | undefined;
  $("h1,h2,h3,h4,h5,h6,strong,b,span,div,a,p").each((_, el) => {
    if (found) return;
    const node = $(el);
    const text = cleanText(node.text());
    if (text.length > 0 && text.length < 140 && re.test(text)) {
      found = node;
    }
  });
  return found;
}

/** Largest block of Gujarati-script text on the page (own text, not nested). */
export function findLargestGujaratiBlock(
  $: CheerioAPI,
): { text: string; el: Cheerio<AnyNode> } | undefined {
  let best: { text: string; el: Cheerio<AnyNode> } | undefined;
  $("p,div,span,td,li").each((_, el) => {
    const node = $(el);
    if (node.children().length > 2) return; // prefer near-leaf nodes
    const text = cleanText(node.text());
    if (text.length < 40 || !GUJARATI_RE.test(text)) return;
    if (!best || text.length > best.text.length) {
      best = { text, el: node };
    }
  });
  return best;
}

/** First <audio>/<source> element whose resolved src looks like real audio. */
export function collectAudioSources(
  $: CheerioAPI,
  baseUrl: string,
): { src: string; label?: string }[] {
  const out: { src: string; label?: string }[] = [];
  const seen = new Set<string>();

  $("audio, audio source, [data-audio], a[href$='.mp3']").each((_, el) => {
    const node = $(el);
    const raw =
      node.attr("src") || node.attr("data-audio") || node.attr("href") || "";
    if (!raw) return;
    const abs = absoluteUrl(baseUrl, raw);
    if (!abs || seen.has(abs)) return;
    if (!/\.mp3(\?|$)/i.test(abs) && !/audio/i.test(abs)) return;
    seen.add(abs);
    out.push({ src: abs, label: cleanText(node.attr("title") || node.attr("aria-label")) || undefined });
  });

  return out;
}
