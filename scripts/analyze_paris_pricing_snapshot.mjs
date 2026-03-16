#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const INPUT_PATH = path.join(ROOT, "data/pricing/paris_pricing_approved_records.json");
const OUTPUT_DIR = path.join(ROOT, "data/pricing/analysis");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "paris_pricing_snapshot.json");
const OUTPUT_MD = path.join(OUTPUT_DIR, "paris_pricing_snapshot.md");

const MAIN_MODALITIES = [
  "pilates",
  "yoga",
  "strength-training",
  "hiit-bootcamp",
  "reformer-pilates",
  "dance",
  "boxing",
  "stretching",
  "cycling",
  "barre",
  "prenatal-postnatal",
  "low-impact-training",
  "martial-arts",
  "running",
];

const MODALITY_CAPACITY_PROXY = {
  pilates: 18,
  yoga: 24,
  "strength-training": 16,
  "hiit-bootcamp": 20,
  "reformer-pilates": 12,
  dance: 22,
  boxing: 18,
  stretching: 20,
  cycling: 28,
  barre: 20,
  "prenatal-postnatal": 14,
  "low-impact-training": 18,
  "martial-arts": 20,
  running: 30,
};

const GEO_BUCKETS = [
  { key: "central", label: "Central", arrs: [1, 2, 3, 4] },
  { key: "west_southwest", label: "West+Southwest", arrs: [5, 6, 7, 8, 15, 16, 17] },
  { key: "east_northeast", label: "East+Northeast", arrs: [9, 10, 11, 12, 18, 19, 20] },
  { key: "south_southeast", label: "South+Southeast", arrs: [13, 14] },
];

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stddev(values) {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return round(Math.sqrt(variance));
}

function stats(values) {
  if (!values.length) return { n: 0 };
  const q1 = percentile(values, 0.25);
  const median = percentile(values, 0.5);
  const q3 = percentile(values, 0.75);
  return {
    n: values.length,
    min: round(Math.min(...values)),
    q1: round(q1),
    median: round(median),
    q3: round(q3),
    max: round(Math.max(...values)),
    mean: round(values.reduce((a, b) => a + b, 0) / values.length),
    stddev: stddev(values),
  };
}

function parseClassesPerMonth(membership) {
  if (Number.isFinite(membership?.estimated_classes_per_month)) {
    return Number(membership.estimated_classes_per_month);
  }

  if (Number.isFinite(membership?.classes_included) && membership.classes_included > 0) {
    return Number(membership.classes_included);
  }

  const classes = String(membership?.classes_included ?? "").toLowerCase();
  const perMonth = classes.match(/(\d+(?:\.\d+)?)\s*\/\s*month/);
  if (perMonth) return Number(perMonth[1]);

  const perWeek = classes.match(/(\d+(?:\.\d+)?)\s*\/\s*week/);
  if (perWeek) return Number(perWeek[1]) * 4;

  return null;
}

function toMarkdownTable(rows, headers) {
  const header = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${header}\n${sep}\n${body}`;
}

function formatNum(v) {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${v}`;
}

function toBucketPricesByStudio(rows, bucket) {
  const perStudio = new Map();
  for (const row of rows) {
    if (row.classes !== bucket || !Number.isFinite(row.price_per_class) || row.price_per_class <= 0) continue;
    const key = String(row.domain || "");
    const arr = perStudio.get(key) || [];
    arr.push(row.price_per_class);
    perStudio.set(key, arr);
  }
  return Array.from(perStudio.values())
    .map((arr) => percentile(arr, 0.5))
    .filter((v) => Number.isFinite(v));
}

function buildRangeHistogram(values, bins) {
  const out = bins.map((b) => ({ ...b, count: 0 }));
  for (const value of values) {
    const bin = out.find((b) => {
      if (b.max == null) return value >= b.min;
      return value >= b.min && value < b.max;
    });
    if (bin) bin.count += 1;
  }
  return out.map((b) => ({ label: b.label, count: b.count }));
}

function isUnlimitedMembership(membership) {
  const ci = String(membership?.classes_included || "").toLowerCase();
  const name = String(membership?.name || "").toLowerCase();
  return ci.includes("unlimited") || ci.includes("illimit") || name.includes("unlimited") || name.includes("illim");
}

function inferUnlimitedDurationMonths(membership) {
  if (Number.isFinite(membership?.commitment_months) && membership.commitment_months > 0) {
    return Number(membership.commitment_months);
  }
  const name = `${String(membership?.name || "").toLowerCase()} ${String(membership?.notes || "").toLowerCase()}`;
  if (name.includes("1 week") || name.includes("1 semaine")) return 0.25;
  if (name.includes("1 month") || name.includes("1 mois")) return 1;
  if (name.includes("2 months") || name.includes("2 mois")) return 2;
  if (name.includes("3 months") || name.includes("3 mois")) return 3;
  if (name.includes("6 months") || name.includes("6 mois")) return 6;
  if (name.includes("1 an") || name.includes("1 year") || name.includes("12 mois")) return 12;
  return null;
}

function parseArrondissementNumber(value) {
  const txt = String(value || "").toLowerCase();
  const match = txt.match(/\b([1-9]|1[0-9]|20)\b/);
  if (!match) return null;
  const n = Number(match[1]);
  if (n >= 1 && n <= 20) return n;
  return null;
}

function getGeoBucket(arrondissementNumber) {
  for (const b of GEO_BUCKETS) {
    if (b.arrs.includes(arrondissementNumber)) return b;
  }
  return null;
}

