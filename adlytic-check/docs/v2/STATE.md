# STATE — Adlytic Check V2

Updated: 2026-10-19 (cycle log in CHANGELOG.md)

## Current phase
A — Research (in progress)

## Baseline (V1, before any V2 change)
| Item | Value | How known |
|---|---|---|
| Live URL | https://adlytic-check.i6900612.workers.dev | deploy job + verify-live.sh |
| Live build | `fb4119d` (= branch HEAD at V2 start) | `/api/health` build field, checked by CI |
| Readiness | `ready: true` (provider, Turnstile, IP salt all set) | `/api/health` |
| Production analyses | 1 completed (owner's test) | D1 `analyses` |
| That analysis | 2 provider calls (1 repair), 42.5 s, 9 326 input / 4 253 output tokens, `claude-haiku-4-5-20251001` | D1 row |
| Repair cause | unknown — V1 does not record why a repair was needed | gap → fixed in B |
| Tests | 8 unit + 29 integration + 46 browser checks green | CI test job |
| Quota model | 3 successful checks per browser cookie per rolling 7 days | `FREE_WEEKLY_LIMIT` |
| Identity | anonymous cookie only | `services/session.ts` |
| Media | one image (JPEG/PNG/WebP ≤ 3 MiB, re-encoded client-side to ≤1568 px) | `validation/image.ts` |

## Capability status
| Capability | Status |
|---|---|
| Core analysis (V1) | LIVE_VERIFIED |
| Analyzer V2 | not started |
| Identity / quota V2 | not started |
| Payments | not started |
| Liquid UI | not started |
| Video | not started |
| Link import | not started |
