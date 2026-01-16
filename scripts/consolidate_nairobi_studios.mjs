#!/usr/bin/env node

/**
 * Consolidate Nairobi studio data from Google Places API results.
 * 
 * - Merges results from all modality searches
 * - Deduplicates by place_id
 * - Extracts neighborhoods from addresses
 * - Assigns modalities to each studio
 * - Merges WHOIS data for opening date estimates
 * - Applies category consolidation
 * - Filters boutique studios
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const RAW_DIR = path.join(ROOT, 'data/raw/google_places_nairobi');
const WHOIS_PATH = path.join(ROOT, 'data/processed/nairobi_studios_whois.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/nairobi_studios_consolidated.json');
const BOUTIQUE_OUTPUT_PATH = path.join(ROOT, 'data/processed/nairobi_studios_consolidated_boutique.json');

// Nairobi neighborhoods to extract from addresses
const NAIROBI_NEIGHBORHOODS = [
  'Westlands', 'Karen', 'Kilimani', 'Lavington', 'Parklands', 'Hurlingham',
  'Riverside', 'Kileleshwa', 'Loresho', 'Runda', 'Gigiri', 'Muthaiga',
  'Spring Valley', 'Nyari', 'Rosslyn', 'South C', 'South B', 'Langata',
  'Ngong Road', 'Ngong', 'Kasarani', 'Eastleigh', 'Embakasi', 'Dagoretti',
  'Kibera', 'Kawangware', 'Mathare', 'Kariobangi', 'Buruburu', 'Donholm',
  'Umoja', 'Roysambu', 'Ruaraka', 'Zimmerman', 'Kahawa', 'Rongai'
];

function extractNeighborhood(address) {
  if (!address) return null;
  
  const addressLower = address.toLowerCase();
  
  // Check for each neighborhood (case-insensitive)
  for (const neighborhood of NAIROBI_NEIGHBORHOODS) {
    if (addressLower.includes(neighborhood.toLowerCase())) {
      return neighborhood;
    }
  }
  
  return null;
}

function adjustDateForOpening(creationDate) {
  if (!creationDate) return null;
  
  try {
    const date = new Date(creationDate);
    // Add ~2 months (60 days) to domain registration date to estimate opening
    date.setDate(date.getDate() + 60);
    return date.toISOString().split('T')[0]; // Return just the date part
  } catch {
    return null;
  }
}

function consolidateCategories(categories, consolidationMap) {
  if (!categories || categories.length === 0) return [];
  
  const consolidated = new Set();
  
  for (const cat of categories) {
    // Find which consolidated category this belongs to
    let found = false;
    for (const [consolidatedCat, variants] of Object.entries(consolidationMap.mapping)) {
      if (variants.includes(cat)) {
        consolidated.add(consolidatedCat);
        found = true;
        break;
      }
    }
    // If not found in mapping, keep original (might be a new category)
    if (!found) {
      consolidated.add(cat);
    }
  }
  
  return Array.from(consolidated);
}

function isBoutique(studio, excludedCategories) {
  const cats = studio.categories || [];
  if (cats.length === 0) return true; // Keep studios with no categories
  
  // Check if all categories are in the excluded list
  const onlyExcluded = cats.every(cat => 
    excludedCategories.includes(cat.toLowerCase())
  );
  
  // Exclude if it only has excluded categories
  return !onlyExcluded;
}

async function loadAllRawData() {
  const files = await fs.readdir(RAW_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  const studiosByPlaceId = new Map();
  
  console.log(`Loading ${jsonFiles.length} modality files...\n`);
  
  for (const file of jsonFiles) {
    const filePath = path.join(RAW_DIR, file);
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    
    const slug = file.replace('.json', '');
    
    if (data.results && Array.isArray(data.results)) {
      for (const studio of data.results) {
        if (!studio.place_id) continue;
        
        if (studiosByPlaceId.has(studio.place_id)) {
          // Add this modality to existing studio
          const existing = studiosByPlaceId.get(studio.place_id);
          if (!existing.modalities.includes(slug)) {
            existing.modalities.push(slug);
          }
          // Merge other data (prefer more complete data)
          if (studio.website && !existing.website) {
            existing.website = studio.website;
          }
          if (studio.location && !existing.location) {
            existing.location = studio.location;
          }
        } else {
          // New studio
          studiosByPlaceId.set(studio.place_id, {
            ...studio,
            modalities: [slug],
          });
        }
      }
    }
  }
  
  return Array.from(studiosByPlaceId.values());
}

async function main() {
  console.log('Loading data files...\n');
  
  // Load raw Google Places data
  const rawStudios = await loadAllRawData();
  console.log(`- Raw studios (deduplicated): ${rawStudios.length}`);
  
  // Load WHOIS data
  let whoisData = [];
  try {
    whoisData = JSON.parse(await fs.readFile(WHOIS_PATH, 'utf8'));
    console.log(`- WHOIS enriched: ${whoisData.length}`);
  } catch {
    console.log(`- WHOIS enriched: 0 (file not found, skipping)`);
  }
  
  // Load category consolidation mapping
  let categoryConsolidation = { mapping: {}, exclude: [] };
  try {
    categoryConsolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  } catch {
    console.warn('Warning: category_consolidation.json not found, skipping consolidation');
  }
  
  console.log('');
  
  // Create WHOIS lookup map by place_id
  const whoisMap = new Map();
  whoisData.forEach(s => {
    if (s.place_id) {
      whoisMap.set(s.place_id, s);
    }
  });
  
  console.log('Consolidating data...\n');
  
  // Consolidate studios
  const consolidated = rawStudios.map(studio => {
    const placeId = studio.place_id;
    const whoisInfo = whoisMap.get(placeId);
    
    // Extract neighborhood
    const neighborhood = extractNeighborhood(studio.location);
    
    // Determine opening date from WHOIS
    let estimated_opening_date = null;
    let opening_date_source = null;
    let opening_date_notes = null;
    
    if (whoisInfo?.creation_date && !whoisInfo.missing_creation_date) {
      // Adjust domain registration date by ~2 months
      estimated_opening_date = adjustDateForOpening(whoisInfo.creation_date);
      opening_date_source = 'whois_domain_creation';
      opening_date_notes = 'Domain creation date adjusted by ~2 months to estimate opening date';
    }
    
    // Consolidate categories
    const consolidatedCategories = consolidateCategories(
      studio.modalities || [],
      categoryConsolidation
    );
    
    return {
      // Core identifiers
      name: studio.name,
      place_id: studio.place_id,
      location: studio.location,
      
      // Address information
      neighborhood: neighborhood,
      lat: studio.lat,
      lng: studio.lng,
      google_maps_url: studio.google_maps_url || null,
      
      // Website information
      website: studio.website || whoisInfo?.website || null,
      domain: whoisInfo?.domain || null,
      
      // Categories
      categories: consolidatedCategories,
      category_count: consolidatedCategories.length,
      raw_modalities: studio.modalities || [], // Keep original for reference
      
      // Ratings
      rating: studio.rating || null,
      rating_count: studio.rating_count || null,
      types: studio.types || [], // Google Place types
      
      // Opening date
      estimated_opening_date: estimated_opening_date,
      opening_date_source: opening_date_source,
      opening_date_notes: opening_date_notes,
    };
  });
  
  // Save consolidated file
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(consolidated, null, 2));
  console.log(`✓ Consolidated ${consolidated.length} studios`);
  console.log(`✓ Saved to ${OUTPUT_PATH}\n`);
  
  // Filter boutique studios
  const boutiqueStudios = consolidated.filter(studio => 
    isBoutique(studio, categoryConsolidation.exclude || ['fitness', 'gym-time'])
  );
  
  await fs.writeFile(BOUTIQUE_OUTPUT_PATH, JSON.stringify(boutiqueStudios, null, 2));
  console.log(`✓ Filtered to ${boutiqueStudios.length} boutique studios`);
  console.log(`✓ Saved to ${BOUTIQUE_OUTPUT_PATH}\n`);
  
  // Summary statistics
  const withOpeningDates = consolidated.filter(s => s.estimated_opening_date);
  const withWhoisDates = consolidated.filter(s => s.opening_date_source === 'whois_domain_creation');
  const withNeighborhood = consolidated.filter(s => s.neighborhood);
  const withCategories = consolidated.filter(s => s.categories && s.categories.length > 0);
  
  console.log('Summary (All Studios):');
  console.log(`- Total studios: ${consolidated.length}`);
  console.log(`- With opening dates: ${withOpeningDates.length} (${(withOpeningDates.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`  - WHOIS domain dates: ${withWhoisDates.length}`);
  console.log(`- With neighborhood: ${withNeighborhood.length} (${(withNeighborhood.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`- With categories: ${withCategories.length} (${(withCategories.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`- Average categories per studio: ${(consolidated.reduce((sum, s) => sum + (s.category_count || 0), 0) / consolidated.length).toFixed(1)}`);
  
  console.log('\nSummary (Boutique Studios):');
  console.log(`- Total boutique studios: ${boutiqueStudios.length}`);
  const boutiqueWithDates = boutiqueStudios.filter(s => s.estimated_opening_date);
  const boutiqueWithNeighborhood = boutiqueStudios.filter(s => s.neighborhood);
  console.log(`- With opening dates: ${boutiqueWithDates.length} (${(boutiqueWithDates.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
  console.log(`- With neighborhood: ${boutiqueWithNeighborhood.length} (${(boutiqueWithNeighborhood.length / boutiqueStudios.length * 100).toFixed(1)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
