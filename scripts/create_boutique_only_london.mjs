#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_london.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');

function isBoutique(studio) {
  const cats = studio.categories || [];
  if (cats.length === 0) return true; // Keep studios with no categories (edge case)
  
  // Check if all categories are ONLY "fitness" and/or "gym-time"
  const onlyFitnessGymtime = cats.every(cat => 
    cat.toLowerCase() === 'fitness' || 
    cat.toLowerCase() === 'gym-time' ||
    cat.toLowerCase() === 'gymtime'
  );
  
  // Exclude if it only has fitness/gym-time
  return !onlyFitnessGymtime;
}

async function main() {
  console.log('Loading consolidated London data...\n');
  const allStudios = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  console.log(`Total London studios: ${allStudios.length}`);
  
  // Filter to boutique studios only
  const boutiqueStudios = allStudios.filter(isBoutique);
  const excluded = allStudios.length - boutiqueStudios.length;
  
  console.log(`Boutique studios: ${boutiqueStudios.length}`);
  console.log(`Excluded (fitness/gym-time only): ${excluded}\n`);
  
  // Save boutique-only file
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(boutiqueStudios, null, 2));
  
  console.log(`✓ Saved boutique London studios to ${OUTPUT_PATH}\n`);
  
  // Summary statistics
  const withOpeningDates = boutiqueStudios.filter(s => s.estimated_opening_date);
  const withLocationDates = boutiqueStudios.filter(s => 
    s.opening_date_source === 'location_specific' || 
    s.opening_date_source?.includes('wayback') || 
    s.opening_date_source?.includes('user_provided')
  );
  const withWhoisDates = boutiqueStudios.filter(s => s.opening_date_source === 'whois_domain_creation');
  const withBorough = boutiqueStudios.filter(s => s.borough);
  const withPostcode = boutiqueStudios.filter(s => s.postcode);
  
  console.log('Boutique London Studios Summary:');
  console.log(`- Total studios: ${boutiqueStudios.length}`);
  console.log(`- With opening dates: ${withOpeningDates.length} (${(withOpeningDates.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
  console.log(`  - Location-specific dates: ${withLocationDates.length}`);
  console.log(`  - WHOIS domain dates: ${withWhoisDates.length}`);
  console.log(`- With borough: ${withBorough.length} (${(withBorough.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
  console.log(`- With postcode: ${withPostcode.length} (${(withPostcode.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
  console.log(`- Average categories per studio: ${(boutiqueStudios.reduce((sum, s) => sum + (s.category_count || 0), 0) / boutiqueStudios.length).toFixed(1)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
