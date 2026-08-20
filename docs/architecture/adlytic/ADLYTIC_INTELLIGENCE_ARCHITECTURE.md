# Adlytic Intelligence Architecture — Post-Remediation Truth

**Status:** current as of `claude/adlytic-graphify-analysis-ai34bu`, Phase 8 (`72a2521`).
**Extends:** `docs/ANALYTICS_ARCHITECTURE_FINAL.md` — still accurate for the analytics
pipeline it describes; its content is absorbed below (§§1-4, 9) and extended with
everything outside that pipeline's original scope (Meta cordon, sync, purge, V5, DTO
purity — §§1, 5-8).
**Supersedes** (each now carries a banner pointing here): `AUDIT_REPORT.md`,
`AUDIT-REPORT.md`, `AUDIT_INDEX.md`, `docs/RESULT_SEMANTICS_DESIGN.md`,
`ADLYTIC_MASTER_ARCHITECT_AUDIT_2026.md`, `ADLYTIC_MASTER_ARCHITECT_AUDIT_2026_V2.md`,
`CMO_FEED_ARCHITECTURE.md`.
**Companion (unchanged, still locked and enforced):** `docs/ANALYTICS_RULES.md`.
**This document describes what the runtime actually does**, verified by reading the
current source and by the test suites named per section — not what any prior plan
intended it to do. Where two conclusions could plausibly follow, the section says so.

---

## 0. What this document is for

