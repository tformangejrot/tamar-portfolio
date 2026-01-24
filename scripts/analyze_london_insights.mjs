#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const data = JSON.parse(await fs.readFile(
  path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json'),
  'utf8'
));

console.log('='.repeat(80));
console.log('LONDON BOUTIQUE FITNESS - KEY INSIGHTS ANALYSIS');
console.log('='.repeat(80));
console.log('');

// 1. BASIC STATS
console.log('1. BASIC STATISTICS');
console.log('-'.repeat(80));
console.log(`Total boutique studios: ${data.length}`);
const withDates = data.filter(s => s.estimated_opening_date);
console.log(`Studios with opening dates: ${withDates.length} (${(withDates.length / data.length * 100).toFixed(1)}%)`);
const withBorough = data.filter(s => s.borough);
console.log(`Studios with borough: ${withBorough.length} (${(withBorough.length / data.length * 100).toFixed(1)}%)`);
console.log('');

// 2. GROWTH OVER TIME
console.log('2. GROWTH OVER TIME (2015-2025)');
console.log('-'.repeat(80));
const yearCounts = {};
withDates.forEach(s => {
  const year = new Date(s.estimated_opening_date).getFullYear();
  if (year >= 2015 && year <= 2025) {
    yearCounts[year] = (yearCounts[year] || 0) + 1;
  }
});

const years = Object.entries(yearCounts)
  .map(([year, count]) => ({ year: parseInt(year), count }))
  .sort((a, b) => a.year - b.year);

years.forEach((y, i) => {
  const prev = years[i - 1];
  const growth = prev ? ((y.count - prev.count) / prev.count * 100).toFixed(1) : 'N/A';
  const trend = prev ? (y.count > prev.count ? '📈' : y.count < prev.count ? '📉' : '➡️') : '';
  console.log(`  ${y.year}: ${y.count} studios ${trend} (${growth}% vs previous year)`);
});

// Peak growth years
const growthRates = years.slice(1).map((y, i) => ({
  year: y.year,
  growth: ((y.count - years[i].count) / years[i].count * 100),
  count: y.count
}));
const peakGrowth = growthRates.sort((a, b) => b.growth - a.growth).slice(0, 3);
console.log('\n  Peak Growth Years:');
peakGrowth.forEach(p => {
  console.log(`    ${p.year}: ${p.growth.toFixed(1)}% growth (${p.count} studios)`);
});
console.log('');

// 3. MODALITY ANALYSIS
console.log('3. MODALITY DISTRIBUTION');
console.log('-'.repeat(80));
const modalityCounts = {};
data.forEach(s => {
  (s.categories || []).forEach(cat => {
    modalityCounts[cat] = (modalityCounts[cat] || 0) + 1;
  });
});

