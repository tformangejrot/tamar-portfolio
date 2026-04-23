#!/usr/bin/env node

/**
 * Fetch fitness studios in Amsterdam using Google Places API Text Search.
 *
 * Searches for each modality in amsterdam_categories.json and saves results
 * to data/raw/google_places_amsterdam/.
 *
 * Requirements:
 *   - GOOGLE_MAPS_API_KEY environment variable (see repo .env.example for GCP setup)
 *
 * Each category runs Text Search for every string in search_terms (not only the first).
 *
 * Usage examples:
 *   node --env-file=.env.local scripts/fetch_google_places_amsterdam.mjs
 *   node --env-file=.env.local scripts/fetch_google_places_amsterdam.mjs --slug pilates
 *   node --env-file=.env.local scripts/fetch_google_places_amsterdam.mjs --no-resume
 *   GOOGLE_MAPS_API_KEY=... node scripts/fetch_google_places_amsterdam.mjs --dry-run
 *
 * By default, slugs that already have a saved file are skipped (resume mode).
 * Use --no-resume to re-fetch everything from scratch.
 * Transient API errors (DEADLINE_EXCEEDED, OVER_QUERY_LIMIT) are retried up to 3 times.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CATEGORY_PATH = path.join(ROOT, 'data/reference/amsterdam_categories.json');
const OUTPUT_DIR = path.join(ROOT, 'data/raw/google_places_amsterdam');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.error('Missing GOOGLE_MAPS_API_KEY environment variable.');
  process.exit(1);
}

const TRANSIENT_STATUSES = new Set(['DEADLINE_EXCEEDED', 'OVER_QUERY_LIMIT', 'UNKNOWN_ERROR']);
const MAX_RETRIES = 3;

const defaultOptions = {
  slug: null,
  dryRun: false,
  resume: true,
};

function parseArgs(argv) {
  const opts = { ...defaultOptions };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--no-resume') {
      opts.resume = false;
    } else if (arg.startsWith('--slug=')) {
      opts.slug = arg.split('=')[1];
    } else if (arg === '--slug') {
      opts.slug = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

async function readCategories() {
  const raw = await fs.readFile(CATEGORY_PATH, 'utf8');
  return JSON.parse(raw);
}

function filterCategories(categories, slug) {
  if (!slug) return categories;
  const match = categories.find((cat) => cat.slug === slug);
  if (!match) {
    throw new Error(`Slug "${slug}" not found in amsterdam_categories.json`);
  }
  return [match];
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function textSearch(query, location = 'Amsterdam, Netherlands', nextPageToken = null, attempt = 0) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('location', location);
  url.searchParams.set('key', API_KEY);

  if (nextPageToken) {
    url.searchParams.set('pagetoken', nextPageToken);
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`TextSearch HTTP ${resp.status}`);
  }

  const data = await resp.json();

  if (data.status === 'ZERO_RESULTS') {
    return { results: [], next_page_token: null };
  }

  if (TRANSIENT_STATUSES.has(data.status) && attempt < MAX_RETRIES) {
    const wait = 5000 * (attempt + 1);
    console.warn(`  ⚠ ${data.status} — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await delay(wait);
    return textSearch(query, location, nextPageToken, attempt + 1);
  }

  if (data.status !== 'OK' && data.status !== 'INVALID_REQUEST') {
    throw new Error(`TextSearch status ${data.status}: ${data.error_message || 'Unknown error'}`);
  }

  return {
    results: data.results || [],
    next_page_token: data.next_page_token || null,
  };
}

async function fetchPlaceDetails(placeId) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set(
    'fields',
    'place_id,name,formatted_address,website,url,rating,user_ratings_total,types,geometry',
  );
  url.searchParams.set('key', API_KEY);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`PlaceDetails HTTP ${resp.status}`);
  }

  const data = await resp.json();
  if (data.status !== 'OK') {
    throw new Error(`PlaceDetails status ${data.status}: ${data.error_message || 'Unknown error'}`);
  }

  return data.result;
}

function placeToCard(place, category) {
  return {
    name: place.name || null,
    place_id: place.place_id || null,
    category,
    location: place.formatted_address || place.vicinity || null,
    rating: place.rating ? String(place.rating) : null,
    rating_count: place.user_ratings_total ? `(${place.user_ratings_total})` : null,
    types: place.types || [],
    website: place.website || null,
    google_maps_url: place.url || null,
    lat: place.geometry?.location?.lat || null,
    lng: place.geometry?.location?.lng || null,
  };
}

async function fetchCategory({ slug, label, search_terms }) {
  const allResults = [];
  const seenPlaceIds = new Set();
  const terms =
    Array.isArray(search_terms) && search_terms.length > 0
      ? search_terms
      : [`${label} Amsterdam`];

  for (const primaryQuery of terms) {
    console.log(`→ Searching for ${slug} (${primaryQuery})`);

    let nextPageToken = null;
    let pageCount = 0;
    const maxPages = 10; // Limit to prevent infinite loops

    do {
      if (nextPageToken) {
        // Wait before fetching next page (required by Google API)
        await delay(2000);
      }

      const searchResult = await textSearch(primaryQuery, 'Amsterdam, Netherlands', nextPageToken);
      const results = searchResult.results || [];

      // Fetch details for each place to get website and full info
      for (const place of results) {
        if (seenPlaceIds.has(place.place_id)) {
          continue;
        }
        seenPlaceIds.add(place.place_id);

        try {
          await delay(150); // Rate limiting
          const details = await fetchPlaceDetails(place.place_id);
          const card = placeToCard(details, slug);
          allResults.push(card);
          console.log(`  ✓ ${card.name}`);
        } catch (err) {
          // If details fetch fails, use basic info from search result
          const card = placeToCard(place, slug);
          allResults.push(card);
          console.warn(`  ⚠ ${card.name} (details fetch failed: ${err.message})`);
        }
      }

      nextPageToken = searchResult.next_page_token;
      pageCount += 1;

      if (!nextPageToken || pageCount >= maxPages) {
        break;
      }
    } while (nextPageToken);
  }

  return {
    slug,
    label,
    fetched_at: new Date().toISOString(),
    queries_used: terms,
    total_results: allResults.length,
    results: allResults,
  };
}

async function savePayload(slug, payload) {
  await ensureOutputDir();
  const targetPath = path.join(OUTPUT_DIR, `${slug}.json`);
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2));
  console.log(`✓ Saved ${payload.total_results} results to ${targetPath}\n`);
}

const options = parseArgs(process.argv.slice(2));

async function main() {
  const categories = await readCategories();
  const targets = filterCategories(categories, options.slug);

  let skipped = 0;
  let fetched = 0;

  for (const category of targets) {
    const outputPath = path.join(OUTPUT_DIR, `${category.slug}.json`);

    if (options.resume && !options.dryRun) {
      try {
        await fs.access(outputPath);
        console.log(`⏭ Skipping ${category.slug} (already fetched)`);
        skipped += 1;
        continue;
      } catch {
        // File doesn't exist — proceed with fetch
      }
    }

    const payload = await fetchCategory(category);
    if (options.dryRun) {
      console.log(JSON.stringify(payload, null, 2).slice(0, 800));
      console.log('...\n');
    } else {
      await savePayload(category.slug, payload);
      fetched += 1;
    }
  }

  console.log(`Completed. Fetched: ${fetched}, skipped (already done): ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
