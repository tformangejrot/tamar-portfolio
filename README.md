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

- **`data/reference/`** — Committed reference files (e.g. category mappings).
- **`data/raw/`** and **`data/processed/`** — Large JSON/JSONL outputs are **gitignored** (see `.gitignore`); clone the repo on a machine that already has them, or regenerate.

**Paris (example pipeline):**

1. `scripts/fetch_classpass.mjs` — scrape ClassPass  
2. `scripts/normalize_classpass.mjs` — normalize  
3. `scripts/enrich_with_google.mjs` — Google Places  
4. `scripts/enrich_with_whois.mjs` — domain / WHOIS  
5. `scripts/consolidate_studio_data.mjs` — consolidated dataset  

London and other cities use **parallel** scripts (often suffixed `_london.mjs` or named for the city, e.g. Nairobi Google Places fetchers). Browse `scripts/*.mjs` for the full set.

API keys and secrets for enrichment live in **`.env` / `.env.local`** (ignored by git). Copy from your own machine when setting up elsewhere.

**Nairobi:** Pipelines and raw/processed data can stay in the repo locally for future use even if the public Nairobi dashboard never ships; nothing in this README requires deleting those files.

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
