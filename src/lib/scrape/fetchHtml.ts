import { fetchRenderedPage, type RenderedContent } from "./browserFetch";

/**
 * Fetches a page's rendered HTML and real-dimension image candidates via a
 * headless browser (see browserFetch.ts for why a plain fetch() can't get
 * past baps.org's Cloudflare challenge, and why images come from the live
 * DOM rather than static HTML attributes). Caching is handled at the page
 * level via `export const revalidate` in page.tsx, not here — a browser
 * navigation isn't a cacheable fetch() call the way Next's data cache
 * expects.
 */
export async function fetchHtml(url: string): Promise<RenderedContent> {
  return fetchRenderedPage(url);
}

export function absoluteUrl(
  base: string,
  maybeRelative: string | undefined | null,
): string | undefined {
  if (!maybeRelative) return undefined;
  const trimmed = maybeRelative.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed || undefined;
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
