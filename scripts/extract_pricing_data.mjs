#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_CANDIDATES = path.join(ROOT, 'data/pricing/paris_pricing_candidates.json');
const DEFAULT_SEED = path.join(ROOT, 'data/pricing/paris_pricing_batch1.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data/pricing/paris_pricing_master.json');
const DEFAULT_RENDER_CACHE = path.join(ROOT, 'data/pricing/rendered_pricing_cache.json');
const DEFAULT_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 18000;
const RENDER_TIMEOUT_MS = 20000;
const RENDER_WAIT_MS = 1200;

const BOOKING_PATTERNS = [
  { name: 'bsport', pattern: /bsport/i },
  { name: 'mindbody', pattern: /mindbody|mindbodyonline/i },
  { name: 'momoyoga', pattern: /momoyoga/i },
  { name: 'momence', pattern: /momence/i },
  { name: 'eversports', pattern: /eversports/i },
  { name: 'mariana-tek', pattern: /mariana[-\s]?tek|client\.marianatek/i },
  { name: 'arketa', pattern: /arketa/i },
  { name: 'glofox', pattern: /glofox/i },
  { name: 'punchpass', pattern: /punchpass/i },
  { name: 'bookday', pattern: /bookday/i },
  { name: 'wix-bookings', pattern: /wix|bookings/i },
  { name: 'acuity', pattern: /acuityscheduling|\.as\.me/i },
  { name: 'planity', pattern: /planity/i },
  { name: 'proprietary', pattern: /mobile app|application|app store|google play/i },
];

const INTRO_HINTS = /(intro|d[ée]couverte|essai|starter|welcome|bienvenue|trial|premi[èe]re s[ée]ance)/i;
const PACK_HINTS = /(pack|carte|forfait|bundle)/i;
const MEMBERSHIP_HINTS = /(abonnement|membership|\/mois|\/month|mensuel|monthly|annuel|yearly|illimit|unlimited)/i;
const DROPIN_HINTS = /(drop[-\s]?in|s[ée]ance unique|cours [àa] l.unit[éee]|1 cours|1 s[ée]ance|single class)/i;
const DISCOUNT_HINTS = /(r[ée]duction|discount|off|promo|student|[ée]tudiant|corporate|parrainage|referral)/i;
const SECTION_HINTS = /(tarifs?|pricing|prix|abonnements?|cartes?|forfaits?|cours [àa] l.unit[ée]|nouveaux clients|[ée]tudiants?)/i;

function parseArgs(argv) {
  const args = {
    candidates: DEFAULT_CANDIDATES,
    seed: DEFAULT_SEED,
    output: DEFAULT_OUTPUT,
    concurrency: DEFAULT_CONCURRENCY,
    maxPages: 3,
    limit: null,
    renderFallback: true,
    renderCache: DEFAULT_RENDER_CACHE,
    renderOnly: false,
    domainsFile: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--candidates=')) args.candidates = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--candidates') args.candidates = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--seed=')) args.seed = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--seed') args.seed = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--output=')) args.output = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--output') args.output = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--concurrency=')) args.concurrency = Number(arg.split('=')[1]);
    else if (arg === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (arg.startsWith('--max-pages=')) args.maxPages = Number(arg.split('=')[1]);
    else if (arg === '--max-pages') args.maxPages = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1]);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--no-render-fallback') args.renderFallback = false;
    else if (arg === '--render-fallback') args.renderFallback = true;
    else if (arg.startsWith('--render-cache=')) args.renderCache = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--render-cache') args.renderCache = path.resolve(ROOT, argv[++i]);
    else if (arg === '--render-only') args.renderOnly = true;
    else if (arg.startsWith('--domains-file=')) args.domainsFile = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--domains-file') args.domainsFile = path.resolve(ROOT, argv[++i]);
  }

  return args;
}

