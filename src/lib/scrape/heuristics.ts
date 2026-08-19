import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { absoluteUrl, cleanText } from "./fetchHtml";
import type { ImageCandidate } from "./browserFetch";

export const GUJARATI_RE = /[઀-૿]/;
export const SAMVAT_RE =
  /([A-Za-z]+\s+(?:Sud|Vad)\s+[A-Za-z઀-૿]+\s*,?\s*Samvat\s*\d{4})/i;
export const DATE_TOKEN_RE =
  /\b\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{4}\b/i;

/**
 * Date embedded in a baps.org media filename. Both shapes occur in the
 * wild: `.../20260817_i.jpg` and `.../2026_08_07_095_Sarangpur.jpg`.
 *
 * Note the trailing `(?!\d)` rather than `\b` — these filenames continue
 * into `_i`, and `_` is a word character, so a word boundary never matches
 * there.
 */
export const FILENAME_DATE_RE = /(?:^|\D)(20\d{2})[_-]?(\d{2})[_-]?(\d{2})(?!\d)/;

// No trailing \b: real filenames are things like "bulletL.png" and
// "next1.png", which a trailing word boundary would fail to match.
const CHROME_HINT_RE = /(icon|logo|sprite|spacer|pixel|bullet|arrow|favicon|separator)/i;

// baps.org serves editorial media out of /Data/Sites/N/Media/ and site
// furniture out of /images/ — a far more reliable split than alt text,
// which is empty on the real photos and misleading on the spacers.
const CONTENT_MEDIA_RE = /\/Media\//i;
const SITE_CHROME_PATH_RE = /\/images\//i;

/**
 * Secondary filter on top of browserFetch's size threshold. Path is the
 * primary signal; alt/title/filename keywords only decide images that
 * aren't clearly under a media path.
 */
export function isLikelyChromeImage(candidate: {
  src: string;
  alt: string;
  title: string;
}): boolean {
  if (CONTENT_MEDIA_RE.test(candidate.src)) return false;
  if (SITE_CHROME_PATH_RE.test(candidate.src)) return true;
  return CHROME_HINT_RE.test(`${candidate.alt} ${candidate.title} ${candidate.src}`);
}

export function toContentImages<T extends ImageCandidate>(candidates: T[]): T[] {
  return candidates.filter((c) => !isLikelyChromeImage(c));
}

/** Pulls a `D-Mon-YYYY` date out of a media filename's YYYYMMDD stamp. */
export function dateFromFilename(src: string): string | undefined {
  const m = src.match(FILENAME_DATE_RE);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const monthName = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][month - 1];
  return `${Number(d)}-${monthName}-${y}`;
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

/**
 * Collects the day's audio tracks.
 *
 * baps.org drives its players with jPlayer, so the real URLs only exist
 * inside inline `setMedia({mp3: "..."})` calls rather than on any <audio>
 * element. Each track also appears a second time as a
 * `download.php?file=<same path>` wrapper, which is the same audio — those
 * get folded into the canonical direct URL rather than listed twice.
 */
export function collectAudioSources(
  $: CheerioAPI,
  baseUrl: string,
): { src: string; label?: string }[] {
  const out: { src: string; label?: string }[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined, label?: string) => {
    if (!raw) return;
    const abs = absoluteUrl(baseUrl, raw);
    if (!abs || !/\.mp3(\?|$)/i.test(abs)) return;
    // Dedupe on the underlying file path so the direct URL and its
    // download.php?file= twin collapse to one entry.
    const key = decodeURIComponent(abs)
      .replace(/.*?[?&]file=/, "")
      .replace(/^https?:\/\/[^/]+\//, "")
      .toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ src: abs, label });
  };

  $("audio[src], audio source[src], [data-audio]").each((_, el) => {
    const node = $(el);
    add(
      node.attr("src") || node.attr("data-audio"),
      cleanText(node.attr("title") || node.attr("aria-label")) || undefined,
    );
  });

  // jPlayer: setMedia({mp3: "https://download.baps.org/.../file.mp3"})
  $("script").each((_, el) => {
    const js = $(el).text();
    if (!js.includes("mp3")) return;
    for (const m of js.matchAll(/mp3\s*:\s*["']([^"']+\.mp3[^"']*)["']/gi)) {
      add(m[1]);
    }
  });

  return out;
}
