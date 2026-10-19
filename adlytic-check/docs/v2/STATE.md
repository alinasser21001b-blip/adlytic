# STATE — Adlytic Check V2

Updated: 2026-10-19 (cycle log in CHANGELOG.md, evidence in EVIDENCE.md)

## Current phase
H — Launch (all build phases A–G implemented; release blocked on owner actions in BLOCKERS.md)

## Live
| Item | Value |
|---|---|
| URL | https://adlytic-check.i6900612.workers.dev (unchanged) |
| Last verified build | `8d341aa` (E-010) |
| D1 migrations | 0001–0004 applied remotely (additive only) |
| Readiness | `ready: false` — `providerUsable` false because the provider account has no credit (B0) |
| Flags | `ANALYZER_VERSION=v1`, `SHOW_QUALITY_INDEX=false`, `ACCOUNTS_ENABLED=false`, `PAYMENTS_ENABLED=false`, `VIDEO_ENABLED=false` |

## Capability status
Vocabulary: IMPLEMENTED · TESTED (automated, local + CI) · LIVE_VERIFIED (observed on the
production URL) · BLOCKED (owner action named in BLOCKERS.md).

| Capability | Status | Notes |
|---|---|---|
| Core analysis (V1) | LIVE_VERIFIED earlier (E-001); **BLOCKED now (B0)** | live checks answer «التحليل متوقف مؤقتاً» and refund the unit |
| Research registry + rules KB | IMPLEMENTED | 22 registry entries (S01–S21 + INT-PH internal), 18 rules; no fabricated sources (server registry check) |
| Analyzer V2 | IMPLEMENTED, TESTED; real-provider eval partial (E-003) | behind `ANALYZER_VERSION`; calibrated prompt not yet measured (B0) |
| Quality index | IMPLEMENTED, TESTED; hidden | server-computed; `SHOW_QUALITY_INDEX=false` until stable |
| Retrieval eval | TESTED (offline) | recall 1.0, P@5 0.326 / nDCG@5 0.475 vs baseline 0.235 / 0.410 |
| Google identity | IMPLEMENTED, TESTED (mock IdP) | **BLOCKED (B1)**; live `/api/auth/google/start` says unavailable |
| Quota 2 + 1/24 h, cap 2 | IMPLEMENTED, TESTED (incl. concurrency) | applies once accounts are on |
| Paid checks (500 IQD) | IMPLEMENTED, TESTED (mock gateway); live catalog verified | **BLOCKED (B2)** |
| Liquid Professional UI | LIVE (deployed); TESTED in Chromium + WebKit | live UI smoke at 360–1440 runs in every deploy from cycle 10 |
| Video (frames + audio) | IMPLEMENTED, TESTED; Workers AI binding deployed | `VIDEO_ENABLED=false`; real eval BLOCKED (B0) |
| Direct link import | IMPLEMENTED, TESTED; live SSRF refusals verified from cycle 10 | |
| Meta import | BLOCKED (B3) | Instagram/Facebook links answer AUTH_REQUIRED |
| Human quality review | pending (B4) | |

## Baseline (V1, before any V2 change) — kept for comparison
| Item | Value |
|---|---|
| Build | `fb4119d` |
| Completed / attempted (eval) | 32 / 46 (69.6 %) — truncation at 3 000 tokens (E-002) |
| Latency p50 / p90 | 26.4 s / 30.3 s |
| Invented facts in published copy | 0 |
| Quota | 3 successful checks per browser cookie per rolling 7 days |
