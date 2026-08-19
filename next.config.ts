import type { NextConfig } from "next";

// The routes that launch a headless browser (see src/lib/scrape/browserFetch.ts).
const BROWSER_ROUTES = ["/", "/api/dashboard", "/api/debug"];

// @sparticuz/chromium ships its actual Chromium binary as compressed files
// under bin/, read at runtime via a computed path rather than a static
// import — Next's build tracing doesn't detect that as a dependency on its
// own and drops it from the deployed function unless included explicitly.
//
// puppeteer-extra-plugin-stealth's dependency chain is old-style CJS
// (merge-deep -> clone-deep -> is-plain-object -> isobject, etc.) and
// Next's tracer doesn't reliably follow all of it either — verified by
// walking every package.json in the chain by hand rather than guessing:
// puppeteer-extra-plugin-stealth -> puppeteer-extra-plugin -> merge-deep
// -> {clone-deep, kind-of, arr-union}; clone-deep -> {for-own,
// is-plain-object, kind-of, lazy-cache, shallow-clone}; is-plain-object ->
// isobject; kind-of -> is-buffer; for-own -> for-in; shallow-clone ->
// {is-extendable, kind-of, lazy-cache, mixin-object}; mixin-object ->
// {for-in, is-extendable}.
const TRACING_INCLUDES = [
  "node_modules/@sparticuz/chromium/bin/**/*",
  "node_modules/puppeteer-extra/**/*",
  "node_modules/puppeteer-extra-plugin/**/*",
  "node_modules/puppeteer-extra-plugin-stealth/**/*",
  "node_modules/merge-deep/**/*",
  "node_modules/clone-deep/**/*",
  "node_modules/kind-of/**/*",
  "node_modules/arr-union/**/*",
  "node_modules/for-own/**/*",
  "node_modules/for-in/**/*",
  "node_modules/is-plain-object/**/*",
  "node_modules/isobject/**/*",
  "node_modules/is-buffer/**/*",
  "node_modules/lazy-cache/**/*",
  "node_modules/shallow-clone/**/*",
  "node_modules/is-extendable/**/*",
  "node_modules/mixin-object/**/*",
  "node_modules/debug/**/*",
];

const nextConfig: NextConfig = {
  // puppeteer-extra / puppeteer-extra-plugin-stealth are old-style CJS
  // packages; Turbopack's bundling/minification of them broke a reference
  // at runtime ("i.typeOf is not a function"). Marking them external makes
  // Next require() them natively at runtime instead of bundling, which
  // sidesteps that entirely.
  serverExternalPackages: ["puppeteer-extra", "puppeteer-extra-plugin-stealth"],

  outputFileTracingIncludes: Object.fromEntries(
    BROWSER_ROUTES.map((route) => [route, TRACING_INCLUDES]),
  ),
};

export default nextConfig;
