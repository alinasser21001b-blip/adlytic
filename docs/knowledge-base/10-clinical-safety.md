# 10 — Clinical Safety (safety-critical — read fully before touching this code)

Scope: `dawai-platform/migrations/0004_clinical_core.sql`, `0005_interaction_safety.sql`, `0006_clinical_integrity.sql`, `0007_review_round2.sql`, and `server/services/{clinical,interactions}.ts`, `server/routes/clinical.ts`. These migrations are unusually well-commented — the comments explain *why*, and this file preserves that reasoning rather than restating only the schema.

## The governing principle

*"A wrong stock promise is worse than no promise."* — `0004`, `sku_trust` comment. This principle generalizes across every clinical/safety subsystem in this codebase: **when uncertain, refuse or suppress, never guess.** Every mechanism below is an instance of this rule.

## 1. Drug interaction safety (migration `0005`)

### Data model
`interaction_dataset_meta` tracks the loaded dataset's source/version/`updated_at`/coverage size. `interaction_ingredients` is the **coverage table**: an ingredient not listed here cannot be evaluated at all. `drug_interactions` stores pairwise interactions canonically (`ingredient_a < ingredient_b`, one row per pair), `severity ∈ {CONTRAINDICATED, SEVERE, MODERATE, MINOR}`, each row sourced (`source`, `source_version`) — "every claim is receipted: the pharmacist sees where it came from."

Deliberate scope decision: **open-data tier only** (DDInter 2.0 + openFDA labels, RxNorm-normalized upstream). Enterprise datasets (DrugBank, First Databank, Micromedex) are explicitly avoided at this stage — the schema is written not to assume any single provider, so swapping data sources later doesn't require a schema change.

### The fail-closed rule
**Coverage is explicit. A regimen containing an ingredient absent from `interaction_ingredients` is reported `UNAVAILABLE` — never cleared on the covered subset.** This is the single most important safety rule in the codebase: partial coverage must never present as "checked and clear." `outcome ∈ {CLEAR, INFO, INTERRUPT, UNAVAILABLE}` — four states, no fifth "probably fine."

### Auditability
`interaction_checks` records **every** check, including ones that returned `UNAVAILABLE` — "regulatory defensibility depends on being able to show what the system knew and told the pharmacist at dispense time." `checked_by_user_id` is required (not nullable) even though `patient_user_id` can be null.

### Override discipline
An override can only exist for an `INTERRUPT` outcome (`CHECK (overridden_at IS NULL OR outcome = 'INTERRUPT')`) and requires a typed reason of **at least 10 characters** (`CHECK (overridden_at IS NULL OR length(trim(override_reason)) >= 10)`) — a checkbox-style "confirm anyway" is structurally impossible. Override rate is a tracked KPI per `interaction_checks_outcome_idx` and the design comment "Override is only ever populated for an INTERRUPT outcome ... Override rate is a KPI the blueprint tracks."

### `condition_key` (added `0007`)
The interaction alert deduplicates on the *clinical condition*, not the individual check, so the alert record retains the `resource_id` of whichever check first raised it. Without `condition_key`, an override handler couldn't reliably find and clear the right alert — this column closed that gap.

**If you touch `services/interactions.ts`: never let a code path return `CLEAR` for a regimen containing an ingredient outside `interaction_ingredients`. That is the one invariant this entire subsystem exists to protect.**

## 2. Family proxy consent (migration `0004`, hardened `0006`/`0007`)

- **Never silent.** `consent_granted_at` is NULL until the member explicitly accepts, or — for a patient (typically elderly) without their own phone/account — a pharmacist witnesses consent (`consent_witnessed_by`). There is no code path that creates a usable proxy link without one of these two.
- **Least-privilege, additive scopes**: `VIEW < ORDER < CONFIRM`. Nothing in the schema allows a scope to be granted out of order or skip a tier implicitly.
- **Deterministic authority** (fixed `0006`): exactly one live link per `(owner_user_id, member_user_id)` pair, enforced by `family_members_live_pair_idx`. Before this fix, `requirePatientAuthority()` selected a "live" link with `LIMIT 1` and no `ORDER BY` — if duplicate grants existed, the effective scope was whichever row Postgres's planner happened to return, i.e. **nondeterministic authority**. The `0007` migration additionally had to retroactively de-duplicate existing data (revoking all but the least-privileged live link per pair) before the unique index could even be created on a "dirty" database — a real operational lesson: **a uniqueness invariant introduced after data already violates it needs a data migration, not just a `CREATE UNIQUE INDEX`.**
- **Fail-closed error semantics**: `requirePatientAuthority()` throws rather than returning a boolean, so a forgotten `if (!authorized)` check cannot silently fall through to a permissive branch. Insufficient scope → 403; no relationship at all → 404 (not 403) — deliberately, so an unauthorized caller cannot use response-code differences to probe whether a profile exists.

