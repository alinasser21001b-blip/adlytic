# Meta API Integration (Meta Connect) — Architecture & Hardening Spec

> **READ FIRST — this is not a greenfield epic.** The Meta Graph API
> integration already exists and runs in production: token storage, OAuth +
> System User groundwork, a transport-only `MetaClient`, an idempotent ETL
> sync worker, and a 6-hour auto-sync loop are all live. This document
> **maps the existing system** and specifies **gaps / hardening** for Corsair.
> Do **not** re-create models, services, or workers that already exist — doing
> so risks duplicate tables, double-scaling currency math, and sync storms.
>
> **Scope of Corsair's work:** only the items marked **`GAP`** or **`HARDEN`**.
> Everything marked **`EXISTS`** is documentation of current state — touch only
> if a GAP explicitly requires it.

---

## 0. Current-state map (authoritative file references)

| Concern | File | Symbol / lines |
|---|---|---|
| Transport (Graph API) | `src/services/metaClient.ts` | `MetaClient` class, `getInsights`/`getTodayInsights`/`getLifetimeTotals`/`listCampaigns`/`listAdSets`/`listAds`/`paginated`/`requestWithRetry` |
| OAuth + config status | `src/services/metaOAuth.ts` | `getMetaOAuthConfigStatus`, start/callback handlers |
| ETL orchestrator | `src/workers/syncAccount.ts` | `SyncAccountWorker` (Extract→Transform→Load) |
| Insight translation | `src/mappers/insightMapper.ts` | `mapMetaInsight`, `mapMetaBreakdownInsight` |
| Creative translation | `src/mappers/creativeMapper.ts` | `mapMetaAdSet`, `mapMetaAd` |
| Raw audit trail | `src/repositories/rawInsightsRepo.ts` | `RawInsightsRepo.append` (append-only) |
| Daily metrics load | `src/repositories/dailyStatsRepo.ts` | `DailyStatsRepo.upsert` |
| Currency heal | `src/lib/iqdRepair.ts`, `src/lib/currency.ts` | `healAccountCurrencyAndSpend`, `resolveCurrencyMinorFactor`, `currencyFactorNeedsHeal` |
| Auto-sync loop | `src/api/serve.ts` | `syncAllAccounts`, `SYNC_INTERVAL_MS` (default 6h) |
| Schema | `prisma/schema.prisma` | `AdAccount`, `MetaConnection`, `OAuthState`, `Campaign`/`AdSet`/`Ad`, `DailyStat`, `SyncJob` |

**Layering contract (already enforced — keep it):**
`metaClient.ts` is the ONLY file allowed to know Meta URLs/response shapes. It
returns raw JSON, never persists. Mappers translate; repos persist; the worker
orchestrates. Any GAP work must respect this separation — no Graph URLs outside
`metaClient.ts`, no DB writes inside mappers.

---

## 1. Phase 1 — DB Schema

### 1.1 `EXISTS` — do not recreate

- **`AdAccount`** (`schema.prisma:74`): `externalAccountId`, `currency`,
  `currencyMinorFactor` (100 USD/EUR · 1 IQD), `timezone`, `status`,
  `accessTokenEncrypted`, `tokenExpiresAt`, `lastSyncedAt`,
  `lifetimeSpendMinor` (BigInt), `lifetimeSyncedAt`, `connectionId` (FK →
  MetaConnection), `tokenSource` (`USER_OAUTH` default). Unique on
  `[platform, externalAccountId]`.
- **`MetaConnection`** (`:122`): `businessId`, `systemUserId`,
  `accessTokenEncrypted`, `tokenType` (`LONG_LIVED_USER`/`SYSTEM_USER`),
  `tokenExpiresAt`, `grantedScopes[]`, `grantedAssetIds[]`, `configId`,
  `status`, `lastValidatedAt`. Unique on `[workspaceId, businessId]`.
