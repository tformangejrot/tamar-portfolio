#!/usr/bin/env node

/**
 * Clean Nairobi studios dataset by verifying websites and extracting modalities.
 *
 * Inputs:
 *   - data/processed/nairobi_studios_consolidated.json
 *
 * Outputs:
 *   - data/processed/nairobi_studios_cleaned.json
 *   - data/processed/nairobi_studios_cleaned.csv
 *   - data/processed/nairobi_studios_needs_review.json
 *   - data/processed/nairobi_studios_needs_review.csv
 *
 * Notes:
 * - Uses keyword + structure heuristics (no browser automation).
 * - Designed to be resumable via --resume (default true).
 *
 * Usage examples:
 *   node scripts/clean_nairobi_studios.mjs --limit 30
 *   node scripts/clean_nairobi_studios.mjs --offset 30 --limit 50
 *   node scripts/clean_nairobi_studios.mjs --no-resume --checkpoint-every 25
 *   tail -f data/processed/nairobi_studios_clean_progress.jsonl
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/nairobi_studios_consolidated.json');
const REFERENCE_CATEGORIES_PATH = path.join(ROOT, 'data/reference/nairobi_categories.json');

const OUTPUT_CLEANED_JSON = path.join(ROOT, 'data/processed/nairobi_studios_cleaned.json');
const OUTPUT_CLEANED_CSV = path.join(ROOT, 'data/processed/nairobi_studios_cleaned.csv');
const OUTPUT_REVIEW_JSON = path.join(ROOT, 'data/processed/nairobi_studios_needs_review.json');
const OUTPUT_REVIEW_CSV = path.join(ROOT, 'data/processed/nairobi_studios_needs_review.csv');
const OUTPUT_PROGRESS_JSONL = path.join(ROOT, 'data/processed/nairobi_studios_clean_progress.jsonl');

const DEFAULTS = {
  limit: Infinity,
  offset: 0,
  resume: true,
  verbose: true,
  // Write full JSON+CSV snapshots every N studios (0 = only at end).
  checkpointEvery: 25,
  // Keep this low: homepage-only is usually enough for modality extraction.
  maxPagesPerSite: 1,
  requestTimeoutMs: 20_000,
  delayBetweenSitesMs: 250,
  // If enabled, keep only locations that mention Nairobi/Kenya.
  nairobiOnly: true,
  // Heuristic thresholds.
  approveThreshold: 0.65,
  rejectThreshold: 0.35,
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-resume') {
      opts.resume = false;
    } else if (arg === '--resume') {
      opts.resume = true;
    } else if (arg === '--quiet') {
      opts.verbose = false;
    } else if (arg === '--verbose') {
      opts.verbose = true;
    } else if (arg === '--checkpoint-every' && argv[i + 1]) {
      opts.checkpointEvery = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--checkpoint-every=')) {
      opts.checkpointEvery = Number(arg.split('=')[1]);
    } else if (arg === '--nairobi-only') {
      opts.nairobiOnly = true;
    } else if (arg === '--no-nairobi-only') {
      opts.nairobiOnly = false;
    } else if (arg === '--limit' && argv[i + 1]) {
      opts.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      opts.limit = Number(arg.split('=')[1]);
    } else if (arg === '--offset' && argv[i + 1]) {
      opts.offset = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--offset=')) {
      opts.offset = Number(arg.split('=')[1]);
    } else if (arg === '--max-pages' && argv[i + 1]) {
      opts.maxPagesPerSite = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--max-pages=')) {
      opts.maxPagesPerSite = Number(arg.split('=')[1]);
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      opts.requestTimeoutMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      opts.requestTimeoutMs = Number(arg.split('=')[1]);
    } else if (arg === '--delay-ms' && argv[i + 1]) {
      opts.delayBetweenSitesMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--delay-ms=')) {
      opts.delayBetweenSitesMs = Number(arg.split('=')[1]);
    } else if (arg === '--approve-threshold' && argv[i + 1]) {
      opts.approveThreshold = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--approve-threshold=')) {
      opts.approveThreshold = Number(arg.split('=')[1]);
    } else if (arg === '--reject-threshold' && argv[i + 1]) {
      opts.rejectThreshold = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--reject-threshold=')) {
      opts.rejectThreshold = Number(arg.split('=')[1]);
    }
  }
  return opts;
}

const options = parseArgs(process.argv.slice(2));

function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return csvCell(JSON.stringify(value));
  }
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values) {
  return values.map(csvCell).join(',');
}

function normalizeText(s) {
  if (!s) return '';
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripHtmlToText(html) {
  if (!html) return '';
  // Remove scripts/styles first to reduce noise.
  const noScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  const noTags = noScripts.replace(/<[^>]+>/g, ' ');
  return noTags;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryMakeAbsoluteUrl(baseUrl, maybeUrl) {
  try {
    // If it's already absolute, URL() succeeds.
    return new URL(maybeUrl).toString();
  } catch {
    // Otherwise, try relative against the base.
    try {
      return new URL(maybeUrl, baseUrl).toString();
    } catch {
      return null;
    }
  }
}

function extractCandidateLinks(html, baseUrl) {
  // Lightweight href extraction. We cap results to avoid huge link lists.
  const links = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!href) continue;
    const abs = tryMakeAbsoluteUrl(baseUrl, href);
    if (!abs) continue;
    if (!/^https?:\/\//i.test(abs)) continue;
    links.push(abs);
  }

  // Heuristic: prefer class/schedule pages and modality pages.
  const prefer = (u) => {
    const s = u.toLowerCase();
    if (/(classes|schedule|timetable|sessions|book|membership)/.test(s)) return 3;
    if (/(pilates|yoga|reformer|aerial|pole|spin|cycling|crossfit|dance|boxing|muay|taekwondo|jiujitsu|jiu|martial|bootcamp)/.test(s)) return 2;
    return 1;
  };

  const unique = Array.from(new Set(links));
  return unique.sort((a, b) => prefer(b) - prefer(a)).slice(0, 8);
}

function hasFitnessSignals(text) {
  // Signals that strongly suggest classes/programming.
  const fitnessSignalRe = /(classes|class schedule|schedule|timetable|sessions|book|booking|membership|trial|timetable|timetable)/i;
  const studioRe = /(studio|fitness|gym|center|centre|box|academy|club|reformer|pilates|yoga|pole|aerial|spin|cycling|crossfit|bootcamp|dance)/i;
  return fitnessSignalRe.test(text) || studioRe.test(text);
}

function hasBookingSignals(text) {
  return /(book|booking|reserve|reservations|schedule|timetable|classes)/i.test(text);
}

function hasMedicalSignals(text) {
  return /(clinic|hospital|physio|physiotherapy|orthopedic|orthopaedic|rehab|medical|therap(y|ies)|dentist|dental)/i.test(text);
}

function hasRetailSignals(text) {
  return /(shop|store|boutique|brand|clothing|apparel|retail|catalog|catalogue|buy now|sale|discount)/i.test(text);
}

function computeFitnessVerification(text) {
  const t = text || '';

  // Scoring keeps this more tunable than a single yes/no regex.
  let score = 0;

  if (hasFitnessSignals(t)) score += 2;
  if (hasBookingSignals(t)) score += 2;
  if (/(reformer|pilates|yoga|aerial|pole|spin|cycling|crossfit|bootcamp)/i.test(t)) score += 1;

  // Medical/retail are negative indicators unless the page also clearly offers classes.
  const hasMedical = hasMedicalSignals(t);
  const hasRetail = hasRetailSignals(t);
  const hasClasses = hasBookingSignals(t) || /(classes|schedule|sessions)/i.test(t);

  if (hasMedical && !hasClasses) score -= 3;
  if (hasRetail && !hasClasses) score -= 2;

  // Map score range roughly to 0..1.
  // Typical:
  //  - approved: +3..+6 => ~0.7..1.0
  //  - rejected: <= -1 => ~0..0.4
  const confidence = Math.max(0, Math.min(1, (score + 2) / 8));

  let status = 'needs_review';
  if (confidence >= options.approveThreshold) status = 'approved';
  else if (confidence <= options.rejectThreshold) status = 'rejected';

  const notes = [];
  if (hasFitnessSignals(t)) notes.push('fitness_signals');
  if (hasBookingSignals(t)) notes.push('booking_signals');
  if (hasMedical && !hasClasses) notes.push('medical_signals_without_classes');
  if (hasRetail && !hasClasses) notes.push('retail_signals_without_classes');

  return { status, confidence, notes };
}

function buildSlugKeywordIndex(referenceCategories) {
  const bySlug = new Map();

  for (const cat of referenceCategories) {
    const slug = cat.slug;
    const short = cat.short_label || '';
    const label = cat.label || '';

    const keywords = new Set();

    if (short) keywords.add(short.toLowerCase());

    if (label) {
      const cleaned = label
        .replace(/studio(s)? in nairobi/i, '')
        .replace(/class(es)? in nairobi/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (cleaned) keywords.add(cleaned);
    }

    if (slug) {
      const spaced = slug.replace(/-/g, ' ').toLowerCase();
      keywords.add(spaced);
      // Also add tokens from spaced form.
      const parts = spaced.split(/[^a-z0-9]+/i).filter(Boolean);
      for (const p of parts) {
        if (p.length >= 3) keywords.add(p);
      }
    }

    // A few normalization tweaks.
    if (keywords.size === 0 && slug) keywords.add(slug.toLowerCase());

    bySlug.set(slug, Array.from(keywords));
  }

  return bySlug;
}

function extractCategoriesFromText(studio, textLower, slugKeywordIndex) {
  const original = Array.isArray(studio.categories) ? studio.categories : [];
  if (original.length === 0) return { categoriesVerified: [], source: 'fallback_original' };

  const categoriesVerified = [];
  const evidenceBySlug = [];

  for (const slug of original) {
    const keywords = slugKeywordIndex.get(slug) || [slug.replace(/-/g, ' ')];
    let evidence = 0;
    for (const kw of keywords) {
      const k = String(kw).toLowerCase().trim();
      if (!k || k.length < 3) continue;

      // Avoid overly generic words causing false matches.
      if (['yoga', 'pilates', 'dance', 'fitness', 'studio', 'gym', 'center', 'centre'].includes(k)) {
        // keep these but require other keywords to also match later; handled by evidence count.
      }

      if (textLower.includes(k)) evidence += 1;
      if (evidence >= 2) break;
    }

    evidenceBySlug.push({ slug, evidence });
    if (evidence >= 1) categoriesVerified.push(slug);
  }

  // If nothing matched from the candidate set, keep original categories for safety.
  if (categoriesVerified.length === 0) {
    return { categoriesVerified: original, source: 'fallback_original' };
  }

  // Prefer fewer categories for readability: keep top evidenced.
  // We also dedupe while preserving order by evidence.
  const sorted = evidenceBySlug
    .filter((e) => categoriesVerified.includes(e.slug))
    .sort((a, b) => b.evidence - a.evidence);

  const top = [];
  const seen = new Set();
  for (const { slug } of sorted) {
    if (seen.has(slug)) continue;
    top.push(slug);
    seen.add(slug);
    if (top.length >= 8) break;
  }

  return { categoriesVerified: top, source: 'website_extracted' };
}

function normalizeWebsite(website) {
  if (!website) return null;
  const trimmed = String(website).trim();
  if (!trimmed) return null;
  // Many listings include http. Keep as-is, but ensure a scheme.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), options.requestTimeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (clean_nairobi_studios; +https://example.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!resp.ok) {
      return { ok: false, status: resp.status, html: '' };
    }

    const html = await resp.text();
    return { ok: true, status: resp.status, html: html.slice(0, 1_000_000) };
  } catch (err) {
    return { ok: false, status: null, html: '', error: err?.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

async function extractSiteTextForVerification(website) {
  const normalized = normalizeWebsite(website);
  if (!normalized) return { combinedText: '', pagesScanned: [], scanErrors: [] };

  const pagesScanned = [];
  const scanErrors = [];

  const first = await fetchHtml(normalized);
  if (!first.ok) {
    scanErrors.push({ url: normalized, error: first.error || `HTTP ${first.status}` });
  } else {
    pagesScanned.push(normalized);
  }

  const candidatePages = [normalized];
  if (options.maxPagesPerSite > 1 && first.ok) {
    const links = extractCandidateLinks(first.html, normalized);
    for (const l of links) {
      if (candidatePages.length >= options.maxPagesPerSite) break;
      if (!candidatePages.includes(l)) candidatePages.push(l);
    }
  }

  let combined = '';
  for (const u of candidatePages.slice(0, options.maxPagesPerSite)) {
    if (u !== normalized) {
      const r = await fetchHtml(u);
      if (!r.ok) scanErrors.push({ url: u, error: r.error || `HTTP ${r.status}` });
      else pagesScanned.push(u);
      if (r.ok) {
        combined += `${stripHtmlToText(r.html)} `;
      }
    } else {
      if (first.ok) combined += `${stripHtmlToText(first.html)} `;
    }
  }

  return { combinedText: combined, pagesScanned, scanErrors };
}

function buildCsvForStudios(studios, headers) {
  const lines = [row(headers)];
  for (const s of studios) {
    lines.push(
      row(headers.map((h) => {
        const v = s[h];
        if (Array.isArray(v)) return v.join('; ');
        return v;
      })),
    );
  }
  return lines.join('\n');
}

const CLEANED_HEADERS = [
  'name',
  'place_id',
  'location',
  'neighborhood',
  'lat',
  'lng',
  'website',
  'google_maps_url',
  'rating',
  'rating_count',
  'categories_google',
  'categories_verified',
  'categories_source',
  'verification_status',
  'verification_confidence',
  'types',
];

const REVIEW_HEADERS = [
  'name',
  'place_id',
  'location',
  'neighborhood',
  'lat',
  'lng',
  'website',
  'google_maps_url',
  'rating',
  'rating_count',
  'categories_google',
  'categories_verified',
  'categories_source',
  'verification_status',
  'verification_confidence',
  'types',
  'scan_errors',
];

function dedupeByKey(arr) {
  const map = new Map();
  for (const e of arr) {
    map.set(e.place_id || e.name, e);
  }
  return Array.from(map.values());
}

async function writeOutputFiles(cleanedFinal, reviewFinal, note) {
  await fs.mkdir(path.dirname(OUTPUT_CLEANED_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_CLEANED_JSON, JSON.stringify(cleanedFinal, null, 2));
  await fs.writeFile(OUTPUT_REVIEW_JSON, JSON.stringify(reviewFinal, null, 2));
  const cleanedCsv = buildCsvForStudios(cleanedFinal, CLEANED_HEADERS);
  const reviewCsv = buildCsvForStudios(reviewFinal, REVIEW_HEADERS);
  await fs.writeFile(OUTPUT_CLEANED_CSV, cleanedCsv, 'utf8');
  await fs.writeFile(OUTPUT_REVIEW_CSV, reviewCsv, 'utf8');
  if (note) console.log(note);
}

async function loadExistingOutputs() {
  const existingCleaned = new Map();
  const existingReview = new Map();

  async function loadJsonArray(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch {
      return [];
    }
  }

  const cleaned = await loadJsonArray(OUTPUT_CLEANED_JSON);
  for (const e of cleaned) {
    existingCleaned.set(e.place_id || e.name, e);
  }

  const review = await loadJsonArray(OUTPUT_REVIEW_JSON);
  for (const e of review) {
    existingReview.set(e.place_id || e.name, e);
  }

  return { existingCleaned, existingReview };
}

async function main() {
  console.log('Loading consolidated Nairobi studios...');
  const consolidatedRaw = await fs.readFile(INPUT_PATH, 'utf8');
  const studios = JSON.parse(consolidatedRaw);
  if (!Array.isArray(studios)) throw new Error('Expected consolidated file to be an array');
  console.log(`Total consolidated studios: ${studios.length}`);

  const referenceRaw = await fs.readFile(REFERENCE_CATEGORIES_PATH, 'utf8');
  const referenceCategories = JSON.parse(referenceRaw);
  const slugKeywordIndex = buildSlugKeywordIndex(referenceCategories);

  const withWebsite = studios.filter((s) => Boolean(normalizeWebsite(s.website)));
  console.log(`With website: ${withWebsite.length}`);

  const filteredByNairobi = options.nairobiOnly
    ? withWebsite.filter((s) => {
      const loc = String(s.location || '').toLowerCase();
      return loc.includes('nairobi') || loc.includes('kenya');
    })
    : withWebsite;

  console.log(`After Nairobi-only filter: ${filteredByNairobi.length}`);

  if (!options.resume) {
    await fs.rm(OUTPUT_CLEANED_JSON, { force: true });
    await fs.rm(OUTPUT_CLEANED_CSV, { force: true });
    await fs.rm(OUTPUT_REVIEW_JSON, { force: true });
    await fs.rm(OUTPUT_REVIEW_CSV, { force: true });
    await fs.rm(OUTPUT_PROGRESS_JSONL, { force: true });
    console.log('Cleared previous cleaned outputs and progress log (--no-resume).');
  }

  const { existingCleaned, existingReview } = options.resume ? await loadExistingOutputs() : { existingCleaned: new Map(), existingReview: new Map() };

  const resultsCleaned = options.resume ? Array.from(existingCleaned.values()) : [];
  const resultsReview = options.resume ? Array.from(existingReview.values()) : [];
  const seenKeys = new Set([
    ...Array.from(existingCleaned.keys()),
    ...Array.from(existingReview.keys()),
  ]);

  const slice = filteredByNairobi.slice(options.offset, options.offset + options.limit);
  console.log(
    `Cleaning ${slice.length} studios (offset=${options.offset} limit=${Number.isFinite(options.limit) ? options.limit : '∞'}) resume=${options.resume} checkpointEvery=${options.checkpointEvery}`,
  );

  for (let idx = 0; idx < slice.length; idx += 1) {
    const studio = slice[idx];
    const key = studio.place_id || studio.name;
    if (seenKeys.has(key)) continue;

    const website = normalizeWebsite(studio.website);
    const scan = await extractSiteTextForVerification(website);

    const textLower = normalizeText(scan.combinedText);
    const verification = computeFitnessVerification(textLower);

    const extractedCats = extractCategoriesFromText(
      { ...studio, categories: Array.isArray(studio.categories) ? studio.categories : [] },
      textLower,
      slugKeywordIndex,
    );

    const cleanedEntryBase = {
      ...studio,
      categories_google: Array.isArray(studio.categories) ? studio.categories : [],
      categories_verified: extractedCats.categoriesVerified,
      categories_source: extractedCats.source,
      verification_status: verification.status,
      verification_confidence: verification.confidence,
      verification_notes: verification.notes,
      pages_scanned: scan.pagesScanned,
      scan_errors: scan.scanErrors,
    };

    // Update the main `categories` field to match the verified set.
    // (If we had to fall back due to extraction failure, categories_source will show it.)
    cleanedEntryBase.categories = extractedCats.categoriesVerified;

    if (verification.status === 'approved') {
      resultsCleaned.push(cleanedEntryBase);
    } else {
      resultsReview.push(cleanedEntryBase);
    }

    seenKeys.add(key);

    const progressLine = JSON.stringify({
      at: new Date().toISOString(),
      index: idx + 1,
      total: slice.length,
      key,
      name: studio.name,
      website,
      status: verification.status,
      confidence: verification.confidence,
    });
    await fs.appendFile(OUTPUT_PROGRESS_JSONL, `${progressLine}\n`, 'utf8');

    if (options.verbose) {
      console.log(
        `[${idx + 1}/${slice.length}] ${verification.status} conf=${verification.confidence.toFixed(2)} | ${studio.name} | ${website}`,
      );
    }

    if (options.checkpointEvery > 0 && (idx + 1) % options.checkpointEvery === 0) {
      await writeOutputFiles(
        dedupeByKey(resultsCleaned),
        dedupeByKey(resultsReview),
        `Checkpoint written: ${idx + 1}/${slice.length} (see ${path.basename(OUTPUT_CLEANED_JSON)})`,
      );
    }

    // Gentle pacing to avoid slamming servers.
    if (options.delayBetweenSitesMs > 0) await sleep(options.delayBetweenSitesMs);
  }

  const cleanedFinal = dedupeByKey(resultsCleaned);
  const reviewFinal = dedupeByKey(resultsReview);

  await writeOutputFiles(
    cleanedFinal,
    reviewFinal,
    `Final write: approved=${cleanedFinal.length} review_queue=${reviewFinal.length}`,
  );

  console.log(`\nDone.`);
  console.log(`- Approved (cleaned): ${cleanedFinal.length}`);
  console.log(`- Needs review / rejected: ${reviewFinal.length}`);
  console.log(`- Progress log (one JSON per line): ${OUTPUT_PROGRESS_JSONL}`);
  console.log(`- Wrote: ${OUTPUT_CLEANED_JSON}`);
  console.log(`- Wrote: ${OUTPUT_CLEANED_CSV}`);
  console.log(`- Wrote: ${OUTPUT_REVIEW_JSON}`);
  console.log(`- Wrote: ${OUTPUT_REVIEW_CSV}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

