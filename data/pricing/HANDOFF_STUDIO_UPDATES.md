# Pricing Project Handoff (Simplified)

This pricing workflow now uses a single canonical dataset as the source for analysis.

## One Source of Truth

- Canonical pricing file: `data/pricing/paris_pricing_approved_records.json`

Dashboard data is derived from this file.

## Queue for New Studios

- Temporary queue file: `data/pricing/paris_pricing_pending_queue.json`
- Generated from:
  - `data/processed/studios_consolidated_boutique.json`
  - minus domains already present in `paris_pricing_approved_records.json`

Generate queue:

```bash
node "scripts/build_pricing_pending_queue.mjs"
```

## How Dashboard Works Now

- File: `scripts/pricing-dashboard.html`
- It fetches:
  - `data/pricing/analysis/paris_pricing_snapshot.json`
- Snapshot generation command:

```bash
node "scripts/analyze_paris_pricing_snapshot.mjs"
```

## How To Add More Studios

Use this exact process in future chats:

1. Pick next domain from `paris_pricing_pending_queue.json`.
2. Add a full studio record to `paris_pricing_approved_records.json` (in `records` array), including:
   - `studio_name`, `domain`, `website`, `categories`, `arrondissement`
   - `drop_in`, `intro_offers`, `class_packs`, `memberships`, `discounts`, `expiration_policy`
   - `pricing_publicly_available`, `notes`, `uses_credit_system`
3. Keep currency in EUR and use consistent derived fields:
   - `price_per_class`
   - `discount_vs_dropin_pct` where possible
4. Regenerate snapshot:

   - `node "scripts/analyze_paris_pricing_snapshot.mjs"`

5. Rebuild queue:

   - `node "scripts/build_pricing_pending_queue.mjs"`
6. Refresh dashboard page.

## Scope Rules

Keep:

- yoga, pilates/reformer, barre, dance, boxing, HIIT/bootcamp, cycling, strength/crossfit

Exclude:

- cryotherapy, EMS/electrostimulation, infrabike/infrarun, sauna/recovery-only, treatment-centric concepts, teacher-only profiles

## Suggested Prompt for Future Chats

```text
Please update `data/pricing/paris_pricing_approved_records.json` directly.
Use `data/pricing/paris_pricing_pending_queue.json` as the next-studios queue.

For each studio I send:
- add/replace pricing fields (drop-in, intro, packs, memberships, discounts, expiration)
- keep only in-scope boutique fitness studios
- if out-of-scope, remove from queue and do not add to approved file

After updates:
1) run `node scripts/analyze_paris_pricing_snapshot.mjs`
2) run `node scripts/build_pricing_pending_queue.mjs`
3) report total approved studios and remaining queue size
```
