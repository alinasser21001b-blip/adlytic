# Blueprint Execution — Clinical Core

Tracks implementation of *Dawai — Engineering-Ready Blueprint for a Smart Pharmacy Platform (Baghdad-First)* against `dawai-platform/`. This is an execution record, not a plan.

## Module map (blueprint AXIS 2 → code)

| Blueprint module | Status | Location |
|---|---|---|
| 1. Identity & Access | existed | `server/security/auth.ts` — opaque sessions, argon2id, CSRF, RBAC by role |
| 2. **Clinical** | **built this pass** | `server/routes/clinical.ts`, `server/services/clinical.ts`, migration `0004` |
| 3. Catalog | existed | `medicines`, `medicine_presentations`, `medicine_aliases` |
| 4. Commerce | existed | requests → offers → reservations, idempotency, settlement-ready |
| 5. **Inventory (passive)** | **built this pass** | `stock_movements` ledger + `sku_trust`, `POST /pharmacy/inventory/movements` |
| 6. AI/OCR pipeline | schema ready | `model_output_log` table with `gated` + `confidence`; provider interface pending |
| 7. **Notifications → Attention** | **built this pass** | `attention_events` + Pill Bar; existing outbox retained for push |
| 8. Audit & Observability | existed | append-only `audit_events`; every proxy access now audited |

## What was built, and why it exists

### Family proxy with two-sided consent
*Why:* "The son who buys for the mother is the true Iraqi market unit" (MM-P7), but the blueprint forbids "surfacing a family member's meds without consent" as anti-magic.

- `family_members` carries `proxy_scope ∈ {VIEW, ORDER, CONFIRM}`, `consent_granted_at` (NULL until the **subject** grants), `revoked_at`, and `consent_witnessed_by` for the elderly-without-a-phone case the blueprint calls out.
- `requirePatientAuthority()` throws rather than returning a boolean, so a forgotten check cannot fall through to a permissive branch. Insufficient scope → 403; no link at all → **404, not 403**, so an unauthorized caller cannot probe for the existence of a profile.
- Every proxy read writes a `PROXY_TIMELINE_VIEW` audit row with the link id and scope.

### Dose schedules and append-only dose events
*Why:* the adherence graph is the moat; adherence data that can be silently rewritten is worthless for it.

- `dose_events` is insert-only. A correction is a new row, never an update.
- Offline replay is deduped by a partial unique index on `(dose_schedule_id, client_event_id)`, so a retried offline queue cannot inflate adherence. The endpoint returns `duplicate: true` with 200 instead of erroring — a retry is a success, not a fault.
- `sig_source` is constrained, and `PHARMACIST` may only be recorded by a pharmacy account: a patient cannot self-assert that a pharmacist approved an instruction. This keeps MM-P3's "never AI-authored medical certainty" enforceable at the data layer.

### Days-of-cover with honesty gates
*Why:* MM-P2's failure mode is nagging; a wrong "you'll run out Thursday" trains users to ignore every future signal.

`computeDaysOfCover()` returns `suppressed: true` with a reason rather than a guess when:
- no completed dispense cycle exists (`NO_DISPENSE_CYCLE`) — the blueprint's stated minimum dataset,
- confirmed intake exceeds what was dispensed (`CONFLICTING_DATA`) — the patient has stock we don't know about,
- the patient snoozed (`SNOOZED`) — "already have it? snooze" must always win.

### Passive inventory ledger (explicitly not an ERP)
*Why:* "MM-X4 — passive inventory that just appeared", and *Deliberately NOT build: inventory ERP*.

- There is **no editable quantity field anywhere in the API**. On-hand is derived: `SUM(delta_qty)` grouped by SKU.
- Additive deltas mean two devices selling the same SKU offline both apply on sync; an absolute overwrite would lose one sale.
- `sku_trust` gates forecasting. Below `SKU_TRUST_THRESHOLD` (0.6) a SKU returns `forecastReady: false` and **no reorder hint at all** — the blueprint's "low-trust SKUs excluded from forecasting", not shown with a caveat.

### Attention system + Pill Bar
*Why:* "notification floods" are listed under anti-magic; the blueprint replaces them with one priority ladder.

- `attention_events` has a partial unique index on `(recipient, dedupe_key)` while live — frequency capping at the database, not in application code that can be bypassed.
- `PillBar.tsx` implements the state machine exactly: `SEV_ALERT > ACTION_REQUIRED > IN_PROGRESS > SUGGESTION > IDLE`, one bar only, 380ms morph, cross-fade under `prefers-reduced-motion`.
- **SEV_ALERT renders no dismiss affordance at all** (not a disabled one), and the server rejects dismissal with 409 `SEV_ALERT_NOT_DISMISSIBLE`. A safety alert clears by resolving its cause. Enforced on both sides because either alone is a bug waiting to happen.
- Severe alerts announce `role="alert"`/`aria-live="assertive"`; everything else is `status`/`polite`.

### Arabic typography compliance (AXIS 6)
The existing stylesheet violated three of the blueprint's evidence-based Arabic rules:

| Rule | Was | Now |
|---|---|---|
| letter-spacing = 0 always (connected script) | `-0.035em` on `h1`, `0.06em` on `.overline` | `0` on both |
| Higher line-height than Latin | headings `1.42`, body `1.6` | headings `1.5`, body `1.7` |
| Amber fails AA at body size | `#a76614` (4.08:1) | `#7a4a0f` (~5.6:1) |

Latin/monospace reference codes keep their tracking — the rule concerns connected script, not digits. Added `prefers-contrast: more` support for Baghdad daylight legibility.

## Verification

| Gate | Result |
|---|---|
| `npm test` | **33 passed** (was 16; +9 clinical invariants, +8 Pill Bar state machine) |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Migration `0004` on fresh DB | applies clean |
| Playwright matrix | see run log |

Tests assert the *invariants*, not the happy path: suppression on conflicting data, trust threshold exclusion, priority preemption across every adjacent pair, and the absence of a dismiss control on severe alerts.

## Explicitly not built (blueprint prohibitions honoured)

Diagnosis, dosing calculators, pill ID, inventory ERP, marketplace browsing UI, AI-authored medical instructions, government-verified authenticity claims, notification floods, red offer banners.

## Remaining work, in blueprint order

1. **OCR pipeline** — `model_output_log` and the confidence-gate contract exist; the `OcrProvider` interface and the ≥0.85 server-side gate are next.
2. **Interaction alerts** — needs RxNorm mapping + DDInter ingestion; severity tiering must land with it so only severe tier interrupts (the alert-fatigue evidence is the whole point).
3. **Offline mutation queue on device** — the server contract is ready (idempotency + additive deltas + append-only events); the client-side queue and local notification scheduling need the native shell.
4. **Authenticity scan** — parse both GS1 DataMatrix and QR; label network-provenance honestly as "sold through a Dawai-verified pharmacy", never "government-verified".
5. **Patient-facing timeline UI** — the `/api/v1/clinical/timeline` contract is live and typed; screens are next.
