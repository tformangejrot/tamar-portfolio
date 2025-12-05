#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DATA_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_v2.json');

// French words/patterns that indicate French language
const frenchIndicators = [
  'académie', 'academie', 'atelier', 'ateliers', 'au', 'aux', 'chez', 'club', 'cours', 'danse',
  'de', 'des', 'du', 'école', 'ecole', 'espace', 'fitness', 'français', 'francaise', 'fr',
  'gymnase', 'maison', 'paris', 'rue', 'salle', 'studio', 'sur', 'yoga'
];

// English words that indicate English language
const englishIndicators = [
  'academy', 'athletic', 'athletics', 'body', 'box', 'boxing', 'club', 'coaching', 'cycle',
  'cycling', 'dance', 'fitness', 'form', 'house', 'lab', 'life', 'method', 'movement',
  'pilates', 'point', 'power', 'rebel', 'reform', 'reformer', 'room', 'sport', 'sporting',
  'studio', 'training', 'wellness', 'yoga', 'zen'
];

// Woowoo/spiritual indicators
const woowooIndicators = [
  'aum', 'aura', 'atma', 'atmasphera', 'chakra', 'kundalini', 'moksha', 'namaste', 'nirvana',
  'om', 'prana', 'sanskrit', 'shanti', 'soi', 'zen', 'zenith', 'yogi', 'yogini', 'yuj'
];

// Strong/powerful indicators
const strongIndicators = [
  'athletic', 'athletics', 'beast', 'brutal', 'combat', 'crossfit', 'dynamo', 'force', 'hardcore',
  'intense', 'iron', 'power', 'rebel', 'strength', 'strong', 'warrior', 'xtreme', 'xtreme'
];

// Dreamy/ethereal indicators
const dreamyIndicators = [
  'aura', 'bliss', 'cloud', 'dream', 'ether', 'flow', 'glow', 'light', 'luna', 'moon', 'serene',
  'serenity', 'sky', 'soft', 'soi', 'soul', 'spirit', 'zen', 'zenith'
];

// Fun/playful indicators
const funIndicators = [
  'bang', 'bounce', 'dance', 'fun', 'happy', 'joy', 'play', 'pop', 'snake', 'twist', 'vibe',
  'wild', 'zumba'
];

// Neutral/professional indicators
const neutralIndicators = [
  'academy', 'académie', 'atelier', 'club', 'coaching', 'fitness', 'form', 'house', 'lab',
  'method', 'point', 'room', 'sport', 'studio', 'training'
];

function categorizeLanguage(name) {
  if (!name) return 'unknown';
  
  const lower = name.toLowerCase();
  let frenchScore = 0;
  let englishScore = 0;
  
  frenchIndicators.forEach(word => {
    if (lower.includes(word)) frenchScore++;
  });
  
  englishIndicators.forEach(word => {
    if (lower.includes(word)) englishScore++;
  });
  
  // Check for French-specific characters/patterns
  if (/[àâäéèêëîïôùûüÿç]/.test(name)) frenchScore += 2;
  if (/^(le|la|les|de|du|des|au|aux|chez)/i.test(name)) frenchScore += 2;
  
  if (frenchScore > englishScore && frenchScore > 0) return 'french';
  if (englishScore > frenchScore && englishScore > 0) return 'english';
  if (frenchScore > 0 && englishScore > 0) return 'mixed';
  return 'neutral';
}

function categorizeTone(name) {
  if (!name) return 'neutral';
  
  const lower = name.toLowerCase();
  const tones = [];
  
  woowooIndicators.forEach(word => {
    if (lower.includes(word)) tones.push('woowoo');
  });
  
  strongIndicators.forEach(word => {
    if (lower.includes(word)) tones.push('strong');
  });
  
  dreamyIndicators.forEach(word => {
    if (lower.includes(word)) tones.push('dreamy');
  });
  
  funIndicators.forEach(word => {
    if (lower.includes(word)) tones.push('fun');
  });
  
  // If no specific tone indicators, check if it's neutral/professional
  if (tones.length === 0) {
    const hasNeutral = neutralIndicators.some(word => lower.includes(word));
    return hasNeutral ? 'neutral' : 'other';
  }
  
  // Return the most common tone, or first if tied
  const counts = {};
  tones.forEach(t => counts[t] = (counts[t] || 0) + 1);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

async function main() {
  const studios = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  
  const languageCounts = { english: 0, french: 0, mixed: 0, neutral: 0, unknown: 0 };
  const toneCounts = { woowoo: 0, strong: 0, dreamy: 0, fun: 0, neutral: 0, other: 0 };
  const languageToneMatrix = {};
  
  studios.forEach(studio => {
    const name = studio.name;
    const language = categorizeLanguage(name);
    const tone = categorizeTone(name);
    
    languageCounts[language]++;
    toneCounts[tone]++;
    
    const key = `${language}-${tone}`;
    languageToneMatrix[key] = (languageToneMatrix[key] || 0) + 1;
  });
  
  // Get examples for each category
  const examples = {
    language: {},
    tone: {},
    languageTone: {}
  };
  
  studios.forEach(studio => {
    const name = studio.name;
    const language = categorizeLanguage(name);
    const tone = categorizeTone(name);
    
    if (!examples.language[language] || examples.language[language].length < 5) {
      if (!examples.language[language]) examples.language[language] = [];
      examples.language[language].push(name);
    }
    
    if (!examples.tone[tone] || examples.tone[tone].length < 5) {
      if (!examples.tone[tone]) examples.tone[tone] = [];
      examples.tone[tone].push(name);
    }
    
    const key = `${language}-${tone}`;
    if (!examples.languageTone[key] || examples.languageTone[key].length < 3) {
      if (!examples.languageTone[key]) examples.languageTone[key] = [];
      examples.languageTone[key].push(name);
    }
  });
  
  const results = {
    total: studios.length,
    language: languageCounts,
    tone: toneCounts,
    languageToneMatrix,
    examples
  };
  
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);

