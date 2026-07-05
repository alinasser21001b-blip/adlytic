# Data Synchronization Layer — Root-Cause Analysis & Redesign

> Status: proposal · Scope: Meta Graph → DB → Dashboard pipeline
> Grounded in the current `main` code (file/line references throughout).

---

## 0. TL;DR (read this first)

The problem is **not authentication, not duplicate DB rows, and not "full re-download."**
The schema dedups correctly, the sync is already windowed/incremental, and the token
was never the real fault.

The problem is **one process doing two jobs.** The Railway service runs
`node dist/src/api/serve.js`, and that single process:

1. Serves every HTTP request (dashboard, campaigns, insights), **and**
2. Runs the entire Meta ETL — a 15-minute auto-sync loop over every account
   (`serve.ts:322-328`), plus every manual "Sync now" (`server.ts:3796`), plus
   ~6 other `enqueueOrFallback` background jobs — **in-process** via
   `setImmediate`, because `BULLMQ_ENABLED` defaults to `false` (`config.ts:276`)
   and no `REDIS_URL` is set.

Node is single-threaded. While a heavy sync runs, it monopolizes the event loop
and the Postgres pool (max 20 connections, `serve.ts:77`), so `/campaigns` and
`/insights` slow to a crawl or time out — **this is the "جارٍ تحميل الحملات…"
hang.** And because every `git push` to `main` redeploys and restarts that same
process, an in-flight sync is killed mid-way, leaving partial data.

**The 80% fix is configuration, not a rewrite:** turn on the durable queue
(`REDIS_URL` + `BULLMQ_ENABLED=true`) and run the worker as a **separate Railway
service**. The code already branches on `isQueueEnabled()` everywhere — the
machinery exists and is dormant.

---

## 1. Root-Cause Analysis

### RC-1 — Background ETL is co-located with the API (the big one)
- `serve.ts:116` calls `bootQueueWorkers(prisma)` unconditionally.
- `serve.ts:328` calls `scheduleSyncLoop()` unconditionally → a recursive
  `setTimeout` that every `SYNC_INTERVAL_MS` (default **15 min**, `config.ts:295`)
  runs `syncAllAccounts()`: for **each** active account, **serially**, six phases —
  `syncToday` → `sync(28d)` → `syncCampaigns` → `syncAdSetsAndAds` →
  `syncAdInsights` → `syncBreakdowns` → `runEngines` → `runBrainOrchestrator`
  (`serve.ts:233-292`).
- `POST /sync` with `BULLMQ_ENABLED=false` runs `worker.syncChunked()` inside the
  API process via `setImmediate` (`server.ts:3808-3829`).
- **Consequence:** heavy Meta ETL and HTTP serving compete for one event loop and
  one PG pool. Symptom = slow/stuck pages during a sync.

### RC-2 — Restart-during-sync loses progress
- Railway redeploys on every push to `main` and restarts the process. Any
  in-process sync dies mid-flight. Startup cleanup marks the orphan `FAILED`
  after 15 min (`serve.ts:97-108`) — good, but the **data** is left partial until
  the next pass, which reads as "outdated / inconsistent."

### RC-3 — Coarse, undifferentiated cadence
- Every 15 min the pipeline re-discovers all campaigns/ad-sets/ads and re-pulls a
  **28-day** window of daily stats + ad insights + breakdowns for the whole
  account (`serve.ts:241-282`). For the 72-campaign account in the screenshots
  that is hundreds of paginated Meta calls with backoff — easily 20-30 min.
  Cheap-and-frequent ("today's spend/status") is not separated from
  expensive-and-rare ("28-day ad-level breakdowns").

### RC-4 — No freshness contract on the Campaigns page
- The dashboard surfaces "last updated" (`dashboardPage.ts:526-542`,
  `ticker-freshness`), but the **campaigns page does not.** With no visible
  timestamp and no auto-refresh on sync-complete, users refresh manually; when
  the box is mid-sync the refresh hangs, reinforcing the false belief that
  "refreshing triggers a sync."

### RC-5 — Perceived mismatch with Meta Ads Manager (mostly not a bug)
Differences are explained by **attribution restatement** (Meta revises the last
~28 days — exactly why backfill is 28d), **timezone** (account tz vs UTC day
floor), **currency minor units**, and `isCurrentlySpending` needing today's row.
These are correctness-of-interpretation issues, not sync failures.

### What is NOT the problem (verified)
| Suspected in brief | Reality |
|---|---|
| Duplicate campaign rows | Schema has correct composite unique keys: `@@unique([adAccountId, externalCampaignId])` (schema:255), `@@unique([entityType, entityId, date])` for daily stats (schema:385). Upserts are idempotent. |
| "Downloads everything every time" | Already incremental: manual default `windowDays=3` (`server.ts:111`), auto-sync 28d backfill. Windowed by `since`/`until`. |
| Every page load starts a sync | Dashboard/campaigns are DB reads. `resumeActiveSyncIfAny` only *polls* an existing job; a 10-min staleness guard was added. Duplicate `POST /sync` returns the existing `jobId` (`server.ts:3733-3750`). |
| Auth / token | Ruled out. The token swap "fixed" it only because it coincided with a fresh process + cleared zombie job. |
| No rate-limit handling | `MetaClient` retries 429/5xx with exponential backoff + jitter (`metaClient.ts:271-290`); `metaUsageTracker` snapshots usage headers. Missing piece is a *global throttle*, not per-call retry. |

