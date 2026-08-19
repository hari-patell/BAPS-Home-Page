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

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Open a new tab.

To update after pulling changes, click the **reload** icon on the extension card.

## Requirements / notes

- **Cloudflare clearance:** if you see "Couldn't reach baps.org (Cloudflare)",
  just open <https://www.baps.org/> once in the same browser and reload the new
  tab — that gives your browser the clearance cookie the fetch needs.
- **Permissions:** the manifest requests host access to `*.baps.org` only, so it
  can read those pages and images. No other sites, no tracking, no server.
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
