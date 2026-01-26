#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');

async function main() {
  console.log('Loading boutique London data...\n');
  const studios = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  // Find studios that only have fitness and/or gym-time categories
  const fitnessOnlyStudios = studios.filter(studio => {
    const cats = studio.categories || [];
    if (cats.length === 0) return false; // Skip studios with no categories
    
    // Check if all categories are ONLY "fitness" and/or "gym-time"
    const onlyFitnessGymtime = cats.every(cat => 
      cat.toLowerCase() === 'fitness' || 
      cat.toLowerCase() === 'gym-time' ||
      cat.toLowerCase() === 'gymtime'
    );
    
    return onlyFitnessGymtime;
  });
  
  if (fitnessOnlyStudios.length === 0) {
    console.log('✓ No studios found that only have fitness/gym-time categories.\n');
    console.log('All studios have been properly filtered.');
  } else {
    console.log(`Found ${fitnessOnlyStudios.length} studios that only have fitness/gym-time categories:\n`);
    
    // Group by name to see if there are chains
    const byName = {};
    fitnessOnlyStudios.forEach(studio => {
      const name = studio.name || 'Unknown';
      if (!byName[name]) {
        byName[name] = [];
      }
      byName[name].push(studio);
    });
    
    // Sort by count (chains first)
    const sorted = Object.entries(byName).sort((a, b) => b[1].length - a[1].length);
    
    sorted.forEach(([name, locations]) => {
      console.log(`${name} (${locations.length} location${locations.length > 1 ? 's' : ''}):`);
      locations.forEach((studio, idx) => {
        const location = studio.location || 'No location';
        const borough = studio.borough || 'No borough';
        const categories = studio.categories || [];
        console.log(`  ${idx + 1}. ${location} (${borough})`);
        console.log(`     Categories: ${categories.join(', ')}`);
      });
      console.log('');
    });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
