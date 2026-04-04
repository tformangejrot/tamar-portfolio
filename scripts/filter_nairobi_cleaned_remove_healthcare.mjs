#!/usr/bin/env node

/**
 * Remove hospitals, dental clinics, physio/medical facilities from nairobi_studios_cleaned.json
 * using Google Place types + name/location keyword heuristics.
 *
 * Writes:
 *   - data/processed/nairobi_studios_cleaned.json (overwritten, filtered)
 *   - data/processed/nairobi_studios_cleaned.csv (regenerated)
 *   - data/processed/nairobi_studios_cleaned_names_addresses.csv (regenerated)
 *   - data/processed/nairobi_studios_removed_healthcare.json (audit trail)
 *
 *   node scripts/filter_nairobi_cleaned_remove_healthcare.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CLEANED_JSON = path.join(ROOT, 'data/processed/nairobi_studios_cleaned.json');
const CLEANED_CSV = path.join(ROOT, 'data/processed/nairobi_studios_cleaned.csv');
const BASIC_CSV = path.join(ROOT, 'data/processed/nairobi_studios_cleaned_names_addresses.csv');
const REMOVED_JSON = path.join(ROOT, 'data/processed/nairobi_studios_removed_healthcare.json');

/** Google primary/secondary types that indicate healthcare, not fitness studios. */
const EXCLUDED_TYPES = new Set([
  'hospital',
  'dentist',
  'doctor',
  'physiotherapist',
  'pharmacy',
  'veterinary_care',
]);

/**
 * True if "hospital" appears in a medical-facility sense, not as a street name (Hospital Rd / Road).
 */
function hasHospitalFacility(blob) {
  let s = String(blob);
  // Strip common street-name uses so they do not trigger removal.
  s = s.replace(/\bhospital\s+(rd|road)\b/gi, '');
  return /\bhospital\b/i.test(s);
}

const NAME_LOCATION_PATTERNS = [
  /\bpharmacy\b/i,
  /\bdental\b/i,
  /\bdentist\b/i,
  /\bdentistry\b/i,
  /\bphysiotherapy\b/i,
  /\bphysiotherapist\b/i,
  /\bphysical therapy\b/i,
  /\bcardiolog/i,
  /\bcardiologist\b/i,
  /\bmedical centre\b/i,
  /\bmedical center\b/i,
  /\bmedical college\b/i,
  /\bemergency medical\b/i,
  /\baesthetic medicine\b/i,
  /\bchildren'?s hospital\b/i,
  /\bwomen'?s hospital\b/i,
  /\baga khan university hospital\b/i,
  /\bmission hospital\b/i,
  /\bnursing home\b/i,
  /\borthopaedic\b/i,
  /\borthopedic\b/i,
  /\bradiology\b/i,
  /\boncology\b/i,
  /\bpatholog/i,
  /\bmaternity hospital\b/i,
  /\bmaternity & nursing\b/i,
  /\bmaternity home\b/i,
  /\btraining institute\b.*\bmedical\b/i,
  /\bmedical training\b/i,
  /\bkmtc\b/i,
  /\bclinic\b/i, // clinics are usually medical; fitness rarely uses "clinic" alone
];

/** If name looks like "Dr. Firstname Lastname" (solo practice), drop. */
const SOLO_DOCTOR_NAME = /^dr\.?\s+[a-z]+(\s+[a-z]+)+\s*$/i;

function isHealthcareFacility(entry) {
  const types = Array.isArray(entry.types) ? entry.types.map((t) => String(t).toLowerCase()) : [];
  for (const t of types) {
    if (EXCLUDED_TYPES.has(t)) return { reason: `type:${t}` };
  }

  const blob = `${entry.name || ''} ${entry.location || ''}`.toLowerCase();

  if (hasHospitalFacility(blob)) {
    return { reason: 'pattern:hospital(facility)' };
  }

  for (const re of NAME_LOCATION_PATTERNS) {
    if (re.test(blob)) {
      return { reason: `pattern:${re.source}` };
    }
  }

  const nameOnly = String(entry.name || '').trim();
  if (SOLO_DOCTOR_NAME.test(nameOnly)) {
    return { reason: 'solo_doctor_name' };
  }

  return null;
}

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

function buildCsvForStudios(studios, headers) {
  const lines = [row(headers)];
  for (const s of studios) {
    lines.push(
      row(
        headers.map((h) => {
          const v = s[h];
          if (Array.isArray(v)) return v.join('; ');
          return v;
        }),
      ),
    );
  }
  return lines.join('\n');
}

async function main() {
  const raw = await fs.readFile(CLEANED_JSON, 'utf8');
  const studios = JSON.parse(raw);
  if (!Array.isArray(studios)) throw new Error('Expected array');

  const kept = [];
  const removed = [];

  for (const entry of studios) {
    const hit = isHealthcareFacility(entry);
    if (hit) {
      removed.push({
        ...entry,
        removed_reason: hit.reason,
        removed_at: new Date().toISOString(),
      });
    } else {
      kept.push(entry);
    }
  }

  await fs.writeFile(CLEANED_JSON, JSON.stringify(kept, null, 2));
  await fs.writeFile(REMOVED_JSON, JSON.stringify(removed, null, 2));

  await fs.writeFile(CLEANED_CSV, `${buildCsvForStudios(kept, CLEANED_HEADERS)}\n`, 'utf8');

  const basicHeaders = ['name', 'address', 'website'];
  const basicLines = [
    row(basicHeaders),
    ...kept.map((s) => row([s.name, s.location, s.website])),
  ];
  await fs.writeFile(BASIC_CSV, `${basicLines.join('\n')}\n`, 'utf8');

  console.log(`Before: ${studios.length}`);
  console.log(`Removed (healthcare / non-studio): ${removed.length}`);
  console.log(`After: ${kept.length}`);
  console.log(`Audit: ${REMOVED_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
