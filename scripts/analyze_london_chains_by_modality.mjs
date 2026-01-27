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
    // Find which consolidated category this belongs to
    for (const [consolidatedCat, subCats] of Object.entries(consolidationMap)) {
      if (subCats.includes(cat)) {
        consolidated.add(consolidatedCat);
        break;
      }
    }
  }
  
  return Array.from(consolidated);
}

async function main() {
  console.log('Loading London boutique data...\n');
  
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  const consolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  const consolidationMap = consolidation.mapping;
  
  console.log(`Processing ${studios.length} boutique studios\n`);
  
  // Group studios by chain (domain or name)
  const chainMap = new Map();
  studios.forEach(studio => {
    const key = studio.domain || studio.name?.toLowerCase().trim() || 'unknown';
    if (!chainMap.has(key)) {
      chainMap.set(key, {
        name: studio.name,
        domain: studio.domain,
        locations: []
      });
    }
    chainMap.get(key).locations.push(studio);
  });
  
  // Filter for chains with 3+ locations
  const chains3Plus = Array.from(chainMap.entries())
    .filter(([key, chain]) => chain.locations.length >= 3)
    .map(([key, chain]) => ({
      key,
      name: chain.name,
      domain: chain.domain,
      locationCount: chain.locations.length,
      locations: chain.locations
    }))
    .sort((a, b) => b.locationCount - a.locationCount);
  
  console.log(`Found ${chains3Plus.length} chains with 3+ locations\n`);
  
  // For each modality, collect chains and count studios
  const modalityChains = {};
  
  chains3Plus.forEach(chain => {
    // Get all modalities for this chain (union across all locations)
    const chainModalities = new Set();
    chain.locations.forEach(location => {
      const consolidatedCats = consolidateCategories(location, consolidationMap);
      consolidatedCats.forEach(cat => chainModalities.add(cat));
    });
    
    // Add this chain to each of its modalities
    chainModalities.forEach(modality => {
      if (!modalityChains[modality]) {
        modalityChains[modality] = {
          chains: [],
          totalStudios: 0
        };
      }
      modalityChains[modality].chains.push({
        name: chain.name,
        domain: chain.domain,
        locationCount: chain.locationCount
      });
      modalityChains[modality].totalStudios += chain.locationCount;
    });
  });
  
  // Sort modalities by total studios
  const sortedModalities = Object.entries(modalityChains)
    .map(([modality, data]) => ({
      modality,
      chainCount: data.chains.length,
      totalStudios: data.totalStudios,
      chains: data.chains.sort((a, b) => b.locationCount - a.locationCount)
    }))
    .sort((a, b) => b.totalStudios - a.totalStudios);
  
  // Print results
  console.log('='.repeat(80));
  console.log('CHAINS WITH 3+ LOCATIONS BY MODALITY');
  console.log('='.repeat(80));
  console.log();
  
  sortedModalities.forEach(({ modality, chainCount, totalStudios, chains }) => {
    const modalityLabel = modality.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(`${modalityLabel.toUpperCase()}`);
    console.log(`  Total Studios: ${totalStudios}`);
    console.log(`  Number of Chains: ${chainCount}`);
    console.log(`  Chains:`);
    chains.forEach(chain => {
      const displayName = chain.domain || chain.name;
      console.log(`    - ${displayName}: ${chain.locationCount} locations`);
    });
    console.log();
  });
  
  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total chains with 3+ locations: ${chains3Plus.length}`);
  console.log(`Total studio locations from these chains: ${chains3Plus.reduce((sum, c) => sum + c.locationCount, 0)}`);
  console.log(`Modalities represented: ${sortedModalities.length}`);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
