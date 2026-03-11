#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const LONDON_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');
const PARIS_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const OUTPUT_DIR = path.join(ROOT, 'data/leads');

const TARGET_YEARS = [2024, 2025, 2026];

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

function adjustYearForDomainRegistration(year, month) {
  if (month >= 11) {
    return year + 1;
  }
  return year;
}

function getOpeningYear(studio) {
  const dateStr = studio.estimated_opening_date;
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    let year = date.getFullYear();
    if (year < 2000) return null;
    if (studio.opening_date_source === 'whois_domain_creation') {
      year = adjustYearForDomainRegistration(year, date.getMonth());
    }
    return year;
  } catch {
    return null;
  }
}

function escapeCsvField(value) {
  if (value == null || value === '') return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function studioToLeadsRow(studio, city, modalityStr) {
  return [
    escapeCsvField(studio.name),
    '', // owner/manager
    '', // contact email
    escapeCsvField(city),
    escapeCsvField(studio.website),
    escapeCsvField(modalityStr),
    escapeCsvField(studio.estimated_opening_date),
  ].join(',');
}

async function main() {
  console.log('Loading boutique data...\n');

  const [londonStudios, parisStudios, consolidation] = await Promise.all([
    fs.readFile(LONDON_PATH, 'utf8').then(JSON.parse),
    fs.readFile(PARIS_PATH, 'utf8').then(JSON.parse),
    fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8').then(JSON.parse),
  ]);

  const consolidationMap = consolidation.mapping;

  function filterAndMap(studios, city) {
    return studios
      .filter((studio) => {
        const year = getOpeningYear(studio);
        return year !== null && TARGET_YEARS.includes(year);
      })
      .map((studio) => {
        const modalities = consolidateCategories(studio, consolidationMap);
        const modalityStr = modalities.length > 0 ? modalities.join(', ') : '';
        return studioToLeadsRow(studio, city, modalityStr);
      });
  }

  const londonRows = filterAndMap(londonStudios, 'London');
  const parisRows = filterAndMap(parisStudios, 'Paris');

  const header =
    'business name,owner/manager,contact email,city,website,business type (modality),estimated_opening_date';

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const londonPath = path.join(OUTPUT_DIR, 'london_leads_2024_2026.csv');
  const parisPath = path.join(OUTPUT_DIR, 'paris_leads_2024_2026.csv');

  await Promise.all([
    fs.writeFile(londonPath, [header, ...londonRows].join('\n')),
    fs.writeFile(parisPath, [header, ...parisRows].join('\n')),
  ]);

  console.log(`✓ London: ${londonRows.length} leads → ${londonPath}`);
  console.log(`✓ Paris: ${parisRows.length} leads → ${parisPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
