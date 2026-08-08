# Adlytic Analytics Intelligence — Final Architecture

**Status:** v1 complete (P0 → P1 → P2 → P3 → P3.5 → P4 → P5).
**Companion:** `ANALYTICS_RULES.md` holds the ten enforced architectural rules.

---

## The pipeline

```
Meta Graph API
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ ACTION SEMANTICS      analytics/actionSemantics.ts          │  ← P3.5
│ prefer → fallback → never sum overlapping representations   │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ NORMALIZATION         mappers/insightMapper.ts (THE CORDON) │
│ Meta field names stop here. Platform-neutral data leaves.   │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ STORAGE               DailyStat / RawInsight                │
│ per-type counters, never a derived "results" column          │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ SEMANTIC CLASSIFICATION   lib/campaignPurpose.ts            │
│ destination → optimization goal → objective → evidence      │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULT SEMANTICS      analytics/resultSemantics.ts          │  ← P2
│ resultKey ≠ businessOutcome ≠ unit; mixed = per-unit only   │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ FUNNEL INTELLIGENCE   analytics/funnel/*                     │  ← P3
│ objective-specific chain → EARLIEST materially broken link   │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ INTELLIGENCE HIERARCHY  analytics/intelligence/*             │  ← P5
│ data → semantics → funnel → anomaly → health → recommend    │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ ANALYTICS DTO         services/getDashboard.ts               │
└─────────────────────────────────────────────────────────────┘
      ▼
┌─────────────────────────────────────────────────────────────┐
│ DASHBOARD             web/pages/dashboard/sections/*         │  ← P4
│ renders the DTO. Zero analytics logic.                       │
└─────────────────────────────────────────────────────────────┘
```

The AI layer sits **beside** this pipeline, never inside it.

---

## Source of truth per layer

| Layer | Source of truth | May NOT be re-derived by |
|---|---|---|
| Action → business event | `analytics/actionSemantics.ts` | anyone (rule 10) |
| Campaign purpose | `lib/campaignPurpose.ts` | anyone (rule 1) |
| Raw Meta objective | `Campaign.objective`, verbatim | never overwritten (rule 2) |
| What counts as a result | `analytics/resultSemantics.ts` | anyone (rule 4) |
| Metric validity | `analytics/metricDictionary.ts` | the UI (rule 6) |
| Where the funnel broke | `analytics/funnel/diagnose.ts` | the UI, the AI |
| Whether it is unusual | `analytics/intelligence/anomaly.ts` | the funnel |
| Fatigue | `FatigueSignal` (one representation) | 3 former detectors |
| Health | `analytics/intelligence/objectiveHealth.ts` | facet engines |
| Recommendation | `analytics/intelligence/recommend.ts` | the AI |
| Presentation | `web/pages/dashboard/sections/*` | — |

---

## Campaign semantic model

Four concepts, deliberately never collapsed:

| Concept | Example | Origin |
|---|---|---|
| `campaignObjective` | `OUTCOME_ENGAGEMENT` | Meta, raw, immutable |
| `optimizationGoal` | `POST_ENGAGEMENT` | Meta ad set |
| `destinationType` | `WHATSAPP` | Meta ad set |
| `purposeFamily` | `messaging` | resolved, canonical |
| `resultKey` | `messages` | the platform event counted |
| `businessOutcome` | `qualified_conversations` | what the merchant buys |
| `unit` | `conversation` | what kind of thing it is |

`corroborated` is additive evidence metadata: it can raise reported confidence, never change the family.

---

## Confidence model — three independent axes

| Axis | Question | Fails when | Response |
|---|---|---|---|
| Classification | What IS this campaign? | vague ODAX shell | withhold objective vocabulary |
| Data | Are the numbers complete? | partial day, unsynced column | caveat, never alert |
| Benchmark | Enough sample to compare? | small spend, short window | show value, withhold verdict |

Plus the reconciled **verdict** confidence (`HIGH / MEDIUM / LOW / INSUFFICIENT_DATA`), which is capped by the weakest link: an approximate stage forces `LOW`; a non-anomalous break caps at `MEDIUM`; insufficient data withholds the health score entirely.

---

## Funnel shapes

