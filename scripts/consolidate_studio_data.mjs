#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CLASSPASS_PATH = path.join(ROOT, 'data/processed/classpass_studios.json');
const GOOGLE_PATH = path.join(ROOT, 'data/processed/classpass_studios_google.json');
const WHOIS_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const LOCATION_DATES_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated.json');

function extractArrondissement(address) {
  if (!address) return null;
  
  // Look for 5-digit zip codes starting with 75 (Paris arrondissements)
  const arrMatch = address.match(/\b(75\d{3})\b/);
  if (arrMatch) {
    const code = arrMatch[1];
    return `Paris ${code.substring(3)}`;
  }
  return null;
}

function extractZipCode(address) {
  if (!address) return null;
  // Extract any 5-digit French postal code (75xxx for Paris, 9xxxx for suburbs, etc.)
  const zipMatch = address.match(/\b(\d{5})\b/);
  return zipMatch ? zipMatch[1] : null;
}

async function main() {
  console.log('Loading data files...\n');
  
  // Load all data files
  const classpass = JSON.parse(await fs.readFile(CLASSPASS_PATH, 'utf8'));
  const google = JSON.parse(await fs.readFile(GOOGLE_PATH, 'utf8'));
  const whois = JSON.parse(await fs.readFile(WHOIS_PATH, 'utf8'));
  const locationDates = JSON.parse(await fs.readFile(LOCATION_DATES_PATH, 'utf8'));
  
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
    
    // Extract arrondissement and zip code from Google matched address
    const matchedAddress = googleData?.matched_address || null;
    const arrondissement = matchedAddress ? extractArrondissement(matchedAddress) : null;
    const zip_code = matchedAddress ? extractZipCode(matchedAddress) : null;
    
    return {
      // Core identifiers
      name: studio.name,
      detail_url: studio.detail_url,
      location: studio.location,
      
      // Address information (from Google)
      matched_address: matchedAddress,
      arrondissement: arrondissement,
      zip_code: zip_code,
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
  
  console.log(`✓ Consolidated ${consolidated.length} studios`);
  console.log(`✓ Saved to ${OUTPUT_PATH}\n`);
  
  // Summary statistics
  const withOpeningDates = consolidated.filter(s => s.estimated_opening_date);
  const withLocationDates = consolidated.filter(s => s.opening_date_source === 'location_specific' || 
    s.opening_date_source?.includes('wayback') || 
    s.opening_date_source?.includes('user_provided'));
  const withWhoisDates = consolidated.filter(s => s.opening_date_source === 'whois_domain_creation');
  const withArrondissement = consolidated.filter(s => s.arrondissement);
  const withCategories = consolidated.filter(s => s.categories && s.categories.length > 0);
  
  console.log('Summary:');
  console.log(`- Studios with opening dates: ${withOpeningDates.length} (${(withOpeningDates.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`  - Location-specific dates: ${withLocationDates.length}`);
  console.log(`  - WHOIS domain dates: ${withWhoisDates.length}`);
  console.log(`- Studios with arrondissement: ${withArrondissement.length} (${(withArrondissement.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`- Studios with categories: ${withCategories.length} (${(withCategories.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`- Average categories per studio: ${(consolidated.reduce((sum, s) => sum + (s.category_count || 0), 0) / consolidated.length).toFixed(1)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

