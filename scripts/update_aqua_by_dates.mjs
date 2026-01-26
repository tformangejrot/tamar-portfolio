#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');

// Mapping of location identifiers to opening dates
const openingDates = {
  'boulogne': { date: '2021-06-15', source: 'user_provided', notes: 'Opened June 2021' },
  'bastille': { date: '2019-07-09', source: 'user_provided', notes: 'Opened July 9, 2019' },
  'reaumur': { date: '2013-01-15', source: 'user_provided', notes: 'Opened 2013' },
  'réaumur': { date: '2013-01-15', source: 'user_provided', notes: 'Opened 2013' },
  'raumur': { date: '2013-01-15', source: 'user_provided', notes: 'Opened 2013' },
  'charonne': { date: '2017-09-21', source: 'user_provided', notes: 'Opened September 21, 2017' }
};

// Address matching patterns for more precise location identification
const addressMatches = {
  'boulogne': ['fief', 'boulogne', '92100'],
  'bastille': ['faubourg saint-antoine', 'bastille', '75011'],
  'reaumur': ['notre dame de nazareth', 'réaumur', 'reaumur', 'raumur', '75003'],
  'charonne': ['jules vallès', 'jules valles', 'charonne', '75011']
};

async function main() {
  console.log('Loading consolidated boutique Paris data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  const unmatched = [];
  
  data.forEach(studio => {
    if (!/^Aqua by$/i.test(studio.name)) return;
    
    // Extract location identifier from detail_url, location, and address
    const url = (studio.detail_url || '').toLowerCase();
    const location = (studio.location || '').toLowerCase();
    const address = (studio.matched_address || '').toLowerCase();
    const zipCode = (studio.zip_code || '').toLowerCase();
    let locationKey = null;
    
    // Try to match by address patterns first (most precise)
    for (const [key, patterns] of Object.entries(addressMatches)) {
      if (patterns.every(pattern => 
        address.includes(pattern) || 
        location.includes(pattern) || 
        zipCode.includes(pattern)
      )) {
        locationKey = key;
        break;
      }
    }
    
    // Fallback to URL matching
    if (!locationKey) {
      for (const key of Object.keys(openingDates)) {
        const keyVariants = [
          key,
          key.replace(/-/g, ''),
          key.replace(/-/g, ' '),
          key.replace(/é/g, 'e').replace(/è/g, 'e')
        ];
        
        for (const variant of keyVariants) {
          if (url.includes(variant)) {
            locationKey = key;
            break;
          }
        }
        if (locationKey) break;
      }
    }
    
    if (locationKey && openingDates[locationKey]) {
      const dateInfo = openingDates[locationKey];
      studio.estimated_opening_date = dateInfo.date;
      studio.opening_date_source = dateInfo.source;
      studio.opening_date_notes = dateInfo.notes;
      updated++;
      console.log(`✓ Updated ${studio.name} - ${locationKey}: ${dateInfo.date}`);
      console.log(`  Location: ${studio.location}`);
    } else {
      unmatched.push({
        name: studio.name,
        location: studio.location,
        address: studio.matched_address,
        url: studio.detail_url
      });
    }
  });
  
  if (unmatched.length > 0) {
    console.log('\n⚠ Unmatched Aqua by locations:');
    unmatched.forEach(s => {
      console.log(`  - ${s.name}: ${s.location}`);
      console.log(`    Address: ${s.address}`);
      console.log(`    URL: ${s.url}`);
    });
  }
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} Aqua by locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