function parseMoney(input) {
  if (!input) return null;
  const normalized = String(input)
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function parseValidityDays(line) {
  const match = line.match(/(\d{1,3})\s*(jour|jours|day|days|semaine|semaines|week|weeks|mois|month|months|an|ans|year|years)/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('jour') || unit.startsWith('day')) return n;
  if (unit.startsWith('semaine') || unit.startsWith('week')) return n * 7;
  if (unit.startsWith('mois') || unit.startsWith('month')) return n * 30;
  if (unit.startsWith('an') || unit.startsWith('year')) return n * 365;
  return null;
}

function parseClasses(line) {
  const match = line.match(/(\d{1,3})\s*(cours|s[ée]ances|sessions|credits?|cr[ée]dits?)/i);
  return match ? Number(match[1]) : null;
}

function parseSessionsPerWeek(line) {
  const match = line.match(/(\d{1,2})\s*(cours|sessions?|s[ée]ances?)\s*\/\s*semaine/i);
  return match ? Number(match[1]) : null;
}

function parseCommitmentMonths(line) {
  const match = line.match(/engagement\s*(?:de)?\s*(\d{1,2})\s*mois/i);
  if (match) return Number(match[1]);
  if (/sans engagement/i.test(line)) return 0;
  return null;
}

function htmlToLines(html) {
  const withBreaks = html
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = withBreaks
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function detectBookingSoftware(html, urls = []) {
  const haystack = `${html}\n${urls.join('\n')}`.toLowerCase();
  const found = new Set();
  for (const entry of BOOKING_PATTERNS) if (entry.pattern.test(haystack)) found.add(entry.name);
  if (!found.size) return null;
  return Array.from(found).sort().join(', ');
}

function detectCreditSystem(lines) {
  const merged = lines.join('\n').toLowerCase();
  const explicitPatterns = [
    /1\s*cr[ée]dit\s*=\s*\d+/i,
    /mix pass/i,
    /multi-activit[ée]s.*cr[ée]dits?/i,
    /credits?\s+usable/i,
    /credits?\s+valable/i,
  ];
  return explicitPatterns.some((pattern) => pattern.test(merged));
}

function detectModality(line) {
  const lower = line.toLowerCase();
  if (lower.includes('reformer')) return 'reformer_pilates';
  if (lower.includes('aquabike')) return 'aquabike_single';
  if (lower.includes('ems')) return 'ems_single';
  if (/(tapis|barre|fitness|yoga|pilates|mat)/i.test(lower)) return 'standard_class';
  return null;
}

function normalizeLine(line) {
  return String(line ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueLines(lines) {
  const seen = new Set();
  const out = [];
  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function buildFragments(lines) {
  const fragments = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const hasPrice = /(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i.test(line);
    const hasSectionHint = SECTION_HINTS.test(line);
    if (!hasPrice && !hasSectionHint) continue;
    const start = Math.max(0, i - 2);
    const end = Math.min(lines.length, i + 3);
    const fragment = lines.slice(start, end).join(' | ');
    if (!seen.has(fragment)) {
      seen.add(fragment);
      fragments.push(fragment);
    }
  }
  return fragments;
}

function buildParseLines(lines) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const priceMatches = [...line.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/gi)];
    if (!priceMatches.length) continue;
    if (line.length > 220 || priceMatches.length > 2) continue;
    const next = lines[i + 1] ?? '';
    const enrichWithNext = /engagement|valable|valid|semaine|mois|month|cours|sessions?/i.test(next) && !/€/.test(next);
    const candidate = enrichWithNext ? `${line} | ${next}` : line;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

function pickBaseDropIn(record, name) {
  if (record.drop_in_by_modality && typeof record.drop_in_by_modality === 'object') {
    const lower = name.toLowerCase();
    if (lower.includes('reformer') && record.drop_in_by_modality.reformer_pilates)
      return record.drop_in_by_modality.reformer_pilates;
    if (lower.includes('reformer') && record.drop_in_by_modality.reformer_solo)
      return record.drop_in_by_modality.reformer_solo;
    if ((lower.includes('duo') || lower.includes('partner')) && record.drop_in_by_modality.reformer_duo_per_person)
      return record.drop_in_by_modality.reformer_duo_per_person;
    if (lower.includes('aquabike') && record.drop_in_by_modality.aquabike_single)
      return record.drop_in_by_modality.aquabike_single;
    if (lower.includes('ems') && record.drop_in_by_modality.ems_single)
      return record.drop_in_by_modality.ems_single;
  }
  return record.drop_in?.price ?? null;
}

function ensureUniqBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createBlankRecord(studio) {
  return {
    studio_name: studio.studio_name ?? null,
    domain: studio.domain ?? null,
    website: studio.website ?? null,
    pricing_url: null,
    categories: studio.categories ?? [],
    arrondissement: studio.arrondissement ?? null,
    data_collected_date: new Date().toISOString().slice(0, 10),
    booking_software: null,
    currency: 'EUR',
    pricing_publicly_available: false,
    notes: '',
    drop_in: {
      price: null,
      duration_minutes: null,
    },
    intro_offers: [],
    class_packs: [],
    memberships: [],
    discounts: [],
    expiration_policy: {
      single_class_validity_days: null,
      pack_validity_days: null,
      notes: '',
    },
    uses_credit_system: false,
    credit_system_notes: null,
    drop_in_by_modality: null,
    extraction_meta: {
      source: 'auto_extraction',
      evidence_urls: [],
      evidence_line_count: 0,
      extracted_at: new Date().toISOString(),
      rendered_fallback_used: false,
      rendered_urls: [],
      quality_flags: [],
    },
  };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, finalUrl: response.url, text, error: null };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      text: '',
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractFromLines(record, lines) {
  const normalizedLines = uniqueLines(lines);
  const euroLines = normalizedLines.filter((line) => /€|eur|euro/i.test(line));
  const parseLines = buildParseLines(normalizedLines);
  record.extraction_meta.evidence_line_count = euroLines.length;

  const introOffers = [];
  const classPacks = [];
  const memberships = [];
  const discounts = [];
  let bestDropIn = record.drop_in.price;
  const modalityDropIns = {};

  for (const line of parseLines) {
    const prices = [...line.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/gi)].map((m) => parseMoney(m[1])).filter(Boolean);
    if (!prices.length) continue;
    const primaryPrice = prices[0];
    const modality = detectModality(line);
    const classesInLine = parseClasses(line);
    const sessionsPerWeek = parseSessionsPerWeek(line);
    const commitmentMonths = parseCommitmentMonths(line);

    if (DISCOUNT_HINTS.test(line)) {
      discounts.push({
        type: /(student|[ée]tudiant)/i.test(line)
          ? 'student'
          : /(corporate|entreprise)/i.test(line)
            ? 'corporate'
            : 'promo',
        description: line.slice(0, 220),
        discount_pct_or_amount: line.match(/(\d{1,3}\s*%|\d{1,4}(?:[.,]\d{1,2})?\s*€)/i)?.[1] ?? '',
      });
    }

    if (INTRO_HINTS.test(line)) {
      introOffers.push({
        type: 'Intro offer',
        name: line.slice(0, 120),
        price: primaryPrice,
        classes_included: classesInLine,
        validity_days: parseValidityDays(line),
        notes: '',
      });
      continue;
    }

    const isWeeklyMembership = /\/\s*semaine|per week/i.test(line);
    const isMonthlyMembership = /\/\s*(mois|month)|mensuel|monthly|annuel|yearly/i.test(line);
    if (MEMBERSHIP_HINTS.test(line) && (isMonthlyMembership || isWeeklyMembership || commitmentMonths !== null)) {
      const classes = classesInLine;
      const isUnlimited = /illimit|unlimited/i.test(line);
      const monthlyPrice = isWeeklyMembership ? Math.round(primaryPrice * 4 * 100) / 100 : primaryPrice;
      const estimated = isUnlimited ? 12 : (sessionsPerWeek ? sessionsPerWeek * 4 : classes);
      memberships.push({
        name: line.slice(0, 120),
        monthly_price: monthlyPrice,
        classes_included: isUnlimited ? 'unlimited' : (classes ?? null),
        estimated_classes_per_month: estimated ?? null,
        effective_price_per_class:
          estimated && monthlyPrice ? Math.round((monthlyPrice / estimated) * 100) / 100 : null,
        discount_vs_dropin_pct: null,
        commitment_months: commitmentMonths,
        notes: isWeeklyMembership ? 'Converted from weekly membership pricing.' : '',
      });
      continue;
    }

    if (PACK_HINTS.test(line) || (classesInLine && classesInLine > 1)) {
      const classes = classesInLine;
      if (classes && primaryPrice) {
        classPacks.push({
          name: line.slice(0, 120),
          classes,
          total_price: primaryPrice,
          price_per_class: Math.round((primaryPrice / classes) * 100) / 100,
          discount_vs_dropin_pct: null,
          validity_days: parseValidityDays(line),
          notes: '',
        });
        continue;
      }
    }

    if (DROPIN_HINTS.test(line)) {
      const price = primaryPrice;
      if (!bestDropIn || price < bestDropIn) bestDropIn = price;
      if (modality === 'reformer_pilates') modalityDropIns.reformer_pilates = price;
      else if (modality === 'aquabike_single') modalityDropIns.aquabike_single = price;
      else if (modality === 'ems_single') modalityDropIns.ems_single = price;
      else modalityDropIns.standard_class = price;
    }
  }

  record.intro_offers = ensureUniqBy(introOffers, (o) => `${o.price}|${o.classes_included}|${o.validity_days ?? ''}`).slice(0, 10);
  record.class_packs = ensureUniqBy(classPacks, (p) => `${p.classes}|${p.total_price}|${p.validity_days ?? ''}`).slice(0, 15);
  record.memberships = ensureUniqBy(
    memberships,
    (m) => `${m.monthly_price}|${m.classes_included}|${m.commitment_months ?? ''}|${m.estimated_classes_per_month ?? ''}`,
  ).slice(0, 15);
  record.discounts = ensureUniqBy(discounts, (d) => `${d.type}|${d.description}`);
  if (bestDropIn) record.drop_in.price = bestDropIn;
  if (Object.keys(modalityDropIns).length > 0) record.drop_in_by_modality = modalityDropIns;

  // Calculate discounts where we can confidently map to a base drop-in.
  for (const pack of record.class_packs) {
    const base = pickBaseDropIn(record, pack.name);
    if (base && pack.price_per_class) {
      pack.discount_vs_dropin_pct = Math.round((((base - pack.price_per_class) / base) * 100) * 100) / 100;
    }
  }

  for (const membership of record.memberships) {
    const base = record.drop_in.price;
    if (base && membership.effective_price_per_class) {
      membership.discount_vs_dropin_pct =
        Math.round((((base - membership.effective_price_per_class) / base) * 100) * 100) / 100;
    }
  }

  if (
    record.drop_in.price ||
    record.intro_offers.length ||
    record.class_packs.length ||
    record.memberships.length
  ) {
    record.pricing_publicly_available = true;
  }

  if (detectCreditSystem(lines)) {
    record.uses_credit_system = true;
    record.credit_system_notes = 'Detected explicit credit-based language on pricing pages.';
  }

  const qualityFlags = [];
  if (record.pricing_publicly_available && !record.drop_in.price && !record.class_packs.length && !record.memberships.length) {
    qualityFlags.push('pricing_detected_but_sparse_structured_fields');
  }
  if (record.extraction_meta.evidence_line_count < 4) qualityFlags.push('sparse_price_evidence');
  if ((record.class_packs?.length ?? 0) > 12 || (record.memberships?.length ?? 0) > 12) {
    qualityFlags.push('over_extracted_structures');
  }
  for (let i = 1; i < record.class_packs.length; i += 1) {
    const prev = record.class_packs[i - 1];
    const cur = record.class_packs[i];
    if (prev.classes && cur.classes && prev.classes < cur.classes && prev.price_per_class && cur.price_per_class) {
      if (cur.price_per_class - prev.price_per_class > 0.5) {
        qualityFlags.push('conflicting_pack_math');
        break;
      }
    }
  }
  if (record.memberships.some((m) => /engagement/i.test(m.name) && m.commitment_months === null)) {
    qualityFlags.push('membership_commitment_ambiguous');
  }
  record.extraction_meta.quality_flags = ensureUniqBy(qualityFlags, (v) => v);
}

function selectCandidatePages(studio, maxPages) {
  const pages = (studio.candidate_pricing_pages ?? [])
    .filter((page) => page.ok && page.status_code && page.status_code < 400)
    .sort((a, b) => {
      const scoreA = Number(a.pricing_hint) + Number(a.has_euro_symbol) + Number(a.has_pricing_keywords);
      const scoreB = Number(b.pricing_hint) + Number(b.has_euro_symbol) + Number(b.has_pricing_keywords);
      return scoreB - scoreA;
    })
    .slice(0, maxPages);
  return pages;
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function loop() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => loop()));
  return results;
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function loadRenderCache(cachePath) {
  try {
    const raw = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    return typeof raw === 'object' && raw ? raw : {};
  } catch {
    return {};
  }
}

async function saveRenderCache(cachePath, cacheObj) {
  await ensureParentDir(cachePath);
  await fs.writeFile(cachePath, JSON.stringify(cacheObj, null, 2));
}

const rendererState = {
  browser: null,
  page: null,
};
let renderQueue = Promise.resolve();

async function getRendererPage() {
  if (rendererState.page) return rendererState.page;
  rendererState.browser = await chromium.launch({ headless: true });
  const context = await rendererState.browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'fr-FR',
  });
  rendererState.page = await context.newPage();
  return rendererState.page;
}

