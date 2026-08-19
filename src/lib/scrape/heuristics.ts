import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { absoluteUrl, cleanText } from "./fetchHtml";

export const GUJARATI_RE = /[઀-૿]/;
export const SAMVAT_RE =
  /([A-Za-z]+\s+(?:Sud|Vad)\s+[A-Za-z઀-૿]+\s*,?\s*Samvat\s*\d{4})/i;
export const DATE_TOKEN_RE =
  /\b\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{4}\b/i;

const MIN_IMAGE_HINT = /\b(icon|logo|sprite|spacer|pixel|bullet|arrow)\b/i;

/** True for <img> src values that are almost certainly chrome, not content. */
export function looksLikeChrome(src: string): boolean {
  return MIN_IMAGE_HINT.test(src);
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

export interface ScrapedImage {
  src: string;
  caption?: string;
  date?: string;
}

/** Collects candidate content images with a nearby caption, deduped by src. */
export function collectImages(
  $: CheerioAPI,
  baseUrl: string,
  opts: { minWidth?: number } = {},
): ScrapedImage[] {
  const seen = new Set<string>();
  const out: ScrapedImage[] = [];

  $("img").each((_, el) => {
    const node = $(el);
    const rawSrc =
      node.attr("data-src") ||
      node.attr("data-lazy-src") ||
      node.attr("src") ||
      "";
    if (!rawSrc || looksLikeChrome(rawSrc)) return;

    const width = Number(node.attr("width") || 0);
    if (opts.minWidth && width && width < opts.minWidth) return;

    const abs = absoluteUrl(baseUrl, rawSrc);
    if (!abs || seen.has(abs)) return;

    // Caption heuristics, in priority order: alt/title attrs, then nearby
    // text in a parent container, then a following sibling caption node.
    const alt = cleanText(node.attr("alt"));
    const title = cleanText(node.attr("title"));
    let caption = alt || title;

    if (!caption) {
      const parentText = cleanText(node.parent().text());
      if (parentText && parentText.length < 200) caption = parentText;
    }
    if (!caption) {
      const sibText = cleanText(node.next().text());
      if (sibText && sibText.length < 200) caption = sibText;
    }

    const dateMatch = (caption || "").match(DATE_TOKEN_RE);
    seen.add(abs);
    out.push({
      src: abs,
      caption: caption || undefined,
      date: dateMatch?.[0],
    });
  });

  return out;
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
