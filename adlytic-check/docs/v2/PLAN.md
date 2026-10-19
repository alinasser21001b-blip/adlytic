# Adlytic Check V2 — Plan

Started 2026-10-19T17:47Z on branch `claude/save-for-reuse-djv4h8` (never `main`).
Live URL stays https://adlytic-check.i6900612.workers.dev throughout.

## Phase estimates (agent wall-clock, given the constraints in BLOCKERS.md)

| Phase | Scope | Estimate | Can reach LIVE without the owner? |
|---|---|---|---|
| A Research | sources registry, rules KB, link/payment/video capability research, baseline | 2–3 h | yes (docs only) |
| B Engine | benchmark (≥40 image/text + ≥12 video fixtures), v1 baseline on the real provider in CI, Analyzer V2 (evidence → rules → rubric → fixes → copy → validation), retrieval eval | 5–7 h | yes |
| C Identity & quota | Google OIDC (state + PKCE + nonce), internal user_id, guest migration, 2 + 1/24h cap-2 ledger, paid balance, leases | 3–5 h | code + tests yes; **live login needs a Google OAuth client** |
| D Payment | server catalog (500 IQD), ZainCash v2 adapter behind flag, orders/events/ledger/reconciliation, docs | 3–5 h | code + tests yes; **live purchase needs merchant keys** |
| E UI | "Liquid Professional" RTL redesign, result-page order, honest states, perf budgets, WebKit | 3–4 h | yes |
| F Video | ≤60 s MP4 → frames + audio extracted in the browser, Workers AI ASR, timeline report, coverage statement | 5–8 h | depends on Workers AI binding being allowed by the deploy token |
| G Links | direct-file import with SSRF controls; Meta capability matrix (authorized APIs only) | 2–4 h | direct files yes; **Meta import needs app review** |
| H Launch | expand-migrate-switch migrations, per-capability readiness + kill switches, deploy record, ROADMAP_V3 | 1–2 h + ongoing | yes |

Order: A → B → C → D → E → F → G → H. Each cycle is logged in CHANGELOG.md as
problem → hypothesis → change → test → result.

## Status vocabulary
- **IMPLEMENTED** — code exists. **TESTED** — automated tests pass locally/CI.
- **LIVE_VERIFIED** — observed working on the production URL.
- **BLOCKED** — needs something only the owner can provide (named in BLOCKERS.md).
Mocks and partial paths are never reported as "works".

## Release gates (any failure blocks release of that capability)
- zero ownership leaks (IDOR suite), zero invented commercial facts on known-truth fixtures,
  zero fabricated sources (every cited `sourceId` resolves in the server registry);
- V1 reports remain readable; migrations are additive only;
- free quota invariant `freeAvailable + freeHeld ≤ 2` holds under concurrency tests;
- no paid unit is ever consumed without explicit consent carrying the price version.
