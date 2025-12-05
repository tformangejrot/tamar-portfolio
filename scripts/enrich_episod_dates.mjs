#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const WHOIS_DATA_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const ENRICHMENT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

// Opening dates from Google reviews (user provided)
const openingDates = {
  '226 Boulevard Voltaire, Paris': {
    date: '2019-05-01',
    source: 'user_provided_google_reviews',
    notes: 'May 2019 per Google review dates',
  },
  '7 Place de Clichy, Paris': {
    date: '2017-09-26',
    source: 'user_provided_google_reviews',
    notes: 'September 26, 2017 per Google review dates',
  },
  '115 Rue Réaumur, Paris': {
    date: '2017-11-01', // Late 2017 - using November as estimate
    source: 'user_provided_google_reviews',
    notes: 'Late 2017 per Google review (first review says 8 years ago)',
  },
  '14 Place Jacques Bonsergent, Paris': {
    date: '2018-09-03',
    source: 'user_provided_google_reviews',
    notes: 'September 3, 2018 per Google review dates',
  },
  '39 Avenue Trudaine, Paris': {
    date: '2025-09-22', // User said 22 septembre 2025 - using as provided
    source: 'user_provided_google_reviews',
    notes: 'September 22, 2025 per Google review dates',
  },
  '33 Rue Voltaire, Levallois-Perret': {
    date: '2023-08-01',
    source: 'user_provided_google_reviews',
    notes: 'August 2023 per Google review dates',
  },
};

async function main() {
  // Load data
  const studios = JSON.parse(await fs.readFile(WHOIS_DATA_PATH, 'utf8'));
  const episod = studios.filter(s => /episod/i.test(s.name));
  
  console.log(`Found ${episod.length} EPISOD locations\n`);

  // Load existing enrichment file
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(ENRICHMENT_PATH, 'utf8'));
  } catch {
    // File doesn't exist or is empty
  }
  
  // Remove any existing EPISOD entries
  const filtered = existing.filter(e => !/episod/i.test(e.name || ''));
  
  // Enrich EPISOD locations
  const enriched = episod.map(studio => {
    const locationKey = studio.location;
    const dateInfo = openingDates[locationKey];
    
    return {
      ...studio,
      estimated_opening_date: dateInfo?.date || null,
      opening_date_source: dateInfo?.source || null,
      opening_date_notes: dateInfo?.notes || null,
      enriched_at: new Date().toISOString(),
    };
  });
  
  // Merge with existing data
  const merged = [...filtered, ...enriched];
  
  // Save
  await fs.writeFile(ENRICHMENT_PATH, JSON.stringify(merged, null, 2));
  
  console.log(`✓ Added ${enriched.length} EPISOD locations to enrichment file`);
  console.log(`✓ Total locations in file: ${merged.length}\n`);
  
  // Summary
  const withDates = enriched.filter(e => e.estimated_opening_date);
  console.log('Summary:');
  console.log(`- EPISOD locations enriched: ${enriched.length}`);
  console.log(`- With estimated opening dates: ${withDates.length}`);
  console.log(`- Without dates: ${enriched.length - withDates.length}\n`);
  
  console.log('Locations with dates:');
  enriched
    .filter(e => e.estimated_opening_date)
    .sort((a, b) => a.estimated_opening_date.localeCompare(b.estimated_opening_date))
    .forEach(e => {
      console.log(`  ${e.estimated_opening_date}: ${e.location}`);
    });
  
  console.log('\nLocations needing dates:');
  enriched
    .filter(e => !e.estimated_opening_date)
    .forEach(e => {
      console.log(`  - ${e.location}`);
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

