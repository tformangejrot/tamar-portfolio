#!/usr/bin/env node

/**
 * Enrich ClassPass studio data with WHOIS-derived domain creation dates.
 *
 * Requirements:
 *   - macOS/Linux `whois` command available in PATH.
 *   - Previously generated Google enrichment file at
 *     data/processed/classpass_studios_google.json so we have website URLs.
 *
 * Usage examples:
 *   node scripts/enrich_with_whois.mjs --limit 25
 *   node scripts/enrich_with_whois.mjs --offset 100 --limit 50 --no-resume
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
const INPUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_google.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');

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

function extractDomain(website) {
  try {
    const url = new URL(website);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

function parseWhoisDate(raw) {
  if (!raw) return null;
  const patterns = [
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
      const date = new Date(candidate);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
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
  console.log(`WHOIS enrichment for ${slice.length} studios (offset ${options.offset}). Resume=${options.resume}`);

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

  console.log(`WHOIS enrichment complete. ${results.length} records written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


