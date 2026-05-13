#!/usr/bin/env node

/**
 * Merge reclassified website-derived categories back into the boutique file.
 *
 * For each studio that was successfully reclassified:
 *   - If website categories were found: replace categories with those
 *   - If fetch failed or no categories found: keep original Google Places categories
 *
 * The original Google Places categories are preserved in a
 * `google_places_categories` field for reference / rollback.
 *
 * Reads:
 *   data/processed/berlin_studios_consolidated_boutique.json
 *   data/processed/berlin_categories_reclassified.json
 *
 * Writes:
 *   data/processed/berlin_studios_consolidated_boutique.json  (updated in place)
 *
 * Usage:
 *   node scripts/apply_reclassified_categories.mjs
 *   node scripts/apply_reclassified_categories.mjs --dry-run   (print stats only)
 *
 * After this, re-run:
 *   node scripts/compute_berlin_aggregates.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const BOUTIQUE_PATH      = path.join(ROOT, 'data/processed/berlin_studios_consolidated_boutique.json');
const RECLASSIFIED_PATH  = path.join(ROOT, 'data/processed/berlin_categories_reclassified.json');

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  console.log('Loading boutique studios...');
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));

  console.log('Loading reclassified categories...');
  const reclassified = JSON.parse(await fs.readFile(RECLASSIFIED_PATH, 'utf8'));

  // Build lookup by place_id
  const reclassMap = new Map();
  for (const entry of reclassified) {
    if (entry.place_id) reclassMap.set(entry.place_id, entry);
  }

  let replaced = 0, keptOriginal = 0, notInReclassified = 0;

  const updated = studios.map(studio => {
    const entry = reclassMap.get(studio.place_id);

    if (!entry) {
      notInReclassified++;
      return studio; // not yet reclassified — keep as-is
    }

    // Save the original Google Places categories if not already saved
    const googleCats = studio.google_places_categories ?? studio.categories ?? [];

    if (entry.status === 'ok' && entry.website_categories.length > 0) {
      // Good reclassification — use website-derived categories
      replaced++;
      return {
        ...studio,
        categories: entry.website_categories,
        category_count: entry.website_categories.length,
        google_places_categories: googleCats,
        category_source: 'website_keywords',
      };
    } else {
      // Fetch failed or no categories detected — keep original
      keptOriginal++;
      return {
        ...studio,
        google_places_categories: googleCats,
        category_source: entry.status === 'fetch_error'
          ? 'google_places_search (fetch error)'
          : 'google_places_search (no keywords matched)',
      };
    }
  });

  const total = studios.length;
  console.log(`\nMerge summary:`);
  console.log(`- Studios in boutique file:       ${total}`);
  console.log(`- In reclassified file:           ${reclassMap.size}`);
  console.log(`- Categories replaced (website):  ${replaced}`);
  console.log(`- Kept original (no match/error): ${keptOriginal}`);
  console.log(`- Not yet reclassified:           ${notInReclassified}`);

  // Show a sample diff
  const diffs = updated.filter(s => {
    const orig = studios.find(o => o.place_id === s.place_id);
    return orig && JSON.stringify(orig.categories) !== JSON.stringify(s.categories);
  }).slice(0, 10);

  if (diffs.length > 0) {
    console.log('\nSample category changes:');
    diffs.forEach(s => {
      const orig = studios.find(o => o.place_id === s.place_id);
      console.log(`  ${s.name}`);
      console.log(`    before: ${(orig.categories || []).join(', ')}`);
      console.log(`    after:  ${s.categories.join(', ')}`);
    });
  }

  if (dryRun) {
    console.log('\n[dry-run] No files written.');
    return;
  }

  await fs.writeFile(BOUTIQUE_PATH, JSON.stringify(updated, null, 2));
  console.log(`\n✓ Saved updated boutique file to ${BOUTIQUE_PATH}`);
  console.log('Next step: node scripts/compute_berlin_aggregates.mjs');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
