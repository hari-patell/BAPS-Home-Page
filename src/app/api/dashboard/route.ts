import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";

export const runtime = "nodejs";
// A cold start has to launch Chromium to earn Cloudflare clearance (see
// lib/scrape/clearance.ts), which is well past the default 10s.
export const maxDuration = 60;

// Client-side "refresh" button hits this for a fresh, uncached pull.
export async function GET() {
  const data = await getDashboardData({ fresh: true });
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
