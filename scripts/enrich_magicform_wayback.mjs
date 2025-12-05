#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const WHOIS_DATA_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const ENRICHMENT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

async function checkWayback(url) {
  try {
    const urlObj = new URL(url);
    const query = `${urlObj.hostname}${urlObj.pathname}`;
    const apiUrl = `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(query)}&output=json&limit=1&sort=asc`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return { url, error: `HTTP ${response.status}`, archived: false };
    }
    const data = await response.json();
    if (data.length < 2) {
      return { url, earliest_archive: null, archived: false };
    }
    const earliest = data[1];
    const timestamp = earliest[1];
    const year = timestamp.substring(0, 4);
    const month = timestamp.substring(4, 6);
    const day = timestamp.substring(6, 8);
    const date = new Date(`${year}-${month}-${day}`);
    return {
      url,
      earliest_archive: date.toISOString().split('T')[0],
      timestamp,
      archived: true,
    };
  } catch (err) {
    return { url, error: err.message, archived: false };
  }
}

async function main() {
  const studiosRaw = await fs.readFile(WHOIS_DATA_PATH, 'utf8');
  const studios = JSON.parse(studiosRaw);
  const magicForm = studios.filter((s) => /magic form/i.test(s.name));
  console.log(`Found ${magicForm.length} Magic Form locations`);

  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(ENRICHMENT_PATH, 'utf8'));
  } catch {}

  const filtered = existing.filter((e) => !/magic form/i.test(e.name || ''));
  const enriched = [];

  for (const studio of magicForm) {
    if (!studio.website) {
      console.log(`⏭  Skipping ${studio.name} - ${studio.location} (no website)`);
      enriched.push({
        ...studio,
        estimated_opening_date: null,
        opening_date_source: null,
        opening_date_notes: 'No website URL to query Wayback',
        enriched_at: new Date().toISOString(),
      });
      continue;
    }

    console.log(`Checking: ${studio.name} - ${studio.location}`);
    console.log(`  URL: ${studio.website}`);
    const wb = await checkWayback(studio.website);

    enriched.push({
      ...studio,
      location_page_url: studio.website,
      estimated_opening_date: wb.earliest_archive || null,
      opening_date_source: wb.earliest_archive ? 'wayback_machine_earliest_archive' : null,
      opening_date_notes: wb.error || null,
      enriched_at: new Date().toISOString(),
    });

    if (wb.earliest_archive) {
      console.log(`  ✓ First archived: ${wb.earliest_archive}`);
    } else if (wb.archived === false) {
      console.log('  ✗ Not archived');
    } else {
      console.log(`  ✗ Error: ${wb.error}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  const merged = [...filtered, ...enriched];
  await fs.writeFile(ENRICHMENT_PATH, JSON.stringify(merged, null, 2));

  console.log(`\n✓ Added ${enriched.length} Magic Form locations to enrichment file`);
  console.log(`✓ Total locations in file: ${merged.length}`);

  const withDates = enriched.filter((e) => e.estimated_opening_date);
  console.log('\nSummary:');
  console.log(`- Magic Form locations enriched: ${enriched.length}`);
  console.log(`- With estimated opening dates: ${withDates.length}`);
  console.log(`- Without dates: ${enriched.length - withDates.length}`);

  if (withDates.length) {
    console.log('\nLocations with dates:');
    withDates
      .sort((a, b) => a.estimated_opening_date.localeCompare(b.estimated_opening_date))
      .forEach((e) => console.log(`  ${e.estimated_opening_date}: ${e.location}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
