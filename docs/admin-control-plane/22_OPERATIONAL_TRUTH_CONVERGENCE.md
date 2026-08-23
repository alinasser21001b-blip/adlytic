# 22 · Operational truth convergence

What this pass found behind a set of operational warnings an operator would
actually see (Redis "not tested", Queue "disabled", Meta account "blocked"
with no reason shown, readiness "0/500"), and what changed as a result.

---

## 1. The rebaseline

The designated branch (`claude/admin-control-plane-graphify-y6wz0c`) pointed
at the pre-merge tip of the branch that became PR #104 — 56 commits behind
`main`, with zero commits of its own not already in `main`. Per the
already-merged-branch procedure, it was restarted from current `main`
(`f716518`, which also carries PR #106's unrelated iOS TestFlight work) rather
than built on stale history.

```
DESIGNATED_BRANCH_STALE_COMMITS   56 (all already in main)
DESIGNATED_BRANCH_UNIQUE_COMMITS  0
RESTARTED_FROM                    origin/main @ f716518
```

## 2. The claim inventory, and what survived it

The mission's own framing was broad — Redis, Queue, Meta, readiness, Graphify,
AI, and context state all read as suspect from the screenshots alone. Reading
the actual code behind each symptom found that most of it was **already
correct**:

- `src/lib/redis.ts` / `src/lib/queue.ts` — Redis is already fully optional,
  `withRedis()`/`enqueueOrFallback()` are proven fallback-safe at every call
  site (12 `setImmediate` sites, all inside an `enqueueOrFallback` fallback
  closure; every `getQueues()!.xxx.add()` call is exclusively that helper's
  enqueue argument). No change.
- `src/services/metaCapabilityProbe.ts` — an already-rich, already-correct
  classifier (11-value `ProbeVerdict`, baseline-then-isolated-dimension
  methodology, redaction, a hard call budget). No change.
- `src/services/adminOpsHealth.ts`'s Redis/Queue/Intelligence subsystem
  statuses already resolve `NOT_TESTED` rather than `ERROR` when simply
  unconfigured, with summaries that say so in Arabic. No change to that logic.
- `src/graph/model.ts`'s `RUNTIME_STATES` already separates `NOT_CONFIGURED`
  from `FAILED` from `UNKNOWN`, by design, with the rationale in a comment
  predating this mission. No change.

Three concrete, provable defects remained, and this pass fixed exactly those
three — not a redesign of the operational-truth layer the mission's own
framing might have suggested.

## 3. Fix 1 — the blocked-reason chain

`adminOpsHealth.ts` selected `acct.metaDisableReason` from Prisma and then
never read it — the only Meta-inactive handling was
`metaAccountStatus !== 1 → BLOCKED`, discarding the reason and, worse,
treating `IN_GRACE_PERIOD` (a real, named, **non-halted** state in
`src/lib/campaignLifecycle.ts`'s own `accountDeliveryHold()`) identically to
`DISABLED` or `UNSETTLED`.

Fixed by extracting the connection-status derivation into
`deriveConnectionStatus()` (pure, exported, unit-tested without a database)
and having it call `accountDeliveryHold()` — the same canonical mapping the
merchant-facing delivery tier already uses — instead of re-deriving a cruder
one. `metaDisableReason` is now surfaced on `WorkspaceOpsRow` and appended to
the headline as a raw code (`"... (سبب Meta: 3)"`), not a fabricated label —
see the consumer handoff doc for why no label table was built.

```
CANNOT_BE_REPRODUCED_LIVE   irrelevant — this was a pure logic defect,
                             confirmed by tracing syncAccount.ts:325-331's
                             write path end-to-end, not a live symptom needing
                             live reproduction
GRACE_PERIOD_RECLASSIFIED   BLOCKED → WARNING (a real behavior change,
                             correcting a false-alarm, not a cosmetic one)
```

## 4. Fix 2 — the Meta usage readiness numbers

`src/services/metaUsageTracker.ts` was Redis-only: `emptyStats(false)` returns
hard zeros, not a degraded-but-honest fallback, whenever Redis is absent. That
is the direct, provable root cause of "readiness 0/500" and "error-rate window
0/500" — production has never had `REDIS_URL` configured (established in the
prior mission's close-code record), so every readiness read has always hit
this path, permanently, not intermittently.

Fixed with three additive Prisma models
(`prisma/migrations/20260823120000_add_meta_usage_durable_store`):
`MetaUsageDailyCounter` (one row per UTC day), `MetaUsageRecentCall` (capped
at 500 rows), `MetaUsageLatestSnapshot` (one singleton row). Postgres is not
optional in this app the way Redis is, so it is the correct durable home for a
counter this module's callers depend on for a real go/no-go decision — the
same reasoning that makes every OTHER Redis consumer in this codebase already
fall back to something functionally equivalent, which this one alone did not.

`MetaUsageStats.redisAvailable` keeps its name (two frozen Admin presentation
pages read it as untyped client JS) but now means "durable store reachable" —
true in production instead of permanently false.

```
META_USAGE_PERSISTENCE_BEFORE   Redis-only; emptyStats(false) whenever
                                 REDIS_URL unset (always, in production)
META_USAGE_PERSISTENCE_AFTER    Postgres-backed; emptyStats(false) only if
                                 the database itself is unreachable
LIVE_DB_ROUND_TRIP_TESTED_HERE  NO — no Postgres in this sandbox; see §7
```

## 5. Fix 3 — the graph's one misleading edge

`src/graph/architecture.ts` drew `QUEUE --DEPENDS_ON--> redis` (and the
`lib/queue.ts` module → redis) as an unqualified dependency. The literal is
real (`getQueueRedis` reads `REDIS_URL`) and the conclusion a reader would
draw from it — "Redis down means the queue is broken" — is false, given the
fallback proof in §2. The `redis` node's own `what` text already said so in
prose (*"وعند غيابه تعمل بدائل داخل العملية"*); the edge kind contradicted it.

Fixed by adding an optional, typed `strength?: 'REQUIRED' | 'OPTIONAL_FALLBACK'`
field to `GraphEdge`, set explicitly on both directions this mission found:
the two Queue→Redis edges (`OPTIONAL_FALLBACK`) and, for contrast and because
it is equally true, the intelligence-layer short-circuit chain
(`REQUIRED` — `reconcileIntelligence` genuinely stops on an upstream
failure, no fallback). `graph/adapter.ts` treats an absent or unrecognised
`strength` as "not stated", the same tolerant handling already given to
`unknowns` — never a reason to refuse the edge.

```
DEPENDS_ON_EDGES_TOTAL        10  (unchanged — no new edge, no removed edge)
DEPENDS_ON_OPTIONAL_FALLBACK   5  (queue → redis × 4 queues, + queue.ts itself)
DEPENDS_ON_REQUIRED            5  (the 6-layer intelligence chain, 5 links)
GRAPH_NODES / GRAPH_EDGES    135 / 275  (unchanged from doc 06)
```

## 6. What was explicitly NOT reopened

Per the mission's own frozen-architecture list, and confirmed by full reads
this mission performed (not assumed): `PeriodInsight` semantics, the
evidence/diagnosis/decision/recommendation ownership boundary, the LLM
authority domains (`permitAction`'s veto table), Brain Observatory's
read-only contract, the exact-period reach/frequency semantics, and the JWT/
Meta-secret separation. None of these needed to change to fix the three
defects above, and none did.

`ADMIN_PRESENTATION_FILES_TOUCHED = 0` — no file under `src/web/pages/admin*`,
`src/web/adminShell.ts`, or Admin visual CSS was edited. The
`redisAvailable` field-name decision in §4 exists specifically to keep that
true.

## 7. What this sandbox could not verify live

No Postgres instance exists in this development sandbox (`pg_isready`:
`no response`; no `DATABASE_URL`). `test_operational_truth.ts` proves the
read/write logic against fake `prisma`-shaped objects (mirroring
`periodInsights.ts`'s own tested pattern) and proves the fail-safe contract —
`getMetaUsageStats()`/`recordMetaResponseHeaders()`/`recordMetaErrorCategory()`
never throw and degrade to an honest `emptyStats(false)` — against this
sandbox's own real no-`DATABASE_URL` condition. The actual round-trip against
a live Postgres, and the new migration applying cleanly, are verified
post-deploy through the same GitHub Actions relay used for prior live
evidence (this sandbox's egress proxy returns 403 on direct Railway access).

## 8. Verification

```
TYPECHECK (tsconfig.json)      PASS
TYPECHECK (tsconfig.tools.json) PASS
NEW_TEST_SUITE                 test:operational-truth — 43 passed, 0 failed
TARGETED_GUARDS                admin-os, admin-control-plane, system-graph,
                                period-rollout, period-metrics,
                                brain-observatory, session-routing,
                                deploy-gate, dependency-drift, lifecycle —
                                all green, zero regressions
TEST_ALL_RUN_1                 57 suites, 1105 assertions, 0 failed
TEST_ALL_RUN_2                 see run-2 log — compared for byte-identical
                                pass/fail counts, not just exit code
```

## 9. Known and accepted

- `metaDisableReason` is surfaced as a raw Meta code, not a label. Building a
  label table needs verification against Meta's live documentation this
  sandbox may not be able to reach; see the consumer handoff doc §1.
- The Meta usage standalone Prisma pool is capped at `max: 3`. If call volume
  ever grows enough to queue visibly against that cap, raise it — the
  fire-and-forget hook must never itself become the thing that runs Meta
  calls out of headroom.
- `MetaUsageRecentCall`'s 500-row cap is a soft cap under concurrent writes
  (a row or two of slop is possible), which is immaterial to a threshold gate
  that already approximates Meta's own measurement.
