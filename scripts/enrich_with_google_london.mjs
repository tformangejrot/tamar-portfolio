#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_london.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_google_london.json');
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.error('Missing GOOGLE_MAPS_API_KEY environment variable.');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { limit: Infinity, offset: 0, resume: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-resume') {
      opts.resume = false;
    } else if (arg.startsWith('--limit=')) {
      opts.limit = Number(arg.split('=')[1]);
    } else if (arg === '--limit') {
      opts.limit = Number(argv[++i]);
    } else if (arg.startsWith('--offset=')) {
      opts.offset = Number(arg.split('=')[1]);
    } else if (arg === '--offset') {
      opts.offset = Number(argv[++i]);
    }
  }
  return opts;
}

const options = parseArgs(process.argv.slice(2));

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const entry of parsed) {
      map.set(entry.detail_url || entry.name, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(studio) {
  // Add "London" to the query to improve matching for UK addresses
  const parts = [studio.name, studio.location, 'London'].filter(Boolean);
  return parts.join(' ');
}

async function findPlace(query) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
  url.searchParams.set('input', query);
  url.searchParams.set('inputtype', 'textquery');
  url.searchParams.set('fields', 'place_id,name,formatted_address');
  url.searchParams.set('key', API_KEY);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`FindPlace HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK' || !data.candidates?.length) {
    throw new Error(`FindPlace status ${data.status}`);
  }
  return data.candidates[0];
}

async function fetchDetails(placeId) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'name,formatted_address,website,url');
  url.searchParams.set('key', API_KEY);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`PlaceDetails HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK') {
    throw new Error(`PlaceDetails status ${data.status}`);
  }
  return data.result;
}

async function enrichStudio(studio) {
  const query = buildQuery(studio);
  if (!query) throw new Error('Missing query fields');
  const place = await findPlace(query);
  await delay(150);
  const details = await fetchDetails(place.place_id);
  return {
    name: studio.name,
    detail_url: studio.detail_url,
    location: studio.location,
    place_id: place.place_id,
    matched_name: details.name,
    matched_address: details.formatted_address,
    website: details.website ?? null,
    google_maps_url: details.url ?? null,
    enriched_at: new Date().toISOString(),
  };
}

async function main() {
  const studios = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  const existing = options.resume ? await loadExisting() : new Map();
  const results = options.resume ? Array.from(existing.values()) : [];
  const seenKeys = new Set(results.map((r) => r.detail_url || r.name));

  const slice = studios.slice(options.offset, options.offset + options.limit);
  console.log(`Enriching ${slice.length} London studios (offset ${options.offset}). Resume=${options.resume}`);

  for (const studio of slice) {
    const key = studio.detail_url || studio.name;
    if (options.resume && seenKeys.has(key)) {
      continue;
    }
    await delay(300);
    try {
      const enriched = await enrichStudio(studio);
      results.push(enriched);
      seenKeys.add(key);
      console.log(`✓ ${studio.name}`);
    } catch (err) {
      results.push({
        name: studio.name,
        detail_url: studio.detail_url,
        location: studio.location,
        error: err.message,
        enriched_at: new Date().toISOString(),
      });
      console.warn(`✗ ${studio.name}: ${err.message}`);
    }
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
  }

  console.log(`Saved ${results.length} enriched London records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
