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
  'twist-studios-peckham-london': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'twist-studios--camberwell-london': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  'twist-studios-camberwell--personal-training-london': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  'twist-studios--lewisham-london': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'twist-studios--lewisham---personal-training-london': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'twist-studios--forest-hill-london': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'twist-studios--forest-hill---personal-training-london': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'twist-studios--peckham---personal-training-london': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'twist-studios-beckenham--personal-training': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening 2025' },
  'twist-studios--beckenham': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening 2025' },
};

// For locations that might need address matching
const addressMatches = {
  '28 Station Passage': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'Station Passage': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  '344 Camberwell Station Road': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  '6 Thurston Road': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  '99a Dartmouth Road': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'The Club House, Beckenham Rugby Club': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening 2025' },
  'The Clubhouse, Balmoral Avenue': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening 2025' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/twist/i.test(studio.name)) return;
    
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
      for (const [addressKey, info] of Object.entries(addressMatches)) {
        if (location.includes(addressKey)) {
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
  
  console.log(`\n✓ Updated ${updated} Twist Studios locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
