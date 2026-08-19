import { DashboardClient } from "@/components/DashboardClient";
import { getDashboardData } from "@/lib/data";

// Next requires these as literals it can statically analyze, so they can't
// be pulled from lib/config.ts — keep this in sync with intent there.
export const revalidate = 1800; // 30 min: how often the scrapers re-run
// Headless-browser scraping (see lib/scrape/browserFetch.ts) needs more
// than the default 10s serverless timeout — launching Chromium plus waiting
// out Cloudflare's challenge can take 15-20s.
export const maxDuration = 60;

export default async function Home() {
  const data = await getDashboardData();
  return <DashboardClient initialData={data} />;
}
