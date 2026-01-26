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
  
  // Filter for studios with 4 or 5 locations
  const multiLocationStudios = Object.entries(nameCounts)
    .filter(([name, count]) => count >= 4 && count <= 5)
    .sort((a, b) => b[1] - a[1]); // Sort by count descending
  
  console.log(`Studios with 4 or 5 locations:\n`);
  
  multiLocationStudios.forEach(([name, count]) => {
    console.log(`${name}: ${count} locations`);
    studioGroups[name].forEach((studio, idx) => {
      const location = studio.location || 'No location';
      const borough = studio.borough || 'No borough';
      const detailUrl = studio.detail_url || '';
      const urlKey = detailUrl.split('/').pop() || '';
      console.log(`  ${idx + 1}. ${location} (${borough}) - ${urlKey}`);
    });
    console.log('');
  });
  
  console.log(`\nTotal studios with 4-5 locations: ${multiLocationStudios.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
