# Project Alpha — Baseline (established, not assumed)

Every line below was read from this repository or measured in this sandbox.
Nothing here is copied from the mission brief.

```text
ALPHA_START_TIME=2026-08-23T00:00:25Z
CURRENT_MAIN_SHA=4fcdad57f7fbab7645a56aa3e23d219a4ef20997
ALPHA_BRANCH=claude/adlytic-ios-testflight-ek9a26  (branched at, and equal to, origin/main)
WORKTREE_STATE=clean at start
CURRENT_PRODUCTION_SHA=UNKNOWN — production is not reachable from this sandbox
PRODUCTION_HEALTH=NOT_TESTED — https://adlytic-production.up.railway.app and
                  https://adlytic.net both answer `CONNECT tunnel failed, 403`
                  through the egress proxy. Same limit the previous audit hit.
DATABASE_HEALTH=NOT_TESTED — no DATABASE_URL in this environment, no .env file.
```

## What Adlytic actually is

| Aspect | Truth |
|---|---|
| `CURRENT_WEB_ARCHITECTURE` | **Server-rendered HTML built from TypeScript template literals.** No React, no bundler, no SPA build step. Browser JS lives *inside* those literals. 23 HTML page routes. |
| `CURRENT_API_SURFACE` | **151 registered routes** in `src/api/server.ts` (306 KB, one file). ~128 under `/api`, 23 HTML pages. Rich JSON DTOs. |
| `CURRENT_AUTH_MODEL` | bcrypt passwords → **JWT bearer, 7-day TTL, `tokenVersion` revocation**. `src/api/adapter.ts` resolves credentials from `Authorization: Bearer` **only — there is deliberately no cookie fallback**. A separate HttpOnly `adlytic_session` cookie exists solely to gate server-rendered *page* navigations. |
| Per-route authz | `app.use('/api/*')` is an **active-user gate, not an auth gate** — every failure path calls `next()`. Authentication is enforced **per handler**: `getUserId()` + `checkMember(userId, workspaceId)`. |
| `CURRENT_ADMIN_ARCHITECTURE` | `/admin*` pages via `adminPage()`, `/api/admin/*` via `requirePlatformAdmin`. Owned by a concurrent engineering track (`claude/admin-control-plane-*`). **Untouched by Alpha.** |
| `CURRENT_GRAPH_ARCHITECTURE` | `src/graph/architecture.ts` + `/api/admin/graph/{architecture,runtime,trace/:campaignId}`. The trace overlay **delegates to `buildBrainObservatory()` and copies its verdicts** — it decides nothing itself. |
| `CURRENT_BRAIN_ARCHITECTURE` | `src/services/brainObservatory.ts` → `BrainObservatorySnapshot`, built from `buildEntityFunnel()` + `buildEntityIntelligence()`. Six-layer `IntelligenceLayer` hierarchy: `DATA_VALIDITY → SEMANTIC_VALIDITY → FUNNEL_DIAGNOSIS → ANOMALY_DETECTION → HEALTH_IMPACT → RECOMMENDATION`. |
| `CURRENT_DEPLOYMENT_MODEL` | Railway, **`builder: DOCKERFILE`** (a deliberate secret-boundary control — the Dockerfile declares no `ARG`), `startCommand: node .deploy/start.js`, healthcheck `/api/health`. |
| `CURRENT_CI_STATE` | 7 workflows. `test.yml` = pre-merge gate: `npm ci` → `prisma generate` → `typecheck` → Chromium → `npm run test:all` (54 suites). |
| Product locale | `<html lang="ar" dir="rtl">`. Every customer is an Iraqi SMB owner. **The server-rendered default must be Arabic.** |
| Mobile web today | `test_mobile_viewport.mjs` already gates every page at 6 phone widths + 6 breakpoint probes: no horizontal overflow, ≥44 px touch targets, ≥12 px text. |

## Measured in this sandbox

```text
npm ci                        → exit 0
npx prisma generate           → Prisma Client v7.9.0 generated
npx tsc --noEmit              → 0 errors   (baseline, before any Alpha change)
Apple Developer credentials   → ABSENT
App Store Connect API key     → ABSENT
Expo / EAS token              → ABSENT
macOS / Xcode / xcodebuild    → ABSENT (Linux x86_64 container)
npm registry                  → reachable
adlytic.net / railway prod    → NOT reachable (proxy 403 on CONNECT)
```
