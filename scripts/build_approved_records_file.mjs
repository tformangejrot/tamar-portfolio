#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_WAVE2 = path.join(ROOT, 'data/pricing/paris_pricing_master_wave2_no_exa.json');
const DEFAULT_WAVE1_APPROVED = path.join(ROOT, 'data/pricing/paris_pricing_master_approved_wave1.json');
const DEFAULT_EXA_MERGED = path.join(ROOT, 'data/pricing/paris_pricing_master_exa_merged.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data/pricing/paris_pricing_approved_records.json');

function parseArgs(argv) {
  const args = {
    wave2: DEFAULT_WAVE2,
    wave1Approved: DEFAULT_WAVE1_APPROVED,
    exaMerged: DEFAULT_EXA_MERGED,
    output: DEFAULT_OUTPUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--wave2=')) args.wave2 = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--wave2') args.wave2 = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--wave1-approved=')) args.wave1Approved = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--wave1-approved') args.wave1Approved = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--exa-merged=')) args.exaMerged = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--exa-merged') args.exaMerged = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--output=')) args.output = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--output') args.output = path.resolve(ROOT, argv[++i]);
  }
  return args;
}

function normalizeDomain(v) {
  return String(v ?? '').trim().toLowerCase();
}

function hasKnownPricing(record) {
  if (Number.isFinite(record?.drop_in?.price)) return true;
  if (Array.isArray(record?.intro_offers) && record.intro_offers.length > 0) return true;
  if (Array.isArray(record?.class_packs) && record.class_packs.length > 0) return true;
  if (Array.isArray(record?.memberships) && record.memberships.length > 0) return true;
  return false;
}

function isApproved(record) {
  // Never include records explicitly marked out-of-scope.
  if (record?.excluded_from_scope === true) return false;

  // Primary approval paths.
  if (record?.manual_verified === true) return true;
  if (record?.review_required === false) return true;

  // Defensive fallback:
  // if flags drift but record has concrete pricing and is public, keep it usable.
  if (record?.pricing_publicly_available === true && hasKnownPricing(record)) return true;

  return false;
}

async function readJson(pathname) {
  try {
    return JSON.parse(await fs.readFile(pathname, 'utf8'));
  } catch {
    return [];
  }
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const wave2 = await readJson(args.wave2);
  const wave1Approved = await readJson(args.wave1Approved);
  const exaMerged = await readJson(args.exaMerged);

  const baseMap = new Map();
  for (const row of wave2) {
    const domain = normalizeDomain(row.domain);
    if (!domain) continue;
    baseMap.set(domain, row);
  }

  // Promote manual verified rows from EXA-merged history if missing in wave2.
  let mergedFromExa = 0;
  for (const row of exaMerged) {
    const domain = normalizeDomain(row.domain);
    if (!domain || row.manual_verified !== true) continue;
    const existing = baseMap.get(domain);
    if (!existing || existing.manual_verified !== true) {
      baseMap.set(domain, row);
      mergedFromExa += 1;
    }
  }

  // Promote approved wave1 rows if still missing.
  let mergedFromWave1 = 0;
  for (const row of wave1Approved) {
    const domain = normalizeDomain(row.domain);
    if (!domain || !isApproved(row)) continue;
    const existing = baseMap.get(domain);
    if (!existing || !isApproved(existing)) {
      baseMap.set(domain, row);
      mergedFromWave1 += 1;
    }
  }

  const all = Array.from(baseMap.values());
  const approved = all
    .filter(isApproved)
    .sort((a, b) => normalizeDomain(a.domain).localeCompare(normalizeDomain(b.domain)));

  const payload = {
    generated_at: new Date().toISOString(),
    source_files: {
      wave2_no_exa: args.wave2,
      wave1_approved: args.wave1Approved,
      exa_merged: args.exaMerged,
    },
    summary: {
      approved_records: approved.length,
      manual_verified_records: approved.filter((r) => r.manual_verified === true).length,
      auto_approved_records: approved.filter((r) => r.review_required === false).length,
      merged_manual_from_exa: mergedFromExa,
      merged_approved_from_wave1: mergedFromWave1,
    },
    records: approved,
  };

  await ensureParentDir(args.output);
  await fs.writeFile(args.output, JSON.stringify(payload, null, 2));

  console.log(`Saved canonical approved records to ${args.output}`);
  console.log(`Summary: ${JSON.stringify(payload.summary)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
