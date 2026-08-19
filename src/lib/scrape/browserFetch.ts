import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * baps.org sits behind Cloudflare bot management: a plain server-side
 * fetch() gets back a "Just a moment..." JS challenge page (see
 * fetchHtml.ts's git history / README) instead of real content, because
 * solving that challenge means executing real JS in a browser-trusted
 * environment. A plain HTTP client can never do that — but a real headless
 * Chromium can, the same way the challenge resolves automatically for any
 * normal visitor. This runs that Chromium inside our own Vercel function
 * (via @sparticuz/chromium + puppeteer-core, the standard combo for
 * serverless Lambda-style runtimes) instead of paying a third-party
 * unblocking API.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CHALLENGE_TITLE_RE = /just a moment/i;

// Reused across warm invocations of the same function instance so we're not
// paying Chromium's ~1-2s launch cost on every request.
let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.connected) return existing;
    browserPromise = null;
  }
  browserPromise = launchBrowser();
  return browserPromise;
}

interface ProbeResult {
  status?: number;
  finalUrl: string;
  title: string;
  challengeDetected: boolean;
  headers: Record<string, string>;
  htmlLength: number;
  htmlSnippet: string;
}

async function renderPage(url: string, timeoutMs: number) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  let response = await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });

  // Cloudflare's automatic challenge resolves via a JS-triggered reload once
  // its proof-of-work check passes; wait for that follow-up navigation if
  // we're still looking at the interstitial.
  const challengeDetected = CHALLENGE_TITLE_RE.test(await page.title());
  if (challengeDetected) {
    const nav = await page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: timeoutMs })
      .catch(() => null);
    if (nav) response = nav;
  }

  return { page, response, challengeDetected };
}

/** Fetches a URL with a real headless browser and returns the rendered HTML. */
export async function fetchRenderedHtml(
  url: string,
  timeoutMs = 25000,
): Promise<string> {
  const { page } = await renderPage(url, timeoutMs);
  try {
    return await page.content();
  } finally {
    await page.close();
  }
}

/** Like fetchRenderedHtml, but returns diagnostics instead of just the HTML — used by /api/debug. */
export async function probeRenderedHtml(
  url: string,
  timeoutMs = 25000,
): Promise<ProbeResult> {
  const { page, response, challengeDetected } = await renderPage(url, timeoutMs);
  try {
    const html = await page.content();
    return {
      status: response?.status(),
      finalUrl: page.url(),
      title: await page.title(),
      challengeDetected,
      headers: response?.headers() ?? {},
      htmlLength: html.length,
      htmlSnippet: html.slice(0, 800),
    };
  } finally {
    await page.close();
  }
}
