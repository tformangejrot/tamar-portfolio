#!/usr/bin/env node

/**
 * Consolidate Berlin studio data from Google Places API results.
 *
 * - Merges results from all modality searches
 * - Deduplicates by place_id
 * - Extracts Berlin districts from addresses
 * - Assigns modalities to each studio
 * - Merges WHOIS data for opening date estimates (ignores dates before 1995,
 *   which are registry placeholder dates, e.g. DENIC's 1986-11-05)
 * - Applies category consolidation
 * - Filters boutique studios
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const RAW_DIR = path.join(ROOT, 'data/raw/google_places_berlin');
const WHOIS_PATH = path.join(ROOT, 'data/processed/berlin_studios_whois.json');
const WAYBACK_PATH = path.join(ROOT, 'data/processed/berlin_studios_wayback.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/berlin_studios_consolidated.json');
const BOUTIQUE_OUTPUT_PATH = path.join(ROOT, 'data/processed/berlin_studios_consolidated_boutique.json');

// Minimum year for a WHOIS creation date to be considered valid.
// DENIC (German .de registry) returns 1986-11-05 as a placeholder when no
// real date is available — anything before 1995 is treated as missing.
const WHOIS_MIN_VALID_YEAR = 1995;

// Berlin districts (Ortsteile) to extract from addresses.
// Listed roughly most-central first so that substring matching
// picks the most specific name when addresses contain multiple terms.
const BERLIN_DISTRICTS = [
  // Central / Mitte
  'Mitte', 'Tiergarten', 'Wedding', 'Moabit', 'Gesundbrunnen',
  // Prenzlauer Berg / Pankow
  'Prenzlauer Berg', 'Pankow', 'Weissensee', 'Weißensee',
  // Friedrichshain / Kreuzberg
  'Friedrichshain', 'Kreuzberg',
  // Charlottenburg / Wilmersdorf
  'Charlottenburg', 'Wilmersdorf',
  // Schöneberg / Tempelhof
  'Schöneberg', 'Schoeneberg', 'Tempelhof', 'Friedenau',
  // Neukölln
  'Neukölln', 'Neukoelln', 'Britz',
  // Steglitz / Zehlendorf
  'Steglitz', 'Zehlendorf', 'Dahlem',
  // Treptow / Köpenick
  'Treptow', 'Köpenick', 'Koepenick', 'Adlershof',
  // Lichtenberg / Marzahn
  'Lichtenberg', 'Marzahn', 'Hellersdorf',
  // Reinickendorf / Spandau
  'Reinickendorf', 'Spandau',
];

// Canonical display names for normalizing umlaut variants
const DISTRICT_CANONICAL = {
  'Weißensee': 'Weissensee',
  'Schöneberg': 'Schoeneberg',
  'Neukölln': 'Neukoelln',
  'Köpenick': 'Koepenick',
};

// Berlin PLZ (postal code) → district lookup.
// Berlin addresses typically contain the postal code but NOT the district name,
// so name-matching alone yields very low coverage. This lookup is the primary
// extraction method; name-matching is kept as a supplementary pass.
const BERLIN_PLZ = {
  // Mitte
  '10115': 'Mitte', '10117': 'Mitte', '10119': 'Mitte',
  '10178': 'Mitte', '10179': 'Mitte',
  // Tiergarten
  '10553': 'Tiergarten', '10785': 'Tiergarten', '10787': 'Tiergarten',
  // Moabit
  '10551': 'Moabit', '10555': 'Moabit', '10557': 'Moabit', '10559': 'Moabit',
  // Wedding
  '13347': 'Wedding', '13349': 'Wedding', '13351': 'Wedding',
  '13353': 'Wedding', '13355': 'Wedding', '13357': 'Wedding', '13359': 'Wedding',
  // Gesundbrunnen
  '13403': 'Gesundbrunnen', '13405': 'Gesundbrunnen',
  '13407': 'Gesundbrunnen', '13409': 'Gesundbrunnen',
  // Prenzlauer Berg
  '10405': 'Prenzlauer Berg', '10407': 'Prenzlauer Berg', '10409': 'Prenzlauer Berg',
  '10435': 'Prenzlauer Berg', '10437': 'Prenzlauer Berg', '10439': 'Prenzlauer Berg',
  // Pankow
  '13125': 'Pankow', '13127': 'Pankow', '13129': 'Pankow',
  '13156': 'Pankow', '13158': 'Pankow', '13159': 'Pankow',
  '13187': 'Pankow', '13189': 'Pankow',
  // Weissensee
  '13086': 'Weissensee', '13088': 'Weissensee', '13089': 'Weissensee',
  '13097': 'Weissensee', '13099': 'Weissensee',
  // Friedrichshain
  '10243': 'Friedrichshain', '10245': 'Friedrichshain',
  '10247': 'Friedrichshain', '10249': 'Friedrichshain',
  // Kreuzberg
  '10961': 'Kreuzberg', '10963': 'Kreuzberg', '10965': 'Kreuzberg',
  '10967': 'Kreuzberg', '10969': 'Kreuzberg', '10997': 'Kreuzberg', '10999': 'Kreuzberg',
  // Charlottenburg
  '10585': 'Charlottenburg', '10587': 'Charlottenburg', '10589': 'Charlottenburg',
  '10623': 'Charlottenburg', '10625': 'Charlottenburg', '10627': 'Charlottenburg',
  '10629': 'Charlottenburg',
  '14050': 'Charlottenburg', '14052': 'Charlottenburg', '14053': 'Charlottenburg',
  '14055': 'Charlottenburg', '14057': 'Charlottenburg', '14059': 'Charlottenburg',
  // Wilmersdorf
  '10707': 'Wilmersdorf', '10709': 'Wilmersdorf', '10711': 'Wilmersdorf',
  '10713': 'Wilmersdorf', '10715': 'Wilmersdorf', '10717': 'Wilmersdorf',
  '10719': 'Wilmersdorf',
  // Schoeneberg
  '10777': 'Schoeneberg', '10779': 'Schoeneberg', '10781': 'Schoeneberg',
  '10783': 'Schoeneberg', '10823': 'Schoeneberg', '10825': 'Schoeneberg',
  '10827': 'Schoeneberg', '10829': 'Schoeneberg',
  // Tempelhof
  '12099': 'Tempelhof', '12101': 'Tempelhof', '12103': 'Tempelhof',
  '12105': 'Tempelhof', '12107': 'Tempelhof', '12109': 'Tempelhof',
  '12277': 'Tempelhof', '12279': 'Tempelhof',
  '12305': 'Tempelhof', '12307': 'Tempelhof', '12309': 'Tempelhof',
  // Neukoelln
  '12043': 'Neukoelln', '12045': 'Neukoelln', '12047': 'Neukoelln',
  '12049': 'Neukoelln', '12051': 'Neukoelln', '12053': 'Neukoelln',
  '12055': 'Neukoelln', '12057': 'Neukoelln', '12059': 'Neukoelln',
  '12347': 'Neukoelln', '12349': 'Neukoelln', '12351': 'Neukoelln',
  '12353': 'Neukoelln', '12355': 'Neukoelln', '12357': 'Neukoelln', '12359': 'Neukoelln',
  // Steglitz
  '12157': 'Steglitz', '12159': 'Steglitz', '12161': 'Steglitz',
  '12163': 'Steglitz', '12165': 'Steglitz', '12167': 'Steglitz', '12169': 'Steglitz',
  '12203': 'Steglitz', '12205': 'Steglitz', '12207': 'Steglitz', '12209': 'Steglitz',
  '12247': 'Steglitz', '12249': 'Steglitz',
  // Zehlendorf
  '14109': 'Zehlendorf', '14129': 'Zehlendorf',
  '14163': 'Zehlendorf', '14165': 'Zehlendorf', '14167': 'Zehlendorf', '14169': 'Zehlendorf',
  // Dahlem
  '14193': 'Dahlem', '14195': 'Dahlem', '14197': 'Dahlem', '14199': 'Dahlem',
  // Lichtenberg
  '10315': 'Lichtenberg', '10317': 'Lichtenberg', '10319': 'Lichtenberg',
  '10365': 'Lichtenberg', '10367': 'Lichtenberg', '10369': 'Lichtenberg',
  '13051': 'Lichtenberg', '13053': 'Lichtenberg', '13055': 'Lichtenberg',
  // Marzahn
  '12679': 'Marzahn', '12681': 'Marzahn', '12683': 'Marzahn',
  '12685': 'Marzahn', '12687': 'Marzahn', '12689': 'Marzahn',
  // Hellersdorf
  '12619': 'Hellersdorf', '12621': 'Hellersdorf', '12623': 'Hellersdorf',
  '12625': 'Hellersdorf', '12627': 'Hellersdorf', '12629': 'Hellersdorf',
  // Treptow
  '12435': 'Treptow', '12437': 'Treptow', '12439': 'Treptow',
  '12457': 'Treptow', '12459': 'Treptow',
  '12524': 'Treptow', '12526': 'Treptow', '12527': 'Treptow',
  '12528': 'Treptow', '12529': 'Treptow',
  // Adlershof
  '12487': 'Adlershof', '12489': 'Adlershof',
  // Koepenick
  '12555': 'Koepenick', '12557': 'Koepenick', '12559': 'Koepenick',
  '12587': 'Koepenick', '12589': 'Koepenick',
  // Reinickendorf
  '13437': 'Reinickendorf', '13439': 'Reinickendorf',
  '13465': 'Reinickendorf', '13467': 'Reinickendorf', '13469': 'Reinickendorf',
  '13503': 'Reinickendorf', '13505': 'Reinickendorf',
  '13507': 'Reinickendorf', '13509': 'Reinickendorf',
  // Spandau
  '13581': 'Spandau', '13583': 'Spandau', '13585': 'Spandau',
  '13587': 'Spandau', '13589': 'Spandau', '13591': 'Spandau',
  '13593': 'Spandau', '13595': 'Spandau', '13597': 'Spandau',
  '13599': 'Spandau', '13627': 'Spandau', '13629': 'Spandau',
};

function extractDistrict(address) {
  if (!address) return null;

  // Primary: extract the 5-digit PLZ and look it up
  const plzMatch = address.match(/\b(\d{5})\s+Berlin/i);
  if (plzMatch) {
    const district = BERLIN_PLZ[plzMatch[1]];
    if (district) return district;
  }

  // Fallback: scan for district name substrings in the address
  const addressLower = address.toLowerCase();
  for (const district of BERLIN_DISTRICTS) {
    if (addressLower.includes(district.toLowerCase())) {
      return DISTRICT_CANONICAL[district] || district;
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
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function consolidateCategories(categories, consolidationMap) {
  if (!categories || categories.length === 0) return [];
  const consolidated = new Set();
  for (const cat of categories) {
    let found = false;
    for (const [consolidatedCat, variants] of Object.entries(consolidationMap.mapping)) {
      if (variants.includes(cat)) {
        consolidated.add(consolidatedCat);
        found = true;
        break;
      }
    }
    if (!found) {
      consolidated.add(cat);
    }
  }
  return Array.from(consolidated);
}

function isBoutique(studio, excludedCategories) {
  const cats = studio.categories || [];
  if (cats.length === 0) return true;
  const onlyExcluded = cats.every(cat => excludedCategories.includes(cat.toLowerCase()));
  return !onlyExcluded;
}

async function loadAllRawData() {
  let files = [];
  try {
    files = await fs.readdir(RAW_DIR);
  } catch {
    return [];
  }
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
          const existing = studiosByPlaceId.get(studio.place_id);
          if (!existing.modalities.includes(slug)) {
            existing.modalities.push(slug);
          }
          if (studio.website && !existing.website) {
            existing.website = studio.website;
          }
          if (studio.location && !existing.location) {
            existing.location = studio.location;
          }
        } else {
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

  const rawStudios = await loadAllRawData();
  console.log(`- Raw studios (deduplicated): ${rawStudios.length}`);

  if (rawStudios.length === 0) {
    console.log('\nNo studios found in data/raw/google_places_berlin/. Run fetch_google_places_berlin.mjs first.');
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, '[]\n');
    await fs.writeFile(BOUTIQUE_OUTPUT_PATH, '[]\n');
    return;
  }

  // Load WHOIS data
  let whoisData = [];
  try {
    whoisData = JSON.parse(await fs.readFile(WHOIS_PATH, 'utf8'));
    console.log(`- WHOIS enriched: ${whoisData.length}`);
  } catch {
    console.log(`- WHOIS enriched: 0 (file not found, skipping)`);
  }

  // Load Wayback data (optional — only present after running enrich_berlin_with_wayback.mjs)
  let waybackData = [];
  try {
    waybackData = JSON.parse(await fs.readFile(WAYBACK_PATH, 'utf8'));
    console.log(`- Wayback enriched: ${waybackData.length}`);
  } catch {
    console.log(`- Wayback enriched: 0 (file not found, skipping)`);
  }

  // Load category consolidation mapping
  let categoryConsolidation = { mapping: {}, exclude: [] };
  try {
    categoryConsolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  } catch {
    console.warn('Warning: category_consolidation.json not found, skipping consolidation');
  }

  console.log('');

  // Build lookup maps by place_id
  const whoisMap = new Map();
  whoisData.forEach(s => {
    if (s.place_id) whoisMap.set(s.place_id, s);
  });

  const waybackMap = new Map();
  waybackData.forEach(s => {
    if (s.place_id) waybackMap.set(s.place_id, s);
  });

  console.log('Consolidating data...\n');

  const consolidated = rawStudios.map(studio => {
    const placeId = studio.place_id;
    const whoisInfo = whoisMap.get(placeId);
    const waybackInfo = waybackMap.get(placeId);

    const neighborhood = extractDistrict(studio.location);

    let estimated_opening_date = null;
    let opening_date_source = null;
    let opening_date_notes = null;

    // Priority 1: WHOIS domain creation date (most reliable)
    if (whoisInfo?.creation_date && !whoisInfo.missing_creation_date) {
      const creationYear = new Date(whoisInfo.creation_date).getFullYear();
      if (creationYear >= WHOIS_MIN_VALID_YEAR) {
        estimated_opening_date = adjustDateForOpening(whoisInfo.creation_date);
        opening_date_source = 'whois_domain_creation';
        opening_date_notes = 'Domain creation date adjusted by ~2 months to estimate opening date';
      } else {
        opening_date_notes = `WHOIS date ignored (${creationYear} is a registry placeholder)`;
      }
    }

    // Priority 2: Wayback Machine first capture (fallback when WHOIS has no valid date)
    if (!estimated_opening_date && waybackInfo?.first_capture) {
      estimated_opening_date = waybackInfo.first_capture.split('T')[0];
      opening_date_source = 'wayback_first_capture';
      opening_date_notes = 'Earliest Wayback Machine capture date — a lower bound on when the site launched';
    }

    const consolidatedCategories = consolidateCategories(
      studio.modalities || [],
      categoryConsolidation
    );

    return {
      name: studio.name,
      place_id: studio.place_id,
      location: studio.location,
      neighborhood,
      lat: studio.lat,
      lng: studio.lng,
      google_maps_url: studio.google_maps_url || null,
      website: studio.website || whoisInfo?.website || null,
      domain: whoisInfo?.domain || null,
      categories: consolidatedCategories,
      category_count: consolidatedCategories.length,
      raw_modalities: studio.modalities || [],
      rating: studio.rating || null,
      rating_count: studio.rating_count || null,
      types: studio.types || [],
      estimated_opening_date,
      opening_date_source,
      opening_date_notes,
    };
  });

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(consolidated, null, 2));
  console.log(`✓ Consolidated ${consolidated.length} studios`);
  console.log(`✓ Saved to ${OUTPUT_PATH}\n`);

  const boutiqueStudios = consolidated.filter(studio =>
    isBoutique(studio, categoryConsolidation.exclude || ['fitness', 'gym-time'])
  );

  await fs.writeFile(BOUTIQUE_OUTPUT_PATH, JSON.stringify(boutiqueStudios, null, 2));
  console.log(`✓ Filtered to ${boutiqueStudios.length} boutique studios`);
  console.log(`✓ Saved to ${BOUTIQUE_OUTPUT_PATH}\n`);

  // Summary
  const withDates = consolidated.filter(s => s.estimated_opening_date);
  const withWhoisDates = consolidated.filter(s => s.opening_date_source === 'whois_domain_creation');
  const withWaybackDates = consolidated.filter(s => s.opening_date_source === 'wayback_first_capture');
  const withDistrict = consolidated.filter(s => s.neighborhood);
  const ignoredDates = consolidated.filter(s => s.opening_date_notes?.includes('registry placeholder'));

  console.log('Summary (All Studios):');
  console.log(`- Total studios: ${consolidated.length}`);
  console.log(`- With opening dates: ${withDates.length} (${(withDates.length / consolidated.length * 100).toFixed(1)}%)`);
  console.log(`  - from WHOIS:   ${withWhoisDates.length}`);
  console.log(`  - from Wayback: ${withWaybackDates.length}`);
  console.log(`- WHOIS dates ignored (registry placeholder): ${ignoredDates.length}`);
  console.log(`- With district: ${withDistrict.length} (${(withDistrict.length / consolidated.length * 100).toFixed(1)}%)`);

  console.log('\nSummary (Boutique Studios):');
  const bLen = boutiqueStudios.length || 1;
  const boutiqueWithDates = boutiqueStudios.filter(s => s.estimated_opening_date);
  const boutiqueWithDistrict = boutiqueStudios.filter(s => s.neighborhood);
  console.log(`- Total boutique studios: ${boutiqueStudios.length}`);
  console.log(`- With opening dates: ${boutiqueWithDates.length} (${(boutiqueWithDates.length / bLen * 100).toFixed(1)}%)`);
  console.log(`- With district: ${boutiqueWithDistrict.length} (${(boutiqueWithDistrict.length / bLen * 100).toFixed(1)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
