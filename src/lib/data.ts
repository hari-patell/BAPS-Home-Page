import { getDailySatsang } from "./scrape/dailySatsang";
import { getVicharan } from "./scrape/vicharan";
import type { DashboardData } from "./types";

export interface DashboardOptions {
  /** Bypass the upstream cache — used by the UI's manual refresh. */
  fresh?: boolean;
}

export async function getDashboardData(
  opts: DashboardOptions = {},
): Promise<DashboardData> {
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
