import * as cheerio from "cheerio";
import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";
import { fetchHtml } from "@/lib/scrape/fetchHtml";
import { collectImages, toContentImages } from "@/lib/scrape/heuristics";
import { primeDetailPhotos } from "@/lib/scrape/vicharan";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Diagnostic endpoint, not linked from the UI. This is how selector accuracy
 * — and whether Cloudflare clearance is working at all (see
 * lib/scrape/clearance.ts) — gets checked against the live site after a
 * deploy, since baps.org is unreachable from the dev sandbox.
 *
 * It deliberately does NOT re-fetch the two source pages itself. It used to,
 * and the extra round of navigations was enough of a burst to make
 * Cloudflare challenge the very requests it was meant to be measuring. The
 * scrape's own result is the measurement; this only adds one navigation, to
 * a day page.
 */

/**
 * Fetches one Vicharan day page and reports what images it offers. Entries
 * fall back to the blurry listing thumbnail silently by design, so this is
 * the only way to see whether the day page loads and which candidate the
 * picker would choose.
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

export async function GET(request: Request) {
  // ?prime=N walks the newest N day pages through the day-photo cache, one
  // navigation at a time. A normal scrape only has budget for a couple of
  // those, so the strip fills in over successive runs; this is the manual
  // shove that gets it there in one go after a deploy.
  const prime = Number(new URL(request.url).searchParams.get("prime") ?? 0);
  const primed = prime > 0 ? await primeDetailPhotos(prime) : undefined;

  const startedAt = Date.now();
  // Not fresh: a forced re-scrape plus the day-page probe below ran past
  // the 60s ceiling and returned nothing at all. The cached result is the
  // same data the page shows, which is what this is meant to check.
  const data = await getDashboardData();
  const scrapeMs = Date.now() - startedAt;
  const detail = await probeDetail(data.vicharan.entries[0]?.href);

  return NextResponse.json(
    {
      scrapeMs,
      primed,
      sources: {
        dailySatsang: { ok: data.satsang.ok, error: data.satsang.error },
        vicharan: { ok: data.vicharan.ok, error: data.vicharan.error },
      },
      vicharanDetail: detail,
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
        vicharanSample: data.vicharan.entries.slice(0, 6),
        scheduleNote: data.vicharan.scheduleNote,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
