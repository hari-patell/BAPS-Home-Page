import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/config";
import { getDashboardData } from "@/lib/data";

export const runtime = "nodejs";

/**
 * Diagnostic endpoint, not linked from the UI. baps.org is unreachable from
 * the sandbox this app was developed in, so selectors in lib/scrape were
 * written against best-effort heuristics rather than inspected markup. This
 * route (fetched from Vercel's unrestricted network) is how selector
 * accuracy gets checked and tuned after each deploy.
 */
export async function GET() {
  const [data, rawSatsangLen, rawVicharanLen] = await Promise.all([
    getDashboardData(),
    fetch(SOURCES.dailySatsang, { signal: AbortSignal.timeout(12000) })
      .then((r) => r.text())
      .then((t) => t.length)
      .catch((e) => `error: ${e}`),
    fetch(SOURCES.vicharan, { signal: AbortSignal.timeout(12000) })
      .then((r) => r.text())
      .then((t) => t.length)
      .catch((e) => `error: ${e}`),
  ]);

  return NextResponse.json(
    {
      rawHtmlLength: { dailySatsang: rawSatsangLen, vicharan: rawVicharanLen },
      summary: {
        hinduDate: data.satsang.hinduDate,
        prernaParimalFound: Boolean(data.satsang.prernaParimal),
        vachanamrutGemsFound: Boolean(data.satsang.vachanamrutGems),
        audioTracksFound: data.satsang.audio.length,
        murtiImagesFound: data.satsang.darshan.murti.length,
        swamishriImagesFound: data.satsang.darshan.swamishri.length,
        vicharanEntriesFound: data.vicharan.entries.length,
        scheduleNote: data.vicharan.scheduleNote,
      },
      data,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
