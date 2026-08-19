import { fetchHtmlViaBrowser } from "./clearance";

export interface FetchHtmlOptions {
  timeoutMs?: number;
  /**
   * Kept for call-site clarity, but no longer meaningful: fetches go
   * through the browser (see ./clearance.ts), which Next's data cache
   * can't wrap. Caching happens at the page level instead.
   */
  revalidate?: number | false;
}

/**
 * Fetches a page's HTML from baps.org.
 *
 * Requests are issued by a real headless Chrome rather than fetch(),
 * because Cloudflare binds its clearance to the TLS fingerprint — see
 * ./clearance.ts for the full reasoning.
 */
export async function fetchHtml(
  url: string,
  { timeoutMs = 20000 }: FetchHtmlOptions = {},
): Promise<string> {
  return fetchHtmlViaBrowser(url, timeoutMs);
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
