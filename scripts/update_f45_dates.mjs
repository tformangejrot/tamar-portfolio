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
  'teddington': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'kensington-olympia-london-uspg': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'ashtead': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'wandsworth': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'south-wimbledon-london-konm': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'london-fields': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'high-street-kensington': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'kingston-kingston-upon-thames-wccy': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'blackwall': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'islington': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'brixton': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'peckham-rye': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'kensal-green': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'holloway': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'oxford-circus': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'haggerston': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'ealing-london-uacg': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'hampstead-heath': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'battersea-park': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'millharbour-canary-wharf': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  'liverpool-street-london-jyur': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'blackhorse-lane': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'camden-london-wfjt': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'dalston': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'mill-hill-london-wnwa': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'clapham-junction': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
};

// For locations with "unknown" script keys, match by address
const addressMatches = {
  '111 Power Road': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  '168-172 Old Street': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  '20 Totterdown Street': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  '3 St Marks Square': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  '31 Downham Rd': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  '32 Uxbridge Road': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  '32-34 Gordon House Rd': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  '336a Queenstown Rd': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  '35 Harbour Wy': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  '423 North End Road': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  '615-619 Watford Way': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  '64-66 Brighton Rd': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  '9-11 Streatham High Road': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'Blackhorse Mills': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'Centro 1, Plender St': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'First Floor 1-7 Morris Place': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'Leadenhall Market': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'Stamford Works': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'Unit 2 Canalside': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  // Note: West Works Building is closed - we'll skip updating this one
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/f45/i.test(studio.name)) return;
    
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
  
  console.log(`\n✓ Updated ${updated} F45 locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
