import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer-extra / puppeteer-extra-plugin-stealth are old-style CJS
  // packages with a deep dependency chain; Turbopack's bundling/minification
  // of them broke a reference at runtime ("i.typeOf is not a function").
  // Marking them external makes Next require() them natively at runtime
  // instead of bundling, which sidesteps that entirely.
  serverExternalPackages: ["puppeteer-extra", "puppeteer-extra-plugin-stealth"],

  // @sparticuz/chromium ships its actual Chromium binary as compressed
  // files under bin/, read at runtime via a computed path rather than a
  // static import — Next's build tracing doesn't detect that as a
  // dependency on its own, so the routes that launch a browser (see
  // src/lib/scrape/browserFetch.ts) end up missing it in the deployed
  // function unless it's included explicitly here.
  outputFileTracingIncludes: {
    "/": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/dashboard": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/debug": ["node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
