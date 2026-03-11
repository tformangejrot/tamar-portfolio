# Future Chat Handoff: Studio Pricing Updates

Use this guide in a new chat to keep updates consistent with the current workflow.

## Canonical Files

- Master working file: `data/pricing/paris_pricing_master_wave2_no_exa.json`
- Canonical approved output: `data/pricing/paris_pricing_approved_records.json`
- Analysis outputs:
  - `data/pricing/analysis/paris_pricing_snapshot.json`
  - `data/pricing/analysis/paris_pricing_snapshot.md`

## Approval Logic (Important)

In this repo, a record is treated as approved when either:

- `manual_verified === true`, OR
- `review_required === false`

This is implemented in `scripts/build_approved_records_file.mjs`.

For exclusions (not a studio, out of scope), do **not** accidentally approve:

- `excluded_from_scope: true`
- `manual_verified: false`
- `review_required: true`

## What To Provide Per Studio

When sending updates in chat, include:

- Studio/domain (for example: `example-studio.com`)
- Offer types seen (trial, drop-in, packs, memberships/unlimited)
- Price, classes included, and validity/expiration
- Commitment length (if subscription)
- Any special notes (new clients only, one-time purchase, modality-specific pricing)
- Whether the website is down/unreachable (temporary) or out of scope

Screenshots are fine; text is even better when possible.

## Standard Update Pattern

For each studio update:

1. Find the existing record by `domain` in `paris_pricing_master_wave2_no_exa.json`.
2. Replace noisy/auto-extracted pricing fields with clean manual values:
   - `drop_in`
   - `drop_in_by_modality` (when applicable)
   - `intro_offers`
   - `class_packs`
   - `memberships`
   - `discounts`
   - `expiration_policy`
3. Set verification flags:
   - Manual confirmed pricing:
     - `manual_verified: true`
     - `review_required: false`
     - `confidence_score: 100`
     - `confidence_tier: "high"`
     - `confidence_reasons: ["manual_verified"]`
   - Temporary website down:
     - `pricing_publicly_available: false`
     - `manual_verified: false`
     - `review_required: true`
     - note that it should be rechecked later
   - Out-of-scope:
     - `excluded_from_scope: true`
     - `exclusion_reason: <reason_code>`
     - `manual_verified: false`
     - `review_required: true`
4. Keep `notes` clear and brief.
5. Update `data_collected_date` and `extraction_meta` timestamp/source.

## Price Calculation Conventions

- `price_per_class = total_price / classes` (rounded to 2 decimals)
- `discount_vs_dropin_pct = ((drop_in - price_per_class) / drop_in) * 100`
- Weekly subscription display prices should be converted to monthly for analytics:
  - `monthly_price = weekly_price * 52 / 12`
- If no reliable baseline drop-in exists, leave `% discount` as `null`.

## Commands To Run After Any Update Batch

Run from repo root:

```bash
node "scripts/build_approved_records_file.mjs" \
  --wave2 "data/pricing/paris_pricing_master_wave2_no_exa.json" \
  --wave1-approved "data/pricing/paris_pricing_master_approved_wave1.json" \
  --exa-merged "data/pricing/paris_pricing_master_exa_merged.json" \
  --output "data/pricing/paris_pricing_approved_records.json"

node "scripts/analyze_paris_pricing_snapshot.mjs"
```

## Suggested Prompt For New Chat

Use this starter prompt:

```text
Please apply manual pricing updates to `data/pricing/paris_pricing_master_wave2_no_exa.json`.

For each studio I send:
- Update pricing fields (drop-in, intro offers, class packs, memberships, discounts, expiration).
- Mark as `manual_verified: true` and `review_required: false` when confirmed.
- For temporary downtime, keep it pending (`manual_verified: false`, `review_required: true`).
- For out-of-scope records, set `excluded_from_scope: true`, keep non-approved (`manual_verified: false`, `review_required: true`).

After each studio (or small batch), rebuild:
1) `data/pricing/paris_pricing_approved_records.json`
2) `data/pricing/analysis/paris_pricing_snapshot.json`
3) `data/pricing/analysis/paris_pricing_snapshot.md`

Then report updated totals:
- approved_records
- manual_verified_records
```

## Current Scope Reminder

Keep in scope:

- yoga, pilates/reformer, barre, dance, boxing, HIIT/bootcamp, cycling, strength/crossfit

Exclude:

- cryotherapy, EMS/electrostimulation, infrabike/infrarun, sauna/recovery-only, treatment-centric concepts, teacher-only profiles (non-studio)
