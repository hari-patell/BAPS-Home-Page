import { DashboardClient } from "@/components/DashboardClient";
import { getDashboardData } from "@/lib/data";

/**
 * Rendered per request rather than prerendered at build time.
 *
 * Build-time prerendering meant launching Chromium during `next build` to
 * solve Cloudflare's challenge. That was slow enough to blow Next's 60s
 * per-page budget, and worse, the killed attempt left orphaned Chrome
 * processes that kept the whole build hanging. There's also no value in
 * baking a snapshot of "today's" darshan into the build output.
 *
 * Caching hasn't been given up, just moved: the upstream fetches carry
 * `next: { revalidate }` (see lib/scrape/fetchHtml.ts), so the scrape runs
 * at most every 30 minutes and ordinary requests are served from the data
 * cache. `fetchCache` is set explicitly because `force-dynamic` would
 * otherwise opt those fetches out of caching entirely.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "default-cache";
// A cold start has to launch Chromium to earn Cloudflare clearance (see
// lib/scrape/clearance.ts), which needs more than the default 10s.
export const maxDuration = 60;

export default async function Home() {
  const data = await getDashboardData();
  return <DashboardClient initialData={data} />;
}
