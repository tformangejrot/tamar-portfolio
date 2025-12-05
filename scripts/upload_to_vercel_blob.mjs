#!/usr/bin/env node

/**
 * Script to upload data files to Vercel Blob
 * 
 * Usage:
 *   1. Install: npm install @vercel/blob
 *   2. Set VERCEL_BLOB_TOKEN environment variable
 *   3. Run: node scripts/upload_to_vercel_blob.mjs
 */

import { put } from '@vercel/blob';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DATA_FILE = path.join(ROOT, 'data/processed/studios_consolidated_boutique_v2.json');

async function uploadToBlob() {
  const token = process.env.VERCEL_BLOB_TOKEN;
  if (!token) {
    console.error('Error: VERCEL_BLOB_TOKEN environment variable is required');
    console.error('Get your token from: https://vercel.com/docs/storage/vercel-blob/quickstart');
    process.exit(1);
  }

  try {
    console.log('Reading data file...');
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const jsonData = JSON.parse(data);
    
    console.log(`Uploading ${jsonData.length} studios to Vercel Blob...`);
    
    const blob = await put('studios_consolidated_boutique_v2.json', data, {
      access: 'public',
      token,
    });

    console.log('✓ Upload successful!');
    console.log(`  URL: ${blob.url}`);
    console.log(`\nAdd this to your dashboard.html:`);
    console.log(`  const DATA_URL = '${blob.url}';`);
    
    return blob.url;
  } catch (error) {
    console.error('Upload failed:', error.message);
    process.exit(1);
  }
}

uploadToBlob();

