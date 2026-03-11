#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const APPROVED_PATH = path.join(ROOT, "data/pricing/paris_pricing_approved_records.json");
const REPORT_PATH = path.join(ROOT, "data/pricing/analysis/prune_complete_report.json");

const EXCLUDED_SCOPE_KEYWORDS = [
  "ems",
  "electrical-muscle-stimulation",
  "electrostimulation",
  "infrabike",
  "infrarun",
  "infra",
  "cryotherapy",
  "cryo",
  "sauna",
  "recovery",
];

function hasKnownPricing(record) {
  const dropIn = Number(record?.drop_in?.price);
  if (Number.isFinite(dropIn) && dropIn > 0) return true;
  if ((record?.intro_offers || []).length > 0) return true;
  if ((record?.class_packs || []).length > 0) return true;
  if ((record?.memberships || []).length > 0) return true;
  return false;
}

function isConceptExcluded(record) {
  const categories = (record?.categories || []).map((v) => String(v).toLowerCase());
  const haystack = [
    ...(record?.categories || []),
    record?.studio_name,
    record?.domain,
    record?.website,
    record?.notes,
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return EXCLUDED_SCOPE_KEYWORDS.some(
    (kw) => categories.some((c) => c.includes(kw)) || haystack.includes(kw)
  );
}

function isCompleteRecord(record) {
  return (
    record?.manual_verified === true &&
    record?.excluded_from_scope !== true &&
    !isConceptExcluded(record) &&
    hasKnownPricing(record)
  );
}

async function main() {
  const payload = JSON.parse(await fs.readFile(APPROVED_PATH, "utf8"));
  const records = Array.isArray(payload) ? payload : payload.records || [];

  const kept = records.filter(isCompleteRecord);
  const removed = records
    .filter((r) => !isCompleteRecord(r))
    .map((r) => ({
      domain: r.domain || null,
      studio_name: r.studio_name || null,
      manual_verified: r.manual_verified === true,
      review_required: r.review_required,
      excluded_from_scope: r.excluded_from_scope === true,
      has_known_pricing: hasKnownPricing(r),
      concept_excluded: isConceptExcluded(r),
    }))
    .sort((a, b) => String(a.domain || "").localeCompare(String(b.domain || "")));

  const out = {
    generated_at: new Date().toISOString(),
    source: path.relative(ROOT, APPROVED_PATH),
    summary: {
      original_records: records.length,
      kept_complete_records: kept.length,
      removed_records: removed.length,
    },
    removed_preview: removed.slice(0, 200),
  };

  const newPayload = {
    ...payload,
    generated_at: new Date().toISOString(),
    summary: {
      approved_records: kept.length,
      manual_verified_records: kept.filter((r) => r.manual_verified === true).length,
      auto_approved_records: kept.filter((r) => r.review_required === false).length,
      pruned_with_rule: "manual_verified_and_known_pricing_and_in_scope",
    },
    records: kept.sort((a, b) => String(a.domain || "").localeCompare(String(b.domain || ""))),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(APPROVED_PATH, JSON.stringify(newPayload, null, 2));
  await fs.writeFile(REPORT_PATH, JSON.stringify(out, null, 2));

  console.log(`Pruned approved records: ${records.length} -> ${kept.length}`);
  console.log(`Saved report: ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

