#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/studios_consolidated_boutique_london.json');

// Mapping of location identifiers to opening dates
const openingDates = {
  'old-street': { date: '2016-01-15', source: 'user_provided', notes: 'Brand\'s very first MoreYoga studio, opened early 2016' },
  'oldstreet': { date: '2016-01-15', source: 'user_provided', notes: 'Brand\'s very first MoreYoga studio, opened early 2016' },
  'exmouth': { date: '2016-01-15', source: 'user_provided', notes: 'Opened alongside Old Street as one of the initial two studios in 2016' },
  'exmouth-market': { date: '2016-01-15', source: 'user_provided', notes: 'Opened alongside Old Street as one of the initial two studios in 2016' },
  'exmouthmarket': { date: '2016-01-15', source: 'user_provided', notes: 'Opened alongside Old Street as one of the initial two studios in 2016' },
  'woolwich': { date: '2019-02-15', source: 'user_provided', notes: 'Opened February 2019, first of 25 planned that year' },
  'balham': { date: '2019-02-15', source: 'user_provided', notes: 'Opened February-March 2019 as part of 2019 rollout' },
  'hackney': { date: '2019-02-15', source: 'user_provided', notes: 'Opened February-March 2019 as part of 2019 rollout' },
  'haggerston': { date: '2019-02-15', source: 'user_provided', notes: 'Opened February-March 2019 as part of 2019 rollout' },
  'croydon': { date: '2019-02-15', source: 'user_provided', notes: 'Opened February-March 2019 as part of early 2019 rollout' },
  'bayswater': { date: '2019-06-15', source: 'user_provided', notes: 'Opened mid-2019 as part of Everyone Active partnership' },
  'victoria': { date: '2019-06-15', source: 'user_provided', notes: 'Opened mid-2019 as part of Everyone Active partnership rollout' },
  'elephant': { date: '2019-06-15', source: 'user_provided', notes: 'Opened mid-2019 as part of Everyone Active partnership' },
  'elephant-castle': { date: '2019-06-15', source: 'user_provided', notes: 'Opened mid-2019 as part of Everyone Active partnership' },
  'peckham': { date: '2025-03-15', source: 'user_provided', notes: 'Opened March-April 2025' },
  'peckham-rye': { date: '2025-03-15', source: 'user_provided', notes: 'Opened March-April 2025' },
  'battersea': { date: '2025-03-15', source: 'user_provided', notes: 'Opened March 2025' },
  'canary-wharf': { date: '2026-02-15', source: 'user_provided', notes: 'Opens February 2026' },
  'canarywharf': { date: '2026-02-15', source: 'user_provided', notes: 'Opens February 2026' },
  'kentish-town': { date: '2026-01-26', source: 'user_provided', notes: 'Opens 26 January 2026' },
  'kentishtown': { date: '2026-01-26', source: 'user_provided', notes: 'Opens 26 January 2026' },
  // Dates estimated from earliest Google review
  'east-greenwich': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'greenwich': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'wandsworth': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'stratford': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'brixton': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'angel': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'bermondsey': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'finsbury-park': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'finsburypark': { date: '2017-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2017)' },
  'surrey-quays': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'surreyquays': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'caledonian-road': { date: '2018-05-15', source: 'user_provided', notes: 'Estimated from earliest Google review (May 2018)' },
  'caledonianroad': { date: '2018-05-15', source: 'user_provided', notes: 'Estimated from earliest Google review (May 2018)' },
  'lewisham': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'harringay': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'greenwich-creekside': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'creekside': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'aldgate': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'camden': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'dalston': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'blackwall': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'blackhorse-road': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'blackhorseroad': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'north-finchley': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'northfinchley': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' },
  'stamford-brook': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'stamfordbrook': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'tulse-hill': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'tulsehill': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'clapham-junction': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'claphamjunction': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'tower-bridge': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'towerbridge': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'cannon-street': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'cannonstreet': { date: '2021-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2021)' },
  'stoke-newington': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'stokenewington': { date: '2018-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2018)' },
  'soho': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'winchmore-hill': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'winchmorehill': { date: '2019-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2019)' },
  'wembley': { date: '2020-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2020)' },
  'uxbridge': { date: '2022-01-15', source: 'user_provided', notes: 'Estimated from earliest Google review (2022)' }
};

async function main() {
  console.log('Loading consolidated boutique London data...\n');
  const data = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  
  let updated = 0;
  const unmatched = [];
  
  data.forEach(studio => {
    if (!/moreyoga/i.test(studio.name)) return;
    
    // Extract location identifier from detail_url and location
    const url = (studio.detail_url || '').toLowerCase();
    const location = (studio.location || '').toLowerCase();
    let locationKey = null;
    
    // Match location identifiers - try URL first, then location text
    for (const key of Object.keys(openingDates)) {
      const keyVariants = [
        key,
        key.replace(/-/g, ''),
        key.replace(/-/g, ' ')
      ];
      
      for (const variant of keyVariants) {
        if (url.includes(variant) || location.includes(variant)) {
          locationKey = key;
          break;
        }
      }
      if (locationKey) break;
    }
    
    if (locationKey && openingDates[locationKey]) {
      const dateInfo = openingDates[locationKey];
      studio.estimated_opening_date = dateInfo.date;
      studio.opening_date_source = dateInfo.source;
      studio.opening_date_notes = dateInfo.notes;
      updated++;
      console.log(`✓ Updated ${studio.name} - ${locationKey}: ${dateInfo.date}`);
      console.log(`  Location: ${studio.location}`);
    } else {
      unmatched.push({
        name: studio.name,
        location: studio.location,
        url: studio.detail_url
      });
    }
  });
  
  if (unmatched.length > 0) {
    console.log('\n⚠ Unmatched MoreYoga locations:');
    unmatched.forEach(s => {
      console.log(`  - ${s.name}: ${s.location}`);
      console.log(`    URL: ${s.url}`);
    });
  }
  
  // Save updated data
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  
  console.log(`\n✓ Updated ${updated} MoreYoga locations`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
