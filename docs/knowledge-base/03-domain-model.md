# 03 — Domain Model (as implemented in `dawai-platform`)

Source of truth: `dawai-platform/migrations/0001_init.sql` through `0007_review_round2.sql`. Every entity below is a real table. Blueprint v3's parallel 21-entity model (Account/Subject/Guardianship/PeerGrant/CatalogueItem/District/...) is documented in `docs/technical/02-domain-model.html` and is **not** this schema — see `19-open-decisions.md`.

## Identity & access

- **`users`** — the single account table for all three roles (`PATIENT`/`PHARMACY`/`ADMIN`). `status ∈ {ACTIVE, SUSPENDED, DELETED}`. Invariant: one email per account (`UNIQUE(email)`); `deleted_at` added in `0002` for soft deletion.
- **`sessions`** — opaque bearer/cookie sessions; only a token hash and CSRF-token hash are stored, never the raw token. Revocable (`revoked_at`); indexed for "my active sessions" queries.
- **`patient_profiles`** — 1:1 with a `PATIENT` user; default area, coordinates, notification preferences JSON.
- **`password_reset_tokens`**, **`device_tokens`**, **`user_consents`** (`0002`) — reset flow, push-token registration per platform (WEB/IOS/ANDROID), and a versioned consent-acceptance ledger (`PRIVACY_POLICY`/`TERMS_OF_SERVICE`/`PHARMACY_TERMS`/`MARKETING`) unique per `(user, type, version)` — re-acceptance is required when a document version changes.

## Pharmacy

- **`pharmacies`** — the legal business entity. `owner_user_id` unique (`0002`, one pharmacy per owner account). `verification_status ∈ {PENDING, UNDER_REVIEW, VERIFIED, REJECTED, SUSPENDED}`, set only by admin action. License number, issuer (defaults to "Iraqi Pharmacists Syndicate"), expiry.
- **`pharmacy_branches`** — the operational unit patients actually match against. Governorate/district/address/landmark, lat/long (required, unlike the coarse patient-side geohash), IANA `timezone` (default `Asia/Baghdad`) + `opening_hours` JSON used to exclude closed branches from dispatch, `pickup_enabled`/`delivery_enabled`, `accepting_requests` (pharmacy-controlled pause switch), `operational_status ∈ {ACTIVE, PAUSED, SUSPENDED}`.
- **`verification_documents`** — license/pharmacist-ID/other uploads backing a pharmacy's verification; `status ∈ {PENDING, ACCEPTED, REJECTED}`.
- **`reliability_metrics`** — 1:1 per branch, private (never patient-facing per the "no public star ratings" rule): response rate, average response time, successful reservations, completed requests, confirmed-not-found count, cancellation rate.

## Medicine catalogue