- **`OAuthState`** (`:164`): CSRF `state` PK, `kind`, `expiresAt` TTL — survives
  Railway redeploys (replaced an in-memory Map).
- **`DailyStat`**: the daily-metrics store. Upserted on
  `(entityType, entityId, date)` — the idempotency key.
- **`Campaign`/`AdSet`/`Ad`, `SyncJob`**: hierarchy + job audit rows.

### 1.2 `GAP` — candidate additions (only if a downstream need is confirmed)

| Field / model | Rationale | Decision needed |
|---|---|---|
| `DailyStat` unique constraint audit | Confirm `@@unique([entityType, entityId, date])` actually exists at the DB level (the worker assumes it for upsert idempotency). | **Verify before any sync change.** If absent, the "12 IQD duplicate" class of bug can recur. |
| `SyncJob.error` retention | Already a text column; confirm it's populated on Meta 4xx/5xx so failures aren't silent. | HARDEN — see §4.3 |
| `MetaConnection.lastValidatedAt` refresh cadence | Field exists; confirm something writes it. A stale value = no token-health signal. | GAP — see §2.3 |

**Migration rule:** all schema changes must be **additive & nullable** (the
existing models follow this — e.g. `connectionId`/`tokenSource` were added behind
the `META_SYSTEM_USER_ENABLED` flag). No destructive column drops. No change to
`@@unique([platform, externalAccountId])` or the daily-stats key.

---

## 2. Phase 2 — Authentication & Token Management

### 2.1 `EXISTS`

- **Encryption envelope:** tokens stored in `accessTokenEncrypted` (on both
  `AdAccount` and `MetaConnection`), never in plaintext.
- **Two token sources, one resolver:** `tokenSource` decides where the live
  token comes from — account-level (`USER_OAUTH`/manual/direct) or
  connection-level (`SYSTEM_USER`). `serve.ts:syncAllAccounts` already branches
  on this and **excludes expired tokens** and **non-ACTIVE connections** from
  the sync set (prevents retry storms).
- **CSRF:** `OAuthState` one-time `state` with ~10-min TTL.
- **Boot diagnostic:** `getMetaOAuthConfigStatus()` logs why OAuth is unusable
  (falls back to manual-connect modal) at startup.

### 2.2 Token-source decision matrix (document for Corsair — already implemented)

| `tokenSource` | Token location | Expiry | Sync eligibility (serve.ts) |
|---|---|---|---|
| `USER_OAUTH` (default) | `AdAccount.accessTokenEncrypted` | `tokenExpiresAt` may be set | included if token non-null AND (`tokenExpiresAt` null OR `> now`) |
| `SYSTEM_USER` | `MetaConnection.accessTokenEncrypted` | never expires | included only if `connection.status = ACTIVE` AND token non-null |

### 2.3 `GAP` / `HARDEN` — token lifecycle

1. **`GAP` — long-lived token refresh.** User OAuth tokens are ~60-day
   long-lived. There is no documented refresh job. **Spec:** a periodic check
   that, for `USER_OAUTH` accounts with `tokenExpiresAt` within N days (e.g. 7),
   either (a) attempts the Meta token-exchange refresh via a new
   `metaClient.exchangeLongLivedToken()` method, or (b) flips account `status`
   to a `NEEDS_REGRANT`-style state so the UI prompts reconnection. **Decision:
   does Meta's flow for this app support server-side refresh, or is re-consent
   required?** Corsair must confirm before building (a).
2. **`HARDEN` — token validation writes `lastValidatedAt`.** On each successful
   sync, stamp `MetaConnection.lastValidatedAt` / `AdAccount` so a health view
   can flag stale credentials. Today the field may never be written.
3. **Boundary — credentials are prohibited for the agent.** No token value is
   ever logged, echoed to chat, or written outside the encrypted column. The
   encryption key lives in env; Corsair must not relocate it or add a debug path
   that prints decrypted tokens.

---