function classifyIntroType(offer) {
  const classes = Number(offer?.classes_included);
  const txt = `${String(offer?.type || "").toLowerCase()} ${String(offer?.name || "").toLowerCase()} ${String(offer?.notes || "").toLowerCase()}`;
  if (txt.includes("unlimited") || txt.includes("illimit")) return "intro_unlimited";
  if (classes === 1) return "single_discounted_class";
  if (classes === 3) return "pack_3";
  if (classes === 5) return "pack_5";
  return "single_discounted_class";
}

function parseExpirationBucket(validityDays, text) {
  const notes = String(text || "").toLowerCase();
  if (notes.includes("no expiration") || notes.includes("sans expiration") || notes.includes("illimit")) {
    return "no_expiration";
  }
  if (!Number.isFinite(validityDays) || validityDays <= 0) return null;
  if (validityDays <= 40) return "1_month";
  if (validityDays <= 75) return "2_months";
  if (validityDays <= 110) return "3_months";
  if (validityDays <= 220) return "6_months";
  if (validityDays <= 420) return "12_months";
  return "no_expiration";
}

function hasKnownPricing(record) {
  const dropIn = Number(record?.drop_in?.price);
  if (Number.isFinite(dropIn) && dropIn > 0) return true;
  if ((record?.intro_offers || []).length > 0) return true;
  if ((record?.class_packs || []).length > 0) return true;
  if ((record?.memberships || []).length > 0) return true;
  if ((record?.discounts || []).length > 0) return true;
  return false;
}

