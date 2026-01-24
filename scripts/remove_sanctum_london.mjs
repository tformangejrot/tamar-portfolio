#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');

async function main() {
  console.log('Loading boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  console.log(`Total studios before removal: ${data.length}`);
  
  // Filter out Sanctum studios
  const filtered = data.filter(studio => {
    const name = studio.name || '';
    return !/sanctum/i.test(name);
  });
  
  const removed = data.length - filtered.length;
  
  console.log(`Removed Sanctum studios: ${removed}`);
  console.log(`Remaining studios: ${filtered.length}\n`);
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(filtered, null, 2));
  
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
