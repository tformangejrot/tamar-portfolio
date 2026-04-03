#!/usr/bin/env node

/**
 * Apply human keep/remove decisions for rows that had verification_status "needs_review".
 *
 * - "Keep" rows are merged into nairobi_studios_cleaned.* with verification_status approved.
 * - "Remove" rows are dropped from the deliverable and written to nairobi_studios_excluded_manual.*.
 * - nairobi_studios_needs_review.* is left with only remaining non-approved rows (typically "rejected").
 *
 * Usage:
 *   node scripts/apply_nairobi_needs_review_keep_remove.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CLEANED_JSON = path.join(ROOT, 'data/processed/nairobi_studios_cleaned.json');
const CLEANED_CSV = path.join(ROOT, 'data/processed/nairobi_studios_cleaned.csv');
const REVIEW_JSON = path.join(ROOT, 'data/processed/nairobi_studios_needs_review.json');
const REVIEW_CSV = path.join(ROOT, 'data/processed/nairobi_studios_needs_review.csv');
const EXCLUDED_JSON = path.join(ROOT, 'data/processed/nairobi_studios_excluded_manual.json');
const EXCLUDED_CSV = path.join(ROOT, 'data/processed/nairobi_studios_excluded_manual.csv');

/** place_id values approved by manual review (needs_review → cleaned). */
const KEEP_PLACE_IDS = new Set([
  'ChIJjZHmPecXLxgR7APoEyDpWvk', // Birds of Paradise
  'ChIJUbo6KUI_LxgRNu_nRZWF2dc', // The Mansion Dance Studio
  'ChIJSxOGHgsZLxgRwr2ozV7hjs4', // Fitpack
  'ChIJaX5HUlcVLxgR_qeDob1Lw-c', // WAZITO
  'ChIJF5C1ePYVLxgRH-kecp9zCAs', // One Tribe BJJ
  'ChIJjbQeFEIZLxgR7l3ncLNCYdo', // MyGym Fitness Ke
  'ChIJzWdk89UXLxgRr69RoRVbIKw', // Gigiri Social
  'ChIJWa-oRABBLxgRCdSHRfMEnz4', // The Nexus Fitness Gym
]);

const MANSION_PLACE_ID = 'ChIJUbo6KUI_LxgRNu_nRZWF2dc';
const MANSION_WEBSITE = 'https://instagram.com/the_mansion?igshid=YmMyMTA2M2Y=';

const CLEANED_HEADERS = [
  'name',
  'place_id',
  'location',
  'neighborhood',
  'lat',
  'lng',
  'website',
  'google_maps_url',
  'rating',
  'rating_count',
  'categories_google',
  'categories_verified',
  'categories_source',
  'verification_status',
  'verification_confidence',
  'types',
];

const REVIEW_HEADERS = [
  'name',
  'place_id',
  'location',
  'neighborhood',
  'lat',
  'lng',
  'website',
  'google_maps_url',
  'rating',
  'rating_count',
  'categories_google',
  'categories_verified',
  'categories_source',
  'verification_status',
  'verification_confidence',
  'types',
  'scan_errors',
];

const EXCLUDED_HEADERS = [
  'name',
  'place_id',
  'website',
  'verification_status_before',
  'manual_decision',
  'reason',
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return csvCell(JSON.stringify(value));
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values) {
  return values.map(csvCell).join(',');
}

function buildCsvForStudios(studios, headers) {
  const lines = [row(headers)];
  for (const s of studios) {
    lines.push(
      row(headers.map((h) => {
        const v = s[h];
        if (Array.isArray(v)) return v.join('; ');
        return v;
      })),
    );
  }
  return lines.join('\n');
}

function dedupeByKey(arr) {
  const map = new Map();
  for (const e of arr) {
    map.set(e.place_id || e.name, e);
  }
  return Array.from(map.values());
}

async function main() {
  const cleaned = JSON.parse(await fs.readFile(CLEANED_JSON, 'utf8'));
  const review = JSON.parse(await fs.readFile(REVIEW_JSON, 'utf8'));

  if (!Array.isArray(cleaned) || !Array.isArray(review)) {
    throw new Error('Expected JSON arrays');
  }

  const toAddCleaned = [];
  const excluded = [];

  for (const entry of review) {
    if (entry.verification_status !== 'needs_review') continue;

    const pid = entry.place_id;
    if (KEEP_PLACE_IDS.has(pid)) {
      const promoted = {
        ...entry,
        verification_status: 'approved',
        verification_confidence: 1,
        verification_notes: Array.isArray(entry.verification_notes)
          ? [...entry.verification_notes, 'manual_review_keep']
          : ['manual_review_keep'],
        manual_review_at: new Date().toISOString(),
      };
      if (pid === MANSION_PLACE_ID) {
        promoted.website = MANSION_WEBSITE;
      }
      toAddCleaned.push(promoted);
    } else {
      excluded.push({
        ...entry,
        verification_status_before: entry.verification_status,
        manual_decision: 'remove',
        reason: 'manual_review_remove',
        excluded_at: new Date().toISOString(),
      });
    }
  }

  const mergedCleaned = dedupeByKey([...cleaned, ...toAddCleaned]);

  const newReview = review.filter((e) => {
    if (e.verification_status !== 'needs_review') return true;
    return false;
  });

  await fs.writeFile(CLEANED_JSON, JSON.stringify(mergedCleaned, null, 2));
  await fs.writeFile(REVIEW_JSON, JSON.stringify(newReview, null, 2));
  await fs.writeFile(EXCLUDED_JSON, JSON.stringify(excluded, null, 2));

  await fs.writeFile(CLEANED_CSV, buildCsvForStudios(mergedCleaned, CLEANED_HEADERS), 'utf8');
  await fs.writeFile(REVIEW_CSV, buildCsvForStudios(newReview, REVIEW_HEADERS), 'utf8');

  const excludedRows = excluded.map((e) => ({
    name: e.name,
    place_id: e.place_id,
    website: e.website,
    verification_status_before: e.verification_status_before,
    manual_decision: e.manual_decision,
    reason: e.reason,
  }));
  await fs.writeFile(EXCLUDED_CSV, buildCsvForStudios(excludedRows, EXCLUDED_HEADERS), 'utf8');

  console.log(`Promoted to cleaned (manual keep): ${toAddCleaned.length}`);
  console.log(`Excluded from deliverable (manual remove): ${excluded.length}`);
  console.log(`Cleaned total: ${mergedCleaned.length}`);
  console.log(`Needs-review file rows remaining: ${newReview.length} (typically "rejected" only)`);
  console.log(`Wrote: ${EXCLUDED_JSON}`);
  console.log(`Wrote: ${EXCLUDED_CSV}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
