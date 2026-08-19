import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";

export const runtime = "nodejs";

// Client-side "refresh" button hits this for a fresh pull; ISR on the
// underlying fetch() calls still governs how often baps.org is actually
// re-requested (see REVALIDATE_SECONDS in lib/config.ts).
export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
