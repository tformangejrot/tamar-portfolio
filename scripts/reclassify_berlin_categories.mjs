#!/usr/bin/env node

/**
 * Reclassify Berlin studio categories using Jina AI Reader.
 *
 * For each studio with a website, fetches page content via r.jina.ai
 * (free, no API key required) and applies keyword matching to determine
 * which fitness modalities the studio actually offers — replacing the noisy
 * Google Places search-derived categories.
 *
 * Reads:  data/processed/berlin_studios_consolidated_boutique.json
 * Writes: data/processed/berlin_categories_reclassified.json
 *         (one entry per studio; resumable — skips already-processed)
 *
 * Usage:
 *   node scripts/reclassify_berlin_categories.mjs
 *   node scripts/reclassify_berlin_categories.mjs --limit 50
 *   node scripts/reclassify_berlin_categories.mjs --offset 200 --limit 50
 *   node scripts/reclassify_berlin_categories.mjs --no-resume
 *
 * Runtime (no API key): ~4s/request → ~90 min for full 1,356 studios
 * Set JINA_API_KEY env var for a higher rate limit.
 *
 * After this completes, run:
 *   node scripts/apply_reclassified_categories.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/berlin_studios_consolidated_boutique.json');
const OUTPUT_PATH   = path.join(ROOT, 'data/processed/berlin_categories_reclassified.json');

// Polite delay between requests (ms). 4s ≈ 15 req/min, well within free tier.
// Lower this if you have a Jina API key (set JINA_API_KEY).
const REQUEST_DELAY_MS = process.env.JINA_API_KEY ? 1000 : 4000;

// ─── Keyword map ──────────────────────────────────────────────────────────────
// Maps canonical category → list of keywords to search for in page text.
// Keywords are matched case-insensitively as substrings.
// Design principle: prefer specific compound terms over single ambiguous words
// to reduce false positives (e.g. "krafttraining" not just "training").
const CATEGORY_KEYWORDS = {
  // ── Very high confidence (unambiguous) ──────────────────────────────────────
  pilates: [
    'pilates',
  ],
  'reformer-pilates': [
    'reformer', 'lagree',
  ],
  yoga: [
    'yoga', 'vinyasa', 'ashtanga', 'iyengar', 'kundalini',
    'yin yoga', 'hot yoga', 'hatha', 'yoga nidra', 'jivamukti',
  ],
  barre: [
    'barre',
  ],
  'electrical-muscle-stimulation': [
    'ems training', 'ems-training', 'ems studio', 'ems workout',
    'elektromuskelstimulation', 'electrical muscle stimulation',
    'elektrostimulation', 'elektromuskel',
  ],
  aerial: [
    'aerial', 'aerial silk', 'aerial arts', 'aerial yoga',
    'trapeze', 'pole dance', 'poledance', 'pole fitness',
    'luftakrobatik', 'seilakrobatik', 'hoop', 'lyra',
  ],
  trampoline: [
    'trampolin', 'trampoline', 'jumping fitness', 'jumping®', 'jumping class',
  ],
  'mind-body': [
    'qi gong', 'qigong', 'tai chi', 'taichi', 'tai-chi', 'taijiquan',
  ],

  // ── High confidence ──────────────────────────────────────────────────────────
  boxing: [
    'boxen', 'boxing', 'boxtraining', 'box training',
    'kickboxen', 'kickboxing', 'heavy bag', 'sandsack',
    'shadowboxing', 'shadow boxing',
  ],
  cycling: [
    'spinning', 'spin class', 'spin kurs', 'indoor cycling',
    'indoor bike', 'rpm class', 'cycle class', 'spin studio',
  ],
  dance: [
    // Use compound forms to avoid matching "tanz" in studio names alone
    'tanzstudio', 'tanzschule', 'tanzkurs', 'tanzunterricht', 'tanzklasse',
    'dance studio', 'dance school', 'dance class', 'dance course',
    'ballett', 'ballet class',
    'hip-hop dance', 'hip hop dance',
    'contemporary dance', 'zeitgenössischer tanz',
    'modern dance', 'moderntanz',
    'latin dance', 'latintanz',
    'salsa', 'tango', 'zumba', 'dancehall', 'streetdance',
    'jazz dance', 'jazztanz', 'flamenco', 'bachata', 'lindy hop',
    'pole dance', // also aerial, but dance aspect
    'capoeira',
  ],

  // ── Medium-high confidence ───────────────────────────────────────────────────
  'martial-arts': [
    'martial arts', 'kampfsport', 'kampfkunst',
    'karate', 'judo', 'jiu-jitsu', 'jiu jitsu', 'bjj', 'brazilian jiu',
    'taekwondo', 'muay thai', 'muay-thai', 'krav maga',
    'mma', 'mixed martial arts', 'kung fu', 'aikido', 'wing chun',
    'escrima', 'systema', 'ninjutsu', 'hapkido',
  ],
  'strength-training': [
    'krafttraining', 'kraft training', 'weightlifting', 'gewichtheben',
    'strength training', 'crossfit', 'trx suspension', 'trx training',
    'functional training', 'functional fitness',
    'circuit training', 'zirkeltraining',
  ],
  'hiit-bootcamp': [
    'hiit', 'high intensity interval', 'hochintensitäts',
    'bootcamp', 'boot camp',
  ],

  // ── Lower confidence (specific compound terms only) ──────────────────────────
  stretching: [
    'mobility training', 'mobilitätstraining',
    'dehnen und', 'dehnübungen', 'flexibility training',
    'stretching class', 'stretching kurs', 'stretching workshop',
  ],
  running: [
    'lauftraining', 'laufgruppe', 'laufkurs', 'laufcoaching',
    'running club', 'running group', 'running training',
    'marathon training', 'trail running',
  ],
  'prenatal-postnatal': [
    'schwangerschaftsyoga', 'schwangerschaftsfitness', 'schwangerschaftssport',
    'prenatal yoga', 'postnatal yoga', 'postnatal fitness',
    'rückbildungsyoga', 'rückbildungsgymnastik', 'rückbildung',
    'mama baby', 'mutter kind kurs', 'mama kurs', 'postpartum fitness',
  ],
  outdoors: [
    'outdoor training', 'outdoor fitness', 'outdoor workout',
    'park training', 'park fitness', 'calisthenics',
    'außentraining', 'freilufttraining',
  ],
  'low-impact-training': [
    'low impact', 'low-impact', 'gelenkschonend',
    'sanftes training', 'rehabilitation training', 'reha training',
    'schonend', 'gentle fitness',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { limit: Infinity, offset: 0, resume: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-resume')       opts.resume = false;
    else if (arg === '--limit')      opts.limit  = Number(argv[++i]);
    else if (arg.startsWith('--limit='))  opts.limit  = Number(arg.split('=')[1]);
    else if (arg === '--offset')     opts.offset = Number(argv[++i]);
    else if (arg.startsWith('--offset=')) opts.offset = Number(arg.split('=')[1]);
  }
  return opts;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const entry of parsed) {
      if (entry.place_id) map.set(entry.place_id, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchJina(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const headers = {
    'Accept': 'text/plain',
    'User-Agent': 'tamar-portfolio-research-bot/1.0 (boutique fitness market research)',
  };
  if (process.env.JINA_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
  }

  const resp = await fetch(jinaUrl, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

function matchCategories(text) {
  const lower = text.toLowerCase();
  const matched = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = keywords.filter(kw => lower.includes(kw.toLowerCase()));
    if (hits.length > 0) {
      matched[category] = hits;
    }
  }

  return matched;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const options = parseArgs(process.argv.slice(2));

async function main() {
  console.log('Loading boutique studios...');
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  const withWebsite = studios.filter(s => s.website);
  console.log(`Total studios: ${studios.length} | With website: ${withWebsite.length}\n`);

  const existing = options.resume ? await loadExisting() : new Map();
  const results = options.resume ? Array.from(existing.values()) : [];

  const toProcess = withWebsite.slice(options.offset, options.offset + options.limit);
  console.log(`Processing ${toProcess.length} studios (offset ${options.offset}) | Resume=${options.resume} | Delay=${REQUEST_DELAY_MS}ms\n`);

  let ok = 0, errors = 0, skipped = 0;

  for (const studio of toProcess) {
    if (options.resume && existing.has(studio.place_id)) {
      skipped++;
      continue;
    }

    await delay(REQUEST_DELAY_MS);

    const entry = {
      place_id: studio.place_id,
      name: studio.name,
      website: studio.website,
      original_categories: studio.categories || [],
      website_categories: [],
      matched_keywords: {},
      text_length: 0,
      text_preview: '',
      status: 'ok',
      fetched_at: new Date().toISOString(),
    };

    try {
      const text = await fetchJina(studio.website);

      if (!text || text.trim().length < 50) {
        entry.status = 'no_text';
        console.log(`– ${studio.name} → no usable text`);
      } else {
        const matched = matchCategories(text);
        entry.website_categories = Object.keys(matched);
        entry.matched_keywords = matched;
        entry.text_length = text.length;
        entry.text_preview = text.slice(0, 300).replace(/\s+/g, ' ').trim();

        const cats = entry.website_categories;
        if (cats.length === 0) {
          console.log(`? ${studio.name} → no categories detected (${text.length} chars)`);
        } else {
          console.log(`✓ ${studio.name} → ${cats.join(', ')}`);
        }
        ok++;
      }
    } catch (err) {
      entry.status = 'fetch_error';
      entry.error = err.message;
      console.warn(`✗ ${studio.name}: ${err.message}`);
      errors++;
    }

    results.push(entry);
    existing.set(studio.place_id, entry);

    // Write after every studio so progress is never lost
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
  }

  console.log(`\nDone. ok=${ok} errors=${errors} skipped=${skipped}`);
  console.log(`Results written to ${OUTPUT_PATH}`);
  console.log(`\nNext step: node scripts/apply_reclassified_categories.mjs`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
