#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const WHOIS_DATA_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const ENRICHMENT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

// Opening dates deduced from sources:
// 1. Forbes (June 12, 2017): "Deux salles en deux ans" - first studio ~2015-2016
// 2. Yelp: 14 Rue Saint-Augustin operational since Nov 2015
// 3. Vogue article: Villiers opening (need to check publication date)
// 4. Instagram reel: (need to check post date)

// Map addresses to estimated opening dates
// Note: Some dates are estimates based on available information
const openingDates = {
  '14 Rue Saint-Augustin, Paris': {
    date: '2015-11-01', // Operational by Nov 2015 per Yelp
    source: 'yelp_review_november_2015',
    notes: 'First studio, operational by November 2015',
  },
  // Second studio - likely one of the early ones, opened by 2017
  // Based on Forbes article saying "deux salles en deux ans" in June 2017
  '21 Rue des Trois Bornes, Paris': {
    date: '2016-06-01', // Estimated - second studio, likely opened by mid-2016
    source: 'forbes_article_june_2017_inference',
    notes: 'Likely second studio, opened by 2017 per Forbes article',
  },
  '52 Rue de Lévis, Paris': {
    date: '2019-02-01', // Sortiraparis article Feb 4, 2019 mentions it as existing
    source: 'sortiraparis_article_february_2019',
    notes: 'Lafayette location, existed by February 2019 per Sortiraparis article',
  },
  '79 Rue la Boétie, Paris': {
    date: '2019-02-01', // Sortiraparis article Feb 4, 2019 mentions it as existing
    source: 'sortiraparis_article_february_2019',
    notes: 'Boétie location, existed by February 2019 per Sortiraparis article',
  },
  '24 Rue Chauchat, Paris': {
    date: '2019-02-01', // Sortiraparis article Feb 4, 2019 mentions it as existing
    source: 'sortiraparis_article_february_2019',
    notes: 'Opéra location, existed by February 2019 per Sortiraparis article',
  },
  '159 Avenue Charles de Gaulle, Neuilly-sur-Seine': {
    date: '2025-03-01', // Opened March 2025
    source: 'user_provided',
    notes: 'Neuilly studio opened March 2025',
  },
  '2 Place de la Défense, Puteaux': {
    date: '2021-09-01', // Opened September 2021
    source: 'user_provided',
    notes: 'La Défense studio opened September 2021',
  },
  '2 Rue de la Saussière, Boulogne-Billancourt': {
    date: '2021-11-01', // Opened November 2021
    source: 'user_provided',
    notes: 'Boulogne studio opened November 2021',
  },
  '5 Rue Dupin, Paris': {
    date: '2022-02-01', // Opened February 2022
    source: 'user_provided',
    notes: 'Rue Dupin studio opened February 2022',
  },
};

async function main() {
  // Load data
  const studios = JSON.parse(await fs.readFile(WHOIS_DATA_PATH, 'utf8'));
  const dynamo = studios.filter(s => 
    /dynamo/i.test(s.name) && /cycling/i.test(s.name)
  );
  
  console.log(`Found ${dynamo.length} Dynamo Cycling locations\n`);

  // Load existing enrichment file
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(ENRICHMENT_PATH, 'utf8'));
  } catch {
    // File doesn't exist or is empty
  }
  
  // Remove any existing Dynamo entries
  const filtered = existing.filter(e => !/dynamo/i.test(e.name || ''));
  
  // Enrich Dynamo locations
  const enriched = dynamo.map(studio => {
    const locationKey = studio.location;
    const dateInfo = openingDates[locationKey];
    
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
  
  console.log(`✓ Added ${enriched.length} Dynamo Cycling locations to enrichment file`);
  console.log(`✓ Total locations in file: ${merged.length}\n`);
  
  // Summary
  const withDates = enriched.filter(e => e.estimated_opening_date);
  console.log('Summary:');
  console.log(`- Dynamo locations enriched: ${enriched.length}`);
  console.log(`- With estimated opening dates: ${withDates.length}`);
  console.log(`- Without dates: ${enriched.length - withDates.length}\n`);
  
  console.log('Locations with dates:');
  enriched
    .filter(e => e.estimated_opening_date)
    .forEach(e => {
      console.log(`  ${e.estimated_opening_date}: ${e.location} (${e.opening_date_source})`);
    });
  
  console.log('\nLocations needing more research:');
  enriched
    .filter(e => !e.estimated_opening_date)
    .forEach(e => {
      console.log(`  - ${e.location}`);
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

