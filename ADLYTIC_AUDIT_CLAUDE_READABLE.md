# ADLYTIC AUDIT — COMPLETE TEXT FOR LLM ANALYSIS

## How to use this document

This file merges three audit artifacts into one plain-text markdown document for LLM analysis (Claude and similar tools cannot reliably ingest PDFs). **Part A** is the first-pass audit (V1, before horizontal-scaling). **Part B** is the second-pass audit (V2, branch `feat/horizontal-scaling`). **Part C** is the side-by-side comparison. **Part D** summarizes what changed between passes. **Part E** lists every item that remains unfixed after V2. Do not treat Part D/E as substitutes for Parts A–C — they are navigation aids only; full finding text lives in the source sections.

---

## PART A: FIRST AUDIT (V1 — BEFORE modifications)

# ADLYTIC_MASTER_ARCHITECT_AUDIT_2026

**Document type:** Production-grade master architecture audit  
**Repository:** `/Users/aliahhed/Downloads/adlytic`  
**Audit date:** 2026-06-29  
**Stack reality:** Hono + `@hono/node-server`, Prisma 7 + PostgreSQL (`@prisma/adapter-pg` + `pg.Pool`), server-rendered TypeScript HTML pages (`layout.ts`, `*Page.ts`), inline `SHARED_JS`, background workers in-process (`serve.ts`), Meta Graph API client, Stripe billing, Claude AI layer  
**NOT Next.js** — no React SSR, no App Router, no Vercel edge functions  

**Scope:** Full codebase review across five pillars with surgical focus on `prisma/schema.prisma`, `syncAccount.ts`, `serve.ts`, `server.ts`, `metaClient.ts`, `layout.ts`, `checkWorkspaceTokenHealth.ts`, Meta/Stripe webhook handlers, and Postgres advisory-lock usage.

**Commits reviewed through:** `885f009` (UI resilience / sync UX / token-health), `f7b85af` (SyncJob dedupe + advisory lock cleanup), `ec1f4a5` (Meta webhooks), `26858ed` (real sync polling B-0).

---

## Executive Summary

Adlytic is a **mature Phase-1 ads intelligence platform** with unusually strong domain discipline: Meta transport is isolated in `metaClient.ts`, dashboard DTO assembly is centralized in `getDashboard.ts`, ETL is idempotent via upserts, and recent commits (`885f009`, `f7b85af`, `26858ed`) show active hardening of sync UX, token health, and webhook security.

However, the system carries **three production-critical structural risks** that a master architect must treat as first-class:

1. **Session-scoped Postgres advisory locks + Prisma connection pooling** — Locks are acquired with `pg_try_advisory_lock` (session-scoped, not transaction-scoped). Prisma's pool can reuse connections across requests/workers. `syncChunked` mitigates leaked locks via `pg_advisory_unlock_all()` in a pinned transaction (`f7b85af`), but **`sync()` (auto-sync path) lacks this mitigation**, and `unlock_all` itself is a blunt instrument that can release unrelated locks if the same connection ever holds multiple advisory keys.

2. **Single-process background orchestration at scale** — Auto-sync, token refresh, raw-insight pruning, rollup refresh, fire-and-forget `syncChunked`, Meta webhook debounced reconciles, and engine/brain runs all share one Node event loop and one Prisma pool. There is **no job queue**, **no worker isolation**, and **no backpressure** beyond serial account iteration and Meta politeness delays. A large account backfill or Meta code-17 storm can starve HTTP latency and accumulate `PENDING`/`PROCESSING` SyncJobs.

3. **Multi-instance deployment gaps** — OAuth CSRF state is correctly persisted (`OAuthState` model), but **post-callback OAuth sessions remain in-memory** (`oauthSessions` Map in `server.ts`). Rate-limit maps, platform-stats cache, Meta webhook debounce timers, and the auto-sync coarse lock (`adlytic:auto-sync`) are **per-process**. Railway multi-replica deploys will exhibit split-brain OAuth completion, duplicated background sync attempts (partially mitigated by advisory lock), and inconsistent rate-limit enforcement.

**Positive highlights:**

- Meta webhook HMAC verification is correctly implemented (raw body, length-guarded `timingSafeEqual`, async decoupling) — mirrors Stripe pattern.
- Token encryption uses AES-256-GCM with distinct `TokenDecryptError` — never conflated with Meta 190.
- SyncJob polling UX (`layout.ts` `pollSyncJob`, `chunksDone`/`chunksTotal` progress, `reused` active-job dedupe) is production-minded.
- Stripe webhook idempotency via `ProcessedStripeEvent` PK = event.id inside `$transaction`.
- Config centralization (`config.ts`) with production fail-fast for secrets.

**Overall verdict:** **Shippable for early production / controlled beta** with a single Railway instance and moderate account count. **Not yet architecturally ready** for multi-replica horizontal scale, high account cardinality, or strict SLAs without addressing locking semantics, job queue extraction, and index/ops gaps documented below.

---

## Audit Methodology

| Step | Action |
|------|--------|
| 1 | Static analysis of ~45 `src/` TypeScript modules, Prisma schema (30+ models), migrations |
| 2 | Trace critical paths: OAuth connect → `kickoffInitialSync` → `syncChunked` → engines → dashboard poll |
| 3 | Trace failure paths: Meta 190, code 17, token decrypt, advisory lock skip, SyncJob FAILED |
| 4 | Review webhook security contracts (Stripe + Meta) |
| 5 | Inspect UI inline JS (`SHARED_JS`, dashboard/campaigns onboarding poll from commit `885f009`) |
| 6 | Cross-reference internal docs (`HOW_IT_WORKS.md`, `META_INTEGRATION_SPEC.md`) vs code |
| 7 | Count `: any` / `as any` in `src/` (**31 occurrences** across 12 files) |

Severity scale:

| Level | Meaning |
|-------|---------|
| **Critical** | Data loss, security bypass, permanent lockout, or production outage likely under normal load |
| **High** | Significant correctness, integrity, or availability risk; workaround exists but fragile |
| **Medium** | Degraded UX, ops burden, or latent failure under scale |
| **Low** | Style, minor inefficiency, or future tech debt |

---

## Pillar 1 — Architectural Patterns & Code Quality

### 1.1 System topology (as-built)

```
Browser ──► Hono (server.ts) ──► Prisma/pg.Pool ──► PostgreSQL
                │                      ▲
                │                      │
                ├── SSR pages (*Page.ts + layout.ts SHARED_JS)
                ├── REST /api/*
                └── setImmediate background:
                        syncChunked, runEngines, runBrainOrchestrator,
                        processMetaWebhookEvent, kickoffInitialSync

serve.ts (separate entry OR same process in prod via dist/src/api/serve.js)
    ├── Recursive setTimeout auto-sync loop (6h default)
    ├── refreshExpiringMetaTokens
    ├── pruneRawInsights + refreshCampaignHistoryRollups (24h interval)
    └── Coarse advisory lock: adlytic:auto-sync
```

**Finding P1-01 — Monolithic route file** | **Medium**

`src/api/server.ts` is **~3,392 lines** containing auth, billing, Meta OAuth, sync, dashboard API, AI chat, admin, and 57 routes. This violates separation of concerns and increases merge conflict / review risk.

- **Location:** `src/api/server.ts:1-3391`
- **Recommendation:** Split into Hono sub-apps: `routes/auth.ts`, `routes/meta.ts`, `routes/sync.ts`, `routes/billing.ts`, mount in factory.

**Finding P1-02 — Page/API boundary is clean but duplicated client logic** | **Low**

Server pages emit HTML + inline IIFE scripts. Shared behavior lives in `layout.ts` `SHARED_JS` (apiFetch, pollSyncJob, sync status bar). `dashboardPage.ts` **duplicates** `pollSyncJob` for onboarding overlay (lines 1800-1811) instead of exclusively using `window.pollSyncJob`.

- **Location:** `src/web/pages/dashboardPage.ts:1800-1811` vs `src/web/layout.ts:729-741`
- **Risk:** Divergent poll intervals, status handling, or max attempts over time.
- **Recommendation:** Onboarding should call `window.pollSyncJob(jobId, { onProgress: updateOnboardingUI })`.

**Finding P1-03 — `getAccount()` assumes single ad account per workspace** | **High**

```typescript
const account = ws.adAccounts[0] ?? null;
```

- **Location:** `src/api/server.ts:418-424`
- **Impact:** Multi-account workspaces (schema allows many `AdAccount` rows) will silently operate on arbitrary first account (insertion order dependent).
- **Recommendation:** Explicit `primary` flag on `AdAccount` or deterministic `orderBy: { createdAt: 'asc' }` documented as canonical — already used in `checkWorkspaceTokenHealth.ts:41-42` but **not** in `getAccount()`.

**Finding P1-04 — TypeScript `any` usage (31 hits)** | **Medium**

Concentrated in:

| File | Count | Examples |
|------|-------|----------|
| `src/services/getDashboard.ts` | 12 | JSON/evidence shaping |
| `src/api/server.ts` | 5 | `safeJson` Decimal, `catch (e: any)`, Meta error body |
| `src/workers/runEngines.ts` | 2 | Engine payloads |
| Engines (analytics, knowledge, rules, health, intelligence) | 7 | Evidence JSON |

- **Risk:** Fragile runtime assumptions on Meta/Prisma/JSON shapes; refactors won't be caught by compiler.
- **Recommendation:** Introduce `MetaErrorBody`, `PrismaJsonValue`, zod schemas at API boundaries.

**Finding P1-05 — Unhandled promise policy: log-only** | **Medium**

`serve.ts` registers `unhandledRejection` logger but **does not exit**. Background `setImmediate` blocks use `void (async () => { ... })()` without top-level `.catch()` in some paths (relying on inner try/catch).

- **Location:** `src/api/serve.ts:40-48`, `src/api/server.ts:3298-3316`
- **Risk:** Silent partial failures if a non-awaited promise escapes inner try.
- **Recommendation:** Standardize `runBackground(name, fn)` wrapper with structured logging + metrics.

**Finding P1-06 — `process.env` reads outside `config.ts`** | **Medium**

Despite `config.ts` mandate, direct reads persist:

- `src/api/server.ts:267` — `ALLOWED_ORIGINS`
- `src/api/server.ts:1071-1074` — Stripe price, `PUBLIC_APP_URL`
- `src/services/claudeClient.ts:21` — `ANTHROPIC_API_KEY`
- `src/services/getDashboard.ts:347` — `DASHBOARD_STAGE_TIMEOUT_MS`
- `src/services/stripeClient.ts`, `adminGuard.ts`, `mockMeta.ts`, `whatsappLink.ts`

- **Recommendation:** Extend `AppConfig` with `billing`, `ai`, `cors`, `admin` sections; fail-fast in production.

**Finding P1-07 — Standalone Prisma pool in `getDashboard.ts`** | **High**

Module-level `_pool` + `_standalonePrisma` instantiated at import when `DATABASE_URL` is set.

- **Location:** `src/services/getDashboard.ts:46-68`
- **Impact:** CLI/scripts get a **second connection pool** (default max 10 connections each). Server correctly injects `opts.prisma`, but accidental import in hot path doubles pool pressure.
- **Recommendation:** Lazy-init standalone client; or require explicit `createDashboardService(prisma)`.

