#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');

const STUDIOS_TO_EXTRACT = [
  'Apollo Sporting Club',
  'My Big Bang',
  'POSES',
  'Aqua by',
  'Punch Boxing'
];

async function main() {
  console.log('Loading Paris boutique data...\n');
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  
  STUDIOS_TO_EXTRACT.forEach(studioName => {
    const locations = studios.filter(s => s.name === studioName);
    
    if (locations.length === 0) {
      console.log(`\n${studioName}: Not found\n`);
      return;
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${studioName} (${locations.length} locations)`);
    console.log('='.repeat(80));
    
    locations.forEach((loc, idx) => {
      console.log(`\n${idx + 1}. ${loc.location || 'No location'}`);
      console.log(`   Arrondissement: ${loc.arrondissement || 'N/A'}`);
      console.log(`   Zip Code: ${loc.zip_code || 'N/A'}`);
      console.log(`   Matched Address: ${loc.matched_address || 'N/A'}`);
      console.log(`   Google Maps: ${loc.google_maps_url || 'N/A'}`);
      console.log(`   Script Key: ${(loc.detail_url || '').split('/').pop() || 'N/A'}`);
      console.log(`   Current Opening Date: ${loc.estimated_opening_date || 'None'} (${loc.opening_date_source || 'unknown'})`);
    });
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
