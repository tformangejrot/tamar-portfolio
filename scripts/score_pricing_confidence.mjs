#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_INPUT = path.join(ROOT, 'data/pricing/paris_pricing_master.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data/pricing/paris_pricing_master.json');

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--input=')) args.input = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--input') args.input = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--output=')) args.output = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--output') args.output = path.resolve(ROOT, argv[++i]);
  }
  return args;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function collectQualityFlags(record) {
  const flags = new Set(record.extraction_meta?.quality_flags ?? []);
  const packs = Array.isArray(record.class_packs) ? record.class_packs : [];
  const memberships = Array.isArray(record.memberships) ? record.memberships : [];

  for (const pack of packs) {
    const expected = pack.classes && pack.total_price ? Math.round((pack.total_price / pack.classes) * 100) / 100 : null;
    if (expected !== null && pack.price_per_class !== null && Math.abs(expected - pack.price_per_class) > 0.2) {
      flags.add('computed_price_per_class_mismatch');
      break;
    }
  }

  for (let i = 1; i < packs.length; i += 1) {
    const prev = packs[i - 1];
    const cur = packs[i];
    if (prev.classes && cur.classes && prev.classes < cur.classes && prev.price_per_class && cur.price_per_class) {
      if (cur.price_per_class - prev.price_per_class > 0.5) {
        flags.add('conflicting_pack_math');
        break;
      }
    }
  }

  for (const membership of memberships) {
    if (/engagement/i.test(membership.name ?? '') && membership.commitment_months === null) {
      flags.add('membership_commitment_ambiguous');
    }
    const expected =
      membership.monthly_price && membership.estimated_classes_per_month
        ? Math.round((membership.monthly_price / membership.estimated_classes_per_month) * 100) / 100
        : null;
    if (expected !== null && membership.effective_price_per_class !== null && Math.abs(expected - membership.effective_price_per_class) > 0.2) {
      flags.add('membership_effective_price_mismatch');
    }
  }

  if (record.pricing_publicly_available === true && !record.pricing_url) {
    flags.add('missing_pricing_url');
  }
  if (
    record.pricing_publicly_available === true &&
    !record.drop_in?.price &&
    packs.length === 0 &&
    memberships.length === 0
  ) {
    flags.add('pricing_detected_but_sparse_structured_fields');
  }

  return Array.from(flags);
}

