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
  'triyoga-ealing-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2018)' },
  'triyoga-camden-london': { date: '2000-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2000)' },
  'triyoga-chelsea-london': { date: '2012-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2012)' },
  'triyoga-shoreditch-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2018)' },
};

// For locations that might need address matching
const addressMatches = {
  'Longfield Ave': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2018)' },
  '57 Jamestown Rd': { date: '2000-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2000)' },
  '57a Jamestown Rd': { date: '2000-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2000)' },
  '372 King\'s Rd': { date: '2012-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2012)' },
  '10 Cygnet St': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2018)' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/^triyoga$/i.test(studio.name)) return;
    
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
  
  console.log(`\n✓ Updated ${updated} triyoga locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
