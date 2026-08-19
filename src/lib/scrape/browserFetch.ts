import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { applyStealth } from "./stealth";

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
 *
 * A vanilla headless Chromium still carries fingerprints
 * (`navigator.webdriver === true`, empty plugins, a SwiftShader WebGL
 * renderer string) that bot management checks independently of whether the
 * challenge's proof-of-work gets solved — that showed up as the challenge
 * simply never resolving (`challengeDetected: true` forever, retries
 * didn't help). ./stealth.ts patches those tells.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CHALLENGE_TITLE_RE = /just a moment/i;
const MIN_CONTENT_IMAGE_SIZE = 140; // px, either dimension — separates photos from icons/logos

export interface ImageCandidate {
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  caption: string;
}

// Reused across warm invocations of the same function instance so we're not
// paying Chromium's ~1-2s launch cost on every request.
let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    args: [
      ...chromium.args,
      // Stops Chrome advertising itself as automation-controlled — the
      // companion to the navigator.webdriver patch in ./stealth.ts, since
      // that flag is visible to the page before our script runs.
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US,en",
    ],
    executablePath: await chromium.executablePath(),
    // Full headless Chrome rather than the old "shell" build: the shell is
    // missing enough browser surface (extensions, some APIs) to be an
    // easy tell on its own, which defeats the point of the patches.
    headless: true,
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

/**
 * Cloudflare's challenge can chain multiple client-side reloads while it
 * resolves, and any Puppeteer call that touches the page mid-reload (not
 * just the initial goto()) can throw a "detached Frame" error — title(),
 * content(), evaluate(), all of it. Rather than special-case each call
 * site, retry anything that hits this specific error a few times with a
 * short pause, since the frame reliably settles down within a second or
 * two once the reload chain finishes.
 */
async function retryOnDetachedFrame<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!/detached/i.test(String(err))) throw err;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  throw lastErr;
}

/** Scrolls to the bottom in steps so lazy-loaded/below-the-fold images actually load. */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 600;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight || total > 10000) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  });
  await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
}

/**
 * Reads real rendered image data straight from the DOM — naturalWidth/
 * naturalHeight and layout size, not HTML attributes, which are frequently
 * absent or unreliable (a site logo with no `width=""` attribute is
 * indistinguishable from a content photo if you only look at markup). This
 * is what actually separates a 40px icon from a 600px darshan photo. Also
 * picks up CSS `background-image` slides, a common pattern for photo
 * carousels that plain `<img>` scraping misses entirely.
 */
