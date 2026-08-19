import { unstable_cache } from "next/cache";
import { getDailySatsang } from "./scrape/dailySatsang";
import { getVicharan } from "./scrape/vicharan";
import type { DashboardData } from "./types";

const CACHE_SECONDS = 1800; // 30 min

export interface DashboardOptions {
  /** Bypass the upstream cache — used by the UI's manual refresh. */
  fresh?: boolean;
}

async function scrapeDashboard(opts: DashboardOptions): Promise<DashboardData> {
  const [satsang, vicharan] = await Promise.all([
    getDailySatsang(opts),
    getVicharan(opts),
  ]);

  return {
    satsang,
    vicharan,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Caching lives here rather than on the fetches themselves: the scrape runs
 * through a headless browser (see scrape/clearance.ts), and Next's data
 * cache only wraps fetch(). unstable_cache wraps arbitrary async work, so
 * one scrape every 30 minutes serves every request in between.
 *
 * A failed scrape is deliberately not cached — otherwise a single bad run
 * would pin empty states in place for the full window.
 */
const cachedScrape = unstable_cache(
  () => scrapeDashboard({}),
  ["dashboard"],
  { revalidate: CACHE_SECONDS, tags: ["dashboard"] },
);

export async function getDashboardData(
  opts: DashboardOptions = {},
): Promise<DashboardData> {
  if (opts.fresh) return scrapeDashboard(opts);

  const data = await cachedScrape();
  if (data.satsang.ok || data.vicharan.ok) return data;

  // Both sources failed in the cached run — retry live rather than serving
  // a cached failure for the rest of the window.
  return scrapeDashboard(opts);
}
