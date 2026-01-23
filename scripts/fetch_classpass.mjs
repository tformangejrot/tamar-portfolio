#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CATEGORY_PATH = path.join(ROOT, 'data/reference/classpass_categories.json');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'data/raw/classpass');

const API_URL = 'https://classpass.com/_api/unisearch/v1/layout/web_search_page';

const defaultOptions = {
  slug: null,
  dryRun: false,
  headless: true,
  categoriesFile: DEFAULT_CATEGORY_PATH,
  outputDir: DEFAULT_OUTPUT_DIR,
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
    } else if (arg.startsWith('--categories-file=')) {
      opts.categoriesFile = path.resolve(ROOT, arg.split('=')[1]);
    } else if (arg === '--categories-file') {
      opts.categoriesFile = path.resolve(ROOT, argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--output-dir=')) {
      opts.outputDir = path.resolve(ROOT, arg.split('=')[1]);
    } else if (arg === '--output-dir') {
      opts.outputDir = path.resolve(ROOT, argv[i + 1]);
      i += 1;
    }
  }
  return opts;
}

async function readCategories(categoriesFile) {
  const raw = await fs.readFile(categoriesFile, 'utf8');
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

async function ensureOutputDir(dir) {
  await fs.mkdir(dir, { recursive: true });
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
  // Wait a bit for the page to fully render
  await page.waitForTimeout(2000);
  
  let storeText = await page.evaluate(() => document.getElementById('store')?.textContent);
  if (!storeText) {
    // Try waiting a bit more and check again
    await page.waitForTimeout(3000);
    storeText = await page.evaluate(() => document.getElementById('store')?.textContent);
    if (!storeText) {
      throw new Error('Unable to locate store payload - page may not have loaded correctly');
    }
  }
  
  const store = JSON.parse(storeText);
  
  // Try the standard path first
  let cursor =
    store.entities?.searchLayoutByName?.data?.web_search_page_1?.web_search_results_01?.data?.cursor;
  
  if (!cursor) {
    // Debug: explore the structure more deeply
    const searchLayoutData = store.entities?.searchLayoutByName?.data;
    if (searchLayoutData?.web_search_page_1) {
      console.log('web_search_page_1 keys:', Object.keys(searchLayoutData.web_search_page_1));
      const page1 = searchLayoutData.web_search_page_1;
      // Look for any module that might contain the cursor
      for (const key of Object.keys(page1)) {
        if (key.includes('search_results') || key.includes('results')) {
          console.log(`Found module: ${key}, keys:`, Object.keys(page1[key] || {}));
          if (page1[key]?.data?.cursor) {
            cursor = page1[key].data.cursor;
            console.log(`Found cursor in ${key}`);
            break;
          }
        }
      }
    }
    
    // Try alternative paths
    if (!cursor) {
      cursor = 
        store.entities?.searchLayoutByName?.data?.web_search_page?.web_search_results_01?.data?.cursor ||
        store.entities?.searchLayoutByName?.data?.web_search_results_01?.data?.cursor ||
        store.entities?.searchLayoutByName?.data?.web_search_page_1?.web_search_results?.data?.cursor;
    }
    
    if (!cursor) {
      console.error('Could not find cursor. Full web_search_page_1 structure:', JSON.stringify(searchLayoutData?.web_search_page_1, null, 2).slice(0, 1000));
      // For some pages (like some London categories), pagination cursor may not be present at all.
      // In that case we'll fall back to using just the first response payload without pagination.
      return null;
    }
  }
  return cursor;
}

// Helper to extract venues from a unisearch payload
function extractVenuesFromPayload(payload) {
  if (!payload) return [];
  const venues =
    payload?.data?.modules?.web_search_results_01?.data?.venue_tab_items ??
    payload?.data?.modules?.web_search_results_01?.data?.sections?.[0]?.content ??
    [];
  return venues;
}

async function fetchVenuePages(page, cursorBase64, category, maxPages = 20) {
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
  // For some ClassPass pages (including London), waiting for full network idle can hang due to
  // long‑lived connections and analytics. Use 'domcontentloaded' instead and rely on our own waits.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissCookieBanner(page);
  
  // Wait for the store element to be available and for initial API calls
  try {
    await page.waitForSelector('#store', { timeout: 15_000 });
  } catch (err) {
    console.warn(`Warning: #store element not found after waiting, continuing anyway...`);
  }
  
  // Wait a bit for network responses to come in
  await page.waitForTimeout(3000);
  
  // Try to extract cursor from network responses first (more reliable)
  let cursor = null;
  if (mapPayloads.length > 0) {
    for (const payload of mapPayloads) {
      const responseCursor = 
        payload?.data?.modules?.web_search_results_01?.data?.cursor ||
        payload?.data?.modules?.web_search_results?.data?.cursor;
      if (responseCursor) {
        cursor = responseCursor;
        console.log('Found cursor from network response');
        break;
      }
    }
  }
  
  // Fall back to store if not found in network responses
  if (!cursor) {
    cursor = await fetchStoreCursor(page);
  }
  
  let cards = [];
  if (cursor) {
    // Normal path: paginate using cursor
    cards = await fetchVenuePages(page, cursor, slug);
  } else {
    // Fallback: no cursor available – extract venues from store's venue_tab_items
    console.warn(`No pagination cursor found for ${slug}. Extracting venues from store data.`);
    
    // Extract venues from store
    const storeText = await page.evaluate(() => document.getElementById('store')?.textContent);
    if (storeText) {
      const store = JSON.parse(storeText);
      const venueTabItems = 
        store.entities?.searchLayoutByName?.data?.web_search_page_1?.web_search_results_01?.data?.venue_tab_items ||
        [];
      
      if (venueTabItems.length > 0) {
        console.log(`Found ${venueTabItems.length} venues in store data`);
        const seen = new Set();
        for (const venue of venueTabItems) {
          const card = venueToCard(venue, slug);
          if (card.name && card.detail_url && !seen.has(card.detail_url)) {
            cards.push(card);
            seen.add(card.detail_url);
          }
        }
      }
    }
    
    // Also try network payloads as backup
    if (cards.length === 0 && mapPayloads.length > 0) {
      for (const payload of mapPayloads) {
        const venues = extractVenuesFromPayload(payload);
        if (venues.length > 0) {
          console.log(`Found ${venues.length} venues in network payload`);
          const seen = new Set(cards.map(c => c.detail_url).filter(Boolean));
          for (const venue of venues) {
            const card = venueToCard(venue, slug);
            if (card.name && card.detail_url && !seen.has(card.detail_url)) {
              cards.push(card);
              seen.add(card.detail_url);
            }
          }
          break; // Use first payload with venues
        }
      }
    }
    
    if (cards.length === 0) {
      console.warn(`No venues found for ${slug} - store data may be empty or in unexpected format`);
    }
  }
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

async function savePayload(slug, payload, outputDir, suffix = '') {
  await ensureOutputDir(outputDir);
  const filename = suffix ? `${slug}-${suffix}.json` : `${slug}.json`;
  const targetPath = path.join(outputDir, filename);
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2));
  console.log(`✓ Saved ${payload.total_cards} cards to ${targetPath}`);
}

const options = parseArgs(process.argv.slice(2));

async function main() {
  const categories = await readCategories(options.categoriesFile);
  const targets = filterCategories(categories, options.slug);
  
  // Detect if this is London based on categories file path
  const isLondon = options.categoriesFile && options.categoriesFile.includes('london');
  const fileSuffix = isLondon ? 'london' : '';

  for (const category of targets) {
    const payload = await fetchCategory(category);
    if (options.dryRun) {
      console.log(JSON.stringify(payload, null, 2).slice(0, 800));
    } else {
      await savePayload(category.slug, payload, options.outputDir, fileSuffix);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


