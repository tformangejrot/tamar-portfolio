#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_INPUT = path.join(ROOT, 'data/processed/studios_consolidated_boutique.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data/pricing/paris_pricing_candidates.json');
const DEFAULT_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15000;

const PRICING_PATHS = [
  '/tarifs',
  '/prix',
  '/pricing',
  '/offres',
  '/abonnements',
  '/nos-offres',
  '/forfaits',
  '/shop',
  '/rates',
  '/membership',
];

const PRICING_HINTS = [
  'tarif',
  'prix',
  'pricing',
  'offre',
  'abonnement',
  'forfait',
  'pack',
  'cours',
  'drop-in',
];

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
];

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    limit: null,
    concurrency: DEFAULT_CONCURRENCY,
    jsPriority: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--input=')) args.input = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--input') args.input = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--output=')) args.output = path.resolve(ROOT, arg.split('=')[1]);
    else if (arg === '--output') args.output = path.resolve(ROOT, argv[++i]);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1]);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--concurrency=')) args.concurrency = Number(arg.split('=')[1]);
    else if (arg === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (arg === '--js-priority') args.jsPriority = true;
  }

  return args;
}

function cleanWebsiteUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const url = new URL(rawUrl.trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function dedupeStudios(studios) {
  const byDomain = new Map();

  for (const studio of studios) {
    const website = cleanWebsiteUrl(studio.website);
    if (!website || !studio.domain) continue;

    const domain = String(studio.domain).toLowerCase();
    if (!byDomain.has(domain)) {
      byDomain.set(domain, {
        studio_name: studio.name ?? null,
        domain,
        website,
        categories: studio.categories ?? [],
        arrondissement: studio.arrondissement ?? null,
        source_count: 1,
      });
      continue;
    }

    const existing = byDomain.get(domain);
    existing.source_count += 1;
    if ((studio.categories?.length ?? 0) > (existing.categories?.length ?? 0)) {
      existing.categories = studio.categories ?? [];
      existing.studio_name = studio.name ?? existing.studio_name;
      existing.arrondissement = studio.arrondissement ?? existing.arrondissement;
      existing.website = website;
    }
  }

  return Array.from(byDomain.values()).sort((a, b) => a.domain.localeCompare(b.domain));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1]?.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      continue;
    }
    try {
      const absolute = new URL(href, baseUrl).toString();
      links.add(absolute);
    } catch {
      // Ignore malformed links
    }
  }

  return Array.from(links);
}

function scorePricingHint(url) {
  const lower = url.toLowerCase();
  return PRICING_HINTS.some((hint) => lower.includes(hint));
}

function detectBookingSoftware(urls, htmlText) {
  const found = new Set();
  const haystack = `${urls.join('\n')}\n${htmlText}`.toLowerCase();
  for (const entry of BOOKING_PATTERNS) {
    if (entry.pattern.test(haystack)) found.add(entry.name);
  }
  return Array.from(found).sort();
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
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType,
      text,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      contentType: null,
      text: '',
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildSeedCandidates(website) {
  const base = new URL(website);
  const seeds = new Set([website, `${base.origin}/`]);
  for (const pathSuffix of PRICING_PATHS) seeds.add(new URL(pathSuffix, base.origin).toString());
  return Array.from(seeds);
}

async function discoverForStudio(studio, options) {
  const seedCandidates = buildSeedCandidates(studio.website);
  const records = [];

  const homepage = await fetchWithTimeout(studio.website);
  const homepageText = stripHtml(homepage.text ?? '');
  const homepageRaw = homepage.text ?? '';
  const jsHeavyHint =
    /__NEXT_DATA__|window\.__NUXT__|id="__nuxt"|id="__next"|hydrateRoot|webpackJsonp|application\/json/i.test(homepageRaw);
  const homepageLinks = extractLinks(homepage.text ?? '', studio.website);
  const pricingLinks = homepageLinks.filter((link) => scorePricingHint(link));

  const candidateUrls = new Set([...seedCandidates, ...pricingLinks]);
  const checked = [];

  for (const candidateUrl of candidateUrls) {
    const result = await fetchWithTimeout(candidateUrl);
    checked.push({
      url: candidateUrl,
      final_url: result.finalUrl,
      status_code: result.status,
      ok: result.ok,
      source: seedCandidates.includes(candidateUrl) ? 'seed' : 'discovered-link',
      pricing_hint: scorePricingHint(candidateUrl),
      content_type: result.contentType,
      error: result.error,
      has_euro_symbol: /€|eur|euro/i.test(result.text ?? ''),
      has_pricing_keywords: /tarif|prix|pricing|abonnement|forfait|pack|cours/i.test(result.text ?? ''),
      js_heavy_hint:
        /__NEXT_DATA__|window\.__NUXT__|id="__nuxt"|id="__next"|hydrateRoot|webpackJsonp|application\/json/i.test(
          result.text ?? '',
        ),
    });
  }

  const bookingSoftware = detectBookingSoftware(homepageLinks, homepageText);
  const bookingLinks = homepageLinks.filter((link) =>
    BOOKING_PATTERNS.some((entry) => entry.pattern.test(link.toLowerCase())),
  );

  records.push({
    ...studio,
    discovered_at: new Date().toISOString(),
    homepage_status: homepage.status,
    homepage_error: homepage.error,
    js_heavy_hint: jsHeavyHint,
    booking_software_hints: bookingSoftware,
    booking_links: bookingLinks.slice(0, 20),
    candidate_pricing_pages: checked
      .sort((a, b) => {
        const scoreA = Number(a.pricing_hint) + Number(a.has_euro_symbol) + Number(a.ok);
        const scoreB = Number(b.pricing_hint) + Number(b.has_euro_symbol) + Number(b.ok);
        const jsBonusA = options.jsPriority ? Number(a.js_heavy_hint) * 0.5 : 0;
        const jsBonusB = options.jsPriority ? Number(b.js_heavy_hint) * 0.5 : 0;
        return scoreB + jsBonusB - (scoreA + jsBonusA);
      })
      .slice(0, 40),
  });

  return records[0];
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function loop() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      const item = items[current];
      const result = await worker(item, current);
      results[current] = result;
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => loop()));
  return results;
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await fs.readFile(options.input, 'utf8'));
  const deduped = dedupeStudios(raw);
  const targets = options.limit ? deduped.slice(0, options.limit) : deduped;

  console.log(`Loaded ${raw.length} studio rows`);
  console.log(`Unique domains with websites: ${deduped.length}`);
  console.log(`Processing targets: ${targets.length}`);

  const startedAt = Date.now();
  const discovered = await runPool(targets, options.concurrency, async (studio, idx) => {
    console.log(`[${idx + 1}/${targets.length}] Discovering ${studio.domain}`);
    return discoverForStudio(studio, options);
  });

  const summary = {
    generated_at: new Date().toISOString(),
    input_path: options.input,
    total_studios_input: raw.length,
    total_unique_domains: deduped.length,
    total_processed: discovered.length,
    elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
  };

  const payload = {
    summary,
    studios: discovered,
  };

  await ensureParentDir(options.output);
  await fs.writeFile(options.output, JSON.stringify(payload, null, 2));

  console.log(`Saved discovery output to ${options.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