---

## 2. Current Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │   ONE Railway service                       │
                         │   start: node dist/src/api/serve.js         │
   Browser ──HTTP──────► │                                             │
   (dashboard,           │   ┌── Hono API (event loop) ───────────┐   │
    campaigns)           │   │  GET /dashboard  → getDashboard(DB) │   │
                         │   │  GET /campaigns  → DB               │   │
                         │   │  POST /sync      → setImmediate ──┐ │   │
                         │   └───────────────────────────────────┼─┘   │
                         │                                        │     │
                         │   ┌── in-process background ◄──────────┘     │
                         │   │  • 15-min auto-sync loop (all accts)     │
                         │   │  • syncChunked (manual)                  │
                         │   │  • engines + brain + narration           │
                         │   └──────────────┬───────────────────────────┤
                         └──────────────────┼───────────────────────────┘
                                            │ competes for event loop + PG pool
                     Meta Graph API ◄───────┤
                                            ▼
                                     Postgres (max 20 conns)
                                            ▲
                                     Dashboard reads here (good)

   Redis / BullMQ: PRESENT IN CODE, DORMANT (BULLMQ_ENABLED=false, no REDIS_URL)
```

---

## 3. Proposed Architecture

Two services from the **same image**, plus the already-built (dormant) queue.

```
   Browser ──HTTP──► ┌── API service ──────────────┐        ┌── Worker service ───────────┐
                     │  start: serve.js  (API_ONLY)│        │  start: worker.js           │
                     │  • Hono routes              │        │  • BullMQ workers (drain)   │
                     │  • DB reads only            │        │  • cadence scheduler        │
                     │  • POST /sync → enqueue ────┼──┐     │  • per-account sync jobs    │
                     │  • NO in-proc ETL           │  │     │  • engines/brain/narration  │
                     └──────────────┬──────────────┘  │     └───────┬─────────────────────┘
                                    │ DB reads         │ Redis       │ Meta Graph API
                                    ▼                  ▼ (BullMQ)    ▼
                              Postgres ◄──────── writes ────────── Worker
                                    ▲
   Meta ──webhook──► API /webhooks/meta ──enqueue reconcile──► Worker (status + today's spend, sub-minute)
```

Key properties:
- **API never runs ETL** → pages stay fast; deploys can't kill a sync.
- **Durable queue** → a job survives a worker restart (BullMQ re-delivers).
- **Webhook fast-path** → `metaWebhook.ts` + `reconcileCampaignsProcessor`
  (already exist) give sub-minute status/spend accuracy without waiting for the
  full pass.
- **Dashboard unchanged** → still reads DB; now the DB is written by a worker
  that isn't fighting the API for resources.

---

## 4. Performance Bottlenecks (ranked)

| # | Bottleneck | Evidence | Impact |
|---|---|---|---|
| 1 | ETL on the API event loop / PG pool | `serve.ts:116,328`; `server.ts:3808` | Page hangs, timeouts during sync |
| 2 | Restart kills in-flight sync | single `start` script; Railway redeploy | Partial/stale data |
| 3 | 28-day full pipeline every 15 min | `serve.ts:241-282` | 20-30 min passes, Meta quota burn |
| 4 | Serial per-account loop | `serve.ts:192` `for … of` | One slow account blocks all others |
| 5 | No global Meta throttle | `metaClient.ts` retries per-call only | 429 storms under concurrency |
| 6 | No freshness/auto-refresh on Campaigns | `campaignsPage.ts` (absent) | Users manual-refresh into the hang |

---

## 5. Recommended Redesign

### 5.1 Split API and Worker (highest impact, mostly config) — SHIPPED
- One entrypoint (`serve.ts`), behavior chosen by `SERVICE_ROLE`:
  `api` = HTTP only, no ETL; `worker`/`combined` = HTTP **and** background ETL.
  Both roles serve HTTP so Railway's healthcheck passes on every service.
- The auto-sync loop, maintenance, and BullMQ boot are extracted to
  `src/workers/backgroundScheduler.ts` (`startBackgroundWork`), called only when
  `config.role !== 'api'`.
- Railway: one repo, two services. API service = `npm run start` + `SERVICE_ROLE=api`;
  worker service = `npm run start:worker` (same `serve.js`, skips migrations) +
  `SERVICE_ROLE=worker`. `/api/health` reports `role` so each service is verifiable.

### 5.2 Turn on the durable queue
- Provision Railway Redis, set `REDIS_URL` on both services, `BULLMQ_ENABLED=true`.
- No code change: `enqueueOrFallback` (`queue.ts:201`) already routes to BullMQ
  when `isQueueEnabled()`.

### 5.3 Split cadence: cheap-frequent vs expensive-rare
- **Every ~5-15 min (light):** `syncToday` only — today's spend/status per
  account. One fast call. Keeps KPIs and "active" counts live.
- **Hourly (heavy):** the 28-day full pipeline (campaigns/ads/breakdowns/engines/
  brain), enqueued **per account** with worker `concurrency: 2`.
- **On-demand:** `POST /sync` (unchanged contract) for the ↻ button.

### 5.4 Webhook reconcile fast-path
- Finish wiring `POST /api/webhooks/meta` (`server.ts:1245`) → enqueue
  `reconcile-campaigns` → status + `syncToday`. Sub-minute status accuracy;
  removes reliance on the 15-min tick for "active vs paused."

### 5.5 Global rate-limit awareness
- Before each account's heavy pass, read the latest `x-business-use-case-usage`
  from `metaUsageTracker` and defer that account when usage > ~80%.

### 5.6 Freshness contract on Campaigns
- Show "آخر تحديث: منذ X" from `lastSyncedAt` (already in the workspace payload),
  and on `pollSyncJob` completion auto-reload the page data (hook already exists
  via `runWorkspaceSync`'s completion path).

---

## 6. Migration Plan (phased, launch-aware)

**Phase A — "stop the hang" (SHIPPED — needs Railway config)**
1. Provision Redis on Railway; set `REDIS_URL`, `BULLMQ_ENABLED=true` on BOTH
   services (same Redis instance).
2. `SERVICE_ROLE` gate + `backgroundScheduler` extraction — DONE in code.
3. API service: `SERVICE_ROLE=api`. Worker service: `npm run start:worker` +
   `SERVICE_ROLE=worker` + all shared secrets (esp. `TOKEN_ENCRYPTION_KEY`).
4. Verify via `/api/health` on each: API shows `role:"api"`,
   worker shows `role:"worker","runsBackgroundSync":true`.
   *Outcome:* pages stay fast during sync; deploys stop losing data.

**Phase B — cadence split + freshness UI (1-2 days)**
5. Light `syncToday` scheduler (frequent) vs hourly heavy pass (per-account jobs).
6. Campaigns page "last updated" + auto-refresh on job complete.

**Phase C — webhooks + throttle (2-3 days, post-launch)**
7. Wire Meta webhook → reconcile queue.
8. Usage-header throttle before heavy passes.

Each phase is independently shippable and reversible (flip `BULLMQ_ENABLED` /
remove the worker service to revert to today's behavior).

---

## 7. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Redis outage | Low | `withRedis`/`isQueueEnabled` already fall back to in-process (`redis.ts`, `queue.ts:170`). Degrades, doesn't break. |
| Two services double-run auto-sync | Med if misconfigured | `ROLE` gate + existing `adlytic:auto-sync` advisory lock (`serve.ts:309`) makes double-run a no-op. |
| Webhook spoofing | Med | Verify `X-Hub-Signature-256` in `metaWebhook.ts` before enqueue. |
| Cost of Redis + extra service | Low | Small Railway Redis + a worker dyno; offset by fewer wasted 15-min full passes. |
| Migration regression | Low | Phase A is config-flag gated; revert = flip flag. |

---

## 8. Expected Sync Latency After Redesign

| Path | Today | After |
|---|---|---|
| Campaign status/spend (webhook) | up to 15 min + queue behind API | **< 1 min** |
| Today's KPIs (light pass) | 15 min | **≤ 5-15 min** |
| Full 28-day / ads / breakdowns | 15 min, contends with API | **hourly, off the API** |
| Manual "Sync now" | in-proc, blocks pages | **queued, non-blocking, durable** |
| Page load during a sync | seconds → timeout | **unaffected (API does no ETL)** |

---

## 9. Guaranteeing the Dashboard Matches Meta Ads Manager

Consistency is a **contract**, not a coincidence:

1. **Same attribution window.** Keep the 28-day backfill; Meta restates recent
   days. Always overwrite (upsert) the trailing window rather than insert-once.
2. **Account timezone, not server time.** Compute day floors in the account's
   `timezone` so "today" matches Ads Manager's day boundary.
3. **Currency minor units.** Store `BigInt` minor units + `currencyMinorFactor`
   (already done); never assume `/100` (IQD is factor 1).
4. **Idempotent upserts on composite keys** (already in schema) so a re-run
   converges to Meta's numbers instead of drifting.
5. **Show the timestamp and the window.** "آخر تحديث: منذ 3 دقائق · آخر 28 يوماً"
   sets the right expectation — Ads Manager and Adlytic agree *as of the same
   sync instant and window*.
6. **Reconcile, don't accumulate.** Webhook + hourly upsert of the trailing
   window means any transient miss self-heals on the next pass.

---

### Appendix — the single most important change
If only one thing ships: **move the worker off the API and turn on BullMQ.**
Everything else (cadence, webhooks, throttle, freshness UI) is optimization on
top of a pipeline that has stopped fighting itself.
