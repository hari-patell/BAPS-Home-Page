import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import { applyStealth } from "./stealth";

/**
 * Gets past baps.org's Cloudflare bot challenge, once, and hands back the
 * credentials needed to fetch the site over plain HTTP thereafter.
 *
 * Why it's split this way: solving the challenge genuinely needs a real
 * browser (it's a JS/proof-of-work check no HTTP client can pass). But
 * *reading* pages through that browser was a persistent source of
 * "Attempted to use detached Frame" — Cloudflare and the site both replace
 * the document mid-load, and any page read racing that dies. Cloudflare's
 * output is just a `cf_clearance` cookie, so once we hold it, ordinary
 * fetch() calls carrying that cookie are served normally. The browser runs
 * once per cold start instead of once per page, which also removes most of
 * the memory pressure and latency.
 *
 * The cookie is bound to the client IP and User-Agent, so every subsequent
 * request must reuse the exact UA below.
 */

export const CLEARANCE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CHALLENGE_TITLE_RE = /just a moment/i;
// Kept well under the route's 60s ceiling: Chromium cold start plus this
// solve, both page fetches and the Vicharan detail phase all have to fit.
const CHALLENGE_TIMEOUT_MS = 20000;
// Cloudflare clearance typically lasts far longer, but re-earning it is
// cheap relative to serving stale failures, and a warm instance can live a
// while.
const CLEARANCE_TTL_MS = 20 * 60 * 1000;

export interface Clearance {
  cookieHeader: string;
  userAgent: string;
}

let cached: { value: Clearance; expiresAt: number } | null = null;
let inFlight: Promise<Clearance> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    args: [
      ...chromium.args,
      // Companion to the navigator.webdriver patch in ./stealth.ts: this
      // flag is visible to the page before our script gets to run.
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US,en",
    ],
    executablePath: await chromium.executablePath(),
    // Full headless Chrome, not the "shell" build — the shell is missing
    // enough browser surface to be its own detection signal.
    headless: true,
  });
}

function cookieHeaderFrom(
  cookies: { name: string; value: string; domain: string }[],
  hostname: string,
): string {
  return cookies
    .filter((c) => hostname.endsWith(c.domain.replace(/^\./, "")))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

async function solveChallenge(url: string): Promise<Clearance> {
  const hostname = new URL(url).hostname;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await applyStealth(page, CLEARANCE_UA);
    await page.setViewport({ width: 1440, height: 900 });

    // Every error here is swallowed deliberately: while the challenge runs,
    // the document is torn down and replaced repeatedly, so navigation
    // errors are expected noise. We never read from the page — the only
    // output we want is the cookie, which lives on the browser, not the
    // frame.
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: CHALLENGE_TIMEOUT_MS })
      .catch(() => {});

    const deadline = Date.now() + CHALLENGE_TIMEOUT_MS;
    for (;;) {
      const cookies = await browser.cookies().catch(() => []);
      const cleared = cookies.some(
        (c) => c.name === "cf_clearance" && hostname.endsWith(c.domain.replace(/^\./, "")),
      );
      const title = await page.title().catch(() => "");
      if (cleared || (title && !CHALLENGE_TITLE_RE.test(title))) {
        return {
          cookieHeader: cookieHeaderFrom(cookies, hostname),
          userAgent: CLEARANCE_UA,
        };
      }
      if (Date.now() >= deadline) {
        // Hand back whatever cookies exist rather than throwing: the caller
        // will find out soon enough if they aren't good enough, and a
        // partial jar still beats no attempt.
        return {
          cookieHeader: cookieHeaderFrom(cookies, hostname),
          userAgent: CLEARANCE_UA,
        };
      }
      await sleep(1000);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Returns cached clearance, or earns it. Concurrent callers share one
 * browser launch rather than each starting their own.
 */
export async function getClearance(url: string, forceRefresh = false): Promise<Clearance> {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!forceRefresh && inFlight) return inFlight;

  inFlight = solveChallenge(url)
    .then((value) => {
      cached = { value, expiresAt: Date.now() + CLEARANCE_TTL_MS };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function invalidateClearance(): void {
  cached = null;
}
