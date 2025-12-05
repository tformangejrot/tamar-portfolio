#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ENRICHMENT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

async function main() {
  const raw = await fs.readFile(ENRICHMENT_PATH, 'utf8');
  const data = JSON.parse(raw);

  let updatedCount = 0;

  const updated = data.map((entry) => {
    if (entry.location === '12 Rue Pierre Larousse, Paris') {
      updatedCount += 1;
      return {
        ...entry,
        estimated_opening_date: '2016-02-01',
        opening_date_source: 'user_provided',
        opening_date_notes: 'Magic Form Paris 14 opened February 1, 2016',
        enriched_at: new Date().toISOString(),
      };
    }
    if (entry.location === '12 Rue Rubens, Paris') {
      updatedCount += 1;
      return {
        ...entry,
        estimated_opening_date: null,
        opening_date_source: 'user_provided',
        opening_date_notes: 'Magic Form Paris 13 permanently closed',
        enriched_at: new Date().toISOString(),
      };
    }
    return entry;
  });

  await fs.writeFile(ENRICHMENT_PATH, JSON.stringify(updated, null, 2));

  console.log(`Updated ${updatedCount} Magic Form entries (Paris 14 + Paris 13 closed flag).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