A multi-phase remediation (this repo's Phases 0 through 8, tracked on this branch)
consolidated what had become several independently-evolved intelligence subsystems —
duplicate anomaly detection, an unwired suppression mechanism, a Meta-cordon bypass, an
unlocked sync window, an orphaned purge path, three copies of a confidence-band threshold —
into one explainable chain with one authority per layer. This document is the resulting
map: who owns each decision, what feeds it, what it produces, who's allowed to read it, and
which legacy paths still exist alongside it and why they haven't been deleted.

---

## 1. The chain, end to end

```
Meta Graph API
      │
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ META INGESTION CORDON      mappers/insightMapper.ts,               │
│                            mappers/creativeMapper.ts                │
│ Meta field names / actions[] / creative shapes stop here.           │
│ mapMetaInsight() / mapMetaBreakdownInsight() resolve the ONE        │
│ canonical count per business event (never sum overlapping action    │
│ representations — Rule 10). Every consumer of a Meta payload must   │
│ go through this layer; nothing downstream re-reads raw Meta JSON.   │
└───────────────────────────────────────────────────────────────────┘
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ SYNC (write path)          workers/syncAccount.ts,                  │
│                            workers/backgroundScheduler.ts            │
│ One per-account Postgres advisory lock (lib/advisoryLock.ts) now    │
│ covers the FULL 6-phase sequence for both the scheduler and the     │
│ BullMQ/manual path — same account serializes, different accounts    │
│ run concurrently. daily_stats is written through ONE function       │
│ (repositories/dailyStatsRepo.ts::upsert), keyed so re-sync           │
│ converges instead of duplicating.                                   │
└───────────────────────────────────────────────────────────────────┘
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ STORAGE                    DailyStat / RawInsight                   │
│ Per-type counters, including Meta's OWN reported ctr/cpm/frequency/  │
│ roas — never a derived "results" column. A canonical per-day field  │
│ (e.g. daily_stats.cpm) is read directly by every consumer that has   │
│ it; it is not re-derived from spend÷impressions downstream.          │
└───────────────────────────────────────────────────────────────────┘
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ SEMANTIC CLASSIFICATION    lib/campaignPurpose.ts, lib/objectiveKpis │
│ destination → optimization goal → objective → purposeFamily.        │
│ resultInfoId/efficiencyInfoId (which glossary entry explains this    │
│ family's result/efficiency metric) are resolved HERE and forwarded   │
│ on the DTO — the client does not re-derive them from resultKey.      │
└───────────────────────────────────────────────────────────────────┘
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ RESULT SEMANTICS           analytics/resultSemantics.ts              │
│ resultKey ≠ businessOutcome ≠ unit; mixed-objective accounts get     │
│ per-unit results only, never a fabricated cross-unit sum.            │
└───────────────────────────────────────────────────────────────────┘
      ▼
      ├─────────────────────────────┬─────────────────────────────────┐
      ▼                             ▼                                 ▼
┌───────────────────┐   ┌─────────────────────────┐    ┌──────────────────────────┐
│ PIPELINE A         │   │ PIPELINE B               │    │ AI-TOOL ADAPTER          │
│ engines/rules/     │   │ analytics/funnel/         │    │ services/agent/tools/    │
│ detect*.ts          │   │  diagnose.ts (WHERE broke)│    │  detectAnomaly.ts        │
│ 5 metric/pattern-   │   │ analytics/intelligence/   │    │ 30-day z-score scan,     │
│ level detectors →   │   │  anomaly.ts (IS it        │    │ NOT persisted. Fetches   │
│ Evidence[] →         │   │  unusual?)                │    │ detected_issues for the  │
│ detected_issues      │   │ analytics/intelligence/   │    │ same entity/window and   │
│ (Prisma table)       │   │  hierarchy.ts             │    │ suppresses/labels any    │
└─────────┬──────────┘   │  ::reconcileIntelligence()│    │ finding a canonical issue│
          │               │  — "weakest link wins",   │    │ already explains — never │
          │               │  emits suppressedIssueCodes│   │ a second authority for   │
          │               └──────────┬────────────────┘    │ the same metric/entity.   │
          │                          │                     └──────────────────────────┘
          ▼                          ▼
┌───────────────────┐   ┌─────────────────────────┐
│ engines/rules/      │   │ analytics/intelligence/   │
│  diagnose.ts        │   │  objectiveHealth.ts       │
│ (pattern-level      │   │ (funnel/objective health, │
│  diagnosis)         │   │  weighted over applicable │
│                     │   │  facets only)             │
└─────────┬──────────┘   └──────────┬────────────────┘
          │                          ▼
          │               ┌─────────────────────────┐
          │               │ analytics/intelligence/   │
          │               │  recommend.ts             │
          │               │ (funnel-aware             │
          │               │  recommendation)          │
          │               └──────────┬────────────────┘
          └──────────┬───────────────┘
                      ▼
┌───────────────────────────────────────────────────────────────────┐
│ DECISION ARBITRATION       web/pages/dashboard/sections/            │
│                            commandCenter.ts::ccRenderAction()        │
│ permitAction() structurally forbids advice that contradicts the     │
│ diagnosis (e.g. REFRESH_CREATIVE under a POST_CLICK verdict) —       │
│ covers V1_RULES, recommend.ts's vocabulary, AND AI_AGENT's           │
│ vocabulary (widened Phase 5). getDashboard.ts filters                │
│ issues/issueRecords/diagnoses/merchantTasks by                      │
│ accountIntelligence.suppressedIssueCodes BEFORE either hero card     │
│ renders, so #command-center and #main-move-card cannot disagree     │
│ about a phenomenon the funnel already explained.                    │
└───────────────────────────────────────────────────────────────────┘
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ LLM EXPLANATION            adAssessor/*, api/server.ts's /ai/chat    │
│ Narrates the structural verdict; cannot override it (Phase 3.5      │
│ authority boundary — ad-assessor prompt). For /ai/chat specifically, │
│ formatCanonicalGroundingForV5Context() prepends an unconditional     │
│ "this section is correct, treat conflicting content below as         │
│ secondary" block whenever V5 context is used (Phase 5) — see §7.     │
└───────────────────────────────────────────────────────────────────┘
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ DTO                        services/getDashboard.ts (DashboardDTO), │
│                            campaign-inspector / campaigns-list       │
│                            routes in api/server.ts                  │
│ Canonical facts only. Per-day series read stored canonical fields    │
│ (cpm, ctr, frequency) rather than recomputing them; window/aggregate │
│ metrics (avgCpm, cost-per-result) are legitimately computed here      │
│ from canonical inputs, since no stored field exists for an arbitrary │
│ custom-range aggregate.                                              │
└───────────────────────────────────────────────────────────────────┘
      ▼
┌───────────────────────────────────────────────────────────────────┐
│ UI                         web/pages/*.ts                            │
│ Formats, visualizes, derives PRESENTATION ONLY (chart series          │
│ interpolation, unit conversion, glossary-id lookup FROM the DTO       │
│ field, not re-derived). Does not decide canonical metric identity,   │
│ objective semantics, anomaly, diagnosis, or recommendation.           │
└───────────────────────────────────────────────────────────────────┘
```

**Orthogonal to the chain above** (not a pipeline stage, but load-bearing):

- **Purge** — `services/accountDataPurge.ts::purgeAccountAnalytics()` is the one function
  every deletion path (self-service account deletion, Meta disconnect, Meta's data-deletion
  callback, admin console) now calls. See §6.
- **V5** — `engines/intelligence/AdlyticIntelligenceSystem.ts` is a separately-evolved,
  still-live intelligence system that feeds `/ai/chat` context. It is not part of the chain
  above and does not gate the primary CTA, but it is a real second source of narrative facts
  for the chat LLM. See §7 — this is the one area where "one authority" is enforced by a
  boundary/labeling discipline rather than by elimination.

---

## 2. Canonical ownership authority table

| Layer | Owner | Input | Output | Persistence | Consumers | Legacy / alternate paths |
|---|---|---|---|---|---|---|
| Meta ingestion cordon | `mappers/insightMapper.ts` (`mapMetaInsight`, `mapMetaBreakdownInsight`), `mappers/creativeMapper.ts` (`mapMetaCreative`, `isCarouselCreative`) | Raw Meta Graph API insight/creative rows | `NormalizedInsight`, normalized creative fields | none (pure mapping) | `syncAccount.ts`, `v2ContextAssembler.ts`, AI agent tools (`getCreativePerformance.ts`, `analyzeCreativePatterns.ts`) | `MetaClient`/`MetaOAuth`/`metaCapabilityProbe`/the ad-library adapter are legitimate transport layers, not cordon bypasses — they fetch, they don't reinterpret. No known live bypass remains (Phase 6A closed the last two: `v2ContextAssembler.ts`'s own action-count reimplementation, and the two divergent carousel detectors). |
| Sync write path | `workers/syncAccount.ts` (`SyncAccountWorker.sync()` / `syncAccountLevelDataLocked()`), `workers/backgroundScheduler.ts` (`syncAllAccounts()`) | Cordoned `NormalizedInsight`s | `DailyStat`, `Campaign`, `AdSet`, `Ad` rows | Postgres, via `repositories/dailyStatsRepo.ts::upsert` (keyed, idempotent) | Every downstream layer | None — `sync()` and the scheduler both funnel through `syncAccountLevelDataLocked()`; there is one write path, gated by one advisory lock per account (§5). |
| Semantic classification | `lib/campaignPurpose.ts`, `lib/objectiveKpis.ts` | `Campaign.objective`, ad-set destination/optimization goal | `purposeFamily`, `ObjectiveKpiSpec` (resultKey, efficiencyKey, resultInfoId, efficiencyInfoId) | none (resolved per read; `Campaign.objective` itself is stored verbatim, never overwritten) | `getDashboard.ts`, campaigns-list/inspector routes in `server.ts`, `campaignsPage.ts` | None with authority — `campaignsPage.ts`'s old client-side `resultInfoId` re-derivation ternary was a bypass (silently wrong for `linkClicks`) and was removed in Phase 8; the client now reads the server-forwarded field. |
| Result semantics | `analytics/resultSemantics.ts` | Per-campaign `resultUnit`/`resultDailyColumn`, per-day counters | Unit-safe result counts; `null` (not a fabricated sum) on mixed-objective accounts | none | `getDashboard.ts`, `campaignsPage.ts`, `weeklyReport.ts`, AI agent tools | None. |
| Anomaly — pattern/metric level | `engines/rules/detect*.ts` (5 detectors) → `Evidence[]` | Period-trend `Signals` | `Evidence[]` | `detected_issues` (Prisma) | `engines/rules/diagnose.ts`, `getDashboard.ts`'s issues/issueRecords, knowledge lookup | `services/agent/tools/detectAnomaly.ts` is a genuinely independent 30-day z-score scan (different question: is this metric statistically unusual against ITS OWN baseline, not "did a rule threshold fire"). Not persisted. Since Phase 4 it cross-references `detected_issues` for the same entity/window and labels any finding a canonical issue already covers as supplementary/non-authoritative rather than standing alone. |
| Anomaly — funnel-stage level | `analytics/intelligence/anomaly.ts` (`detectAnomaly`, funnel-scoped) | Funnel break from `analytics/funnel/diagnose.ts` | Anomaly verdict (`SIGNIFICANT` / `NOT_SIGNIFICANT`) | none (computed per read) | `analytics/intelligence/hierarchy.ts::reconcileIntelligence()` | None — this answers a different question than the pattern-level detectors above (is the *funnel break* unusual, not is *this metric* unusual) and the two do not compete for the same verdict. |
| Diagnosis — pattern level | `engines/rules/diagnose.ts` | `Evidence[]`, `detected_issues` | `Diagnosis` | none (derived per read from `detected_issues`) | `getDashboard.ts`'s `diagnoses`/`merchantTasks` | None. |
| Diagnosis — funnel/objective level | `analytics/funnel/diagnose.ts`, `analytics/intelligence/hierarchy.ts::reconcileIntelligence()`, `analytics/intelligence/objectiveHealth.ts` | Funnel stages, funnel anomaly verdict, fatigue signal | Funnel break classification, health score, `suppressedIssueCodes`, `forbiddenActions` | none (computed per read) | `services/entityIntelligence.ts::buildEntityIntelligence()` → `dashData.intelligence`; `getDashboard.ts` filters pattern-level issues by `suppressedIssueCodes` before they reach `#main-move-card` (Phase 5 — closed the two-hero-card competing-authority defect) | None. |
| Evidence contract | Canonical `Evidence` type (established pre-Phase-4; see `test_evidence_contract.ts` / `test_evidence_authority_boundary.ts`) | Detector output | Structured `Evidence` (metric, direction, magnitude, window, corroboration) | `detected_issues.evidenceJson` | `diagnose()`, knowledge lookup, `getDashboard.ts`'s `evidence` field on each issue (now typed `Record<string, unknown> & { knowledgeBase?: MetricBreach }` rather than fully opaque — Phase 8) | LLM narration may rephrase evidence but may not originate it (Phase 3.5 authority boundary, `adAssessor`). |
| Decision / recommendation | `analytics/intelligence/recommend.ts` (funnel-aware), `web/pages/dashboard/sections/commandCenter.ts::ccRenderAction()` + `permitAction()` (arbitration/guard) | Diagnosis, health score, action vocabulary | Guarded primary CTA | `Recommendation` (Prisma, for the persisted/flat-list path) | `#command-center`, the flat `/recommendations` route, `recommendationsPage.ts` | `saveRecommendation.ts`'s AI_AGENT vocabulary writes into the same `Recommendation` table and is now covered by `permitAction()`'s guard (widened Phase 5 — previously only V1_RULES/`recommend.ts` codes were recognized). |
| Recommendation persistence | `services/saveRecommendation.ts` | Recommendation decision (any producer) | `Recommendation` row | Postgres | Flat `/recommendations` route, execution service | `reasoningChainJson` (AI_AGENT provenance) is write-only — no page/DTO reads it — and is now omitted from the flat route's response (Phase 7; it was going out over the wire unfiltered to any workspace member for no product reason). |
| Sync concurrency (lock) | `lib/advisoryLock.ts` (`tryAcquireAdvisoryLock`, `releaseAdvisoryLock`), held across the full 6-phase sequence by both `workers/syncAccount.ts::sync()` and `workers/backgroundScheduler.ts::syncAllAccounts()`'s per-account loop | Account id (hashed to a Postgres advisory-lock key) | Non-blocking `acquired: boolean` | Postgres session-scoped advisory lock (not a table row) | Both sync entry points | Before Phase 6B, the scheduler held the lock only for phase 1 and ran phases 2-6 unlocked, while the BullMQ/manual path (`syncChunked()`) held it for the whole pipeline — a real same-account race. Closed by extracting `syncAccountLevelDataLocked()` (lock-free body) and having both callers acquire once, run the full sequence, release once. |
| Data purge | `services/accountDataPurge.ts::purgeAccountAnalytics()` | `accountId` | Deletes all per-account analytics/intelligence rows in one transaction | N/A (deletion) | Self-service account deletion, Meta disconnect, Meta data-deletion callback, `adminConsole.ts::deleteCustomer()` | Before Phase 6C, `adminConsole.ts` maintained its own drifted 14-table list (missing `campaignIntelligenceReport` and its cascade children) and `purgeAccountAnalytics()` itself didn't cover `campaignBrainSnapshot`/V5's tables — every deletion path orphaned V5 data. Now `adminConsole.ts` delegates to the canonical function, which covers both. |
| V5 (legacy, still live) | `engines/intelligence/AdlyticIntelligenceSystem.ts` | Its own signal/rule computation over Meta data | `campaign_intelligence_reports`, `campaign_signals`, `campaign_issues`, `campaign_recommendations` | Postgres (own tables, `onDelete: Cascade` from children to the parent report) | `services/aiContextBuilderV5.ts` (preferred context source for `/ai/chat` when a report exists), `get_campaign_details` AI agent tool | Not merchant-facing-authoritative for the primary CTA (never reaches `#command-center` or `#main-move-card`) but IS a live input to what the chat LLM can say. See §7 for the authority-boundary treatment, not elimination. |
| DTO | `services/getDashboard.ts` (`DashboardDTO`), campaigns-list/inspector routes in `api/server.ts` | Every layer above | JSON response | none (assembled per request) | All `web/pages/*.ts` | None with authority. Phase 8 closed 5 instances where a DTO builder recomputed `cpm` from `spend÷impressions` instead of reading the canonical stored `daily_stats.cpm` (getDashboard.ts, the campaign-inspector route, and — found in the same sweep — `detectAnomaly.ts`'s z-score extractor, which is upstream of the DTO but the same defect class). |
| UI | `web/pages/*.ts`, `web/layout.ts` | DTO | Rendered HTML + client-side chart/format logic | none | Merchant browser | Presentation-only derivation confirmed legitimate and left untouched: cost-per-result's client-side `spend ÷ results` (mirrors `getDashboard.ts`'s own `buildResultsAndCostSeries` formula exactly, gated by the same server-resolved single-unit check); window-aggregate CPM in AI agent tools (no canonical field exists for an arbitrary custom-range sum). The confidence-band threshold (0.75/0.5, normalize+clamp) was triplicated across `dashboardPage.ts`/`beginnerDashboardPage.ts`/`diagnoses.ts` and is now one shared `confBadge()` in `web/pages/dashboard/lib/confidence.ts`. |

