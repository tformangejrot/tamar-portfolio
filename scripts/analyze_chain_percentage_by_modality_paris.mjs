#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');
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
  console.log('Loading Paris boutique data...\n');
  
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  const consolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  const consolidationMap = consolidation.mapping;
  
  console.log(`Processing ${studios.length} boutique studios\n`);
  
  // Group studios by chain (domain or name)
  const chainMap = new Map();
  studios.forEach(studio => {
    const key = studio.domain || studio.name?.toLowerCase().trim() || 'unknown';
    if (!chainMap.has(key)) {
      chainMap.set(key, []);
    }
    chainMap.get(key).push(studio);
  });
  
  // Identify which studios are part of chains (2+ locations)
  const chainStudios = new Set();
  chainMap.forEach((locations, key) => {
    if (locations.length >= 2) {
      locations.forEach(studio => {
        // Use a unique identifier for each studio
        const studioId = studio.detail_url || `${studio.name}|${studio.location}`;
        chainStudios.add(studioId);
      });
    }
  });
  
  // For each modality, count total studios and chain studios
  const modalityStats = {};
  
  studios.forEach(studio => {
    const studioId = studio.detail_url || `${studio.name}|${studio.location}`;
    const isChainStudio = chainStudios.has(studioId);
    const consolidatedCats = consolidateCategories(studio, consolidationMap);
    
    consolidatedCats.forEach(modality => {
      if (!modalityStats[modality]) {
        modalityStats[modality] = {
          totalStudios: 0,
          chainStudios: 0
        };
      }
      modalityStats[modality].totalStudios++;
      if (isChainStudio) {
        modalityStats[modality].chainStudios++;
      }
    });
  });
  
  // Calculate percentages and sort
  const results = Object.entries(modalityStats)
    .map(([modality, stats]) => ({
      modality,
      totalStudios: stats.totalStudios,
      chainStudios: stats.chainStudios,
      chainPercentage: stats.totalStudios > 0 
        ? (stats.chainStudios / stats.totalStudios * 100).toFixed(1)
        : '0.0',
      independentStudios: stats.totalStudios - stats.chainStudios
    }))
    .sort((a, b) => parseFloat(b.chainPercentage) - parseFloat(a.chainPercentage));
  
  // Print results
  console.log('='.repeat(80));
  console.log('CHAIN VS INDEPENDENT STUDIOS BY MODALITY - PARIS');
  console.log('(Chain = 2+ locations)');
  console.log('='.repeat(80));
  console.log();
  console.log(`${'Modality'.padEnd(30)} ${'Total'.padStart(8)} ${'Chain'.padStart(8)} ${'Independent'.padStart(12)} ${'% Chain'.padStart(10)}`);
  console.log('-'.repeat(80));
  
  results.forEach(({ modality, totalStudios, chainStudios, independentStudios, chainPercentage }) => {
    const modalityLabel = modality.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(
      `${modalityLabel.padEnd(30)} ${totalStudios.toString().padStart(8)} ${chainStudios.toString().padStart(8)} ${independentStudios.toString().padStart(12)} ${chainPercentage.padStart(9)}%`
    );
  });
  
  console.log();
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const totalStudios = studios.length;
  const totalChainStudios = chainStudios.size;
  const overallChainPercentage = (totalChainStudios / totalStudios * 100).toFixed(1);
  
  console.log(`Total boutique studios: ${totalStudios}`);
  console.log(`Studios in chains (2+ locations): ${totalChainStudios}`);
  console.log(`Overall chain percentage: ${overallChainPercentage}%`);
  console.log(`Independent studios: ${totalStudios - totalChainStudios}`);
  console.log();
  
  // Also output JSON for potential use
  const outputData = {
    overall: {
      totalStudios,
      chainStudios: totalChainStudios,
      chainPercentage: parseFloat(overallChainPercentage),
      independentStudios: totalStudios - totalChainStudios
    },
    byModality: results.map(r => ({
      modality: r.modality,
      totalStudios: r.totalStudios,
      chainStudios: r.chainStudios,
      chainPercentage: parseFloat(r.chainPercentage),
      independentStudios: r.independentStudios
    }))
  };
  
  const outputPath = path.join(ROOT, 'data/aggregates/paris/chain_percentage_by_modality.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`✓ Saved to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