**Finding P1-08 — Positive: layer discipline** | **Strength**

- `metaClient.ts` — transport only
- `mappers/*` — Meta → normalized
- `repositories/*` — persistence contracts
- `engines/*` — downstream analytics (sync worker explicitly excludes these tables)
- `getDashboard.ts` — single product boundary DTO

This is **better than typical MVP** structure and should be preserved in refactors.

---

## Pillar 2 — Concurrency, Locking & Data Integrity

### 2.1 Advisory lock implementation

**Mechanism:** FNV-1a-style 32-bit hash → `pg_try_advisory_lock($1)` / `pg_advisory_unlock($1)`.

- **Location:** `src/lib/advisoryLock.ts:16-39`
- **Used by:**
  - Per-account sync: `syncAccount.ts:189-317` (`sync()`), `1041-1254` (`syncChunked()`)
  - Auto-sync pass: `serve.ts:224-234` (key `adlytic:auto-sync`)

**Finding P2-01 — Session locks + pooled connections (fundamental)** | **Critical**

Postgres advisory locks acquired via `pg_try_advisory_lock(bigint)` are **session-scoped**. Prisma `$queryRawUnsafe` runs on a connection from `pg.Pool` and **returns the connection to the pool** after the query completes — but the lock **remains on that backend session**.

During a long `syncChunked` loop (minutes), subsequent queries may use **different pooled connections**, while the lock sits on the original connection until `pg_advisory_unlock` runs **on that same connection**.

The code comments acknowledge this (`syncAccount.ts:1047-1060`). Mitigation in `syncChunked`:

