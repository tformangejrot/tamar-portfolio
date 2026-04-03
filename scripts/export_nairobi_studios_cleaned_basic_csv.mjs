#!/usr/bin/env node

/**
 * Export name, address (location), website from nairobi_studios_cleaned.json to CSV.
 *
 *   node scripts/export_nairobi_studios_cleaned_basic_csv.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT = path.join(ROOT, 'data/processed/nairobi_studios_cleaned.json');
const OUTPUT = path.join(ROOT, 'data/processed/nairobi_studios_cleaned_names_addresses.csv');

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values) {
  return values.map(csvCell).join(',');
}

async function main() {
  const raw = await fs.readFile(INPUT, 'utf8');
  const studios = JSON.parse(raw);
  if (!Array.isArray(studios)) throw new Error('Expected array');

  const headers = ['name', 'address', 'website'];
  const lines = [
    row(headers),
    ...studios.map((s) => row([s.name, s.location, s.website])),
  ];

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${studios.length} rows to ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
