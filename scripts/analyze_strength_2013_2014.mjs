#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');

function consolidateCategories(studio, consolidationMap) {
  const consolidated = new Set();
  const studioCategories = studio.categories || [];
  
  for (const cat of studioCategories) {
    for (const [consolidatedCat, subCats] of Object.entries(consolidationMap)) {
      if (subCats.includes(cat)) {
        consolidated.add(consolidatedCat);
        break;
      }
    }
  }
  
  return Array.from(consolidated);
}

function adjustYearForDomainRegistration(year, month) {
  if (month >= 11) {
    return year + 1;
  }
  return year;
}

async function main() {
  console.log('Analyzing 2013-2014 spike in Strength Training studios...\n');
  
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  const consolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  const consolidationMap = consolidation.mapping;
  
  const studios2013 = [];
  const studios2014 = [];
  
  studios.forEach(studio => {
    if (!studio.estimated_opening_date) return;
    
    const date = new Date(studio.estimated_opening_date);
    if (isNaN(date.getTime())) return;
    
    let year = date.getFullYear();
    if (year < 2000) return;
    
    // Adjust for Nov/Dec domain registrations
    if (studio.opening_date_source === 'whois_domain_creation') {
      year = adjustYearForDomainRegistration(year, date.getMonth());
    }
    
    if (year === 2013 || year === 2014) {
      const consolidatedCats = consolidateCategories(studio, consolidationMap);
      
      // Check for strength training
      if (consolidatedCats.includes('strength-training')) {
        const studioInfo = {
          name: studio.name,
          location: studio.location,
          opening_date: studio.estimated_opening_date,
          opening_date_source: studio.opening_date_source,
          opening_date_notes: studio.opening_date_notes,
          website: studio.website,
          domain: studio.domain,
          categories: studio.categories,
          consolidated_categories: consolidatedCats
        };
        
        if (year === 2013) {
          studios2013.push(studioInfo);
        } else {
          studios2014.push(studioInfo);
        }
      }
    }
  });
  
  console.log(`Found ${studios2013.length} studios that opened in 2013 and offer Strength Training:\n`);
  
  // Group by brand name
  const byBrand2013 = {};
  studios2013.forEach(studio => {
    const brand = studio.name || 'Unknown';
    if (!byBrand2013[brand]) {
      byBrand2013[brand] = [];
    }
    byBrand2013[brand].push(studio);
  });
  
  const sortedBrands2013 = Object.entries(byBrand2013).sort((a, b) => b[1].length - a[1].length);
  
  sortedBrands2013.forEach(([brand, locations]) => {
    console.log(`${brand}: ${locations.length} location(s)`);
    locations.forEach((loc, idx) => {
      console.log(`  ${idx + 1}. ${loc.location}`);
      console.log(`     Opening date: ${loc.opening_date} (${loc.opening_date_source || 'unknown source'})`);
      if (loc.opening_date_notes) {
        console.log(`     Notes: ${loc.opening_date_notes}`);
      }
    });
    console.log('');
  });
  
  // Check opening date sources for 2013
  const bySource2013 = {};
  studios2013.forEach(studio => {
    const source = studio.opening_date_source || 'unknown';
    bySource2013[source] = (bySource2013[source] || 0) + 1;
  });
  
  console.log('2013 Opening date sources:');
  Object.entries(bySource2013).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`);
  });
  
  console.log(`\n\nFound ${studios2014.length} studios that opened in 2014 and offer Strength Training:\n`);
  
  // Group by brand name
  const byBrand2014 = {};
  studios2014.forEach(studio => {
    const brand = studio.name || 'Unknown';
    if (!byBrand2014[brand]) {
      byBrand2014[brand] = [];
    }
    byBrand2014[brand].push(studio);
  });
  
  const sortedBrands2014 = Object.entries(byBrand2014).sort((a, b) => b[1].length - a[1].length);
  
  sortedBrands2014.forEach(([brand, locations]) => {
    console.log(`${brand}: ${locations.length} location(s)`);
    locations.forEach((loc, idx) => {
      console.log(`  ${idx + 1}. ${loc.location}`);
      console.log(`     Opening date: ${loc.opening_date} (${loc.opening_date_source || 'unknown source'})`);
      if (loc.opening_date_notes) {
        console.log(`     Notes: ${loc.opening_date_notes}`);
      }
    });
    console.log('');
  });
  
  // Check opening date sources for 2014
  const bySource2014 = {};
  studios2014.forEach(studio => {
    const source = studio.opening_date_source || 'unknown';
    bySource2014[source] = (bySource2014[source] || 0) + 1;
  });
  
  console.log('2014 Opening date sources:');
  Object.entries(bySource2014).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