```typescript
const [, lockRows] = await this.prisma.$transaction([
  this.prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock_all()`),
  this.prisma.$queryRawUnsafe(`SELECT pg_try_advisory_lock($1)`, lockId),
]);
```

**Problems:**

1. **`sync()` does NOT use `unlock_all` preflight** — auto-sync in `serve.ts:197` calls `worker.sync()`, not `syncChunked`. Crash mid-sync → stale lock → auto-sync silently skips account until connection recycled or manual intervention.

2. **`pg_advisory_unlock_all()` is dangerous** — releases **every** session advisory lock on that connection. If the same connection previously held `adlytic:auto-sync` coarse lock (unlikely but possible under pool reuse timing), it could release it early.

3. **No `pg_advisory_xact_lock`** anywhere in codebase (grep confirms zero hits). Transaction-scoped locks auto-release at COMMIT/ROLLBACK and are the **recommended** pattern for ORM pools — but they cannot span multi-minute chunk loops without holding a transaction open (bad for pool).

- **Severity:** Critical for ops reliability
- **Recommendation (priority order):**
  1. **Short term:** Apply same `unlock_all` + acquire transaction to `sync()` OR migrate auto-sync to `syncChunked` with a minimal window.
  2. **Medium term:** Dedicated `pg.Client` (non-pooled) for lock holder for duration of sync job.
  3. **Long term:** Replace DB locks with `SyncJob` row-level locking (`FOR UPDATE SKIP LOCKED`) — schema already has `SyncJob` status machine.

**Finding P2-02 — Advisory lock hash collision** | **Low**

32-bit FNV hash of `adAccountId` cuid → ~1/2³¹ collision probability between accounts. Unlikely at current scale but **not zero**.

- **Location:** `src/lib/advisoryLock.ts:16-22`
- **Recommendation:** Use `pg_advisory_lock(hashtext($1))` on full string or two-int64 `hashtextextended`.

**Finding P2-03 — SyncJob dedupe (Fix A) — good** | **Strength**

Active job reuse prevents duplicate jobs and misleading "already in progress" UX.

- **Location:** `src/api/server.ts:3234-3256`
- **Pairs with:** `f7b85af` commit

**Finding P2-04 — `$transaction` batch size unbounded** | **High**

`DailyStatsRepo.upsertMany` wraps **one upsert per row** in a single `$transaction`:

- **Location:** `src/repositories/dailyStatsRepo.ts:68-94`
- **Impact:** 180-day backfill × multiple entities can create transactions with **hundreds/thousands of statements** → Postgres `max_query_size`, memory, or Prisma timeout; increased deadlock probability with concurrent engine reads.
- **Recommendation:** Chunk transactions (e.g. 50-100 upserts each); use `createMany` + `ON CONFLICT` raw SQL for bulk paths.

**Finding P2-05 — Campaign reconcile transaction size** | **Medium**

`reconcileCampaignStatuses` builds `upserts` array for all campaigns + optional `updateMany` in one `$transaction`.

- **Location:** `src/workers/syncAccount.ts:448-483`
- **Impact:** Accounts with 500+ campaigns (Meta limit 200 per page but pagination exists in listCampaigns) could stress transaction.

**Finding P2-06 — No deadlock retry** | **Medium**

Prisma deadlocks (`40P01`) are not retried anywhere in sync or repos.

- **Recommendation:** Retry wrapper with exponential backoff on serialization/deadlock errors.

**Finding P2-07 — Crash lock release claim is partially true** | **Medium**

Comments state crash drops connection → Postgres releases session locks. **True only when the pool connection is actually torn down.** Idle pooled connections may **persist** on PgBouncer transaction mode or Railway proxy — verify pool mode. `pg_advisory_unlock_all` fix addresses symptom, not root cause.

**Finding P2-08 — Coarse auto-sync lock vs per-account lock interaction** | **Medium**

`serve.ts` holds `adlytic:auto-sync` for entire pass (token refresh + all accounts serially). Duration may exceed `SYNC_INTERVAL_MS` if many accounts — mitigated by recursive `setTimeout` (not `setInterval`).

- **Location:** `src/api/serve.ts:220-243`
- **Risk:** Second instance skips entire pass (good); first instance holds lock for hours if account count grows.

**Finding P2-09 — Positive: idempotent upserts** | **Strength**

`DailyStat` unique on `(entityType, entityId, date)` — re-sync converges. Raw insights append-only by design (audit trail) with 90-day prune.

---

## Pillar 3 — API Resilience & Meta Integrity

### 3.1 MetaClient transport layer

**Finding P3-01 — Retry policy** | **Medium (acceptable with gaps)**

- Retries: HTTP 429, 5xx, network errors — exponential backoff + jitter, max 5 retries
- **Location:** `src/services/metaClient.ts:212-238`
- **Does NOT retry:** Meta OAuthException code 17 (handled separately in sync worker)
- **Does NOT retry:** 4xx except 429 (correct — client errors)

**Finding P3-02 — Code 17 handling** | **Strength**

`withCode17Retry` sleeps 2s, retries once.

- **Location:** `src/workers/syncAccount.ts:148-158`
- Documented rationale: code 17 is per-ad-account, not IP-routable.

**Finding P3-03 — Pagination cap** | **Medium**

`maxPages = 500` with warning log if truncated.

- **Location:** `src/services/metaClient.ts:195-208`
- **Impact:** Large accounts may silently truncate insights history in edge cases.

**Finding P3-04 — Token lifecycle** | **High (managed)**

| Path | Behavior |
|------|----------|
| `refreshExpiringMetaTokens` | Re-exchange USER_OAUTH tokens within 7d of expiry |
| Expired | PAUSE + null token |
| Decrypt fail | PAUSE (keep ciphertext) |
| Meta 190 | `handleMeta190` — PAUSE legacy / NEEDS_REGRANT system user |
| System user | Skipped in refresh (non-expiring) |

- **Location:** `src/workers/refreshMetaTokens.ts`, `src/services/accountToken.ts:86-111`
- **Gap:** `tokenExpiresAt` query in refresh has **no index** (see Pillar 5).

**Finding P3-05 — Meta webhook signature verification** | **Strength**

| Check | Implementation |
|-------|----------------|
| Raw body | `c.req.raw.text()` before JSON parse |
| HMAC-SHA256 | `verifyMetaSignature` with `META_APP_SECRET` |
| Timing-safe compare | Length guard + `crypto.timingSafeEqual` |
| Async processing | `setImmediate` + 200 OK |
| Debounce | 5s per account, `timer.unref()` |

- **Location:** `src/services/metaWebhook.ts:53-65`, `src/api/server.ts:1196-1222`
- **Severity:** No Critical issues found in webhook auth path.

**Finding P3-06 — Meta webhook idempotency** | **Medium (accepted design)**

No per-delivery id — debounce coalescing only. At-least-once delivery may cause redundant reconciles.

- **Location:** `src/services/metaWebhook.ts:20-23`
- **Mitigation:** Reconcile is idempotent upsert; periodic auto-sync is safety net.

**Finding P3-07 — Meta webhook GET handshake** | **Low**

Simple string compare of verify token — adequate for subscription setup.

- **Location:** `src/api/server.ts:1169-1183`
- **Note:** `hub.challenge` returned as plain text — correct per Meta spec.

**Finding P3-08 — Stripe webhook** | **Strength**

Raw body, signature verify, transactional idempotency, 500 on handler crash (retry), 200 on business no-op.

- **Location:** `src/api/server.ts:1114-1161`, `src/services/subscriptionService.ts`

**Finding P3-09 — Error parsing inconsistency** | **Medium**

190 detection uses regex in some paths, typed `MetaApiError.body.error.code` in others:

- `serve.ts:203` — regex on error string
- `server.ts:3312` — `body?.error?.code === 190`
- **Recommendation:** Centralize `isMetaErrorCode(err, 190)` in `metaClient.ts`.

**Finding P3-10 — Invalid breakdown combination handling** | **Strength**

Non-fatal skip for OAuthException #100 on breakdown sync — prevents whole-job failure.

- **Location:** `src/workers/syncAccount.ts:123-136`

**Finding P3-11 — OAuth session in-memory** | **High**

Post-OAuth account picker session stored in `oauthSessions` Map — **lost on redeploy / wrong instance**.

- **Location:** `src/api/server.ts:186-195`, `2661+`
- **Contrast:** CSRF `state` correctly in `OAuthState` table.
- **Recommendation:** Persist session in Redis or DB with TTL; or return accounts inline in encrypted callback cookie.

**Finding P3-12 — META_APP_SECRET required for webhook but optional in config** | **Medium**

Webhook returns 403 if absent — correct fail-closed. No boot-time warn beyond missing secret at request time.

---

## Pillar 4 — UI/UX Robustness

### 4.1 Sync polling (commit `885f009` / `26858ed`)

**Finding P4-01 — Centralized `pollSyncJob` in SHARED_JS** | **Strength**

- Polls `GET /api/sync-jobs/:jobId` every 1.5s, max 180 attempts (~4.5 min)
- Progress bar uses `chunksDone/chunksTotal` with fallback to `progress` field
- **Location:** `src/web/layout.ts:721-741`, `813-831`

**Finding P4-02 — `runWorkspaceSync` + `resumeActiveSyncIfAny`** | **Strength**

- SessionStorage remembers active job id
- Handles `reused: true` from Fix A dedupe
- Disables sync buttons during poll
- **Location:** `src/web/layout.ts:849-912`

**Finding P4-03 — Dashboard onboarding duplicate poll** | **Low**

Local `pollSyncJob` in dashboardPage mirrors layout logic.

- **Location:** `src/web/pages/dashboardPage.ts:1800-1811`

**Finding P4-04 — Status enum mismatch in resume check** | **Medium**

`resumeActiveSyncIfAny` checks for `RUNNING` / `IN_PROGRESS` but schema enum is `PENDING | PROCESSING | COMPLETED | FAILED`.

- **Location:** `src/web/layout.ts:892`
- **Impact:** Harmless (dead branches) but signals copy-paste from another system; could mask future enum additions.

**Finding P4-05 — Null-safe rendering** | **Strength (post-885f009)**

- `applyDashboardData`: `Array.isArray` guards, `safeRender` per section
- **Location:** `src/web/pages/dashboardPage.ts:1852-1905`
- `buildKpisFromInsights` fallback when `dashData.kpis` empty
- Loading safety timeout 5s — `startLoadingSafetyTimeout`

**Finding P4-06 — Token decrypt banner** | **Strength**

- Probes `/api/workspaces/:id/token-health` on shell init
- Shows reconnect CTA; dismiss per workspace in sessionStorage
- **Location:** `src/web/layout.ts:1022-1088`, `src/services/checkWorkspaceTokenHealth.ts`

**Finding P4-07 — Token health checks primary account only** | **Medium (intentional)**

Only oldest account by `createdAt asc` — matches comment about orphan rows.

- **Location:** `src/services/checkWorkspaceTokenHealth.ts:38-52`
- **Gap:** If primary account has no token but secondary does, banner won't show.

**Finding P4-07b — `checkWorkspaceTokenHealth` uncommitted local changes** | **Info**

Git status shows modified `checkWorkspaceTokenHealth.ts` — audit reflects primary-account probe aligned with `getAccount` intent.

**Finding P4-08 — CDN / Meta thumbnail fallback** | **Strength**

- Real `<img>` with `onerror="creativeImgFailed(this)"`, emoji fallback, shimmer placeholder
- `referrerpolicy="no-referrer"` for CDN URLs
- **Location:** `src/web/pages/campaignsPage.ts:744-752`, `src/web/layout.ts:765-779`

**Finding P4-09 — Meta payload edge cases in UI** | **Medium**

- Breakdown Arabic maps with raw fallback for unknown Meta enum values — good
- **Location:** `src/web/pages/campaignsPage.ts:791+`
- Creative copy: `headline || primaryText || description` — empty shows em-dash
- **Gap:** Missing `object_story_spec` video thumbnail extraction when `thumbnail_url` absent — dashboard may show emoji for video ads frequently.

**Finding P4-10 — `friendlyApiError` mapping** | **Strength**

Maps decrypt, timeout, non-JSON, in-progress, permission errors to user Arabic/English messages.

- **Location:** `src/web/layout.ts:743-763`

**Finding P4-11 — Dashboard refresh interval** | **Low**

`setInterval(refreshDashboard, REFRESH_MS)` paused on `visibilitychange` — good battery/network citizenship.

- **Location:** `src/web/pages/dashboardPage.ts:1687-1700`

**Finding P4-12 — Chart.js CDN dependency** | **Medium**

CSP allows `cdn.jsdelivr.net` for scripts. Offline CDN → charts broken, core KPIs still render.

- **Location:** `src/api/server.ts:299-300`

---

## Pillar 5 — Security & Performance

### 5.1 Security

**Finding P5-01 — JWT + tokenVersion revocation** | **Strength**

DB check on every authenticated request via `getUserId`.

- **Location:** `src/api/server.ts:364-373`, `src/services/jwtAuth.ts`

**Finding P5-02 — CORS defaults permissive in dev** | **High (if misconfigured prod)**

When `ALLOWED_ORIGINS` empty → `origin: '*' ` with `credentials: true` — browsers may restrict, but misconfiguration risk.

- **Location:** `src/api/server.ts:267-279`
- **Recommendation:** Production must set `ALLOWED_ORIGINS`; add config.ts fail-fast.

**Finding P5-03 — CSP allows unsafe-inline scripts** | **Medium (inherent to architecture)**

All page JS is inline. XSS in any unescaped user content is critical.

- **Location:** `src/api/server.ts:297-308`
- **Mitigation:** Pages use `escHtml` helpers — spot-check needed on AI chat rendering.

**Finding P5-04 — TLS verification disabled for external DB** | **High**

`ssl: { rejectUnauthorized: false }` for non-`.railway.internal` hosts.

- **Location:** `src/api/serve.ts:67-74`, `getDashboard.ts:66`
- **Impact:** MITM on DATABASE_URL connection in hostile network.
- **Recommendation:** Railway/Supabase CA pinning or `sslmode=verify-full` with proper CA.

**Finding P5-05 — Rate limiting in-memory only** | **Medium**

Login 10/15min, register 5/hour per IP — not shared across instances.

- **Location:** `src/api/server.ts:144-163`

**Finding P5-06 — Platform admin via env email list** | **Medium**

`PLATFORM_ADMIN_EMAILS` — acceptable for Phase 1; no RBAC audit trail beyond PaymentEvent.

**Finding P5-07 — Token encryption** | **Strength**

AES-256-GCM, random IV, auth tag, fingerprint logging, distinct error type.

- **Location:** `src/services/tokenEncryption.ts`

**Finding P5-08 — AI context sanitization** | **Medium**

`dataSanitizer.ts` exists (test file present) — LLM paths should be verified to always sanitize; out of scope for line-by-line proof but **required for prod**.

### 5.2 Performance & indexes

**Finding P5-09 — Missing index: `AdAccount.lastSyncedAt`** | **High**

Auto-sync queries filter `status: ACTIVE` + token conditions but **no index on `lastSyncedAt`** for stale-account prioritization or monitoring queries.

- **Schema:** `prisma/schema.prisma:94` — only `@@index([workspaceId])`
- **Recommendation:** `@@index([status, lastSyncedAt])` or partial index on ACTIVE.

**Finding P5-10 — Missing index: `AdAccount.tokenExpiresAt`** | **High**

Token refresh worker queries:

```typescript
tokenExpiresAt: { not: null, lte: now }
```

No index → sequential scan as account table grows.

- **Location:** `src/workers/refreshMetaTokens.ts:74-97`
- **Recommendation:** `@@index([tokenSource, status, tokenExpiresAt])`

**Finding P5-11 — Missing index: Meta external IDs for webhook lookup** | **Medium**

`findAdAccount` uses `externalAccountId: { in: candidates }` — unique constraint `(platform, externalAccountId)` exists → **OK**.

**Finding P5-12 — SyncJob polling index** | **Strength**

`@@index([adAccountId, status])` supports Fix A lookup.

- **Schema:** `prisma/schema.prisma:810`

**Finding P5-13 — Raw insights growth** | **Medium**

Append-only until daily prune (90d default). High-frequency sync × many accounts → table bloat between prunes.

- **Location:** `src/api/serve.ts:249-261`
- **Recommendation:** Partial index on `fetchedAt` for prune query; consider partitioning.

**Finding P5-14 — Connection pool defaults** | **Medium**

`pg.Pool()` default `max: 10` — not explicitly configured.

- **Location:** `src/api/serve.ts:68-75`
- **Impact:** 10 concurrent long syncs + HTTP traffic → pool exhaustion / queue latency.
- **Recommendation:** Set `max`, `idleTimeoutMillis`, monitor `pg.pool.totalCount`.

**Finding P5-15 — getDashboard stage timeout** | **Strength**

9s default per stage via `DASHBOARD_STAGE_TIMEOUT_MS` — prevents hung dashboard.

- **Location:** `src/services/getDashboard.ts:347+`

**Finding P5-16 — Memory: interval timers** | **Low**

- `setInterval` for daily maintenance never cleared on shutdown (process exit OK)
- Meta webhook `pendingReconciles` Map — timers `unref()`'d — good
- OAuth prune only on access — **no periodic prune timer** for `oauthSessions` except on OAuth routes

**Finding P5-17 — Platform stats cache** | **Low**

In-memory cache in `getPlatformStats.ts` — per-instance inconsistency.

---

## Cross-Cutting Observations

### Environment variables inventory (production-critical)

| Variable | Validated in config.ts | Required prod |
|----------|---------------------|---------------|
| `DATABASE_URL` | Yes (fail) | Yes |
| `JWT_SECRET` | Yes (fail, min 32) | Yes |
| `TOKEN_ENCRYPTION_KEY` | Yes (fail, 64 hex) | Yes |
| `META_APP_ID/SECRET` | Optional | Yes for OAuth/webhooks |
| `META_VERIFY_TOKEN` | Optional | Yes for webhook subscribe |
| `ALLOWED_ORIGINS` | **No** | Yes |
| `STRIPE_*` | Partial (runtime) | If billing enabled |
| `ANTHROPIC_API_KEY` | **No** | If AI enabled |
| `PUBLIC_APP_URL` | **No** | Yes for Stripe redirects |

### Test coverage vs production paths

Test scripts (`test_worker.ts`, `test_health.ts`, etc.) cover logic modules but **no automated integration test** for:

- Advisory lock + pool interaction
- Webhook HMAC verification
- SyncJob full lifecycle
- OAuth state DB roundtrip

### Workers not extracted

`runNarrationWorker.ts`, `brainNarrationCron.ts`, `rollupHistory.ts` exist as separate entry points but core sync runs **in API process** — scaling concern.

---

## Prioritized Recommendations

### P0 — Before multi-instance / paid SLA

| # | Action | Pillar | Effort |
|---|--------|--------|--------|
| R1 | Fix advisory lock strategy: dedicated non-pooled client OR migrate auto-sync to `syncChunked` + apply unlock preflight to `sync()` | P2 | M |
| R2 | Persist OAuth post-callback session (replace `oauthSessions` Map) | P3 | M |
| R3 | Add indexes: `(tokenSource, status, tokenExpiresAt)`, `(status, lastSyncedAt)` on `ad_accounts` | P5 | S |
| R4 | Configure `pg.Pool` max + timeouts; document total DB connection budget | P5 | S |
| R5 | Set `ALLOWED_ORIGINS` + config.ts fail-fast in production | P5 | S |

### P1 — Next quarter

| # | Action | Pillar | Effort |
|---|--------|--------|--------|
| R6 | Extract sync/engine work to job queue (BullMQ, pg-boss, or Railway worker service) | P1/P2 | L |
| R7 | Chunk `$transaction` in `DailyStatsRepo.upsertMany` | P2 | S |
| R8 | Split `server.ts` into route modules | P1 | M |
| R9 | Centralize Meta error code helpers | P3 | S |
| R10 | Align `getAccount()` with primary account selection + document multi-account roadmap | P1 | S |

### P2 — Quality / debt

| # | Action | Pillar | Effort |
|---|--------|--------|--------|
| R11 | Reduce `any` usage with typed Meta/JSON interfaces | P1 | M |
| R12 | Deduplicate dashboard `pollSyncJob` → use SHARED_JS | P4 | S |
| R13 | TLS verify-full for DATABASE_URL | P5 | S |
| R14 | Integration tests for webhooks + SyncJob lifecycle | All | M |
| R15 | Vendor Chart.js or self-host CDN script | P4/P5 | S |

**Effort key:** S = small (hours), M = medium (days), L = large (week+)

---

## Master-Level Verdict — Biggest Risks

### Top 3 Critical / High Headlines

1. **Session advisory locks on pooled Prisma connections** — Can cause false "sync already in progress," skipped auto-syncs, and stuck SyncJobs after deploy/OOM; `syncChunked` mitigation incomplete for `sync()` auto-sync path.

2. **Single-process background workload coupling** — Sync, engines, brain, webhooks, and HTTP share one event loop and DB pool; no queue isolation under load.

3. **Multi-instance statefulness** — In-memory OAuth sessions, rate limits, and caches break horizontal scaling; CSRF state fix proves team knows the pattern but hasn't finished applying it everywhere.

### Architectural maturity scorecard

| Area | Grade | Notes |
|------|-------|-------|
| Domain layering | A- | Clear Meta/DTO/engine separation |
| Data integrity (ETL) | B+ | Idempotent upserts; transaction sizes risk |
| Concurrency | C | Advisory locks + pool = fragile |
| API security (webhooks) | A- | Meta + Stripe correctly verified |
| UI resilience | B+ | Strong post-885f009; minor duplication |
| Ops readiness | C+ | Config centralization good; indexes/logging gaps |
| Scale readiness | D+ | Single-instance assumptions predominate |

### Final statement

Adlytic demonstrates **above-average engineering discipline for an ads analytics MVP** — particularly Meta integration boundaries, sync UX honesty (real polling vs fake "sync started" toasts), and webhook security parity with Stripe. The codebase is **not reckless**; recent commits show responsive hardening.

The gap between **"works on Railway single dyno"** and **"production-grade multi-tenant SaaS"** is concentrated in **job orchestration** and **Postgres locking semantics**, not in UI polish or Meta API parsing. Address R1–R5 before marketing uptime SLAs or running ≥2 replicas.

---

## Appendix A — Key file reference map

| File | Role |
|------|------|
| `src/api/serve.ts` | Process entry, pool, auto-sync loop, maintenance |
| `src/api/server.ts` | Hono routes (57), OAuth, sync API, webhooks |
| `src/workers/syncAccount.ts` | ETL orchestrator, advisory locks, SyncJob driver |
| `src/services/metaClient.ts` | Meta Graph transport + retry |
| `src/services/metaWebhook.ts` | HMAC verify + debounced reconcile |
| `src/lib/advisoryLock.ts` | FNV hash + try/unlock helpers |
| `src/web/layout.ts` | SHARED_JS: apiFetch, pollSyncJob, sync UI |
| `src/web/pages/dashboardPage.ts` | Dashboard SSR + onboarding poll |
| `src/services/checkWorkspaceTokenHealth.ts` | Token decrypt probe |
| `src/config.ts` | Env validation + boot checklist |
| `prisma/schema.prisma` | 30+ models, SyncJob, MetaConnection |

## Appendix B — SyncJob state machine

```
PENDING → PROCESSING → COMPLETED
                    ↘ FAILED
