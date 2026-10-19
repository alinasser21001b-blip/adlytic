# STATE — Adlytic Check V2

Updated: 2026-10-19 (cycle log in CHANGELOG.md, evidence in EVIDENCE.md)

## Current phase
H — Launch: V2 analysis live; accounts, payments and Meta import wait on owner actions (BLOCKERS.md)

## Live
| Item | Value |
|---|---|
| URL | https://adlytic-check.i6900612.workers.dev (unchanged) |
| Last verified build | `cb8205d` (E-016) — Analyzer V2 on `claude-haiku-5-5` |
| D1 migrations | 0001–0004 applied remotely (additive only) |
| Readiness | `ready: true` since 20:06 UTC (E-012) — B0 resolved by the owner's top-up |
| Flags | `ANALYZER_VERSION=v2` + `VISION_MODEL=claude-haiku-5-5` (D-015), `SHOW_QUALITY_INDEX=false`, `ACCOUNTS_ENABLED=false`, `PAYMENTS_ENABLED=false`, `VIDEO_ENABLED=false` |

## Capability status
Vocabulary: IMPLEMENTED · TESTED (automated, local + CI) · LIVE_VERIFIED (observed on the
production URL) · BLOCKED (owner action named in BLOCKERS.md).

| Capability | Status | Notes |
|---|---|---|
| Core analysis (V1) | rollback path, TESTED | replaced live by V2 (D-015): V1 on haiku-4-5 surfaced a phone number and prediction language on held-out cases (E-013) |
| Research registry + rules KB | IMPLEMENTED | 22 registry entries (S01–S21 + INT-PH internal), 18 rules; no fabricated sources (server registry check) |
| Analyzer V2 | LIVE_VERIFIED (D-015; E-016 health + model probe; E-017 owner's real check on the live site); real-provider eval E-014 (round 4: 46/46, 0 invented facts) | real model output also rendered in the browser suite (E-015) |
| Quality index | IMPLEMENTED, TESTED; hidden | server-computed; `SHOW_QUALITY_INDEX=false` until stable |
| Retrieval eval | TESTED (offline) | recall 1.0, P@5 0.326 / nDCG@5 0.475 vs baseline 0.235 / 0.410 |
| Google identity | IMPLEMENTED, TESTED (mock IdP) | **BLOCKED (B1)**; live `/api/auth/google/start` says unavailable |
| Quota 2 + 1/24 h, cap 2 | IMPLEMENTED, TESTED (incl. concurrency) | applies once accounts are on |
| Paid checks (500 IQD) | IMPLEMENTED, TESTED (mock gateway); live catalog verified | **BLOCKED (B2)** |
| Liquid Professional UI | LIVE_VERIFIED (E-010: real browser on the production URL at 360–1440); TESTED in Chromium + WebKit | |
| Video (frames + audio) | IMPLEMENTED, TESTED; real-provider eval 13/13 (E-013); Workers AI binding live | `VIDEO_ENABLED=false`; Whisper accuracy on Iraqi speech unmeasured |
| Direct link import | LIVE_VERIFIED (E-010, E-012: internal targets refused, public image imported) | |
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
