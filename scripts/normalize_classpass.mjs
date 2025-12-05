#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data/raw/classpass');
const OUT_PATH = path.join(ROOT, 'data/processed/classpass_studios.json');

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

async function normalize() {
  const files = (await fs.readdir(RAW_DIR)).filter((file) => file.endsWith('.json'));
  const studios = new Map();

  for (const file of files) {
    const slug = file.replace('.json', '');
    const data = JSON.parse(await fs.readFile(path.join(RAW_DIR, file), 'utf8'));
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
  console.log(`✓ Normalized ${normalized.length} studios to ${OUT_PATH}`);
}

normalize().catch((err) => {
  console.error(err);
  process.exit(1);
});


