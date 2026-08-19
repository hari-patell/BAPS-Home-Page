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
  const start = Date.now();
  const deadline = start + SCRAPE_BUDGET_MS;
  // Daily Satsang is the content-heavy source (darshan, prerna, vachanamrut,
  // audio) and the one most likely to be starved on a cold start. Vicharan now
  // costs only a listing fetch plus a single day-page navigation — nothing like
  // the old six-day detail phase — so Satsang gets the larger share of the
  // budget, with Vicharan taking whatever remains up to the wall-clock ceiling.
  const satsang = await getDailySatsang({
    ...opts,
    deadline: start + Math.round(SCRAPE_BUDGET_MS * 0.62),
  });
  const vicharan = await getVicharan({ ...opts, deadline });

  return {
    satsang,
    vicharan,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Carries a scrape result out through a thrown rejection so it can be
 * returned to the caller without being written to the cache — unstable_cache
 * never caches a rejected promise.
 */
class IncompleteScrape extends Error {
  constructor(readonly data: DashboardData) {
    super("incomplete scrape");
  }
}

/**
 * Caching lives here rather than on the fetches themselves: the scrape runs
 * through a headless browser (see scrape/clearance.ts), and Next's data
 * cache only wraps fetch(). unstable_cache wraps arbitrary async work, so
 * one good scrape every 30 minutes serves every request in between.
 *
 * A run that failed to get Daily Satsang — the content-heavy source — is
 * deliberately kept out of the cache by throwing: otherwise a single bad
 * cold run (challenged on a fresh serverless start) would pin the dashboard
 * empty for the full 30-minute window, which is exactly the "everything's
 * gone" state a transient challenge used to cause. Throwing means the next
 * request re-scrapes instead of serving the poisoned result.
 */
const cachedScrape = unstable_cache(
  async () => {
    const data = await scrapeDashboard({});
    if (!data.satsang.ok) throw new IncompleteScrape(data);
    return data;
  },
  ["dashboard"],
  { revalidate: CACHE_SECONDS, tags: ["dashboard"] },
);

export async function getDashboardData(
  opts: DashboardOptions = {},
): Promise<DashboardData> {
  if (opts.fresh) return scrapeDashboard(opts);

  try {
    return await cachedScrape();
  } catch (err) {
    // The cached run was incomplete and therefore not cached. Return the
    // freshest data it did produce rather than nothing — a Vicharan panel
    // with a failed Satsang beats a blank page — and let the next request
    // try again.
    if (err instanceof IncompleteScrape) return err.data;
    throw err;
  }
}
