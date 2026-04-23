#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOUTIQUE_PATH = path.join(ROOT, 'data/processed/berlin_studios_consolidated_boutique.json');
const CATEGORY_CONSOLIDATION_PATH = path.join(ROOT, 'data/reference/category_consolidation.json');
const OUTPUT_DIR = path.join(ROOT, 'data/aggregates/berlin');

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

function isRecentOpening(openingDate, cutoffDate = new Date('2025-04-01')) {
  if (!openingDate) return false;
  try {
    const date = new Date(openingDate);
    if (isNaN(date.getTime())) return false;
    // Last 16 months from cutoff
    const monthsAgo = (cutoffDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsAgo <= 16 && monthsAgo >= 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Loading Berlin boutique data...\n');

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
        // Filter out dates before 2000 — boutique fitness is a recent phenomenon
        if (year < 2000) return;
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

  // 3. Recent growth (last 16 months from cutoff)
  const cutoffDate = new Date('2025-04-01');
  const recentStudios = studios.filter(s => isRecentOpening(s.estimated_opening_date, cutoffDate));
  const recentCount = recentStudios.length;

  const recentModalityCounts = {};
  const recentModalityTotals = {};

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
  brandMap.forEach((locations) => {
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

  // 5. Neighborhood (district) distribution
  const neighborhoodCounts = {};
  studios.forEach(studio => {
    if (studio.neighborhood) {
      neighborhoodCounts[studio.neighborhood] = (neighborhoodCounts[studio.neighborhood] || 0) + 1;
    }
  });

  // Berlin district centroids (Ortsteile)
  const districtCentroids = {
    'Mitte':           [52.5200, 13.4050],
    'Tiergarten':      [52.5145, 13.3502],
    'Wedding':         [52.5510, 13.3620],
    'Moabit':          [52.5310, 13.3400],
    'Gesundbrunnen':   [52.5480, 13.3890],
    'Prenzlauer Berg': [52.5380, 13.4200],
    'Pankow':          [52.5690, 13.4020],
    'Weissensee':      [52.5540, 13.4660],
    'Friedrichshain':  [52.5160, 13.4540],
    'Kreuzberg':       [52.4990, 13.4030],
    'Charlottenburg':  [52.5160, 13.3040],
    'Wilmersdorf':     [52.4880, 13.3250],
    'Schoeneberg':     [52.4790, 13.3540],
    'Tempelhof':       [52.4680, 13.3850],
    'Friedenau':       [52.4660, 13.3300],
    'Neukoelln':       [52.4810, 13.4350],
    'Britz':           [52.4640, 13.4280],
    'Steglitz':        [52.4590, 13.3230],
    'Zehlendorf':      [52.4310, 13.2580],
    'Dahlem':          [52.4570, 13.2870],
    'Lichtenberg':     [52.5120, 13.5000],
    'Marzahn':         [52.5390, 13.5630],
    'Hellersdorf':     [52.5250, 13.6020],
    'Treptow':         [52.4860, 13.4700],
    'Koepenick':       [52.4410, 13.5820],
    'Adlershof':       [52.4330, 13.5350],
    'Reinickendorf':   [52.5900, 13.3380],
    'Spandau':         [52.5350, 13.1990],
  };

  const neighborhoodData = Object.entries(neighborhoodCounts)
    .map(([neighborhood, count]) => ({
      neighborhood,
      count,
      center: districtCentroids[neighborhood] || [52.5200, 13.4050] // default to Mitte
    }))
    .sort((a, b) => b.count - a.count);

  // 6. Neighborhood growth over time (per district, by opening year)
  const neighborhoodGrowthByYear = {};

  studios.forEach(studio => {
    if (!studio.estimated_opening_date || !studio.neighborhood) return;

    const date = new Date(studio.estimated_opening_date);
    if (isNaN(date.getTime())) return;

    let year = date.getFullYear();
    if (year < 2000) return;

    if (studio.opening_date_source === 'whois_domain_creation') {
      year = adjustYearForDomainRegistration(year, date.getMonth());
    }

    const neighborhood = studio.neighborhood;
    if (!neighborhoodGrowthByYear[neighborhood]) {
      neighborhoodGrowthByYear[neighborhood] = {};
    }
    neighborhoodGrowthByYear[neighborhood][year] =
      (neighborhoodGrowthByYear[neighborhood][year] || 0) + 1;
  });

  const neighborhoodGrowthYears = new Set();
  Object.values(neighborhoodGrowthByYear).forEach(yd => {
    Object.keys(yd).forEach(year => neighborhoodGrowthYears.add(parseInt(year)));
  });

  const sortedNeighborhoodGrowthYears = Array.from(neighborhoodGrowthYears).sort((a, b) => a - b);
  const allNeighborhoods = Object.keys(neighborhoodGrowthByYear).sort();

  const neighborhoodGrowthData = sortedNeighborhoodGrowthYears.map(year => {
    const yd = { year };
    allNeighborhoods.forEach(n => {
      yd[n] = neighborhoodGrowthByYear[n][year] || 0;
    });
    return yd;
  });

  // Key stats
  const totalStudios = studios.length;
  const studiosWithDates = studios.filter(s => s.estimated_opening_date).length;
  const recentPct = ((recentCount / totalStudios) * 100).toFixed(1);
  const uniqueBrands = brandMap.size;
  const studiosWithNeighborhood = studios.filter(s => s.neighborhood).length;

  const topModality = modalities[0];
  const topModalityPct = topModality ? topModality.pct : '0.0';

  // 7. Modality growth over time (all modalities)
  const modalityGrowthByYear = {};

  studios.forEach(studio => {
    if (!studio.estimated_opening_date) return;

    const date = new Date(studio.estimated_opening_date);
    if (isNaN(date.getTime())) return;

    let year = date.getFullYear();
    if (year < 2000) return;

    if (studio.opening_date_source === 'whois_domain_creation') {
      year = adjustYearForDomainRegistration(year, date.getMonth());
    }

    const consolidatedCats = consolidateCategories(studio, consolidationMap);
    consolidatedCats.forEach(modality => {
      if (!modalityGrowthByYear[modality]) {
        modalityGrowthByYear[modality] = {};
      }
      modalityGrowthByYear[modality][year] = (modalityGrowthByYear[modality][year] || 0) + 1;
    });
  });

  const allYears = new Set();
  Object.values(modalityGrowthByYear).forEach(yd => {
    Object.keys(yd).forEach(year => allYears.add(parseInt(year)));
  });

  const sortedYears = Array.from(allYears).sort((a, b) => a - b);
  const allModalities = Object.keys(modalityGrowthByYear).sort();

  const modalityGrowthData = sortedYears.map(year => {
    const yd = { year };
    allModalities.forEach(modality => {
      yd[modality] = modalityGrowthByYear[modality][year] || 0;
    });
    return yd;
  });

  // 8. Pilates combination trends
  const pilatesCombinationsByYear = {
    'yoga-pilates': {},
    'pilates-strength': {}
  };

  studios.forEach(studio => {
    if (!studio.estimated_opening_date) return;

    const date = new Date(studio.estimated_opening_date);
    if (isNaN(date.getTime())) return;

    let year = date.getFullYear();
    if (year < 2000) return;

    if (studio.opening_date_source === 'whois_domain_creation') {
      year = adjustYearForDomainRegistration(year, date.getMonth());
    }

    const consolidatedCats = consolidateCategories(studio, consolidationMap);

    if (consolidatedCats.includes('yoga') && consolidatedCats.includes('pilates')) {
      pilatesCombinationsByYear['yoga-pilates'][year] = (pilatesCombinationsByYear['yoga-pilates'][year] || 0) + 1;
    }

    if (consolidatedCats.includes('pilates') && consolidatedCats.includes('strength-training')) {
      pilatesCombinationsByYear['pilates-strength'][year] = (pilatesCombinationsByYear['pilates-strength'][year] || 0) + 1;
    }
  });

  const allCombinationYears = new Set();
  Object.values(pilatesCombinationsByYear).forEach(yd => {
    Object.keys(yd).forEach(year => allCombinationYears.add(parseInt(year)));
  });

  const sortedCombinationYears = Array.from(allCombinationYears).sort((a, b) => a - b);

  const pilatesCombinationsData = sortedCombinationYears.map(year => ({
    year,
    'yoga-pilates': pilatesCombinationsByYear['yoga-pilates'][year] || 0,
    'pilates-strength': pilatesCombinationsByYear['pilates-strength'][year] || 0
  }));

  // 9. Overall stats for the hero section
  const overallStats = {
    totalBoutiqueStudios: totalStudios,
    pctOpenedRecent: parseFloat(recentPct),
    totalModalityCategories: modalities.length,
    pilatesPct: modalities.find(m => m.modality === 'pilates')?.pct || 0,
    totalNewStudios: recentCount
  };

  // 10. Chain percentage by modality (chain = 2+ locations under same domain/brand)
  const chainMap = new Map();
  studios.forEach(studio => {
    const key = studio.domain || studio.name?.toLowerCase().trim() || 'unknown';
    if (!chainMap.has(key)) chainMap.set(key, []);
    chainMap.get(key).push(studio);
  });

  const chainStudios = new Set();
  chainMap.forEach((locations) => {
    if (locations.length >= 2) {
      locations.forEach(studio => {
        const studioId = studio.place_id || `${studio.name}|${studio.location}`;
        chainStudios.add(studioId);
      });
    }
  });

  const modalityChainStats = {};
  studios.forEach(studio => {
    const studioId = studio.place_id || `${studio.name}|${studio.location}`;
    const isChainStudio = chainStudios.has(studioId);
    const consolidatedCats = consolidateCategories(studio, consolidationMap);

    consolidatedCats.forEach(modality => {
      if (!modalityChainStats[modality]) {
        modalityChainStats[modality] = { totalStudios: 0, chainStudios: 0 };
      }
      modalityChainStats[modality].totalStudios++;
      if (isChainStudio) modalityChainStats[modality].chainStudios++;
    });
  });

  const chainPercentageData = Object.entries(modalityChainStats)
    .map(([modality, stats]) => ({
      modality,
      totalStudios: stats.totalStudios,
      chainStudios: stats.chainStudios,
      chainPercentage: stats.totalStudios > 0
        ? parseFloat(((stats.chainStudios / stats.totalStudios) * 100).toFixed(1))
        : 0,
      independentStudios: stats.totalStudios - stats.chainStudios
    }))
    .sort((a, b) => b.chainPercentage - a.chainPercentage);

  const overallChainPercentage = {
    totalStudios,
    chainStudios: chainStudios.size,
    chainPercentage: parseFloat(((chainStudios.size / totalStudios) * 100).toFixed(1)),
    independentStudios: totalStudios - chainStudios.size
  };

  // ── Write output files ────────────────────────────────────────────────────────
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await fs.writeFile(path.join(OUTPUT_DIR, 'overall_stats.json'),
    JSON.stringify(overallStats, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'modality_mix.json'),
    JSON.stringify(modalities, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'growth_over_time.json'),
    JSON.stringify(yearData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'recent_new_modalities.json'),
    JSON.stringify(newModalities, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'recent_growth_rate.json'),
    JSON.stringify(growthRateByModality, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'chains_vs_single_location.json'),
    JSON.stringify(locationData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'neighborhood_distribution.json'),
    JSON.stringify(neighborhoodData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'neighborhood_growth_by_year.json'),
    JSON.stringify(neighborhoodGrowthData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'modality_growth_by_year.json'),
    JSON.stringify(modalityGrowthData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'pilates_combinations_by_year.json'),
    JSON.stringify(pilatesCombinationsData, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'chain_percentage_by_modality.json'),
    JSON.stringify({ overall: overallChainPercentage, byModality: chainPercentageData }, null, 2));

  console.log('✓ Computed Berlin aggregates');
  console.log(`✓ Saved to ${OUTPUT_DIR}\n`);
  console.log('Summary:');
  console.log(`- Total boutique studios: ${totalStudios}`);
  console.log(`- Studios with opening dates: ${studiosWithDates} (${(studiosWithDates / totalStudios * 100).toFixed(1)}%)`);
  console.log(`- Recent openings (last 16 months): ${recentCount} (${recentPct}%)`);
  console.log(`- Unique brands: ${uniqueBrands}`);
  console.log(`- Studios with district: ${studiosWithNeighborhood} (${(studiosWithNeighborhood / totalStudios * 100).toFixed(1)}%)`);
  console.log(`- Top modality: ${topModality?.modality || 'N/A'} (${topModalityPct}%)`);
  console.log(`- Top district: ${neighborhoodData[0]?.neighborhood || 'N/A'} (${neighborhoodData[0]?.count || 0} studios)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
