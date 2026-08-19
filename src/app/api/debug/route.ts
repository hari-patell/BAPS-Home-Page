import * as cheerio from "cheerio";
import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/config";
import { getDashboardData } from "@/lib/data";
import { fetchHtml } from "@/lib/scrape/fetchHtml";
import { collectImages, toContentImages } from "@/lib/scrape/heuristics";

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

/**
 * Fetches one Vicharan day page and reports what images it actually offers.
 * Every entry was silently falling back to its blurry listing thumbnail, and
 * the fallback is deliberately silent, so this is the only way to see
 * whether the day page loads at all and which candidate the picker sees.
 */
async function probeDetail(url: string | undefined) {
  if (!url) return { skipped: "no detail href on the newest entry" };
  try {
    const html = await fetchHtml(url, { timeoutMs: 15000 });
    const $ = cheerio.load(html);
    const candidates = toContentImages(collectImages($, url));
    return {
      ok: true,
      url,
      htmlLength: html.length,
      looksLikeChallenge: /just a moment/i.test(html),
      candidates: candidates.slice(0, 12).map((c) => c.src),
      nonThumbnail: candidates
        .filter((c) => !/\/Thumbnails\//i.test(c.src))
        .slice(0, 6)
        .map((c) => c.src),
    };
  } catch (err) {
    return { ok: false, url, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const dailySatsang = await probe(SOURCES.dailySatsang);
  const vicharan = await probe(SOURCES.vicharan);
  const data = await getDashboardData();
  const detail = await probeDetail(data.vicharan.entries[0]?.href);

  return NextResponse.json(
    {
      probe: { dailySatsang, vicharan, vicharanDetail: detail },
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
