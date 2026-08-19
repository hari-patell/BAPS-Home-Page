import type { NextConfig } from "next";

// The routes that may launch Chromium to earn Cloudflare clearance
// (see src/lib/scrape/clearance.ts).
const BROWSER_ROUTES = ["/", "/api/dashboard", "/api/debug"];

// @sparticuz/chromium ships its actual Chromium binary as compressed files
// under bin/, read at runtime via a computed path rather than a static
// import — Next's build tracing doesn't detect that as a dependency on its
// own and drops it from the deployed function unless included explicitly.
const CHROMIUM_BIN = "node_modules/@sparticuz/chromium/bin/**/*";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: Object.fromEntries(
    BROWSER_ROUTES.map((route) => [route, [CHROMIUM_BIN]]),
  ),
};

export default nextConfig;
