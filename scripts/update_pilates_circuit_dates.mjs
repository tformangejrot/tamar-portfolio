#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');

// Mapping of location identifiers to opening dates
const openingDates = {
  'pilates-circuit-fulham-london': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2023)' },
  'pilates-circuit--wimbledon-london': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
  'pilates-circuit-new-wandsworth-location-london': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2020)' },
  'pilates-circuit-kensington-london': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2023)' },
};

// For locations that might need address matching
const addressMatches = {
  '4 Fulham High St': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2023)' },
  '20-22 Worple Road': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
  '20-22 Worple Rd': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
  '61 Armoury Way': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2020)' },
  '25 Mossop Street': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2023)' },
  '25 Mossop St': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2023)' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/^Pilates Circuit$/i.test(studio.name)) return;
    
    // Extract location identifier from detail_url
    const url = studio.detail_url || '';
    let locationKey = null;
    let dateInfo = null;
    
    // First try to match location identifiers from URL
    for (const key of Object.keys(openingDates)) {
      if (url.includes(key)) {
        locationKey = key;
        dateInfo = openingDates[key];
        break;
      }
    }
    
    // If no URL match, try matching by address
    if (!dateInfo) {
      const location = studio.location || '';
      const matchedAddress = studio.matched_address || '';
      for (const [addressKey, info] of Object.entries(addressMatches)) {
        if (location.includes(addressKey) || matchedAddress.includes(addressKey)) {
          dateInfo = info;
          locationKey = addressKey;
          break;
        }
      }
    }
    
    if (dateInfo) {
      studio.estimated_opening_date = dateInfo.date;
      studio.opening_date_source = dateInfo.source;
      studio.opening_date_notes = dateInfo.notes;
      updated++;
      console.log(`✓ Updated ${studio.name} - ${locationKey}: ${dateInfo.date}`);
      console.log(`  Location: ${studio.location}`);
    }
  });
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} Pilates Circuit locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
