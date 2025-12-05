#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const WHOIS_DATA_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const ENRICHMENT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

// Opening dates from user
const openingDates = {
  '59 rue St. Didier, Paris': {
    date: '2025-06-01',
    source: 'user_provided',
    notes: 'Opened June 2025',
  },
  '14 Rue Duban, Paris': {
    date: '2024-04-01',
    source: 'user_provided',
    notes: 'Opened April 2024',
  },
  '66 bis Rue Saint Didier, Paris': {
    date: '2021-10-01',
    source: 'user_provided',
    notes: 'Opened October 2021',
  },
  '109 Rue de Rennes, Paris': {
    date: '2024-11-01',
    source: 'user_provided',
    notes: 'Opened November 2024',
  },
  '53 Rue Rodier, Paris': {
    date: '2020-01-01',
    source: 'user_provided',
    notes: 'Opened January 2020',
  },
  '122 Rue de Courcelles, Paris': {
    date: '2023-11-01',
    source: 'user_provided',
    notes: 'Opened November 2023',
  },
};

async function main() {
  // Load data
  const studios = JSON.parse(await fs.readFile(WHOIS_DATA_PATH, 'utf8'));
  const snake = studios.filter(s => 
    /snake\s*&\s*twist/i.test(s.name) || /snake and twist/i.test(s.name)
  );
  
  console.log(`Found ${snake.length} Snake & Twist locations\n`);

  // Load existing enrichment file
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(ENRICHMENT_PATH, 'utf8'));
  } catch {
    // File doesn't exist or is empty
  }
  
  // Remove any existing Snake & Twist entries
  const filtered = existing.filter(e => 
    !(/snake/i.test(e.name || '') && /twist/i.test(e.name || ''))
  );
  
  // Enrich Snake & Twist locations
  const enriched = snake.map(studio => {
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
  
  console.log(`✓ Added ${enriched.length} Snake & Twist locations to enrichment file`);
  console.log(`✓ Total locations in file: ${merged.length}\n`);
  
  // Summary
  const withDates = enriched.filter(e => e.estimated_opening_date);
  console.log('Summary:');
  console.log(`- Snake & Twist locations enriched: ${enriched.length}`);
  console.log(`- With estimated opening dates: ${withDates.length}`);
  console.log(`- Without dates: ${enriched.length - withDates.length}\n`);
  
  console.log('Locations with dates:');
  enriched
    .filter(e => e.estimated_opening_date)
    .sort((a, b) => a.estimated_opening_date.localeCompare(b.estimated_opening_date))
    .forEach(e => {
      console.log(`  ${e.estimated_opening_date}: ${e.location}`);
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

