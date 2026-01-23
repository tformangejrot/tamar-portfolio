#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CLASSPASS_PATH = path.join(ROOT, 'data/processed/classpass_studios_london.json');
const GOOGLE_PATH = path.join(ROOT, 'data/processed/classpass_studios_google_london.json');
const WHOIS_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois_london.json');
const LOCATION_DATES_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment_london.json');
const POSTCODE_MAPPING_PATH = path.join(ROOT, 'data/reference/uk_postcode_to_borough.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_london.json');

function extractUKPostcode(address) {
  if (!address) return null;
  
  // UK postcode pattern: outward code (1-2 letters + 1-2 digits + optional letter) + space + inward code
  // Examples: SW1A 1AA, EC2A 4DP, W1K 6HJ, N1 9GU
  const postcodeMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s+\d[A-Z]{2}\b/i);
  if (postcodeMatch) {
    return postcodeMatch[1].toUpperCase();
  }
  return null;
}

function extractOutwardCode(postcode) {
  if (!postcode) return null;
  
  // Extract the base outward code (e.g., SW1A -> SW1, EC2A -> EC2, W1K -> W1)
  // Match 1-2 letters followed by 1-2 digits
  const match = postcode.match(/^([A-Z]{1,2}\d{1,2})/i);
  return match ? match[1].toUpperCase() : null;
}

function lookupBorough(postcode, postcodeMapping) {
  if (!postcode) return null;
  
  const outwardCode = extractOutwardCode(postcode);
  if (!outwardCode) return null;
  
  // Try exact match first
  if (postcodeMapping[outwardCode]) {
    return postcodeMapping[outwardCode];
  }
  
  // Try matching just the area (e.g., SW1A -> try SW1)
  const areaMatch = outwardCode.match(/^([A-Z]{1,2})(\d+)/);
  if (areaMatch) {
    const area = areaMatch[1];
    const number = areaMatch[2];
    // Try with just the number (e.g., SW1)
    const baseCode = `${area}${number}`;
    if (postcodeMapping[baseCode]) {
      return postcodeMapping[baseCode];
    }
  }
  
  return null;
}

function extractPostcodeFull(address) {
  if (!address) return null;
  // Extract full UK postcode (e.g., "SW1A 1AA")
  const postcodeMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2})\b/i);
  return postcodeMatch ? postcodeMatch[1].toUpperCase() : null;
}