---

## 3. Campaign semantic model

Unchanged from the analytics architecture this document absorbs — four concepts,
deliberately never collapsed:

| Concept | Example | Origin |
|---|---|---|
| `campaignObjective` | `OUTCOME_ENGAGEMENT` | Meta, raw, immutable |
| `optimizationGoal` | `POST_ENGAGEMENT` | Meta ad set |
| `destinationType` | `WHATSAPP` | Meta ad set |
| `purposeFamily` | `messaging` | resolved, canonical (`lib/campaignPurpose.ts`) |
| `resultKey` | `messages` | the platform event counted |
| `businessOutcome` | `qualified_conversations` | what the merchant buys |
| `unit` | `conversation` | what kind of thing it is |

---

## 4. Anomaly ownership — three systems, three different questions

Not "5 canonical detectors + imposters" — three genuinely independent systems that answer
different questions on different inputs, verified non-competing at the raw-verdict level
(none of them can produce a contradictory merchant-facing verdict for the same
metric/entity/window without a suppression or labeling mechanism catching it first):

1. **Pattern/metric level** (`engines/rules/detect*.ts`) — *did this specific metric cross
   a rule threshold against its period trend?* Persisted to `detected_issues`.
2. **Funnel-stage level** (`analytics/intelligence/anomaly.ts`) — *is the funnel break
   `analytics/funnel/diagnose.ts` found actually unusual, or just a break?* Not persisted;
   feeds `reconcileIntelligence()` directly.