async function extractImageCandidates(
  page: Page,
  minSize: number,
): Promise<ImageCandidate[]> {
  return page.evaluate((minSize: number) => {
    const seen = new Set<string>();
    const results: {
      src: string;
      alt: string;
      title: string;
      width: number;
      height: number;
      caption: string;
    }[] = [];

    const textOf = (el: Element | null): string =>
      el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";

    const push = (
      src: string | null | undefined,
      alt: string | null,
      title: string | null,
      width: number,
      height: number,
      captionEl: Element | null,
    ) => {
      if (!src || seen.has(src) || width < minSize) return;
      seen.add(src);
      let caption = (alt || title || "").trim();
      if (!caption && captionEl) {
        const t = textOf(captionEl);
        if (t && t.length < 200) caption = t;
      }
      results.push({ src, alt: alt || "", title: title || "", width, height, caption });
    };

    document.querySelectorAll("img").forEach((img) => {
      const src =
        img.currentSrc ||
        img.src ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        "";
      const rect = img.getBoundingClientRect();
      // Take whichever is larger: naturalWidth is 0 for an unloaded lazy
      // image (rect/CSS size still tells us its intended display size),
      // while rect.width is 0 for a display:none carousel slide that isn't
      // the active one (naturalWidth still tells us its real photo size).
      const width = Math.max(img.naturalWidth || 0, rect.width || 0);
      const height = Math.max(img.naturalHeight || 0, rect.height || 0);
      push(src, img.getAttribute("alt"), img.getAttribute("title"), width, height, img.parentElement);
    });

    document.querySelectorAll<HTMLElement>("[style*='background-image']").forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      const match = bg.match(/url\((['"]?)(.*?)\1\)/);
      if (!match) return;
      const rect = el.getBoundingClientRect();
      push(match[2], el.getAttribute("alt"), el.getAttribute("title"), rect.width, rect.height, el);
    });

    return results;
  }, minSize);
}

export interface LinkedImageCandidate extends ImageCandidate {
  href?: string;
}

/**
 * Like extractImageCandidates, but keyed off `<a>` tags instead of bare
 * images — for gallery grids where each thumbnail links to a detail page
 * (baps.org's Vicharan listing is exactly this: a thumbnail + caption
 * wrapped in a link to that day's own page).
 */
async function extractLinkedImageCandidates(
  page: Page,
  minSize: number,
): Promise<LinkedImageCandidate[]> {
  return page.evaluate((minSize: number) => {
    const seen = new Set<string>();
    const results: {
      src: string;
      href?: string;
      alt: string;
      title: string;
      width: number;
      height: number;
      caption: string;
    }[] = [];

    const textOf = (el: Element | null): string =>
      el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";

    document.querySelectorAll("a").forEach((a) => {
      const img = a.querySelector("img");
      let src = "";
      let width = 0;
      let height = 0;
      let alt: string | null = null;
      let title: string | null = null;

      if (img) {
        src =
          img.currentSrc ||
          img.src ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          "";
        const rect = img.getBoundingClientRect();
        width = Math.max(img.naturalWidth || 0, rect.width || 0);
        height = Math.max(img.naturalHeight || 0, rect.height || 0);
        alt = img.getAttribute("alt");
        title = img.getAttribute("title");
      } else {
        const bgEl = a.matches("[style*='background-image']")
          ? a
          : a.querySelector<HTMLElement>("[style*='background-image']");
        if (!bgEl) return;
        const bg = getComputedStyle(bgEl).backgroundImage;
        const match = bg.match(/url\((['"]?)(.*?)\1\)/);
        if (!match) return;
        src = match[2];
        const rect = bgEl.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        alt = bgEl.getAttribute("alt");
        title = bgEl.getAttribute("title");
      }

      if (!src || seen.has(src) || width < minSize) return;
      seen.add(src);

      let caption = (alt || title || "").trim();
      if (!caption) {
        const t = textOf(a);
        if (t && t.length < 200) caption = t;
      }

      results.push({
        src,
        href: a.href || undefined,
        alt: alt || "",
        title: title || "",
        width,
        height,
        caption,
      });
    });

    return results;
  }, minSize);
}

interface RenderedPage {
  page: Page;
  response: Awaited<ReturnType<Page["goto"]>>;
  challengeDetected: boolean;
}

async function renderPage(url: string, timeoutMs: number): Promise<RenderedPage> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await applyStealth(page, UA);
  await page.setViewport({ width: 1440, height: 900 });

  let response: Awaited<ReturnType<Page["goto"]>> = null;
  try {
    response = await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
  } catch (err) {
    // Cloudflare's challenge can trigger its own client-side reload while
    // goto() is still waiting on *that* (interstitial) page's load
    // lifecycle, tearing down the frame context goto() was watching —
    // Puppeteer surfaces that as "Navigating frame was detached" instead of
    // just resolving with the new page. Expected here, not fatal: give the
    // page a moment to land wherever it actually navigated to.
    if (!/detached/i.test(String(err))) throw err;
    await page.waitForNetworkIdle({ timeout: timeoutMs }).catch(() => {});
  }

  // Cloudflare's automatic challenge resolves via a JS-triggered reload once
  // its proof-of-work check passes; wait for that follow-up navigation if
  // we're still looking at the interstitial.
  const challengeDetected = CHALLENGE_TITLE_RE.test(
    await retryOnDetachedFrame(() => page.title()),
  );
  if (challengeDetected) {
    const nav = await page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: timeoutMs })
      .catch(() => null);
    if (nav) response = nav;
  }

  await retryOnDetachedFrame(() => autoScroll(page));

  return { page, response, challengeDetected };
}

export interface RenderedContent {
  html: string;
  images: ImageCandidate[];
}

/** Fetches a URL with a real headless browser and returns HTML + real-dimension image candidates. */
export async function fetchRenderedPage(
  url: string,
  timeoutMs = 25000,
): Promise<RenderedContent> {
  const { page } = await renderPage(url, timeoutMs);
  try {
    const html = await retryOnDetachedFrame(() => page.content());
    const images = await retryOnDetachedFrame(() =>
      extractImageCandidates(page, MIN_CONTENT_IMAGE_SIZE),
    );
    return { html, images };
  } finally {
    await page.close();
  }
}

export interface RenderedContentWithLinks {
  html: string;
  images: LinkedImageCandidate[];
}

/** Like fetchRenderedPage, but image candidates include the detail-page link each one is wrapped in, if any. */
export async function fetchRenderedPageWithLinks(
  url: string,
  timeoutMs = 25000,
): Promise<RenderedContentWithLinks> {
  const { page } = await renderPage(url, timeoutMs);
  try {
    const html = await retryOnDetachedFrame(() => page.content());
    const images = await retryOnDetachedFrame(() =>
      extractLinkedImageCandidates(page, MIN_CONTENT_IMAGE_SIZE),
    );
    return { html, images };
  } finally {
    await page.close();
  }
}

interface ProbeResult {
  status?: number;
  finalUrl: string;
  title: string;
  challengeDetected: boolean;
  headers: Record<string, string>;
  htmlLength: number;
  htmlSnippet: string;
  imageCandidateCount: number;
  imageCandidates: ImageCandidate[];
}

/** Like fetchRenderedPage, but returns diagnostics instead — used by /api/debug. */
export async function probeRenderedPage(
  url: string,
  timeoutMs = 25000,
): Promise<ProbeResult> {
  const { page, response, challengeDetected } = await renderPage(url, timeoutMs);
  try {
    const html = await retryOnDetachedFrame(() => page.content());
    const images = await retryOnDetachedFrame(() =>
      extractImageCandidates(page, MIN_CONTENT_IMAGE_SIZE),
    );
    return {
      status: response?.status(),
      finalUrl: page.url(),
      title: await retryOnDetachedFrame(() => page.title()),
      challengeDetected,
      headers: response?.headers() ?? {},
      htmlLength: html.length,
      htmlSnippet: html.slice(0, 800),
      imageCandidateCount: images.length,
      imageCandidates: images.slice(0, 25),
    };
  } finally {
    await page.close();
  }
}
