import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