## 3. Phase 3 — Service Layer (`MetaApiService`)

### 3.1 `EXISTS` — `MetaClient` contract (`metaClient.ts`)

```
class MetaClient(cfg: { apiVersion, accessToken, baseUrl?, maxRetries=5, retryBaseMs=500, fetchImpl? })
  getInsights({ externalId, level, since, until, fields?, breakdowns? }): MetaInsightRow[]
  getTodayInsights({...}): MetaInsightRow[]
  getLifetimeTotals(externalAccountId): MetaInsightRow[]      // date_preset=maximum → lifetime_spend_minor
  listCampaigns/listAdSets/listAds(externalId): MetaInsightRow[]
  private paginated(url, maxPages=500)                         // follows paging.next
  private requestWithRetry(url)                                // exponential backoff
class MetaApiError(status, body, msg)
```

- **Default insight fields** already include `spend, impressions, reach, clicks,
  inline_link_clicks, unique_clicks, ctr, cpc, cpm, frequency, actions,
  action_values, cost_per_action_type, purchase_roas`.
- **Versioning:** API version is the single point of change (`v20.0` today). A
  Meta deprecation touches only this file.

### 3.2 `HARDEN` — rate limiting & error taxonomy

The retry exists but the spec for Corsair should make these explicit and tested:

1. **Distinguish error classes** off `MetaApiError.status` + Meta error
   subcodes:
   - **Transient** (429, 500, 613 rate-limit, `code 4/17/32` throttling) →
     retry with backoff (existing) + honor `X-Business-Use-Case-Usage` /
     `X-App-Usage` headers to pre-emptively slow down.
   - **Auth** (190 invalid token, 102 session) → **do not retry**; mark
     account/connection for re-grant (links to §2.3.1).
   - **Permanent** (100 bad field, 803 nonexistent object) → fail the entity,
     log to `SyncJob.error`, continue other entities.
2. **`GAP` — usage-header backpressure.** Read Meta's
   `X-Business-Use-Case-Usage` JSON; when `call_count`/`total_time` near 100%,
   inject a cool-down. Today only reactive 429 retry exists; this is proactive.
3. **Boundary:** all new endpoints/fields go through `metaClient.ts` only.

### 3.3 `GAP` — ROAS / conversions surfacing

Raw `purchase_roas` and `actions` are fetched but verify the mapper
(`insightMapper.ts`) actually projects ROAS/conversions into `DailyStat`. If the
dashboard needs ROAS, the GAP is in the **mapper + DailyStat fields**, not the
client. Audit before adding.

---

## 4. Phase 4 — Sync Job (Cron)

### 4.1 `EXISTS` — `SyncAccountWorker` (`syncAccount.ts`) + `serve.ts` loop

- **ETL:** Extract via `metaClient`, Transform via mappers, Load via
  `rawInsightsRepo.append` (append-only audit) + `dailyStatsRepo.upsert`.
- **Idempotent:** re-running a window converges (upsert on
  `(entity_type, entity_id, date)`).
- **Backfill:** re-pulls last `backfillDays` (default 7) each run because Meta's
  attribution updates ~72h — overwriting stale `daily_stats` is intended.
- **Chunking:** `CHUNK_SIZE_DAYS=7`, `INTER_CHUNK_DELAY_MS=300`,
  `CAMPAIGN_CONCURRENCY=3` — tuned to dodge rate limits.
- **Scheduling:** `serve.ts` runs `syncAllAccounts` on an interval
  (`SYNC_INTERVAL_MS`, default 6h) using a **non-overlapping** pattern (waits
  for completion rather than `setInterval` queueing overlaps).
- **Currency safety:** `healAccountCurrencyAndSpend` + `resolveCurrencyMinorFactor`
  guard against the IQD double-scaling class of bug. **Any sync edit must not
  re-multiply minor units.**

### 4.2 `HARDEN` — observability & failure isolation

