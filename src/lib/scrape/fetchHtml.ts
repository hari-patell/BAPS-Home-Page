import { getClearance, invalidateClearance } from "./clearance";

const CHALLENGE_MARKER_RE = /just a moment|cf-mitigated|challenge-platform/i;

function headersFor(cookieHeader: string, userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    // Must match the UA above; Cloudflare asks for these explicitly via its
    // critical-ch response header, and a mismatch is itself a signal.
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    Cookie: cookieHeader,
  };
}

/**
 * Fetches a page's HTML over plain HTTP, carrying the Cloudflare clearance
 * cookie earned by ./clearance.ts. No browser is involved here — see that
 * file for why reading pages through the browser was abandoned.
 *
 * If the response comes back as a challenge anyway (clearance expired, or
 * Cloudflare re-challenged), the clearance is re-earned once and the fetch
 * retried.
 */
export interface FetchHtmlOptions {
  timeoutMs?: number;
  /**
   * Seconds to cache the upstream response for, via Next's data cache.
   * Defaults to 30 min so the page stays statically rendered under ISR;
   * pass `false` to bypass the cache (the UI's refresh button does).
   */
  revalidate?: number | false;
}

export async function fetchHtml(
  url: string,
  { timeoutMs = 20000, revalidate = 1800 }: FetchHtmlOptions = {},
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { cookieHeader, userAgent } = await getClearance(url, attempt > 0);
    const res = await fetch(url, {
      headers: headersFor(cookieHeader, userAgent),
      signal: AbortSignal.timeout(timeoutMs),
      ...(revalidate === false
        ? { cache: "no-store" as const }
        : { next: { revalidate } }),
    });
    const html = await res.text();

    const challenged =
      res.status === 403 ||
      res.headers.get("cf-mitigated") === "challenge" ||
      (html.length < 60000 && CHALLENGE_MARKER_RE.test(html));

    if (!challenged) {
      if (!res.ok) throw new Error(`${url} responded ${res.status} ${res.statusText}`);
      return html;
    }

    invalidateClearance();
    if (attempt === 1) {
      throw new Error(`${url} still challenged after re-clearing (${res.status})`);
    }
  }
  throw new Error(`${url} could not be fetched`);
}

export function absoluteUrl(
  base: string,
  maybeRelative: string | undefined | null,
): string | undefined {
  if (!maybeRelative) return undefined;
  let trimmed = maybeRelative.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed || undefined;

  // baps.org emits image paths like "//Data/Sites/1/Media/...". A leading
  // "//" is normally protocol-relative, so new URL() would read "Data" as
  // the hostname and yield https://data/Sites/... — silently breaking every
  // one of those images. A real protocol-relative URL always has a dot in
  // its host, so treat a dotless first segment as a root-relative path.
  if (trimmed.startsWith("//") && !trimmed.slice(2).split("/")[0].includes(".")) {
    trimmed = trimmed.slice(1);
  }

  try {
    return new URL(trimmed, base).toString();
  } catch {
    return undefined;
  }
}

export function cleanText(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
}
