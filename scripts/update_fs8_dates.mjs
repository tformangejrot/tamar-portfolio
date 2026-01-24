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
  'fs8-finsbury-park-london-kexk': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening 2025' },
  'fs8-stratford-london-saym': { date: '2025-07-15', source: 'user_provided', notes: 'Estimated opening July 2025' },
  'fs8-high-street-kensington-london': { date: '2025-03-15', source: 'user_provided', notes: 'Estimated opening March 2025' },
  'fs8-chiswick-london-oxos': { date: '2025-06-15', source: 'user_provided', notes: 'Estimated opening June 2025' },
  'fs8--oxford-circus-london': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'fs8--blackhorse-lane-london': { date: '2025-03-15', source: 'user_provided', notes: 'Estimated opening March 2025' },
  'fs8--hoxton-london': { date: '2025-02-15', source: 'user_provided', notes: 'Estimated opening February 2025' },
};

// For locations that might need address matching
const addressMatches = {
  'First Floor, 1-7 Morris Place': { date: '2025-01-15', source: 'user_provided', notes: 'Estimated opening 2025' },
  'Unit 1 Canalside HereEast': { date: '2025-07-15', source: 'user_provided', notes: 'Estimated opening July 2025' },
  '65 Kensington Church Street': { date: '2025-03-15', source: 'user_provided', notes: 'Estimated opening March 2025' },
  '111 Power Road': { date: '2025-06-15', source: 'user_provided', notes: 'Estimated opening June 2025' },
  '23-35 Great Titchfield St': { date: '2023-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2023)' },
  'Unit 4 Blackhorse Mills': { date: '2025-03-15', source: 'user_provided', notes: 'Estimated opening March 2025' },
  'Unit 1,12 Hoxton Market': { date: '2025-02-15', source: 'user_provided', notes: 'Estimated opening February 2025' },
  'Unit 1, 12 Hoxton Market': { date: '2025-02-15', source: 'user_provided', notes: 'Estimated opening February 2025' },
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  
  data.forEach(studio => {
    if (!/fs8/i.test(studio.name)) return;
    
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
  
  console.log(`\n✓ Updated ${updated} FS8 locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
