#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_DATA_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');
const CONSOLIDATION_MAPPING_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_v2.json');

async function main() {
  console.log('Loading boutique data and consolidation mapping...');
  
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_DATA_PATH, 'utf8'));
  const mappingData = JSON.parse(await fs.readFile(CONSOLIDATION_MAPPING_PATH, 'utf8'));
  
  // Build reverse lookup: old category -> new consolidated category
  const categoryMap = {};
  Object.entries(mappingData.mapping).forEach(([newCat, oldCats]) => {
    oldCats.forEach(oldCat => {
      categoryMap[oldCat] = newCat;
    });
  });
  
  const excludeSet = new Set(mappingData.exclude);
  
  console.log(`Processing ${studios.length} studios...`);
  
  const consolidated = studios.map(studio => {
    const oldCategories = studio.categories || [];
    
    // Map each old category to new consolidated category, excluding filtered ones
    const newCategoriesSet = new Set();
    
    oldCategories.forEach(oldCat => {
      // Skip excluded categories
      if (excludeSet.has(oldCat)) {
        return;
      }
      
      // Map to consolidated category
      const newCat = categoryMap[oldCat];
      if (newCat) {
        newCategoriesSet.add(newCat);
      } else {
        // If no mapping found, keep original (shouldn't happen, but safe fallback)
        console.warn(`No mapping found for category: ${oldCat} (studio: ${studio.name})`);
        newCategoriesSet.add(oldCat);
      }
    });
    
    const newCategories = Array.from(newCategoriesSet).sort();
    
    return {
      ...studio,
      categories: newCategories,
      category_count: newCategories.length,
      // Keep original categories in a metadata field for reference
      original_categories: oldCategories,
    };
  });
  
  console.log(`Writing consolidated data to ${OUTPUT_PATH}...`);
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(consolidated, null, 2));
  
  // Show summary stats
  const categoryCounts = new Map();
  consolidated.forEach(studio => {
    studio.categories.forEach(cat => {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    });
  });
  
  console.log('\n✓ Consolidation complete!\n');
  console.log('New category distribution:');
  Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      const pct = ((count / consolidated.length) * 100).toFixed(1);
      console.log(`  ${cat.padEnd(30)} ${count.toString().padStart(4)} studios (${pct}%)`);
    });
  
  console.log(`\nTotal studios: ${consolidated.length}`);
  console.log(`Output file: ${OUTPUT_PATH}`);
}

main().catch(console.error);

