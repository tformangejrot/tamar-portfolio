#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const CHAIN_MIN = 3;

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

async function main() {
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  const consolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  const consolidationMap = consolidation.mapping;

  const chainMap = new Map();
  studios.forEach(studio => {
    const key = studio.domain || studio.name?.toLowerCase().trim() || 'unknown';
    if (!chainMap.has(key)) chainMap.set(key, []);
    chainMap.get(key).push(studio);
  });

  const chainStudios = new Set();
  chainMap.forEach((locations, key) => {
    if (locations.length >= CHAIN_MIN) {
      locations.forEach(studio => {
        const id = studio.detail_url || `${studio.name}|${studio.location}`;
        chainStudios.add(id);
      });
    }
  });

  const modalityStats = {};
  studios.forEach(studio => {
    const id = studio.detail_url || `${studio.name}|${studio.location}`;
    const isChain = chainStudios.has(id);
    const cats = consolidateCategories(studio, consolidationMap);
    cats.forEach(mod => {
      if (!modalityStats[mod]) modalityStats[mod] = { total: 0, chain: 0 };
      modalityStats[mod].total++;
      if (isChain) modalityStats[mod].chain++;
    });
  });

  const results = Object.entries(modalityStats)
    .map(([modality, s]) => ({
      modality,
      totalStudios: s.total,
      chainStudios: s.chain,
      chainPercentage: s.total ? +(100 * s.chain / s.total).toFixed(1) : 0,
      independentStudios: s.total - s.chain,
    }))
    .sort((a, b) => b.chainPercentage - a.chainPercentage);

  console.log('PARIS – chains defined as 3+ locations');
  console.log('Modality                          Total  Chain  Indep   %Chain');
  results.forEach(r => {
    const name = r.modality.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(
      `${name.padEnd(30)} ${String(r.totalStudios).padStart(5)} ${String(r.chainStudios).padStart(6)} ${String(r.independentStudios).padStart(7)} ${String(r.chainPercentage.toFixed(1)).padStart(7)}%`
    );
  });
}

main().catch(err => { console.error(err); process.exit(1); });