3. **AI-tool z-score** (`services/agent/tools/detectAnomaly.ts`) — *is this metric
   statistically unusual against its own 30-day baseline?* Not persisted. Cross-references
   `detected_issues` for the same entity/window (Phase 4) and labels any finding a canonical
   issue already explains as supplementary, non-authoritative — it does not stand alone as a
   second verdict for the same phenomenon.

The one real overlap between (1) and (2) — fatigue — is coordinated at the reconciliation
layer, not by cross-wiring the detectors: `reconcileIntelligence()` computes
`suppressedIssueCodes` (e.g. a `DELIVERY`-classified break suppresses `HIGH_FREQUENCY`; a
`POST_CLICK`/`CONVERSION` break suppresses `LOW_CTR`, `HIGH_FREQUENCY`, `AUDIENCE_FATIGUE`).
This mechanism predates this remediation (see `hierarchy.ts`'s `P5.1`/`P5.3`/`P5.4`/`P5.6`
comments) but was computed and never consumed — `getDashboard.ts` built `issues`/
`issueRecords`/`diagnoses`/`merchantTasks` straight from `detected_issues` with no reference
to it. Phase 5 wired it in: `buildEntityIntelligence()` now forwards `suppressedIssueCodes`
on its returned object (mirroring the pre-existing `forbiddenActions` forwarding), and
`getDashboard.ts` filters `detected_issues` by it before anything downstream consumes them.

