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
  'paris-17': { date: '2020-01-15', source: 'user_provided', notes: 'Opened 2020' },
  'paris-3': { date: '2021-10-15', source: 'user_provided', notes: 'Opened October 2021' },
  'courbevoie': { date: '2024-01-15', source: 'user_provided', notes: 'Opened 2024' },
  'paris-9': { date: '2023-11-15', source: 'user_provided', notes: 'Opened November 2023' },
  'paris-11': { date: '2015-01-15', source: 'user_provided', notes: 'Opened 2015' },
  'alfortville': { date: '2021-11-15', source: 'user_provided', notes: 'Now The Corner boxing club as of November 2021 - original Apollo opening date unknown' },
  'boulogne': { date: '2025-06-15', source: 'user_provided', notes: 'Opens June 2025' },
  'paris-19': { date: '2018-01-15', source: 'user_provided', notes: 'Opened 2018' }
};

// Address matching patterns for more precise location identification
const addressMatches = {
  'paris-17': ['villaret', 'joyeuse', '75017'],
  'paris-3': ['turbigo', '75003'],
  'courbevoie': ['clemenceau', 'courbevoie', '92400'],
  'paris-9': ['maubeuge', '75009'],
  'paris-11': ['lockroy', '75011'],
  'alfortville': ['vaillant', 'couturier', 'alfortville', '94140'],
  'boulogne': ['vieux pont', 'sèvres', 'boulogne', '92100'],
  'paris-19': ['quai du lot', '75019']
};

async function main() {
  console.log('Loading consolidated boutique Paris data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  const unmatched = [];
  
  data.forEach(studio => {
    if (!/^Apollo Sporting Club$/i.test(studio.name)) return;
    
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
          key.replace(/-/g, ' ')
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
    console.log('\n⚠ Unmatched Apollo Sporting Club locations:');
    unmatched.forEach(s => {
      console.log(`  - ${s.name}: ${s.location}`);
      console.log(`    Address: ${s.address}`);
      console.log(`    URL: ${s.url}`);
    });
  }
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} Apollo Sporting Club locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
