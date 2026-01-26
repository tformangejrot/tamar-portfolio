#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const OUTPUT_DIR = path.join(ROOT, 'data/aggregates/paris');

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
  console.log('Loading Paris boutique data...\n');
  
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
  
  // 5. Arrondissement distribution
  const arrondissementCounts = {};
  studios.forEach(studio => {
    if (studio.arrondissement) {
      arrondissementCounts[studio.arrondissement] = (arrondissementCounts[studio.arrondissement] || 0) + 1;
    }
  });
  
  // Arrondissement centroids (approximate)
  const arrondissementCentroids = {
    'Paris 01': [48.8606, 2.3376],
    'Paris 02': [48.8698, 2.3412],
    'Paris 03': [48.8630, 2.3622],
    'Paris 04': [48.8546, 2.3522],
    'Paris 05': [48.8440, 2.3438],
    'Paris 06': [48.8449, 2.3327],
    'Paris 07': [48.8565, 2.3122],
    'Paris 08': [48.8750, 2.3181],
    'Paris 09': [48.8750, 2.3394],
    'Paris 10': [48.8720, 2.3600],
    'Paris 11': [48.8610, 2.3794],
    'Paris 12': [48.8447, 2.3732],
    'Paris 13': [48.8322, 2.3561],
    'Paris 14': [48.8331, 2.3264],
    'Paris 15': [48.8422, 2.2995],
    'Paris 16': [48.8500, 2.2669],
    'Paris 17': [48.8846, 2.3222],
    'Paris 18': [48.8932, 2.3484],
    'Paris 19': [48.8827, 2.3742],
    'Paris 20': [48.8630, 2.3987]
  };
  
  const arrondissementData = Object.entries(arrondissementCounts)
    .map(([arrondissement, count]) => ({
      arrondissement,
      count,
      center: arrondissementCentroids[arrondissement] || [48.8566, 2.3522] // Default to center of Paris
    }))
    .sort((a, b) => b.count - a.count);
  
  // Key stats
  const totalStudios = studios.length;
  const studiosWithDates = studios.filter(s => s.estimated_opening_date).length;
  const recentPct = ((recentCount / totalStudios) * 100).toFixed(1);
  const uniqueBrands = brandMap.size;
  const studiosWithArrondissement = studios.filter(s => s.arrondissement).length;
  
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
  await fs.writeFile(path.join(OUTPUT_DIR, 'arrondissement_distribution.json'), JSON.stringify(arrondissementData, null, 2));
  
  // Modality growth over time (yoga, pilates, strength-training)
  const modalityGrowthByYear = {
    yoga: {},
    pilates: {},
    'strength-training': {}
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
    
    // Count studio for each modality it offers
    if (consolidatedCats.includes('yoga')) {
      modalityGrowthByYear.yoga[year] = (modalityGrowthByYear.yoga[year] || 0) + 1;
    }
    if (consolidatedCats.includes('pilates')) {
      modalityGrowthByYear.pilates[year] = (modalityGrowthByYear.pilates[year] || 0) + 1;
    }
    if (consolidatedCats.includes('strength-training')) {
      modalityGrowthByYear['strength-training'][year] = (modalityGrowthByYear['strength-training'][year] || 0) + 1;
    }
  });
  
  // Get all years from all modalities
  const allYears = new Set();
  Object.values(modalityGrowthByYear).forEach(yearData => {
    Object.keys(yearData).forEach(year => allYears.add(parseInt(year)));
  });
  
  const sortedYears = Array.from(allYears).sort((a, b) => a - b);
  
  const modalityGrowthData = sortedYears.map(year => ({
    year,
    yoga: modalityGrowthByYear.yoga[year] || 0,
    pilates: modalityGrowthByYear.pilates[year] || 0,
    'strength-training': modalityGrowthByYear['strength-training'][year] || 0
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
  
  console.log('✓ Computed Paris aggregates');
  console.log(`✓ Saved to ${OUTPUT_DIR}\n`);
  console.log('Summary:');
  console.log(`- Total boutique studios: ${totalStudios}`);
  console.log(`- Studios with opening dates: ${studiosWithDates} (${(studiosWithDates / totalStudios * 100).toFixed(1)}%)`);
  console.log(`- Recent openings (last 16 months): ${recentCount} (${recentPct}%)`);
  console.log(`- Unique brands: ${uniqueBrands}`);
  console.log(`- Studios with arrondissement: ${studiosWithArrondissement} (${(studiosWithArrondissement / totalStudios * 100).toFixed(1)}%)`);
  console.log(`- Top modality: ${topModality?.modality || 'N/A'} (${topModalityPct}%)`);
  console.log(`- Top arrondissement: ${arrondissementData[0]?.arrondissement || 'N/A'} (${arrondissementData[0]?.count || 0} studios)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