async function closeRenderer() {
  if (rendererState.browser) await rendererState.browser.close();
  rendererState.browser = null;
  rendererState.page = null;
}

async function fetchRenderedLines(url, renderCache) {
  if (renderCache[url]?.lines?.length) return renderCache[url];
  const task = async () => {
    if (renderCache[url]?.lines?.length) return renderCache[url];
    const page = await getRendererPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS });
    await page.waitForTimeout(RENDER_WAIT_MS);
    const payload = await page.evaluate(() => {
      const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
      const selector =
        'section, article, main, table tr, li, [class*=\"price\"], [class*=\"tarif\"], [class*=\"pricing\"], [class*=\"abonnement\"], [class*=\"pack\"]';
      const nodes = Array.from(document.querySelectorAll(selector));
      const rawBlocks = nodes.map((el) => clean(el.innerText)).filter(Boolean);
      const relevantBlocks = rawBlocks.filter((t) => {
        if (t.length < 8 || t.length > 280) return false;
        if (!/€|eur|euro|tarif|prix|abonnement|forfait|pack|cours|session/i.test(t)) return false;
        const priceCount = (t.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/gi) ?? []).length;
        return priceCount <= 2;
      });
      const unique = Array.from(new Set(relevantBlocks));
      if (unique.length > 0) return unique.slice(0, 1800);

      // Fallback when selectors miss pricing blocks.
      const bodyLines = clean(document.body?.innerText ?? '')
        .split('\n')
        .map(clean)
        .filter((t) => t.length > 0 && t.length <= 180 && /€|tarif|prix|abonnement|forfait|pack|cours/i.test(t));
      return Array.from(new Set(bodyLines)).slice(0, 1800);
    });
    const cached = {
      captured_at: new Date().toISOString(),
      lines: payload,
    };
    renderCache[url] = cached;
    return cached;
  };
  const queued = renderQueue.then(task, task);
  renderQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function mapSeedByDomain(seedRows) {
  const map = new Map();
  for (const row of seedRows) {
    if (!row.domain) continue;
    map.set(String(row.domain).toLowerCase(), row);
  }
  return map;
}

