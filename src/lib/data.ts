import { unstable_cache } from "next/cache";
import { getDailySatsang } from "./scrape/dailySatsang";
import { getVicharan } from "./scrape/vicharan";
import type { DashboardData } from "./types";

const CACHE_SECONDS = 1800; // 30 min

// The routes that call this are capped at 60s. A cold start spends the
// first chunk of that launching Chromium and earning Cloudflare clearance,
// so the scrape gets a wall-clock budget of its own and the parts that have
// a graceful fallback — the Vicharan day photos — yield to it. Without this
// a cold /api/dashboard could run past the ceiling and return nothing.
const SCRAPE_BUDGET_MS = 45000;

export interface DashboardOptions {
  /** Bypass the upstream cache — used by the UI's manual refresh. */
  fresh?: boolean;
}

async function scrapeDashboard(opts: DashboardOptions): Promise<DashboardData> {
  // Sequential, not parallel. Two simultaneous navigations to the same host
  // can prompt Cloudflare to issue a fresh challenge mid-flight — that
  // showed up as one source succeeding while the other came back "still
  // challenged". Each scrape is only a few seconds, so serialising costs
  // little and removes the race.
  // Split rather than shared: Daily Satsang gets the first half of the
  // budget so it can't consume the whole thing and leave Vicharan with
  // nothing, which would lose half the dashboard rather than trimming it.
  const deadline = Date.now() + SCRAPE_BUDGET_MS;
  const satsang = await getDailySatsang({
    ...opts,
    deadline: Date.now() + SCRAPE_BUDGET_MS / 2,
  });
  const vicharan = await getVicharan({ ...opts, deadline });

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
