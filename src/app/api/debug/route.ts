import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/config";
import { getDashboardData } from "@/lib/data";
import { fetchHtml } from "@/lib/scrape/fetchHtml";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Diagnostic endpoint, not linked from the UI. This is how selector
 * accuracy — and whether Cloudflare clearance is working at all (see
 * lib/scrape/clearance.ts) — gets checked against the live site after a
 * deploy, since baps.org is unreachable from the dev sandbox.
 */
async function probe(url: string) {
  try {
    const html = await fetchHtml(url);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return {
      ok: true,
      htmlLength: html.length,
      title: title?.replace(/\s+/g, " ").trim(),
      looksLikeChallenge: /just a moment/i.test(html),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const dailySatsang = await probe(SOURCES.dailySatsang);
  const vicharan = await probe(SOURCES.vicharan);
  const data = await getDashboardData();

  return NextResponse.json(
    {
      probe: { dailySatsang, vicharan },
      summary: {
        hinduDate: data.satsang.hinduDate,
        prernaParimalFound: Boolean(data.satsang.prernaParimal),
        prernaParimalPreview: data.satsang.prernaParimal?.body?.slice(0, 120),
        vachanamrutGemsFound: Boolean(data.satsang.vachanamrutGems),
        audioTracksFound: data.satsang.audio.length,
        audioTitles: data.satsang.audio.map((a) => a.title),
        murtiImages: data.satsang.darshan.murti.map((i) => i.src),
        swamishriImages: data.satsang.darshan.swamishri.map((i) => i.src),
        vicharanEntriesFound: data.vicharan.entries.length,
        vicharanSample: data.vicharan.entries.slice(0, 5),
        scheduleNote: data.vicharan.scheduleNote,
        satsangError: data.satsang.error,
        vicharanError: data.vicharan.error,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
