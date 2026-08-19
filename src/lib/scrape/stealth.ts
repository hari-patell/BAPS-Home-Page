import type { Page } from "puppeteer-core";

/**
 * Self-contained headless-detection patches.
 *
 * These are the evasions that matter for getting past Cloudflare's bot
 * check, reimplemented directly rather than pulled in via
 * puppeteer-extra-plugin-stealth. That package works, but its dependency
 * chain is a decade-old CJS tree (merge-deep -> clone-deep ->
 * is-plain-object -> ...) that Next's build tracer refuses to follow into
 * a serverless bundle: every deploy surfaced a *different* missing
 * transitive module, and hand-listing them in next.config.ts turned into
 * whack-a-mole. All the plugin ultimately does is inject JS before page
 * load, which is ~40 lines — so we do exactly that, with zero
 * dependencies and nothing for the bundler to lose.
 *
 * What a vanilla headless Chromium gives away, and what each patch fixes:
 *  - navigator.webdriver === true (the single most-checked signal)
 *  - an empty navigator.plugins / navigator.mimeTypes
 *  - no window.chrome object
 *  - Notification permission state disagreeing with navigator.permissions
 *  - WebGL reporting "Google SwiftShader" instead of a real GPU
 */
export async function applyStealth(page: Page, userAgent: string): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    // navigator.webdriver — delete the property off the prototype rather
    // than assigning false, since the mere presence of an own property is
    // itself detectable.
    Object.defineProperty(Navigator.prototype, "webdriver", {
      get: () => undefined,
      configurable: true,
    });
    // @ts-expect-error - deleting an optional prototype prop
    delete Navigator.prototype.webdriver;

    // window.chrome — present in real Chrome, absent in headless.
    const w = window as unknown as { chrome?: Record<string, unknown> };
    if (!w.chrome) {
      w.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: { isInstalled: false },
      };
    }

    // navigator.plugins / mimeTypes — empty in headless, never empty in a
    // real desktop Chrome. Length is what's usually checked.
    const fakePlugin = (name: string, filename: string, desc: string) => ({
      name,
      filename,
      description: desc,
      length: 1,
    });
    const plugins = [
      fakePlugin("PDF Viewer", "internal-pdf-viewer", "Portable Document Format"),
      fakePlugin("Chrome PDF Viewer", "internal-pdf-viewer", "Portable Document Format"),
      fakePlugin("Chromium PDF Viewer", "internal-pdf-viewer", "Portable Document Format"),
    ];
    Object.defineProperty(Navigator.prototype, "plugins", {
      get: () => plugins,
      configurable: true,
    });
    Object.defineProperty(Navigator.prototype, "mimeTypes", {
      get: () => [{ type: "application/pdf", suffixes: "pdf", description: "" }],
      configurable: true,
    });

    Object.defineProperty(Navigator.prototype, "languages", {
      get: () => ["en-US", "en"],
      configurable: true,
    });

    // Headless reports "denied" for Notification while Notification.permission
    // says "default" — a classic mismatch fingerprint.
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = ((parameters: PermissionDescriptor) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery.call(window.navigator.permissions, parameters)) as typeof originalQuery;
    }

    // WebGL vendor/renderer — headless reports Google SwiftShader (software
    // rendering), which no real desktop GPU ever does.
    const patchGetParameter = (proto: { getParameter: (p: number) => unknown }) => {
      const original = proto.getParameter;
      proto.getParameter = function (parameter: number) {
        if (parameter === 37445) return "Intel Inc."; // UNMASKED_VENDOR_WEBGL
        if (parameter === 37446) return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER_WEBGL
        return original.call(this, parameter);
      };
    };
    if (typeof WebGLRenderingContext !== "undefined") {
      patchGetParameter(WebGLRenderingContext.prototype as never);
    }
    if (typeof WebGL2RenderingContext !== "undefined") {
      patchGetParameter(WebGL2RenderingContext.prototype as never);
    }
  });

  await page.setUserAgent(userAgent);

  // Client-hint headers must agree with the UA string above — Cloudflare
  // explicitly asks for these (see the `critical-ch` response header) and a
  // mismatch is its own tell.
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  });
}
