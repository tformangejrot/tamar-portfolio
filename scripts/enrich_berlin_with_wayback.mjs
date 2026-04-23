#!/usr/bin/env node

/**
 * Enrich Berlin studio data with earliest Wayback Machine (Internet Archive) capture dates.
 *
 * Targets studios that have a website but no valid opening date from WHOIS —
 * either because WHOIS returned no date, or because the date was a registry
 * placeholder (e.g. DENIC's 1986-11-05 for .de domains).
 *
 * Uses the public Wayback CDX API (no authentication required):
 *   https://web.archive.org/cdx/search/cdx?url={domain}&output=json&limit=1&fl=timestamp&filter=statuscode:200
 *
 * Reads from:
 *   data/processed/berlin_studios_whois.json  — to know which studios need enrichment
 *
 * Writes to:
 *   data/processed/berlin_studios_wayback.json — same shape as WHOIS output,
 *   but sourced from Wayback. The consolidation script merges both.
 *
 * Usage examples:
 *   node scripts/enrich_berlin_with_wayback.mjs
 *   node scripts/enrich_berlin_with_wayback.mjs --limit 25
 *   node scripts/enrich_berlin_with_wayback.mjs --offset 100 --limit 50
 *   node scripts/enrich_berlin_with_wayback.mjs --no-resume   # re-process everything
 *   node scripts/enrich_berlin_with_wayback.mjs --all         # include studios that already have WHOIS dates
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const WHOIS_PATH = path.join(ROOT, 'data/processed/berlin_studios_whois.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/berlin_studios_wayback.json');

// WHOIS dates before this year are treated as registry placeholders (e.g. DENIC 1986)
const WHOIS_MIN_VALID_YEAR = 1995;

// Wayback CDX API
const CDX_BASE = 'https://web.archive.org/cdx/search/cdx';

// Be polite to the Wayback API — it's a free public service
const REQUEST_DELAY_MS = 1000;

function parseArgs(argv) {
  const opts = { limit: Infinity, offset: 0, resume: true, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-resume') {
      opts.resume = false;
    } else if (arg === '--all') {
      opts.all = true;
    } else if (arg === '--limit') {
      opts.limit = Number(argv[++i]);
    } else if (arg.startsWith('--limit=')) {
      opts.limit = Number(arg.split('=')[1]);
    } else if (arg === '--offset') {
      opts.offset = Number(argv[++i]);
    } else if (arg.startsWith('--offset=')) {
      opts.offset = Number(arg.split('=')[1]);
    }
  }
  return opts;
}

const options = parseArgs(process.argv.slice(2));

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasValidWhoisDate(entry) {
  if (!entry.creation_date) return false;
  const year = new Date(entry.creation_date).getFullYear();
  return year >= WHOIS_MIN_VALID_YEAR;
}

async function loadWhoisData() {
  try {
    const raw = await fs.readFile(WHOIS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    console.error(`Could not read ${WHOIS_PATH}. Run enrich_berlin_with_whois.mjs first.`);
    process.exit(1);
  }
}

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const entry of parsed) {
      map.set(entry.place_id || entry.name, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function queryWayback(domain) {
  const url = new URL(CDX_BASE);
  url.searchParams.set('url', domain);
  url.searchParams.set('output', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('fl', 'timestamp,statuscode');
  url.searchParams.set('filter', 'statuscode:200');
  // Results are chronological by default (oldest first), so limit=1 gives earliest

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'tamar-portfolio-research-bot/1.0 (boutique fitness market research)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw new Error(`CDX API HTTP ${resp.status}`);
  }

  const data = await resp.json();

  // Response is an array of arrays; first row is the header, second is the first result
  if (!Array.isArray(data) || data.length < 2) {
    return null; // No captures found
  }

  const [header, firstRow] = data;
  const timestampIndex = header.indexOf('timestamp');
  if (timestampIndex === -1 || !firstRow[timestampIndex]) {
    return null;
  }

  // Wayback timestamp format: YYYYMMDDHHmmss
  const ts = firstRow[timestampIndex];
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

async function main() {
  console.log('Loading WHOIS data...');
  const whoisData = await loadWhoisData();
  console.log(`Found ${whoisData.length} studios in WHOIS file\n`);

  // Filter to studios that need Wayback enrichment
  const needsWayback = options.all
    ? whoisData.filter(s => s.domain)
    : whoisData.filter(s => s.domain && !hasValidWhoisDate(s));

  console.log(
    options.all
      ? `Running Wayback on all ${needsWayback.length} studios with domains`
      : `Studios needing Wayback (no valid WHOIS date): ${needsWayback.length}`
  );

  const existing = options.resume ? await loadExisting() : new Map();
  const results = options.resume ? Array.from(existing.values()) : [];
  const seenKeys = new Set(results.map((r) => r.place_id || r.name));

  const slice = needsWayback.slice(options.offset, options.offset + options.limit);
  console.log(`Processing ${slice.length} studios (offset ${options.offset}). Resume=${options.resume}\n`);

  for (const studio of slice) {
    const key = studio.place_id || studio.name;
    if (options.resume && seenKeys.has(key)) {
      continue;
    }

    await delay(REQUEST_DELAY_MS);

    try {
      const firstCapture = await queryWayback(studio.domain);

      results.push({
        name: studio.name,
        place_id: studio.place_id,
        location: studio.location,
        website: studio.website,
        domain: studio.domain,
        first_capture: firstCapture,
        missing_first_capture: !firstCapture,
        enriched_at: new Date().toISOString(),
      });

      if (firstCapture) {
        console.log(`✓ ${studio.name} (${studio.domain}) → first capture ${firstCapture.slice(0, 10)}`);
      } else {
        console.log(`– ${studio.name} (${studio.domain}) → no captures found`);
      }
    } catch (err) {
      results.push({
        name: studio.name,
        place_id: studio.place_id,
        location: studio.location,
        website: studio.website,
        domain: studio.domain,
        first_capture: null,
        error: err.message,
        enriched_at: new Date().toISOString(),
      });
      console.warn(`✗ ${studio.name}: ${err.message}`);
    }

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
    seenKeys.add(key);
  }

  const found = results.filter(r => r.first_capture).length;
  const notFound = results.filter(r => !r.first_capture && !r.error).length;
  const errored = results.filter(r => r.error).length;

  console.log(`\nWayback enrichment complete.`);
  console.log(`- First capture found: ${found}`);
  console.log(`- No captures found:   ${notFound}`);
  console.log(`- Errors:              ${errored}`);
  console.log(`- Total written to ${OUTPUT_PATH}: ${results.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