## 3. Dose schedules and dose events (migration `0004`)

- **`sig_source` trust hierarchy**: `PHARMACIST > MONOGRAPH_TEMPLATE > PATIENT_SELF_REPORT`, defaulting to the lowest trust level. **"Forgetting the column must never assert that a pharmacist authored the instruction"** — this is why the default is the *least* trusted value, not left null or defaulted to something that looks authoritative. `sig_source = 'PHARMACIST'` may only be set by a pharmacy-role account (enforced in `services/clinical.ts`, not just documented) — a patient can never self-assert pharmacist authorship of dosing guidance.
- **`dose_events` is append-only.** No update/delete path exists for a confirmed dose event; a correction must be a new row. This is a direct instance of the "nothing clinical is edited or deleted" principle that also appears (independently) in Blueprint v3's domain model for `dispense_records`/`audit_entries` — the two tracks converged on the same rule from different directions.
- **Idempotent offline replay**: a partial unique index on `(dose_schedule_id, client_event_id)` means a retried offline sync is deduplicated at the database level, not by trusting client logic. The API returns `duplicate: true` with HTTP 200 on replay — a retry is a success, not an error, which matters because "Iraqi mobile networks make redelivery the normal case, not the edge case" (a phrase from the Blueprint v3 event-architecture doc that applies equally here even though it's describing a different codebase).
- **`units_per_dose` (added `0006`)**: fixes a days-of-cover calculation bug that assumed one unit per administration — a 2-tablet regimen was previously reported as lasting twice as long as it actually does. A silent math error in a "when will you run out" feature is a clinical-safety bug, not a cosmetic one.

## 4. Days-of-cover honesty gates (`server/services/clinical.ts::computeDaysOfCover`)

Returns `suppressed: true` with a typed reason instead of a number whenever the input data cannot support a trustworthy answer:
- `NO_DISPENSE_CYCLE` — no completed dispense cycle exists (the stated minimum dataset the blueprint requires before estimating).
- `CONFLICTING_DATA` — confirmed intake already exceeds what was dispensed, meaning the patient likely has stock the system doesn't know about; asserting a run-out date here would be actively wrong.
- `SNOOZED` — the patient snoozed the reorder suggestion; "already have it? snooze" must always win over any computed nag.

Rationale (`BLUEPRINT_EXECUTION.md`): *"a wrong 'you'll run out Thursday' trains users to ignore every future signal."* A suppressed-but-honest answer preserves long-term trust in every other signal the app shows.

## 5. Passive inventory ledger and SKU trust (migration `0004`, fixed `0006`/`0007`)

- **Not an ERP, by design.** There is no editable "quantity" field anywhere in the API; on-hand is always `SUM(delta_qty)`. Deltas are additive so two devices selling the same SKU offline both apply correctly at sync — an absolute-overwrite model would silently lose one sale.
- **Offline dedupe must be scoped per-subject, not per-batch.** `0006` fixed a real defect: the original dedupe key was `(branch_id, client_event_id)` — branch-wide — so a device syncing a *multi-line* sale under one client-event-id had every line after the first silently swallowed by `ON CONFLICT DO NOTHING` and misreported as a duplicate. Fixed to `(branch_id, medicine_name, client_event_id)`, matching the pattern already used correctly for `dose_events`. **Lesson for any future append-only/offline-replay table: the dedupe key must be scoped to the row's actual subject, not just the sync batch.**
- **SKU trust gates forecasting, and gates it completely, not partially.** Below `SKU_TRUST_THRESHOLD` (0.6), a SKU returns `forecastReady: false` and **no reorder hint is shown at all** — "low-trust SKUs are excluded from forecasting entirely rather than shown with a caveat — a wrong stock promise is worse than no promise" (this is the source of the governing principle stated at the top of this file).
- **A clean reconciliation must be recordable** (`0007` fix): the original `CHECK (delta_qty <> 0)` rejected a `COUNT`-reason movement whose delta was 0 — i.e. a stock count that *agreed* with the ledger. This meant trust could rise only by disagreeing with the ledger, never by confirming it was right — an inverted signal. Fixed to `CHECK (delta_qty <> 0 OR reason = 'COUNT')`.
- **Backfill discipline**: when the `0007` migration folded case/orthography variants of a medicine name onto one canonical key (`lower(btrim(medicine_name))`), it explicitly merged historical `sku_trust` rows rather than letting the new unique constraint arbitrarily pick a winner — keeping the *densest* movement history, the *most recent* count, and the **worst** (not best) variance: *"never launder a bad reconciliation by merging."*

## 6. Attention system (migration `0004`, fixed `0006`)

- **One priority ladder, one bar.** `SEV_ALERT > ACTION_REQUIRED > IN_PROGRESS > SUGGESTION` — implemented identically server-side (`attention_events.priority` CHECK) and client-side (`PillBar.tsx`), replacing ad hoc notification floods.
- **`SEV_ALERT` can never expire on a timer.** `attention_sev_never_expires` CHECK constraint (`0006`): `priority <> 'SEV_ALERT' OR expires_at IS NULL`. Before this constraint, setting `expires_at` on a severe alert would have let it silently time out, routing around the 409 that otherwise blocks dismissal — "the whole point of SEV_ALERT is that it clears only when its cause is resolved."
- **Both server and client refuse dismissal of a SEV_ALERT**, redundantly and deliberately: server returns `409 SEV_ALERT_NOT_DISMISSIBLE`; client renders **no dismiss control at all**, not a disabled one. *"Either alone is a bug waiting to happen."*
- **Dedupe must account for expiry** (`0006` fix): the original partial unique dedupe index on `(recipient_user_id, dedupe_key)` ignored `expires_at`, while the *read path* filtered on it — so an expired-but-undismissed event stayed in the unique index and permanently blocked the same condition from ever being raised again. Fixed to add `AND expires_at IS NULL` to the index predicate, matching the read path.
- Accessibility: severe alerts announce via `role="alert"`/`aria-live="assertive"`; everything else uses `status`/`polite` — this is itself a safety property (a screen-reader user must not miss a severe alert, but must not be interrupted by routine ones either).

## 7. AI/OCR guardrails

- `model_output_log` records every AI/OCR pipeline call: `pipeline`, `input_ref`, `output_json`, `confidence`, `model_version`, `gated` (boolean), `resolved_by_user_id`. Nothing downstream is allowed to treat a model output as ground truth without going through this gate.
- Per `docs/dawai/BLUEPRINT_EXECUTION.md` remaining work: the `OcrProvider` interface and a **≥0.85 server-side confidence gate** are still to be wired to a real provider — the schema/audit trail exists, the actual OCR call does not yet ("architecturally connected via secure upload, but does not claim extraction when no trusted provider is present" — `README.md`).
- Explicitly, permanently out of scope for AI in this product (both blueprint tracks agree): diagnosis, dosing calculators, pill identification, auto-substitution, allergy data, government-verified-authenticity claims. Any feature request that implies one of these needs a product decision, not an engineering workaround.

## 8. Prescription privacy (cross-cutting, `ARCHITECTURE.md` "Sensitive uploads")

Full pipeline: byte/pixel limit → magic-byte check (PNG/JPEG/WebP) → full decode → rotate/bounded-resize/re-encode/strip EXIF → random file ID+key → AES-256-GCM (random 96-bit nonce, AAD binds file+owner+purpose) → ciphertext on disk, metadata in Postgres → **authorization checked before decryption, and the read is audited** → `Cache-Control: no-store` on the response. A non-selected pharmacy can never reach a prescription image; a selected pharmacy's access is time-boxed to its acknowledged hold and revoked on resolution (collection, expiry, or cancellation each independently revoke access — see the v3 test-plan reference to this exact property, `docs/technical/09-testing-strategy.html`, even though it describes the parallel track — the property is one both implementations independently assert as required).

## Summary checklist before touching any file in this area

- [ ] Does this change ever let an interaction check return `CLEAR` without full ingredient coverage? If yes, stop.
- [ ] Does this change let a `SEV_ALERT` be dismissed or expire without its cause resolving? If yes, stop.
- [ ] Does this change let a patient (not a pharmacy account) set `sig_source = 'PHARMACIST'`? If yes, stop.
- [ ] Does this change update or delete an existing `dose_events`, `stock_movements`, `interaction_checks`, or `audit_events` row instead of inserting a new one? If yes, stop.
- [ ] Does this change compute a days-of-cover / forecast number from a low-trust or conflicting dataset without suppressing it? If yes, stop.
- [ ] Does this change widen a proxy's `family_members` scope without an explicit consent step? If yes, stop.
