#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');

function isBoutique(studio) {
  // Exclude specific brands
  if (/^Point Soleil$/i.test(studio.name)) return false;
  
  // Exclude Swedish Fit locations that are not actual studios (classes at schools/gyms)
  // Keep only these 3 actual studio locations:
  // - 11 Rue Jacques Ibert (Champerret) - 2024
  // - 5 Rue Bergère - 2016
  // - 57 Rue Carnot Boulogne - 2017
  if (/^Swedish Fit$/i.test(studio.name)) {
    const location = (studio.location || '').toLowerCase();
    const address = (studio.matched_address || '').toLowerCase();
    const url = (studio.detail_url || '').toLowerCase();
    const zipCode = (studio.zip_code || '').toLowerCase();
    const combined = `${location} ${address} ${url}`.toLowerCase();
    
    // Keep only these specific locations
    const keepChamperret = (
      location.includes('jacques ibert') && 
      address.includes('jacques ibert') && 
      zipCode.includes('75017')
    );
    
    const keepBergere = (
      (location.includes('bergère') || location.includes('bergere')) &&
      address.includes('bergère') &&
      zipCode.includes('75009')
    );
    
    const keepBoulogne = (
      (location.includes('carnot') || location.includes('boulogne')) &&
      address.includes('carnot') &&
      zipCode.includes('92100')
    );
    
    // Exclude if it's not one of the three valid studio locations
    if (!keepChamperret && !keepBergere && !keepBoulogne) return false;
  }
  
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
  console.log('Loading consolidated data...\n');
  const allStudios = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  console.log(`Total studios: ${allStudios.length}`);
  
  // Filter to boutique studios only
  const boutiqueStudios = allStudios.filter(isBoutique);
  const excluded = allStudios.length - boutiqueStudios.length;
  
  console.log(`Boutique studios: ${boutiqueStudios.length}`);
  console.log(`Excluded (fitness/gym-time only): ${excluded}\n`);
  
  // Save boutique-only file
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(boutiqueStudios, null, 2));
  
  console.log(`✓ Saved boutique studios to ${OUTPUT_PATH}\n`);
  
  // Summary statistics
  const withOpeningDates = boutiqueStudios.filter(s => s.estimated_opening_date);
  const withLocationDates = boutiqueStudios.filter(s => 
    s.opening_date_source === 'location_specific' || 
    s.opening_date_source?.includes('wayback') || 
    s.opening_date_source?.includes('user_provided')
  );
  const withWhoisDates = boutiqueStudios.filter(s => s.opening_date_source === 'whois_domain_creation');
  const withArrondissement = boutiqueStudios.filter(s => s.arrondissement);
  const withZipCode = boutiqueStudios.filter(s => s.zip_code);
  
  console.log('Boutique Studios Summary:');
  console.log(`- Total studios: ${boutiqueStudios.length}`);
  console.log(`- With opening dates: ${withOpeningDates.length} (${(withOpeningDates.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
  console.log(`  - Location-specific dates: ${withLocationDates.length}`);
  console.log(`  - WHOIS domain dates: ${withWhoisDates.length}`);
  console.log(`- With arrondissement: ${withArrondissement.length} (${(withArrondissement.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
  console.log(`- With zip code: ${withZipCode.length} (${(withZipCode.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
  console.log(`- Average categories per studio: ${(boutiqueStudios.reduce((sum, s) => sum + (s.category_count || 0), 0) / boutiqueStudios.length).toFixed(1)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