async function extractStudio(studio, seedMap, options, renderCache) {
  const seed = seedMap.get(String(studio.domain).toLowerCase());
  if (seed) {
    return {
      ...seed,
      extraction_meta: {
        source: 'seed_batch',
        evidence_urls: [seed.pricing_url].filter(Boolean),
        evidence_line_count: null,
        extracted_at: new Date().toISOString(),
      },
    };
  }

  const record = createBlankRecord(studio);
  const pages = selectCandidatePages(studio, options.maxPages);
  record.extraction_meta.evidence_urls = pages.map((p) => p.url);
  record.booking_software = (studio.booking_software_hints ?? []).join(', ') || null;
  if (!record.booking_software && studio.booking_links?.length) {
    record.booking_software = detectBookingSoftware('', studio.booking_links);
  }

  if (!pages.length) {
    record.notes = 'No reachable pricing candidates discovered.';
    return record;
  }

  const fetched = [];
  for (const page of pages) {
    const response = await fetchWithTimeout(page.url);
    fetched.push(response);
  }

  const best = fetched.find((resp) => resp.ok && /€|eur|pricing|tarif|prix/i.test(resp.text)) ?? fetched[0];
  if (!best || !best.ok) {
    record.notes = 'Candidate pages fetched but unavailable or blocked.';
    return record;
  }

  record.pricing_url = best.finalUrl || pages[0]?.url || null;
  const htmlLines = htmlToLines(best.text);
  const allLines = options.renderOnly ? [] : [...htmlLines];
  let renderedUsed = false;

  const shouldTryRendered =
    (options.renderOnly || options.renderFallback) &&
    (htmlLines.filter((line) => /€|eur|euro/i.test(line)).length < 6 ||
      !/tarif|prix|pricing|abonnement|forfait|pack|cours/i.test(best.text) ||
      options.renderOnly);

  if (shouldTryRendered) {
    for (const candidate of [record.pricing_url, ...pages.map((p) => p.url)].filter(Boolean)) {
      try {
        const rendered = await fetchRenderedLines(candidate, renderCache);
        if (rendered.lines.length) {
          allLines.push(...rendered.lines);
          renderedUsed = true;
          record.extraction_meta.rendered_urls.push(candidate);
        }
      } catch {
        // Non-fatal: continue with HTML extraction only.
      }
      if (renderedUsed && allLines.length > 3500) break;
    }
  }

  extractFromLines(record, uniqueLines(allLines));
  record.extraction_meta.rendered_fallback_used = renderedUsed;

  if (!record.booking_software) {
    record.booking_software = detectBookingSoftware(best.text, studio.booking_links ?? []);
  }

  if (!record.pricing_publicly_available) {
    record.notes = 'Pricing page reachable but structured prices not confidently extracted.';
  }

  // Populate coarse expiration notes from text if present.
  const expirationLine = allLines.find((line) => /valid|valable|expiration|expire|annulation|cancel/i.test(line));
  if (expirationLine) {
    record.expiration_policy.notes = expirationLine.slice(0, 240);
  }

  return record;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let renderCache = {};
  try {
    const candidatesPayload = JSON.parse(await fs.readFile(options.candidates, 'utf8'));
    const seedRows = JSON.parse(await fs.readFile(options.seed, 'utf8'));
    const seedMap = mapSeedByDomain(seedRows);
    renderCache = await loadRenderCache(options.renderCache);

    const studios = candidatesPayload.studios ?? [];
    let targets = studios;
    if (options.domainsFile) {
      const domainRaw = await fs.readFile(options.domainsFile, 'utf8');
      const domainSet = new Set(
        domainRaw
          .split(/\r?\n/)
          .map((line) => String(line).trim().toLowerCase())
          .filter(Boolean),
      );
      targets = targets.filter((studio) => domainSet.has(String(studio.domain ?? '').toLowerCase()));
    }
    if (options.limit) targets = targets.slice(0, options.limit);

    console.log(`Candidates loaded: ${studios.length}`);
    console.log(`Seed pricing rows loaded: ${seedRows.length}`);
    console.log(`Extraction targets: ${targets.length}`);

    const extracted = await runPool(targets, options.concurrency, async (studio, idx) => {
      console.log(`[${idx + 1}/${targets.length}] Extracting ${studio.domain}`);
      return extractStudio(studio, seedMap, options, renderCache);
    });

    const output = extracted.sort((a, b) => String(a.domain ?? '').localeCompare(String(b.domain ?? '')));
    await ensureParentDir(options.output);
    await fs.writeFile(options.output, JSON.stringify(output, null, 2));
    if (options.renderFallback) await saveRenderCache(options.renderCache, renderCache);

    const summary = {
      total: output.length,
      from_seed_batch: output.filter((r) => r.extraction_meta?.source === 'seed_batch').length,
      with_public_pricing: output.filter((r) => r.pricing_publicly_available === true).length,
      with_drop_in: output.filter((r) => r.drop_in?.price).length,
      with_packs: output.filter((r) => (r.class_packs?.length ?? 0) > 0).length,
      with_memberships: output.filter((r) => (r.memberships?.length ?? 0) > 0).length,
      rendered_fallback_used: output.filter((r) => r.extraction_meta?.rendered_fallback_used === true).length,
    };

    console.log(`Saved extracted master dataset to ${options.output}`);
    console.log(`Summary: ${JSON.stringify(summary)}`);
  } finally {
    await closeRenderer();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
