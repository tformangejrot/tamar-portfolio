# Paris Boutique Fitness Trends Dashboard

A data visualization dashboard exploring boutique fitness trends across Paris, including studio distribution by modality, growth over time, spatial distribution, and naming trends.

## Features

- **Modality Analysis**: Distribution of studios by fitness modality (pilates, yoga, cycling, etc.)
- **Growth Trends**: Studio openings by year, with focus on reformer pilates boom
- **Spatial Distribution**: Heatmap showing studio density across Paris arrondissements
- **Naming Trends**: Analysis of studio branding (language, tone/style)
- **Recent Growth**: New studios opened in the past 16 months by modality

## Data Sources

- ClassPass studio listings
- Google Places API (enrichment)
- Domain registration data (WHOIS)
- Location-specific opening dates (Wayback Machine, articles, user research)

## Tech Stack

- **Visualization**: Chart.js, Leaflet.js with heatmap plugin
- **Hosting**: Vercel (static site)
- **Data Processing**: Node.js scripts

## Project Structure

```
├── scripts/
│   ├── dashboard.html          # Main dashboard (all visualizations)
│   ├── fetch_classpass.mjs     # ClassPass scraper
│   ├── normalize_classpass.mjs # Data normalization
│   ├── enrich_with_google.mjs  # Google Places enrichment
│   └── ...
├── data/
│   ├── raw/                    # Raw scraped data (gitignored)
│   ├── processed/              # Processed datasets (gitignored)
│   └── reference/              # Category mappings and references
└── .gitignore                  # Excludes large data files
```

## Deployment

The dashboard is a single HTML file with embedded data, making it easy to deploy:

1. **Vercel**: Connect your GitHub repo and deploy
2. **GitHub Pages**: Push to `gh-pages` branch
3. **Static Hosting**: Upload `scripts/dashboard.html` to any static host

## Data Files

Large data files are excluded from git (see `.gitignore`). To regenerate:

1. Run `scripts/fetch_classpass.mjs` to scrape ClassPass
2. Run `scripts/normalize_classpass.mjs` to normalize data
3. Run `scripts/enrich_with_google.mjs` to add Google Places data
4. Run `scripts/enrich_with_whois.mjs` to add domain data
5. Run `scripts/consolidate_studio_data.mjs` to create final dataset

## License

MIT