async function main() {
  console.log('Loading data files...\n');
  
  // Load postcode mapping
  const postcodeMappingData = JSON.parse(await fs.readFile(POSTCODE_MAPPING_PATH, 'utf8'));
  const postcodeMapping = postcodeMappingData.mapping;
  
  // Load all data files (with fallback to empty arrays if files don't exist)
  let classpass = [];
  let google = [];
  let whois = [];
  let locationDates = [];
  
  try {
    classpass = JSON.parse(await fs.readFile(CLASSPASS_PATH, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not load ${CLASSPASS_PATH}: ${err.message}`);
  }
  
  try {
    google = JSON.parse(await fs.readFile(GOOGLE_PATH, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not load ${GOOGLE_PATH}: ${err.message}`);
  }
  
  try {
    whois = JSON.parse(await fs.readFile(WHOIS_PATH, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not load ${WHOIS_PATH}: ${err.message}`);
  }
  
  try {
    locationDates = JSON.parse(await fs.readFile(LOCATION_DATES_PATH, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not load ${LOCATION_DATES_PATH}: ${err.message}`);
  }
  
  console.log(`- ClassPass studios: ${classpass.length}`);
  console.log(`- Google enriched: ${google.length}`);
  console.log(`- WHOIS enriched: ${whois.length}`);
  console.log(`- Location dates: ${locationDates.length}\n`);
  
  // Create lookup maps by detail_url (most reliable key)
  const googleMap = new Map();
  google.forEach(s => {
    if (s.detail_url) {
      googleMap.set(s.detail_url, s);
    }
  });
  
  const whoisMap = new Map();
  whois.forEach(s => {
    if (s.detail_url) {
      whoisMap.set(s.detail_url, s);
    }
  });
  
  // Location dates map - prioritize by detail_url, fallback to name+location
  const locationDatesMap = new Map();
  locationDates.forEach(s => {
    if (s.detail_url) {
      locationDatesMap.set(s.detail_url, s);
    } else if (s.name && s.location) {
      const key = `${s.name}|${s.location}`;
      locationDatesMap.set(key, s);
    }
  });
  
  console.log('Consolidating data...\n');
  
  // Consolidate: start with ClassPass data, merge everything else
  const consolidated = classpass.map(studio => {
    const detailUrl = studio.detail_url;
    const googleData = googleMap.get(detailUrl);
    const whoisData = whoisMap.get(detailUrl);
    
    // Get location-specific opening date (highest priority)
    let locationDateData = locationDatesMap.get(detailUrl);
    if (!locationDateData && studio.name && studio.location) {
      locationDateData = locationDatesMap.get(`${studio.name}|${studio.location}`);
    }
    
    // Determine best opening date
    // Priority: location-specific date > WHOIS domain date
    let estimated_opening_date = null;
    let opening_date_source = null;
    let opening_date_notes = null;
    
    if (locationDateData?.estimated_opening_date) {
      estimated_opening_date = locationDateData.estimated_opening_date;
      opening_date_source = locationDateData.opening_date_source || 'location_specific';
      opening_date_notes = locationDateData.opening_date_notes || null;
    } else if (whoisData?.creation_date && !whoisData.missing_creation_date) {
      // Use WHOIS date as fallback (domain creation date)
      estimated_opening_date = whoisData.creation_date.split('T')[0]; // Just the date part
      opening_date_source = 'whois_domain_creation';
      opening_date_notes = 'Domain creation date (may reflect brand opening, not individual location)';
    }
    
    // Extract UK postcode and borough from Google matched address
    const matchedAddress = googleData?.matched_address || null;
    const postcode = matchedAddress ? extractUKPostcode(matchedAddress) : null;
    const postcode_full = matchedAddress ? extractPostcodeFull(matchedAddress) : null;
    const borough = postcode ? lookupBorough(postcode, postcodeMapping) : null;
    
    return {
      // Core identifiers
      name: studio.name,
      detail_url: studio.detail_url,
      location: studio.location,
      city: 'London',
      
      // Address information (from Google)
      matched_address: matchedAddress,
      postcode: postcode_full,
      postcode_outward: postcode,
      borough: borough,
      place_id: googleData?.place_id || null,
      google_maps_url: googleData?.google_maps_url || null,
      
      // Website information
      website: googleData?.website || whoisData?.website || null,
      domain: whoisData?.domain || null,
      
      // Categories (from ClassPass)
      categories: studio.categories || [],
      category_count: studio.category_count || 0,
      
      // Ratings (from ClassPass)
      rating: studio.rating || null,
      rating_count: studio.rating_count || null,
      safety_badge: studio.safety_badge || false,
      
      // Opening date (prioritized)
      estimated_opening_date: estimated_opening_date,
      opening_date_source: opening_date_source,
      opening_date_notes: opening_date_notes,
      
      // Metadata
      appearances: studio.appearances || [],
    };
  });
  
  // Save consolidated file
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(consolidated, null, 2));
  
  console.log(`✓ Consolidated ${consolidated.length} London studios`);
  console.log(`✓ Saved to ${OUTPUT_PATH}\n`);
  
  // Summary statistics
  const withOpeningDates = consolidated.filter(s => s.estimated_opening_date);
  const withLocationDates = consolidated.filter(s => s.opening_date_source === 'location_specific' || 
    s.opening_date_source?.includes('wayback') || 
    s.opening_date_source?.includes('user_provided'));
  const withWhoisDates = consolidated.filter(s => s.opening_date_source === 'whois_domain_creation');
  const withBorough = consolidated.filter(s => s.borough);
  const withPostcode = consolidated.filter(s => s.postcode);
  const withCategories = consolidated.filter(s => s.categories && s.categories.length > 0);
  
  console.log('Summary:');
  console.log(`- Studios with opening dates: ${withOpeningDates.length} (${(withOpeningDates.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`  - Location-specific dates: ${withLocationDates.length}`);
  console.log(`  - WHOIS domain dates: ${withWhoisDates.length}`);
  console.log(`- Studios with borough: ${withBorough.length} (${(withBorough.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`- Studios with postcode: ${withPostcode.length} (${(withPostcode.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`- Studios with categories: ${withCategories.length} (${(withCategories.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`- Average categories per studio: ${(consolidated.reduce((sum, s) => sum + (s.category_count || 0), 0) / consolidated.length).toFixed(1)}`);
  
  // Borough distribution
  const boroughCounts = {};
  consolidated.forEach(s => {
    if (s.borough) {
      boroughCounts[s.borough] = (boroughCounts[s.borough] || 0) + 1;
    }
  });
  const topBoroughs = Object.entries(boroughCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (topBoroughs.length > 0) {
    console.log('\nTop 10 boroughs by studio count:');
    topBoroughs.forEach(([borough, count]) => {
      console.log(`  ${borough}: ${count}`);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
