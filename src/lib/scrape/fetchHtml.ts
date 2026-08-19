const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Fetches a page's HTML with a real-browser UA (baps.org has been known to
 * reject bare `fetch` UAs) and a hard timeout so one slow upstream page
 * never hangs a whole dashboard render.
 */
export async function fetchHtml(
  url: string,
  revalidateSeconds: number,
): Promise<string> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(12000),
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
