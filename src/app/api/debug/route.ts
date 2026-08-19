import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/config";
import { getDashboardData } from "@/lib/data";
import { probeRenderedPage } from "@/lib/scrape/browserFetch";

export const runtime = "nodejs";
export const maxDuration = 60;

async function probe(url: string) {
  try {
    return await probeRenderedPage(url);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Diagnostic endpoint, not linked from the UI. baps.org is unreachable from
 * the sandbox this app was developed in, so selectors in lib/scrape were
 * written against best-effort heuristics rather than inspected markup. This
 * route (fetched from Vercel's unrestricted network) is how selector
 * accuracy — and whether the headless-browser render actually got past
 * Cloudflare's challenge (see lib/scrape/browserFetch.ts) — gets checked
 * after each deploy.
 */
export async function GET() {
  // Sequential on purpose. Each step drives a headless Chrome page, and
  // running the full dashboard scrape alongside both probes was enough
  // concurrent Chrome to kill the browser outright ("Connection closed.").
  // This route is a diagnostic, so trading latency for reliability is the
  // right call.
  const satsangProbe = await probe(SOURCES.dailySatsang);
  const vicharanProbe = await probe(SOURCES.vicharan);
  const data = await getDashboardData();

  return NextResponse.json(
    {
      probe: { dailySatsang: satsangProbe, vicharan: vicharanProbe },
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
