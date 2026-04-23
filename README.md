# Tamar Forman-Gejrot — Portfolio

Static portfolio and boutique-fitness data work, hosted on [Vercel](https://vercel.com). No build step: edit HTML/CSS/JS directly. Runtime dependencies load from CDNs (Chart.js, Leaflet, etc.).

## Quick start

- Open `index.html` in a browser, or run a static server from the repo root (for example `npx serve` or `python3 -m http.server`) so asset paths behave like production.
- **Portfolio homepage** (links, about copy, featured cards): edit `index.html`.

## What lives where

| Public path | Source | Notes |
|-------------|--------|--------|
| `/` | `index.html` | Portfolio landing; “Featured Work” cards point at the rows below. |
| `/work/paris-boutique-fitness-2025/` | `work/paris-boutique-fitness-2025/index.html` | Paris trends dashboard; data embedded in the file. |
| `/work/london-boutique-fitness-2025/` | `work/london-boutique-fitness-2025/index.html` | London trends dashboard; same pattern as Paris. |
| `/work/nairobi-boutique-fitness-2025/` | `work/nairobi-boutique-fitness-2025/index.html` | **On hold:** the Nairobi piece may not ship, but the folder and local data pipeline stay for now. On Vercel, `vercel.json` redirects `/work/nairobi-boutique-fitness-2025` to `/` so old links do not 404. |
| `/scripts/pricing-dashboard.html` | `scripts/pricing-dashboard.html` | Paris pricing intelligence (linked from the homepage). |
| `/scripts/dashboard.html`, `/scripts/visual*.html`, etc. | `scripts/*.html` | Alternate or slice dashboards (modality, growth, map, naming, etc.); useful for iteration; not all are linked from `index.html`. |
| `/studio-grow-workbook/` | `studio-grow-workbook/` | **One-off demo** mini-site; not part of the main portfolio story. See below. |

**Case studies (`work/`) vs `scripts/`:** Each shipped city dashboard under `work/<name>/index.html` is a **self-contained** page (inline styles + chart code + **embedded dataset in JS**). The `scripts/` folder holds **data pipeline** `.mjs` files plus extra HTML prototypes (`dashboard.html`, `dashboard-dynamic.html`, `visual1_modalities.html`, …). Updating a live case study usually means changing that `work/.../index.html` after you have new aggregated data—not only `scripts/dashboard.html`.

**Root-level charts:** `hiit-bootcamp-chart.html` and `cycling-chart.html` are standalone pages; link them from `index.html` if you want them in the portfolio.

## Studio Grow Workbook (demo)

`studio-grow-workbook/` was built mostly as a **demo** and is low priority for ongoing maintenance. To run it locally:

```bash
npm run dev
```

(`dev` / `dev:workbook` start `http-server` in that folder per `package.json`.)

## Data and Node scripts

- **`data/reference/`** — Committed reference files (e.g. category mappings, city-specific modality lists).
- **`data/raw/`** and **`data/processed/`** — Large JSON/JSONL outputs are **gitignored** (see `.gitignore`); clone the repo on a machine that already has them, or regenerate.
- **`data/aggregates/<city>/`** — Small pre-computed JSON files consumed by dashboards. These **are** committed.

API keys and secrets for enrichment live in **`.env` / `.env.local`** (ignored by git).

---

### Pipeline A — ClassPass approach (Paris, London)

Used for cities with strong ClassPass coverage. ClassPass provides a pre-filtered, boutique-specific starting point.

1. `fetch_classpass.mjs` — scrape ClassPass studio listings
2. `normalize_classpass.mjs` — parse and normalize categories
3. `enrich_with_google.mjs` — Google Places enrichment (address, rating, coordinates)
4. `enrich_with_whois.mjs` — domain registration dates (opening date estimates)
5. `consolidate_studio_data.mjs` — merge, deduplicate, apply category consolidation
6. `create_boutique_only.mjs` — filter to boutique studios
7. `compute_<city>_aggregates.mjs` — generate JSON metrics for dashboard

---

### Pipeline B — Google Maps approach (Berlin, Nairobi, Amsterdam, Stockholm)

Used for cities without reliable ClassPass coverage. Searches Google Places for each modality category directly.

#### Step 1 — Fetch raw data
```bash
node --env-file=.env.local scripts/fetch_google_places_<city>.mjs
```
- Reads `data/reference/<city>_categories.json` (71 modality search terms)
- Saves one JSON file per modality to `data/raw/google_places_<city>/`
- Supports `--slug <modality>` to fetch a single category, `--no-resume` to re-fetch all
- Retries transient API errors (DEADLINE_EXCEEDED, OVER_QUERY_LIMIT) automatically
- Skips already-fetched slugs by default (safe to re-run after interruption)

#### Step 2 — WHOIS enrichment (opening date estimates)
```bash
node --env-file=.env.local scripts/enrich_<city>_with_whois.mjs
```
- Deduplicates by `place_id` before lookups — each studio queried once only
- Writes `data/processed/<city>_studios_whois.json`
- Supports `--limit N` / `--offset N` for batching; resumable by default
- Note: German `.de` domains via DENIC often return `1986-11-05` as a placeholder
  when no real date exists — this is filtered out during consolidation

#### Step 3 — Wayback Machine enrichment (fallback opening dates)
```bash
node scripts/enrich_<city>_with_wayback.mjs
```
- Only targets studios that have a domain but no valid WHOIS date
- Queries the public Wayback CDX API for the earliest HTTP 200 capture of each domain
- 1-second delay per request (free public API — be polite)
- Writes `data/processed/<city>_studios_wayback.json`
- Supports `--limit` / `--offset` / `--no-resume`; `--all` to run on all studios
- Priority in final data: WHOIS date > Wayback date > null

#### Step 4 — Consolidate
```bash
node scripts/consolidate_<city>_studios.mjs
```
- Merges all modality files, deduplicates by `place_id`
- Extracts neighborhood/district from address strings
- Joins WHOIS and Wayback date files (both optional — skipped gracefully if absent)
- Applies `data/reference/category_consolidation.json` to standardize modalities
- Outputs:
  - `data/processed/<city>_studios_consolidated.json` — all studios
  - `data/processed/<city>_studios_consolidated_boutique.json` — category-filtered

#### Step 5 — Manual data review & exclusions
After consolidation, export to CSV and review in a spreadsheet:
```bash
node scripts/export_<city>_studios_csv.mjs
```
Google Places searches return broad results — expect to find:
- Supermarkets/retailers matched on category keywords (e.g. "boxing" matching store names)
- Nightclubs and social dance venues matched on "dance" searches
- Medical/beauty clinics matched on wellness categories
- Department stores, shopping malls, food venues

Confirmed exclusions are added to `create_boutique_only_<city>.mjs` as name-based regex patterns.

#### Step 6 — Apply exclusions
```bash
node scripts/create_boutique_only_<city>.mjs
```
- Re-applies category filter + name exclusion list
- Overwrites `data/processed/<city>_studios_consolidated_boutique.json` with clean data

#### Step 7 — Compute aggregates
```bash
node scripts/compute_<city>_aggregates.mjs
```
- Reads the clean boutique file
- Outputs ~10 JSON files to `data/aggregates/<city>/` — these are committed to git

#### Step 8 — Dashboard
`work/<city>-boutique-fitness-2025/index.html` — fetches from `data/aggregates/<city>/`

---

**Nairobi:** Pipelines and raw/processed data stay in the repo locally for future use even if the public dashboard never ships.

**Pricing workflow:** See `data/pricing/HANDOFF_STUDIO_UPDATES.md` for handoff notes on studio pricing updates.

## Features (boutique fitness dashboards)

- **Modality analysis** — Studios by fitness modality (pilates, yoga, cycling, etc.)  
- **Growth trends** — Openings over time (e.g. reformer pilates)  
- **Spatial distribution** — Density / heatmaps (e.g. Paris arrondissements)  
- **Naming trends** — Branding patterns  
- **Recent growth** — New studios in a recent window by modality  

## Data sources (typical)

- ClassPass studio listings  
- Google Places API (enrichment)  
- Domain registration (WHOIS)  
- Opening dates from Wayback, articles, manual research  

## Deployment

- **Vercel:** Connect the GitHub repo; static output is the repository root (`vercel.json` sets `outputDirectory` to `.` and may define redirects).  
- **Other static hosts:** Upload the same tree; preserve paths under `work/` and `scripts/`.

## License

MIT
