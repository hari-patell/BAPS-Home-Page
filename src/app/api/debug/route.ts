import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/config";
import { getDashboardData } from "@/lib/data";
import { BROWSER_HEADERS } from "@/lib/scrape/fetchHtml";

export const runtime = "nodejs";

const DIAGNOSTIC_HEADERS = [
  "server",
  "content-type",
  "cf-ray",
  "cf-mitigated",
  "cf-cache-status",
  "x-akamai-transformed",
  "x-iinfo",
  "x-cdn",
  "via",
  "set-cookie",
];

async function probe(url: string) {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    for (const h of DIAGNOSTIC_HEADERS) {
      const v = res.headers.get(h);
      if (v) headers[h] = v;
    }
    return {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      bodyLength: body.length,
      headers,
      bodySnippet: body.slice(0, 800),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Diagnostic endpoint, not linked from the UI. baps.org is unreachable from
 * the sandbox this app was developed in, so selectors in lib/scrape were
 * written against best-effort heuristics rather than inspected markup. This
 * route (fetched from Vercel's unrestricted network) is how selector
 * accuracy — and upstream blocking — gets checked and tuned after each
 * deploy.
 */
export async function GET() {
  const [data, satsangProbe, vicharanProbe] = await Promise.all([
    getDashboardData(),
    probe(SOURCES.dailySatsang),
    probe(SOURCES.vicharan),
  ]);

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
