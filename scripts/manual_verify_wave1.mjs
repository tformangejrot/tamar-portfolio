#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'data/pricing/paris_pricing_master.json');

function markVerified(record, notes) {
  record.manual_verified = true;
  record.manual_verification_date = new Date().toISOString().slice(0, 10);
  record.manual_verification_notes = notes;
  record.review_required = false;
}

async function main() {
  const data = JSON.parse(await fs.readFile(MASTER_PATH, 'utf8'));
  const byDomain = new Map(data.map((row) => [row.domain, row]));

  const becoached = byDomain.get('becoached.fr');
  if (becoached) {
    markVerified(becoached, 'Verified from published tarifs page.');
  }

  const cddm = byDomain.get('centrededansedumarais.fr');
  if (cddm) {
    cddm.pricing_publicly_available = true;
    cddm.pricing_url = 'http://www.centrededansedumarais.fr/tarifs/';
    cddm.drop_in = { price: 20, duration_minutes: 90 };
    cddm.class_packs = [
      { name: '4 cours', classes: 4, total_price: 70, price_per_class: 17.5, discount_vs_dropin_pct: 12.5, validity_days: null, notes: '' },
      { name: '8 cours', classes: 8, total_price: 120, price_per_class: 15, discount_vs_dropin_pct: 25, validity_days: null, notes: '' },
      { name: '12 cours', classes: 12, total_price: 165, price_per_class: 13.75, discount_vs_dropin_pct: 31.25, validity_days: null, notes: '' },
      { name: 'Pass 5 cours', classes: 5, total_price: 75, price_per_class: 15, discount_vs_dropin_pct: 25, validity_days: null, notes: '' },
    ];
    cddm.expiration_policy = {
      single_class_validity_days: null,
      pack_validity_days: null,
      notes: 'Adhesion valid 1 year. Tickets and passes non-refundable.',
    };
    markVerified(cddm, 'Verified from tarifs page; structured principal packs and drop-in.');
  }

  const ajahouse = byDomain.get('ajahouse.fr');
  if (ajahouse) {
    ajahouse.pricing_publicly_available = true;
    ajahouse.pricing_url = 'https://www.ajahouse.fr/tarifs-cours-collectifs/';
    ajahouse.booking_software = 'mindbody';
    ajahouse.drop_in = { price: 32, duration_minutes: null };
    ajahouse.drop_in_by_modality = { reformer_pilates: 40, mat_barre_fitness: 32 };
    ajahouse.intro_offers = [
      { type: 'Offre découverte', name: '3 cours au choix', price: 60, classes_included: 3, validity_days: 30, notes: 'Nouveaux clients' },
    ];
    ajahouse.class_packs = [
      { name: 'Reformer 5 cours', classes: 5, total_price: 190, price_per_class: 38, discount_vs_dropin_pct: 5, validity_days: 90, notes: '' },
      { name: 'Reformer 10 cours', classes: 10, total_price: 360, price_per_class: 36, discount_vs_dropin_pct: 10, validity_days: 180, notes: '' },
      { name: 'Reformer 20 cours', classes: 20, total_price: 680, price_per_class: 34, discount_vs_dropin_pct: 15, validity_days: 365, notes: '' },
      { name: 'Yoga/Barre/Fitness 5 cours', classes: 5, total_price: 160, price_per_class: 32, discount_vs_dropin_pct: 0, validity_days: 90, notes: '' },
      { name: 'Yoga/Barre/Fitness 10 cours', classes: 10, total_price: 300, price_per_class: 30, discount_vs_dropin_pct: 6.25, validity_days: 180, notes: '' },
      { name: 'Yoga/Barre/Fitness 20 cours', classes: 20, total_price: 560, price_per_class: 28, discount_vs_dropin_pct: 12.5, validity_days: 365, notes: '' },
    ];
    ajahouse.memberships = [
      { name: '4 cours/mois', monthly_price: 130, classes_included: 4, estimated_classes_per_month: 4, effective_price_per_class: 32.5, discount_vs_dropin_pct: -1.56, commitment_months: 6, notes: '' },
      { name: '8 cours/mois', monthly_price: 240, classes_included: 8, estimated_classes_per_month: 8, effective_price_per_class: 30, discount_vs_dropin_pct: 6.25, commitment_months: 6, notes: '' },
      { name: '12 cours/mois', monthly_price: 340, classes_included: 12, estimated_classes_per_month: 12, effective_price_per_class: 28.33, discount_vs_dropin_pct: 11.47, commitment_months: 6, notes: '' },
      { name: 'Illimite 1 cours/jour', monthly_price: 500, classes_included: 'unlimited', estimated_classes_per_month: 12, effective_price_per_class: 41.67, discount_vs_dropin_pct: -30.22, commitment_months: 3, notes: '' },
    ];
    ajahouse.discounts = [{ type: 'student', description: 'Moins de 26 ans cours a l unite', discount_pct_or_amount: '25 EUR' }];
    markVerified(ajahouse, 'Verified from tarifs page; extracted modality split and plans.');
  }

  const ashtanga = byDomain.get('ashtangayogaparis.fr');
  if (ashtanga) {
    ashtanga.pricing_publicly_available = true;
    ashtanga.pricing_url = 'https://www.ashtangayogaparis.fr/prix/';
    ashtanga.booking_software = 'bsport, mindbody';
    ashtanga.drop_in = { price: 27, duration_minutes: null };
    ashtanga.drop_in_by_modality = { standard_class: 27, online_class: 12 };
    ashtanga.intro_offers = [
      { type: 'Carte decouverte', name: '3 cours decouverte', price: 65, classes_included: 3, validity_days: 30, notes: '' },
      { type: 'Nouveaux eleves', name: '3 cours 10 jours', price: 35, classes_included: 3, validity_days: 10, notes: 'Residents Paris/alentours' },
    ];
    ashtanga.class_packs = [
      { name: '5 cours', classes: 5, total_price: 110, price_per_class: 22, discount_vs_dropin_pct: 18.52, validity_days: 180, notes: '' },
      { name: '10 cours', classes: 10, total_price: 195, price_per_class: 19.5, discount_vs_dropin_pct: 27.78, validity_days: 180, notes: '' },
      { name: '20 cours', classes: 20, total_price: 340, price_per_class: 17, discount_vs_dropin_pct: 37.04, validity_days: 180, notes: '' },
    ];
    ashtanga.memberships = [
      { name: 'Abonnement 6 mois', monthly_price: 150, classes_included: 'up to 7/week', estimated_classes_per_month: 12, effective_price_per_class: 12.5, discount_vs_dropin_pct: 53.7, commitment_months: 6, notes: '' },
      { name: 'Abonnement 1 an', monthly_price: 140, classes_included: 'up to 7/week', estimated_classes_per_month: 12, effective_price_per_class: 11.67, discount_vs_dropin_pct: 56.78, commitment_months: 12, notes: '' },
    ];
    ashtanga.discounts = [{ type: 'student', description: 'Tarif reduit pour etudiants/chomeurs/profs yoga', discount_pct_or_amount: '10%' }];
    markVerified(ashtanga, 'Verified from prix page; extracted packs, memberships, reduced tariff.');
  }

  const aquaBy = byDomain.get('aqua-by.com');
  if (aquaBy) {
    aquaBy.pricing_publicly_available = true;
    aquaBy.pricing_url = 'https://aqua-by.com/les-tarifs/';
    aquaBy.booking_software = 'bsport';
    aquaBy.uses_credit_system = true;
    aquaBy.credit_system_notes = 'Sanctuary credit-based system across studios.';
    aquaBy.drop_in = { price: 35, duration_minutes: null };
    aquaBy.intro_offers = [{ type: 'Welcome pack', name: '2 sessions', price: 19, classes_included: 2, validity_days: 30, notes: 'One purchase only' }];
    aquaBy.class_packs = [
      { name: 'Pack 5 sessions', classes: 5, total_price: 149, price_per_class: 29.8, discount_vs_dropin_pct: 14.86, validity_days: 60, notes: '60 credits' },
      { name: 'Pack 10 sessions', classes: 10, total_price: 279, price_per_class: 27.9, discount_vs_dropin_pct: 20.29, validity_days: 120, notes: '120 credits' },
      { name: 'Pack 20 sessions', classes: 20, total_price: 499, price_per_class: 24.95, discount_vs_dropin_pct: 28.71, validity_days: 240, notes: '240 credits' },
      { name: 'Pack 40 sessions', classes: 40, total_price: 799, price_per_class: 19.98, discount_vs_dropin_pct: 42.91, validity_days: 480, notes: '480 credits' },
    ];
    aquaBy.memberships = [
      { name: '1 session/semaine (3 mois min)', monthly_price: 121.33, classes_included: 4.33, estimated_classes_per_month: 4.33, effective_price_per_class: 28, discount_vs_dropin_pct: 20, commitment_months: 3, notes: 'Weekly billing converted to monthly' },
      { name: '2 sessions/semaine (3 mois min)', monthly_price: 190.67, classes_included: 8.67, estimated_classes_per_month: 8.67, effective_price_per_class: 22, discount_vs_dropin_pct: 37.14, commitment_months: 3, notes: 'Weekly billing converted to monthly' },
      { name: '3 sessions/semaine (3 mois min)', monthly_price: 238.33, classes_included: 13, estimated_classes_per_month: 13, effective_price_per_class: 18.33, discount_vs_dropin_pct: 47.63, commitment_months: 3, notes: 'Weekly billing converted to monthly' },
    ];
    aquaBy.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: '60-480 depending on pack',
      notes: 'Cancellation deadline 12h. Credit system with variable credits per session.',
    };
    markVerified(aquaBy, 'Verified from tarifs page; explicit credit system and pack validity captured.');
  }

  const ataum = byDomain.get('ataum-paris.fr');
  if (ataum) {
    ataum.pricing_publicly_available = true;
    ataum.pricing_url = 'https://ataum-paris.fr/tarifs-at-aum-studio-cours/';
    ataum.drop_in = { price: 22, duration_minutes: null };
    ataum.drop_in_by_modality = { yoga_or_pilates_single: 22, gong_single: 25 };
    ataum.intro_offers = [
      { type: 'Premier cours', name: '1er cours d essai', price: 15, classes_included: 1, validity_days: 90, notes: 'One-time offer' },
      { type: 'Carte decouverte', name: '3 cours yoga', price: 45, classes_included: 3, validity_days: 30, notes: '' },
    ];
    ataum.class_packs = [
      { name: '10 bains de gong', classes: 10, total_price: 220, price_per_class: 22, discount_vs_dropin_pct: 12, validity_days: 180, notes: '' },
    ];
    markVerified(ataum, 'Verified from tarifs page.');
  }

  const agc = byDomain.get('ateliers-ground-control.com');
  if (agc) {
    agc.pricing_publicly_available = true;
    agc.pricing_url = 'https://www.ateliers-ground-control.com/nos-tarifs/';
    agc.booking_software = 'deciplus';
    agc.uses_credit_system = true;
    agc.credit_system_notes = 'Ticket-based pricing where class types consume different ticket amounts.';
    agc.intro_offers = [
      { type: 'Initiatis Solo', name: 'INITIATIS SOLO', price: 60, classes_included: 1, validity_days: null, notes: '6 tickets' },
      { type: 'Initiatis Duo', name: 'INITIATIS DUO', price: 90, classes_included: 1, validity_days: null, notes: '9 tickets' },
      { type: 'Initiatis Cosma', name: 'INITIATIS COSMA', price: 30, classes_included: 1, validity_days: null, notes: '3 tickets' },
    ];
    agc.class_packs = [
      { name: 'EXPLORIS 24 tickets', classes: null, total_price: 300, price_per_class: null, discount_vs_dropin_pct: null, validity_days: null, notes: 'Ticket bundle' },
      { name: 'FORFAITIS 36 tickets', classes: null, total_price: 612, price_per_class: null, discount_vs_dropin_pct: null, validity_days: 180, notes: 'Ticket bundle' },
      { name: 'REGULARIS 72 tickets', classes: null, total_price: 1176, price_per_class: null, discount_vs_dropin_pct: null, validity_days: 240, notes: 'Ticket bundle' },
    ];
    markVerified(agc, 'Verified from tarifs page; ticket system captured.');
  }

  await fs.writeFile(MASTER_PATH, JSON.stringify(data, null, 2));
  console.log('Applied manual verification updates for Wave 1 record set');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