```
MESSAGING   impressions → reach → link clicks → conversations   (POST_CLICK)
TRAFFIC     impressions → reach → link clicks → LPV             (POST_CLICK)
LEADS       impressions → reach → link clicks → leads           (CONVERSION)
SALES       impressions → reach → link clicks → purchases       (CONVERSION)
AWARENESS   impressions → reach                                 (terminal)
ENGAGEMENT  impressions → reach → interactions*                 (*approximate)
APP         impressions → reach → link clicks → installs*       (*approximate)
```

**Earliest break wins, never largest.** An upstream break mechanically depresses everything downstream; ranking by magnitude would systematically blame the terminal stage for a delivery or creative failure.

Messaging terminates in `POST_CLICK` rather than `CONVERSION` because the gap between a click and a started conversation is an *arrival* gap (chat never opened, welcome message never landed, nobody answered) with destination-side remedies. Leads and sales are `CONVERSION`: the visitor demonstrably arrived and did not complete.

---

## Anomaly detection

Separate responsibility from the funnel:

- **Funnel** — *where* did it break?
- **Anomaly** — is that break *unusual*?

```
POST_CLICK + SIGNIFICANT      → alert, recommendation issued
POST_CLICK + NOT_SIGNIFICANT  → break stands, no alert, no advice
```

Requires `1.5 ×` the funnel's own materiality floor. Reuses the P1 sample framework rather than inventing a second notion of "enough data".

---

## Fatigue — one signal, three former voices

`FatigueSignal` replaces the independent `HIGH_FREQUENCY` detector, the funnel's reach break, and the intelligence system's `AUDIENCE_FATIGUE` rule as the canonical description. Fatigue requires a **corroborated pattern** (frequency ↑ *and* CTR ↓ *and* CPC ↑), never one threshold crossing.

The legacy detector is **subordinated, not deleted** — it still writes `DetectedIssue` rows the recommendations page and stored history depend on. `reconcileIntelligence()` suppresses the duplicate finding via `suppressedIssueCodes` rather than emitting both.

---

## Health score

Objective-aware, weighted over **applicable facets only**:

| Facet | Weight |
|---|---|
| primary result (the thing being bought) | 40 |
| funnel health | 25 |
| efficiency (cost per *that* result) | 20 |
| delivery context | 15 |

Inapplicable metrics are **excluded from the weighting**, not scored zero. A messaging campaign is never penalised for `ROAS = 0`. A sales campaign with healthy CTR and collapsing purchases scores *critical*. Insufficient data returns `null` / `unknown` — never a fabricated number.

---

## Recommendation pipeline

Every recommendation carries `problem`, `evidence`, `severity`, `confidence`, `actionCode`, `action`, `expectedImpact`.

`permitAction()` **structurally forbids** advice that contradicts the diagnosis: with a `POST_CLICK` verdict, `REFRESH_CREATIVE` cannot be constructed, because the funnel measured the creative as healthy. No recommendation is produced when there is no break, when the break is not anomalous, or when confidence is `INSUFFICIENT_DATA`.

---

## AI boundary

| The AI layer MAY | The AI layer MAY NOT |
|---|---|
| explain, summarize | calculate KPIs |
| translate, personalize | classify campaign purpose |
| prioritize presentation | choose the funnel stage |
| rephrase evidence | invent benchmarks or revenue |
| | change confidence |
| | override the deterministic diagnosis |

Enforced by three source scans in `test_analytics_architecture.ts`: AI-layer files may not call the resolver or the decision engines, and `src/analytics/**` may not import an LLM provider.

---

## Historical data policy

**Strategy C — local replay.** `RawInsight.rawJson` retains the raw Meta payload for `RAW_INSIGHTS_RETAIN_DAYS` (default 90), so corrected values are recomputed **from data already on disk with zero Meta API calls**.

Rejected: re-syncing from Meta (thousands of Graph calls against an access tier gated on 500 successful calls and <15% errors, for data we already hold); waiting for convergence (the sync window is 7 days, so anything older never heals).

`POST /api/admin/reconcile-actions` — platform-admin only, **dry-run by default**, bounded at 500 rows/request (hard cap 5,000), cursor-paginated, per-row failure isolation.

**A row with no retained payload is `SKIPPED_NO_RAW` and left untouched.** An unreconstructable number stays visibly wrong rather than being replaced by a fabricated one.

---

## Deliberate omissions

- Conversation Outcome Intelligence (`answered → qualified → order → revenue`) — architecture stays capable; data not yet collected.
- Google Ads, TikTok — enforced absent by an architecture test.
- LLM anywhere in the computation path.
