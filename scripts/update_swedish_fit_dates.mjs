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
  'bergere': { date: '2016-01-15', source: 'user_provided', notes: 'Opened 2016' },
  'rue bergère': { date: '2016-01-15', source: 'user_provided', notes: 'Opened 2016' },
  'champerret': { date: '2024-01-15', source: 'user_provided', notes: 'Opened 2024' },
  'jacques ibert': { date: '2024-01-15', source: 'user_provided', notes: 'Opened 2024' },
  'boulogne': { date: '2017-01-15', source: 'user_provided', notes: 'Opened 2017' },
  'carnot': { date: '2017-01-15', source: 'user_provided', notes: 'Opened 2017' }
};

// Address matching patterns for more precise location identification
const addressMatches = {
  'bergere': ['bergère', 'bergere', '75009'],
  'champerret': ['jacques ibert', 'champerret', '75017'],
  'boulogne': ['carnot', 'boulogne', '92100']
};

async function main() {
  console.log('Loading consolidated boutique Paris data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  const unmatched = [];
  
  data.forEach(studio => {
    if (!/^Swedish Fit$/i.test(studio.name)) return;
    
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
          if (url.includes(variant) || location.includes(variant) || address.includes(variant)) {
            locationKey = key;
            break;
          }
        }
        if (locationKey) break;
      }
    }
    
    // Map matched key to the correct date entry
    let finalKey = locationKey;
    if (locationKey === 'champerret' || locationKey === 'jacques ibert') {
      finalKey = 'champerret';
    } else if (locationKey === 'boulogne' || locationKey === 'carnot') {
      finalKey = 'boulogne';
    } else if (locationKey === 'bergere' || locationKey === 'rue bergère') {
      finalKey = 'bergere';
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
    console.log('\n⚠ Unmatched Swedish Fit locations (these should be excluded):');
    unmatched.forEach(s => {
      console.log(`  - ${s.name}: ${s.location}`);
      console.log(`    Address: ${s.address}`);
      console.log(`    URL: ${s.url}`);
    });
  }
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} Swedish Fit locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
