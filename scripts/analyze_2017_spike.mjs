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

function getYearFromDate(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.getFullYear();
  } catch {
    return null;
  }
}

function adjustYearForDomainRegistration(year, month) {
  if (month >= 11) {
    return year + 1;
  }
  return year;
}

async function main() {
  console.log('Analyzing 2017 spike in Yoga + Pilates studios...\n');
  
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  const consolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  const consolidationMap = consolidation.mapping;
  
  const studios2017 = [];
  
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
    
    if (year === 2017) {
      const consolidatedCats = consolidateCategories(studio, consolidationMap);
      
      // Check for yoga + pilates combination
      if (consolidatedCats.includes('yoga') && consolidatedCats.includes('pilates')) {
        studios2017.push({
          name: studio.name,
          location: studio.location,
          opening_date: studio.estimated_opening_date,
          opening_date_source: studio.opening_date_source,
          opening_date_notes: studio.opening_date_notes,
          website: studio.website,
          domain: studio.domain,
          categories: studio.categories,
          consolidated_categories: consolidatedCats
        });
      }
    }
  });
  
  console.log(`Found ${studios2017.length} studios that opened in 2017 and offer both Yoga + Pilates:\n`);
  
  // Group by brand name
  const byBrand = {};
  studios2017.forEach(studio => {
    const brand = studio.name || 'Unknown';
    if (!byBrand[brand]) {
      byBrand[brand] = [];
    }
    byBrand[brand].push(studio);
  });
  
  // Sort by count
  const sortedBrands = Object.entries(byBrand).sort((a, b) => b[1].length - a[1].length);
  
  console.log('Breakdown by brand:\n');
  sortedBrands.forEach(([brand, locations]) => {
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
  
  // Check opening date sources
  const bySource = {};
  studios2017.forEach(studio => {
    const source = studio.opening_date_source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  });
  
  console.log('\nOpening date sources:');
  Object.entries(bySource).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
