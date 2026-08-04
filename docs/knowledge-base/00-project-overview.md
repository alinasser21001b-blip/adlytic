# 00 — Project Overview

## What Dawai is

Dawai (دوائي) is a **request-for-availability network** connecting a patient who needs a medicine with verified, nearby pharmacies that can confirm stock, price, and readiness. The one-sentence version from the product blueprint (`docs/product/DAWAI_PRODUCT_BLUEPRINT.md` §1): *"Dawai tells you which nearby pharmacy has your medicine, and holds it for you — so you stop making eleven phone calls."*

It is explicitly **not**: a delivery service, a payment platform, a diagnosis tool, a dose calculator, a pharmacy ERP, a telemedicine service, or a prescription issuer (`docs/product/DAWAI_PRODUCT_BLUEPRINT.md` §1 "What Dawai is not"; reaffirmed as still true in the shipped product by `dawai-platform/README.md` and `docs/dawai/FINAL_MVP_READINESS.md`).

## The problem it solves

A patient in Baghdad needing a medicine today phones pharmacies one by one or walks between them; nobody — including the pharmacies — knows what's in stock anywhere. Pharmacists have the mirror problem: constant phone interruptions asking "do you have X" while serving a counter customer. Both sides lose time to availability discovery. `dawai-platform/package.json`'s own description: *"a time-bounded medicine request and pharmacy offer network for Iraq."*

## Product philosophy

Two philosophies coexist in the docs, reflecting the two implementation tracks (see `START_HERE.md` §0 and `19-open-decisions.md`):

- **v1 blueprint / as-shipped (`dawai-platform`)**: "Search ≠ Request" — search shows time-stamped availability *signals* with no reservation guarantee; a Request is explicit demand that triggers dispatch → offers → a real hold. Core loop: **Find → Confirm → Compare → Reserve → Pick up** (`docs/dawai/FINAL_MVP_READINESS.md`).
- **PRODUCT_BLUEPRINT_AR.md / clinical-core wave**: reframes Dawai as *"a clinical record with a fulfilment loop attached — in that order"* (`docs/product/DAWAI_PRODUCT_BLUEPRINT.md` §1). The medication-adherence data graph (family proxy consent, dose schedules, dose events, passive inventory ledger, interaction safety) is described as the platform's durable moat, with the reservation loop as "the daily reason to open the app." This is implemented in migrations 0004–0007 and `server/services/{clinical,interactions}.ts` — it *is* built, on top of the v1 marketplace loop, not instead of it.

Both agree on the guardrails: no AI diagnosis/prescribing/dosing/auto-substitution; no static "catalogue" presented as live stock — every availability claim carries a `source`, `observed_at`, and `expires_at`.

## Phase 0 / MVP goals

From `docs/dawai/FINAL_MVP_READINESS.md` (dated 2026-07-31, verdict: **"Pilot MVP READY (in-repo)" — NOT nationwide production launch ready**):
- Prove the core loop end-to-end for a Baghdad pilot with human ops support.
- Patient: search without request, text/image/box/prescription request, coarse location, radius expansion 2→5→10 km with consent, structured offers, 15-minute hold after pharmacy ACK, directions/contact after ACK, cancel, history.
- Pharmacy: registration with required license document, hours/capacity controls, ranked inbox, quick structured offers, ACK → ready → complete/fail/no-show, private reliability metrics.
- Platform: geographic matching with dispatch caps, no silent radius expansion, encrypted Rx storage, notification outbox with safe payloads, fail-closed production config.
- Explicitly out of scope for MVP: checkout/payment, delivery orchestration (flagged off via `MVP_DELIVERY_ENABLED=false`), insurance/refills, public star ratings, autonomous OCR clinical decisions, controlled-substance fulfillment.

Separately, `docs/dawai/BLUEPRINT_EXECUTION.md` documents a later wave ("Clinical Core") that added the family-proxy, dose-adherence, passive-inventory, attention-system, and AI/OCR-audit modules on top of the MVP loop — the modules named AXIS 2 items 2, 5, 7 plus schema for item 6 in that doc's module map.

## Phase roadmap (as documented, reconciled)

1. **MVP marketplace loop** (migrations 0001–0003) — auth, pharmacies/branches, medicines, requests, dispatches, offers, reservations, messaging, notifications, audit, rate limiting, idempotency. Status: shipped, pilot-ready per `FINAL_MVP_READINESS.md`.
2. **Clinical core wave** (migration 0004) — family proxy consent, dose schedules/events, passive inventory ledger, attention system, model-output audit log. Status: shipped per `BLUEPRINT_EXECUTION.md`.
3. **Interaction safety** (migration 0005) — severity-tiered drug interaction checking. Status: schema + service shipped (`server/services/interactions.ts`); real DDInter/openFDA data ingestion listed as remaining work.
4. **Integrity hardening rounds** (migrations 0006, 0007) — adversarial-review bug fixes to rounds 2–3 above (offline dedupe scoping, attention-expiry interaction, deterministic proxy authority, reconciliation-count constraint, backfill). Status: shipped.
5. **iOS App Store packaging** — Capacitor shell over the production web app; architecture-ready but blocked on external items (Apple Developer account, macOS/Xcode, APNs credentials) — see `docs/dawai/APP_STORE_READINESS.md` and `17-known-limitations.md`.
6. **Blueprint v3 rebuild** (`platform/` workspace + `docs/product/v3/blueprint-v3.html` + `docs/technical/*.html`) — a parallel, more elaborate architecture (Account/Subject/Guardianship identity, 12 named services, 21 entities, 67 endpoints, 54 events) that is validated internally (11/11 architecture checks) but **not integrated with `dawai-platform`** and has 11 named Blueprint gaps (BD-1…BD-11) blocking screen implementation. Status: design/domain-layer in progress, not deployed. See `19-open-decisions.md` §1.

## Why it exists / market thesis

Baghdad-first, because that's where the pilot targets liquidity (patient demand density + pharmacy participation) first. The Arabic-first, RTL-native UI and the explicit avoidance of payment/delivery in v1 are deliberate: they narrow the regulatory surface (delivering prescription medicine and handling payments are different, harder-to-license products) while the platform proves the discovery/reservation loop and — per the clinical-core reframing — accumulates a durable adherence data asset that a pure marketplace would not.
