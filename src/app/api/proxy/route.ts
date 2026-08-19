import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_HOST_SUFFIX = "baps.org";

/**
 * Streams an image or audio file from baps.org through our own origin.
 *
 * Reasons this exists instead of pointing <img>/<audio> straight at baps.org:
 *  - Some BAPS CDN paths reject requests without a same-site Referer.
 *  - It keeps next.config free of a long, ever-changing remotePatterns list
 *    for whatever CDN subdomain baps.org happens to serve media from.
 */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src");
  if (!src) {
    return NextResponse.json({ error: "missing src" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return NextResponse.json({ error: "invalid src" }, { status: 400 });
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname.toLowerCase().endsWith(ALLOWED_HOST_SUFFIX)
  ) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www.baps.org/",
      },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: 502 },
      );
    }

    const fallbackType = /\.mp3(\?|$)/i.test(url.pathname)
      ? "audio/mpeg"
      : "image/jpeg";

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? fallbackType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