- **`medicines`** — generic drug identity. `classification ∈ {OTC, PRESCRIPTION, CONTROLLED, UNKNOWN}`.
- **`medicine_presentations`** — brand/strength/dosage-form/pack-size variant of a medicine, with an optional `gudea_reference` (Iraq's Gudea national drug database reference) and `barcode`.
- **`medicine_aliases`** — searchable alias table (Arabic/English), `normalized_alias` indexed for lookup — this is the search-normalization surface (see also the Arabic-normalization test rule in Blueprint v3's testing strategy, `09-testing.md` reference, though the actual normalization implementation lives in the search route, not a separate service module here).

## The core marketplace loop

- **`medicine_requests`** — a patient's request. `public_reference` is the patient-visible ID; `status` is a 12-value enum (`DRAFT, NEEDS_CLARIFICATION, ACTIVE, HOLD_PENDING, RESERVED, READY, COMPLETED, EXPIRED, CANCELLED, NO_MATCH, BLOCKED`) — see `05-state-machines.md`. `quantity` capped at 20 (anti-hoarding / anti-controlled-diversion bound), `urgency ∈ {NOW, TODAY, TOMORROW}`, `radius_km ∈ {2,5,10}` (the fixed 2→5→10 expansion ladder), `prescription_status ∈ {NOT_PROVIDED, PROVIDED, REVIEW_REQUIRED, VERIFIED}`. `version` column supports optimistic concurrency. `coarse_geohash` (added `0003`) separates a coarse location signal from the exact matching coordinates stored alongside it — a deliberate privacy split (exact coords used for matching math only; `coarse_geohash` is what's safe to expose more broadly).
- **`request_dispatches`** — the fan-out record: which branch was sent which request, with `distance_km`, `match_score`, `match_reasons` JSON, and a `status` lifecycle (`SENT → VIEWED → RESPONDED`/`DECLINED`/`EXPIRED`). `notify_after` (added `0003`) implements the staged 3+3 dispatch: a second wave of branches is queued but its notification is deferred.
- **`pharmacy_offers`** — a branch's structured answer to a request: `offer_type ∈ {EXACT, PARTIAL, ALTERNATIVE_REVIEW_REQUIRED, ORDERABLE}`, brand/strength/form actually offered, quantity, `price_iqd`, pickup/delivery flags, `preparation_minutes`. Partial unique index enforces **one active/hold offer per (request, branch)** — a branch can't spam duplicate offers on the same request.
- **`reservations`** — the patient's selection of one offer. `public_reference` for pickup-ticket display. `status ∈ {PENDING_ACK, ACTIVE, READY, COMPLETED, REJECTED, CANCELLED, EXPIRED, FAILED, NO_SHOW}`. Partial unique index enforces **one live reservation per request** (`PENDING_ACK|ACTIVE|READY`) — a patient cannot double-book. `acknowledgement_deadline` and `hold_expires_at` are the two timers driving the state machine; **the hold timer is never started until the pharmacy acknowledges** — this is enforced by the fact `hold_expires_at` is only set on the ACK transition, not on reservation creation (`services/lifecycle.ts`, `ARCHITECTURE.md`).
- **`availability_signals`** — append-only, sourced (`PHARMACIST_CONFIRMATION`/`MANUAL_STOCK`/`POS_SYNC`/`REALTIME_SYNC`), state (`AVAILABLE`/`LOW`/`UNAVAILABLE`/`ORDERABLE`), always time-boxed with `expires_at`. This is what powers "search" (not "request") results.
- **`saved_pharmacies`** — simple patient↔branch bookmark, composite PK.

## Messaging & notifications

- **`conversations`** — exactly one per reservation (`UNIQUE(reservation_id)`), scoping chat to an active transaction, not open-ended pharmacy messaging.
- **`messages`** — text body, 1–1000 chars, belongs to a conversation.
- **`notifications`** — durable, patient/pharmacy-facing inbox row.
- **`notification_outbox`** — the delivery-channel projection of a notification. `channel ∈ {IN_APP, WEB_PUSH, APNS, FCM, SMS}`, `status ∈ {PENDING, DELIVERED, FAILED}`, retry bookkeeping (`attempts`, `next_attempt_at`), `idempotency_key` (unique, `0002`) to prevent duplicate sends across retries. Payload is deliberately minimal (`{eventType, resourceId}` — no PHI, no medicine name, no coordinates) — see `10-clinical-safety.md` and `15-events.md`.
- **`notification_delivery_logs`** (`0002`) — per-attempt delivery audit trail (`SENT`/`FAILED`/`SKIPPED`) linked to an outbox row.

## Clinical core (migration 0004) — the adherence/family module

- **`family_members`** — a proxy-consent link, `owner_user_id → member_user_id` (nullable until the member accepts), `proxy_scope ∈ {VIEW, ORDER, CONFIRM}` (additive, least-privilege), `consent_granted_at` NULL until granted, `consent_witnessed_by` for the "elderly relative without a phone" case, `revoked_at`. Invariant added in `0006`: **exactly one live link per (owner, member) pair** (`family_members_live_pair_idx`), making authority deterministic — this fixed a real bug where `requirePatientAuthority()` used `LIMIT 1` with no `ORDER BY` and could nondeterministically pick between duplicate links.
- **`dose_schedules`** — a patient's medication regimen. `sig_source ∈ {PHARMACIST, MONOGRAPH_TEMPLATE, PATIENT_SELF_REPORT}` defaulting to the lowest-trust option; `confirmed_by_user_id` records who actually confirmed it. `units_per_dose` (added `0006`) fixed a days-of-cover math bug that assumed one unit per administration.
- **`dose_events`** — **append-only** confirmation log (`TAKEN`/`MISSED`/`SNOOZED`/`UNKNOWN`), with `client_event_id` + partial unique index for idempotent offline replay, and `confirmed_via_family_member_id` recording proxy confirmations.
- **`stock_movements`** — the passive inventory ledger (explicitly "NOT an ERP"): on-hand quantity is *derived* as `SUM(delta_qty)`, never stored directly. `reason ∈ {SALE, PURCHASE, ADJUST, RETURN, COUNT}`. Dedupe key fixed in `0006` to be scoped per-SKU (`branch_id, medicine_name, client_event_id`), not branch-wide, after a bug where a multi-line offline sale under one client-event-id silently dropped every line after the first. The `delta_qty <> 0` constraint was loosened in `0007` (`OR reason = 'COUNT'`) so a *confirming* stock count (delta 0) is recordable — without this fix, trust could never rise from a clean reconciliation.
- **`sku_trust`** — per-(branch, medicine_name) forecast-readiness gate; `trust_score` 0–1. Below the threshold a SKU is excluded from forecasting entirely (see `10-clinical-safety.md`).
- **`attention_events`** — the unified "needs your attention" feed replacing notification floods. `priority ∈ {SEV_ALERT, ACTION_REQUIRED, IN_PROGRESS, SUGGESTION}`. `SEV_ALERT` rows can never carry an `expires_at` (CHECK constraint added `0006`) and are dismissed only by resolving their cause. Dedupe (`dedupe_key`, partial unique index) also fixed in `0006` to account for `expires_at`, after a bug where an expired-but-undismissed event permanently blocked the same condition from ever being raised again.
- **`model_output_log`** — every AI/OCR model call, its confidence, whether it was `gated`, and who resolved a gated output. The audit trail for the "AI never asserts clinical certainty" rule.

## Interaction safety (migration 0005)

- **`interaction_dataset_meta`** — source/version/`updated_at`/ingredient count of the loaded interaction dataset (DDInter 2.0 + openFDA labels, normalized via RxNorm upstream — no enterprise dataset like DrugBank/FDB/Micromedex assumed).
- **`interaction_ingredients`** — the coverage table; an ingredient absent here cannot be evaluated.
- **`drug_interactions`** — pairwise, stored canonically with `ingredient_a < ingredient_b` so a pair has exactly one row; `severity ∈ {CONTRAINDICATED, SEVERE, MODERATE, MINOR}`, sourced (`source`, `source_version`).
- **`interaction_checks`** — every check performed, including ones that returned `UNAVAILABLE` (regulatory defensibility — the system must be able to show what it knew and told the pharmacist). `outcome ∈ {CLEAR, INFO, INTERRUPT, UNAVAILABLE}`; override fields constrained so an override can only exist for an `INTERRUPT` outcome and requires a ≥10-character typed reason (`CHECK` constraints). `condition_key` (added `0007`) lets an override handler find and clear the alert it's responding to.

## Platform / cross-cutting

- **`secure_files`** — encrypted upload metadata (never plaintext on disk): `purpose ∈ {PRESCRIPTION, PHARMACY_LICENSE, PHARMACIST_ID}`, `attachment_kind` (added `0003`, `PRESCRIPTION`/`BOX_IMAGE`), size capped at 10 MB, AES-GCM `nonce`/`auth_tag`, retention `delete_at`.
- **`reports`** — user-filed reports against a user/pharmacy/request/reservation; admin-resolved.
- **`audit_events`** — actor, role, action, resource, `result ∈ {SUCCESS, DENIED, FAILED}`, free-form `metadata` JSON. Written by `writeAudit()` (`services/audit.ts`) from nearly every mutating route.
- **`rate_limits`**, **`idempotency_keys`** — infrastructure tables backing `security/rate-limit.ts` and `security/idempotency.ts`.

## Two cross-entity invariants worth internalizing

1. **Nothing clinical is silently overwritten.** `dose_events`, `stock_movements`, and `audit_events` are append-only by convention (no UPDATE/DELETE code paths write over history) — corrections are new rows. This mirrors Blueprint v3's stated invariant for `dispense_records`/`audit_entries`, even though the table names differ.
2. **A missing relationship and a forbidden one should not be distinguishable by response shape** where privacy-sensitive (e.g. proxy-authority checks return 404 for "no link" rather than leaking existence via a 403) — `docs/dawai/BLUEPRINT_EXECUTION.md`: *"Insufficient scope → 403; no link at all → 404, not 403."*
