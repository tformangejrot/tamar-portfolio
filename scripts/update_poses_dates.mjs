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
  'marais': { date: '2021-01-15', source: 'user_provided', notes: 'Opened 2021' },
  'bonne-nouvelle': { date: '2024-01-15', source: 'user_provided', notes: 'Opened 2024' },
  'bonne nouvelle': { date: '2024-01-15', source: 'user_provided', notes: 'Opened 2024' },
  'saint-lazare': { date: '2025-04-15', source: 'user_provided', notes: 'Opens April 2025' },
  'monceau': { date: '2025-06-15', source: 'user_provided', notes: 'Opens June 2025' },
  'bastille': { date: '2023-08-15', source: 'user_provided', notes: 'Opened August 2023' },
  'voltaire': { date: '2025-11-15', source: 'user_provided', notes: 'Opens November 2025' }
};

// Address matching patterns for more precise location identification
const addressMatches = {
  'marais': ['filles du calvaire', 'marais', '75003'],
  'bonne-nouvelle': ['échiquier', 'echiquier', 'bonne nouvelle', '75010'],
  'saint-lazare': ['châteaudun', 'chateaudun', 'saint-lazare', 'saint lazare', '75009'],
  'monceau': ['monceau', '75008'],
  'bastille': ['faubourg saint-antoine', 'bastille', '75012'],
  'voltaire': ['popincourt', 'voltaire', '75011']
};

async function main() {
  console.log('Loading consolidated boutique Paris data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  const unmatched = [];
  
  data.forEach(studio => {
    if (!/^POSES$/i.test(studio.name)) return;
    
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
    
    // Map matched key to the correct date entry
    let finalKey = locationKey;
    if (locationKey === 'bonne-nouvelle' || locationKey === 'bonne nouvelle') {
      finalKey = 'bonne-nouvelle';
    }
    
    if (finalKey && openingDates[finalKey]) {
      const dateInfo = openingDates[finalKey];
      studio.estimated_opening_date = dateInfo.date;
      studio.opening_date_source = dateInfo.source;
      studio.opening_date_notes = dateInfo.notes;
      updated++;
      console.log(`✓ Updated ${studio.name} - ${finalKey}: ${dateInfo.date}`);
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
    console.log('\n⚠ Unmatched POSES locations:');
    unmatched.forEach(s => {
      console.log(`  - ${s.name}: ${s.location}`);
      console.log(`    Address: ${s.address}`);
      console.log(`    URL: ${s.url}`);
    });
  }
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} POSES locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