**Verified by:** `test_anomaly_authority.ts` (18 assertions), `test_intelligence.ts` (26
assertions, P5 hierarchy suite).

---

## 5. Sync concurrency

Both sync entry points — the scheduler's per-account loop and the BullMQ/manual
`syncChunked()` path — share one hashed-per-account Postgres advisory lock
(`lib/advisoryLock.ts`). Before Phase 6B the scheduler acquired it only for phase 1
(account-level daily stats) and ran phases 2-6 (campaigns, ad sets/ads, ad insights,
breakdowns, refresh) unlocked, while the BullMQ path held it across its entire pipeline —
meaning a concurrent manual/BullMQ sync for the same account could run fully in parallel
with the scheduler's unlocked phases and act on a divergent DB snapshot (most writes are
idempotent upserts, but campaign-archival and freeze-trigger detection read a snapshot at
each flow's start).

**The fix reuses the existing lock, not a new one.** `workers/syncAccount.ts::sync()` was
split into the lock acquire/release wrapper plus `syncAccountLevelDataLocked()` (the
unchanged original body, minus its own lock handling). Both `sync()` (external callers:
`runSync.ts`, `test_worker.ts`) and the scheduler's per-account loop now call
`syncAccountLevelDataLocked()` after acquiring the SAME lock once, across the full sequence.
Prisma's connection pooling meant the scheduler could not simply acquire the same lock its
own `sync()` would try to acquire internally and rely on session-level reentrancy — a nested
acquire is not guaranteed to land on the same underlying Postgres session, so a naive nested
lock could spuriously fail against the caller's own held lock. Extracting the lock-free
variant avoids the question entirely.

