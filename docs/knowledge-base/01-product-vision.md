# 01 — Product Vision

Two personas/role systems exist across the docs; this file reconciles them and states which is live.

## Roles as actually implemented (`dawai-platform`, live)

`users.role CHECK (role IN ('PATIENT','PHARMACY','ADMIN'))` — `migrations/0001_init.sql`. Three account roles, plus product-level distinctions layered on top:

- **Patient** — creates medicine requests, browses offers, reserves, messages a pharmacy during an active reservation, manages saved pharmacies, family members (proxy consent), dose schedules.
- **Owner (of a pharmacy)** — a `PHARMACY`-role user who owns a `pharmacies` row (`pharmacies.owner_user_id`); onboards branches, uploads verification documents, manages inventory/offers/reservations for their branch(es).
- **Guardian / Family proxy** — not a distinct account role; modeled as a `family_members` link from a patient (`owner_user_id`) to another user (`member_user_id`) with `proxy_scope ∈ {VIEW, ORDER, CONFIRM}`, requiring two-sided, revocable, witnessable consent (`migrations/0004_clinical_core.sql`). This is Dawai's take on "the son who buys for his mother is the true Iraqi market unit" (`docs/dawai/BLUEPRINT_EXECUTION.md`).
- **Guest** — an unauthenticated visitor; can hit `GET /api/v1/medicines/search`, `/availability`, `/pharmacies*` (public routes, `server/routes/public.ts`) but cannot create a request. `docs/dawai/FINAL_MVP_READINESS.md` explicitly lists a fully anonymous `PatientSession` as a documented gap — the API is public-searchable but the UI is still account-gated (see `17-known-limitations.md`).
- **Administrator** — `ADMIN`-role user, bootstrapped once via `ADMIN_EMAIL`/`ADMIN_PASSWORD` (`server/routes/admin.ts::bootstrapAdmin`). Reviews pharmacy verification documents, approves/rejects/suspends/restores pharmacies and users, views the admin dashboard/audit trail/reports.

## Roles per Blueprint v3 (`platform/`, not integrated — see START_HERE §0)

Blueprint v3 (`docs/technical/01-system-architecture.html`) names three **experiences**: Patient App, Pharmacy App, Owner Console, backed by an `Account → Subject` identity split where an Account (a phone number) can own or be granted access to multiple Subjects (people whose medication is tracked) via `Guardianship` (unilateral, for dependents who can't consent) or `PeerGrant` (mutual, `view`/`order` scope). This is a richer, subject-centric model than the account-centric model actually shipped. The task brief's role list (Patient/Pharmacy/Owner/Guardian/Guest/Administrator) maps most directly onto this v3 vocabulary; `06-user-flows.md` and `07-screen-catalog.md` cover both tracks explicitly so neither is silently conflated.

## Value proposition

- **For patients**: stop making eleven phone calls. One request reaches multiple nearby verified pharmacies at once; offers are structured (price, brand, quantity, prep time) and comparable; the reservation removes the "will it still be there when I arrive" risk via a real 15-minute hold that only starts once a human pharmacist has acknowledged it.
- **For pharmacies**: fewer interrupting phone calls; a ranked inbox of real demand; ability to pause when at capacity or overnight; reliability metrics kept private per branch to build trust without public star-rating pressure (star ratings explicitly out of MVP scope).
- **For the platform / long-term moat**: per `docs/product/DAWAI_PRODUCT_BLUEPRINT.md`, positioning Dawai as "a clinical record with a fulfilment loop attached" — the adherence data graph (dose schedules, confirmed dose events, family-proxy relationships) is the durable asset that keeps a patient using the app between medicine emergencies, not just during them.

## Product philosophy (pulled from PRODUCT_BLUEPRINT_AR.md and the v1 blueprint)

- **Search ≠ Request.** Search surfaces availability *signals* (time-stamped, sourced, no guarantee); a Request is an explicit act of demand that triggers real dispatch and a real hold. Conflating the two would make "search results" into unkeepable promises.
- **No silent radius expansion.** 2 km → 5 km → 10 km only after an explicit patient action; never automatic.
- **No pay-to-rank.** Matching is scored on distance, response rate, response speed, pickup/delivery fit — nothing paid or manual.
- **Every availability claim is sourced and timestamped.** `availability_signals` and `stock_movements` always carry `source`/`observed_at`(`occurred_at`)/`expires_at`; no static catalogue row is ever presented as live stock (`ARCHITECTURE.md` "Availability").
- **AI/OCR never asserts clinical certainty.** `model_output_log` gates every model output; `sig_source = 'PHARMACIST'` can only be written by a pharmacy account, defaulting to the lowest-trust `PATIENT_SELF_REPORT` (`migrations/0004_clinical_core.sql`).
- **A wrong stock/adherence promise is worse than no promise.** Low-trust SKUs are excluded from forecasting entirely, not shown with a caveat; `computeDaysOfCover()` returns `suppressed: true` with a typed reason rather than guessing (`docs/dawai/BLUEPRINT_EXECUTION.md`).
- **One priority ladder replaces notification floods.** The Attention system (`attention_events`, `PillBar.tsx`) — `SEV_ALERT > ACTION_REQUIRED > IN_PROGRESS > SUGGESTION` — is the only surface for anything needing user attention.
- **RTL, Arabic-first, no accidental masculine-default UX debt going forward.** `docs/product/review/INDEPENDENT_REVIEW.md` finding #1 flagged that v1's Arabic copy was universally masculine second-person with no gender field anywhere in onboarding; this is an open product decision, not resolved in the shipped product (see `19-open-decisions.md`).

## Phase 0 goals

See `00-project-overview.md` "Phase roadmap". In one line: prove the Find → Confirm → Compare → Reserve → Pick up loop works end-to-end for a supervised Baghdad pilot with real pharmacies and real patients, without payments, delivery, or any AI clinical decision-making.
