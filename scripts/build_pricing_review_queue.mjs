#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_INPUT = path.join(ROOT, 'data/pricing/paris_pricing_master.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data/pricing/paris_pricing_review_queue.json');

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

function toQueueItem(record) {
  return {
    studio_name: record.studio_name,
    domain: record.domain,
    website: record.website,
    pricing_url: record.pricing_url,
    booking_software: record.booking_software,
    pricing_publicly_available: record.pricing_publicly_available,
    confidence_score: record.confidence_score ?? null,
    confidence_tier: record.confidence_tier ?? null,
    review_required: record.review_required ?? true,
    review_reason: record.confidence_reasons ?? [],
    conflict_reasons: record.conflict_reasons ?? record.exa_enrichment?.conflict_reasons ?? [],
    exa_status: record.exa_enrichment?.exa_status ?? null,
    exa_used: record.exa_enrichment?.exa_used ?? false,
    quick_stats: {
      has_drop_in: Boolean(record.drop_in?.price),
      intro_offers: record.intro_offers?.length ?? 0,
      class_packs: record.class_packs?.length ?? 0,
      memberships: record.memberships?.length ?? 0,
      discounts: record.discounts?.length ?? 0,
    },
    notes: record.notes ?? '',
  };
}

function sortByConfidenceDesc(a, b) {
  return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
}

function classifyReviewBucket(record) {
  const qualityFlags = record.quality_flags ?? record.extraction_meta?.quality_flags ?? [];
  if (qualityFlags.includes('conflicting_pack_math')) return 'conflicting_pack_math';
  if (qualityFlags.includes('membership_commitment_ambiguous')) return 'membership_commitment_ambiguous';
  if (qualityFlags.includes('missing_rendered_content') || qualityFlags.includes('sparse_price_evidence')) {
    return 'missing_rendered_content';
  }
  const categories = (record.categories ?? []).map((c) => String(c).toLowerCase());
  const likelyNonBoutique = categories.some((c) =>
    /(association|club municipal|federation|aquatique public|multisport general)/i.test(c),
  );
  if (likelyNonBoutique || record.pricing_publicly_available === false) return 'likely_non_boutique';
  return 'other';
}

function reviewPriority(record) {
  const score = Number(record.confidence_score ?? 0);
  const nearThreshold = score >= 60 && score < 75 ? 100 : 0;
  const hasGoodCoverage =
    (record.class_packs?.length ?? 0) + (record.memberships?.length ?? 0) + (record.intro_offers?.length ?? 0) > 0;
  const coverageBonus = hasGoodCoverage ? 20 : 0;
  return nearThreshold + coverageBonus + score;
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const records = JSON.parse(await fs.readFile(options.input, 'utf8'));

  const autoApproved = records
    .filter((record) => record.review_required === false)
    .sort(sortByConfidenceDesc)
    .map(toQueueItem);

  const reviewRequired = records
    .filter((record) => record.review_required !== false)
    .sort((a, b) => reviewPriority(b) - reviewPriority(a))
    .map((record) => ({
      ...toQueueItem(record),
      review_bucket: classifyReviewBucket(record),
      review_priority: reviewPriority(record),
      quality_flags: record.quality_flags ?? [],
    }));

  const nonPublic = records
    .filter((record) => record.pricing_publicly_available === false)
    .sort(sortByConfidenceDesc)
    .map(toQueueItem);

  const resolvedByExa = records
    .filter((record) => {
      const actions = record.exa_enrichment?.exa_actions ?? [];
      const hasExaResolution = actions.some((action) => /^filled:|^corroborated:|^overwrote:/.test(String(action)));
      const hasConflicts = (record.conflict_reasons?.length ?? 0) > 0;
      return record.exa_enrichment?.exa_used === true && hasExaResolution && !hasConflicts;
    })
    .sort(sortByConfidenceDesc)
    .map(toQueueItem);

  const conflictNeedsReview = records
    .filter((record) => {
      const conflictCount =
        (record.conflict_reasons?.length ?? 0) + (record.exa_enrichment?.conflict_reasons?.length ?? 0);
      return conflictCount > 0;
    })
    .sort(sortByConfidenceDesc)
    .map(toQueueItem);

  const stillMissingPublicPricing = records
    .filter((record) => record.pricing_publicly_available === false)
    .sort(sortByConfidenceDesc)
    .map(toQueueItem);

  const missingRenderedContent = reviewRequired.filter((r) => r.review_bucket === 'missing_rendered_content');
  const conflictingPackMath = reviewRequired.filter((r) => r.review_bucket === 'conflicting_pack_math');
  const membershipCommitmentAmbiguous = reviewRequired.filter((r) => r.review_bucket === 'membership_commitment_ambiguous');
  const likelyNonBoutique = reviewRequired.filter((r) => r.review_bucket === 'likely_non_boutique');
  const nearThresholdReview = reviewRequired.filter((r) => (r.confidence_score ?? 0) >= 60 && (r.confidence_score ?? 0) < 75);

  const queue = {
    generated_at: new Date().toISOString(),
    source_file: options.input,
    summary: {
      total_records: records.length,
      auto_approved_count: autoApproved.length,
      review_required_count: reviewRequired.length,
      non_public_pricing_count: nonPublic.length,
      resolved_by_exa_count: resolvedByExa.length,
      conflict_needs_review_count: conflictNeedsReview.length,
      still_missing_public_pricing_count: stillMissingPublicPricing.length,
      missing_rendered_content_count: missingRenderedContent.length,
      conflicting_pack_math_count: conflictingPackMath.length,
      membership_commitment_ambiguous_count: membershipCommitmentAmbiguous.length,
      likely_non_boutique_count: likelyNonBoutique.length,
      near_threshold_review_count: nearThresholdReview.length,
      high_confidence_count: records.filter((r) => r.confidence_tier === 'high').length,
      medium_confidence_count: records.filter((r) => r.confidence_tier === 'medium').length,
      low_confidence_count: records.filter((r) => r.confidence_tier === 'low').length,
    },
    auto_approved: autoApproved,
    review_required: reviewRequired,
    non_public_pricing: nonPublic,
    resolved_by_exa: resolvedByExa,
    conflict_needs_review: conflictNeedsReview,
    still_missing_public_pricing: stillMissingPublicPricing,
    missing_rendered_content: missingRenderedContent,
    conflicting_pack_math: conflictingPackMath,
    membership_commitment_ambiguous: membershipCommitmentAmbiguous,
    likely_non_boutique: likelyNonBoutique,
    near_threshold_review: nearThresholdReview,
  };

  await ensureParentDir(options.output);
  await fs.writeFile(options.output, JSON.stringify(queue, null, 2));

  console.log(`Built review queue for ${records.length} records`);
  console.log(`Auto-approved: ${autoApproved.length}`);
  console.log(`Needs review: ${reviewRequired.length}`);
  console.log(`Saved to ${options.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
