#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'data/processed/classpass_studios_whois.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/location_pages_enrichment.json');

const options = {
  chainName: null, // e.g., "The New Me"
  limit: null, // null = all, or number to limit
  headless: true,
};

function parseArgs(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headful') {
      options.headless = false;
    } else if (arg.startsWith('--chain=')) {
      options.chainName = arg.split('=')[1];
    } else if (arg === '--chain') {
      options.chainName = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--limit') {
      options.limit = parseInt(argv[i + 1], 10);
      i += 1;
    }
  }
}

async function loadExisting() {
  try {
    const data = JSON.parse(await fs.readFile(OUTPUT_PATH, 'utf8'));
    return new Map(data.map((item) => [item.detail_url || item.name, item]));
  } catch {
    return new Map();
  }
}

async function scrapeLocationPage(page, url, studio) {
  console.log(`  → Visiting ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Wait a bit for any dynamic content
  await page.waitForTimeout(2000);

  // Extract various potential sources of opening date information
  const data = await page.evaluate(() => {
    const result = {
      page_title: document.title,
      meta_description: document.querySelector('meta[name="description"]')?.content || null,
      page_text: document.body.innerText || '',
      structured_data: [],
      opening_date_mentions: [],
    };

    // Look for structured data (JSON-LD)
    const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        result.structured_data.push(data);
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Look for common patterns that might indicate opening dates
    const text = result.page_text.toLowerCase();
    const datePatterns = [
      /(?:ouvert|open|inaugur|créé|crée|fondé|fondée|depuis|lancé|lancée)\s+(?:en|le|depuis|since|in)\s+(\d{4})/gi,
      /(?:ouvert|open|inaugur|créé|crée|fondé|fondée|depuis|lancé|lancée)\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi,
      /(\d{4})\s+(?:est|was)\s+(?:ouvert|open|inaugur|créé|crée|fondé|fondée|lancé|lancée)/gi,
    ];

    for (const pattern of datePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        result.opening_date_mentions.push(match[0]);
      }
    }

    // Look for specific date mentions in visible text
    const dateRegex = /\b(19|20)\d{2}\b/g;
    const yearMatches = Array.from(text.matchAll(dateRegex));
    const uniqueYears = [...new Set(yearMatches.map(m => m[0]))];
    result.mentioned_years = uniqueYears;

    return result;
  });

  return {
    ...studio,
    location_page_url: url,
    location_page_data: data,
    scraped_at: new Date().toISOString(),
  };
}

async function main() {
  parseArgs(process.argv.slice(2));

  const studios = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  const existing = await loadExisting();
  const results = Array.from(existing.values());
  const seenKeys = new Set(results.map((r) => r.detail_url || r.name));

  // Filter to chain if specified
  let filtered = studios;
  if (options.chainName) {
    filtered = studios.filter((s) =>
      s.name.toLowerCase().includes(options.chainName.toLowerCase())
    );
    console.log(`Filtered to ${filtered.length} locations for "${options.chainName}"`);
  }

  // Filter to only studios with website URLs
  filtered = filtered.filter((s) => s.website && s.website.startsWith('http'));

  // Apply limit
  const slice = options.limit
    ? filtered.slice(0, options.limit)
    : filtered;

  console.log(`Scraping ${slice.length} location pages...\n`);

  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  for (const studio of slice) {
    const key = studio.detail_url || studio.name;
    if (seenKeys.has(key)) {
      console.log(`⏭  Skipping ${studio.name} (already processed)`);
      continue;
    }

    if (!studio.website) {
      console.log(`⏭  Skipping ${studio.name} (no website)`);
      continue;
    }

    try {
      console.log(`\n📍 ${studio.name} - ${studio.location}`);
      const enriched = await scrapeLocationPage(page, studio.website, studio);
      results.push(enriched);
      seenKeys.add(key);
      console.log(`  ✓ Scraped successfully`);
    } catch (err) {
      results.push({
        ...studio,
        location_page_url: studio.website,
        error: err.message,
        scraped_at: new Date().toISOString(),
      });
      console.warn(`  ✗ Error: ${err.message}`);
    }

    // Save after each scrape
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));

    // Be polite - wait between requests
    await page.waitForTimeout(1000);
  }

  await browser.close();

  console.log(`\n✓ Saved ${results.length} enriched records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

