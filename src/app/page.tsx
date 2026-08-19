import { DashboardClient } from "@/components/DashboardClient";
import { getDashboardData } from "@/lib/data";

/**
 * Rendered on demand and cached for 30 minutes.
 *
 * Not prerendered at build time: that meant launching Chromium during
 * `next build` to solve Cloudflare's challenge, which blew Next's 60s
 * per-page budget and left orphaned Chrome processes that hung the build
 * outright. Baking a snapshot of today's darshan into build output was
 * never useful anyway.
 *
 * Caching happens inside getDashboardData via unstable_cache (Next's data
 * cache only wraps fetch(), and this scrape goes through a browser), so
 * rendering per request is cheap: one scrape every 30 minutes serves
 * everyone in between.
 */
export const dynamic = "force-dynamic";
// A cold start has to launch Chromium to earn Cloudflare clearance (see
// lib/scrape/clearance.ts), which needs more than the default 10s.
export const maxDuration = 60;

export default async function Home() {
  const data = await getDashboardData();
  return <DashboardClient initialData={data} />;
}
