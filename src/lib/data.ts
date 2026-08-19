import { getDailySatsang } from "./scrape/dailySatsang";
import { getVicharan } from "./scrape/vicharan";
import type { DashboardData } from "./types";

export async function getDashboardData(): Promise<DashboardData> {
  const [satsang, vicharan] = await Promise.all([
    getDailySatsang(),
    getVicharan(),
  ]);

  return {
    satsang,
    vicharan,
    generatedAt: new Date().toISOString(),
  };
}