**Verified behaviorally, not by inspection:** `test_meta_cordon_sync_purge.ts`'s 6B suite
runs a faithful in-memory simulation of Postgres advisory-lock semantics under genuine
`Promise.all` concurrency, proving same-account mutual exclusion and different-account
concurrency against the real `tryAcquireAdvisoryLock`/`releaseAdvisoryLock` functions.

---

## 6. Data purge ownership

`services/accountDataPurge.ts::purgeAccountAnalytics()` is the single function every
deletion path calls: self-service account deletion, Meta account disconnect, Meta's
data-deletion callback, and (since Phase 6C) `adminConsole.ts::deleteCustomer()`. Before
Phase 6C, `adminConsole.ts` maintained its own independent ~30-line transaction with 14
hardcoded `deleteMany` calls that had drifted from the canonical function — it included
`campaignBrainSnapshot` (which the canonical function didn't), and neither list covered
V5's tables (`CampaignIntelligenceReport` and its `onDelete: Cascade` children
`CampaignSignal`/`CampaignIssue`/`CampaignRecommendation`) at all — every deletion path in
the codebase orphaned V5 data permanently. The fix added both gaps to the canonical
function and made `adminConsole.ts` delegate to it instead of maintaining a second list.

**Verified by:** `test_meta_cordon_sync_purge.ts`'s 6C suite (source-level: both purge call
sites reference the same tables; `adminConsole.ts` has no independent list left).

---

## 7. V5 — status and authority boundary

V5 (`engines/intelligence/AdlyticIntelligenceSystem.ts`) is a separately-evolved
intelligence system, not a dormant shadow: `services/aiContextBuilderV5.ts` is tried
*first* when assembling `/ai/chat` context, falling back to V1 (canonical) context only
when no V5 report exists yet, and a second live reader (the `get_campaign_details` agent
tool) also reads its tables. It has its own 5 "expert rules" that duplicate canonical
detectors, with one confirmed drift (a rising-cost-per-result threshold that differs from
the canonical rule). It is not touched by this remediation beyond the boundary fix below —
per the user's explicit instruction, V5 retirement is out of scope for this program and
would need a dedicated strangler-sequence (redirect reads → prove parity → stop writes →
prove no callers → remove code), not a forced removal now.

**The authority question that matters is not "does V5 occupy the primary CTA slot"** (it
doesn't — `#command-center` and `#main-move-card` are both built exclusively from canonical
Pipeline A/B output) **but "can V5 make the chat LLM state a fact canonical output would
not corroborate."** Before Phase 5, V5 content was preferred with no labeling — a merchant
asking the chat assistant a question could receive an answer grounded in V5's independently
-derived issues/recommendations (including its known-diverged threshold) with nothing
marking it as secondary to canonical `detected_issues`/Evidence/`diagnose()` output.

