# 14 — Data Model (full schema, `dawai-platform/migrations/*.sql`)

All 32 tables, grouped by migration of origin. For invariants/rationale see `03-domain-model.md` and `04-business-rules.md`; this file is the flat reference. PK/FK/constraints are as declared; `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` patterns throughout make every migration safe to re-run (required for PGlite test isolation).

## `0001_init.sql`
| Table | Key columns | Notes |
|---|---|---|
| `users` | `id` PK, `role`, `status`, `email` UNIQUE, `password_hash`, `locale` | role/status enums via CHECK |
| `sessions` | `id` PK, `user_id` FK, `token_hash` UNIQUE, `csrf_token_hash`, `expires_at`, `revoked_at` | partial index on active sessions |
| `patient_profiles` | `user_id` PK/FK | default area, coords, notification prefs JSON |
| `pharmacies` | `id` PK, `owner_user_id` FK, `license_number` UNIQUE, `verification_status` | |
| `pharmacy_branches` | `id` PK, `pharmacy_id` FK, lat/long, `opening_hours` JSON, `accepting_requests`, `operational_status` | |
| `verification_documents` | `id` PK, `pharmacy_id` FK, `document_type`, `status` | |
| `medicines` | `id` PK, `generic_name`, `classification` | seed data: Paracetamol, Amoxicillin/Clavulanate |
| `medicine_presentations` | `id` PK, `medicine_id` FK, brand/strength/form/pack | seed: Panadol Extra, Augmentin 625 |
| `medicine_aliases` | `id` PK, `presentation_id` FK, `alias`, `normalized_alias` | search index |
| `secure_files` | `id` PK, `owner_user_id` FK, `purpose`, `storage_key` UNIQUE, `nonce`, `auth_tag`, size ≤10MB | |
| `medicine_requests` | `id` PK, `public_reference` UNIQUE, `patient_id` FK, `status` (12 values), `quantity` ≤20, `urgency`, `radius_km` ∈{2,5,10}, `version` | |
| `request_dispatches` | `id` PK, `request_id`/`branch_id` FK, `distance_km`, `match_score`, `match_reasons` JSON, `status` | UNIQUE(request_id, branch_id) |
| `pharmacy_offers` | `id` PK, `request_id`/`branch_id` FK, `offer_type`, price/qty/prep-time | partial unique: one active offer per (request, branch) |
| `reservations` | `id` PK, `public_reference` UNIQUE, `request_id`/`offer_id`/`patient_id`/`branch_id` FK, `status`, `acknowledgement_deadline`, `hold_expires_at` | partial unique: one live reservation per request |
| `availability_signals` | `id` PK, `branch_id` FK, `source`, `state`, `observed_at`, `expires_at` | |
| `saved_pharmacies` | composite PK `(patient_id, branch_id)` | |
| `notifications` | `id` PK, `user_id` FK, `event_type`, `resource_type/id` | |
| `notification_outbox` | `id` PK, `notification_id` FK, `safe_payload` JSON, `channel`, `status`, `attempts`, `next_attempt_at` | |
| `conversations` | `id` PK, `reservation_id` UNIQUE/FK | one per reservation |
| `messages` | `id` PK, `conversation_id` FK, `body` 1–1000 chars | |
| `reliability_metrics` | `branch_id` PK/FK | response rate, avg response time, etc. |
| `reports` | `id` PK, `reporter_user_id` FK, `target_type/id`, `status` | |
| `audit_events` | `id` PK, `actor_user_id` FK, `action`, `resource_type/id`, `result`, `metadata` JSON | |
| `rate_limits` | `key` PK, `count`, `window_started_at`, `expires_at` | |
| `idempotency_keys` | composite PK `(principal_id, operation, key)` | `resource_id`, `request_hash` |

## `0002_production_hardening.sql`
- `schema_migrations` — `version` PK, `applied_at` (tracks which migration files have run).
- `password_reset_tokens` — token hash, expiry, `used_at`, IP hash.
- `device_tokens` — `platform ∈ {WEB, IOS, ANDROID}`, `push_token`, UNIQUE(`user_id`, `token_hash`).
- `user_consents` — `consent_type ∈ {PRIVACY_POLICY, TERMS_OF_SERVICE, PHARMACY_TERMS, MARKETING}`, UNIQUE per (user, type, document_version).
- `notification_delivery_logs` — per-attempt delivery record linked to `notification_outbox`.
- Added: `pharmacies_owner_user_unique` index; `notification_outbox.last_error`, `.idempotency_key` (+ unique partial index); `users.deleted_at`; `pharmacies.resubmitted_at`.

