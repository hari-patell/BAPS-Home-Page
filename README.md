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
pages server-side and parses them with [cheerio](https://cheerio.js.org/).
Because the pages have no documented markup contract, the parsers use
heuristics (keyword/regex matching, Gujarati-script detection, date-pattern
matching) rather than brittle hard-coded selectors — see
`src/lib/scrape/heuristics.ts`. Every scraper is wrapped so a parse failure
degrades a single section to an empty state instead of breaking the page.

- `src/lib/scrape/fetchHtml.ts` — fetch with a real browser UA + timeout
- `src/lib/scrape/dailySatsang.ts` — Darshan photos, Prerna Parimal,
  Vachanamrut Gems, Daily Audio, Hindu/Samvat date
- `src/lib/scrape/vicharan.ts` — travel schedule entries + "schedule up to"
  link
- `src/lib/data.ts` — combines both into one `DashboardData` payload

Data is cached via Next.js ISR (`REVALIDATE_SECONDS` in `src/lib/config.ts`);
the refresh icon in the UI calls `GET /api/dashboard` for an on-demand,
uncached pull.

Images and audio are streamed through `GET /api/proxy?src=...`
(`src/app/api/proxy/route.ts`) rather than linked to directly, since some
baps.org CDN paths reject cross-site requests, and to avoid maintaining a
`next.config` allowlist for every CDN host baps.org happens to use.

### Tuning the scrapers

The parsers in this repo were written without being able to inspect
baps.org's live markup (the sandbox this project was built in has no general
internet egress). `GET /api/debug` (unlinked from the UI) returns the raw
parsed output plus match counts for every section — fetch it against your
deployment to see what the heuristics actually found, and adjust the regexes
in `heuristics.ts` / `dailySatsang.ts` / `vicharan.ts` accordingly.

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
    config.ts            # quick links, search engine, revalidate intervals
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
- `REVALIDATE_SECONDS` — how often each source page is re-fetched
- `SEARCH_ENGINE_URL` — where the search bar submits to

## Deploy

Deployed on [Vercel](https://vercel.com) — push to `main` (or connect the
repo in the Vercel dashboard) and it builds with zero extra config. No
environment variables are required.
