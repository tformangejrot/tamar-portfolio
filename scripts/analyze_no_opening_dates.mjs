#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const allData = JSON.parse(await fs.readFile(
  path.join(ROOT, 'data/processed/studios_consolidated_london.json'),
  'utf8'
));

const boutiqueData = JSON.parse(await fs.readFile(
  path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json'),
  'utf8'
));

const boutiqueSet = new Set(boutiqueData.map(s => s.detail_url));

const noOpeningDate = allData.filter(s => !s.estimated_opening_date);

console.log('Total studios:', allData.length);
console.log('Studios without opening dates:', noOpeningDate.length);
console.log('');

// 1. No website at all
const noWebsite = noOpeningDate.filter(s => !s.website || s.website === null);
console.log('1. No website at all:', noWebsite.length);

// 2. Have website - categorize them
const withWebsite = noOpeningDate.filter(s => s.website);

// True third-party booking platforms (not chain gyms)
const trueThirdPartyDomains = new Set([
  'bookwhen.com', 'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'youtube.com',
  'gov.uk', 'ac.uk', 'momoyoga.com', 'setmore.com', 'simplybook.it', 'appointy.com',
  'booking.appointy.com', 'treatwell.co.uk', 'mytreatwell.co.uk', 'clubspark.lta.org.uk',
  'active.lambeth.gov.uk', 'havering.gov.uk', 'haringey.gov.uk', 'better.org.uk',
  'freedom-leisure.co.uk', 'lpages.co', 'lpages.io', 'wixsite.com',
  'squarespace.com', 'wordpress.com', 'blogspot.com', 'tumblr.com'
]);

// Chain gym domains (these are actual studio chains, not booking platforms)
const chainGymDomains = new Set([
  'nuffieldhealth.com', 'thegymgroup.com', 'snapfitness.com', 'f45training.com',
  'gymbox.com', 'energiefitness.com', '1rebel.com', 'solo60.com',
  'barrysbootcamp.com', 'psyclelondon.com', 'barrecore.com', 'foundryfit.com',
  'reformcore.com', 'fs8.com', 'theperformanceworks-pt.com', 'everyoneactive.com'
]);

function extractDomain(website) {
  try {
    const url = new URL(website);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

const trueThirdParty = [];
const chainGyms = [];
const other = [];

withWebsite.forEach(s => {
  const domain = extractDomain(s.website);
  if (!domain) {
    other.push({...s, domain: null});
    return;
  }
  
  const baseDomain = domain.split('.').slice(-2).join('.');
  if (trueThirdPartyDomains.has(domain) || trueThirdPartyDomains.has(baseDomain)) {
    trueThirdParty.push({...s, domain});
  } else if (chainGymDomains.has(domain) || chainGymDomains.has(baseDomain)) {
    chainGyms.push({...s, domain});
  } else {
    other.push({...s, domain});
  }
});

console.log('2. True third-party booking platforms:', trueThirdParty.length);
console.log('3. Chain gyms:', chainGyms.length);
console.log('4. Other (single-location or failed lookups):', other.length);
console.log('');

// Analyze chain gyms - which are kept vs excluded
const chainMap = new Map();
chainGyms.forEach(s => {
  const base = s.domain.split('.').slice(-2).join('.');
  if (!chainMap.has(base)) {
    chainMap.set(base, []);
  }
  chainMap.get(base).push(s);
});

const chainAnalysis = Array.from(chainMap.entries())
  .map(([domain, studios]) => {
    const boutiqueCount = studios.filter(s => boutiqueSet.has(s.detail_url)).length;
    const excludedCount = studios.length - boutiqueCount;
    return {
      domain,
      total: studios.length,
      boutique: boutiqueCount,
      excluded: excludedCount,
      sample: studios[0]
    };
  })
  .sort((a, b) => b.total - a.total);

console.log('=== CHAIN GYMS BREAKDOWN ===');
console.log('(Shows which chains are kept in boutique vs excluded as box gyms)\n');

const keptChains = chainAnalysis.filter(c => c.boutique > 0);
const excludedChains = chainAnalysis.filter(c => c.boutique === 0);

if (keptChains.length > 0) {
  console.log('CHAINS KEPT IN BOUTIQUE (we care about opening dates):');
  keptChains.forEach(c => {
    const pct = ((c.boutique / c.total) * 100).toFixed(0);
    console.log(`  ${c.domain}: ${c.boutique}/${c.total} kept (${pct}%) - e.g., ${c.sample.name}`);
  });
  console.log('');
}

if (excludedChains.length > 0) {
  console.log('CHAINS EXCLUDED AS BOX GYMS (we don\'t care about opening dates):');
  excludedChains.forEach(c => {
    console.log(`  ${c.domain}: ${c.total} locations - e.g., ${c.sample.name}`);
  });
  console.log('');
}

const totalKept = keptChains.reduce((sum, c) => sum + c.boutique, 0);
const totalExcluded = excludedChains.reduce((sum, c) => sum + c.total, 0) + 
                      keptChains.reduce((sum, c) => sum + c.excluded, 0);

console.log(`Summary: ${totalKept} chain locations kept, ${totalExcluded} excluded\n`);

console.log('=== TRUE THIRD-PARTY PLATFORMS BREAKDOWN ===');
const platformCounts = {};
trueThirdParty.forEach(s => {
  const domain = s.domain || extractDomain(s.website);
  const base = domain?.split('.').slice(-2).join('.') || 'unknown';
  platformCounts[base] = (platformCounts[base] || 0) + 1;
});
Object.entries(platformCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([platform, count]) => {
    console.log(`  ${platform}: ${count} studios`);
  });