## `0003_mvp_conformance.sql`
- `request_dispatches.notify_after` — staged (3+3) dispatch second-wave timer.
- `medicine_requests.coarse_geohash` — coarse location signal, separate from exact matching coordinates.
- `secure_files.attachment_kind ∈ {PRESCRIPTION, BOX_IMAGE}` — distinguishes prescription vs. box-photo uploads.

## `0004_clinical_core.sql`
- `family_members` — proxy consent link; `proxy_scope ∈ {VIEW, ORDER, CONFIRM}`; `CHECK (member_user_id IS NULL OR member_user_id <> owner_user_id)`.
- `dose_schedules` — `sig_source ∈ {PHARMACIST, MONOGRAPH_TEMPLATE, PATIENT_SELF_REPORT}` default `PATIENT_SELF_REPORT`; `doses_per_day` 1–12; `reorder_snoozed_until`.
- `dose_events` — append-only; `status ∈ {TAKEN, MISSED, SNOOZED, UNKNOWN}`; unique partial dedupe on `(dose_schedule_id, client_event_id)`.
- `stock_movements` — `delta_qty <> 0` (loosened in 0007); `reason ∈ {SALE, PURCHASE, ADJUST, RETURN, COUNT}`; dedupe index (rescoped in 0006).
- `sku_trust` — composite PK `(branch_id, medicine_name)`; `trust_score` 0–1.
- `attention_events` — `priority ∈ {SEV_ALERT, ACTION_REQUIRED, IN_PROGRESS, SUGGESTION}`; dedupe index (fixed in 0006).
- `model_output_log` — `pipeline`, `confidence`, `gated`, `resolved_by_user_id`.

## `0005_interaction_safety.sql`
- `interaction_dataset_meta` — source/version/coverage metadata.
- `interaction_ingredients` — `ingredient` PK, `rxnorm_cui`.
- `drug_interactions` — `CHECK (ingredient_a < ingredient_b)`, unique pair index, `severity ∈ {CONTRAINDICATED, SEVERE, MODERATE, MINOR}`.
- `interaction_checks` — `outcome ∈ {CLEAR, INFO, INTERRUPT, UNAVAILABLE}`; `unavailable_reason ∈ {NO_COVERAGE, DATASET_STALE, LOOKUP_FAILED}`; override constrained to `INTERRUPT` outcome + ≥10-char reason.

## `0006_clinical_integrity.sql` (integrity fixes, no new tables)
- Rescoped `stock_movements_client_dedupe_idx` to `(branch_id, medicine_name, client_event_id)`.
- Rescoped `attention_events_dedupe_idx` to also require `expires_at IS NULL`.
- Added `attention_sev_never_expires` CHECK.
- Added `family_members_live_pair_idx` (one live link per owner/member pair).
- Added `dose_schedules.units_per_dose` (1–20, default 1).

## `0007_review_round2.sql` (fixes to 0006's fixes, no new tables)
- Loosened `stock_movements_delta_qty_check` to allow zero-delta `COUNT` rows.
- Backfilled/normalized historical `stock_movements.medicine_name` casing/whitespace; merged duplicate `sku_trust` rows (densest history, most recent count, worst variance, min trust_score kept).
- De-duplicated `family_members` live links before re-applying the 0006 unique index (so it can actually be created on a database that already violates it).
- Added `interaction_checks.condition_key` (+ index) so an override handler can locate and clear the alert it responds to.

## Total: 32 tables across 7 migrations, all created/altered with `IF NOT EXISTS`/idempotent DDL, tracked in `schema_migrations`.

For the parallel Blueprint v3 logical schema (22 tables, no SQL, entity-first: `accounts`, `subjects`, `guardianships`, `peer_grants`, `catalogue_items`, `districts`, `pharmacies`, `branches`, `branch_hours`, `staff`, `licences`, `requests`, `request_lines`, `offers`, `offer_lines`, `reservations`, `reservation_lines`, `dispense_records`, `prescription_images`, `watches`, `audit_entries`, plus a device-registration concept never formalized as a table — see gap `BD-8`), read `docs/technical/06-database-architecture.html` directly. It shares almost no table or column names with the schema above and should not be used as a migration reference for `dawai-platform`.
