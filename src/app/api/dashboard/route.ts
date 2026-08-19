import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";

export const runtime = "nodejs";
// Headless-browser scraping (see lib/scrape/browserFetch.ts) can take
// 15-20s to get past Cloudflare's challenge, well past the default 10s.
export const maxDuration = 60;

// Client-side "refresh" button hits this for a fresh, uncached pull.
export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
