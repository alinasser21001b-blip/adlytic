# START HERE — Dawai Engineering Knowledge Base

This is the single entry point for a new engineer or AI picking up the Dawai project with zero prior context. It was synthesized from every doc and every line of schema/route code in this repository as of 2026-08-04. Read this file first, then follow the links.

## 0. The one fact that changes how you read everything else

**This repository contains two different, non-interoperating implementations of "Dawai":**

1. **`dawai-platform/`** — a complete, tested, running product (React + Hono + PostgreSQL/PGlite). This is **the real, shipped MVP**. It implements the model described in `dawai-platform/ARCHITECTURE.md`, `dawai-platform/README.md`, and `docs/dawai/PRODUCT_BLUEPRINT_AR.md`: `users` with roles `PATIENT/PHARMACY/ADMIN`, email+password auth, `medicine_requests → pharmacy_offers → reservations`, a clinical/adherence module, and drug-interaction safety. It has migrations 0001–0007, a full server, a full React client, e2e tests, and a readiness report (`docs/dawai/FINAL_MVP_READINESS.md`) dated 2026-07-31 declaring it "Pilot MVP READY".
2. **`platform/`** — an in-progress, parallel rebuild (packages workspace: `@dawai/domain`, `@dawai/navigation`, `@dawai/design`, `@dawai/net`, `@dawai/session`, `@dawai/offline`, `@dawai/observability`, `@dawai/config`, `@dawai/contracts`, plus `platform/apps/patient`). It implements a **different, more elaborate spec called "Blueprint v3"** (`docs/product/v3/blueprint-v3.html`, mirrored in `docs/technical/*.html`): phone+OTP auth, `Account/Subject/Guardianship/PeerGrant` identity model, `Request/Offer/Reservation` marketplace entities with different field names, a `clinical-engine` that is prescription-gate-only (no interaction checking exists in Blueprint v3 Phase 0), and 12 named services. `docs/design/*` (SCREEN_INVENTORY, DESIGN_TOKENS, COMPONENT_INVENTORY) is generated from this v3 spec, not from `dawai-platform`.

These are **not two views of the same system** — they use different entity names, different auth mechanisms, and in places directly contradicting product rules (e.g. Blueprint v3 explicitly has no interaction-safety engine in Phase 0, while `dawai-platform` migrations 0005–0007 build exactly that). Full detail and the reasoning for treating them separately: `19-open-decisions.md` §1, `17-known-limitations.md` §1.

**Practical rule while this is unresolved: treat `dawai-platform/` as the product you ship, and `platform/` as an architecture/design-system R&D track whose output (screens, tokens, domain state machines) has not been wired into `dawai-platform` and should not be assumed to describe it.**

## 1. What Dawai is (30 seconds)

A time-bounded medicine-request and pharmacy-offer network for Iraq (Baghdad-first pilot): a patient asks for a medicine, the platform dispatches the request to nearby verified pharmacy branches, pharmacies answer with structured offers (brand, price, quantity, prep time), the patient picks one, the pharmacy acknowledges, a 15-minute hold starts, and the patient picks up. See `00-project-overview.md` and `01-product-vision.md`.

## 2. How to run it

