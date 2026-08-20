# BAPS Daily Darshan — new-tab extension

A Chrome/Edge new-tab page that shows the same dashboard as the web app —
today's Murti & Swamishri darshan, all of the latest Vicharan photos, Prerna
Parimal, Vachanamrut Gems and the daily audio — but it runs **entirely in your
browser**.

## Why it's fast

The web app on Vercel has to scrape baps.org server-side through a headless
browser (baps.org sits behind Cloudflare, which binds its clearance to a real
browser's TLS fingerprint). That's the slow, cold-start-prone part.

This extension skips all of that: because it runs inside your own browser, it
fetches baps.org directly, using the Cloudflare clearance your browser already
has from normal browsing, and images load straight from baps.org's CDN. It also
caches the last result in `localStorage`, so a new tab paints instantly and then
refreshes in the background.

## Install

Chrome only allows extensions from the Web Store to be double-click installed,
so this one loads **unpacked** (that's normal for a self-hosted extension). Pick
whichever download is easier — both end at the same "Load unpacked" step.

### Option A — download the packaged zip (no git needed)

1. Go to the repo's [**Releases**](../../releases) page and download
   `baps-daily-darshan-extension.zip` from the latest release.
2. Unzip it — you'll get a folder containing `manifest.json`.
3. Open `chrome://extensions` (or `edge://extensions`) and turn on
   **Developer mode** (top-right).
4. Click **Load unpacked** and select the unzipped folder.
5. Open a new tab.

_(No release yet? Use Option B, or ask a maintainer to publish one — see
"Publishing a release" below.)_

### Option B — from a copy of the repo

1. Download the whole repo (green **Code** button → **Download ZIP**) and unzip,
   or `git clone` it.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on
   **Developer mode** (top-right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Open a new tab.

To update after pulling changes (Option B) or installing a newer zip (Option A),
click the **reload** icon on the extension card.

## Publishing a release (maintainers)

The [`Package extension`](../.github/workflows/package-extension.yml) workflow
builds `baps-daily-darshan-extension.zip` (just this `extension/` folder). Create
a GitHub Release (tag it, e.g. `ext-v1.0.0`) and the workflow attaches the zip to
it automatically, giving users the one-file download in Option A. You can also
run the workflow manually from the **Actions** tab to grab the zip as a build
artifact without cutting a release.

## Requirements / notes

- **Cloudflare clearance:** if you see "Couldn't reach baps.org (Cloudflare)",
  just open <https://www.baps.org/> once in the same browser and reload the new
  tab — that gives your browser the clearance cookie the fetch needs.
- **Permissions:** the manifest requests host access to `*.baps.org` (to read
  those pages and images), plus `bookmarks` and `favicon` so the quick-links row
  can mirror your browser's Bookmarks Bar — its bookmarks, folders, and favicons
  — read-only. Nothing is written back, no tracking, no server. On install/reload
  the browser will ask to "Read your bookmarks"; that's what powers the mirror.
- **Icons:** none are bundled, so the browser shows a default puzzle-piece icon
  on the extensions page. Drop `icon16.png` / `icon48.png` / `icon128.png` into
  this folder and add an `"icons"` block to `manifest.json` if you want one.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest; overrides the new-tab page, requests baps.org host access. |
| `newtab.html` | Page structure. |
| `newtab.css` | Styling (design tokens mirror the web app's `globals.css`). |
| `scrape.js` | Client-side port of the server scraper (`src/lib/scrape/*`), using `DOMParser`. |
| `newtab.js` | Rendering, carousel/darshan interactions, clock, search, and the `localStorage` cache. |

The parsing logic is a direct port of the web app's scraper, so when baps.org's
markup changes, both should be updated together.