1. **Per-account isolation:** one account's Meta failure must not abort the whole
   `syncAllAccounts` pass. Confirm the loop try/catches per account and records
   `SyncJob.status=FAILED` + `SyncJob.error`.
2. **No silent warns.** The manual-connect path historically swallowed Meta
   verification errors with `console.warn` only. Spec: every Meta failure during
   sync must land in `SyncJob.error`, not just stdout.
3. **Lifetime sync cadence.** `getLifetimeTotals` → `lifetimeSpendMinor` /
   `lifetimeSyncedAt`. Confirm it runs (it powers the dashboard "Lifetime Spend"
   card). If it only runs on connect, add it to the periodic pass.

### 4.3 `GAP` — externalized scheduling (optional, decision needed)

The 6h `setInterval` lives **in the web process**. On multi-instance Railway
deploys this means N parallel sync loops. **Decision for you:**
- **Keep in-process** (simple; fine at single-instance) — document that scaling
  the web dyno horizontally requires a leader-election guard, **or**
- **Externalize** to a dedicated worker process / Railway cron — cleaner at
  scale but a larger change.

Recommend **keep in-process + add a DB advisory-lock guard** (cheap) before
investing in a separate worker, unless horizontal scaling is imminent.

---

## 5. Cross-cutting invariants (must hold across all phases)

| ID | Invariant |
|---|---|
| INV-1 | Graph URLs/shapes live ONLY in `metaClient.ts`. |
| INV-2 | `daily_stats` upsert key `(entity_type, entity_id, date)` is the single idempotency contract — never bypass it. |
| INV-3 | Currency is stored in **minor units**; never re-scale already-scaled values (IQD factor = 1). |
| INV-4 | Tokens only ever exist encrypted at rest; never logged/echoed/decrypted to output. |
| INV-5 | Schema changes are additive + nullable; no destructive drops; no change to existing unique keys. |
| INV-6 | Sync failures are recorded in `SyncJob.error`, never swallowed by `console.warn` alone. |
| INV-7 | New work is gated so production behavior is unchanged until explicitly enabled (mirror the `META_SYSTEM_USER_ENABLED` pattern). |

---

## 6. Recommended execution order for Corsair (gaps only)

1. **Audit pass (no code):** confirm DailyStat unique key, ROAS mapping, lifetime
   cadence, per-account failure isolation. Produce findings; some GAPs may close
   on confirmation alone.
2. **HARDEN §3.2 / §4.2:** error taxonomy + `SyncJob.error` population + usage-
   header backpressure. Lowest risk, highest reliability gain.
3. **GAP §2.3:** token-refresh/re-grant lifecycle — **blocked on the Meta-flow
   decision** (server refresh vs re-consent).
4. **GAP §4.3:** scheduling guard — only if horizontal scaling is planned.

Each step ships behind a flag, with the §5 invariants as the review checklist.

---

## 7. Decisions — RESOLVED by code inspection

All three "open" decisions were already answered by existing implementations.
Corsair must **build on these, not replace them.**

### 7.1 Token refresh → **Server-side exchange ALREADY EXISTS. Use it.**

`metaOAuth.ts` already implements the full server-side token pathway — no user
re-consent is required for the refresh mechanics:

- `exchangeCode(code)` (`:131`) — one-time code → short-lived (~1h) token.
- `getLongLivedToken(shortToken)` (`:148`) — `grant_type=fb_exchange_token` →
  **60-day long-lived token + `expires_in`**. This IS the server-side exchange.
- `inspectToken()` (`:184`) via `/debug_token` — returns `is_valid`, type,
  `expiresAt` (null = never-expires System User token).

**Architectural call:** the GAP is NOT "can we exchange server-side" (we can,
`getLongLivedToken` proves it). The GAP is that **nothing periodically RE-runs
the exchange before the 60-day expiry**. Spec for Corsair:
- Add a refresh pass (in the existing sync loop or a sibling timer) that, for
  `USER_OAUTH` accounts whose `tokenExpiresAt` is within a threshold (e.g. 7
  days), calls `getLongLivedToken()` with the still-valid long-lived token to
  roll it forward, then re-encrypts + updates `tokenExpiresAt`.
