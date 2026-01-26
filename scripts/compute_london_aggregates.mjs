#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const OUTPUT_DIR = path.join(ROOT, 'data/aggregates/london');

function consolidateCategories(studio, consolidationMap) {
  const consolidated = new Set();
  const studioCategories = studio.categories || [];
  
  for (const cat of studioCategories) {
    // Find which consolidated category this belongs to
    for (const [consolidatedCat, subCats] of Object.entries(consolidationMap)) {
      if (subCats.includes(cat)) {
        consolidated.add(consolidatedCat);
        break;
      }
    }
  }
  
  return Array.from(consolidated);
}

function getYearFromDate(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.getFullYear();
  } catch {
    return null;
  }
}

// Adjust date: if Nov/Dec, count as next year (domain registration typically precedes opening)
function adjustYearForDomainRegistration(year, month) {
  if (month >= 11) {
    return year + 1;
  }
  return year;
}

function isRecentOpening(openingDate, cutoffDate = new Date('2025-01-15')) {
  if (!openingDate) return false;
  try {
    const date = new Date(openingDate);
    if (isNaN(date.getTime())) return false;
    // Last 16 months
    const monthsAgo = (cutoffDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsAgo <= 16 && monthsAgo >= 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Loading London boutique data...\n');
  
  const studios = JSON.parse(await fs.readFile(BOUTIQUE_PATH, 'utf8'));
  const consolidation = JSON.parse(await fs.readFile(CATEGORY_CONSOLIDATION_PATH, 'utf8'));
  const consolidationMap = consolidation.mapping;
  
  console.log(`Processing ${studios.length} boutique studios\n`);
  
  // 1. Modality mix
  const modalityCounts = {};
  studios.forEach(studio => {
    const consolidatedCats = consolidateCategories(studio, consolidationMap);
    consolidatedCats.forEach(cat => {
      modalityCounts[cat] = (modalityCounts[cat] || 0) + 1;
    });
  });
  
  const modalities = Object.entries(modalityCounts)
    .map(([modality, count]) => ({
      modality,
      count,
      pct: (count / studios.length * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  
  // 2. Growth over time
  const yearCounts = {};
  studios.forEach(studio => {
    if (studio.estimated_opening_date) {
      const date = new Date(studio.estimated_opening_date);
      if (!isNaN(date.getTime())) {
        let year = date.getFullYear();
        // Filter out dates before 2000 - boutique fitness is a recent phenomenon
        // and dates before 2000 are likely invalid WHOIS data or platform defaults
        if (year < 2000) {
          return; // Skip this studio's date
        }
        // Adjust for Nov/Dec domain registrations
        if (studio.opening_date_source === 'whois_domain_creation') {
          year = adjustYearForDomainRegistration(year, date.getMonth());
        }
        yearCounts[year] = (yearCounts[year] || 0) + 1;
      }
    }
  });
  
  const yearData = Object.entries(yearCounts)
    .map(([year, count]) => ({ year: parseInt(year), count }))
    .sort((a, b) => a.year - b.year);
  
  // 3. Recent growth (last 16 months)
  const cutoffDate = new Date('2025-01-15'); // Adjust as needed
  const recentStudios = studios.filter(s => isRecentOpening(s.estimated_opening_date, cutoffDate));
  const recentCount = recentStudios.length;
  
  const recentModalityCounts = {};
  const recentModalityTotals = {}; // Total studios in each modality (for growth rate calc)
  
  studios.forEach(studio => {
    const consolidatedCats = consolidateCategories(studio, consolidationMap);
    consolidatedCats.forEach(cat => {
      recentModalityTotals[cat] = (recentModalityTotals[cat] || 0) + 1;
    });
  });
  
  recentStudios.forEach(studio => {
    const consolidatedCats = consolidateCategories(studio, consolidationMap);
    consolidatedCats.forEach(cat => {
      recentModalityCounts[cat] = (recentModalityCounts[cat] || 0) + 1;
    });
  });
  
  const newModalities = Object.entries(recentModalityCounts)
    .map(([modality, count]) => ({
      modality,
      count,
      pctOfAllNew: recentCount > 0 
        ? parseFloat(((count / recentCount) * 100).toFixed(1))
        : 0,
      pctOfModality: recentModalityTotals[modality] 
        ? parseFloat(((count / recentModalityTotals[modality]) * 100).toFixed(1))
        : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const growthRateByModality = Object.entries(recentModalityCounts)
    .map(([modality, count]) => ({
      modality,
      count,
      pctOfModality: recentModalityTotals[modality] 
        ? parseFloat(((count / recentModalityTotals[modality]) * 100).toFixed(1))
        : 0
    }))
    .sort((a, b) => b.pctOfModality - a.pctOfModality)
    .slice(0, 10);
  
  // 4. Chains vs single-location (group by domain or name)
  const brandMap = new Map();
  studios.forEach(studio => {
    const key = studio.domain || studio.name?.toLowerCase().trim() || 'unknown';
    if (!brandMap.has(key)) {
      brandMap.set(key, []);
    }
    brandMap.get(key).push(studio);
  });
  
  const locationDistribution = {};
  brandMap.forEach((locations, brand) => {
    const count = locations.length;
    locationDistribution[count] = (locationDistribution[count] || 0) + 1;
  });
  
  const locationData = Object.entries(locationDistribution)
    .map(([locations, studioBrands]) => ({
      locations: parseInt(locations),
      studioBrands,
      label: parseInt(locations) === 1 ? '1 location' : `${locations} locations`
    }))
    .sort((a, b) => a.locations - b.locations);
  
  // 5. Borough distribution
  const boroughCounts = {};
  studios.forEach(studio => {
    if (studio.borough) {
      boroughCounts[studio.borough] = (boroughCounts[studio.borough] || 0) + 1;
    }
  });
  
  // Borough centroids (approximate - you may want to refine these)
  const boroughCentroids = {
    'Westminster': [51.5074, -0.1278],
    'Camden': [51.5290, -0.1255],
    'Islington': [51.5446, -0.1028],
    'Hackney': [51.5492, -0.0550],
    'Tower Hamlets': [51.5200, -0.0290],
    'Southwark': [51.5033, -0.0814],
    'Lambeth': [51.4952, -0.1120],
    'Kensington and Chelsea': [51.4994, -0.1937],
    'Hammersmith and Fulham': [51.4926, -0.2339],
    'Wandsworth': [51.4571, -0.1920],
    'Haringey': [51.5906, -0.1100],
    'Lewisham': [51.4652, -0.0136],
    'Greenwich': [51.4934, 0.0098],
    'Brent': [51.5588, -0.2817],
    'Ealing': [51.5136, -0.3048],
    'Merton': [51.4010, -0.1958],
    'Richmond upon Thames': [51.4613, -0.3034],
    'Waltham Forest': [51.5856, -0.0118],
    'Newham': [51.5255, 0.0352],
    'Redbridge': [51.5597, 0.0818],
    'City of London': [51.5155, -0.0920]
  };
  
  const boroughData = Object.entries(boroughCounts)
    .map(([borough, count]) => ({
      borough,
      count,
      center: boroughCentroids[borough] || [51.5074, -0.1278] // Default to central London
    }))
    .sort((a, b) => b.count - a.count);
  
  // Key stats
  const totalStudios = studios.length;
  const studiosWithDates = studios.filter(s => s.estimated_opening_date).length;
  const recentPct = ((recentCount / totalStudios) * 100).toFixed(1);
  const uniqueBrands = brandMap.size;
  const studiosWithBorough = studios.filter(s => s.borough).length;
  
  // Top modality
  const topModality = modalities[0];
  const topModalityPct = topModality ? topModality.pct : '0.0';
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  // Save individual files as the dashboard expects
  await fs.writeFile(path.join(OUTPUT_DIR, 'modality_mix.json'), JSON.stringify(modalities, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'growth_over_time.json'), JSON.stringify(yearData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'recent_new_modalities.json'), JSON.stringify(newModalities, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'recent_growth_rate.json'), JSON.stringify(growthRateByModality, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'chains_vs_single_location.json'), JSON.stringify(locationData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'borough_distribution.json'), JSON.stringify(boroughData, null, 2));
  
  // Modality growth over time (ALL modalities)
  const modalityGrowthByYear = {};
  
  studios.forEach(studio => {
    if (!studio.estimated_opening_date) return;
    
    const date = new Date(studio.estimated_opening_date);
    if (isNaN(date.getTime())) return;
    
    let year = date.getFullYear();
    // Filter out dates before 2000
    if (year < 2000) return;
    
    // Adjust for Nov/Dec domain registrations
    if (studio.opening_date_source === 'whois_domain_creation') {
      year = adjustYearForDomainRegistration(year, date.getMonth());
    }
    
    const consolidatedCats = consolidateCategories(studio, consolidationMap);
    
    // Count studio for each modality it offers
    consolidatedCats.forEach(modality => {
      if (!modalityGrowthByYear[modality]) {
        modalityGrowthByYear[modality] = {};
      }
      modalityGrowthByYear[modality][year] = (modalityGrowthByYear[modality][year] || 0) + 1;
    });
  });
  
  // Get all years from all modalities
  const allYears = new Set();
  Object.values(modalityGrowthByYear).forEach(yearData => {
    Object.keys(yearData).forEach(year => allYears.add(parseInt(year)));
  });
  
  const sortedYears = Array.from(allYears).sort((a, b) => a - b);
  
  // Get all unique modalities
  const allModalities = Object.keys(modalityGrowthByYear).sort();
  
  // Build data structure with all modalities
  const modalityGrowthData = sortedYears.map(year => {
    const yearData = { year };
    allModalities.forEach(modality => {
      yearData[modality] = modalityGrowthByYear[modality][year] || 0;
    });
    return yearData;
  });
  
  // Pilates combination trends (yoga+pilates vs pilates+strength)
  const pilatesCombinationsByYear = {
    'yoga-pilates': {},
    'pilates-strength': {}
  };
  
  studios.forEach(studio => {
    if (!studio.estimated_opening_date) return;
    
    const date = new Date(studio.estimated_opening_date);
    if (isNaN(date.getTime())) return;
    
    let year = date.getFullYear();
    // Filter out dates before 2000
    if (year < 2000) return;
    
    // Adjust for Nov/Dec domain registrations
    if (studio.opening_date_source === 'whois_domain_creation') {
      year = adjustYearForDomainRegistration(year, date.getMonth());
    }
    
    const consolidatedCats = consolidateCategories(studio, consolidationMap);
    
    // Check for yoga + pilates combination
    if (consolidatedCats.includes('yoga') && consolidatedCats.includes('pilates')) {
      pilatesCombinationsByYear['yoga-pilates'][year] = (pilatesCombinationsByYear['yoga-pilates'][year] || 0) + 1;
    }
    
    // Check for pilates + strength-training combination
    if (consolidatedCats.includes('pilates') && consolidatedCats.includes('strength-training')) {
      pilatesCombinationsByYear['pilates-strength'][year] = (pilatesCombinationsByYear['pilates-strength'][year] || 0) + 1;
    }
  });
  
  // Get all years from both combinations
  const allCombinationYears = new Set();
  Object.values(pilatesCombinationsByYear).forEach(yearData => {
    Object.keys(yearData).forEach(year => allCombinationYears.add(parseInt(year)));
  });
  
  const sortedCombinationYears = Array.from(allCombinationYears).sort((a, b) => a - b);
  
  const pilatesCombinationsData = sortedCombinationYears.map(year => ({
    year,
    'yoga-pilates': pilatesCombinationsByYear['yoga-pilates'][year] || 0,
    'pilates-strength': pilatesCombinationsByYear['pilates-strength'][year] || 0
  }));
  
  // Overall stats for the hero section
  const overallStats = {
    totalBoutiqueStudios: totalStudios,
    pctOpenedRecent: parseFloat(recentPct),
    totalModalityCategories: modalities.length,
    pilatesPct: modalities.find(m => m.modality === 'pilates')?.pct || 0,
    totalNewStudios: recentCount
  };
  await fs.writeFile(path.join(OUTPUT_DIR, 'overall_stats.json'), JSON.stringify(overallStats, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'modality_growth_by_year.json'), JSON.stringify(modalityGrowthData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'pilates_combinations_by_year.json'), JSON.stringify(pilatesCombinationsData, null, 2));
  
  console.log('✓ Computed London aggregates');
  console.log(`✓ Saved to ${OUTPUT_DIR}\n`);
  console.log('Summary:');
  console.log(`- Total boutique studios: ${totalStudios}`);
  console.log(`- Studios with opening dates: ${studiosWithDates} (${(studiosWithDates / totalStudios * 100).toFixed(1)}%)`);
  console.log(`- Recent openings (last 16 months): ${recentCount} (${recentPct}%)`);
  console.log(`- Unique brands: ${uniqueBrands}`);
  console.log(`- Studios with borough: ${studiosWithBorough} (${(studiosWithBorough / totalStudios * 100).toFixed(1)}%)`);
  console.log(`- Top modality: ${topModality?.modality || 'N/A'} (${topModalityPct}%)`);
  console.log(`- Top borough: ${boroughData[0]?.borough || 'N/A'} (${boroughData[0]?.count || 0} studios)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
