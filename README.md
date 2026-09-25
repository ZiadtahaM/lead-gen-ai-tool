# Lead Engine PRO MAX — Live B2B Lead Generator & Forensic Auditor

## Project Overview
- **Name**: Lead Engine PRO MAX
- **Goal**: Replace a broken local Python tool (repeating leads, fake demo data, PowerShell-only UX) with a real, persistent, web-based B2B lead generation system that always surfaces genuinely NEW businesses, forensically audits their websites, and generates culturally-calibrated outreach scripts — 100% free to run.
- **Core features**:
  - **Live business discovery** for local trades (plumbers, electricians, HVAC, dentists, auto shops, etc.) via two data sources:
    1. **Real Google Maps scraping** (primary, best quality) — a headless Chromium/Playwright scraper that runs for free on **GitHub Actions**, dispatched on-demand from the dashboard.
    2. **OpenStreetMap (Nominatim + Overpass)** (fallback, instant but limited phone coverage for local trades) — runs directly inside the Cloudflare Worker, no external compute needed.
  - **Zero-repeat guarantee**: every lead is deduplicated in Cloudflare D1 on a stable `dedupe_key` (normalized phone, or name+city fallback) using `INSERT ... ON CONFLICT DO NOTHING`. Re-running the same search only ever returns leads not already in the database; the OSM path also auto-expands its search radius on repeated runs.
  - **Forensic website audit**: for every business with a real website, fetches the site and checks HTTP status, response time, mobile-viewport meta tag, SSL, title/meta/H1 tags, presence of a WhatsApp/tel/contact-form conversion path, extracts emails and Instagram/Facebook links, and computes a 0–100 "weakness score" used to prioritize outreach.
  - **4-market psychographic outreach generation**: culturally-tailored WhatsApp/call/email scripts (Hormozi-style value equation, loss aversion, zero-risk framing) for **KSA** (Arabic), **Egypt** (Egyptian Arabic), **USA** (English), and **Morocco** (French/Darija), branching on whether the lead has no website, social-media-only, or a real (but weak) website.
  - **One-click WhatsApp outreach**: every lead with a phone number gets a ready `wa.me` deep link pre-filled with its personalized pitch message.
  - **Outreach queue & CRM-lite**: enqueue leads, dispatch the highest-priority one next (sorted by weakness score), track status (QUEUED → DISPATCHED → REPLIED/CONVERTED/BOUNCED), and a do-not-contact blacklist.
  - **Single dashboard UI**: one page, RTL Arabic-first, market switcher, live stats, leads list with filters/search, outreach queue — no manual script running, no PowerShell.

## URLs
- **Production**: https://lead-engine-pro-max.pages.dev ✅ **LIVE**
- **GitHub repo**: https://github.com/ZiadtahaM/lead-gen-ai-tool ✅ **Connected**
- **Local dev**: http://localhost:3000 (sandbox preview URL provided by the environment)

## Data Architecture

### Storage
**Cloudflare D1** (SQLite, edge-distributed) is the only persistence layer — no in-memory or file-based storage.

### Schema (see `migrations/`)
- **`leads`** — one row per unique business. Key columns: `business_name`, `category`, `city`, `country`, `phone_normalized`, `website_category` (`NO_WEBSITE` / `SOCIAL_MEDIA_ONLY` / `REAL_WEBSITE`), `weakness_score`, `audit_report` (JSON), `pitch_script` (JSON), `whatsapp_url`, `tel_url`, `dedupe_key` (**UNIQUE** — the core anti-repeat mechanism).
- **`search_cursors`** — tracks radius/run-count per `market::keyword::location` combo so the OSM search path expands coverage on repeated runs instead of returning the same handful of results.
- **`outreach_queue`** — leads queued for contact, with status tracking.
- **`do_not_contact`** — blacklist of phone/email targets to never re-enqueue.
- **`scrape_jobs`** — tracks async GitHub-Actions-Playwright scrape jobs (`PENDING` → `RUNNING` → `DONE`/`FAILED`), including result counts, so the dashboard can poll progress.

### Hybrid architecture (why two data sources)
Cloudflare Workers **cannot run a headless browser** (no Chromium, no `child_process`). Real Google Maps scraping needs one. The free solution:

```
Dashboard (Cloudflare Pages/Worker)
   │  POST /api/scrape/dispatch  { market, keyword, location, maxResults }
   ▼
GitHub REST API → repository_dispatch event on this repo
   ▼
GitHub Actions runner (free, ubuntu-latest, real Chromium via Playwright)
   │  scraper/scrape.mjs — navigates real Google Maps, extracts name/phone/
   │  website/rating/reviews/address per listing (ported from the original
   │  Python core/harvester.py logic)
   ▼
POST /api/scrape/import  (Authorization: Bearer <IMPORT_TOKEN>)
   ▼
Same triage → forensic audit → pitch generation → D1 dedupe-insert pipeline
   ▼
Dashboard polls GET /api/scrape/status/:jobId every 4s until DONE, then
refreshes the leads list automatically.
```

