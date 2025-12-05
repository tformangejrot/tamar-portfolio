#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const WHOIS_DATA_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const ENRICHMENT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

// Opening dates from user based on Google reviews / knowledge
const openingDates = {
  '68 Rue Jean-Jacques Rousseau, Paris': {
    date: '2018-01-01',
    source: 'user_provided_google_reviews',
    notes: 'Opened in 2018 (year-level estimate)',
  },
  '11 Rue Edmond Valentin, Paris': {
    date: '2017-01-01',
    source: 'user_provided_google_reviews',
    notes: 'Opened in 2017 (year-level estimate)',
  },
  '55 Rue Decamps, Paris': {
    date: '2025-06-01',
    source: 'user_provided_google_reviews',
    notes: 'Opened June 2025',
  },
  '162 Rue d\'Aguesseau, Boulogne-Billancourt': {
    date: '2021-01-01',
    source: 'user_provided_google_reviews',
    notes: 'Opened in 2021 (year-level estimate)',
  },
  '9 rue Magellan, Paris': {
    date: '2022-01-01',
    source: 'user_provided_google_reviews',
    notes: 'Opened in 2022 (year-level estimate)',
  },
  '69 Rue Eugène Freyssinet, Paris': {
    date: '2024-01-01',
    source: 'user_provided_google_reviews',
    notes: 'Opened in 2024 (year-level estimate)',
  },
  '68 Rue des Martyrs, Paris': {
    date: '2023-11-01',
    source: 'user_provided_google_reviews',
    notes: 'Opened late 2023 (estimated)',
  },
  '2 Rue Gounod, Paris': {
    date: '2020-08-31',
    source: 'user_provided_google_reviews',
    notes: 'Reopened August 31, 2020',
  },
};

async function main() {
  // Load data
  const studiosRaw = await fs.readFile(WHOIS_DATA_PATH, 'utf8');
  const studios = JSON.parse(studiosRaw);
  const yuj = studios.filter((s) => /yuj/i.test(s.name));
  console.log(`Found ${yuj.length} YUJ locations`);

  // Load existing enrichment file
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(ENRICHMENT_PATH, 'utf8'));
  } catch {
    // File may not exist yet
  }

  // Remove any existing YUJ entries
  const filtered = existing.filter((e) => !/yuj/i.test(e.name || ''));

  // Enrich YUJ locations
  const enriched = yuj.map((studio) => {
    const info = openingDates[studio.location];
    return {
      ...studio,
      estimated_opening_date: info?.date || null,
      opening_date_source: info?.source || null,
      opening_date_notes: info?.notes || null,
      enriched_at: new Date().toISOString(),
    };
  });

  const merged = [...filtered, ...enriched];
  await fs.writeFile(ENRICHMENT_PATH, JSON.stringify(merged, null, 2));

  console.log(`\n✓ Added ${enriched.length} YUJ locations to enrichment file`);
  console.log(`✓ Total locations in file: ${merged.length}`);

  const withDates = enriched.filter((e) => e.estimated_opening_date);
  console.log('\nSummary:');
  console.log(`- YUJ locations enriched: ${enriched.length}`);
  console.log(`- With estimated opening dates: ${withDates.length}`);
  console.log(`- Without dates: ${enriched.length - withDates.length}`);

  console.log('\nLocations with dates:');
  withDates
    .sort((a, b) => a.estimated_opening_date.localeCompare(b.estimated_opening_date))
    .forEach((e) => {
      console.log(`  ${e.estimated_opening_date}: ${e.location}`);
    });

  console.log('\nLocations needing dates:');
  enriched
    .filter((e) => !e.estimated_opening_date)
    .forEach((e) => {
      console.log(`  - ${e.location}`);
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