const topModalities = Object.entries(modalityCounts)
  .map(([mod, count]) => ({ modality: mod, count, pct: (count / data.length * 100).toFixed(1) }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 15);

topModalities.forEach((m, i) => {
  const bar = '█'.repeat(Math.floor(m.pct / 2));
  console.log(`  ${(i + 1).toString().padStart(2)}. ${m.modality.padEnd(25)} ${m.count.toString().padStart(3)} studios (${m.pct.padStart(5)}%) ${bar}`);
});
console.log('');

// 4. PILATES ANALYSIS (comparing to Paris)
console.log('4. PILATES ANALYSIS');
console.log('-'.repeat(80));
const pilatesStudios = data.filter(s => 
  (s.categories || []).some(cat => 
    cat.includes('pilates') || cat === 'pilates' || cat === 'reformer-pilates'
  )
);

const pilatesWithDates = pilatesStudios.filter(s => s.estimated_opening_date);
const pilatesYears = {};
pilatesWithDates.forEach(s => {
  const year = new Date(s.estimated_opening_date).getFullYear();
  if (year >= 2015) {
    pilatesYears[year] = (pilatesYears[year] || 0) + 1;
  }
});

console.log(`Total studios offering Pilates: ${pilatesStudios.length} (${(pilatesStudios.length / data.length * 100).toFixed(1)}%)`);
console.log('\n  Pilates openings by year (2015+):');
Object.entries(pilatesYears)
  .map(([year, count]) => ({ year: parseInt(year), count }))
  .sort((a, b) => a.year - b.year)
  .forEach(({ year, count }) => {
    console.log(`    ${year}: ${count} studios`);
  });
console.log('');

// 5. BOROUGH DISTRIBUTION
console.log('5. SPATIAL DISTRIBUTION (TOP 15 BOROUGHS)');
console.log('-'.repeat(80));
const boroughCounts = {};
data.forEach(s => {
  const borough = s.borough;
  if (borough) {
    boroughCounts[borough] = (boroughCounts[borough] || 0) + 1;
  }
});

const topBoroughs = Object.entries(boroughCounts)
  .map(([borough, count]) => ({ borough, count, pct: (count / data.length * 100).toFixed(1) }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 15);

topBoroughs.forEach((a, i) => {
  const bar = '█'.repeat(Math.floor(a.count / 5));
  console.log(`  ${(i + 1).toString().padStart(2)}. ${a.borough.padEnd(30)} ${a.count.toString().padStart(3)} studios (${a.pct.padStart(5)}%) ${bar}`);
});
console.log('');

// 6. CHAINS VS SINGLE LOCATION
console.log('6. CHAINS VS SINGLE LOCATION');
console.log('-'.repeat(80));
const brandMap = new Map();
data.forEach(s => {
  const brand = s.name || 'Unknown';
  if (!brandMap.has(brand)) {
    brandMap.set(brand, []);
  }
  brandMap.get(brand).push(s);
});

const chains = Array.from(brandMap.entries())
  .filter(([brand, studios]) => studios.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

const singleLocation = Array.from(brandMap.entries())
  .filter(([brand, studios]) => studios.length === 1);

console.log(`Single location brands: ${singleLocation.length} (${(singleLocation.length / (singleLocation.length + chains.length) * 100).toFixed(1)}%)`);
console.log(`Multi-location brands: ${chains.length} (${(chains.length / (singleLocation.length + chains.length) * 100).toFixed(1)}%)`);
console.log(`Total chain locations: ${chains.reduce((sum, [, studios]) => sum + studios.length, 0)}`);
console.log('\n  Top 10 Chains:');
chains.slice(0, 10).forEach(([brand, studios], i) => {
  console.log(`    ${(i + 1).toString().padStart(2)}. ${brand.padEnd(40)} ${studios.length} locations`);
});
console.log('');

// 7. RECENT GROWTH (2024-2025)
console.log('7. RECENT GROWTH (2024-2025)');
console.log('-'.repeat(80));
const recentStudios = withDates.filter(s => {
  const year = new Date(s.estimated_opening_date).getFullYear();
  return year >= 2024;
});

const recentModalityCounts = {};
recentStudios.forEach(s => {
  (s.categories || []).forEach(cat => {
    recentModalityCounts[cat] = (recentModalityCounts[cat] || 0) + 1;
  });
});

const topRecent = Object.entries(recentModalityCounts)
  .map(([mod, count]) => ({ modality: mod, count, pct: (count / recentStudios.length * 100).toFixed(1) }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);

console.log(`Total new studios (2024-2025): ${recentStudios.length} (${(recentStudios.length / data.length * 100).toFixed(1)}%)`);
console.log('\n  Top modalities for new studios:');
topRecent.forEach((m, i) => {
  console.log(`    ${(i + 1).toString().padStart(2)}. ${m.modality.padEnd(25)} ${m.count.toString().padStart(2)} studios (${m.pct.padStart(5)}%)`);
});
console.log('');

// 8. MODALITY COMBINATIONS (excluding "fitness" as it's too generic)
console.log('8. POPULAR MODALITY COMBINATIONS (excluding "fitness")');
console.log('-'.repeat(80));
const modalityPairs = new Map();
data.forEach(s => {
  const cats = (s.categories || []).filter(cat => cat !== 'fitness'); // Exclude generic "fitness"
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const pair = [cats[i], cats[j]].sort().join(' + ');
      modalityPairs.set(pair, (modalityPairs.get(pair) || 0) + 1);
    }
  }
});

const topPairs = Array.from(modalityPairs.entries())
  .map(([pair, count]) => ({ pair, count, pct: (count / data.length * 100).toFixed(1) }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 15); // Show top 15 since we're excluding fitness

topPairs.forEach((p, i) => {
  console.log(`  ${(i + 1).toString().padStart(2)}. ${p.pair.padEnd(50)} ${p.count.toString().padStart(3)} studios (${p.pct}%)`);
});
console.log('');

// 9. KEY INSIGHTS SUMMARY
console.log('='.repeat(80));
console.log('KEY INSIGHTS & FINDINGS');
console.log('='.repeat(80));
console.log('');

const totalPilates = pilatesStudios.length;
const pilatesPct = (totalPilates / data.length * 100).toFixed(1);
const recentPct = (recentStudios.length / data.length * 100).toFixed(1);
const topBoroughName = topBoroughs[0]?.borough || 'N/A';
const topBoroughCount = topBoroughs[0]?.count || 0;
const topModality = topModalities[0]?.modality || 'N/A';
const topModalityPct = topModalities[0]?.pct || '0';

console.log(`1. MARKET SIZE: ${data.length} boutique studios across London`);
console.log(`2. PILATES PRESENCE: ${pilatesPct}% of studios offer Pilates (${totalPilates} studios)`);
console.log(`3. RECENT GROWTH: ${recentPct}% of studios opened in 2024-2025 (${recentStudios.length} studios)`);
console.log(`4. TOP MODALITY: ${topModality} (${topModalityPct}% of studios)`);
console.log(`5. SPATIAL CONCENTRATION: ${topBoroughName} leads with ${topBoroughCount} studios`);
console.log(`6. MARKET FRAGMENTATION: ${(singleLocation.length / (singleLocation.length + chains.length) * 100).toFixed(1)}% are single-location brands`);
console.log(`7. CHAIN PRESENCE: ${chains.length} multi-location brands with ${chains.reduce((sum, [, studios]) => sum + studios.length, 0)} total locations`);
console.log('');

// 10. COMPARATIVE INSIGHTS
console.log('='.repeat(80));
console.log('SUGGESTED DASHBOARD ADDITIONS');
console.log('='.repeat(80));
console.log('');
console.log('Based on this analysis, consider adding:');
console.log('');
console.log('1. MODALITY COMBINATIONS CHART');
console.log('   - Shows which modalities are frequently offered together');
console.log('   - Reveals studio positioning strategies');
console.log('');
console.log('2. GROWTH ACCELERATION CHART');
console.log('   - Year-over-year growth rates (not just counts)');
console.log('   - Highlights peak growth periods');
console.log('');
console.log('3. BOROUGH MODALITY HEATMAP');
console.log('   - Which modalities dominate in which boroughs');
console.log('   - Spatial clustering of similar studios');
console.log('');
console.log('4. CHAIN EXPANSION TIMELINE');
console.log('   - When major chains opened their first vs subsequent locations');
console.log('   - Expansion patterns over time');
console.log('');
console.log('5. RECENT VS HISTORICAL MODALITY MIX');
console.log('   - Compare 2024-2025 openings to overall distribution');
console.log('   - Shows market evolution and emerging trends');
console.log('');
