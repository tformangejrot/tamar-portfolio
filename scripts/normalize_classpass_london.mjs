#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data/raw/classpass');
const OUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_london.json');
const PARIS_CATEGORIES_PATH = path.join(ROOT, 'data/reference/classpass_categories.json');

function getKey(card) {
  if (card.detail_url) return card.detail_url;
  const name = (card.name || '').toLowerCase().trim();
  const location = (card.location || '').toLowerCase().trim();
  return `${name}|${location}`;
}

function mergeMetadata(existing, card) {
  if (!existing.name && card.name) existing.name = card.name;
  if (!existing.detail_url && card.detail_url) existing.detail_url = card.detail_url;
  if (!existing.location && card.location) existing.location = card.location;
  if (!existing.rating && card.rating) existing.rating = card.rating;
  if (!existing.rating_count && card.rating_count) existing.rating_count = card.rating_count;
  if (!existing.safety_badge && card.safety_badge) existing.safety_badge = card.safety_badge;
}

async function compareModalities(londonCategories, parisCategories) {
  const londonSet = new Set(londonCategories);
  const parisSet = new Set(parisCategories.map(c => c.slug));
  
  const onlyInLondon = Array.from(londonSet).filter(c => !parisSet.has(c)).sort();
  const onlyInParis = Array.from(parisSet).filter(c => !londonSet.has(c)).sort();
  
  console.log('\n=== Modality Comparison: London vs Paris ===\n');
  console.log(`Total unique categories in London: ${londonSet.size}`);
  console.log(`Total unique categories in Paris: ${parisSet.size}\n`);
  
  if (onlyInLondon.length > 0) {
    console.log(`Categories ONLY in London (${onlyInLondon.length}):`);
    onlyInLondon.forEach(cat => console.log(`  - ${cat}`));
    console.log('');
  } else {
    console.log('No categories unique to London.\n');
  }
  
  if (onlyInParis.length > 0) {
    console.log(`Categories ONLY in Paris (${onlyInParis.length}):`);
    onlyInParis.forEach(cat => console.log(`  - ${cat}`));
    console.log('');
  } else {
    console.log('No categories unique to Paris.\n');
  }
  
  const common = Array.from(londonSet).filter(c => parisSet.has(c)).sort();
  console.log(`Common categories (${common.length}): ${common.slice(0, 10).join(', ')}${common.length > 10 ? '...' : ''}\n`);
  
  return { onlyInLondon, onlyInParis, common };
}

async function normalize() {
  // Filter for London files (ending with -london.json)
  const allFiles = (await fs.readdir(RAW_DIR)).filter((file) => file.endsWith('.json'));
  const londonFiles = allFiles.filter((file) => file.endsWith('-london.json'));
  
  if (londonFiles.length === 0) {
    console.log('No London files found. Make sure to run the scraper with London categories first.');
    process.exit(1);
  }
  
  console.log(`Found ${londonFiles.length} London category files\n`);
  
  const studios = new Map();
  const londonCategorySlugs = new Set();

  for (const file of londonFiles) {
    const slug = file.replace('-london.json', '');
    const data = JSON.parse(await fs.readFile(path.join(RAW_DIR, file), 'utf8'));
    londonCategorySlugs.add(slug);
    
    for (const card of data.cards ?? []) {
      const key = getKey(card);
      if (!key) continue;
      if (!studios.has(key)) {
        studios.set(key, {
          name: card.name ?? null,
          detail_url: card.detail_url ?? null,
          location: card.location ?? null,
          rating: card.rating ?? null,
          rating_count: card.rating_count ?? null,
          safety_badge: Boolean(card.safety_badge),
          categories: new Set(),
          appearances: [],
        });
      }
      const entry = studios.get(key);
      entry.categories.add(card.category ?? slug);
      entry.appearances.push({
        category: card.category ?? slug,
        source_file: file,
      });
      entry.safety_badge = entry.safety_badge || Boolean(card.safety_badge);
      mergeMetadata(entry, card);
    }
  }

  const normalized = Array.from(studios.values()).map((studio) => ({
    name: studio.name,
    detail_url: studio.detail_url,
    location: studio.location,
    rating: studio.rating,
    rating_count: studio.rating_count,
    safety_badge: studio.safety_badge,
    categories: Array.from(studio.categories).sort(),
    category_count: studio.categories.size,
    appearances: studio.appearances,
  }));

  normalized.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  await fs.writeFile(OUT_PATH, JSON.stringify(normalized, null, 2));
  console.log(`✓ Normalized ${normalized.length} London studios to ${OUT_PATH}\n`);

  // Compare modalities with Paris
  try {
    const parisCategories = JSON.parse(await fs.readFile(PARIS_CATEGORIES_PATH, 'utf8'));
    await compareModalities(Array.from(londonCategorySlugs), parisCategories);
  } catch (err) {
    console.warn('Could not compare with Paris categories:', err.message);
  }
}

normalize().catch((err) => {
  console.error(err);
  process.exit(1);
});