**The fix:** `formatCanonicalGroundingForV5Context()` builds an unconditional block —
`problemClass`/confidence/recommendation/`priorityAction` from the canonical, reconciled,
`permitAction()`-guarded verdict — and `api/server.ts`'s `/ai/chat` route prepends it
whenever V5 context is used. The block's own text is explicit: *"if anything below
conflicts with this canonical verdict on a numeric fact, a diagnosis, or a recommended
action, THIS section is correct — treat the conflicting content below as a secondary,
unreconciled opinion, not as an equally-valid alternative."* This is a labeling/boundary
discipline, the same pattern Phase 3.5 established for Brain narration — not elimination,
because V5 was confirmed load-bearing (a real, current data source), not dead.

**Verified by:** `test_diagnosis_decision_ownership.ts` §3 (returns null with nothing to
compare against; surfaces the canonical block labeled AUTHORITATIVE; a conflicting V5
narrative cannot out-rank the unconditional rule text).

**Disposition of the remaining named candidates** (Phase 7): `ai_anomaly_states` /
`AiAnomalyState` — a real migration created the table, zero application code references it
anywhere in `src/` (re-confirmed by grep at Phase 7's own pre-flight) — classified
`DEAD_SCHEMA_CANDIDATE`, not dropped (no migration executed; this program's standing
discipline is no migration unless unavoidable, and schema removal is deferred to a
dedicated cleanup pass).

---

## 8. DTO purity / frontend intelligence containment

The UI may format, visualize, and derive **presentation only** — it must not decide
canonical metric identity, objective semantics, anomaly, diagnosis, recommendation, or KPI
calculation. Phase 8 re-verified every named candidate against current HEAD (the earlier
plan's own line references had already drifted from Phases 4-7's edits) and found a wider
instance of one defect class than originally scoped:

- **CPM per-day series recomputed instead of reading the canonical field** in five places:
  `getDashboard.ts`'s dashboard `trendSeries.cpm`, `api/server.ts`'s campaign-inspector
  `trendSeries.cpm`, `campaignsPage.ts`'s chart, `dashboardPage.ts`'s fallback-branch chart,
  and `detectAnomaly.ts`'s z-score extractor (same bug, for both `cpm` and `ctr`). All five
  now prefer `daily_stats.cpm`/`.ctr` — Meta's own reported value, written on every sync via
  `dailyStatsRepo.ts` — recomputing only when the stored field is genuinely absent.
- **`resultInfoId`/`efficiencyInfoId`** (which glossary entry explains a family's result/
  efficiency metric) never reached the DTO at 3 `server.ts` sites; `campaignsPage.ts`'s
  client-side re-derivation ternary had no `linkClicks` branch and silently showed the
  `messages` glossary entry for traffic/app campaigns. Fixed by forwarding the field
  server-side (`objectiveKpis.ts` already computed it correctly) and having the client trust
  it, matching the existing `resultLabelAr`/`efficiencyLabelAr` fallback convention.
  `web/layout.ts`'s `METRIC_GLOSSARY` had no `link_clicks` entry at all — added.
- **Confidence-band threshold** (normalize `c>1?/100:c`, clamp to `[0,1]`, 0.75/0.5 bands)
  was reimplemented three times (`dashboardPage.ts`, `beginnerDashboardPage.ts`,
  `diagnoses.ts`); the `diagnoses.ts` copy skipped the normalize step (a latent scale bug,
  never triggered only because nothing currently feeds it a 0-100 value). Consolidated into
  `web/pages/dashboard/lib/confidence.ts` (`confBadge()`), matching the existing
  `lib/format.ts`/`lib/currency.ts` shared-JS-string pattern used to share client helpers
  across these server-rendered page bundles.
- **`evidence.knowledgeBase`** (`DashboardDTO.issues[]`) was opaque `Record<string,
  unknown>`, forcing `dashboardPage.ts::issueActionCode()` into an unverifiable defensive
  chained-guard read. Now typed `Record<string, unknown> & { knowledgeBase?: MetricBreach
  }` — the one sub-shape the client actually reads gets a real type; the rest of the field
  stays opaque because it genuinely is heterogeneous (canonical `evidenceJson` passthrough,
  possibly legacy-shaped per `issueEvidenceFieldsFromJson`).

**Investigated and found NOT to be violations** (governance requirement: don't force a
"zero" target by deleting legitimate math):

- Cost-per-result's client-side `spend ÷ results` division (`campaignsPage.ts`,
  `dashboardPage.ts`) mirrors `getDashboard.ts`'s own `buildResultsAndCostSeries` formula
  exactly, gated by the same server-resolved single-unit check (`resultsColumn`/`cprUnit`
  null on mixed accounts). No canonical per-day cost-per-result field exists for an
  arbitrary result unit — this is legitimate derived display math on two already-canonical
  numbers, not a second authority.
