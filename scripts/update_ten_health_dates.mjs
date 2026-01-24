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
  'ten-health-and-fitness--kings-cross-london': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  'ten-health-and-fitness---wellness-kings-cross-london': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  'ten-health-fitness-notting-hill-london': { date: '2012-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2012)' },
  'ten-health-fitness-hatton-garden-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'ten-health-fitness-st-james-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'ten-health-and-fitness-nine-elms-london': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'ten-health-and-fitness-fitzrovia-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'ten-health-and-fitness-notting-hill-gate-london': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'ten-health-fitness-city-london': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'ten-health-fitness-chiswick-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
};

// For locations that might need address matching
const addressMatches = {
  '1 Lewis Cubitt Walk': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  '2-4 Exmoor St': { date: '2012-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2012)' },
  '38 Hatton Garden': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  '6 Duke Street St James': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  '6 New Union Square': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  '83 Great Titchfield St': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  '94 Notting Hill Gate': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  '119-121 Middlesex St': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'Barley Mow Passage': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/ten health/i.test(studio.name)) return;
    
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
  
  console.log(`\n✓ Updated ${updated} Ten Health & Fitness locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
