#!/usr/bin/env node

/**
 * Fetch fitness studios in Nairobi using Google Places API Text Search.
 * 
 * Searches for each modality in nairobi_categories.json and saves results
 * to data/raw/google_places_nairobi/.
 * 
 * Requirements:
 *   - GOOGLE_MAPS_API_KEY environment variable
 * 
 * Usage examples:
 *   node scripts/fetch_google_places_nairobi.mjs
 *   node scripts/fetch_google_places_nairobi.mjs --slug pilates
 *   node scripts/fetch_google_places_nairobi.mjs --dry-run
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CATEGORY_PATH = path.join(ROOT, 'data/reference/nairobi_categories.json');
const OUTPUT_DIR = path.join(ROOT, 'data/raw/google_places_nairobi');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.error('Missing GOOGLE_MAPS_API_KEY environment variable.');
  process.exit(1);
}

const defaultOptions = {
  slug: null,
  dryRun: false,
};

function parseArgs(argv) {
  const opts = { ...defaultOptions };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
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
    throw new Error(`Slug "${slug}" not found in nairobi_categories.json`);
  }
  return [match];
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function textSearch(query, location = 'Nairobi, Kenya', nextPageToken = null) {
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
  url.searchParams.set('fields', 'name,formatted_address,website,url,rating,types,geometry');
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
  
  // Use the first search term as primary query
  const primaryQuery = search_terms[0] || `${label} Nairobi`;
  
  console.log(`→ Searching for ${slug} (${primaryQuery})`);
  
  let nextPageToken = null;
  let pageCount = 0;
  const maxPages = 10; // Limit to prevent infinite loops
  
  do {
    if (nextPageToken) {
      // Wait before fetching next page (required by Google API)
      await delay(2000);
    }
    
    const searchResult = await textSearch(primaryQuery, 'Nairobi, Kenya', nextPageToken);
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
  
  return {
    slug,
    label,
    fetched_at: new Date().toISOString(),
    query: primaryQuery,
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

  for (const category of targets) {
    const payload = await fetchCategory(category);
    if (options.dryRun) {
      console.log(JSON.stringify(payload, null, 2).slice(0, 800));
      console.log('...\n');
    } else {
      await savePayload(category.slug, payload);
    }
  }
  
  console.log(`Completed fetching ${targets.length} categor${targets.length === 1 ? 'y' : 'ies'}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