- The `dashboardPage.ts` main-move confidence badge line that looks asymmetric (only one
  ternary branch divides by 100) was traced through both producers and found correct:
  `confBadge()` self-normalizes any scale, and `primary.confidence` is provably always
  constructed on a 0-100 scale by `buildAllMoveItems()` and the task-derived assignments
  above that line — so the `/100` in the other branch is a known, correct conversion, not a
  guess. Documented with a comment rather than "fixed."
- Window/aggregate CPM computations in AI agent tools (`listCampaigns.ts`,
  `getCampaignDetails.ts`, `analyzeCreativePatterns.ts`, `getCreativePerformance.ts`,
  `rankCampaigns.ts`, `getAudienceBreakdown.ts`, `comparePeriods.ts`, `getHourlyPattern.ts`,
  `weeklyReport.ts`, and `server.ts`'s `avgCpm`/window-total helpers) all operate on summed
  totals across multiple rows — no canonical field exists for a custom-range aggregate, so
  computing it from canonical per-row inputs is legitimate.

**Verified by:** `test_dto_purity_containment.ts` (17 assertions) — every fix above, plus
explicit assertions that the two "not a violation" determinations are deliberately
unchanged, not silently dropped.

---

## 9. AI boundary (unchanged)

| The AI layer MAY | The AI layer MAY NOT |
|---|---|
| explain, summarize | calculate KPIs |
| translate, personalize | classify campaign purpose |
| prioritize presentation | choose the funnel stage |
| rephrase evidence | invent benchmarks or revenue |
| | change confidence |
| | override the deterministic diagnosis |
| | (V5 chat context specifically) state a fact the canonical grounding block doesn't corroborate without it being visibly labeled secondary |

Enforced by `test_analytics_architecture.ts`'s source scans (AI-layer files may not call
the resolver or the decision engines; `src/analytics/**` may not import an LLM provider),
plus Phase 3.5's ad-assessor authority boundary and Phase 5's V5 chat-context boundary.

---

## 10. Known limitations / deliberate omissions

- **V5 is not retired.** It remains a live, preferred `/ai/chat` context source with a
  boundary/labeling fix, not elimination. A dedicated strangler-sequence audit is future
  work, explicitly out of this program's scope.
- **`ai_anomaly_states` is dead schema, not yet dropped.** No migration this program unless
  unavoidable; a future cleanup pass should drop it once confirmed still unreferenced.
- **Meta connection/onboarding lifecycle is a separate, not-yet-audited surface.** This
  program explicitly did not touch `metaOAuth.ts`, `MetaConnection` lifecycle code, or the
  manual token-paste connect flow — that is scoped as a dedicated future audit.
- **Conversation Outcome Intelligence** (`answered → qualified → order → revenue`) —
  architecture stays capable; data not yet collected (carried forward, unchanged, from
  `ANALYTICS_ARCHITECTURE_FINAL.md`).
- **Google Ads, TikTok** — enforced absent by an architecture test (unchanged).
- **`Diagnosis.contradictedBy: Evidence[]`** was considered and deliberately not added — no
  current producer populates a contradiction set; adding an unused field would be
  speculative, not a fix for an observed gap.

---

## 11. Test coverage index

| Concern | Suite |
|---|---|
| Evidence contract, authority boundary | `test_evidence_contract.ts`, `test_evidence_authority_boundary.ts` |
| Objective/result semantics canonicalization | `test_objective_kpi_consistency.ts`, `test_brain_kpi_canonicalization.ts`, `test_result_semantics_canonicalization.ts` |
| Anomaly ownership | `test_anomaly_authority.ts`, `test_intelligence.ts` |
| Diagnosis/decision ownership, V5 boundary | `test_diagnosis_decision_ownership.ts` |
| Meta cordon, sync concurrency, purge | `test_meta_cordon_sync_purge.ts` |
| V5/legacy disposition | `test_v5_legacy_disposition.ts` |
| DTO purity / frontend containment | `test_dto_purity_containment.ts` |
| Architecture fitness (Rule 1-10 enforcement) | `test_analytics_architecture.ts` |
| Priority-action consistency (P1-01) | `test_priority_action_consistency.ts` |
| Recommendation ownership (P0-02) | `test_recommendation_ownership.ts` |

Run all of the above (and every other suite) via `npm run test:all`.
