#!/usr/bin/env node

/**
 * Export consolidated Nairobi studios JSON to CSV (client / Sheets).
 *
 * Reads: data/processed/nairobi_studios_consolidated.json
 * Writes: data/processed/nairobi_studios_consolidated.csv (default)
 *
 * Usage:
 *   node scripts/export_nairobi_studios_csv.mjs
 *   node scripts/export_nairobi_studios_csv.mjs --input path/to.json --output path/to.csv
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_INPUT = path.join(ROOT, 'data/processed/nairobi_studios_consolidated.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data/processed/nairobi_studios_consolidated.csv');

function parseArgs(argv) {
  const opts = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      opts.input = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--input=')) {
      opts.input = path.resolve(arg.split('=').slice(1).join('='));
    } else if (arg === '--output' && argv[i + 1]) {
      opts.output = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      opts.output = path.resolve(arg.split('=').slice(1).join('='));
    }
  }
  return opts;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(values) {
  return values.map(csvCell).join(',');
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(input, 'utf8');
  const studios = JSON.parse(raw);

  if (!Array.isArray(studios)) {
    throw new Error('Expected consolidated file to be a JSON array');
  }

  const headers = [
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
    'categories',
    'raw_modalities',
    'types',
  ];

  const lines = [
    row(headers),
    ...studios.map((s) =>
      row([
        s.name,
        s.place_id,
        s.location,
        s.neighborhood,
        s.lat,
        s.lng,
        s.website,
        s.google_maps_url,
        s.rating,
        s.rating_count,
        Array.isArray(s.categories) ? s.categories.join('; ') : '',
        Array.isArray(s.raw_modalities) ? s.raw_modalities.join('; ') : '',
        Array.isArray(s.types) ? s.types.join('; ') : '',
      ]),
    ),
  ];

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, lines.join('\n'), 'utf8');
  console.log(`Wrote ${studios.length} rows to ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