`dawai-platform/` is the runnable app (Node 24 required):
```bash
cd dawai-platform
npm ci
npm run dev          # API on :8787 (tsx watch server/index.ts), web on :5173 (vite)
npm run check        # tsc -b (client) + tsc -p tsconfig.server.json (server)
npm test             # vitest run (server/tests, src/*.test.tsx)
npm run test:e2e     # playwright
npm run build         # tsc check + vite build + esbuild bundle of server/worker/migrate
npm run db:migrate   # tsx server/db/migrate.ts
npm run start         # NODE_ENV=production node dist-server/index.js
npm run start:worker  # NODE_ENV=production node dist-server/worker.js (lifecycle sweep every 30s)
```
Local dev uses PGlite (embedded Postgres) automatically — no external DB needed. Production requires `DATABASE_URL`, `SESSION_PEPPER`, `STORAGE_ENCRYPTION_KEY`, `WEB_ORIGIN` or the app fails closed (`dawai-platform/server/config.ts`). One-time admin bootstrap: set `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars on first `npm run dev`/start, then remove them.

`platform/` packages are libraries (`type:module`, `main:./src/index.ts`, no build step needed for consumption in TS); `platform/apps/patient` has its own `package.json` — check it before assuming it runs standalone. `platform/tools/*` are validators (`layer-check.mjs`, `deps-check.mjs`, `debt-check.mjs`, `docs-check.mjs`, `strict-check.mjs`, `trace-check.mjs`, `test-reach-check.mjs`, `ux-check.mjs`) that enforce the v3 architecture rules on that tree.

## 3. How the architecture works (recap — full detail in `02-architecture.md`)

`dawai-platform` is a **modular monolith**: one Hono API process (`server/app.ts`), route modules per audience (`routes/{auth,patient,pharmacy,admin,files,public,clinical,shared}.ts`), service modules for business logic (`services/{matching,clinical,interactions,lifecycle,notifications,ocr,audit,sku-key}.ts`), PostgreSQL (PGlite in dev/test) via `db/client.ts`, encrypted file storage (`storage/encrypted-files.ts`, `storage/object-store.ts`), and a separate lifecycle worker process (`worker.ts`) that sweeps expirations every 30s. The browser is never an authorization boundary — every query is scoped server-side by authenticated user/role. See `02-architecture.md` for the full diagram and `09-permissions.md` for the auth model.

## 4. What must never be changed without extreme care

Everything in `10-clinical-safety.md` is safety-critical. In summary:
- **Interaction checks fail closed to `UNAVAILABLE`**, never a false "clear" — `dawai-platform/migrations/0005_interaction_safety.sql`, `server/services/interactions.ts`.
- **`dose_events` and `audit_events` are append-only** — corrections are new rows, never updates (`migrations/0004_clinical_core.sql`, `0001_init.sql`).
- **`SEV_ALERT` attention events can never expire on a timer and have no dismiss control** — `migrations/0006_clinical_integrity.sql` (`attention_sev_never_expires` CHECK constraint) and `PillBar.tsx`.
- **`sig_source = 'PHARMACIST'` can only be written by a pharmacy account** — a patient can never self-assert pharmacist authorship of a dosing instruction.
- **The 15-minute reservation hold timer starts only on pharmacy acknowledgement, never on patient selection** — `ARCHITECTURE.md`, `services/lifecycle.ts`.
- **A non-selected pharmacy can never access a prescription image**; access is time-boxed to an acknowledged hold and audited.
- Low-trust SKUs are excluded from forecasting entirely, never shown with a caveat — `services/sku-key.ts`, `sku_trust` table.

Read `10-clinical-safety.md` and `04-business-rules.md` before touching any migration 0004–0007 code or `server/services/{clinical,interactions,lifecycle}.ts`.

## 5. Where decisions live

- Product decisions and rationale: `docs/dawai/PRODUCT_BLUEPRINT_AR.md` (Arabic, the blueprint `dawai-platform` actually implements), `docs/product/DAWAI_PRODUCT_BLUEPRINT.md` (v1, superseded, English, kept for reasoning), `docs/product/v3/blueprint-v3.html` (v3, the unimplemented spec `platform/` targets).
- Architecture decisions and rationale: migration SQL comments (unusually rich — read them, they explain *why*, not just *what*), `dawai-platform/ARCHITECTURE.md`, `docs/dawai/BLUEPRINT_EXECUTION.md`.
- Open/unresolved: `19-open-decisions.md`.
- Known gaps/incomplete work: `17-known-limitations.md`, `18-technical-debt.md`.
- Next priorities: `20-next-priorities.md`.

## 6. How to contribute (to `dawai-platform`, the shipped product)

1. Read `02-architecture.md`, `03-domain-model.md`, `04-business-rules.md` for the module you're touching.
2. If touching clinical/interaction/proxy code, read `10-clinical-safety.md` fully first.
3. Migrations are additive and numbered sequentially (`000N_description.sql`); they run via `server/db/migrate.ts` and must be idempotent/PGlite-safe (`IF NOT EXISTS` everywhere) — see the style in `migrations/0006` and `0007`, which is itself a record of fixing bugs introduced by `0004`/`0005`.
4. Every mutation route uses strict Zod schemas; retryable creation/selection endpoints require an `Idempotency-Key` header (`server/security/idempotency.ts`).
5. Run `npm run check && npm test && npm run build` before considering work done; `npm run test:e2e` for anything touching a full user journey.
6. Never introduce a static/mock stock figure — all availability must carry `source`/`observed_at`/`expires_at` per `availability_signals`/`stock_movements`.

## 7. Common mistakes (things this repo's own history shows people got wrong)

- Scoping an offline-replay dedupe key too coarsely (branch-wide instead of per-SKU) — silently swallowed multi-line offline sales; fixed in `0006`, see comment there.
- Forgetting `expires_at` in a dedupe partial index — permanently blocked re-raising a resolved alert; fixed in `0006`.
- Allowing multiple "live" proxy links between the same owner/member pair with `LIMIT 1` and no `ORDER BY` — nondeterministic effective scope; fixed in `0006`/`0007`.
- A `CHECK (delta_qty <> 0)` that made a *confirming* stock count unrecordable, inverting the trust signal; fixed in `0007`.
- Assuming `docs/design/*` and `docs/technical/*` describe `dawai-platform` — they describe the unimplemented v3 spec targeted by `platform/`. Don't build dawai-platform screens off `SCREEN_INVENTORY.md` without checking which codebase it's for (see §0 above).

## 8. Current priorities

See `20-next-priorities.md`. Short version: OCR provider wiring, RxNorm/DDInter ingestion for interaction data, offline mutation queue on native shell, patient-facing clinical timeline UI, and (separately, on the `platform/` track) closing the 11 Blueprint v3 gaps (`BD-1`…`BD-11`) documented in `docs/technical/11-validation-report.html`.

## 9. Map of this knowledge base

| File | Contents |
|---|---|
| `00-project-overview.md` | What/why/roadmap |
| `01-product-vision.md` | Users, value prop, philosophy |
| `02-architecture.md` | Every module, boundaries, diagram |
| `03-domain-model.md` | Entities/invariants from SQL |
| `04-business-rules.md` | Clinical/business constraints |
| `05-state-machines.md` | Request/Offer/Reservation/etc. |
| `06-user-flows.md` | Per-role flows |
| `07-screen-catalog.md` | Every screen |
| `08-navigation.md` | Navigation architecture |
| `09-permissions.md` | Auth/RBAC |
| `10-clinical-safety.md` | Safety-critical design |
| `11-runtime.md` | Startup, DI, offline, sync, jobs |
| `12-design-system.md` | Tokens, components, RTL, a11y |
| `13-api-contracts.md` | Routes and contracts |
| `14-data-model.md` | Full schema table-by-table |
| `15-events.md` | Event architecture |
| `16-testing.md` | Testing philosophy, CI |
| `17-known-limitations.md` | Honest gaps |
| `18-technical-debt.md` | Debt/TODOs |
| `19-open-decisions.md` | Contradictions, unresolved |
| `20-next-priorities.md` | What's next |
| `SYSTEM_MAP.html` | Interactive visual map |
