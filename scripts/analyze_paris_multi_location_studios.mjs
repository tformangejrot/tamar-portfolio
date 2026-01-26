#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');

async function main() {
  console.log('Loading Paris boutique data...\n');
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  
  // Count occurrences of each studio name
  const nameCounts = {};
  const studioGroups = {};
  
  studios.forEach(studio => {
    const name = studio.name || 'Unknown';
    if (!nameCounts[name]) {
      nameCounts[name] = 0;
      studioGroups[name] = [];
    }
    nameCounts[name]++;
    studioGroups[name].push(studio);
  });
  
  // Filter for studios with 3+ locations
  const multiLocationStudios = Object.entries(nameCounts)
    .filter(([name, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]); // Sort by count descending
  
  console.log(`Studios with 3+ locations: ${multiLocationStudios.length}\n`);
  console.log('='.repeat(80));
  console.log('ANALYSIS: Opening Date Quality for Multi-Location Studios\n');
  console.log('='.repeat(80));
  
  multiLocationStudios.forEach(([name, count]) => {
    const locations = studioGroups[name];
    
    // Analyze opening dates
    const datesBySource = {};
    const uniqueDates = new Set();
    const datesWithSource = [];
    
    locations.forEach(loc => {
      const date = loc.estimated_opening_date;
      const source = loc.opening_date_source || 'unknown';
      const notes = loc.opening_date_notes || '';
      
      if (date) {
        uniqueDates.add(date);
        datesWithSource.push({ date, source, notes, location: loc.location });
        
        if (!datesBySource[source]) {
          datesBySource[source] = [];
        }
        datesBySource[source].push(date);
      }
    });
    
    // Check if all locations have the same date (likely domain creation date issue)
    const allSameDate = uniqueDates.size === 1 && locations.length > 1;
    const allWhoisDates = Object.keys(datesBySource).every(src => 
      src === 'whois_domain_creation' || src === 'unknown'
    ) && Object.keys(datesBySource).length > 0;
    
    console.log(`\n${name} (${count} locations)`);
    console.log('-'.repeat(80));
    
    if (allSameDate && allWhoisDates) {
      console.log('⚠️  WARNING: All locations share the same WHOIS domain creation date');
      console.log(`   Date: ${Array.from(uniqueDates)[0]}`);
      console.log('   This likely reflects brand domain registration, not individual location openings');
    } else if (allSameDate) {
      console.log('⚠️  WARNING: All locations share the same opening date');
      console.log(`   Date: ${Array.from(uniqueDates)[0]}`);
    } else if (allWhoisDates && uniqueDates.size <= 2) {
      console.log('⚠️  CAUTION: Most/all dates are from WHOIS, may need location-specific updates');
    } else {
      console.log('✓ Dates appear to be location-specific');
    }
    
    console.log(`\n   Unique dates: ${uniqueDates.size}`);
    console.log(`   Date sources:`);
    Object.entries(datesBySource).forEach(([source, dates]) => {
      console.log(`     - ${source}: ${dates.length} location(s)`);
    });
    
    // Show first few locations as examples
    console.log(`\n   Sample locations:`);
    locations.slice(0, 3).forEach((loc, idx) => {
      const date = loc.estimated_opening_date || 'No date';
      const source = loc.opening_date_source || 'unknown';
      console.log(`     ${idx + 1}. ${loc.location || 'No location'}`);
      console.log(`        Date: ${date} (${source})`);
    });
    if (locations.length > 3) {
      console.log(`     ... and ${locations.length - 3} more`);
    }
  });
  
  // Summary statistics
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY STATISTICS\n');
  console.log('='.repeat(80));
  
  const needsUpdate = multiLocationStudios.filter(([name, count]) => {
    const locations = studioGroups[name];
    const uniqueDates = new Set();
    locations.forEach(loc => {
      if (loc.estimated_opening_date) {
        uniqueDates.add(loc.estimated_opening_date);
      }
    });
    const allSameDate = uniqueDates.size === 1 && locations.length > 1;
    const allWhois = locations.every(loc => 
      loc.opening_date_source === 'whois_domain_creation' || !loc.opening_date_source
    );
    return allSameDate && allWhois;
  });
  
  console.log(`Total multi-location studios (3+): ${multiLocationStudios.length}`);
  console.log(`Studios needing date updates: ${needsUpdate.length}`);
  console.log(`\nStudios that likely need updates:`);
  needsUpdate.forEach(([name, count]) => {
    console.log(`  - ${name} (${count} locations)`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
