#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CATEGORY_PATH = path.join(ROOT, 'data/reference/classpass_categories.json');
const OUTPUT_DIR = path.join(ROOT, 'data/raw/classpass');

const API_URL = 'https://classpass.com/_api/unisearch/v1/layout/web_search_page';

const defaultOptions = {
  slug: null,
  dryRun: false,
  headless: true,
};

function parseArgs(argv) {
  const opts = { ...defaultOptions };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--headful') {
      opts.headless = false;
    } else if (arg.startsWith('--slug=')) {
      opts.slug = arg.split('=')[1];
    } else if (arg === '--slug') {
      opts.slug = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

async function readCategories() {
  const raw = await fs.readFile(CATEGORY_PATH, 'utf8');
  return JSON.parse(raw);
}

function filterCategories(categories, slug) {
  if (!slug) return categories;
  const match = categories.find((cat) => cat.slug === slug);
  if (!match) {
    throw new Error(`Slug "${slug}" not found in classpass_categories.json`);
  }
  return [match];
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function dismissCookieBanner(page) {
  const acceptBtn = page.locator('#truste-consent-button');
  if (await acceptBtn.isVisible()) {
    await acceptBtn.click().catch(() => {});
  }
}

function decodeCursor(cursor) {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
}

function encodeCursor(cursorObj) {
  return Buffer.from(JSON.stringify(cursorObj)).toString('base64');
}

function venueToCard(venue, category) {
  const locationParts = [venue.address?.address_line1, venue.address?.city].filter(Boolean);
  const location = locationParts.length ? locationParts.join(', ') : venue.address?.address_line0 ?? null;
  const detailUrl = venue.alias ? `https://classpass.com/studios/${venue.alias}` : null;

  return {
    name: venue.venue_name ?? venue.alias ?? null,
    detail_url: detailUrl,
    category,
    location,
    rating: venue.display_rating_average ? String(venue.display_rating_average) : null,
    rating_count: venue.display_rating_total ? `(${venue.display_rating_total})` : null,
    safety_badge: Boolean(venue.attributes?.safety_and_cleanliness?.items?.length),
  };
}

async function fetchStoreCursor(page) {
  const storeText = await page.evaluate(() => document.getElementById('store')?.textContent);
  if (!storeText) throw new Error('Unable to locate store payload');
  const store = JSON.parse(storeText);
  const cursor =
    store.entities?.searchLayoutByName?.data?.web_search_page_1?.web_search_results_01?.data?.cursor;
  if (!cursor) throw new Error('Cursor not found in store data');
  return cursor;
}

async function fetchVenuePages(page, cursorBase64, category, maxPages = 10) {
  const cursorTemplate = decodeCursor(cursorBase64);
  const pageSize = cursorTemplate?.search_request?.venue_search_options?.page_size ?? 50;
  const aggregated = [];
  const seen = new Set();

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const cursorPayload = { ...cursorTemplate, page_number: pageNumber };
    const encodedCursor = encodeCursor(cursorPayload);
    const result = await page.evaluate(
      async ({ cursorValue, apiUrl }) => {
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              search_request: { cursor: cursorValue },
              modules: ['web_search_results_01'],
            }),
          });
          if (!res.ok) {
            return { error: `HTTP ${res.status}` };
          }
          const data = await res.json();
          const venues =
            data?.data?.modules?.web_search_results_01?.data?.venue_tab_items ??
            data?.data?.modules?.web_search_results_01?.data?.sections?.[0]?.content ??
            [];
          return { venues };
        } catch (err) {
          return { error: err?.message ?? 'unknown error' };
        }
      },
      { cursorValue: encodedCursor, apiUrl: API_URL },
    );

    if (result.error) {
      console.warn(`Failed to fetch page ${pageNumber + 1}: ${result.error}`);
      break;
    }

    const venues = result.venues ?? [];
    if (!venues.length) {
      break;
    }
    for (const venue of venues) {
      const card = venueToCard(venue, category);
      if (card.name && card.detail_url && !seen.has(card.detail_url)) {
        aggregated.push(card);
        seen.add(card.detail_url);
      }
    }
    if (venues.length < pageSize) {
      break;
    }
  }

  return aggregated;
}

async function fetchCategory({ classpass_url: url, slug, label }) {
  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const mapPayloads = [];

  page.on('response', async (response) => {
    if (response.url().includes('/_api/unisearch/')) {
      try {
        mapPayloads.push(await response.json());
      } catch (err) {
        console.warn('Failed to parse unisearch response:', err.message);
      }
    }
  });

  console.log(`→ Loading ${slug} (${url})`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissCookieBanner(page);
  const cursor = await fetchStoreCursor(page);
  const cards = await fetchVenuePages(page, cursor, slug);
  await browser.close();

  return {
    slug,
    label,
    fetched_at: new Date().toISOString(),
    url,
    total_cards: cards.length,
    cards,
    map_payloads: mapPayloads,
  };
}

async function savePayload(slug, payload) {
  await ensureOutputDir();
  const targetPath = path.join(OUTPUT_DIR, `${slug}.json`);
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2));
  console.log(`✓ Saved ${payload.total_cards} cards to ${targetPath}`);
}

const options = parseArgs(process.argv.slice(2));

async function main() {
  const categories = await readCategories();
  const targets = filterCategories(categories, options.slug);

  for (const category of targets) {
    const payload = await fetchCategory(category);
    if (options.dryRun) {
      console.log(JSON.stringify(payload, null, 2).slice(0, 800));
    } else {
      await savePayload(category.slug, payload);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


