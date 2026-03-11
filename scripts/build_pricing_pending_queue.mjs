#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CONSOLIDATED_PATH = path.join(ROOT, "data/processed/studios_consolidated_boutique.json");
const APPROVED_PATH = path.join(ROOT, "data/pricing/paris_pricing_approved_records.json");
const OUTPUT_PATH = path.join(ROOT, "data/pricing/paris_pricing_pending_queue.json");

function normDomain(v) {
  return String(v || "").trim().toLowerCase();
}

async function main() {
  const consolidated = JSON.parse(await fs.readFile(CONSOLIDATED_PATH, "utf8"));
  const approvedPayload = JSON.parse(await fs.readFile(APPROVED_PATH, "utf8"));
  const approved = Array.isArray(approvedPayload) ? approvedPayload : approvedPayload.records || [];

  const approvedDomains = new Set(
    approved
      .map((r) => normDomain(r.domain))
      .filter(Boolean)
  );

  const queue = [];
  const seen = new Set();

  for (const studio of consolidated) {
    const domain = normDomain(studio.domain);
    if (!domain) continue;
    if (approvedDomains.has(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);

    queue.push({
      studio_name: studio.name || null,
      domain,
      website: studio.website || null,
      categories: Array.isArray(studio.categories) ? studio.categories : [],
      arrondissement: studio.arrondissement || null,
      source: "studios_consolidated_boutique",
      status: "pending_manual_pricing_update",
    });
  }

  queue.sort((a, b) => a.domain.localeCompare(b.domain));

  const out = {
    generated_at: new Date().toISOString(),
    source_files: {
      consolidated: path.relative(ROOT, CONSOLIDATED_PATH),
      approved: path.relative(ROOT, APPROVED_PATH),
    },
    summary: {
      queue_size: queue.length,
      excluded_already_approved: approvedDomains.size,
    },
    records: queue,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Saved ${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(`Queue size: ${queue.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

