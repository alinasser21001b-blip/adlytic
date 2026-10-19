# Evidence log

Every claim of TESTED or LIVE_VERIFIED points here: what was run, where, and what it showed.

| # | Date (UTC) | Claim | Evidence |
|---|---|---|---|
| E-001 | 2026-10-19 | V1 live at build fb4119d, ready=true | Deploy run on fb4119d (GitHub Actions, verify-live.sh: health/build match, routing, CSP, cookie, Origin, ownership) |
| E-002 | 2026-10-19 | V1 baseline on the real provider: 32/46, p50 26.4 s, 0 invented facts | Eval run 39299983377 (manual dispatch, synthetic fixtures only); numbers in EVALUATION.md |
| E-003 | 2026-10-19 | V2 comparison (haiku-5-5 38/46, p50 11.5 s, 16/16 prices, 0 invented facts); stopped by billing | Eval run 39301610297; EVALUATION.md "Comparison runs" |
| E-004 | 2026-10-19 | Provider refuses every call for billing (B0) | 4-call diagnostic in the eval workflow; readiness probe after the CI fix: run 39304728437, job 118242106928 → `HTTP 400 (invalid_request_error:credit_balance_too_low)`; key present and masked |
| E-005 | 2026-10-19 | Accounts, quota, payments, V2 report UI pass in Chromium and WebKit | Deploy run 39306900562 (37d3e49), Test job green incl. WebKit |
| E-006 | 2026-10-19 | Retrieval: filter recall 1.0, P@5 0.326 / nDCG@5 0.475 vs all-rules 0.235 / 0.410 | `npx tsx eval/retrieval.ts` (offline, deterministic) |
| E-007 | 2026-10-19 | Build `dc08f3f` live: migrations 0001–0004 applied, Workers AI binding deployed, live verification passed; readiness probe still B0 | Deploy run 39309597717: Deploy job 118257895400 success; readiness job 118258322677 → same 400 credit_balance_too_low at 19:22 UTC |
| E-008 | 2026-10-19 | Link import (1530519): unit + integration + Chromium + WebKit green | Deploy run 39311502279, Test job 118261981608 |
| E-009 | 2026-10-19 | New live checks pass against a real local Worker (production mode) before going to CI | `verify-live.sh http://127.0.0.1:8899` with local D1: internal targets → `blocked:blocked_address` / `self` / `blocked_name`; Instagram → AUTH_REQUIRED; login start → `/?auth=unavailable`; `live-ui.mjs` 24/24 at 360–1440 |
| E-010 | 2026-10-19 | Build `8d341aa` LIVE_VERIFIED: live V2 checks (link-import SSRF refusals, Instagram AUTH_REQUIRED, catalog 500 IQD @ iqd-500@1, login/payments honest, capabilities) and live UI smoke at 360/390/768/1440 + privacy/terms in real Chromium | Deploy run 39314476033, Deploy job 118274601967 (steps 16–17 green), screenshots artifact `adlytic-check-live-screenshots` |
| E-011 | 2026-10-19 | Owner topped up the provider account: billing probe `provider account: OK` at 19:58 UTC; health still `providerUsable=false` because a live check was refused for billing in the 15 min before | Readiness job 118275217219 (probe step green; configuration step lists only `providerUsable`) |
