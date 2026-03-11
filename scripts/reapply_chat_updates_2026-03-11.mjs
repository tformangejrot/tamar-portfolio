#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MASTER_PATH = path.join(ROOT, "data/pricing/paris_pricing_master_wave2_no_exa.json");

const today = new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString();

const round = (v) => Math.round(v * 100) / 100;
const monthlyFromWeekly = (w) => round((w * 52) / 12);
const pct = (ppc, drop) => round(((drop - ppc) / drop) * 100);

function setManualVerified(record, notes) {
  record.pricing_publicly_available = true;
  record.notes = notes;
  record.manual_verified = true;
  record.review_required = false;
  record.confidence_score = 100;
  record.confidence_tier = "high";
  record.confidence_reasons = ["manual_verified"];
  record.data_collected_date = today;
  record.extraction_meta = {
    ...(record.extraction_meta || {}),
    source: "manual_update",
    extracted_at: nowIso,
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function upsertByDomain(rows, domain, updater) {
  const idx = rows.findIndex((r) => String(r.domain || "").toLowerCase() === domain.toLowerCase());
  if (idx < 0) return false;
  updater(rows[idx], rows);
  return true;
}

async function main() {
  const rows = JSON.parse(await fs.readFile(MASTER_PATH, "utf8"));
  const touched = [];

  upsertByDomain(rows, "notyoga.fr", (r) => {
    setManualVerified(
      r,
      "Manual update from user-provided screenshots (pack decouverte, cartes de cours, and weekly subscriptions by commitment)."
    );
    r.drop_in = { price: 37, duration_minutes: null };
    r.intro_offers = [
      {
        type: "Pack decouverte",
        name: "2 sessions",
        price: 39,
        classes_included: 2,
        price_per_class: 19.5,
        discount_vs_dropin_pct: 47.3,
        validity_days: 14,
        notes: "Displayed as 39 EUR au lieu de 74 EUR; valid 2 weeks.",
      },
    ];
    r.class_packs = [
      {
        name: "5 sessions",
        classes: 5,
        total_price: 160,
        price_per_class: 32,
        discount_vs_dropin_pct: 13.51,
        validity_days: 60,
        notes: "Valid for 2 months.",
      },
      {
        name: "10 sessions",
        classes: 10,
        total_price: 290,
        price_per_class: 29,
        discount_vs_dropin_pct: 21.62,
        validity_days: 120,
        notes: "Valid for 4 months.",
      },
      {
        name: "The stay hot this winter pack (5 sessions)",
        classes: 5,
        total_price: 120,
        price_per_class: 24,
        discount_vs_dropin_pct: 35.14,
        validity_days: 60,
        notes: "Seasonal offer; valid 2 months.",
      },
      {
        name: "The heat up your winter method (6 sessions)",
        classes: 6,
        total_price: 150,
        price_per_class: 25,
        discount_vs_dropin_pct: 32.43,
        validity_days: 60,
        notes: "Includes hot drink after each session.",
      },
      {
        name: "The glow through the snow formula (10 sessions)",
        classes: 10,
        total_price: 220,
        price_per_class: 22,
        discount_vs_dropin_pct: 40.54,
        validity_days: 120,
        notes: "Seasonal offer; valid 4 months.",
      },
    ];
    r.memberships = [
      {
        name: "Abonnement 1 cours/semaine engagement 9 mois",
        monthly_price: monthlyFromWeekly(22),
        classes_included: "1/week",
        estimated_classes_per_month: 4.33,
        effective_price_per_class: 22,
        discount_vs_dropin_pct: 40.54,
        commitment_months: 9,
        notes: "Displayed as 22 EUR/week (36 invoices).",
      },
      {
        name: "Abonnement 1 cours/semaine engagement 6 mois",
        monthly_price: monthlyFromWeekly(25),
        classes_included: "1/week",
        estimated_classes_per_month: 4.33,
        effective_price_per_class: 25,
        discount_vs_dropin_pct: 32.43,
        commitment_months: 6,
        notes: "Displayed as 25 EUR/week (24 invoices).",
      },
      {
        name: "Abonnement 1 cours/semaine engagement 3 mois",
        monthly_price: monthlyFromWeekly(30),
        classes_included: "1/week",
        estimated_classes_per_month: 4.33,
        effective_price_per_class: 30,
        discount_vs_dropin_pct: 18.92,
        commitment_months: 3,
        notes: "Displayed as 30 EUR/week (12 invoices).",
      },
      {
        name: "Abonnement 2 cours/semaine engagement 9 mois",
        monthly_price: monthlyFromWeekly(38),
        classes_included: "2/week",
        estimated_classes_per_month: 8.67,
        effective_price_per_class: 19,
        discount_vs_dropin_pct: 48.65,
        commitment_months: 9,
        notes: "Displayed as 38 EUR/week (36 invoices).",
      },
      {
        name: "Abonnement 2 cours/semaine engagement 6 mois",
        monthly_price: monthlyFromWeekly(44),
        classes_included: "2/week",
        estimated_classes_per_month: 8.67,
        effective_price_per_class: 22,
        discount_vs_dropin_pct: 40.54,
        commitment_months: 6,
        notes: "Displayed as 44 EUR/week (24 invoices).",
      },
      {
        name: "Abonnement 2 cours/semaine engagement 3 mois",
        monthly_price: monthlyFromWeekly(50),
        classes_included: "2/week",
        estimated_classes_per_month: 8.67,
        effective_price_per_class: 25,
        discount_vs_dropin_pct: 32.43,
        commitment_months: 3,
        notes: "Displayed as 50 EUR/week (12 invoices).",
      },
      {
        name: "Abonnement 3 cours/semaine engagement 9 mois",
        monthly_price: monthlyFromWeekly(48),
        classes_included: "3/week",
        estimated_classes_per_month: 13,
        effective_price_per_class: 16,
        discount_vs_dropin_pct: 56.76,
        commitment_months: 9,
        notes: "Displayed as 48 EUR/week (36 invoices).",
      },
      {
        name: "Abonnement 3 cours/semaine engagement 6 mois",
        monthly_price: monthlyFromWeekly(54),
        classes_included: "3/week",
        estimated_classes_per_month: 13,
        effective_price_per_class: 18,
        discount_vs_dropin_pct: 51.35,
        commitment_months: 6,
        notes: "Displayed as 54 EUR/week (24 invoices).",
      },
      {
        name: "Abonnement 3 cours/semaine engagement 3 mois",
        monthly_price: monthlyFromWeekly(60),
        classes_included: "3/week",
        estimated_classes_per_month: 13,
        effective_price_per_class: 20,
        discount_vs_dropin_pct: 45.95,
        commitment_months: 3,
        notes: "Displayed as 60 EUR/week (12 invoices).",
      },
    ];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity: single 1 month, discovery 14 days, selected packs 2-4 months.",
    };
    r.uses_credit_system = true;
    r.credit_system_notes = "Pricing displayed in credits and invoice counts for subscriptions.";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "onmindclub.com", (r) => {
    setManualVerified(r, "Manual update from user screenshots (packs, trial, unit class, and monthly subscriptions).");
    r.drop_in = { price: 40, duration_minutes: null };
    r.intro_offers = [
      {
        type: "Single trial class",
        name: "Cours d'essai",
        price: 20,
        classes_included: 1,
        price_per_class: 20,
        discount_vs_dropin_pct: 50,
        validity_days: 30,
        notes: "Valid for 1 month.",
      },
    ];
    r.class_packs = [
      {
        name: "Pack 4 seances",
        classes: 4,
        total_price: 140,
        price_per_class: 35,
        discount_vs_dropin_pct: pct(35, 40),
        validity_days: 60,
        notes: "Valid for 2 months.",
      },
      {
        name: "Pack 8 seances",
        classes: 8,
        total_price: 260,
        price_per_class: 32.5,
        discount_vs_dropin_pct: pct(32.5, 40),
        validity_days: 120,
        notes: "Valid for 4 months.",
      },
      {
        name: "Pack 20 seances",
        classes: 20,
        total_price: 600,
        price_per_class: 30,
        discount_vs_dropin_pct: pct(30, 40),
        validity_days: 180,
        notes: "Valid for 6 months.",
      },
    ];
    r.memberships = [
      {
        name: "Abonnement mensuel 1 seance/semaine",
        monthly_price: 140,
        classes_included: "1/week",
        estimated_classes_per_month: 4,
        effective_price_per_class: 35,
        discount_vs_dropin_pct: pct(35, 40),
        commitment_months: 1,
        notes: "Displayed as 140 EUR/month; card shows 1 invoice and appears sans engagement.",
      },
      {
        name: "Abonnement mensuel 2 seances/semaine",
        monthly_price: 260,
        classes_included: "2/week",
        estimated_classes_per_month: 8,
        effective_price_per_class: 32.5,
        discount_vs_dropin_pct: pct(32.5, 40),
        commitment_months: 1,
        notes: "Displayed as 260 EUR/month; card shows 1 invoice and appears sans engagement.",
      },
      {
        name: "Abonnement mensuel 3 seances/semaine",
        monthly_price: 360,
        classes_included: "3/week",
        estimated_classes_per_month: 12,
        effective_price_per_class: 30,
        discount_vs_dropin_pct: pct(30, 40),
        commitment_months: 1,
        notes: "Displayed as 360 EUR/month; card shows 1 invoice and appears sans engagement.",
      },
    ];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity tags: trial and unit class 1 month; packs 2, 4, and 6 months.",
    };
    r.uses_credit_system = true;
    r.credit_system_notes = "Offers displayed as credits matching class counts.";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "outboxe.com", (r) => {
    setManualVerified(
      r,
      "Manual update from user-provided screenshots (intro week unlimited, welcome session, class packs, and unlimited subscriptions)."
    );
    r.drop_in = { price: null, duration_minutes: null };
    r.intro_offers = [
      {
        type: "Intro unlimited week",
        name: "7 jours illimite",
        price: 55,
        classes_included: null,
        price_per_class: null,
        discount_vs_dropin_pct: null,
        validity_days: 7,
        notes: "Intro funnel offer; 55 EUR for 7-day unlimited trial.",
      },
      {
        type: "Single trial class",
        name: "Welcome Session",
        price: 19,
        classes_included: 1,
        price_per_class: 19,
        discount_vs_dropin_pct: null,
        validity_days: 30,
        notes: "New clients only; valid 1 month.",
      },
    ];
    r.class_packs = [
      { name: "5 Sessions", classes: 5, total_price: 150, price_per_class: 30, discount_vs_dropin_pct: null, validity_days: 90, notes: "Valid for 3 months." },
      { name: "10 Sessions", classes: 10, total_price: 280, price_per_class: 28, discount_vs_dropin_pct: null, validity_days: 180, notes: "Valid for 6 months." },
      { name: "20 Sessions", classes: 20, total_price: 520, price_per_class: 26, discount_vs_dropin_pct: null, validity_days: 365, notes: "Valid for 12 months." },
    ];
    r.memberships = [
      {
        name: "2 semaines Illimite",
        monthly_price: 368.33,
        classes_included: "unlimited",
        estimated_classes_per_month: 30,
        effective_price_per_class: 12.28,
        discount_vs_dropin_pct: null,
        commitment_months: 0,
        notes: "170 EUR per 2 weeks; sans engagement; monthly equivalent = 170 * 52 / 24.",
      },
      {
        name: "Mensuel Illimite",
        monthly_price: 340,
        classes_included: "unlimited",
        estimated_classes_per_month: 30,
        effective_price_per_class: 11.33,
        discount_vs_dropin_pct: null,
        commitment_months: 3,
        notes: "Engagement de 3 mois.",
      },
      {
        name: "Annuel Illimite",
        monthly_price: 300,
        classes_included: "unlimited",
        estimated_classes_per_month: 30,
        effective_price_per_class: 10,
        discount_vs_dropin_pct: null,
        commitment_months: 12,
        notes: "Engagement de 12 mois; displayed as 300 EUR/mois.",
      },
    ];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity: welcome session 1 month; packs 3, 6, and 12 months.",
    };
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "outcore.studio", (r, allRows) => {
    const outboxe = allRows.find((x) => String(x.domain || "").toLowerCase() === "outboxe.com");
    setManualVerified(r, "Manual update: user confirmed Outcore (Lagree branch) uses same pricing as Outboxe.");
    if (outboxe) {
      r.drop_in = clone(outboxe.drop_in);
      r.intro_offers = clone(outboxe.intro_offers);
      r.class_packs = clone(outboxe.class_packs);
      r.memberships = clone(outboxe.memberships);
      r.expiration_policy = clone(outboxe.expiration_policy);
    }
    r.discounts = [];
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "paris-marais-dance-school.org", (r) => {
    setManualVerified(
      r,
      "Manual update from user screenshots (single classes, class cards, annual subscriptions, and published discount/admin-fee notes)."
    );
    r.drop_in = { price: 15, duration_minutes: 60 };
    r.drop_in_by_modality = {
      dance: [
        { label: "1-hour single class", price: 15, duration_minutes: 60 },
        { label: "1.5-hour single class", price: 22, duration_minutes: 90 },
        { label: "Professionals single class", price: 10, duration_minutes: null },
      ],
    };
    r.intro_offers = [];
    r.class_packs = [
      { name: "10 classes card - 1 hour", classes: 10, total_price: 130, price_per_class: 13, discount_vs_dropin_pct: pct(13, 15), validity_days: 120, notes: "Valid for 4 months (excluding July and August)." },
      { name: "10 classes card - 1.5 hour", classes: 10, total_price: 180, price_per_class: 18, discount_vs_dropin_pct: null, validity_days: 120, notes: "Valid for 4 months (excluding July and August)." },
      { name: "20 classes card - 1 hour", classes: 20, total_price: 240, price_per_class: 12, discount_vs_dropin_pct: pct(12, 15), validity_days: 120, notes: "Valid for 4 months (excluding July and August)." },
      { name: "20 classes card - 1.5 hour", classes: 20, total_price: 320, price_per_class: 16, discount_vs_dropin_pct: null, validity_days: 120, notes: "Valid for 4 months (excluding July and August)." },
    ];
    r.memberships = [
      { name: "Annual subscription - 1 class/week (45 min or 1 hour)", monthly_price: 38.33, classes_included: "1/week", estimated_classes_per_month: 3.17, effective_price_per_class: 12.11, discount_vs_dropin_pct: pct(12.11, 15), commitment_months: 12, notes: "Displayed as 460 EUR/year." },
      { name: "Annual subscription - 1 class/week (1.5 hours, adults)", monthly_price: 54.17, classes_included: "1/week", estimated_classes_per_month: 3.17, effective_price_per_class: 17.11, discount_vs_dropin_pct: null, commitment_months: 12, notes: "Displayed as 650 EUR/year (adults), 38 weeks; teens shown at 590 EUR/year for 34 weeks." },
    ];
    r.discounts = [
      { type: "student_or_social", description: "20% discount for students under 26, temporary workers, and job seekers (proof required).", discount_pct_or_amount: "20%" },
      { type: "family", description: "20% discount for families (4+ children) and families with 2 enrolled in classes (proof required).", discount_pct_or_amount: "20%" },
      { type: "multi_subscription", description: "Discounts on additional weekly class subscriptions: 2 classes/week -60 EUR on 2nd subscription; 3/week -80 EUR on 3rd; 4/week -100 EUR on 4th; 5/week -120 EUR on 5th.", discount_pct_or_amount: "amount-based" },
      { type: "teen_rate", description: "Annual 1.5-hour 1 class/week subscription shown at 590 EUR for teens (34 weeks) vs 650 EUR adults (38 weeks).", discount_pct_or_amount: "60 EUR" },
    ];
    r.expiration_policy = {
      single_class_validity_days: null,
      pack_validity_days: 120,
      notes: "Class cards valid 4 months excluding July and August; administration fee 45 EUR mandatory once per year; discounts do not apply to all offers.",
    };
    r.uses_credit_system = true;
    r.credit_system_notes = "Site labels offers in credits (1 credit per class).";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "parisboxingclub.fr", (r) => {
    setManualVerified(
      r,
      "Manual update from user screenshots (single class, annual plans, free trial class, and first-year admin fee note)."
    );
    r.drop_in = { price: 15, duration_minutes: null };
    r.intro_offers = [
      {
        type: "Free trial class",
        name: "Cours d'essai gratuit",
        price: 0,
        classes_included: 1,
        price_per_class: 0,
        discount_vs_dropin_pct: 100,
        validity_days: null,
        notes: "User confirmed free trial class available.",
      },
    ];
    r.class_packs = [];
    r.memberships = [
      { name: "1 jour fixe (annuel)", monthly_price: 20.83, classes_included: "1 fixed day/week", estimated_classes_per_month: null, effective_price_per_class: 8.75, discount_vs_dropin_pct: pct(8.75, 15), commitment_months: 12, notes: "Displayed as 250 EUR/year. First year includes +50 EUR admin fee (total 300 EUR)." },
      { name: "1 discipline (annuel)", monthly_price: 30.83, classes_included: "1 discipline", estimated_classes_per_month: null, effective_price_per_class: null, discount_vs_dropin_pct: null, commitment_months: 12, notes: "Displayed as 370 EUR/year. First year includes +50 EUR admin fee (total 420 EUR)." },
      { name: "Toutes disciplines (annuel)", monthly_price: 50, classes_included: "all disciplines", estimated_classes_per_month: null, effective_price_per_class: null, discount_vs_dropin_pct: null, commitment_months: 12, notes: "Displayed as 600 EUR/year. First year includes +50 EUR admin fee (total 650 EUR)." },
    ];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: null,
      pack_validity_days: null,
      notes: "Annual subscriptions; +50 EUR dossier/admin fee only first year; free trial available.",
    };
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "parispilates.com", (r) => {
    setManualVerified(r, "Manual update from user screenshots (new client specials and class packs).");
    r.drop_in = { price: 45, duration_minutes: null };
    r.intro_offers = [
      { type: "Intro 3-class pack", name: "New Client Special - 3 cours", price: 100, classes_included: 3, price_per_class: 33.33, discount_vs_dropin_pct: pct(33.33, 45), validity_days: 30, notes: "Valid 1 month." },
      { type: "Intro 3-class pack with sticky socks", name: "New Client Special with sticky socks", price: 120, classes_included: 3, price_per_class: 40, discount_vs_dropin_pct: pct(40, 45), validity_days: 30, notes: "Valid 1 month; includes sticky socks." },
    ];
    r.class_packs = [
      { name: "1 cours", classes: 1, total_price: 45, price_per_class: 45, discount_vs_dropin_pct: pct(45, 45), validity_days: 30, notes: "Valid 1 month." },
      { name: "5 cours", classes: 5, total_price: 200, price_per_class: 40, discount_vs_dropin_pct: pct(40, 45), validity_days: 90, notes: "Valid 3 months." },
      { name: "10 cours", classes: 10, total_price: 380, price_per_class: 38, discount_vs_dropin_pct: pct(38, 45), validity_days: 180, notes: "Valid 6 months." },
      { name: "20 cours", classes: 20, total_price: 700, price_per_class: 35, discount_vs_dropin_pct: pct(35, 45), validity_days: 270, notes: "Valid 9 months." },
      { name: "50 cours", classes: 50, total_price: 1450, price_per_class: 29, discount_vs_dropin_pct: pct(29, 45), validity_days: 365, notes: "Valid 12 months." },
    ];
    r.memberships = [];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity by offer: 1 month (single and intros), 3/6/9/12 months for larger packs.",
    };
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "poledance-paris.com", (r) => {
    setManualVerified(r, "Manual update from user screenshot (hour-based cards, single classes, and discovery/new-student offers).");
    r.drop_in = { price: 26, duration_minutes: 60 };
    r.drop_in_by_modality = {
      pole_dance: [
        { label: "Cours a l'unite 1h", price: 26, duration_minutes: 60 },
        { label: "Cours a l'unite 1h30", price: 37, duration_minutes: 90 },
      ],
    };
    r.intro_offers = [
      { type: "Single trial class", name: "Cours decouverte (valable une fois)", price: 20, classes_included: 1, price_per_class: 20, discount_vs_dropin_pct: pct(20, 26), validity_days: null, notes: "One-time discovery offer." },
      { type: "Intro 5h card", name: "Carte 5h offre promotionnelle nouveaux eleves", price: 95, classes_included: 5, price_per_class: 19, discount_vs_dropin_pct: pct(19, 26), validity_days: 90, notes: "Promotional offer reserved for new students." },
    ];
    r.class_packs = [
      { name: "Carte 10h", classes: 10, total_price: 241, price_per_class: 24.1, discount_vs_dropin_pct: pct(24.1, 26), validity_days: 180, notes: "Payable in 3 mensualites." },
      { name: "Carte 20h", classes: 20, total_price: 470, price_per_class: 23.5, discount_vs_dropin_pct: pct(23.5, 26), validity_days: 180, notes: "Payable in 3 or 6 mensualites." },
      { name: "Carte 40h", classes: 40, total_price: 800, price_per_class: 20, discount_vs_dropin_pct: pct(20, 26), validity_days: 365, notes: "Payable in 3, 6 or 12 mensualites." },
      { name: "Carte 60h", classes: 60, total_price: 1080, price_per_class: 18, discount_vs_dropin_pct: pct(18, 26), validity_days: 365, notes: "Payable in 3, 6 or 12 mensualites." },
    ];
    r.memberships = [];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: null,
      pack_validity_days: null,
      notes: "Visible validity: 5h card 3 months, 10h/20h cards 6 months, 40h/60h cards 1 year.",
    };
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "poses-studio.com", (r) => {
    setManualVerified(
      r,
      "Manual update from user screenshots covering Welcome Pack, Pilates/Barre/Yoga and Reformer subscriptions, and no-commit packs."
    );
    r.drop_in = { price: 35, duration_minutes: null };
    r.drop_in_by_modality = {
      pilates: [{ label: "Pilates/Barre/Yoga single session", price: 35, duration_minutes: null }],
      barre: [{ label: "Pilates/Barre/Yoga single session", price: 35, duration_minutes: null }],
      yoga: [{ label: "Pilates/Barre/Yoga single session", price: 35, duration_minutes: null }],
      reformer: [{ label: "Reformer single session", price: 45, duration_minutes: null }],
    };
    r.intro_offers = [
      { type: "Welcome pack", name: "2 sessions welcome pack", price: 19, classes_included: 2, price_per_class: 9.5, discount_vs_dropin_pct: pct(9.5, 35), validity_days: 30, notes: "One purchase only; 26 credits; not valid for two reformer sessions." },
    ];
    r.class_packs = [
      { name: "Pilates/Barre/Yoga - 1 session", classes: 1, total_price: 35, price_per_class: 35, discount_vs_dropin_pct: pct(35, 35), validity_days: 30, notes: "14 credits." },
      { name: "Pilates/Barre/Yoga - Pack 5 sessions", classes: 5, total_price: 149, price_per_class: 29.8, discount_vs_dropin_pct: pct(29.8, 35), validity_days: 60, notes: "60 credits." },
      { name: "Pilates/Barre/Yoga - Pack 10 sessions", classes: 10, total_price: 279, price_per_class: 27.9, discount_vs_dropin_pct: pct(27.9, 35), validity_days: 120, notes: "120 credits." },
      { name: "Pilates/Barre/Yoga - Pack 20 sessions", classes: 20, total_price: 499, price_per_class: 24.95, discount_vs_dropin_pct: pct(24.95, 35), validity_days: 240, notes: "240 credits." },
      { name: "Pilates/Barre/Yoga - Pack 40 sessions", classes: 40, total_price: 799, price_per_class: 19.98, discount_vs_dropin_pct: pct(19.98, 35), validity_days: 480, notes: "480 credits." },
      { name: "Reformer - 1 session", classes: 1, total_price: 45, price_per_class: 45, discount_vs_dropin_pct: pct(45, 45), validity_days: 30, notes: "18 credits." },
      { name: "Reformer - Pack 5 sessions", classes: 5, total_price: 199, price_per_class: 39.8, discount_vs_dropin_pct: pct(39.8, 45), validity_days: 60, notes: "80 credits." },
      { name: "Reformer - Pack 10 sessions", classes: 10, total_price: 379, price_per_class: 37.9, discount_vs_dropin_pct: pct(37.9, 45), validity_days: 120, notes: "160 credits." },
      { name: "Reformer - Pack 20 sessions", classes: 20, total_price: 679, price_per_class: 33.95, discount_vs_dropin_pct: pct(33.95, 45), validity_days: 240, notes: "320 credits." },
      { name: "Reformer - Pack 40 sessions", classes: 40, total_price: 1079, price_per_class: 26.98, discount_vs_dropin_pct: pct(26.98, 45), validity_days: 480, notes: "640 credits." },
    ];
    r.memberships = [
      { name: "Pilates/Barre/Yoga - 1 session/week (3 months)", monthly_price: monthlyFromWeekly(28), classes_included: "1/week", estimated_classes_per_month: 4.33, effective_price_per_class: 28, discount_vs_dropin_pct: pct(28, 35), commitment_months: 3, notes: "14 credits/week." },
      { name: "Pilates/Barre/Yoga - 1 session/week (6 months)", monthly_price: monthlyFromWeekly(25), classes_included: "1/week", estimated_classes_per_month: 4.33, effective_price_per_class: 25, discount_vs_dropin_pct: pct(25, 35), commitment_months: 6, notes: "14 credits/week." },
      { name: "Pilates/Barre/Yoga - 1 session/week (12 months)", monthly_price: monthlyFromWeekly(19), classes_included: "1/week", estimated_classes_per_month: 4.33, effective_price_per_class: 19, discount_vs_dropin_pct: pct(19, 35), commitment_months: 12, notes: "14 credits/week." },
      { name: "Pilates/Barre/Yoga - 2 sessions/week (3 months)", monthly_price: monthlyFromWeekly(44), classes_included: "2/week", estimated_classes_per_month: 8.67, effective_price_per_class: 22, discount_vs_dropin_pct: pct(22, 35), commitment_months: 3, notes: "26 credits/week." },
      { name: "Pilates/Barre/Yoga - 2 sessions/week (6 months)", monthly_price: monthlyFromWeekly(39), classes_included: "2/week", estimated_classes_per_month: 8.67, effective_price_per_class: 19.5, discount_vs_dropin_pct: pct(19.5, 35), commitment_months: 6, notes: "26 credits/week." },
      { name: "Pilates/Barre/Yoga - 2 sessions/week (12 months)", monthly_price: monthlyFromWeekly(35), classes_included: "2/week", estimated_classes_per_month: 8.67, effective_price_per_class: 17.5, discount_vs_dropin_pct: pct(17.5, 35), commitment_months: 12, notes: "26 credits/week." },
      { name: "Pilates/Barre/Yoga - 3 sessions/week (3 months)", monthly_price: monthlyFromWeekly(55), classes_included: "3/week", estimated_classes_per_month: 13, effective_price_per_class: 18.5, discount_vs_dropin_pct: pct(18.5, 35), commitment_months: 3, notes: "39 credits/week." },
      { name: "Pilates/Barre/Yoga - 3 sessions/week (6 months)", monthly_price: monthlyFromWeekly(49), classes_included: "3/week", estimated_classes_per_month: 13, effective_price_per_class: 16.5, discount_vs_dropin_pct: pct(16.5, 35), commitment_months: 6, notes: "39 credits/week." },
      { name: "Pilates/Barre/Yoga - 3 sessions/week (12 months)", monthly_price: monthlyFromWeekly(45), classes_included: "3/week", estimated_classes_per_month: 13, effective_price_per_class: 15, discount_vs_dropin_pct: pct(15, 35), commitment_months: 12, notes: "39 credits/week." },
      { name: "Reformer - 1 session/week (3 months)", monthly_price: monthlyFromWeekly(36), classes_included: "1/week", estimated_classes_per_month: 4.33, effective_price_per_class: 36, discount_vs_dropin_pct: pct(36, 45), commitment_months: 3, notes: "18 credits/week." },
      { name: "Reformer - 1 session/week (6 months)", monthly_price: monthlyFromWeekly(32), classes_included: "1/week", estimated_classes_per_month: 4.33, effective_price_per_class: 32, discount_vs_dropin_pct: pct(32, 45), commitment_months: 6, notes: "18 credits/week." },
      { name: "Reformer - 1 session/week (12 months)", monthly_price: monthlyFromWeekly(24), classes_included: "1/week", estimated_classes_per_month: 4.33, effective_price_per_class: 24, discount_vs_dropin_pct: pct(24, 45), commitment_months: 12, notes: "18 credits/week." },
      { name: "Reformer - 2 sessions/week (3 months)", monthly_price: monthlyFromWeekly(58), classes_included: "2/week", estimated_classes_per_month: 8.67, effective_price_per_class: 29, discount_vs_dropin_pct: pct(29, 45), commitment_months: 3, notes: "34 credits/week." },
      { name: "Reformer - 2 sessions/week (6 months)", monthly_price: monthlyFromWeekly(50), classes_included: "2/week", estimated_classes_per_month: 8.67, effective_price_per_class: 25, discount_vs_dropin_pct: pct(25, 45), commitment_months: 6, notes: "34 credits/week." },
      { name: "Reformer - 2 sessions/week (12 months)", monthly_price: monthlyFromWeekly(45), classes_included: "2/week", estimated_classes_per_month: 8.67, effective_price_per_class: 22.5, discount_vs_dropin_pct: pct(22.5, 45), commitment_months: 12, notes: "34 credits/week." },
      { name: "Reformer - 3 sessions/week (3 months)", monthly_price: monthlyFromWeekly(72), classes_included: "3/week", estimated_classes_per_month: 13, effective_price_per_class: 24, discount_vs_dropin_pct: pct(24, 45), commitment_months: 3, notes: "51 credits/week." },
      { name: "Reformer - 3 sessions/week (6 months)", monthly_price: monthlyFromWeekly(66), classes_included: "3/week", estimated_classes_per_month: 13, effective_price_per_class: 22, discount_vs_dropin_pct: pct(22, 45), commitment_months: 6, notes: "51 credits/week." },
      { name: "Reformer - 3 sessions/week (12 months)", monthly_price: monthlyFromWeekly(60), classes_included: "3/week", estimated_classes_per_month: 13, effective_price_per_class: 20, discount_vs_dropin_pct: pct(20, 45), commitment_months: 12, notes: "51 credits/week." },
    ];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity: single 1 month; packs 2, 4, 8, and 16 months by tier.",
    };
    r.uses_credit_system = true;
    r.credit_system_notes = "Credit-based pricing (session offers expressed in credits: e.g., 14/18 credits for 1 session).";
    r.booking_software = "sanctuary";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "pilatesocialclub.fr", (r) => {
    setManualVerified(
      r,
      "Manual update from user screenshots. Kept Paris reformer prices and Paris opening discovery offers; ignored Lyon-only cours au sol pricing."
    );
    const drop = 45;
    r.drop_in = { price: drop, duration_minutes: null };
    r.intro_offers = [
      { type: "Intro 3-class pack", name: "Offre decouverte Paris - 3 seances", price: 100, classes_included: 3, price_per_class: 33.33, discount_vs_dropin_pct: pct(33.33, drop), validity_days: 30, notes: "Paris opening promotion for reformer packs." },
      { type: "Intro 10-class pack", name: "Offre decouverte Paris - 10 seances", price: 340, classes_included: 10, price_per_class: 34, discount_vs_dropin_pct: pct(34, drop), validity_days: 180, notes: "Paris opening promotion for reformer packs." },
    ];
    r.class_packs = [
      { name: "3 cours", classes: 3, total_price: 126, price_per_class: 42, discount_vs_dropin_pct: pct(42, drop), validity_days: 30, notes: "Reformer; Lyon & Paris listing." },
      { name: "5 cours", classes: 5, total_price: 200, price_per_class: 40, discount_vs_dropin_pct: pct(40, drop), validity_days: 90, notes: "Reformer; Lyon & Paris listing." },
      { name: "10 cours", classes: 10, total_price: 370, price_per_class: 37, discount_vs_dropin_pct: pct(37, drop), validity_days: 180, notes: "Reformer; Lyon & Paris listing." },
      { name: "12 cours", classes: 12, total_price: 399, price_per_class: 33.25, discount_vs_dropin_pct: pct(33.25, drop), validity_days: 30, notes: "Reformer; listed as 12 cours en 1 mois." },
      { name: "16 cours", classes: 16, total_price: 480, price_per_class: 30, discount_vs_dropin_pct: pct(30, drop), validity_days: 30, notes: "Reformer; listed as 16 cours en 1 mois." },
      { name: "20 cours", classes: 20, total_price: 680, price_per_class: 34, discount_vs_dropin_pct: pct(34, drop), validity_days: 180, notes: "Reformer; Lyon & Paris listing." },
      { name: "Addicted pack 50 cours", classes: 50, total_price: 1450, price_per_class: 29, discount_vs_dropin_pct: pct(29, drop), validity_days: 365, notes: "Reformer; valid 1 year." },
    ];
    r.memberships = [];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity by offer: 1 month, 3 months, 6 months, and 1 year depending on pack.",
    };
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "pur-reformer.fr", (r) => {
    setManualVerified(r, "Manual update from user screenshots (offre decouverte, cartes de cours, and monthly subscriptions).");
    const drop = 42;
    r.drop_in = { price: drop, duration_minutes: null };
    r.intro_offers = [
      {
        type: "Intro 3-class pack",
        name: "Offre decouverte",
        price: 100,
        classes_included: 3,
        price_per_class: 33.33,
        discount_vs_dropin_pct: pct(33.33, drop),
        validity_days: 30,
        notes: "3 reformer classes; new clients only; one purchase maximum.",
      },
    ];
    r.class_packs = [
      { name: "Solo", classes: 1, total_price: 42, price_per_class: 42, discount_vs_dropin_pct: pct(42, drop), validity_days: 30, notes: "1 session de reformer; validite 1 mois." },
      { name: "Pack 5 seances", classes: 5, total_price: 200, price_per_class: 40, discount_vs_dropin_pct: pct(40, drop), validity_days: 90, notes: "Validite 3 mois." },
      { name: "Pack 10 seances", classes: 10, total_price: 360, price_per_class: 36, discount_vs_dropin_pct: pct(36, drop), validity_days: 180, notes: "Validite 6 mois." },
      { name: "Pack 20 seances", classes: 20, total_price: 680, price_per_class: 34, discount_vs_dropin_pct: pct(34, drop), validity_days: 270, notes: "Validite 9 mois." },
    ];
    r.memberships = [
      { name: "Abonnement 4 seances/mois", monthly_price: 140, classes_included: 4, estimated_classes_per_month: 4, effective_price_per_class: 35, discount_vs_dropin_pct: pct(35, drop), commitment_months: 3, notes: "Prelevements automatiques; engagement 3 mois." },
      { name: "Abonnement 8 seances/mois", monthly_price: 260, classes_included: 8, estimated_classes_per_month: 8, effective_price_per_class: 32.5, discount_vs_dropin_pct: pct(32.5, drop), commitment_months: 3, notes: "Prelevements automatiques; engagement 3 mois." },
      { name: "Abonnement 4 seances/mois (12 mois)", monthly_price: 120, classes_included: 4, estimated_classes_per_month: 4, effective_price_per_class: 30, discount_vs_dropin_pct: pct(30, drop), commitment_months: 12, notes: "Prelevements automatiques; engagement 12 mois." },
      { name: "Abonnement 8 seances/mois (12 mois)", monthly_price: 224, classes_included: 8, estimated_classes_per_month: 8, effective_price_per_class: 28, discount_vs_dropin_pct: pct(28, drop), commitment_months: 12, notes: "Prelevements automatiques; engagement 12 mois." },
    ];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity: intro and solo 1 month; pack 5 = 3 months; pack 10 = 6 months; pack 20 = 9 months.",
    };
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "punch-boxing.com", (r) => {
    setManualVerified(r, "Manual update from user screenshots (offre d'essai, offre de bienvenue, Monday packs, and Pack Boost).");
    const drop = 29;
    r.drop_in = { price: drop, duration_minutes: null };
    r.intro_offers = [
      { type: "Single trial class", name: "Offre d'essai Punch", price: 15, classes_included: 1, price_per_class: 15, discount_vs_dropin_pct: pct(15, drop), validity_days: 14, notes: "One purchase per client and per experience; shown as 15 EUR instead of 19 EUR." },
      { type: "Intro 3-class pack", name: "Offre de bienvenue 3 seances", price: 54, classes_included: 3, price_per_class: 18, discount_vs_dropin_pct: pct(18, drop), validity_days: 21, notes: "One purchase per client and per experience." },
    ];
    r.class_packs = [
      { name: "1 seance Monday", classes: 1, total_price: 29, price_per_class: 29, discount_vs_dropin_pct: pct(29, drop), validity_days: 30, notes: "Valid 1 month." },
      { name: "5 seances Monday", classes: 5, total_price: 140, price_per_class: 28, discount_vs_dropin_pct: pct(28, drop), validity_days: 90, notes: "Valid 3 months." },
      { name: "10 seances Monday", classes: 10, total_price: 260, price_per_class: 26, discount_vs_dropin_pct: pct(26, drop), validity_days: 180, notes: "Valid 6 months." },
      { name: "20 seances Monday", classes: 20, total_price: 480, price_per_class: 24, discount_vs_dropin_pct: pct(24, drop), validity_days: 365, notes: "Valid 12 months." },
      { name: "30 seances Monday", classes: 30, total_price: 599, price_per_class: 19.97, discount_vs_dropin_pct: pct(19.97, drop), validity_days: 365, notes: "Valid 12 months." },
      { name: "Pack Boost (6 seances)", classes: 6, total_price: 119, price_per_class: 19.83, discount_vs_dropin_pct: pct(19.83, drop), validity_days: 30, notes: "Displayed as 20 EUR/session and 119 EUR total; valid 1 month." },
    ];
    r.memberships = [];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 30,
      pack_validity_days: null,
      notes: "Visible validity: trial 14 days, welcome 21 days, single and Boost 1 month, 5-pack 3 months, 10-pack 6 months, 20/30-pack 12 months.",
    };
    r.uses_credit_system = false;
    r.credit_system_notes = "";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "rasa-yogarivegauche.com", (r) => {
    setManualVerified(r, "Manual update from user screenshot (offre decouverte and studio class cards).");
    const drop = 28;
    r.drop_in = { price: drop, duration_minutes: null };
    r.intro_offers = [
      { type: "Intro 5-class pack", name: "Parisien 5 cours - 15 jours", price: 59, classes_included: 5, price_per_class: 11.8, discount_vs_dropin_pct: pct(11.8, drop), validity_days: 15, notes: "Offre decouverte; one short-duration starter card." },
    ];
    r.class_packs = [
      { name: "1 cours", classes: 1, total_price: 28, price_per_class: 28, discount_vs_dropin_pct: pct(28, drop), validity_days: 180, notes: "Displayed with validity 6 months." },
      { name: "5 cours - 3 mois", classes: 5, total_price: 130, price_per_class: 26, discount_vs_dropin_pct: pct(26, drop), validity_days: 90, notes: "Valid 3 months." },
      { name: "10 cours - 6 mois", classes: 10, total_price: 229, price_per_class: 22.9, discount_vs_dropin_pct: pct(22.9, drop), validity_days: 180, notes: "Valid 6 months." },
      { name: "20 cours - 12 mois", classes: 20, total_price: 419, price_per_class: 20.95, discount_vs_dropin_pct: pct(20.95, drop), validity_days: 365, notes: "Valid 1 year." },
      { name: "50 cours - 12 mois", classes: 50, total_price: 950, price_per_class: 19, discount_vs_dropin_pct: pct(19, drop), validity_days: 365, notes: "Valid 12 months." },
      { name: "100 cours - 12 mois", classes: 100, total_price: 1700, price_per_class: 17, discount_vs_dropin_pct: pct(17, drop), validity_days: 365, notes: "Valid 1 year." },
    ];
    r.memberships = [];
    r.discounts = [];
    r.expiration_policy = {
      single_class_validity_days: 180,
      pack_validity_days: null,
      notes: "Visible validity by product: intro 15 days; packs 3/6/12 months; single class card shown as 6 months.",
    };
    r.uses_credit_system = true;
    r.credit_system_notes = "Products displayed in credits (1 credit per course).";
    touched.push(r.domain);
  });

  upsertByDomain(rows, "rafagastudios.com", (r) => {
    r.pricing_publicly_available = false;
    r.notes = "Manual note: website appears down/inaccessible at time of review; may be temporary. Recheck later.";
    r.review_required = true;
    r.manual_verified = false;
    r.confidence_score = 0;
    r.confidence_tier = "low";
    r.confidence_reasons = ["site_unreachable_temporarily"];
    r.data_collected_date = today;
    r.extraction_meta = { ...(r.extraction_meta || {}), source: "manual_update", extracted_at: nowIso };
    touched.push(r.domain);
  });

  upsertByDomain(rows, "rebeccayoga.net", (r) => {
    r.excluded_from_scope = true;
    r.exclusion_reason = "not_studio_teacher_profile";
    r.pricing_publicly_available = false;
    r.manual_verified = false;
    r.review_required = true;
    r.notes = "Manual scope decision: teacher profile, not a studio. Excluded from boutique studio benchmark scope.";
    r.confidence_score = 0;
    r.confidence_tier = "low";
    r.confidence_reasons = ["manual_scope_exclusion"];
    r.data_collected_date = today;
    r.extraction_meta = { ...(r.extraction_meta || {}), source: "manual_update", extracted_at: nowIso };
    touched.push(r.domain);
  });

  await fs.writeFile(MASTER_PATH, JSON.stringify(rows, null, 2));
  console.log("Reapplied updates for", touched.length, "domains");
  console.log(touched.sort().join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