function computeSlice(activeRecords, approvedTotal = null) {
  const active = activeRecords;
  const studiosWithDropIn = active.filter((r) => Number.isFinite(r.drop_in?.price));
  const studiosWithPacks = active.filter((r) => (r.class_packs || []).length > 0);
  const studiosWithMemberships = active.filter((r) => (r.memberships || []).length > 0);
  const studiosWithIntro = active.filter((r) => (r.intro_offers || []).length > 0);
  const studiosUsingCredits = active.filter((r) => r.uses_credit_system === true);
  const totalStudios = active.length || 1;

  const dropInPrices = studiosWithDropIn.map((r) => Number(r.drop_in.price)).filter((v) => Number.isFinite(v) && v > 0);
  const dropInStats = stats(dropInPrices);

  const allPacks = [];
  const allMemberships = [];
  const allIntros = [];

  for (const studio of active) {
    const dropIn = Number(studio?.drop_in?.price);
    for (const offer of studio.intro_offers || []) {
      const introPrice = Number(offer?.price);
      const classes = Number(offer?.classes_included);
      const pricePerClass = Number.isFinite(introPrice) && Number.isFinite(classes) && classes > 0 ? introPrice / classes : introPrice;
      let discountPct = null;
      if (Number.isFinite(pricePerClass) && pricePerClass > 0 && Number.isFinite(dropIn) && dropIn > 0) {
        discountPct = ((dropIn - pricePerClass) / dropIn) * 100;
      }
      allIntros.push({
        domain: studio.domain,
        studio_name: studio.studio_name,
        type: classifyIntroType(offer),
        price: Number.isFinite(introPrice) ? introPrice : null,
        classes_included: Number.isFinite(classes) ? classes : null,
        price_per_class: Number.isFinite(pricePerClass) ? pricePerClass : null,
        discount_vs_dropin_pct: Number.isFinite(discountPct) ? discountPct : null,
      });
    }

    for (const pack of studio.class_packs || []) {
      const classes = Number(pack.classes);
      const totalPrice = Number(pack.total_price);
      const ppc = Number(pack.price_per_class);
      const explicitDisc = Number(pack.discount_vs_dropin_pct);
      const inferredDisc =
        Number.isFinite(ppc) && ppc > 0 && Number.isFinite(dropIn) && dropIn > 0
          ? ((dropIn - ppc) / dropIn) * 100
          : null;
      const validity = Number(pack?.validity_days);
      allPacks.push({
        domain: studio.domain,
        studio_name: studio.studio_name,
        classes,
        total_price: Number.isFinite(totalPrice) ? totalPrice : null,
        price_per_class: Number.isFinite(ppc) ? ppc : null,
        discount_vs_dropin_pct: Number.isFinite(explicitDisc) ? explicitDisc : inferredDisc,
        validity_days: Number.isFinite(validity) ? validity : null,
        validity_bucket: parseExpirationBucket(validity, `${pack?.notes || ""} ${studio?.expiration_policy?.notes || ""}`),
      });
    }

    for (const membership of studio.memberships || []) {
      const monthly = Number(membership.monthly_price);
      if (!Number.isFinite(monthly) || monthly <= 0) continue;
      const classesPerMonth = parseClassesPerMonth(membership);
      const explicitPpc = Number(membership.effective_price_per_class);
      const effectivePpc =
        Number.isFinite(explicitPpc) && explicitPpc > 0
          ? explicitPpc
          : Number.isFinite(classesPerMonth) && classesPerMonth > 0
            ? monthly / classesPerMonth
            : null;
      const rawDiscount = Number(membership.discount_vs_dropin_pct);
      const inferredDisc =
        Number.isFinite(effectivePpc) && effectivePpc > 0 && Number.isFinite(dropIn) && dropIn > 0
          ? ((dropIn - effectivePpc) / dropIn) * 100
          : null;
      allMemberships.push({
        domain: studio.domain,
        studio_name: studio.studio_name,
        name: membership.name,
        monthly_price: monthly,
        classes_per_month: classesPerMonth,
        effective_price_per_class: Number.isFinite(effectivePpc) ? effectivePpc : null,
        discount_vs_dropin_pct: Number.isFinite(rawDiscount) ? rawDiscount : inferredDisc,
        drop_in_price: Number.isFinite(dropIn) ? dropIn : null,
        commitment_months: Number(membership.commitment_months),
        is_unlimited: isUnlimitedMembership(membership),
      });
    }
  }

  const packBuckets = [5, 10, 20];
  const packBenchmarks = packBuckets.map((bucket) => {
    const rows = toBucketPricesByStudio(allPacks, bucket);
    return { bucket: `${bucket} classes`, ...stats(rows) };
  });

  const membershipBuckets = [4, 8, 12];
  const membershipBenchmarks = membershipBuckets.map((bucket) => {
    const rows = allMemberships.filter((m) => m.classes_per_month === bucket);
    return {
      bucket: `${bucket} classes/mo`,
      ...stats(rows.map((r) => r.monthly_price)),
      ppc_median: round(percentile(rows.map((r) => r.effective_price_per_class).filter(Number.isFinite), 0.5)),
    };
  });

  const unlimitedRows = allMemberships.filter((m) => m.is_unlimited);
  const unlimitedStats = stats(unlimitedRows.map((m) => m.monthly_price));

  const layer1DropInBins = buildRangeHistogram(dropInPrices, [
    { label: "<25EUR", min: Number.NEGATIVE_INFINITY, max: 25 },
    { label: "25-28EUR", min: 25, max: 28 },
    { label: "28-30EUR", min: 28, max: 30 },
    { label: "30-32EUR", min: 30, max: 32 },
    { label: "32-35EUR", min: 32, max: 35 },
    { label: "35-40EUR", min: 35, max: 40 },
    { label: "40EUR+", min: 40, max: null },
  ]);

  const modalityDropInComparison = MAIN_MODALITIES.map((modality) => {
    const values = active
      .filter((r) => Array.isArray(r.categories) && r.categories.includes(modality))
      .map((r) => Number(r.drop_in?.price))
      .filter((v) => Number.isFinite(v) && v > 0);
    const st = stats(values);
    return {
      modality,
      n: st.n || 0,
      avg_drop_in: st.mean ?? null,
      median_drop_in: st.median ?? null,
      min_drop_in: st.min ?? null,
      max_drop_in: st.max ?? null,
      q1: st.q1 ?? null,
      q3: st.q3 ?? null,
      range: Number.isFinite(st.min) && Number.isFinite(st.max) ? round(st.max - st.min) : null,
    };
  }).filter((r) => r.n > 0);

  const pricingOptionCoverage = (() => {
    const hasPackSize = (record, size) => (record.class_packs || []).some((p) => Number(p?.classes) === size);
    const hasCadence = (record, cadence) => (record.memberships || []).some((m) => parseClassesPerMonth(m) === cadence);
    const hasUnlimitedDuration = (record, targetMonths) =>
      (record.memberships || []).some((m) => {
        if (!isUnlimitedMembership(m)) return false;
        const duration = inferUnlimitedDurationMonths(m);
        return duration != null && Math.abs(duration - targetMonths) < 0.01;
      });
    const hasIntroByClasses = (record, classes) => (record.intro_offers || []).some((o) => Number(o?.classes_included) === classes);

    const rows = [
      { option: "drop_in", count: active.filter((r) => Number.isFinite(Number(r.drop_in?.price))).length },
      { option: "pack_5", count: active.filter((r) => hasPackSize(r, 5)).length },
      { option: "pack_10", count: active.filter((r) => hasPackSize(r, 10)).length },
      { option: "pack_20", count: active.filter((r) => hasPackSize(r, 20)).length },
      { option: "pack_30", count: active.filter((r) => hasPackSize(r, 30)).length },
      { option: "pack_40", count: active.filter((r) => hasPackSize(r, 40)).length },
      { option: "pack_50", count: active.filter((r) => hasPackSize(r, 50)).length },
      { option: "membership_4_per_month", count: active.filter((r) => hasCadence(r, 4)).length },
      { option: "membership_8_per_month", count: active.filter((r) => hasCadence(r, 8)).length },
      { option: "membership_12_per_month", count: active.filter((r) => hasCadence(r, 12)).length },
      { option: "unlimited_1_week", count: active.filter((r) => hasUnlimitedDuration(r, 0.25)).length },
      { option: "unlimited_1_month", count: active.filter((r) => hasUnlimitedDuration(r, 1)).length },
      { option: "unlimited_3_months", count: active.filter((r) => hasUnlimitedDuration(r, 3)).length },
      { option: "unlimited_annual", count: active.filter((r) => hasUnlimitedDuration(r, 12)).length },
      { option: "intro_3_class_pack", count: active.filter((r) => hasIntroByClasses(r, 3)).length },
      { option: "single_trial_class", count: active.filter((r) => hasIntroByClasses(r, 1)).length },
    ];
    return rows.map((row) => ({
      ...row,
      pct: round((row.count / totalStudios) * 100, 1),
    }));
  })();

  const discountCurves = (() => {
    const packSizes = [5, 10, 20, 30, 40, 50];
    const packBySize = packSizes
      .map((size) => {
        const values = allPacks
          .filter((p) => p.classes === size && Number.isFinite(p.discount_vs_dropin_pct))
          .map((p) => p.discount_vs_dropin_pct);
        const st = stats(values);
        return { bucket: `${size} classes`, ...st };
      })
      .filter((row) => row.n > 0);

    const cadenceBuckets = [4, 8, 12];
    const membershipByCadence = cadenceBuckets
      .map((cadence) => {
        const values = allMemberships
          .filter((m) => m.classes_per_month === cadence)
          .map((m) => m.discount_vs_dropin_pct)
          .filter((v) => Number.isFinite(v));
        const st = stats(values);
        return { bucket: `${cadence} classes/mo`, ...st };
      })
      .filter((row) => row.n > 0);

    return { pack_by_size: packBySize, membership_by_cadence: membershipByCadence };
  })();

  const unlimitedBreakEven = (() => {
    const perStudio = [];
    for (const studio of active) {
      const memberships = studio.memberships || [];
      const unlimitedMonthlyLike = memberships
        .filter((m) => isUnlimitedMembership(m))
        .map((m) => ({
          monthly_price: Number(m.monthly_price),
          duration_months: inferUnlimitedDurationMonths(m),
        }))
        .filter((m) => Number.isFinite(m.monthly_price) && m.monthly_price > 0)
        .filter((m) => m.duration_months === 1 || m.duration_months === 12)
        .map((m) => m.monthly_price);
      if (!unlimitedMonthlyLike.length) continue;
      const unlimitedMonthly = Math.min(...unlimitedMonthlyLike);

      const altPpcs = [];
      const dropIn = Number(studio?.drop_in?.price);
      if (Number.isFinite(dropIn) && dropIn > 0) altPpcs.push(dropIn);
      for (const p of studio.class_packs || []) {
        const ppc = Number(p?.price_per_class);
        if (Number.isFinite(ppc) && ppc > 0) altPpcs.push(ppc);
      }
      for (const m of memberships) {
        if (isUnlimitedMembership(m)) continue;
        const explicit = Number(m?.effective_price_per_class);
        if (Number.isFinite(explicit) && explicit > 0) {
          altPpcs.push(explicit);
          continue;
        }
        const monthly = Number(m?.monthly_price);
        const classes = parseClassesPerMonth(m);
        if (Number.isFinite(monthly) && monthly > 0 && Number.isFinite(classes) && classes > 0) {
          altPpcs.push(monthly / classes);
        }
      }
      const bestAltPpc = altPpcs.length ? Math.min(...altPpcs) : null;
      if (!Number.isFinite(bestAltPpc) || bestAltPpc <= 0) continue;

      const be = unlimitedMonthly / bestAltPpc;
      if (!Number.isFinite(be) || be <= 0) continue;
      perStudio.push({
        domain: studio.domain,
        studio_name: studio.studio_name,
        unlimited_monthly_price: round(unlimitedMonthly),
        best_alternative_price_per_class: round(bestAltPpc),
        break_even_classes_per_month: round(be),
      });
    }
    const beValues = perStudio.map((r) => r.break_even_classes_per_month).filter(Number.isFinite);
    const beStats = stats(beValues);
    return {
      studios_considered: perStudio.length,
      average_break_even_classes_per_month: beStats.mean ?? null,
      median_break_even_classes_per_month: beStats.median ?? null,
      p25_break_even_classes_per_month: beStats.q1 ?? null,
      p75_break_even_classes_per_month: beStats.q3 ?? null,
      details_preview: perStudio.sort((a, b) => b.break_even_classes_per_month - a.break_even_classes_per_month).slice(0, 8),
      methodology: {
        unlimited_scope: "monthly_or_annual_only",
        studio_level_rule: "break_even = cheapest_unlimited_monthly_equivalent / best_non_unlimited_price_per_class",
      },
    };
  })();

  const monthlyStats = stats(allMemberships.map((m) => m.monthly_price));
  const monthlyHighThreshold =
    Number.isFinite(monthlyStats.q3) && Number.isFinite(monthlyStats.q1)
      ? round(monthlyStats.q3 + 1.5 * (monthlyStats.q3 - monthlyStats.q1))
      : null;
  const ppcRows = allMemberships.filter((m) => Number.isFinite(m.effective_price_per_class));
  const ppcStats = stats(ppcRows.map((m) => m.effective_price_per_class));
  const ppcHighThreshold =
    Number.isFinite(ppcStats.q3) && Number.isFinite(ppcStats.q1) ? round(ppcStats.q3 + 1.5 * (ppcStats.q3 - ppcStats.q1)) : null;
  const membershipOutliers = allMemberships
    .filter((m) => {
      const highMonthly = monthlyHighThreshold != null && m.monthly_price > monthlyHighThreshold;
      const highPpc = ppcHighThreshold != null && Number.isFinite(m.effective_price_per_class) && m.effective_price_per_class > ppcHighThreshold;
      return highMonthly || highPpc;
    })
    .map((m) => ({
      ...m,
      monthly_price: round(m.monthly_price),
      effective_price_per_class: round(m.effective_price_per_class),
      outlier_type: [
        monthlyHighThreshold != null && m.monthly_price > monthlyHighThreshold ? "high_monthly_price" : null,
        ppcHighThreshold != null && Number.isFinite(m.effective_price_per_class) && m.effective_price_per_class > ppcHighThreshold
          ? "high_effective_price_per_class"
          : null,
      ]
        .filter(Boolean)
        .join(", "),
    }))
    .sort((a, b) => b.monthly_price - a.monthly_price)
    .slice(0, 20);

  const layer2Intro = (() => {
    const introPrices = allIntros.map((i) => i.price).filter(Number.isFinite);
    const introPpcs = allIntros.map((i) => i.price_per_class).filter(Number.isFinite);
    const discounts = allIntros.map((i) => i.discount_vs_dropin_pct).filter((v) => Number.isFinite(v) && v >= 0);
    const byTypeMap = new Map();
    for (const key of ["single_discounted_class", "pack_3", "pack_5", "intro_unlimited", "no_intro_offer"]) {
      byTypeMap.set(key, 0);
    }
    for (const i of allIntros) byTypeMap.set(i.type, (byTypeMap.get(i.type) || 0) + 1);
    byTypeMap.set("no_intro_offer", active.length - studiosWithIntro.length);
    return {
      pct_studios_with_intro: round((studiosWithIntro.length / totalStudios) * 100, 1),
      average_intro_price: round(introPrices.reduce((a, b) => a + b, 0) / (introPrices.length || 1)),
      average_intro_price_per_class: round(introPpcs.reduce((a, b) => a + b, 0) / (introPpcs.length || 1)),
      intro_types: Array.from(byTypeMap.entries()).map(([type, count]) => ({ type, count })),
      intro_discount_histogram: buildRangeHistogram(discounts, [
        { label: "0-10%", min: 0, max: 10 },
        { label: "10-20%", min: 10, max: 20 },
        { label: "20-30%", min: 20, max: 30 },
        { label: "30-40%", min: 30, max: 40 },
        { label: "40%+", min: 40, max: null },
      ]),
    };
  })();

  const layer3Pack = (() => {
    const table = [5, 10, 20, 30, 50].map((size) => {
      const rows = allPacks.filter((p) => p.classes === size && Number.isFinite(p.price_per_class));
      const byStudio = new Map();
      for (const p of rows) {
        const list = byStudio.get(p.domain) || [];
        list.push(p);
        byStudio.set(p.domain, list);
      }
      const representative = Array.from(byStudio.values()).map((items) => {
        const ppcs = items.map((i) => i.price_per_class).filter(Number.isFinite);
        const discounts = items.map((i) => i.discount_vs_dropin_pct).filter(Number.isFinite);
        return {
          ppc: percentile(ppcs, 0.5),
          discount: percentile(discounts, 0.5),
        };
      });
      const ppcs = representative.map((r) => r.ppc).filter(Number.isFinite);
      const discounts = representative.map((r) => r.discount).filter(Number.isFinite);
      return {
        pack: `${size} pack`,
        n_studios: representative.length,
        avg_price_per_class: round(ppcs.reduce((a, b) => a + b, 0) / (ppcs.length || 1)),
        avg_discount_vs_dropin_pct: round(discounts.reduce((a, b) => a + b, 0) / (discounts.length || 1)),
      };
    });

    const buildExpirationSlice = (rows, scopeLabel) => {
      const expirationCounts = new Map([
        ["1_month", 0],
        ["2_months", 0],
        ["3_months", 0],
        ["6_months", 0],
        ["12_months", 0],
        ["no_expiration", 0],
      ]);
      const rowsWithValidity = rows.filter((p) => Boolean(p.validity_bucket));
      const studios = new Set(rows.map((p) => p.domain).filter(Boolean));
      const studiosWithValidity = new Set(rowsWithValidity.map((p) => p.domain).filter(Boolean));
      for (const p of rowsWithValidity) {
        expirationCounts.set(p.validity_bucket, (expirationCounts.get(p.validity_bucket) || 0) + 1);
      }
      return {
        scope_label: scopeLabel,
        n_pack_rows: rows.length,
        n_pack_rows_with_validity: rowsWithValidity.length,
        n_studios: studios.size,
        n_studios_with_validity: studiosWithValidity.size,
        histogram: [
          { label: "1 month", count: expirationCounts.get("1_month") || 0 },
          { label: "2 months", count: expirationCounts.get("2_months") || 0 },
          { label: "3 months", count: expirationCounts.get("3_months") || 0 },
          { label: "6 months", count: expirationCounts.get("6_months") || 0 },
          { label: "12 months", count: expirationCounts.get("12_months") || 0 },
          { label: "No expiration", count: expirationCounts.get("no_expiration") || 0 },
        ],
      };
    };
    const uniquePackSizes = Array.from(
      new Set(
        allPacks
          .map((p) => p.classes)
          .filter((v) => Number.isFinite(v) && v > 0)
      )
    ).sort((a, b) => a - b);
    const expirationByPackSize = {
      all: buildExpirationSlice(allPacks, "All pack sizes"),
    };
    for (const size of uniquePackSizes) {
      const rows = allPacks.filter((p) => p.classes === size);
      expirationByPackSize[String(size)] = buildExpirationSlice(rows, `${size}-pack only`);
    }
    return {
      pack_table: table,
      pack_expiration_available_pack_sizes: uniquePackSizes,
      pack_expiration_by_pack_size: expirationByPackSize,
      // Backward-compat default view.
      pack_expiration_scope: expirationByPackSize["10"] || expirationByPackSize.all,
      pack_expiration_histogram: (expirationByPackSize["10"] || expirationByPackSize.all).histogram,
    };
  })();

  const layer4Membership = (() => {
    const noMembership = active.filter((s) => !(s.memberships || []).length).length;
    const classOnly = active.filter((s) => {
      const m = s.memberships || [];
      return m.length > 0 && m.some((x) => !isUnlimitedMembership(x)) && !m.some((x) => isUnlimitedMembership(x));
    }).length;
    const unlimitedOnly = active.filter((s) => {
      const m = s.memberships || [];
      return m.length > 0 && m.every((x) => isUnlimitedMembership(x));
    }).length;
    const both = active.filter((s) => {
      const m = s.memberships || [];
      return m.length > 0 && m.some((x) => isUnlimitedMembership(x)) && m.some((x) => !isUnlimitedMembership(x));
    }).length;

    const membershipTypeRows = [
      { label: "4 classes/month", matcher: (m) => !m.is_unlimited && m.classes_per_month === 4 },
      { label: "8 classes/month", matcher: (m) => !m.is_unlimited && m.classes_per_month === 8 },
      { label: "12 classes/month", matcher: (m) => !m.is_unlimited && m.classes_per_month === 12 },
      { label: "Unlimited", matcher: (m) => m.is_unlimited },
    ].map(({ label, matcher }) => {
      const rows = allMemberships.filter(matcher);
      const monthly = rows.map((r) => r.monthly_price).filter(Number.isFinite);
      const ppc = rows.map((r) => r.effective_price_per_class).filter(Number.isFinite);
      const studios = new Set(rows.map((r) => r.domain).filter(Boolean));
      return {
        membership_type: label,
        n_memberships: rows.length,
        n_studios: studios.size,
        avg_monthly_price: round(monthly.reduce((a, b) => a + b, 0) / (monthly.length || 1)),
        avg_effective_price_per_class: round(ppc.reduce((a, b) => a + b, 0) / (ppc.length || 1)),
      };
    });

    const denom = studiosWithMemberships.length || 1;
    const commitmentCounts = {
      no_commitment: 0,
      commitment_3_months: 0,
      commitment_6_months: 0,
      commitment_12_months: 0,
    };
    for (const studio of active) {
      const memberships = studio.memberships || [];
      if (!memberships.length) continue;
      const commitments = memberships
        .map((m) => Number(m.commitment_months))
        .filter((c) => Number.isFinite(c) && c > 0);
      const maxCommitment = commitments.length ? Math.max(...commitments) : 0;
      if (maxCommitment <= 1) commitmentCounts.no_commitment += 1;
      else if (maxCommitment <= 3) commitmentCounts.commitment_3_months += 1;
      else if (maxCommitment <= 6) commitmentCounts.commitment_6_months += 1;
      else commitmentCounts.commitment_12_months += 1;
    }

    return {
      pct_studios_with_memberships: round((studiosWithMemberships.length / totalStudios) * 100, 1),
      pct_with_unlimited_memberships: round((active.filter((s) => (s.memberships || []).some((m) => isUnlimitedMembership(m))).length / totalStudios) * 100, 1),
      pct_with_class_based_memberships: round(
        (active.filter((s) => (s.memberships || []).some((m) => !isUnlimitedMembership(m))).length / totalStudios) * 100,
        1
      ),
      membership_adoption_pie: [
        { type: "no_membership", count: noMembership },
        { type: "class_based_membership", count: classOnly },
        { type: "unlimited_membership", count: unlimitedOnly },
        { type: "both", count: both },
      ],
      membership_types_table: membershipTypeRows,
      membership_type_methodology: {
        unlimited_effective_price_per_class:
          "Uses explicit effective_price_per_class where available. No synthetic classes-per-month is assumed for unlimited plans.",
      },
      commitment_structure: {
        denominator_studios_with_memberships: denom,
        methodology:
          "Mutually exclusive studio buckets by highest commitment found across memberships: <=1 month no commitment, <=3 months, <=6 months, >6 months.",
        pct_no_commitment: round((commitmentCounts.no_commitment / denom) * 100, 1),
        pct_3_month_commitment: round((commitmentCounts.commitment_3_months / denom) * 100, 1),
        pct_6_month_commitment: round((commitmentCounts.commitment_6_months / denom) * 100, 1),
        pct_12_month_commitment: round((commitmentCounts.commitment_12_months / denom) * 100, 1),
      },
    };
  })();

  const layer5Strategy = (() => {
    const gapRows = [];
    const scatter = [];
    for (const studio of active) {
      const drop = Number(studio?.drop_in?.price);
      if (!Number.isFinite(drop) || drop <= 0) continue;
      const tenPacks = (studio.class_packs || [])
        .filter((p) => Number(p?.classes) === 10)
        .map((p) => Number(p?.price_per_class))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (!tenPacks.length) continue;
      const tenPackPpc = percentile(tenPacks, 0.5);
      const discountPct = ((drop - tenPackPpc) / drop) * 100;
      gapRows.push(discountPct);

      const classMembershipRows = (studio.memberships || [])
        .map((m) => {
          if (isUnlimitedMembership(m)) return null;
          const explicit = Number(m?.effective_price_per_class);
          const monthly = Number(m?.monthly_price);
          const classes = parseClassesPerMonth(m);
          if (!Number.isFinite(classes) || classes <= 0) return null;
          if (Number.isFinite(explicit) && explicit > 0) {
            return { ppc: explicit, classes_per_month: classes };
          }
          if (Number.isFinite(monthly) && monthly > 0) {
            return { ppc: monthly / classes, classes_per_month: classes };
          }
          return null;
        })
        .filter((v) => v && Number.isFinite(v.ppc) && v.ppc > 0 && Number.isFinite(v.classes_per_month) && v.classes_per_month > 0);
      if (!classMembershipRows.length) continue;
      const lowestTier = Math.min(...classMembershipRows.map((r) => r.classes_per_month));
      const tierRows = classMembershipRows.filter((r) => r.classes_per_month === lowestTier);
      const membershipPpc = Math.min(...tierRows.map((r) => r.ppc));
      scatter.push({
        studio_name: studio.studio_name,
        domain: studio.domain,
        x: round(tenPackPpc),
        y: round(membershipPpc),
        membership_tier_classes_per_month: lowestTier,
      });
    }
    const xs = scatter.map((p) => p.x).filter(Number.isFinite);
    const ys = scatter.map((p) => p.y).filter(Number.isFinite);
    const minAxis = xs.length && ys.length ? round(Math.min(...xs, ...ys)) : null;
    const maxAxis = xs.length && ys.length ? round(Math.max(...xs, ...ys)) : null;
    return {
      avg_drop_in_to_10_pack_price_diff_pct: round(gapRows.reduce((a, b) => a + b, 0) / (gapRows.length || 1)),
      dropin_vs_10pack_discount_histogram: buildRangeHistogram(gapRows, [
        { label: "0-10%", min: 0, max: 10 },
        { label: "10-20%", min: 10, max: 20 },
        { label: "20-30%", min: 20, max: 30 },
        { label: "30-40%", min: 30, max: 40 },
        { label: "40%+", min: 40, max: null },
      ]),
      scatter_methodology:
        "Each point compares 10-pack EUR/class (x) vs lowest available non-unlimited membership tier EUR/class (y) for that studio.",
      scatter_sample_size: scatter.length,
      scatter_diagonal_reference:
        Number.isFinite(minAxis) && Number.isFinite(maxAxis)
          ? [{ x: minAxis, y: minAxis }, { x: maxAxis, y: maxAxis }]
          : [],
      membership_vs_pack_scatter: scatter,
    };
  })();

  const layer6Economics = (() => {
    const rows = MAIN_MODALITIES.map((modality) => {
      const values = active
        .filter((r) => Array.isArray(r.categories) && r.categories.includes(modality))
        .map((r) => Number(r.drop_in?.price))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (!values.length) return null;
      const avgPrice = values.reduce((a, b) => a + b, 0) / values.length;
      const cap = MODALITY_CAPACITY_PROXY[modality] ?? 18;
      return {
        modality,
        avg_drop_in_price: round(avgPrice),
        avg_capacity: cap,
        estimated_max_revenue_per_class: round(avgPrice * cap),
      };
    }).filter(Boolean);
    return {
      assumptions: {
        methodology: "estimated_max_revenue_per_class = avg_drop_in_price * proxy_capacity",
        proxy_capacity_by_modality: MODALITY_CAPACITY_PROXY,
      },
      modality_revenue_table: rows,
    };
  })();

  const layer7MarketStructure = (() => {
    const boxplots = modalityDropInComparison.map((m) => ({
      modality: m.modality,
      min: m.min_drop_in,
      q1: m.q1,
      median: m.median_drop_in,
      q3: m.q3,
      max: m.max_drop_in,
    }));

    const bucketValues = new Map();
    for (const bucket of GEO_BUCKETS) bucketValues.set(bucket.key, []);
    let unknownCount = 0;
    for (const studio of active) {
      const drop = Number(studio?.drop_in?.price);
      if (!Number.isFinite(drop) || drop <= 0) continue;
      const arr = parseArrondissementNumber(studio.arrondissement);
      if (!arr) {
        unknownCount += 1;
        continue;
      }
      const bucket = getGeoBucket(arr);
      if (!bucket) {
        unknownCount += 1;
        continue;
      }
      bucketValues.get(bucket.key).push(drop);
    }

    const geographic = GEO_BUCKETS.map((bucket) => {
      const values = bucketValues.get(bucket.key) || [];
      return {
        area: bucket.label,
        avg_drop_in: round(values.reduce((a, b) => a + b, 0) / (values.length || 1)),
        studio_count: values.length,
      };
    });
    return {
      pricing_spread_boxplots: boxplots,
      geographic_pricing: {
        bucket_mapping: GEO_BUCKETS.map((b) => ({ area: b.label, arrondissements: b.arrs })),
        area_avg_dropin: geographic,
        unknown_arrondissement_count: unknownCount,
      },
    };
  })();

  const layer8Profiles = (() => {
    const counts = new Map([
      ["pack_driven", 0],
      ["membership_driven", 0],
      ["hybrid", 0],
      ["no_offer_other", 0],
    ]);
    for (const studio of active) {
      const hasPacks = (studio.class_packs || []).length > 0;
      const hasMemberships = (studio.memberships || []).length > 0;
      let key = "no_offer_other";
      if (hasPacks && hasMemberships) key = "hybrid";
      else if (hasPacks) key = "pack_driven";
      else if (hasMemberships) key = "membership_driven";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return {
      distribution: Array.from(counts.entries()).map(([studio_type, count]) => ({
        studio_type,
        count,
        pct: round((count / totalStudios) * 100, 1),
      })),
    };
  })();

  return {
    sample: {
      approved_records_total: approvedTotal ?? active.length,
      in_scope_records: active.length,
      coverage: {
        with_drop_in: studiosWithDropIn.length,
        with_class_packs: studiosWithPacks.length,
        with_memberships: studiosWithMemberships.length,
        with_intro_offers: studiosWithIntro.length,
      },
      credit_systems: {
        count: studiosUsingCredits.length,
        pct: round((studiosUsingCredits.length / totalStudios) * 100, 1),
        examples: studiosUsingCredits.slice(0, 8).map((r) => r.domain),
      },
    },
    benchmarks: {
      drop_in: dropInStats,
      drop_in_distribution: layer1DropInBins,
      class_pack_price_per_class: packBenchmarks,
      memberships_monthly_price_by_classes_per_month: membershipBenchmarks,
      unlimited_memberships_monthly_price: unlimitedStats,
    },
    modality_drop_in_comparison: modalityDropInComparison,
    pricing_option_coverage: pricingOptionCoverage,
    discount_curves: discountCurves,
    unlimited_break_even: unlimitedBreakEven,
    outlier_thresholds: {
      monthly_price_high: monthlyHighThreshold,
      membership_effective_price_per_class_high: ppcHighThreshold,
    },
    membership_outliers: membershipOutliers,
    layers: {
      layer1_market_overview: {
        studios_analyzed: active.length,
        with_pricing_available: studiosWithDropIn.length,
        with_memberships: studiosWithMemberships.length,
        offering_intro_offers: studiosWithIntro.length,
        dropin_metrics: {
          average: dropInStats.mean ?? null,
          median: dropInStats.median ?? null,
          lowest: dropInStats.min ?? null,
          highest: dropInStats.max ?? null,
          stddev: dropInStats.stddev ?? null,
        },
        methodology: {
          dropin_distribution_source: "Drop-in distribution is built only from drop_in.price values (not intro offers, packs, or memberships).",
        },
        dropin_distribution: layer1DropInBins,
        modality_pricing_table: modalityDropInComparison.map((m) => ({
          modality: m.modality,
          n_studios: m.n,
          avg_drop_in: m.avg_drop_in,
          median_drop_in: m.median_drop_in,
          min_drop_in: m.min_drop_in,
          max_drop_in: m.max_drop_in,
          range: m.range,
        })),
      },
      layer2_pricing_structure: layer2Intro,
      layer3_pack_pricing: layer3Pack,
      layer4_membership_models: layer4Membership,
      layer5_pricing_strategy: layer5Strategy,
      layer6_modality_economics_v1: layer6Economics,
      layer7_market_structure: layer7MarketStructure,
      layer8_business_model_profiles: layer8Profiles,
    },
  };
}

async function main() {
  const raw = JSON.parse(await fs.readFile(INPUT_PATH, "utf8"));
  const records = Array.isArray(raw) ? raw : raw.records || [];
  const active = records
    .filter((r) => r.excluded_from_scope !== true)
    .filter(hasKnownPricing);

  const base = computeSlice(active, records.length);
  base.sample.excluded_records = records.length - active.length;

  const snapshot = {
    generated_at: new Date().toISOString(),
    source: path.relative(ROOT, INPUT_PATH),
    ...base,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(snapshot, null, 2));

  const md = `# Paris Pricing Snapshot

Generated: ${snapshot.generated_at}

## Coverage

- In-scope studios: **${snapshot.sample.in_scope_records}** (excluded: ${snapshot.sample.excluded_records})
- With drop-in pricing: **${snapshot.sample.coverage.with_drop_in}**
- With class packs: **${snapshot.sample.coverage.with_class_packs}**
- With memberships: **${snapshot.sample.coverage.with_memberships}**
- With intro offers: **${snapshot.sample.coverage.with_intro_offers}**

## Layer 1 quick metrics

${toMarkdownTable(
    [[
      formatNum(snapshot.layers.layer1_market_overview.studios_analyzed),
      formatNum(snapshot.layers.layer1_market_overview.dropin_metrics.average),
      formatNum(snapshot.layers.layer1_market_overview.dropin_metrics.median),
      formatNum(snapshot.layers.layer1_market_overview.dropin_metrics.stddev),
    ]],
    ["Studios", "Avg drop-in", "Median drop-in", "Drop-in stddev"]
  )}

## Layer 3 pack pricing

${toMarkdownTable(
    snapshot.layers.layer3_pack_pricing.pack_table.map((row) => [
      row.pack,
      formatNum(row.avg_price_per_class),
      formatNum(row.avg_discount_vs_dropin_pct),
    ]),
    ["Pack", "Avg EUR/class", "Avg discount vs drop-in %"]
  )}

## Layer 4 commitment structure

${toMarkdownTable(
    [[
      formatNum(snapshot.layers.layer4_membership_models.commitment_structure.pct_no_commitment),
      formatNum(snapshot.layers.layer4_membership_models.commitment_structure.pct_3_month_commitment),
      formatNum(snapshot.layers.layer4_membership_models.commitment_structure.pct_6_month_commitment),
      formatNum(snapshot.layers.layer4_membership_models.commitment_structure.pct_12_month_commitment),
    ]],
    ["No commitment %", "3 months %", "6 months %", "12 months %"]
  )}

---

Source file: \`${path.relative(ROOT, INPUT_PATH)}\`
`;

  await fs.writeFile(OUTPUT_MD, md);
  console.log(`Saved ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`Saved ${path.relative(ROOT, OUTPUT_MD)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