function scoreRecord(record) {
  let score = 0;
  const reasons = [];
  const qualityFlags = collectQualityFlags(record);

  if (record.pricing_publicly_available === true) {
    score += 25;
    reasons.push('public_pricing');
  } else if (record.pricing_publicly_available === false) {
    score -= 15;
    reasons.push('no_public_pricing');
  }

  if (record.drop_in?.price) {
    score += 15;
    reasons.push('drop_in');
  }
  if (record.drop_in_by_modality && Object.keys(record.drop_in_by_modality).length > 0) {
    score += 10;
    reasons.push('modality_drop_in');
  }

  const introCount = record.intro_offers?.length ?? 0;
  const packCount = record.class_packs?.length ?? 0;
  const membershipCount = record.memberships?.length ?? 0;
  const discountCount = record.discounts?.length ?? 0;

  if (introCount > 0) {
    score += Math.min(12, 4 + introCount * 2);
    reasons.push('intro_offers');
  }
  if (packCount > 0) {
    score += Math.min(20, 6 + packCount * 2);
    reasons.push('class_packs');
  }
  if (membershipCount > 0) {
    score += Math.min(20, 6 + membershipCount * 2);
    reasons.push('memberships');
  }
  if (discountCount > 0) {
    score += Math.min(8, 2 + discountCount);
    reasons.push('discounts');
  }

  if (record.pricing_url) {
    score += 8;
    reasons.push('pricing_url');
  }
  if (record.booking_software) {
    score += 6;
    reasons.push('booking_software');
  }

  if (record.expiration_policy?.single_class_validity_days || record.expiration_policy?.pack_validity_days) {
    score += 6;
    reasons.push('expiration_structured');
  } else if (record.expiration_policy?.notes) {
    score += 3;
    reasons.push('expiration_notes');
  }

  if ((record.notes ?? '').toLowerCase().includes('not confidently extracted')) {
    score -= 20;
    reasons.push('low_confidence_parse');
  }
  if ((record.notes ?? '').toLowerCase().includes('unavailable')) {
    score -= 20;
    reasons.push('page_unavailable');
  }

  const evidenceLineCount = record.extraction_meta?.evidence_line_count;
  if (typeof evidenceLineCount === 'number') {
    if (evidenceLineCount >= 30) score += 8;
    else if (evidenceLineCount >= 10) score += 4;
    else if (evidenceLineCount > 0) score += 1;
  }
  if (record.extraction_meta?.rendered_fallback_used === true) {
    score += 3;
    reasons.push('rendered_fallback_used');
  }

  const exaMeta = record.exa_enrichment ?? null;
  if (exaMeta?.exa_used === true) {
    reasons.push('exa_used');
    const exaSourcesCount = exaMeta.exa_sources?.length ?? 0;
    if (exaSourcesCount >= 2) {
      score += 5;
      reasons.push('exa_multi_source');
    } else if (exaSourcesCount === 1) {
      score += 2;
      reasons.push('exa_single_source');
    }

    const exaActions = exaMeta.exa_actions ?? [];
    if (exaActions.some((action) => String(action).startsWith('corroborated:'))) {
      score += 4;
      reasons.push('exa_corroborated');
    }
    if (exaActions.some((action) => String(action).startsWith('filled:'))) {
      score += 3;
      reasons.push('exa_filled_missing');
    }
  }

  const conflictReasonsCount = (record.conflict_reasons?.length ?? 0) + (record.exa_enrichment?.conflict_reasons?.length ?? 0);
  if (conflictReasonsCount > 0) {
    score -= Math.min(25, conflictReasonsCount * 8);
    reasons.push('unresolved_conflicts');
  }

  if (qualityFlags.length > 0) {
    const severe = qualityFlags.filter((f) =>
      ['conflicting_pack_math', 'computed_price_per_class_mismatch', 'membership_effective_price_mismatch'].includes(f),
    ).length;
    const mild = qualityFlags.length - severe;
    score -= severe * 10 + mild * 4;
    reasons.push('quality_gates_failed');
  }

  score = clamp(Math.round(score), 0, 100);

  let tier = 'low';
  if (score >= 75) tier = 'high';
  else if (score >= 45) tier = 'medium';

  const reviewRequired =
    tier !== 'high' ||
    record.pricing_publicly_available !== true ||
    conflictReasonsCount > 0 ||
    qualityFlags.length > 0;

  return {
    score,
    tier,
    reviewRequired,
    reasons,
    qualityFlags,
  };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const records = JSON.parse(await fs.readFile(options.input, 'utf8'));

  const scored = records.map((record) => {
    const confidence = scoreRecord(record);
    return {
      ...record,
      confidence_score: confidence.score,
      confidence_tier: confidence.tier,
      review_required: confidence.reviewRequired,
      confidence_reasons: confidence.reasons,
      quality_flags: confidence.qualityFlags,
    };
  });

  await ensureParentDir(options.output);
  await fs.writeFile(options.output, JSON.stringify(scored, null, 2));

  const summary = {
    total: scored.length,
    high: scored.filter((r) => r.confidence_tier === 'high').length,
    medium: scored.filter((r) => r.confidence_tier === 'medium').length,
    low: scored.filter((r) => r.confidence_tier === 'low').length,
    review_required: scored.filter((r) => r.review_required).length,
  };

  console.log(`Scored ${scored.length} pricing records`);
  console.log(`Summary: ${JSON.stringify(summary)}`);
  console.log(`Saved to ${options.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
