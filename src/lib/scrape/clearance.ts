import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { applyStealth } from "./stealth";

/**
 * Fetches baps.org pages through a real headless Chrome.
 *
 * Two hard-won constraints shape this file:
 *
 * 1. The request must genuinely originate from Chrome. baps.org sits behind
 *    Cloudflare bot management, and its `cf_clearance` cookie is bound to
 *    the TLS fingerprint as well as IP and User-Agent — transplanting the
 *    cookie into Node's fetch() still came back 403, so the browser has to
 *    issue the requests itself.
 *
 * 2. We must never read the page's DOM. Cloudflare and the site both tear
 *    down and replace the document mid-load, and any page.content() /
 *    evaluate() / title() racing that dies with "Attempted to use detached
 *    Frame" — retrying doesn't help once a frame is gone for good. So the
 *    HTML comes from the navigation *response* object instead, which is
 *    just a network buffer and has no frame attached.
 *
 * The browser is reused across fetches within a warm instance; the
 * challenge is solved once per host.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CHALLENGE_TITLE_RE = /just a moment/i;
const CHALLENGE_TIMEOUT_MS = 12000;
const CLEARANCE_TTL_MS = 20 * 60 * 1000;
const CHALLENGE_ATTEMPTS = 3;

let browserPromise: Promise<Browser> | null = null;
const clearedHosts = new Map<string, number>();
const clearingInFlight = new Map<string, Promise<void>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isBrowserGone(err: unknown): boolean {
  return /Connection closed|Target closed|Protocol error|Session closed|browser has disconnected/i.test(
    String(err),
  );
}

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

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    // `connected` alone isn't enough: a browser the serverless runtime
    // froze between invocations can report connected and then throw on
    // first use. version() is a cheap round-trip that proves it's alive.
    if (existing?.connected) {
      const alive = await existing.version().then(() => true).catch(() => false);
      if (alive) return existing;
      await existing.close().catch(() => {});
    }
    browserPromise = null;
  }
  browserPromise = launchBrowser();
  return browserPromise;
}

async function newPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await applyStealth(page, UA);
  await page.setViewport({ width: 1440, height: 900 });
  return page;
}

/**
 * Drives the Cloudflare challenge to completion for a host, once.
 *
 * Every error is swallowed on purpose: while the challenge runs the
 * document is replaced repeatedly, so navigation failures are expected
 * noise. Progress is judged from the browser's cookie jar, which is
 * browser-level state and immune to that churn.
 */
async function clearHost(
  browser: Browser,
  url: string,
  force: boolean,
): Promise<void> {
  const hostname = new URL(url).hostname;

  // A stale cf_clearance is worse than none. The cookie survives long after
  // Cloudflare stops honouring it, and the loop below treats *any*
  // cf_clearance as proof of success — so a re-clear triggered by a
  // challenged response would find the old cookie, return in milliseconds
  // without solving anything, and the retry would be challenged again.
  // That is exactly what "still challenged after re-clearing" was: a
  // whole scrape failing in under a second. Dropping the cookie first
  // means only a newly issued one can satisfy the check.
  if (force) {
    const stale = (await browser.cookies().catch(() => [])).filter(
      (c) => c.name === "cf_clearance",
    );
    if (stale.length > 0) await browser.deleteCookie(...stale).catch(() => {});
  }

  const page = await newPage(browser);
  try {
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
      if (cleared || (title && !CHALLENGE_TITLE_RE.test(title))) return;
      if (Date.now() >= deadline) return;
      await sleep(1000);
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function ensureCleared(
  browser: Browser,
  url: string,
  force = false,
): Promise<void> {
  const hostname = new URL(url).hostname;
  if (!force) {
    const until = clearedHosts.get(hostname);
    if (until && until > Date.now()) return;

    // Concurrent callers share one solve rather than each starting their own.
    const existing = clearingInFlight.get(hostname);
    if (existing) return existing;
  }

  const task = clearHost(browser, url, force)
    .then(() => {
      clearedHosts.set(hostname, Date.now() + CLEARANCE_TTL_MS);
    })
    .finally(() => {
      clearingInFlight.delete(hostname);
    });
  clearingInFlight.set(hostname, task);
  return task;
}

export function invalidateClearance(url?: string): void {
  if (url) clearedHosts.delete(new URL(url).hostname);
  else clearedHosts.clear();
}

async function navigateForHtml(
  browser: Browser,
  url: string,
  timeoutMs: number,
): Promise<string> {
  const page = await newPage(browser);
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    if (!response) throw new Error(`${url} produced no response`);
    // Read from the network response, never the DOM — see the file header.
    return await response.text();
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Fetches a URL's HTML through the browser, solving the Cloudflare
 * challenge first if this host hasn't been cleared recently.
 */
export async function fetchHtmlViaBrowser(
  url: string,
  timeoutMs = 20000,
): Promise<string> {
  // Three genuine solve attempts could otherwise run past a minute on their
  // own, and the caller only has 60s for the whole dashboard. Retries stop
  // at this deadline even if attempts remain.
  const deadline = Date.now() + timeoutMs * 2;

  for (let attempt = 0; attempt < CHALLENGE_ATTEMPTS; attempt++) {
    const last = attempt === CHALLENGE_ATTEMPTS - 1 || Date.now() > deadline;
    try {
      const browser = await getBrowser();
      // Clearance covers a host, but Cloudflare still challenges individual
      // URLs on it — a cleared session would load Daily-Satsang.aspx and
      // then be challenged on vicharan.aspx. Every attempt after the first
      // therefore forces a genuine re-solve rather than trusting the cookie.
      await ensureCleared(browser, url, attempt > 0);
      const html = await navigateForHtml(browser, url, timeoutMs);

      if (CHALLENGE_TITLE_RE.test(html) && html.length < 60000) {
        invalidateClearance(url);
        if (last) {
          throw new Error(`${url} still challenged after ${attempt} re-clears`);
        }
        continue;
      }
      return html;
    } catch (err) {
      // A browser that died between invocations is worth a clean retry;
      // anything else on the final attempt is a real failure.
      if (isBrowserGone(err)) {
        const dead = await browserPromise?.catch(() => null);
        await dead?.close().catch(() => {});
        browserPromise = null;
        invalidateClearance();
      }
      if (last) throw err;
    }
  }
  throw new Error(`${url} could not be fetched`);
}
