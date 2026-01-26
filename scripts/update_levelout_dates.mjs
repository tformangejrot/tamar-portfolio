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
  'levelout-brixton-london': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2023)' },
  'levelout--blackheath-london': { date: '2025-08-15', source: 'user_provided', notes: 'Estimated opening August 2025' },
  'levelout-de-beauvoir-london-avcc': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
  'levelout--wandsworth-london': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2024)' },
  'levelout-st-pauls-london': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
};

// For locations that might need address matching
const addressMatches = {
  '10-12 Tunstall Rd': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2023)' },
  '20 Brigade Street': { date: '2025-08-15', source: 'user_provided', notes: 'Estimated opening August 2025' },
  '20 Brigade St': { date: '2025-08-15', source: 'user_provided', notes: 'Estimated opening August 2025' },
  '28-36 Orsman Road': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
  '28-36 Orsman Rd': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
  '3 All Saints Passage': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from Google reviews (2024)' },
  '25 Cannon Street': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
  '25 Cannon St': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening January 2025' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/^LevelOut$/i.test(studio.name)) return;
    
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
  
  console.log(`\n✓ Updated ${updated} LevelOut locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
