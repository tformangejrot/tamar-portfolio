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
  'st-mary-axe': { date: '2015-01-15', source: 'user_provided', notes: 'First-ever 1Rebel launch in the City of London' },
  'broadgate': { date: '2015-12-01', source: 'user_provided', notes: 'Second studio; expanded soon after launch (late 2015/early 2016)' },
  'high-st-kensington': { date: '2016-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2016)' },
  'holborn': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'oxford-circus': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'bayswater': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'st-johns-wood': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'southbank': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'victoria': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'angel': { date: '2019-08-15', source: 'user_provided', notes: 'Reported as the sixth 1Rebel studio, opened August 2019' },
  'euston': { date: '2025-05-15', source: 'user_provided', notes: 'Announced opening May 2025' },
  'chelsea': { date: '2025-09-17', source: 'user_provided', notes: 'Officially opened 17 September 2025' }
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/1rebel/i.test(studio.name)) return;
    
    // Extract location identifier from detail_url
    const url = studio.detail_url || '';
    let locationKey = null;
    
    // Match location identifiers
    for (const key of Object.keys(openingDates)) {
      if (url.includes(key)) {
        locationKey = key;
        break;
      }
    }
    
    // Special case for St Mary Axe - need to check if it exists
    // For now, we'll update based on URL patterns
    
    if (locationKey && openingDates[locationKey]) {
      const dateInfo = openingDates[locationKey];
      studio.estimated_opening_date = dateInfo.date;
      studio.opening_date_source = dateInfo.source;
      studio.opening_date_notes = dateInfo.notes;
      updated++;
      console.log(`✓ Updated ${studio.name} - ${locationKey}: ${dateInfo.date}`);
    } else {
      console.log(`⚠ No match found for: ${studio.name} - ${url}`);
    }
  });
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} 1Rebel locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
