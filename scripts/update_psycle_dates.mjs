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
// Based on user input: shoreditch-2018, bank-may2025, notting hill-2020, victoria-2024, clapham-2019
const openingDates = {
  // Shoreditch - likely 17-23 Whitby St (Tower Hamlets)
  'psycle-shoreditch': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  // Bank - likely 40 Coleman Street (City of London)
  'psycle-bank': { date: '2025-05-15', source: 'user_provided', notes: 'Estimated opening May 2025' },
  // Notting Hill - likely 37-41 Westbourne Grove (Westminster)
  'psycle-notting-hill': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  // Victoria - likely 27 Eccleston Place (Westminster)
  'psycle-victoria': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024)' },
  // Clapham - likely 82-84 Battersea Rise (Wandsworth)
  'psycle-clapham': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
};

// For locations that might need address matching
const addressMatches = {
  '17-23 Whitby St': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018) - Shoreditch' },
  '40 Coleman Street': { date: '2025-05-15', source: 'user_provided', notes: 'Estimated opening May 2025 - Bank' },
  '37-41 Westbourne Grove': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020) - Notting Hill' },
  '27 Eccleston Place': { date: '2024-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2024) - Victoria' },
  '82-84 Battersea Rise': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019) - Clapham' },
  '76 Mortimer Street': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018) - Shoreditch/Fitzrovia' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/psycle/i.test(studio.name)) return;
    
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
    } else {
      console.log(`⚠ No match found for: ${studio.name} - ${studio.location}`);
    }
  });
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} Psycle locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
