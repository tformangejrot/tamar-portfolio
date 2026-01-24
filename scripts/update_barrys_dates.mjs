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
  'barrys-canary-wharf-london': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'barrys-sw1-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'barrys-central-london': { date: '2015-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2015)' },
  'barrys-east-london': { date: '2016-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2016)' },
  'barrys-st-pauls-london': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'barrys-soho-london': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'barrys-west-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'barrys-belgravia-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'barrys-kings-cross-london': { date: '2015-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2015)' },
  'barrys-shoreditch-london': { date: '2016-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2016)' },
  'barrys-bank-london': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'barrys-bayswater-london': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
};

// For locations that might need address matching
const addressMatches = {
  '1 Crossrail Place Canary Wharf': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  '16 Eccleston Yards': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  '163 Euston Road': { date: '2015-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2015)' },
  '2 Worship Street': { date: '2016-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2016)' },
  '33 Gutter Ln': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  '59  Kingly Street': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  '9A Queensway': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/barry'?s/i.test(studio.name)) return;
    
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
  
  console.log(`\n✓ Updated ${updated} Barry's locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
