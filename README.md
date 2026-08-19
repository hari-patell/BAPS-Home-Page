# BAPS Daily Darshan

A daily dashboard — inspired by a browser new-tab page — that surfaces
[Daily Satsang](https://www.baps.org/Daily-Satsang.aspx) and
[Vicharan](https://www.baps.org/vicharan.aspx) content from baps.org: Darshan
photos, the Vicharan travel schedule, Prerna Parimal, Vachanamrut Gems, and
Daily Audio.

Built with Next.js (App Router), TypeScript, and Tailwind CSS v4. Deployed on
Vercel.

## How it works

There's no official BAPS API, so `src/lib/scrape/` fetches the two public
pages server-side. Text content (Prerna Parimal, Vachanamrut Gems, the
Hindu/Samvat date) is parsed from the rendered HTML with
[cheerio](https://cheerio.js.org/) using heuristics (keyword/regex matching,
Gujarati-script detection) rather than brittle hard-coded selectors, since
the pages have no documented markup contract — see
`src/lib/scrape/heuristics.ts`. Images are found differently: rather than
trust HTML `width`/`height` attributes (often missing or unreliable —
that's exactly how a site logo with no `width=""` ended up rendered as a
giant "photo" during development), `browserFetch.ts` reads real rendered
dimensions straight off the live DOM (`naturalWidth`, `getBoundingClientRect`)
inside the headless browser itself, which is a strictly more reliable signal
than any markup-based guess. Every scraper is wrapped so a parse failure
degrades a single section to an empty state instead of breaking the page.

- `src/lib/scrape/browserFetch.ts` — headless-Chromium page fetch (see below)
- `src/lib/scrape/fetchHtml.ts` — thin wrapper other modules call into
- `src/lib/scrape/dailySatsang.ts` — Darshan photos, Prerna Parimal,
  Vachanamrut Gems, Daily Audio, Hindu/Samvat date
- `src/lib/scrape/vicharan.ts` — travel schedule entries + "schedule up to"
  link
- `src/lib/data.ts` — combines both into one `DashboardData` payload

Caching is page-level ISR (`export const revalidate` in `page.tsx`) rather
than per-fetch, since a headless-browser navigation isn't a cacheable
`fetch()` call the way Next's data cache expects. The refresh icon in the UI
calls `GET /api/dashboard` for an on-demand, uncached pull instead.

Images and audio are streamed through `GET /api/proxy?src=...`
(`src/app/api/proxy/route.ts`) rather than linked to directly, since some
baps.org CDN paths reject cross-site requests, and to avoid maintaining a
`next.config` allowlist for every CDN host baps.org happens to use.

### Tuning the scrapers

The parsers in this repo were written without being able to inspect
baps.org's live markup (the sandbox this project was built in has no general
internet egress). `GET /api/debug` (unlinked from the UI) returns the raw
parsed output, match counts for every section, and — per source page —
`probe.*.imageCandidates`, the actual image/background-image elements the
DOM scan found with their real rendered dimensions and captions. Fetch it
against your deployment to see what the heuristics actually found, and
adjust the regexes in `heuristics.ts` / `dailySatsang.ts` / `vicharan.ts` or
the `MIN_CONTENT_IMAGE_SIZE` threshold in `browserFetch.ts` accordingly.

### baps.org's Cloudflare challenge

baps.org sits behind Cloudflare bot management: a direct server-side fetch
gets back a "Just a moment..." challenge page (HTTP 403, `cf-mitigated:
challenge`) instead of the real HTML, no matter what headers are sent —
solving it requires executing JS in a browser-trusted environment, which a
plain `fetch()` can't do.

`src/lib/scrape/browserFetch.ts` gets past this by running an actual
headless Chromium inside the Vercel function itself, via
[`puppeteer-core`](https://www.npmjs.com/package/puppeteer-core) +
[`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) — the
standard combo for running Chromium in AWS Lambda-style serverless
runtimes. It navigates to the page, waits out Cloudflare's automatic
JS challenge if one shows up, and hands the fully rendered HTML to the same
cheerio parsers. No third-party API, no signup, no per-request cost beyond
Vercel's own compute.

Trade-offs versus a plain fetch:

- Slower: launching Chromium and waiting for the challenge to resolve can
  take 10-20s (hence `maxDuration = 60` on the routes that call it, and a
  warm browser instance is reused across requests within the same function
  invocation to cut that down on subsequent calls).
- Heavier: adds Chromium's binary to the deployed function. Vercel's build
  tracing (and the fact that both packages are in Next's
  `serverExternalPackages` default list) handles this automatically — no
  `next.config.ts` changes needed.
- Not an absolute guarantee: this passes Cloudflare's *automatic* JS
  challenge (what baps.org currently serves), not an interactive CAPTCHA.
  If Cloudflare ever escalates to that or starts scoring Vercel's IP ranges
  as high-risk regardless, no free technique gets past it — a paid
  unblocking API or BAPS granting direct access become the only options at
  that point.

Check `GET /api/debug` after deploying — `probe.dailySatsang.status` /
`probe.vicharan.status` should read `200`, and `probe.*.challengeDetected`
shows whether the interstitial actually appeared and had to be waited out.

## Project layout

```
src/
  app/
    page.tsx            # server component: fetches data, renders the dashboard
    api/dashboard/       # GET — fresh aggregated JSON (no-store)
    api/proxy/            # GET — streams a baps.org image/audio asset
    api/debug/            # GET — raw scrape diagnostics (unlinked)
  components/            # one component per dashboard section, all presentational
  lib/
    config.ts            # quick links, search engine URL, source URLs
    types.ts              # shared data shapes
    data.ts                # aggregates both scrapers
    scrape/                # cheerio-based parsers
```

Every dashboard section (Darshan, Vicharan carousel, Prerna Parimal,
Vachanamrut Gems, Daily Audio) is its own component that renders a graceful
empty state when its data is missing, so sections are independent — pulling
one out or reordering the grid in `DashboardClient.tsx` doesn't touch the
others.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Edit `src/lib/config.ts` to change:

- `QUICK_LINKS` — the icon row under the search bar
- `SEARCH_ENGINE_URL` — where the search bar submits to

How often the scrapers re-run is `export const revalidate` in `page.tsx` —
Next requires that as a literal it can statically analyze, so it can't be
pulled from `config.ts`.

## Deploy

Deployed on [Vercel](https://vercel.com) — push to `main` (or connect the
repo in the Vercel dashboard) and it builds with zero extra config or
environment variables; the Cloudflare workaround above is self-contained.
