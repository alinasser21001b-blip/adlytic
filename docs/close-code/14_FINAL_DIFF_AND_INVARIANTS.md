# 14 — Final diff and invariants

## What changed in this closure

| Area | Change | Kind |
|---|---|---|
| `analytics/confidence.ts` | PARTIAL doc widened to its real meaning | semantics |
| `services/entityIntelligence.ts` | `dataConfidence` measured; period reach/frequency read; `favg` and `max(daily reach)` removed | **behaviour** |
| `analytics/funnel/compute.ts` | `reach` nullable; unknown-count vs unknown-ratio separated; chain resumes | **behaviour** |
| `analytics/funnel/diagnose.ts` | a known count may serve as denominator when only the ratio was gated | **behaviour** |
| `analytics/objectiveKpiCards.ts` | reach renders `—` when absent | presentation |
| `analytics/metricDictionary.ts` | reach/frequency → `meta_period_value` | contract |
| `services/metaClient.ts` | period-scoped insights read | ingestion |
| `services/periodInsights.ts` | **new** — period fact owner | ingestion |
| `workers/syncPeriodInsights.ts` | **new** — the writer, with bounded retention | ingestion |
| `lib/analysisWindow.ts` | **new** — the one window definition | correctness |
| `prisma/schema.prisma` + migration | `PeriodInsight` (additive) | schema |
| `services/getDashboard.ts` | `authorityRelation` beside `permitted` | labelling |
| `types/cmoFeed.ts` | `authorityRelation` field | contract |
| `web/pages/adminSurfaceNav.ts` | rewritten as the IA | presentation |
| `web/pages/adminStatus.ts` | **new** — status vocabulary | presentation |
| `web/pages/adminConsolePage.ts`, `adminOsPage.ts` | render the shared map | presentation |
| `api/server.ts` | token moved out of the URL | **security** |

## Invariants now mechanically enforced

**Data validity** — ambiguous coverage cannot report COMPLETE; a single missing
day caps confidence at MEDIUM; a fully covered span still reaches HIGH.

**Period metrics** — reach and frequency are Meta's period value or UNKNOWN.
Never `max(daily reach)`, `sum(daily reach)`, `average(daily frequency)` or
`impressions ÷ max(daily reach)`. A neighbouring span is a miss. A storage
failure is UNKNOWN. UNKNOWN frequency withholds fatigue; a real Meta frequency
still fires it.

**Analysis window** — one import-free definition, used by writer and reader.

**Action authority** — `actionAudit` has set equality with
`PERMIT_ACTION_DOMAIN`; no DecisionEngine outcome is labelled `NOT_VETOED`;
`REFRESH_CREATIVE` overlaps both domains and stays FORBIDDEN under POST_CLICK;
`permitAction`'s vacuity outside its domain is demonstrated, not argued.

**LLM** — no `brainAction*` field on `llmLayer`; the canonical decision names
DecisionEngine; the page renders it under DECISION.

**Observatory** — zero writes across any model, any write method, raw SQL and
`$transaction`; no queue, Meta writer or sync module in its module graph; no
threshold, no metric arithmetic, no network call.

**Admin** — one map; the Observatory navigable; no empty sections; no dead
menu entries; no orphaned pages; eight status pairs render distinctly; all 40
admin APIs and every page route guarded; no UI intelligence re-derivation.

**Deployment** — additive migration; reader safe without the table; writer
non-fatal without it; empty table is UNKNOWN not zero; writer idempotent;
backfill bounded by construction.

**Security** — no committed secret; no token in any URL.

## Negative-tested guards

Each planted, confirmed failing, restored byte-identically (SHA-256):

1. Observatory ratio arithmetic — `w.cur.linkClicks / w.cur.impressions`.
2. Metric identity — stored `ctr` set equal to link CTR.
3. Action-authority domain equality — `KEEP_COLLECTING` added to the audit
   (failed **five** independent assertions).
4. Admin intelligence containment — `detectAnomaly()` in an admin page.

---

## Final closure cycle — what changed on top of `094a37b`

| Area | Change | Kind |
|---|---|---|
| `Dockerfile` | **new** — the image is built from the repo, declaring no `ARG` | **security** |
| `railway*.json` / `railway*.toml` | all seven move to the `DOCKERFILE` builder | **security** |
| `nixpacks.toml` | kept as a fallback, and now says so | governance |
| `lib/advisoryLock.ts` | in-process reservation; unlock result no longer discarded | **correctness** |
| `workers/syncAccount.ts` | both inline lock pairs moved onto the shared helpers | **correctness** |
| `services/brainObservatory.ts` | `dataConfidence` explained as it is actually produced; `legacyDataStatus*` renamed | provenance |
| `web/pages/brainObservatoryPage.ts` | "Deprecated legacy status" → "Coverage gate (DATA_VALIDITY input)" | presentation |
| `services/agent/tools/getCampaignDetails.ts` | `startedAt` is null, not `createdAt`; adds `firstSeenInAdlyticAt` | **data integrity** |
| `lib/campaignFreeze.ts` | persists a null start rather than a fabricated one | **data integrity** |
| `.github/workflows/verify-live.yml` | read-only build-log evidence for Gate A | observability |
| `.github/workflows/test.yml` | `Dockerfile`, `.dockerignore` in both path lists | governance |

## Invariants added this cycle

**Build** — the Dockerfile declares no `ARG`, no credential-shaped `ENV`, and
does set `NODE_ENV`; `.dockerignore` keeps `.env` out of the context; no
railway config may silently return to the Nixpacks builder.

**Locking** — one contract: no module outside `lib/advisoryLock.ts` issues
advisory SQL; two concurrent same-account pipelines never overlap under a
*session-accurate* fake; and the fake's re-entrancy is itself asserted, so it
cannot quietly become stricter than Postgres and go vacuous.

**Lifecycle** — no module substitutes `Campaign.createdAt` for a Meta
`start_time`, checked with comments stripped, plus a non-vacuous check that
`started_at` really is nullable.

**Provenance copy** — the Observatory's explanation of `dataConfidence` must
match how `entityIntelligence.ts` actually produces it, in both directions.

## Negative-tested guards, this cycle

Each planted, confirmed failing, restored byte-identically (SHA-256):

5. Producer reverted to a constant; the limit-of-claim sentence dropped; the
   prose reasserting "hardcoded constant"; settlement merged into completeness.
6. Build-log field queried without introspecting for it; build-log messages
   printed raw instead of reduced to identifiers.
7. `ARG` declared for a secret; credential-shaped `ENV`; `NODE_ENV` removed;
   a service reverted to `NIXPACKS` (in **both** the JSON and TOML spellings —
   the first pattern matched only TOML, and the negative test is what caught
   it); `.dockerignore` no longer excluding `.env`.
8. Advisory-lock helper reverted to the pre-fix version → mutual exclusion
   fails; the fixture made strict again → the fidelity check fails;
   `syncChunked` reverted to its own raw SQL → the one-contract check fails.
9. Each lifecycle module reverted to the `createdAt` proxy.