The OpenStreetMap path (`/api/ignite`) runs the identical triage/audit/pitch/persist
pipeline synchronously inside the Worker itself (no GitHub round-trip) — instant,
but Overpass has materially worse phone-number coverage for small local-trade
businesses in most markets, so it's positioned as the fast fallback, not the
primary path.

**Efficiency note**: both pipelines check `dedupe_key` existence *before* running
the (network-bound) forensic audit, so re-importing/re-running against
already-known businesses is near-instant and makes zero extra outbound HTTP calls.

## API Endpoints

### Core (`/api/*`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/markets` | List the 4 supported markets and their config |
| POST | `/api/ignite` | Run the instant OSM-based harvest→audit→pitch→persist pipeline. Body: `{ market, keyword, location, maxResults }` |
| POST | `/api/audit-single` | Forensically audit one URL on demand. Body: `{ url, market }` |
| GET | `/api/leads` | List persisted leads. Query: `market`, `websiteCategory`, `search`, `limit` |
| GET | `/api/stats` | Aggregate counts (total, no-website, social-only, WhatsApp-ready, avg weakness score) |
| POST | `/api/outreach/enqueue` | Add lead(s) to the outreach queue. Body: `{ leadIds: string[] }` |
| GET | `/api/outreach/queue` | List the outreach queue |
| GET | `/api/outreach/summary` | Queue status breakdown |
| POST | `/api/outreach/dispatch-next` | Mark the highest-priority queued lead as dispatched |
| POST | `/api/outreach/status` | Update a queue item's status. Body: `{ id, status, notes? }` |
| POST | `/api/outreach/clear` | Clear the entire queue |
| POST | `/api/outreach/blacklist` | Add a phone/email to the do-not-contact list |

### Real-scrape bridge (`/api/scrape/*`)
| Method | Path | Description |
|---|---|---|
| POST | `/api/scrape/dispatch` | Trigger a real Google Maps scrape via GitHub Actions. Body: `{ market, keyword, location, maxResults }`. Returns `501` with a clear message if `GITHUB_TOKEN`/`GITHUB_REPO` aren't configured yet. |
| GET | `/api/scrape/status/:jobId` | Poll job status/result counts |
| GET | `/api/scrape/recent` | List the 15 most recent scrape jobs |
| POST | `/api/scrape/import` | **Called by the GitHub Actions runner only.** Authenticated via `Authorization: Bearer <IMPORT_TOKEN>`. Body: `{ jobId, market, keyword, location, leads: RawLead[], error? }` |

## User Guide
1. Open the dashboard and pick your target **market** (KSA / Egypt / USA / Morocco).
2. Type the trade/keyword (e.g. "plumber", "صيانة مكيفات") and the city.
3. Click **"IGNITE REAL"** for real Google Maps data (takes 1-3 min, runs on GitHub Actions) — or **"بحث سريع (OpenStreetMap)"** for an instant but lower-coverage result.
4. Review the leads list: each card shows the weakness score, website category badge, a ready-made WhatsApp link with a personalized pitch, and a call/tel link.
5. Add leads to the **outreach queue**, then work through it with "التالي بالطابور" (dispatch next), marking replies as you get them.
6. Run the same search again later — the database guarantees you'll only ever see genuinely new businesses, not the same repeated list.

## Deployment status
- **Platform**: Cloudflare Pages + Workers (Hono framework)
- **Production**: ✅ **LIVE** at https://lead-engine-pro-max.pages.dev
  - Real production D1 database (`webapp-production`), migrations applied to the remote database.
  - GitHub repo connected: https://github.com/ZiadtahaM/lead-gen-ai-tool (branch `main`).
  - GitHub Actions workflow (`.github/workflows/scrape.yml`) live and verified — a real end-to-end run completed successfully (dashboard → GitHub API dispatch → real headless Chromium on GitHub Actions → live Google Maps scrape → authenticated callback → D1 persist) in ~52 seconds, harvesting 6 real Miami plumbing businesses with correct phone/website/rating/reviews data, full forensic audits, and personalized pitch scripts.
- **Configured secrets**:
  - Cloudflare Pages (production env): `GITHUB_TOKEN` (PAT with `repo`+`workflow` scope), `GITHUB_REPO` = `ZiadtahaM/lead-gen-ai-tool`, `IMPORT_TOKEN` (shared secret).
  - GitHub Actions repo secrets: `LEAD_ENGINE_CALLBACK_URL` = ``https://lead-engine-pro-max.pages.dev/api/scrape/import`, `LEAD_ENGINE_IMPORT_TOKEN` (matches Cloudflare's `IMPORT_TOKEN`).
- **Local dev**: ✅ Also runnable via PM2 + `wrangler pages dev --local` with a local D1 SQLite database, for iteration before pushing.
- **Tech stack**: Hono + TypeScript (Worker) · Cloudflare D1 (SQLite) · vanilla JS dashboard (Tailwind CDN) · Node + Playwright scraper (GitHub Actions only, never bundled into the Worker).
- **Last updated**: 2026-09-11
