export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * baps.org sits behind Cloudflare's bot-management challenge ("Just a
 * moment..."), which a plain server-side fetch can never solve — it needs
 * JS execution and a browser-trusted TLS/IP fingerprint, neither of which a
 * Vercel serverless function has. When SCRAPER_API_KEY is set, requests are
 * routed through ScraperAPI (https://scraperapi.com), which renders the page
 * in a real browser and returns the resulting HTML. Without a key, falls
 * back to a direct fetch — fine for sources with no bot protection, but
 * baps.org will 403 until a key is configured (see README).
 */
export function buildFetchTarget(url: string): { target: string; headers?: Record<string, string> } {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) return { target: url, headers: BROWSER_HEADERS };

  const proxied = new URL("https://api.scraperapi.com/");
  proxied.searchParams.set("api_key", apiKey);
  proxied.searchParams.set("url", url);
  proxied.searchParams.set("render", "true");
  return { target: proxied.toString() };
}

/**
 * Fetches a page's HTML (via ScraperAPI when configured, see above) with a
 * hard timeout so one slow upstream page never hangs a whole dashboard
 * render.
 */
export async function fetchHtml(
  url: string,
  revalidateSeconds: number,
): Promise<string> {
  const { target, headers } = buildFetchTarget(url);
  const res = await fetch(target, {
    headers,
    signal: AbortSignal.timeout(25000),
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  }
  return res.text();
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
  return text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
}
