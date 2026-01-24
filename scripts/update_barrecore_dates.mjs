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
  'barrecore-notting-hill-london': { date: '2015-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2015)' },
  'barrecore-chelsea-studio-london': { date: '2015-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2015)' },
  'barrecore-st-marys-axe-london': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'barrecore-wandsworth-london': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  'barrecore-camden-studio-london': { date: '2025-02-15', source: 'user_provided', notes: 'Estimated opening February 2025' },
  'barrecore-hampstead-studio-london': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
};

// For locations that might need address matching
const addressMatches = {
  '12 Chepstow Rd': { date: '2015-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2015)' },
  '372 King\'s Road': { date: '2015-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2015)' },
  '50 St Mary Axe': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  '501A Old York Rd': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  '57a Jamestown Road': { date: '2025-02-15', source: 'user_provided', notes: 'Estimated opening February 2025' },
  '7 Pond St': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/barrecore/i.test(studio.name)) return;
    
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
  
  console.log(`\n✓ Updated ${updated} Barrecore locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
