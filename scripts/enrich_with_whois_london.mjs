#!/usr/bin/env node

/**
 * Enrich London ClassPass studio data with WHOIS-derived domain creation dates.
 *
 * Requirements:
 *   - macOS/Linux `whois` command available in PATH.
 *   - Previously generated Google enrichment file at
 *     data/processed/classpass_studios_google_london.json so we have website URLs.
 *
 * Usage examples:
 *   node scripts/enrich_with_whois_london.mjs --limit 25
 *   node scripts/enrich_with_whois_london.mjs --offset 100 --limit 50 --no-resume
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_google_london.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois_london.json');

function parseArgs(argv) {
  const opts = { limit: Infinity, offset: 0, resume: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-resume') {
      opts.resume = false;
    } else if (arg === '--limit') {
      opts.limit = Number(argv[++i]);
    } else if (arg.startsWith('--limit=')) {
      opts.limit = Number(arg.split('=')[1]);
    } else if (arg === '--offset') {
      opts.offset = Number(argv[++i]);
    } else if (arg.startsWith('--offset=')) {
      opts.offset = Number(arg.split('=')[1]);
    }
  }
  return opts;
}

const options = parseArgs(process.argv.slice(2));

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const entry of parsed) {
      map.set(entry.detail_url || entry.name, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

// Third-party platforms that won't give us the studio's opening date
// Note: Boutique chain gyms (like 1rebel.com, f45training.com, etc.) are NOT in this list
// because we want their domain creation dates even though they're chains
const THIRD_PARTY_DOMAINS = new Set([
  // Booking platforms
  'bookwhen.com',
  'momoyoga.com',
  'setmore.com',
  'simplybook.it',
  'appointy.com',
  'booking.appointy.com',
  'treatwell.co.uk',
  'mytreatwell.co.uk',
  // Social media
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'linkedin.com',
  'youtube.com',
  // Government/educational
  'gov.uk',
  'ac.uk',
  'org.uk',
  // Public facilities/venues
  'clubspark.lta.org.uk',
  'active.lambeth.gov.uk',
  'havering.gov.uk',
  'haringey.gov.uk',
  'better.org.uk',
  'freedom-leisure.co.uk',
  // Box gyms (excluded from boutique analysis)
  'solo60.com',
  'nuffieldhealth.com', // Mostly excluded (30/31), only 1 kept
  // Website builders/hosting
  'lpages.co',
  'lpages.io',
  'wixsite.com',
  'squarespace.com',
  'wordpress.com',
  'blogspot.com',
  'tumblr.com'
  // Removed boutique chains: f45training.com, gymbox.com, 1rebel.com, psyclelondon.com,
  // barrecore.com, barrysbootcamp.com, foundryfit.com, reformcore.com, fs8.com,
  // theperformanceworks-pt.com, everyoneactive.com, snapfitness.com, energiefitness.com,
  // thegymgroup.com (these are kept in boutique, so we want their domain dates)
]);

function extractDomain(website) {
  try {
    const url = new URL(website);
    const domain = url.hostname.replace(/^www\./i, '');
    
    // Check if it's a third-party platform
    const baseDomain = domain.split('.').slice(-2).join('.');
    if (THIRD_PARTY_DOMAINS.has(domain) || THIRD_PARTY_DOMAINS.has(baseDomain)) {
      return null; // Skip third-party platforms
    }
    
    return domain;
  } catch {
    return null;
  }
}

function parseWhoisDate(raw) {
  if (!raw) return null;
  const patterns = [
    /Registered on:\s*(.+)/i,  // UK format: "Registered on: 15-Mar-2017"
    /Creation Date:\s*(.+)/i,
    /Created On:\s*(.+)/i,
    /Registered On:\s*(.+)/i,
    /Domain Create Date:\s*(.+)/i,
    /Domain Registration Date:\s*(.+)/i,
    /Registration Time:\s*(.+)/i,
    /created:\s*(.+)/i,
    /created on:\s*(.+)/i,
    /created at:\s*(.+)/i,
    /domain created:\s*(.+)/i,
    /domain registered:\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      const candidate = match[1].split('\n')[0].trim();
      // Try parsing the date directly
      const date = new Date(candidate);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
      // Try UK format: "15-Mar-2017" -> "2017-03-15"
      const ukFormat = candidate.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
      if (ukFormat) {
        const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        const day = ukFormat[1].padStart(2, '0');
        const month = months[ukFormat[2].toLowerCase()] || '01';
        const year = ukFormat[3];
        const isoDate = `${year}-${month}-${day}`;
        const parsed = new Date(isoDate);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
      // Try ISO format: "20170315" -> "2017-03-15"
      const isoish = candidate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      const fallback = new Date(isoish);
      if (!Number.isNaN(fallback.getTime())) {
        return fallback.toISOString();
      }
    }
  }
  return null;
}

function buildWhoisCommand(domain) {
  if (!domain) throw new Error('Missing domain');
  const lower = domain.toLowerCase();
  // UK domains (.uk, .co.uk, .org.uk, etc.)
  if (lower.endsWith('.uk') || lower.endsWith('.co.uk') || lower.endsWith('.org.uk') || lower.endsWith('.ac.uk')) {
    return `whois ${domain}`;
  }
  // French domains (for any French studios that might be in London)
  if (lower.endsWith('.fr')) {
    return `whois -h whois.nic.fr ${domain}`;
  }
  if (lower.endsWith('.re') || lower.endsWith('.pm') || lower.endsWith('.tf') || lower.endsWith('.wf') || lower.endsWith('.yt')) {
    return `whois -h whois.nic.fr ${domain}`;
  }
  return `whois ${domain}`;
}

async function lookupWhois(domain) {
  const command = buildWhoisCommand(domain);
  const { stdout } = await exec(command, { timeout: 20_000 });
  const creationDate = parseWhoisDate(stdout);
  return {
    domain,
    creation_date: creationDate,
    raw: creationDate ? undefined : stdout,
  };
}

async function main() {
  const studios = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  const existing = options.resume ? await loadExisting() : new Map();
  const results = options.resume ? Array.from(existing.values()) : [];
  const seenKeys = new Set(results.map((r) => r.detail_url || r.name));

  const slice = studios.slice(options.offset, options.offset + options.limit);
  console.log(`WHOIS enrichment for ${slice.length} London studios (offset ${options.offset}). Resume=${options.resume}`);

  for (const studio of slice) {
    const key = studio.detail_url || studio.name;
    if (options.resume && seenKeys.has(key)) {
      continue;
    }
    const domain = studio.website ? extractDomain(studio.website) : null;

    if (!domain) {
      results.push({
        name: studio.name,
        detail_url: studio.detail_url,
        location: studio.location,
        website: studio.website ?? null,
        domain: null,
        creation_date: null,
        error: 'No website/domain available',
        enriched_at: new Date().toISOString(),
      });
      seenKeys.add(key);
      continue;
    }

    try {
      const whois = await lookupWhois(domain);
      results.push({
        name: studio.name,
        detail_url: studio.detail_url,
        location: studio.location,
        website: studio.website,
        domain: whois.domain,
        creation_date: whois.creation_date,
        missing_creation_date: !whois.creation_date,
        enriched_at: new Date().toISOString(),
      });
      console.log(`✓ ${studio.name} (${domain})`);
    } catch (err) {
      results.push({
        name: studio.name,
        detail_url: studio.detail_url,
        location: studio.location,
        website: studio.website,
        domain,
        creation_date: null,
        error: err.message,
        enriched_at: new Date().toISOString(),
      });
      console.warn(`✗ ${studio.name}: ${err.message}`);
    }

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
    seenKeys.add(key);
  }

  console.log(`WHOIS enrichment complete. ${results.length} London records written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
