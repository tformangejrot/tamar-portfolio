#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const WHOIS_DATA_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const ENRICHMENT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

// Opening dates from user
// Need to map based on location or name patterns
const openingDates = {
  // Saint Lazare - need to identify by location
  'saint-lazare': {
    date: '2022-05-01',
    source: 'user_provided',
    notes: 'Le Temple Noble Art Saint Lazare opened May 2022',
  },
  // Paris 1 - need to identify by location
  'paris-1': {
    date: '2014-07-01',
    source: 'user_provided',
    notes: 'Le Temple Noble Art Paris 1 opened July 2014',
  },
  // Paris 11 - need to identify by location
  'paris-11': {
    date: '2019-07-01',
    source: 'user_provided',
    notes: 'Le Temple Noble Art Paris 11 opened July 2019',
  },
  // Paris 15 - need to identify by location
  'paris-15': {
    date: '2022-09-01',
    source: 'user_provided',
    notes: 'Le Temple Noble Art Paris 15 opened September 2022',
  },
  // Paris 17 - need to identify by location
  'paris-17': {
    date: '2017-01-01',
    source: 'user_provided',
    notes: 'Le Temple Noble Art Paris 17 opened in 2017',
  },
};

async function main() {
  // Load data
  const studios = JSON.parse(await fs.readFile(WHOIS_DATA_PATH, 'utf8'));
  const temple = studios.filter(s => 
    /temple noble art/i.test(s.name)
  );
  
  console.log(`Found ${temple.length} Le Temple Noble Art locations\n`);

  // Load existing enrichment file
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(ENRICHMENT_PATH, 'utf8'));
  } catch {
    // File doesn't exist or is empty
  }
  
  // Remove any existing Le Temple Noble Art entries
  const filtered = existing.filter(e => 
    !(/temple/i.test(e.name || '') && /noble art/i.test(e.name || ''))
  );
  
  // Enrich locations - match by name patterns or location
  const enriched = temple.map(studio => {
    const name = (studio.name || '').toLowerCase();
    const location = (studio.location || '').toLowerCase();
    
    let dateInfo = null;
    
    // Match by name patterns
    if (name.includes('saint-lazare') || name.includes('saint lazare')) {
      dateInfo = openingDates['saint-lazare'];
    } else if (name.includes('palais royal') || location.includes('rue moliere') || location.includes('11 rue moliere')) {
      // Palais Royal is in Paris 1
      dateInfo = openingDates['paris-1'];
    } else if (name.includes('république') || name.includes('republique') || location.includes('rue amelot') || location.includes('138 rue amelot')) {
      // République is in Paris 11
      dateInfo = openingDates['paris-11'];
    } else if (name.includes('porte maillot') || location.includes('gouvion saint-cyr') || location.includes('boulevard gouvion')) {
      // Porte Maillot is in Paris 17
      dateInfo = openingDates['paris-17'];
    } else if (location.includes('croix nivert') || location.includes('5 rue de la croix')) {
      // This location is in Paris 15
      dateInfo = openingDates['paris-15'];
    }
    
    return {
      ...studio,
      estimated_opening_date: dateInfo?.date || null,
      opening_date_source: dateInfo?.source || null,
      opening_date_notes: dateInfo?.notes || null,
      enriched_at: new Date().toISOString(),
    };
  });
  
  // Merge with existing data
  const merged = [...filtered, ...enriched];
  
  // Save
  await fs.writeFile(ENRICHMENT_PATH, JSON.stringify(merged, null, 2));
  
  console.log(`✓ Added ${enriched.length} Le Temple Noble Art locations to enrichment file`);
  console.log(`✓ Total locations in file: ${merged.length}\n`);
  
  // Summary
  const withDates = enriched.filter(e => e.estimated_opening_date);
  console.log('Summary:');
  console.log(`- Le Temple Noble Art locations enriched: ${enriched.length}`);
  console.log(`- With estimated opening dates: ${withDates.length}`);
  console.log(`- Without dates: ${enriched.length - withDates.length}\n`);
  
  console.log('Locations with dates:');
  enriched
    .filter(e => e.estimated_opening_date)
    .sort((a, b) => a.estimated_opening_date.localeCompare(b.estimated_opening_date))
    .forEach(e => {
      console.log(`  ${e.estimated_opening_date}: ${e.name} - ${e.location}`);
    });
  
  if (enriched.filter(e => !e.estimated_opening_date).length > 0) {
    console.log('\nLocations needing dates:');
    enriched
      .filter(e => !e.estimated_opening_date)
      .forEach(e => {
        console.log(`  - ${e.name} - ${e.location}`);
      });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