- Meta DOES allow refreshing a long-lived user token by re-exchanging it while
  still valid — so this is fully server-side as long as the token hasn't already
  expired. Only a **fully-expired** token forces re-consent → in that case flip
  account/connection status to a NEEDS_REGRANT signal for the UI.
- System User tokens (`expiresAt = null`) never need refresh — skip them.

### 7.2 Scheduling guard → **Advisory lock ALREADY EXISTS. Do not rebuild.**

`syncAccount.ts` already uses **Postgres advisory locks per ad account**:
- `advisoryLockId(id)` (`:157`) — stable 32-bit hash → int4 lock key.
- `pg_try_advisory_lock($1)` (`:194`, `:929`) — **non-blocking** acquire; if held,
  the run logs "Sync already in progress … skipping" and bails (`:199`).
- `pg_advisory_unlock($1)` (`:312`, `:1102`) — released in `finally`.
- `SyncJob` rows track `status` (PENDING/PROCESSING/COMPLETED/FAILED),
  `cursorDate`, `chunksDone`, `error` — full per-job audit (`schema.prisma:782`).

**Architectural call:** the Railway multi-instance concern is **already solved**
at the per-account granularity — two instances cannot double-sync the same
account because the advisory lock is database-global, not process-local. No
separate worker, no new lock table needed.

Residual (small) GAP: the **outer** `syncAllAccounts` pass in `serve.ts:220-226`
has no top-level guard, so two instances each iterate the account list in
parallel — harmless (each account's inner lock serializes the actual work) but
wasteful (duplicate `findMany` + lock-contention churn). **Leanest fix:** wrap
the outer pass in one coarse advisory lock (e.g.
`pg_try_advisory_lock(hash('adlytic:auto-sync'))`); if not acquired, skip this
tick. Reuse the existing `advisoryLockId` helper — **no new model, no
transaction-based lock.** This is the robust, minimal mechanism the existing
code already established.

### 7.3 ROAS → **Backend fetch-and-store is SUFFICIENT for this epic.**

Inspection result:
- ROAS **is fetched and mapped** server-side: `metaClient.ts` `DEFAULT_FIELDS`
  includes `purchase_roas`; `insightMapper.ts`, `dailyStatsRepo.ts`,
  `recommendation.service.ts`, `execution.service.ts` all reference it.
- ROAS is **NOT rendered** by the UI: zero matches for `roas`/`ROAS` in
  `dashboardPage.ts`, and `getDashboard.ts` does not project it into the
  `DashboardDTO.kpis`.

**Architectural call:** the dashboard does not expect a ROAS metric today, so
**fetch-and-store is in-scope and sufficient**; surfacing ROAS in the UI is a
**separate frontend epic** (would need a new KPI in `getDashboard` + a card in
`dashboardPage`), explicitly OUT of scope here. Corsair must NOT add ROAS UI
under this epic. Confirm storage integrity only (ROAS lands in `daily_stats`).

---

## 8. Net effect on Corsair's scope

Because all three decisions resolve to "infrastructure already exists," the real
deliverables shrink to **three small, additive hardening tasks**:

1. **Token refresh pass** (§7.1) — periodic `getLongLivedToken` re-exchange +
   NEEDS_REGRANT fallback. Reuses existing transport.
2. **Outer-loop advisory lock** (§7.2) — one coarse lock around
   `syncAllAccounts`. ~10 lines, reuses `advisoryLockId`.
3. **ROAS storage audit** (§7.3) — confirm `purchase_roas` persists to
   `daily_stats`; no UI work.

Everything else in §1–§4 is already in production. I will review Corsair's diffs
against the §5 invariants before any commit, as in prior phases.
