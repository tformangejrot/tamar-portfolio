#!/usr/bin/env node

/**
 * Filter Berlin consolidated studios to boutique-only.
 *
 * Applies two layers of filtering on top of the raw category filter
 * already run during consolidation:
 *
 *   1. Category filter — removes studios whose only categories are
 *      'fitness', 'gym-time', or 'personal-training' (re-applied here
 *      so this script can run standalone).
 *
 *   2. Name exclusion list — removes specific businesses confirmed via manual
 *      review (Google Sheets review, column K) to be non-boutique-fitness:
 *        - Chain gyms / large fitness clubs
 *        - Retail / hardware / sporting goods / fashion stores
 *        - Birth / midwife / doula / prenatal services
 *        - Individual personal trainers and dedicated PT studios
 *        - Dance venues (opera houses, ballrooms — not fitness instruction)
 *        - Beauty / medical aesthetics clinics
 *        - Art, sculpture, coding schools, and other mismatches
 *        - Parks, playgrounds, and outdoor spaces
 *
 * Reads:  data/processed/berlin_studios_consolidated.json
 * Writes: data/processed/berlin_studios_consolidated_boutique.json
 *
 * Usage:
 *   node scripts/create_boutique_only_berlin.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const INPUT_PATH  = path.join(ROOT, 'data/processed/berlin_studios_consolidated.json');
const OUTPUT_PATH = path.join(ROOT, 'data/processed/berlin_studios_consolidated_boutique.json');

// ─── Category-based exclusions ────────────────────────────────────────────────
// Studios whose ONLY consolidated categories are in this list are excluded.
// personal-training added so individual PT businesses with no group offering
// are caught at the category layer rather than needing explicit name patterns.
const EXCLUDED_CATEGORIES = ['fitness', 'gym-time', 'personal-training'];

// ─── Name-based exclusions ────────────────────────────────────────────────────
// Confirmed non-boutique-fitness businesses identified during manual data review.
// Each entry is a regex tested against the studio name (case-insensitive).
const NAME_EXCLUSIONS = [

  // ── SUPERMARKET ──────────────────────────────────────────────────────────────
  /^kaufland/i,
  /^rewe\b/i,
  /^hit supermarkt/i,

  // ── CHAIN GYM / LARGE FITNESS CLUB ──────────────────────────────────────────
  /^holmes place/i,
  /^fitness first/i,
  /^mcfit\b/i,
  /^superfit\b/i,
  /gold'?s gym/i,
  /^elixia\b/i,
  /^crunch fit/i,
  /^clever fit/i,
  /^clays\b/i,              // "Clays Mein Körper. Mein Club."
  /^aspria\b/i,
  /^bestmood\b/i,
  /^urban sports club/i,
  /^bodycon?cept\b/i,
  /^dokan sportclub/i,
  /^fit t9\b/i,
  /^pink frauen fitness/i,
  /^graziös/i,
  /^campusfit/i,
  /^power factory\b/i,
  /^unlimited fitness/i,
  /^fitness company/i,
  /^fitness am park\b/i,
  /^gymfit\b/i,
  /^gymondo/i,
  /^grindhouse berlin/i,
  /^spannkraft\b/i,         // sports club / aggregator
  /^sv empor berlin/i,      // sports club
  /^gleim gym/i,
  /^allstar gym/i,
  /^evo fitness\b/i,
  /^box gym\b/i,            // Box Gym Coepenick
  /^koryo\b/i,              // Koryo GYM Berlin (box gym / Sportschule)
  /^hagius\b/i,             // luxury spa / wellness club

  // ── RETAIL / HARDWARE / SPORTING GOODS / FASHION ────────────────────────────
  /^galeria\b/i,
  /kadewe|kaufhaus des westens/i,
  /^tk maxx/i,
  /^woolworth/i,
  /^mall of berlin/i,
  /^fahrradstation/i,
  /^rapha berlin/i,
  /^steel vintage bikes/i,
  /^tortuga cycles/i,
  /^bauhaus\b/i,            // hardware chain (not the art school)
  /^decathlon/i,
  /^hellweg\b/i,            // hardware chain
  /^obi markt/i,            // hardware chain
  /^toom baumarkt/i,        // hardware chain
  /^max werk hardware/i,
  /^intersport/i,
  /^sportscheck/i,
  /^lululemon/i,
  /^ikea\b/i,
  /^smyths toys/i,
  /^fitshop\b/i,            // fitness equipment retailer
  /^strength shop/i,        // equipment retailer
  /^bellicon europe/i,      // trampoline manufacturer/retailer
  /^hammer fitness/i,       // equipment retailer
  /^sportstech store/i,
  /^studio lietz\b/i,       // yoga equipment retailer (not a studio)
  /^keiko sports/i,
  /^on running gmbh/i,
  /^titus berlin/i,         // skate/streetwear retail
  /^firmament berlin/i,     // streetwear retail
  /^kapten & son/i,         // accessories retail
  /^onitsuka tiger/i,
  /^dc4 store/i,
  /^hhv store/i,            // record store
  /^soultrade record/i,     // record store
  /^bis aufs messer/i,      // record store
  /^the-baseball-shop/i,
  /^bowling-shop/i,
  /^falke schuh/i,          // shoe/locksmith shop
  /^zeller tanzschuhe/i,    // dance shoe shop
  /^tanzschuh-shop/i,       // dance shoe shop
  /^atelier hamidi/i,       // cobbler / shoe designer
  /^myshape/i,
  /^wollen berlin/i,

  // ── BIRTH / MIDWIFE / DOULA / PRENATAL ──────────────────────────────────────
  /\bhebamm/i,              // Hebamme, Hebammen, Hebammenpraxis, Hebammerie, etc.
  /\bdoula\b/i,
  /^geburtshaus/i,
  /hypnobirthing/i,
  /^birthlover/i,
  /^birth (?:and|&)/i,
  /^elternschule/i,
  /^mamanana/i,
  /^mamacura/i,
  /pränataldiagnostik|prenatal diagnostics/i,
  /^center for prenatal/i,
  /^practice for prenatal/i,
  /^empowered beginnings antenatal/i,
  /schwangerschaftsmassage/i,
  /^frauke stadali/i,       // individual teacher: yoga für Schwangere
  /^keleya\b/i,             // mama wellness app
  /^abricot coco/i,         // maternity clothing
  /^mommy & maternity/i,    // maternity photography
  /^zohar ren/i,

  // ── PERSONAL TRAINING (individual / dedicated PT businesses) ─────────────────
  // Category filter catches studios with ONLY 'personal-training' category;
  // these name patterns catch PT businesses that have extra category tags.
  /^personal trainer\b/i,
  /^personal training\b/i,
  /^berlin personal training/i,
  /^dein personal trainer/i,
  /^hit bln\b/i,            // HIT BLN personal training gyms
  /^aurum training/i,
  /^das fitness atelier/i,
  /^das trainingslager/i,
  /^energia fitness/i,
  /^eden private gym/i,
  /^eza personal/i,
  /^grt personal/i,
  /^healthy push/i,
  /^pt base\b/i,
  /^smart strength/i,
  /^wd space\b/i,
  /^strive for more/i,
  /^strike riser/i,
  /^sebs?\.? personaltraining/i,
  /^re-burn\b/i,
  /^coach brodi/i,
  /^women'?s lift lounge/i,
  /^mtm personal training/i,
  /^fit mit müske/i,
  /^kraftraum\b/i,
  /^lani berlin/i,
  /^heumann personal training/i,
  /^vitalkontor/i,
  /^donnaevolution/i,
  /^fitness kladow/i,
  /^gymfit$/i,

  // ── NIGHTCLUB / BAR / ENTERTAINMENT ─────────────────────────────────────────
  /^angels berlin/i,
  /^bricks club berlin/i,
  /^havanna\b/i,
  /^matrix club berlin/i,
  /^maxxim\b/i,
  /^soda club berlin/i,
  /^surprise club/i,
  /^l\.u\.x\b|leiseste unterhaltung/i,
  /^quasimodo\b/i,
  /^b-flat\b|b flat acoustic/i,
  /^zig zag jazz/i,
  /^jazzclub.*schlot|kunstfabrik schlot/i,
  /^yorckschlösschen|yorckschloesschen/i,
  /^soulcat/i,
  /^the hat bar/i,
  /^cancún\b|^cancun\b/i,
  /^bebo bar/i,
  /^latin\b/i,              // bar called "Latin" in Kreuzberg
  /^beachmitte/i,           // beach bar/club

  // ── DANCE SCHOOLS / VENUES (non-boutique-fitness) ────────────────────────────
  /^nir tiomkin/i,          // Rolfing bodywork practice
  /^pro danse/i,
  /^dock 11\b/i,            // contemporary dance venue
  /^berlin tanzt/i,         // dance events / platform
  /^royal dance berlin/i,
  /^high heels dance/i,

  // ── BALLROOM / OPERA / SOCIAL DANCE (non-fitness instruction) ────────────────
  /clärchens ballroom|claerchens ball/i,
  /walzerlinksgestrickt/i,
  /^tanzschule werk36|^werk36\b/i,
  /^deutsche oper berlin/i,
  /^berlin state opera/i,
  /^ck ballhaus/i,
  /^ballhaus wedding/i,
  /^btc grün-gold|^btc grun-gold/i,
  /^privatunterricht für standard/i,  // private ballroom dance lessons

  // ── BEAUTY / MEDICAL AESTHETICS ──────────────────────────────────────────────
  /^facesculptclinic/i,
  /^inshape.*kosmetik/i,
  /qi gong.*beauty.*nadine|beauty.*qi gong.*nadine/i,
  /^skin & sculpt/i,        // medical aesthetics clinic
  /^coolsculpting berlin/i,
  /^soulhouse.*prenzl/i,    // massage / facework spa
  /^körperwerkstatt berlin/i,
  /^qi studio berlin/i,     // massage studio

  // ── ART / SCULPTURE / GALLERY ────────────────────────────────────────────────
  /^berlin sculpture atelier/i,
  /^school of sculpture/i,
  /^sculpture club/i,
  /^sculpt!\b|^sculpt bühnen/i,
  /^barsega studio/i,
  /^mar ripoll art/i,
  /^artnuts/i,
  /^studio monbijou/i,
  /^fitheater\b/i,          // "Artistic Coaching Studio" (not fitness)
  /^the hand with watch sculpture/i,

  // ── CODING / TECH / FILM EDUCATION ──────────────────────────────────────────
  /^code labs academy/i,
  /^codeworks/i,
  /^wbs coding school/i,
  /^spiced academy/i,
  /^art-on-the-run/i,       // film school
  /^le wagon\b/i,           // coding bootcamp
  /^ironhack\b/i,           // tech bootcamp

  // ── BICYCLE SHOPS / RENTAL / TOURS ──────────────────────────────────────────
  // fahrradstation and tortuga cycles already listed under RETAIL above
  /^biking$/i,              // standalone entry named "Biking"
  /^8bar bikes/i,
  /^radwelt berlin/i,
  /^veloroo\b/i,
  /^brompton\b/i,           // Brompton Junction Berlin & BROMPTON store
  /^the urban mobility store/i,
  /^velobande/i,
  /^cube store berlin/i,
  /^s3velo/i,
  /^cycle berlin\b/i,       // cycling lifestyle/retail brand (not a spin studio)
  /^rent a bike\b/i,
  /^zweirad-center/i,
  /^urban bike tours/i,
  /^bike a-way/i,
  /^rose bikes/i,
  /^maap lab/i,             // cycling apparel brand showroom
  /^flashfix fahrrad/i,
  /^velocelli/i,
  /^swapfiets/i,
  /^free berlin bike/i,
  /^fisiclass bikes/i,
  /^bbt-sightseeing/i,
  /^zoomo e-bikes/i,
  /^e-motion e-bike/i,
  /^bikeopia/i,
  /^vintage vélo/i,
  /^bike rent & bike/i,
  /^standert bicycles/i,
  /^cicli berlinetta/i,
  /^monsieur vélo/i,
  /^berlin racing bikes/i,
  /^myhotelbike/i,
  /^bikesurfberlin/i,
  /^lemmo hub/i,            // e-bike sharing
  /^listnride/i,            // bike rental platform
  /^plush-trail/i,
  /^dance gmbh/i,           // "Dance GmbH - E-Bike Rental Berlin"

  // ── PARKS / PLAYGROUNDS / OUTDOOR SPACES ────────────────────────────────────
  /^gleisdreieck\b/i,
  /^tempelhofer feld/i,     // public park / former airfield
  /^hasenheide parkrun/i,
  /^sports grounds/i,
  /^volkspark wilmersdorf/i,
  /^molecule man/i,
  /^trampoline spielplatz|^trampoline am wohnheim|^trampolin$/i,  // playgrounds
  /^hüpfburgen oase/i,      // bouncy castle rental

  // ── CHILDREN'S / FAMILY SERVICES ────────────────────────────────────────────
  /^bim & boom/i,           // kids' indoor play centre
  /^insideout berlin/i,     // youth centre
  /^miteinander wachsen/i,  // Montessori/Pikler play groups
  /^kinderyoga berlin/i,    // children's yoga service (not a studio)
  /^tobeins?el\b/i,

  // ── MISC / OTHER ─────────────────────────────────────────────────────────────
  /^teufelsberg\b/i,        // Cold War listening station / museum
  /^freiluftkino kreuzberg/i, // open-air cinema
  /^sun outdoors ocean city/i, // RV park in Berlin, Maryland (USA)
  /^silent running catering/i,
  /^ems\b.*music|electronic music school/i,  // EMS = music school (not EMS training)
  /^berlin-katzenpension/i, // cat boarding
  /^afrika yetu/i,          // African cultural organisation
  /^alexander juschka/i,    // dance travel / tours
  /^bearbox\b/i,
  /^pfefferberg haus/i,
  /^holi collective/i,
  /^mahakala center/i,
  /^life artists/i,
  /^goeerki\b/i,
  /^blend kollektiv/i,      // running club aggregator (not a studio)
  /^x$/i,                   // entry named just "X"
  /^norma mi sol/i,
  /^zehlendorfer welle/i,   // municipal swimming pool / sports centre
  /^zeli boutique/i,
  /^khalida nuit/i,
  /^gesundheitskurs/i,      // online health course platform
  /^mikrostudio schöneiche/i,
  /^barfu[sßẞ] in berlin/i,   // BARFUẞ IN BERLIN (uppercase ẞ)
  /^anastasia yoga im yoga/i, // individual teacher at shared space

  // ── INDIVIDUAL PERSONAL TRAINERS / TEACHERS (name-first) ─────────────────────
  // These don't start with "Personal Trainer/Training" so need explicit patterns.
  /^fritz reincke/i,
  /^mike christen/i,
  /^thomas franke personal/i,
  /^tayfun berlin personal/i,
  /^personal fitness lounge/i,
  /^personal- und bootcamp/i,  // "Personal- und Bootcamp Training..."
  /personal trainer berlin\s*$/i, // catches "️ ▷▷ Personal Trainer Berlin" (emoji prefix)
  /^christian schrader/i,
  /^eileen gallasch/i,
  /^sandra geithner/i,
  /^nina raem\b/i,
  /^jonny stahl rehab/i,
  /^juliette s pilates/i,      // individual pilates teacher
  /^zinkernagel\b/i,
  /^suun berlin/i,             // formerly CARÁ — wellness club/spa

  // ── REMAINING SCULPTURE / ART ─────────────────────────────────────────────────
  /^sculpture workshop/i,      // "Sculpture workshop in the cultural work of the bbk berlin"
  /^sculpt!/i,                 // "SCULPT! BÜHNENPLASTIK..."
];

function isBoutiqueByCategory(studio) {
  const cats = studio.categories || [];
  if (cats.length === 0) return true; // no categories → keep (edge case)
  return !cats.every(c => EXCLUDED_CATEGORIES.includes(c.toLowerCase()));
}

function isExcludedByName(studio) {
  const name = studio.name || '';
  return NAME_EXCLUSIONS.some(re => re.test(name));
}

async function main() {
  console.log('Reading consolidated studios...');
  const all = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  console.log(`- Total consolidated: ${all.length}`);

  const afterCategoryFilter = all.filter(isBoutiqueByCategory);
  const removedByCategory = all.length - afterCategoryFilter.length;
  console.log(`- Removed by category filter (fitness/gym-time/personal-training only): ${removedByCategory}`);

  const boutique = afterCategoryFilter.filter(s => !isExcludedByName(s));
  const removedByName = afterCategoryFilter.length - boutique.length;
  console.log(`- Removed by name exclusion list: ${removedByName}`);
  console.log(`- Final boutique studios: ${boutique.length}\n`);

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(boutique, null, 2));
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