```

Progress fields updated during `syncChunked`: `chunksTotal`, `chunksDone`, `progress`, `cursorDate`, `rowsFetched`, `rowsUpserted`.

## Appendix C — Audit tooling

- PDF generation: `npx tsx scripts/compileMasterAuditPdf.ts`
- Output: `Adlytic_Master_Software_Audit.pdf`

---

*End of ADLYTIC_MASTER_ARCHITECT_AUDIT_2026*

---

## PART B: SECOND AUDIT (V2 — AFTER feat/horizontal-scaling)

# ADLYTIC_MASTER_ARCHITECT_AUDIT_2026 — Second Pass

**Document type:** Production-grade master architecture audit (second pass)  
**Repository:** `/Users/aliahhed/Downloads/adlytic`  
**Branch audited:** `feat/horizontal-scaling`  
**Audit date:** 2026-06-30  
**Baseline comparison:** First pass `ADLYTIC_MASTER_ARCHITECT_AUDIT_2026.md` (commit `05752ef`)  
**Stack reality:** Hono + `@hono/node-server`, Prisma 7 + PostgreSQL (`@prisma/adapter-pg` + `pg.Pool`), server-rendered TypeScript HTML pages (`layout.ts`, `*Page.ts`), inline `SHARED_JS`, background workers in-process (`serve.ts`) with optional BullMQ (`src/lib/queue.ts`), Meta Graph API client, Stripe billing, Claude AI layer, optional Redis (`src/lib/redis.ts`)  
**NOT Next.js** — no React SSR, no App Router, no Vercel edge functions  

**Scope:** Full codebase review across five pillars. Delta focus: commits `64f080e` → `32cd337` on `feat/horizontal-scaling` (Redis substrate, Redis debounce/token-health cache, BullMQ Phase 3-a, cross-workspace hijack guard, queue-stats CLI, Redis scaling drill).

**Commits reviewed through:** `32cd337` (queue stats CLI), `e6ef331` (BullMQ + R-1 hijack fix + drill), `25aafa0` (Redis debounce + token-health cache), `64f080e` (Redis substrate), plus inherited baseline through `885f009` / `f7b85af` / `26858ed`.

---

## Executive Summary

Since the first pass (`05752ef`), the team shipped a **horizontal-scaling infrastructure layer** on `feat/horizontal-scaling`: optional Redis (`src/lib/redis.ts`), feature-flagged BullMQ queues (`BULLMQ_ENABLED`, default `false`), Redis-backed Meta webhook debounce (`WEBHOOK_REDIS_DEBOUNCE_ENABLED`, default `false`), read-through token-health cache (`cachedTokenHealth.ts`), and a cross-workspace AdAccount hijack guard (`findExistingAdAccountForWorkspace` → 409 `AD_ACCOUNT_ALREADY_LINKED_ELSEWHERE`).

**Defaults preserve first-pass behavior.** With flags off and `REDIS_URL` unset, the API path matches the pre-scaling codebase: in-process `setImmediate`, in-memory OAuth sessions, in-memory rate limits, and auto-sync calling `worker.sync()` directly.

**Three production-critical structural risks from the first pass remain materially unchanged:**

1. **Session-scoped Postgres advisory locks + Prisma connection pooling** — `syncChunked` retains the `pg_advisory_unlock_all()` preflight (`f7b85af` / Fix C-1). **`sync()` (auto-sync path in `serve.ts:204`) still acquires locks without that preflight.** Auto-sync was not migrated to `syncChunked` or BullMQ.

2. **Background workload coupling** — BullMQ exists but is **opt-in** and **Phase 3-a co-locates workers with HTTP in the same Node process** (`serve.ts:96`, `workers/queue/index.ts:7-11`). Auto-sync, token refresh, raw-insight pruning, rollup refresh, and (when flags off) webhook reconciles still share one event loop and one Prisma pool. Enabling BullMQ adds up to **12 concurrent queue jobs** (2+2+4+4) on the same process.

3. **Multi-instance deployment gaps** — Post-callback OAuth sessions remain **in-memory** (`oauthSessions` Map, `server.ts:189`). Rate-limit maps, platform-stats cache, and coarse auto-sync lock remain per-process. Redis debounce and token-health cache reduce *some* split-brain symptoms when `REDIS_URL` is set, but webhook reconcile winners still fire via **in-process `setTimeout`** (`metaWebhook.ts:190-191`), and OAuth completion still requires sticky sessions or single replica.

**Positive deltas since first pass:**

- Cross-workspace Meta ad account hijack on reconnect is now **explicit 409** instead of silent `workspaceId` overwrite (`server.ts:404-427`, three connect sites guarded).
- BullMQ `enqueueOrFallback` pattern ensures **no work loss** when Redis/queue fails — falls back to original `setImmediate` bodies (`queue.ts:201-217`).
- Meta webhook POST can enqueue payload durably when `BULLMQ_ENABLED=true` (`server.ts:1214-1223`).
- Token-health probe uses 60s Redis read-through cache when Redis is available (`cachedTokenHealth.ts`, wired at `server.ts:1328`).
- Graceful SIGTERM drains BullMQ workers before disconnect (`serve.ts:297-305`).
- Phase 6a workspace-isolation audit documented in `WORKSPACE_ISOLATION_CHECKLIST.md`; R-1 remediated in `e6ef331`.

**Overall verdict:** **Shippable for early production / controlled beta on a single Railway instance** — unchanged from first pass. The horizontal-scaling branch adds **foundation code behind feature flags** but does not, at default configuration, resolve the first pass's P0 items (R1–R5). Enabling flags without addressing advisory-lock semantics on the auto-sync path and OAuth session persistence leaves multi-replica deploys partially hardened at best.

---

## Audit Methodology

| Step | Action |
|------|--------|
| 1 | Re-read first pass findings R1–R15 and pillar items P1-01–P5-17 |
| 2 | `git log 05752ef..HEAD` and `git diff 05752ef..HEAD --stat` on `feat/horizontal-scaling` |
| 3 | Trace new paths: Redis `withRedis`, BullMQ `enqueueOrFallback`, `kickoffInitialSync`, `findExistingAdAccountForWorkspace` |
| 4 | Re-verify unchanged critical paths: `sync()` vs `syncChunked`, `serve.ts` auto-sync, `oauthSessions`, Prisma indexes |
| 5 | Cross-reference `WORKSPACE_ISOLATION_CHECKLIST.md` (Phase 6a) |
| 6 | Count `: any` / `as any` in `src/` (**31 occurrences**, unchanged) |

Severity scale: identical to first pass (Critical / High / Medium / Low).

---

## Pillar 1 — Architectural Patterns & Code Quality

### 1.1 System topology (as-built, second pass)

```
Browser ──► Hono (server.ts) ──► Prisma/pg.Pool ──► PostgreSQL
                │                      ▲
                │                      │
                ├── SSR pages (*Page.ts + layout.ts SHARED_JS)
                ├── REST /api/*
                ├── [optional] Redis singleton (lib/redis.ts)
                ├── [optional] BullMQ dedicated ioredis (lib/queue.ts)
                └── background (flag-dependent):
                        setImmediate OR BullMQ workers (in-process, serve.ts:96)
                        syncChunked / sync / runEngines / runBrainOrchestrator
                        processMetaWebhookEvent (debounced)
                        kickoffInitialSync (lib/initialSync.ts)

serve.ts
    ├── Recursive setTimeout auto-sync loop (6h) — still calls worker.sync()
    ├── refreshExpiringMetaTokens, prune, rollups (unchanged)
    ├── Coarse advisory lock: adlytic:auto-sync
    └── bootQueueWorkers() when BULLMQ_ENABLED=true
```

**Finding P1-01 — Monolithic route file (worsened)** | **Medium**

`src/api/server.ts` grew from **~3,392 lines (V1)** to **~3,486 lines**. OAuth hijack guard and BullMQ enqueue wiring added net complexity despite extracting `kickoffInitialSync` to `lib/initialSync.ts`.

- **Location:** `src/api/server.ts:1-3486`
- **Delta:** +94 lines; route count unchanged structurally; no sub-app split.

**Finding P1-02 — Page/API boundary duplicate poll logic** | **Low** | **Not fixed**

Onboarding in `dashboardPage.ts` still defines a local `pollSyncJob` (lines 1800-1811) instead of exclusively using `window.pollSyncJob`.

- **Location:** `src/web/pages/dashboardPage.ts:1800-1811` vs `src/web/layout.ts:729-741`, `1168`

**Finding P1-03 — `getAccount()` assumes single ad account per workspace** | **High** | **Not fixed**

```typescript
const account = ws.adAccounts[0] ?? null;
```

- **Location:** `src/api/server.ts:462-467`
- **Impact:** Unchanged from V1; insertion-order dependent primary account.

**Finding P1-04 — TypeScript `any` usage (31 hits)** | **Medium** | **Not fixed**

Count unchanged. Same concentration in `getDashboard.ts` (12), `server.ts` (5), engines.

**Finding P1-05 — Unhandled promise policy: log-only** | **Medium** | **Not fixed**

`serve.ts:42-48` unchanged. BullMQ worker `error`/`failed` handlers log only (`workers/queue/index.ts:96-102`).

**Finding P1-06 — `process.env` reads outside `config.ts`** | **Medium** | **Partially addressed**

`config.ts` now centralizes Redis URL and feature flags (`REDIS_URL`, `BULLMQ_ENABLED`, `WEBHOOK_REDIS_DEBOUNCE_ENABLED`). Direct reads persist for:

- `server.ts:270` — `ALLOWED_ORIGINS`
- `server.ts:1065-1068` — Stripe price, `PUBLIC_APP_URL`
- `getDashboard.ts:51,347`, `claudeClient.ts:21`, `stripeClient.ts`, `adminGuard.ts`, `mockMeta.ts`, `whatsappLink.ts`, `runNarrationWorker.ts`

**Finding P1-07 — Standalone Prisma pool in `getDashboard.ts`** | **High** | **Not fixed**

Module-level `_pool` at `getDashboard.ts:60-68` unchanged.

**Finding P1-08 — Positive: layer discipline** | **Strength** | **Preserved**

Meta transport, mappers, repos, engines, dashboard DTO boundary intact.

**Finding P1-09 — NEW: Horizontal-scaling code behind default-off flags** | **Info**

Infrastructure exists (`redis.ts`, `queue.ts`, four queue processors, drill script) but **production-default behavior equals V1**:

| Flag | Default | Effect when off |
|------|---------|-----------------|
| `REDIS_URL` | unset | All Redis paths fall back in-process |
| `BULLMQ_ENABLED` | `false` | No workers; all `enqueueOrFallback` → `setImmediate` |
| `WEBHOOK_REDIS_DEBOUNCE_ENABLED` | `false` | Map-based debounce only |

- **Location:** `config.ts:230-255`, `queue.ts:170-174`

**Finding P1-10 — NEW: Cross-workspace AdAccount hijack guard** | **Strength (fix)**

`findExistingAdAccountForWorkspace` returns `{ kind: 'conflict' }` → 409 `AD_ACCOUNT_ALREADY_LINKED_ELSEWHERE`. Owned-row updates **omit `workspaceId`** to prevent silent transfer.

- **Location:** `server.ts:404-427`, guarded at lines 2725-2727, 2848-2850, 3048-3050
- **Origin:** Phase 6a finding R-1, shipped in `e6ef331`

---

## Pillar 2 — Concurrency, Locking & Data Integrity

### 2.1 Advisory lock implementation

**Finding P2-01 — Session locks + pooled connections (fundamental)** | **Critical** | **Not fixed for auto-sync path**

| Path | `unlock_all` preflight | Status |
|------|------------------------|--------|
| `syncChunked()` | Yes (`syncAccount.ts:1061-1067`) | Unchanged from V1 |
| `sync()` | **No** (`syncAccount.ts:193-195`) | **Still missing** |
| Auto-sync (`serve.ts:204`) | Uses `sync()` | **Still vulnerable** |

Additional facts:

- `pg_advisory_unlock_all()` blunt-instrument risk unchanged.
- Zero `pg_advisory_xact_lock` usage (grep confirms).
- No dedicated non-pooled `pg.Client` for lock holder.
- No `SyncJob` row-level `FOR UPDATE SKIP LOCKED` locking.

**Finding P2-02 — Advisory lock hash collision** | **Low** | **Not fixed**

32-bit FNV in `advisoryLock.ts:16-22` unchanged.

**Finding P2-03 — SyncJob dedupe (Fix A)** | **Strength** | **Preserved**

Active job reuse at `server.ts` sync route unchanged.

**Finding P2-04 — `$transaction` batch size unbounded** | **High** | **Not fixed**

`DailyStatsRepo.upsertMany` still wraps all rows in one transaction (`dailyStatsRepo.ts:68-94`).

**Finding P2-05 — Campaign reconcile transaction size** | **Medium** | **Not fixed**

`reconcileCampaignStatuses` single `$transaction` unchanged.

**Finding P2-06 — No deadlock retry** | **Medium** | **Not fixed**

No `40P01` retry wrapper added.

**Finding P2-07 — Crash lock release claim partially true** | **Medium** | **Unchanged**

Pool/PgBouncer caveats remain; `unlock_all` mitigates `syncChunked` symptom only.

**Finding P2-08 — Coarse auto-sync lock duration** | **Medium** | **Unchanged**

`adlytic:auto-sync` held for full pass including all accounts serially (`serve.ts:231-241`).

**Finding P2-09 — Positive: idempotent upserts** | **Strength** | **Preserved**

**Finding P2-10 — NEW: BullMQ co-located with API (Phase 3-a)** | **High (when enabled)**

When `BULLMQ_ENABLED=true`, workers boot **inside the API process** (`serve.ts:92-96`). Concurrency: sync-account×2, maintenance×4, engines-and-brain×2, reconcile-campaigns×4 = **up to 12 parallel jobs** sharing the same Prisma pool (default max 10) and event loop.

- **Location:** `workers/queue/index.ts:32-37,65-91`
- **Note:** Auto-sync loop is **not** enqueued to BullMQ; only user-triggered / webhook / initial-sync paths use `enqueueOrFallback`.

**Finding P2-11 — NEW: `reconcile-campaigns-v1` queue scaffolded but unused** | **Medium**

Processor exists (`reconcileCampaignsProcessor.ts`) and worker boots, but **no producer** calls `queues.reconcileCampaigns.add`. Webhook reconcile still uses `setTimeout` (`metaWebhook.ts:190-211`).

---

## Pillar 3 — API Resilience & Meta Integrity

**Finding P3-01 — Retry policy** | **Medium** | **Unchanged**

`metaClient.ts:212-238` unchanged.

**Finding P3-02 — Code 17 handling** | **Strength** | **Preserved**

**Finding P3-03 — Pagination cap (500 pages)** | **Medium** | **Unchanged**

**Finding P3-04 — Token lifecycle** | **High (managed)** | **Unchanged**

Token refresh query still lacks index on `tokenExpiresAt` (see P5-10).

**Finding P3-05 — Meta webhook signature verification** | **Strength** | **Preserved**

**Finding P3-06 — Meta webhook idempotency (debounce only)** | **Medium** | **Partially addressed**

Redis path adds cluster-wide first-wins debounce via `SET NX EX` when `WEBHOOK_REDIS_DEBOUNCE_ENABLED=true` and Redis healthy (`metaWebhook.ts:173-196`). Limitations documented in code:

- Winner still schedules reconcile via **in-process `setTimeout`** — lost if that process dies before fire (`metaWebhook.ts:165-170`).
- Flag defaults **off**; without Redis, behavior identical to V1 Map debounce.

When `BULLMQ_ENABLED=true`, webhook payload enqueued to maintenance queue (`server.ts:1214-1215`) — durable receipt, but reconcile scheduling inside `processMetaWebhookEvent` still debounces via setTimeout/Redis, not BullMQ delayed jobs.

**Finding P3-07 — Meta webhook GET handshake** | **Low** | **Unchanged**

**Finding P3-08 — Stripe webhook** | **Strength** | **Preserved**

**Finding P3-09 — Error parsing inconsistency (190 detection)** | **Medium** | **Not fixed**

Regex in `serve.ts:210,218-219`; typed check in queue processor `syncAccountProcessor.ts:114-116`. No centralized `isMetaErrorCode`.

**Finding P3-10 — Invalid breakdown combination handling** | **Strength** | **Preserved**

**Finding P3-11 — OAuth session in-memory** | **High** | **Not fixed**

`oauthSessions` Map at `server.ts:189` with 30-minute TTL prune unchanged. CSRF `OAuthState` remains DB-backed contrast.

**Finding P3-12 — META_APP_SECRET optional in config** | **Medium** | **Unchanged**

**Finding P3-13 — NEW: Token-health cache without reconnect invalidation** | **Medium**

`getCachedWorkspaceTokenHealth` caches 60s (`cachedTokenHealth.ts:38,75-77`). `invalidateCachedTokenHealth` is **defined but never called** from OAuth reconnect, token rotation, or Meta 190 handlers (grep: only definition in `cachedTokenHealth.ts`). After successful reconnect, banner may show stale decrypt-failure state for up to 60s when Redis is up.

---

## Pillar 4 — UI/UX Robustness

Commit `885f009` UI resilience items were in the first-pass baseline; **no UI file changes** in `05752ef..HEAD` diff.

**Finding P4-01 — Centralized `pollSyncJob` in SHARED_JS** | **Strength** | **Preserved**

**Finding P4-02 — `runWorkspaceSync` + `resumeActiveSyncIfAny`** | **Strength** | **Preserved**

**Finding P4-03 — Dashboard onboarding duplicate poll** | **Low** | **Not fixed**

Local `pollSyncJob` in `dashboardPage.ts:1800-1811`.

**Finding P4-04 — Status enum mismatch (`RUNNING` / `IN_PROGRESS`)** | **Medium** | **Not fixed**

`layout.ts:892` and `dashboardPage.ts:1788` still check non-schema statuses alongside `PENDING`/`PROCESSING`.

**Finding P4-05 — Null-safe rendering (post-885f009)** | **Strength** | **Preserved**

**Finding P4-06 — Token decrypt banner** | **Strength** | **Preserved**

Now hits cached endpoint (`server.ts:1328` → `getCachedWorkspaceTokenHealth`).

**Finding P4-07 — Token health checks primary account only** | **Medium** | **Unchanged**

**Finding P4-08 — CDN / Meta thumbnail fallback** | **Strength** | **Preserved**

**Finding P4-09 — Meta payload edge cases in UI** | **Medium** | **Unchanged**

Video thumbnail gap when `thumbnail_url` absent.

**Finding P4-10 — `friendlyApiError` mapping** | **Strength** | **Preserved**

**Finding P4-11 — Dashboard refresh interval + visibility pause** | **Low** | **Preserved**

**Finding P4-12 — Chart.js CDN dependency** | **Medium** | **Unchanged**

---

## Pillar 5 — Security & Performance

### 5.1 Security

**Finding P5-01 — JWT + tokenVersion revocation** | **Strength** | **Preserved**

**Finding P5-02 — CORS defaults permissive when `ALLOWED_ORIGINS` empty** | **High** | **Not fixed**

`server.ts:270` still reads env directly; no production fail-fast in `config.ts`.

**Finding P5-03 — CSP allows unsafe-inline scripts** | **Medium** | **Unchanged**

**Finding P5-04 — TLS verification disabled for external DB** | **High** | **Not fixed**

`serve.ts:68`, `getDashboard.ts:66` — `rejectUnauthorized: false` unchanged.

**Finding P5-05 — Rate limiting in-memory only** | **Medium** | **Not fixed**

Comment at `server.ts:145` explicitly states single-instance.

**Finding P5-06 — Platform admin via env email list** | **Medium** | **Unchanged**

**Finding P5-07 — Token encryption AES-256-GCM** | **Strength** | **Preserved**

**Finding P5-08 — AI context sanitization** | **Medium** | **Unchanged**

### 5.2 Performance & indexes

**Finding P5-09 — Missing index: `AdAccount.lastSyncedAt`** | **High** | **Not fixed**

Schema still only `@@index([workspaceId])` on `ad_accounts`; no migration since V1.

**Finding P5-10 — Missing index: `AdAccount.tokenExpiresAt`** | **High** | **Not fixed**

`refreshMetaTokens.ts` query unchanged; no composite index added.

**Finding P5-11 — Meta external IDs for webhook lookup** | **Medium** | **OK (unchanged)**

Unique `(platform, externalAccountId)` sufficient.

**Finding P5-12 — SyncJob polling index** | **Strength** | **Preserved**

**Finding P5-13 — Raw insights growth** | **Medium** | **Unchanged**

No partial index on `fetchedAt` for prune query.

**Finding P5-14 — Connection pool defaults (max 10 implicit)** | **Medium** | **Not fixed**

`serve.ts:69-76` — no `max`, `idleTimeoutMillis` configured. BullMQ concurrency (12) can exceed pool default when enabled.

**Finding P5-15 — getDashboard stage timeout** | **Strength** | **Preserved**

**Finding P5-16 — Memory: interval timers / OAuth session prune** | **Low** | **Unchanged**

**Finding P5-17 — Platform stats cache per-instance** | **Low** | **Unchanged**

**Finding P5-18 — NEW: Dual Redis TCP connections when BullMQ enabled** | **Low**

App singleton (`lib/redis.ts`) plus BullMQ dedicated client (`lib/queue.ts:81-92`) — intentional per BullMQ ioredis requirements; doubles connection count to managed Redis.

---

## Cross-Cutting Observations

### Environment variables (delta)

| Variable | In config.ts (V2) | Default | Notes |
|----------|-------------------|---------|-------|
| `REDIS_URL` | Yes (warn if unset) | unset | Gates Redis features |
| `BULLMQ_ENABLED` | Yes | `false` | Queue routing |
| `WEBHOOK_REDIS_DEBOUNCE_ENABLED` | Yes | `false` | Cluster debounce |
| `ALLOWED_ORIGINS` | **No** | — | Still direct `process.env` in server |
| `STRIPE_*`, `ANTHROPIC_API_KEY`, `PUBLIC_APP_URL` | Partial / No | — | Unchanged from V1 |

### Test / ops tooling (delta)

| Artifact | Purpose |
|----------|---------|
| `scripts/test-redis-scaling-drill.ts` | D1–D5 Redis fallback/latency drills (`e6ef331`) |
| `scripts/queue-stats.ts` | Live BullMQ queue stats CLI (`32cd337`) |
| `WORKSPACE_ISOLATION_CHECKLIST.md` | Phase 6a tenant-boundary audit |

Still **no automated integration tests** for advisory locks, webhook HMAC, SyncJob lifecycle, or OAuth DB roundtrip.

### Workers extraction status

BullMQ Phase 3-a runs workers **in API process**. Separate worker dyno (`Phase 3-b`) noted in comments only (`workers/queue/index.ts:8-9`). Auto-sync, token refresh, prune, rollups remain in `serve.ts` regardless of BullMQ flag.

---

## Prioritized Recommendations (V1 list — status only)

| # | V1 action | V2 status |
|---|-----------|-----------|
| R1 | Advisory lock strategy for `sync()` / auto-sync | **Not fixed** — `sync()` unchanged; auto-sync still calls `sync()` |
| R2 | Persist OAuth post-callback session | **Not fixed** — `oauthSessions` Map remains |
| R3 | Indexes on `tokenExpiresAt`, `lastSyncedAt` | **Not fixed** — no schema migration |
| R4 | Configure `pg.Pool` max + timeouts | **Not fixed** |
| R5 | `ALLOWED_ORIGINS` + config fail-fast | **Not fixed** |
| R6 | Job queue extraction | **Partially fixed** — BullMQ behind flag; co-located; auto-sync excluded |
| R7 | Chunk `$transaction` in upsertMany | **Not fixed** |
| R8 | Split `server.ts` | **Not fixed** — file grew |
| R9 | Centralize Meta error code helpers | **Not fixed** |
| R10 | Align `getAccount()` primary selection | **Not fixed** |
| R11 | Reduce `any` usage | **Not fixed** — count 31 |
| R12 | Deduplicate dashboard pollSyncJob | **Not fixed** |
| R13 | TLS verify-full for DATABASE_URL | **Not fixed** |
| R14 | Integration tests | **Not fixed** — drill script added, not integration tests |
| R15 | Vendor Chart.js | **Not fixed** |

---

## Master-Level Verdict — Biggest Risks (Second Pass)

### Top 3 Critical / High Headlines

1. **Session advisory locks on pooled connections — auto-sync path still exposed** — `sync()` lacks `unlock_all` preflight; `serve.ts` auto-sync unchanged. Horizontal-scaling commits did not touch `syncAccount.sync()` or auto-sync routing.

2. **Horizontal-scaling infrastructure inactive at defaults + incomplete when enabled** — Redis/BullMQ/debounce flags default off. When enabled, workers share API process and pool; auto-sync and OAuth sessions remain single-instance assumptions.

3. **Multi-instance statefulness (OAuth sessions, rate limits) persists** — Redis mitigates webhook debounce herd and token-health decrypt herd only when configured; OAuth completion and rate limits still in-memory.

### Architectural maturity scorecard (second pass)

| Area | V1 Grade | V2 Grade | Delta notes |
|------|----------|----------|-------------|
| Domain layering | A- | A- | Preserved; `initialSync.ts` extraction positive |
| Data integrity (ETL) | B+ | B+ | Hijack guard improves connect integrity |
| Concurrency | C | C | BullMQ optional; lock semantics unchanged on auto-sync |
| API security (webhooks) | A- | A- | Durable enqueue when BullMQ on |
| UI resilience | B+ | B+ | No UI changes in branch delta |
| Ops readiness | C+ | B- | Redis drill, queue stats, isolation checklist added |
| Scale readiness | D+ | C- | Foundation laid; defaults and gaps limit readiness |

### Final statement

The `feat/horizontal-scaling` branch demonstrates ** deliberate, flag-gated progress** toward multi-instance operation: graceful Redis degradation, BullMQ with fallback, cross-workspace connect guard, and ops drill scripts. The **production-default codebase behavior matches the first-pass audit** for the three headline risks. Enabling flags without completing R1–R5 and OAuth session persistence leaves known gaps partially papered over.

---

## Appendix A — Key file reference map (delta)

| File | Role (new or changed) |
|------|----------------------|
| `src/lib/redis.ts` | Optional Redis singleton + `withRedis` fallback |
| `src/lib/queue.ts` | BullMQ queues + dedicated ioredis + `enqueueOrFallback` |
| `src/lib/initialSync.ts` | Extracted initial backfill + queue wiring |
| `src/services/cachedTokenHealth.ts` | 60s read-through token-health cache |
| `src/workers/queue/*` | Four BullMQ processors (one scaffolded/unused producer) |
| `scripts/test-redis-scaling-drill.ts` | Redis scaling drill |
| `scripts/queue-stats.ts` | Queue monitoring CLI |
| `WORKSPACE_ISOLATION_CHECKLIST.md` | Phase 6a tenant isolation audit |

## Appendix B — Feature flag matrix

```
REDIS_URL unset     → all Redis features → in-process fallback
REDIS_URL set       → token-health cache always attempts Redis
WEBHOOK_REDIS_DEBOUNCE_ENABLED=true → SET NX EX debounce (needs Redis)
BULLMQ_ENABLED=true → enqueueOrFallback prefers queues; workers in serve.ts
Both flags off      → byte-identical background semantics to pre-64f080e
```

## Appendix C — Audit tooling

- PDF generation: `npx tsx scripts/compileMasterAuditPdf.ts --input ADLYTIC_MASTER_ARCHITECT_AUDIT_2026_V2.md`
- Comparison doc: `ADLYTIC_AUDIT_COMPARISON_V1_V2.md`

---

*End of ADLYTIC_MASTER_ARCHITECT_AUDIT_2026 — Second Pass*

---

## PART C: SIDE-BY-SIDE COMPARISON

# ADLYTIC Audit Comparison — V1 vs V2

**V1 baseline:** `ADLYTIC_MASTER_ARCHITECT_AUDIT_2026.md` (commit `05752ef`, dated 2026-06-29)  
**V2 audit:** `ADLYTIC_MASTER_ARCHITECT_AUDIT_2026_V2.md` (branch `feat/horizontal-scaling`, commit `32cd337`, dated 2026-06-30)  
**Branch delta:** 4 commits, +2,664 / −176 lines across 18 files (`64f080e` … `32cd337`)

---

## Summary Counts

| Status | R1–R15 | Pillar findings (P*-* ) | New V2-only items |
|--------|--------|-------------------------|-------------------|
| **Fixed** | 0 | 0 | 1 (P1-10 hijack guard) |
| **Partially fixed** | 2 (R1, R6) | 2 (P1-06, P3-06) | 4 (P1-09, P2-10, P2-11, P3-13) |
| **Not fixed** | 13 | 38 | — |
| **Regressed** | 0 | 1 (P1-01 line count) | — |

*Pillar counts include strengths marked "Preserved" as Not fixed (intentional non-regression). New V2-only items are additions, not V1 regressions.*

---

## R1–R15 Recommendation Tracker

| Finding (V1) | Status in V2 | Evidence |
|--------------|--------------|----------|
| **R1** — Fix advisory lock strategy (`sync()` / auto-sync) | **Partially fixed** | `syncChunked` retains `pg_advisory_unlock_all()` preflight (`syncAccount.ts:1061-1067`). **`sync()` still uses bare `pg_try_advisory_lock`** (`syncAccount.ts:193-195). Auto-sync in `serve.ts:204` still calls `worker.sync()`, not `syncChunked` or queue. No dedicated lock-holding client. |
| **R2** — Persist OAuth post-callback session | **Not fixed** | `oauthSessions` Map at `server.ts:189`; read/write at connect routes 2359+, 2666+, 2765+. No DB/Redis session model added. |
| **R3** — Indexes `(tokenSource, status, tokenExpiresAt)`, `(status, lastSyncedAt)` | **Not fixed** | `prisma/schema.prisma` AdAccount indexes unchanged (`@@index([workspaceId])`, `@@index([connectionId])` only). No migration after `05752ef`. |
| **R4** — Configure `pg.Pool` max + timeouts | **Not fixed** | `serve.ts:69-76` — `new pg.Pool({ host, port, … })` without `max` or `idleTimeoutMillis`. |
| **R5** — `ALLOWED_ORIGINS` + config.ts fail-fast | **Not fixed** | `server.ts:270` reads `process.env['ALLOWED_ORIGINS']` directly; `config.ts` has no CORS section; no production fatal for empty origins. |
| **R6** — Extract sync/engine work to job queue | **Partially fixed** | BullMQ added: `lib/queue.ts`, 4 processors, `enqueueOrFallback` at webhook/sync/kickoff sites. **`BULLMQ_ENABLED` defaults `false`** (`config.ts:248`). Workers co-located in API process (`serve.ts:96`, `workers/queue/index.ts:7-11`). **Auto-sync loop not queued** (`serve.ts:118-225`). |
| **R7** — Chunk `$transaction` in `DailyStatsRepo.upsertMany` | **Not fixed** | `dailyStatsRepo.ts:68-94` — single `$transaction` over all rows unchanged. |
| **R8** — Split `server.ts` into route modules | **Not fixed** | File grew 3,392 → 3,486 lines. Only `kickoffInitialSync` extracted to `lib/initialSync.ts`. |
| **R9** — Centralize Meta error code helpers | **Not fixed** | 190 detection still regex in `serve.ts:210` and typed in `syncAccountProcessor.ts:114-116`. No `isMetaErrorCode` in `metaClient.ts`. |
| **R10** — Align `getAccount()` with primary account selection | **Not fixed** | `server.ts:467` — `ws.adAccounts[0] ?? null` without `orderBy`. |
| **R11** — Reduce `any` usage (31 hits) | **Not fixed** | `rg ': any\|as any' src` → **31** occurrences (unchanged). |
| **R12** — Deduplicate dashboard `pollSyncJob` | **Not fixed** | Local `pollSyncJob` in `dashboardPage.ts:1800-1811`; `window.pollSyncJob` exported at `layout.ts:1168`. |
| **R13** — TLS verify-full for DATABASE_URL | **Not fixed** | `serve.ts:68`, `getDashboard.ts:66` — `ssl: { rejectUnauthorized: false }`. |
| **R14** — Integration tests (webhooks, SyncJob, locks, OAuth) | **Not fixed** | Added `scripts/test-redis-scaling-drill.ts` (Redis ops drill, not app integration tests). No new test files for HMAC, SyncJob lifecycle, or advisory locks. |
| **R15** — Vendor Chart.js / self-host CDN | **Not fixed** | CSP still allows `cdn.jsdelivr.net` (`server.ts:299-300`). No UI file changes in branch delta. |

---

## Pillar 1 — Architecture & Code Quality

| Finding (V1) | Status in V2 | Evidence |
|--------------|--------------|----------|
| **P1-01** — Monolithic `server.ts` (~3,392 lines) | **Regressed** | **3,486 lines** (`wc -l src/api/server.ts`). Net +94 despite partial extraction. |
| **P1-02** — Duplicate `pollSyncJob` in dashboard onboarding | **Not fixed** | `dashboardPage.ts:1800-1811` local function; not calling `window.pollSyncJob`. |
| **P1-03** — `getAccount()` first account arbitrary | **Not fixed** | `server.ts:467` — `adAccounts[0]`. |
| **P1-04** — 31× `any` usage | **Not fixed** | Count unchanged at 31. |
| **P1-05** — Unhandled rejection log-only | **Not fixed** | `serve.ts:42-48`; BullMQ workers log errors without process exit (`workers/queue/index.ts:96-102`). |
| **P1-06** — `process.env` outside `config.ts` | **Partially fixed** | `config.ts` now owns `REDIS_URL`, `BULLMQ_ENABLED`, `WEBHOOK_REDIS_DEBOUNCE_ENABLED`. `ALLOWED_ORIGINS`, Stripe, Anthropic, dashboard timeout still direct env reads. |
| **P1-07** — Standalone Prisma pool in `getDashboard.ts` | **Not fixed** | Module-level `_pool` at `getDashboard.ts:60-68`. |
| **P1-08** — Layer discipline (strength) | **Preserved** | Meta/DTO/engine separation intact; `initialSync.ts` extraction aligns with layering. |
| **P1-09** — *(V2 new)* Default-off horizontal-scaling flags | **New** | `config.ts:230-255` — infrastructure present, production default = V1 behavior. |
| **P1-10** — *(V2 new)* Cross-workspace AdAccount hijack guard | **Fixed** | `findExistingAdAccountForWorkspace` + 409 at `server.ts:404-427`, 2725, 2848, 3048 (`e6ef331`). |

---

## Pillar 2 — Concurrency, Locking & Data Integrity

| Finding (V1) | Status in V2 | Evidence |
|--------------|--------------|----------|
| **P2-01** — Session advisory locks + pool (Critical) | **Partially fixed** | `syncChunked` mitigation unchanged. **`sync()` + auto-sync path still lack preflight.** |
| **P2-02** — 32-bit lock hash collision | **Not fixed** | `advisoryLock.ts:16-22` unchanged. |
| **P2-03** — SyncJob dedupe (strength) | **Preserved** | Fix A logic unchanged in sync API routes. |
| **P2-04** — Unbounded `$transaction` in upsertMany | **Not fixed** | `dailyStatsRepo.ts:68-94`. |
| **P2-05** — Campaign reconcile transaction size | **Not fixed** | `syncAccount.ts` reconcile path unchanged. |
| **P2-06** — No deadlock retry | **Not fixed** | No `40P01` handler added. |
| **P2-07** — Crash lock release caveat | **Not fixed** | Comments/behavior unchanged. |
| **P2-08** — Coarse auto-sync lock duration | **Not fixed** | `serve.ts:231-241` unchanged. |
| **P2-09** — Idempotent upserts (strength) | **Preserved** | Schema unique keys unchanged. |
| **P2-10** — *(V2 new)* BullMQ co-located with API | **New (risk when enabled)** | Up to 12 concurrent jobs, same Prisma pool (`workers/queue/index.ts:32-37`). |
| **P2-11** — *(V2 new)* `reconcile-campaigns` queue unused | **New (incomplete)** | Processor boots; no `reconcileCampaigns.add` producer (`reconcileCampaignsProcessor.ts:6-10`). |

---

## Pillar 3 — Meta API Resilience & Webhooks

| Finding (V1) | Status in V2 | Evidence |
|--------------|--------------|----------|
| **P3-01** — Retry policy gaps | **Not fixed** | `metaClient.ts` unchanged. |
| **P3-02** — Code 17 handling (strength) | **Preserved** | `withCode17Retry` unchanged. |
| **P3-03** — Pagination cap 500 | **Not fixed** | `metaClient.ts:195-208` unchanged. |
| **P3-04** — Token lifecycle (no index on expiry) | **Not fixed** | Refresh worker query unchanged; index gap remains (see P5-10). |
| **P3-05** — Webhook HMAC (strength) | **Preserved** | `metaWebhook.ts:59-70`, `server.ts` route unchanged. |
| **P3-06** — Webhook idempotency (debounce only) | **Partially fixed** | Redis `SET NX EX` path when `WEBHOOK_REDIS_DEBOUNCE_ENABLED=true` (`metaWebhook.ts:173-196`). Still no delivery-id dedupe. Reconcile fire still `setTimeout`. Flag defaults off. |
| **P3-07** — Webhook GET handshake | **Not fixed** | Unchanged. |
| **P3-08** — Stripe webhook (strength) | **Preserved** | Unchanged. |
| **P3-09** — 190 parsing inconsistency | **Not fixed** | Regex vs typed checks persist across `serve.ts` and queue processor. |
| **P3-10** — Breakdown #100 skip (strength) | **Preserved** | Unchanged. |
| **P3-11** — OAuth session in-memory (High) | **Not fixed** | `oauthSessions` Map persists. |
| **P3-12** — META_APP_SECRET optional at boot | **Not fixed** | Fail-closed at request time only. |
| **P3-13** — *(V2 new)* Token-health cache stale after reconnect | **New gap** | `invalidateCachedTokenHealth` defined (`cachedTokenHealth.ts:90`) but **never called** from connect/regrant paths. |

---

## Pillar 4 — UI/UX Robustness

| Finding (V1) | Status in V2 | Evidence |
|--------------|--------------|----------|
| **P4-01** — Centralized `pollSyncJob` (strength) | **Preserved** | `layout.ts:729-741`; no changes in `05752ef..HEAD` UI diff. |
| **P4-02** — `runWorkspaceSync` + resume (strength) | **Preserved** | Unchanged. |
| **P4-03** — Dashboard duplicate poll | **Not fixed** | `dashboardPage.ts:1800-1811`. |
| **P4-04** — `RUNNING`/`IN_PROGRESS` enum mismatch | **Not fixed** | `layout.ts:892`, `dashboardPage.ts:1788`. |
| **P4-05** — Null-safe rendering (strength) | **Preserved** | Unchanged. |
| **P4-06** — Token decrypt banner (strength) | **Preserved** | Now uses cached backend (`server.ts:1328`). |
| **P4-07** — Token health primary account only | **Not fixed** | `checkWorkspaceTokenHealth.ts:38-52` unchanged. |
| **P4-08** — Thumbnail fallback (strength) | **Preserved** | Unchanged. |
| **P4-09** — Video thumbnail gap | **Not fixed** | Unchanged. |
| **P4-10** — `friendlyApiError` (strength) | **Preserved** | Unchanged. |
| **P4-11** — Dashboard refresh visibility pause | **Not fixed** | Unchanged (low severity). |
| **P4-12** — Chart.js CDN dependency | **Not fixed** | Unchanged. |

---

## Pillar 5 — Security & Performance

| Finding (V1) | Status in V2 | Evidence |
|--------------|--------------|----------|
| **P5-01** — JWT + tokenVersion (strength) | **Preserved** | Unchanged. |
| **P5-02** — CORS permissive when origins empty | **Not fixed** | `server.ts:270-279`. |
| **P5-03** — CSP unsafe-inline | **Not fixed** | Unchanged. |
| **P5-04** — TLS verify disabled for DB | **Not fixed** | `serve.ts:68`, `getDashboard.ts:66`. |
| **P5-05** — In-memory rate limits | **Not fixed** | `server.ts:145-163`; comment "Single-instance". |
| **P5-06** — Platform admin env emails | **Not fixed** | `adminGuard.ts:40`. |
| **P5-07** — Token encryption (strength) | **Preserved** | Unchanged. |
| **P5-08** — AI sanitization | **Not fixed** | No line-by-line proof added. |
| **P5-09** — Missing index `lastSyncedAt` | **Not fixed** | No schema change. |
| **P5-10** — Missing index `tokenExpiresAt` | **Not fixed** | No schema change. |
| **P5-11** — Webhook external ID lookup | **OK** | Unique constraint sufficient. |
| **P5-12** — SyncJob index (strength) | **Preserved** | `@@index([adAccountId, status])`. |
| **P5-13** — Raw insights bloat | **Not fixed** | Prune logic unchanged; no partial index. |
| **P5-14** — Pool default max 10 | **Not fixed** | Unconfigured; worse when BullMQ concurrency=12. |
| **P5-15** — Dashboard stage timeout (strength) | **Preserved** | Unchanged. |
| **P5-16** — Timer / OAuth prune memory | **Not fixed** | Unchanged. |
| **P5-17** — Platform stats cache per-instance | **Not fixed** | Unchanged. |
| **P5-18** — *(V2 new)* Dual Redis connections | **New** | App singleton + BullMQ dedicated client when queue enabled. |

---

## Executive Verdict Comparison

| Dimension | V1 | V2 |
|-----------|----|----|
| Shippable single-instance beta | Yes | Yes |
| Multi-replica ready | No | No (foundation only; defaults = V1) |
| Top risk #1 | Advisory locks + pool on auto-sync | **Same** — `sync()` path untouched |
| Top risk #2 | Single-process background coupling | **Mitigated optionally** — BullMQ when flagged; auto-sync still in-process |
| Top risk #3 | In-memory OAuth / rate limits | **Same** — OAuth sessions unchanged |
| Scale readiness grade | D+ | C− (infrastructure added, gaps remain) |
| New security fix | — | Cross-workspace connect hijack → 409 |

---

## What Was NOT Fixed

*(Factual gaps remaining after V2 — no recommendations.)*

### Critical / High (from V1, still open)

- **`sync()` advisory lock preflight missing** — auto-sync in `serve.ts:204` calls `worker.sync()` without `pg_advisory_unlock_all()` mitigation present in `syncChunked`.
- **OAuth post-callback sessions in-memory** — `oauthSessions` Map at `server.ts:189`; lost on redeploy / wrong replica without sticky sessions.
- **Missing DB indexes** — `AdAccount.lastSyncedAt` and `AdAccount.tokenExpiresAt` (composite with `tokenSource`, `status`) have no migrations.
- **`pg.Pool` max/timeouts not configured** — default max 10; BullMQ can run 12 concurrent jobs when enabled.
- **CORS `ALLOWED_ORIGINS` not in `config.ts`** — no production fail-fast for empty origins.
- **TLS `rejectUnauthorized: false`** on external DATABASE_URL hosts.
- **`getAccount()` uses `adAccounts[0]`** without deterministic ordering or primary flag.
- **Standalone second Prisma pool** in `getDashboard.ts` at import time.
- **Unbounded `$transaction`** in `DailyStatsRepo.upsertMany`.

### Medium / structural (from V1, still open)

- Monolithic `server.ts` (now larger: 3,486 lines).
- In-memory rate limiting (`server.ts:145`).
- Meta 190 error detection not centralized (regex vs typed paths).
- No deadlock retry on Prisma `40P01`.
- `process.env` reads for Stripe, Anthropic, `PUBLIC_APP_URL`, `DASHBOARD_STAGE_TIMEOUT_MS`.
- 31× TypeScript `any` / `as any`.
- Dashboard onboarding duplicate `pollSyncJob`.
- UI status enum checks for non-existent `RUNNING` / `IN_PROGRESS`.
- Chart.js CDN dependency.
- Raw insights table growth between prunes (no partial index on `fetchedAt`).
- Platform stats in-memory cache per instance.
- No integration tests for advisory locks, webhook HMAC, SyncJob lifecycle, OAuth DB roundtrip.

### Horizontal-scaling branch items incomplete at V2

- **`BULLMQ_ENABLED` defaults false** — queue infrastructure inactive unless explicitly enabled.
- **`WEBHOOK_REDIS_DEBOUNCE_ENABLED` defaults false** — cluster debounce inactive unless enabled.
- **Auto-sync not routed through BullMQ** — remains synchronous loop in `serve.ts`.
- **BullMQ workers co-located with HTTP** — Phase 3-b separate dyno not implemented.
- **`reconcile-campaigns-v1` queue has consumer but no producer** — webhook reconcile still uses `setTimeout`.
- **Redis debounce winner still fires via in-process timer** — reconcile lost if winning process dies before timer (`metaWebhook.ts:165-170`).
- **`invalidateCachedTokenHealth` never invoked** — reconnect paths do not bust token-health cache.
- **R1–R5 from V1 prioritized list** — none fully closed.

### Fixed in V2 (for completeness)

- Cross-workspace Meta ad account silent hijack on reconnect → explicit **409 `AD_ACCOUNT_ALREADY_LINKED_ELSEWHERE`** at three connect sites (`e6ef331`).

---

*End of ADLYTIC_AUDIT_COMPARISON_V1_V2.md*

---

## PART D: EXECUTIVE DELTA (what changed)

**Scope:** V1 baseline (`05752ef`, 2026-06-29) → V2 on `feat/horizontal-scaling` (`32cd337`, 2026-06-30). Branch delta: 4 commits, +2,664 / −176 lines across 18 files.

### Fixed (fully closed in V2)

- **P1-10 — Cross-workspace AdAccount hijack guard** — `findExistingAdAccountForWorkspace` returns 409 `AD_ACCOUNT_ALREADY_LINKED_ELSEWHERE` instead of silent `workspaceId` overwrite. Guarded at three connect sites (`server.ts:404-427`, 2725, 2848, 3048; commit `e6ef331`).
- **R1–R15:** Zero recommendations fully closed.

### Partially fixed

- **R1 — Advisory lock strategy** — `syncChunked()` retains `pg_advisory_unlock_all()` preflight (`syncAccount.ts:1061-1067`). **`sync()` still uses bare `pg_try_advisory_lock`** (`syncAccount.ts:193-195). Auto-sync in `serve.ts:204` still calls `worker.sync()`, not `syncChunked` or queue. No dedicated lock-holding client.
- **R6 — Job queue extraction** — BullMQ added (`lib/queue.ts`, 4 processors, `enqueueOrFallback`). **`BULLMQ_ENABLED` defaults `false`**. Workers co-located in API process. **Auto-sync loop not queued.**
- **P1-06 — `process.env` outside `config.ts`** — `config.ts` now owns `REDIS_URL`, `BULLMQ_ENABLED`, `WEBHOOK_REDIS_DEBOUNCE_ENABLED`. `ALLOWED_ORIGINS`, Stripe, Anthropic, dashboard timeout still direct env reads.
- **P2-01 — Session advisory locks + pool (Critical)** — `syncChunked` mitigation unchanged. **`sync()` + auto-sync path still lack preflight.**
- **P3-06 — Webhook idempotency (debounce only)** — Redis `SET NX EX` cluster-wide debounce when `WEBHOOK_REDIS_DEBOUNCE_ENABLED=true` (`metaWebhook.ts:173-196`). Still no delivery-id dedupe. Reconcile fire still `setTimeout`. Flag defaults off.

### Not fixed (V1 items still open — see Part E for complete list)

- **R2–R5, R7–R15** — All remain open (13 of 15 recommendations not fixed).
- **38 pillar findings (P*-* )** — Unchanged or explicitly "Not fixed" / "Preserved" (strengths intentionally non-regressed).
- Key unchanged headline risks: OAuth sessions in-memory, missing DB indexes, unconfigured pool, CORS fail-fast, TLS verify disabled, monolithic `server.ts`, 31× `any`, no integration tests.

### Regressed

- **P1-01 — Monolithic `server.ts`** — Grew from **~3,392 lines (V1)** to **~3,486 lines (V2)** (+94). Net complexity increased despite partial extraction of `kickoffInitialSync` to `lib/initialSync.ts`.

### New issues (V2-only)

- **P1-09 — Default-off horizontal-scaling flags** — Infrastructure present (`redis.ts`, `queue.ts`, drill scripts); production default behavior equals V1 when flags off and `REDIS_URL` unset.
- **P2-10 — BullMQ co-located with API (Phase 3-a)** — When `BULLMQ_ENABLED=true`, up to **12 concurrent queue jobs** share same Prisma pool (default max 10) and event loop (`workers/queue/index.ts:32-37`).
- **P2-11 — `reconcile-campaigns-v1` queue scaffolded but unused** — Processor boots; no producer calls `reconcileCampaigns.add`. Webhook reconcile still uses `setTimeout`.
- **P3-13 — Token-health cache without reconnect invalidation** — `invalidateCachedTokenHealth` defined but **never called** from OAuth reconnect, token rotation, or Meta 190 handlers. Stale decrypt-failure banner up to 60s after reconnect when Redis is up.
- **P5-18 — Dual Redis TCP connections when BullMQ enabled** — App singleton (`lib/redis.ts`) plus BullMQ dedicated client (`lib/queue.ts:81-92`).

### Grade / verdict delta

| Dimension | V1 | V2 |
|-----------|----|----|
| Shippable single-instance beta | Yes | Yes |
| Multi-replica ready | No | No (foundation only; defaults = V1) |
| Top risk #1 | Advisory locks + pool on auto-sync | **Same** — `sync()` path untouched |
| Top risk #2 | Single-process background coupling | **Mitigated optionally** — BullMQ when flagged; auto-sync still in-process |
| Top risk #3 | In-memory OAuth / rate limits | **Same** — OAuth sessions unchanged |
| Scale readiness grade | D+ | C− |
| Ops readiness grade | C+ | B− (Redis drill, queue stats, isolation checklist) |

---

## PART E: WHAT WAS NOT FIXED (complete list)

*(Factual gaps remaining after V2 — no recommendations.)*

### Critical / High (from V1, still open)

- **`sync()` advisory lock preflight missing** — auto-sync in `serve.ts:204` calls `worker.sync()` without `pg_advisory_unlock_all()` mitigation present in `syncChunked`.
- **OAuth post-callback sessions in-memory** — `oauthSessions` Map at `server.ts:189`; lost on redeploy / wrong replica without sticky sessions.
- **Missing DB indexes** — `AdAccount.lastSyncedAt` and `AdAccount.tokenExpiresAt` (composite with `tokenSource`, `status`) have no migrations.
- **`pg.Pool` max/timeouts not configured** — default max 10; BullMQ can run 12 concurrent jobs when enabled.
- **CORS `ALLOWED_ORIGINS` not in `config.ts`** — no production fail-fast for empty origins.
- **TLS `rejectUnauthorized: false`** on external DATABASE_URL hosts.
- **`getAccount()` uses `adAccounts[0]`** without deterministic ordering or primary flag.
- **Standalone second Prisma pool** in `getDashboard.ts` at import time.
- **Unbounded `$transaction`** in `DailyStatsRepo.upsertMany`.

### Medium / structural (from V1, still open)

- Monolithic `server.ts` (now larger: 3,486 lines).
- In-memory rate limiting (`server.ts:145`).
- Meta 190 error detection not centralized (regex vs typed paths).
- No deadlock retry on Prisma `40P01`.
- `process.env` reads for Stripe, Anthropic, `PUBLIC_APP_URL`, `DASHBOARD_STAGE_TIMEOUT_MS`.
- 31× TypeScript `any` / `as any`.
- Dashboard onboarding duplicate `pollSyncJob`.
- UI status enum checks for non-existent `RUNNING` / `IN_PROGRESS`.
- Chart.js CDN dependency.
- Raw insights table growth between prunes (no partial index on `fetchedAt`).
- Platform stats in-memory cache per instance.
- No integration tests for advisory locks, webhook HMAC, SyncJob lifecycle, OAuth DB roundtrip.

### Horizontal-scaling branch items incomplete at V2

- **`BULLMQ_ENABLED` defaults false** — queue infrastructure inactive unless explicitly enabled.
- **`WEBHOOK_REDIS_DEBOUNCE_ENABLED` defaults false** — cluster debounce inactive unless enabled.
- **Auto-sync not routed through BullMQ** — remains synchronous loop in `serve.ts`.
- **BullMQ workers co-located with HTTP** — Phase 3-b separate dyno not implemented.
- **`reconcile-campaigns-v1` queue has consumer but no producer** — webhook reconcile still uses `setTimeout`.
- **Redis debounce winner still fires via in-process timer** — reconcile lost if winning process dies before timer (`metaWebhook.ts:165-170`).
- **`invalidateCachedTokenHealth` never invoked** — reconnect paths do not bust token-health cache.
- **R1–R5 from V1 prioritized list** — none fully closed.

---

*End of ADLYTIC_AUDIT_CLAUDE_READABLE.md*
