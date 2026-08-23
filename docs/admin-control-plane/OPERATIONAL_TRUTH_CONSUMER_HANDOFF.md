# Operational truth — consumer handoff

Guidance for whoever next touches `adminOpsHealth.ts`, `metaUsageTracker.ts`,
or the architecture graph's `DEPENDS_ON` edges. The full close-out record,
with evidence and the original-symptom reconciliation, is
`22_OPERATIONAL_TRUTH_CONVERGENCE.md`. This doc is narrower and forward-facing:
what these three things now mean, and what would break the reasoning behind
them if changed carelessly.

---

## 1. `WorkspaceOpsRow.metaDisableReason`

A raw Meta `disable_reason` integer, or `null`. It is **not labeled** — unlike
`metaAccountStatus`, which is labeled by `accountDeliveryHold()` in
`src/lib/campaignLifecycle.ts`, there is no canonical mapping in this
repository from `disable_reason` codes to Arabic prose. Do not invent one from
memory. Meta's `disable_reason` values are documented on the Marketing API's
`AdAccount` reference; if a labeled version is ever built, verify each code
against that live documentation (or a canonical Meta SDK's enum) rather than
guessing, and put the mapping in `campaignLifecycle.ts` alongside
`META_ACCOUNT_STATUS` — not in `adminOpsHealth.ts`, which only ever
*consumes* account-status semantics, never defines them.

`deriveConnectionStatus()` (exported from `adminOpsHealth.ts`) appends the raw
code to the headline whenever the account is DISABLED and a reason was
synced: `"${label} (سبب Meta: ${code})"`. That is deliberately the least
committal correct thing to show — a number an operator can look up, not a
guess dressed as an explanation.

## 2. `deriveConnectionStatus()`

The token/account axis of a workspace's ops row, extracted to a pure function
specifically so it is unit-testable without a live database (see
`test_operational_truth.ts` §6). It reuses `accountDeliveryHold()` rather than
re-deriving "is this account blocked" — **that reuse is the point**. If a
future change needs a different blocked/warning split for some
`META_ACCOUNT_STATUS` code, change it in `accountDeliveryHold()`, where the
merchant-facing delivery tier (`classifyCampaignDelivery`) will pick it up
too. Two call sites disagreeing about what a Meta code means is exactly the
bug class this reuse closes off.

## 3. The Meta usage durable store

Three additive tables (`prisma/migrations/20260823120000_add_meta_usage_durable_store`):
`MetaUsageDailyCounter` (one row per UTC day), `MetaUsageRecentCall` (capped at
500 rows, trimmed on insert), `MetaUsageLatestSnapshot` (one singleton row).
`src/services/metaUsageTracker.ts` owns all three; nothing else should query
them directly, for the same reason `metaClient.ts` is the only door to Meta
itself — one place to reason about correctness beats several.

**Read/write functions take an optional `prisma?: PrismaClient` parameter.**
Pass one in a test (see `test_operational_truth.ts` for the fake-object
pattern, mirrored from `periodInsights.ts`); omit it in production code and a
lazily-created standalone client is used, exactly like `getDashboard.ts`'s
`_standalonePrisma`. That standalone client's pool is capped at `max: 3` —
deliberately small, because these are tiny fire-and-forget upserts from deep
inside `MetaClient`'s response handling, not query fan-out. If Meta call
volume ever grows enough for 3 connections to queue visibly, raise the cap;
don't remove it, or this module competes with the server's main pool for
Railway's connection ceiling.

**`MetaUsageStats.redisAvailable` keeps its name on purpose.** It no longer
means "was Redis reachable" — Redis is not used here at all any more — it
means "was the durable counter store reachable for this read". The name
survives because `src/web/pages/metaReadinessPage.ts` and
`src/web/pages/metaDataWorkspacePage.ts` read `stats.redisAvailable` as
untyped client-side JavaScript (no compiler catches a rename there), and both
are frozen Admin presentation. If you ever do get authorization to touch
those two files, a rename is a straightforward two-file follow-up; until
then, leave the name alone and trust the doc comment on the interface.

**Total error count is derived, not stored.** `errorsLast15Days` is the sum of
the six `err*Count` columns on `MetaUsageDailyCounter`, not a separate
aggregate column. `recordMetaErrorCategory()` is the *sole* writer of those
columns. Do not add a second write path for "the daily error count" — that
would recreate the two-writers-can-drift risk this design specifically
avoided.

## 4. `GraphEdge.strength`

Optional, only meaningful on `DEPENDS_ON`. `'REQUIRED'` or
`'OPTIONAL_FALLBACK'` — see `docs/admin-control-plane/06_SYSTEM_GRAPH_SCHEMA.md`
for the full rationale. When adding a new `DEPENDS_ON` edge: if the dependent
has a proven, tested fallback (the way `enqueueOrFallback()` is proven at
every `lib/queue.ts` call site), mark it `OPTIONAL_FALLBACK`. If losing the
target genuinely stops the dependent — no fallback, no degraded mode — mark
it `REQUIRED`. If you are not sure which, that uncertainty is itself worth
recording in the edge's `unknowns`-equivalent (there is no such field on an
edge; put it in the source node's `unknowns` instead, or leave `strength`
unset rather than guess). An unset `strength` is a legitimate "not stated",
not an error — the adapter accepts it, and always has.

## 5. What was deliberately NOT done

- **No live-Postgres integration test exists for the durable store**, because
  no live Postgres exists in this development sandbox. `test_operational_truth.ts`
  proves the read/write logic against fake `prisma`-shaped objects and proves
  the fail-safe contract (never throws, degrades to `emptyStats(false)`)
  against the sandbox's real no-`DATABASE_URL` condition. The actual
  round-trip is verified live, post-deploy, the same way Gate B period-fact
  evidence was verified in the prior mission: through the deployed
  environment, not this sandbox.
- **No `disable_reason` label table.** See §1.
- **No change to `metaCapabilityProbe.ts`, `lib/redis.ts`, `lib/queue.ts`, the
  webhook debounce, or the OAuth session store.** All five were read in full
  during this mission's investigation and found already correct — Redis-optional,
  fallback-proven, or already reporting `NOT_TESTED` rather than a fabricated
  verdict. Reopening any of them without a proven regression would be solving
  a problem that does not exist.
