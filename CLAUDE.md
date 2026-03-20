# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Akwa IT Support is a zero-dependency PWA (Progressive Web App) for internal IT helpdesk. No build step, no npm, no framework — pure HTML/CSS/JS served as static files. Deployed on Netlify.

## Development

Open `index.html` directly in a browser, or use any static file server:

```bash
npx serve .
# or
python -m http.server 8080
```

Deploy to production:
```bash
netlify deploy --dir . --prod
```

## Architecture

All app logic lives in two files:
- **`js/app.js`** — single JS file: icon definitions (`IC` object), inline fallback data, all rendering, navigation, search, chat (AI assistant), and service worker registration.
- **`css/styles.css`** — all styles.

Data is loaded at runtime via `fetch`:
- **`data/problems.json`** — each problem has: `id`, `title`, `icon` (key into `IC`), `cat`, `iconColor`, `iconBg`, `p` (P1/P2/P3), `pl` (URGENT/IMPORTANT/NORMAL), `keys` (search terms), `time`, `symptoms[]`, `steps[]` (`e` = icon key, `t` = markdown text with `**bold**`), optional `note`, `escalateAfter`, `phone`.
- **`data/groups.json`** — defines sidebar categories and their ordered item list. Each item has `label` and `problemId` (null = ticket link fallback).

`app.js` also contains `_PROBLEMS_INLINE` and `_GROUPS_INLINE` — exact mirrors of the JSON files used as offline fallback when `fetch` fails (e.g. `file://` protocol). **Keep these in sync with the JSON files.**

## Chat assistant

The "assistant IA" is fully local — no external API calls. `localReply()` in `app.js` scores problems by matching the user's message against each problem's `keys[]` array and title words, then surfaces the best match. No network request is made for chat.

## Critical: service worker caching

The app uses a cache-first service worker (`sw.js`) with a versioned cache name (currently `akwa-it-v11`). **Every time any content file is changed, the cache version must be bumped** (e.g. `akwa-it-v11` → `akwa-it-v12`) so the browser discards the old cache and fetches fresh files. Without this, users will continue to see the old version.

`netlify.toml` sets `Cache-Control: no-cache` on all HTML/JS/CSS/data assets so the CDN never serves stale files — but the **service worker version** is still the mechanism that forces existing PWA installs to update.

## Adding a new problem

1. Add the entry to **`data/problems.json`** with a new unique `id`.
2. Add the entry to the relevant group in **`data/groups.json`** (`{ "label": "...", "problemId": <id> }`).
3. Add the matching entry to `_PROBLEMS_INLINE` and `_GROUPS_INLINE` in **`js/app.js`** (offline fallback).
4. Update the "N cas couverts" counter in **`index.html`**.
5. Bump the cache version in **`sw.js`**.

## Icons

Icons are inline SVG strings stored in the `IC` object at the top of `app.js`. Available keys: `creditCard`, `wifi`, `wifiOff`, `globe`, `clock`, `hourglass`, `mail`, `printer`, `lock`, `zap`, `monitor`, `activity`, `shield`, `check`, `info`, `alertTriangle`, `phone`, `searchX`, `bot`, `eye`, `smartphone`, `settings`, `clipboard`, `trash`, `refreshCw`, `key`, `inbox`, `cornerDownLeft`, `search`, `xCircle`, `plug`, `save`, `x`, `logOut`, `calendar`, `cloud`, `user`, `link`, `unlock`, `server`, `checkCircle`, `fileText`, `building`, `folder`, `alertCircle`. Use only these keys in `problems.json` step `e` fields and problem `icon` fields.
