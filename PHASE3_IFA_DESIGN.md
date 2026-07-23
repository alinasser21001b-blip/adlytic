# Phase 3 — Interactive Functional Actions (IFA): Design

**Status:** Proposed — awaiting user approval before implementation.
**Depends on:** Phase 2 agent (13 tools, `ToolDispatcher`, anti-hallucination post-check) and the Phase 3-0 UI foundation already shipped (warm-dark + gold design system, shared metric-glossary popover, `/ai?q=` deep-link prefill — see `src/web/layout.ts`'s `METRIC_GLOSSARY`/`openMetricInfo` and `aiPage.ts`'s query-param handling).
**Applies:** `src/services/agent/tools/*`, `src/services/agent/dispatcher.ts`, `prisma/schema.prisma` (one new table), `src/web/layout.ts`, `src/web/pages/dashboardPage.ts`, `src/web/pages/campaignsPage.ts`.

---

## 0. What's already shipped vs. what this doc covers

The user's original IFA brief lists twelve interaction patterns (Explain, Why, Fix, Impact Analysis, AI Investigation, Meta Logic Explorer, Benchmark Explorer, Data Lineage, Formula Explorer, Timeline Explorer, Smart Context Actions, AI Learning Mode). Four of these were cheap enough — static content or a thin reuse of an existing tool — to bake directly into the ongoing visual redesign rather than design separately:

| # | Pattern | Status | Where |
|---|---|---|---|
| 1 | **Explain** | ✅ Shipped | `METRIC_GLOSSARY` + `openMetricInfo()` in `layout.ts` — definition, formula, healthy range, common causes, static content, zero network cost |
| 9 | **Formula Explorer** | ✅ Shipped | Folded into the same Explain popover (`.metric-info-formula` block) rather than a separate button — one info icon, one modal, tabs of content, not three affordances competing for the same 16px of tile header |
| 8 | **Data Lineage** | ◐ Partial | The Explain popover doesn't yet show per-tile freshness; §5 below closes this gap using data the agent's tools already carry |
| 2 | **Why** | ◐ Bridged, not built | The Main Move card's "Ask AI why" link deep-links into the existing chat agent (`compare_periods` + `detect_anomaly` already answer this) — real root-cause UI is §2 below |
| 3 | **Fix** | ◐ Bridged, not built | Same deep-link; `simulate_budget_shift` + `save_recommendation` already back this in chat form — a dedicated ranked-actions card is §2 |
| 12 | **AI Learning Mode** | Not started | Content-authoring work (expand Explain's copy into full lessons), not an engineering design problem — out of scope for this doc |

This document designs the four pieces that need real new engineering: **AI Investigation** (§1), **Smart Context Actions** (§2), **Timeline Explorer** (§3), and **Benchmark Explorer / T15** (§4). It also closes the Data Lineage gap (§5) since it rides on the same tool metadata the other four already need.

---

## 1. AI Investigation

**The pattern:** one button — "Investigate this campaign" — produces a structured, multi-section report instead of a single chat reply. This is the flagship feature from the brief, and the one most tempting to over-build. The design constraint that keeps it honest: **every section must cite a tool the agent already has.** No new data source, no new inference layer — this is an orchestration and presentation problem, not a new capability.

### 1.1 Why this isn't just "ask the chat agent a bigger question"

The existing `runAgentTurn()` loop (`src/services/agent/loop.ts`) is bounded by `MAX_ITERATIONS=6` and optimized for a conversational reply — one paragraph, maybe a list, tool chips as a footnote. Asking it "investigate this campaign fully" today would either:
- truncate after 6 tool calls with a partial answer, or
- produce a wall of prose that's harder to scan than the existing dashboard cards it's supposed to replace.

An investigation report needs **fixed structure** (the same 8 sections every time, so the merchant learns to scan it) and **deterministic tool sequencing** (not the LLM deciding which of 13 tools to reach for under a token budget). That argues for a dedicated orchestrator, not a bigger prompt.

### 1.2 Design

```
POST /api/workspaces/:workspaceId/campaigns/:campaignId/investigate
```

A new module, `src/services/agent/investigate.ts`, runs a **fixed pipeline** — not an agentic loop — calling existing tool handlers directly (bypassing the LLM tool-selection step entirely for the data-gathering phase):

```ts
async function investigateCampaign(workspaceId: string, campaignId: string): Promise<InvestigationReport> {
  const [details, anomaly, audience, creative, hourly] = await Promise.all([
    dispatcher.call('get_campaign_details', { campaignId }, ctx),
    dispatcher.call('detect_anomaly', { entityId: campaignId, entityType: 'CAMPAIGN' }, ctx),
    dispatcher.call('get_audience_breakdown', { campaignId }, ctx),
    dispatcher.call('get_creative_performance', { campaignId }, ctx),
    dispatcher.call('get_hourly_pattern', { campaignId }, ctx),
  ]);
  // Each of these already returns ToolResult<T> — ok/error, never throws.
  // A single failed tool degrades its section, not the whole report.
  ...
}
```

The **only** LLM call in the pipeline is a single Sonnet turn at the end that receives all five tool results as structured input and writes the narrative connective tissue between sections (2-3 sentences per section, not a fresh essay) — this keeps the anti-hallucination post-check (`postcheck.ts`) directly reusable, since it already validates "every number in the reply traces to this turn's tool corpus," and the corpus here is exactly these five results.

### 1.3 Report structure (the eight checklist items from the brief, mapped to real tools)

| Section | Tool(s) | What changes vs. the raw tool output |
|---|---|---|
| Campaign structure | `get_campaign_details` | As-is, reformatted |
| Budget allocation | `get_campaign_details` + `simulate_budget_shift` (dry-run against current spend) | Adds "is this budget well-placed" verdict |
| Learning phase | **Gap — no existing field.** | `Campaign` (Prisma) and `get_campaign_details`'s `CampaignDetailsResult` have no delivery/learning-phase field today — Meta's API does expose this (`effective_status` / delivery info on the campaign object), it's just never synced. Needs a small sync + schema addition before this section can say anything real. |
| Audience quality | `get_audience_breakdown` | As-is |
| Creative fatigue | `get_creative_performance` + `detect_anomaly` (frequency drift) | Cross-referenced: fatigue = high frequency AND declining CTR together, not either alone |
| Placement performance | `get_audience_breakdown` (placement dimension) | As-is |
| Pixel / conversion health | **Gap — no existing tool surfaces this.** | Deferred: needs a `check_pixel_health` tool reading `RawInsight` conversion-event completeness, not built in Phase 2. Ship the report with this section labeled "Not yet available" rather than fabricating a verdict. |
| Historical trend | `compare_periods` | As-is |

Two of the eight sections (Learning phase, Pixel/conversion health) are genuine gaps, not just missing UI — called out deliberately rather than glossed over. A section that always says "looks fine" without real signal is worse than an honest "we don't check this yet." The anti-hallucination discipline from Phase 2 applies to report design, not just reply text — don't manufacture confidence Phase 2's tools don't have. Ship the report with six real sections and two labeled "Not yet available"; backfilling those two is a small, separate follow-up (a Meta sync addition for learning phase, a new tool for pixel health), not a blocker for the other six.

### 1.4 UI

A right-side drawer (reuses the `.modal-overlay`/`.modal` pattern already in `layout.ts`, widened to 640px) opened from a new "🔎 تحقيق شامل" button on the Campaigns inspector modal (`campaignsPage.ts`'s existing per-campaign modal — §3.1 of the shipped work already added Explain buttons there, so the modal is the natural home for this too). Each section is collapsible; the first (structure) and any section with a `severity: critical` finding are expanded by default.

### 1.5 Cost and caching

Five tool calls + one Sonnet turn is heavier than a chat message (which averages 1-3 tool calls). Cache the full report for 15 minutes per campaign (reuse `cache.ts`'s existing TTL cache, new namespace `investigation:{campaignId}`) — an investigation is a deliberate "let me look deeper" action, not a live chat turn, so staleness on the order of minutes is acceptable and expected by the user (the report should show a "as of HH:MM" stamp, matching the Data Lineage pattern in §5).

---

## 2. Smart Context Actions

**The pattern:** the action buttons under a metric or issue change based on what's actually wrong, instead of a static "Explain / Why / Fix" trio that's often irrelevant (asking "why" about a healthy CTR is noise).

### 2.1 The core problem: "what's wrong" already exists, scattered

Three things already independently decide "what's wrong with this campaign": `DetectedIssue` rows (`issueCode` + `severity`, populated by the rule engines), `AiAnomalyState` rows (per-metric drift with `direction: 'better'|'worse'` and `daysAnomalous`), and the dashboard's own client-side `buildAllMoveItems()` (in `dashboardPage.ts`, which merges issues + brain feed + priority action into one ranked list for the Main Move card). Smart Context Actions needs a **primary issue per metric**, not a fourth independent ranking — so this is a consolidation problem before it's a UI problem.

### 2.2 Design: a single `primaryIssueForMetric()` resolver

New pure function, `src/services/agent/contextActions.ts`, called server-side when building the dashboard/campaigns DTOs (not client-side — the client already renders whatever the server decides, per the existing `renderKpis()` pattern):

```ts
type MetricContext = {
  metricKey: string;           // 'ctr' | 'cpm' | 'roas' | ...
  primaryIssue: IssueCode | null;
  actions: ContextAction[];    // ordered, 2-4 items
};

interface ContextAction {
  id: string;              // stable key for click tracking (AiSignal)
  label: string;            // Arabic, e.g. "تحليل الإبداع"
  kind: 'deep_link_ai' | 'open_investigation' | 'open_breakdown';
  question?: string;        // for deep_link_ai — the prefilled /ai?q=
}
```

`primaryIssueForMetric()` looks up the metric's most severe `DetectedIssue` for that entity (already indexed by `[entityType, entityId, date, issueCode]` in the schema — no new query pattern), and maps `issueCode` to a **fixed action set** via a lookup table:

```ts
const ACTIONS_BY_ISSUE: Record<IssueCode, ContextAction[]> = {
  LOW_CTR: [
    { id: 'analyze_creative', label: 'تحليل الإبداع', kind: 'deep_link_ai', question: '...' },
    { id: 'audience_quality', label: 'جودة الجمهور', kind: 'open_breakdown' },
  ],
  HIGH_CPM: [
    { id: 'auction_analysis', label: 'تحليل المزاد', kind: 'deep_link_ai', question: '...' },
    { id: 'audience_saturation', label: 'تشبع الجمهور', kind: 'deep_link_ai', question: '...' },
  ],
  RISING_COST_PER_RESULT: [
    { id: 'landing_page', label: 'تحليل صفحة الهبوط', kind: 'deep_link_ai', question: '...' },
    { id: 'checkout_diag', label: 'تشخيص إتمام الشراء', kind: 'deep_link_ai', question: '...' },
  ],
  // ...one entry per IssueCode already defined in the schema's IssueCode enum
  // (LOW_CTR, HIGH_CPM, HIGH_FREQUENCY, AUDIENCE_FATIGUE, DECLINING_RESULTS,
  // BUDGET_BURNING_FAST, LOW_REACH, RISING_COST_PER_RESULT, STALLED_DELIVERY).
};
```

This is a **lookup table, not a rules engine** — deliberately. The brief's examples ("if CTR is low, show these 4 buttons") are exactly a switch statement over an enum Adlytic already has (`IssueCode`, defined in `prisma/schema.prisma`). Building anything more dynamic (an LLM deciding which buttons to show) would spend a model call to reproduce a decision that's already fully determined by the issue code — the kind of hidden LLM dependency the Phase 2 design doc's anti-hallucination section explicitly argues against for anything that can be resolved deterministically.

**Gap this table can't cover:** the brief's own example — "ROAS low but CTR excellent → landing page / checkout / pixel questions" — is a *combination* of two metrics' states, not one issue code. Today's `IssueCode` enum has no ROAS-specific value at all. Covering this properly needs either a new `IssueCode` (e.g. `LOW_ROAS_GOOD_CTR`) emitted by the rule engine that already computes both metrics, or a second, smaller resolver that runs *before* the table lookup and checks for known cross-metric combinations. Either is a small, contained addition — flagged here rather than silently answered with an invented enum value the schema doesn't actually have.

### 2.3 Fallback when there's no active issue

A metric with no `DetectedIssue` gets the current default (Explain button only) — Smart Context Actions is additive, not a replacement for the shipped Explain hooks. This also means the feature ships incrementally: each `IssueCode` gets its `ACTIONS_BY_ISSUE` entry added independently, with unmapped codes falling back to a generic "اسأل الذكاء الاصطناعي" deep-link (reusing the exact `mainMoveAiQuestion()` pattern already shipped on the Dashboard's Main Move card).

### 2.4 UI

Renders as a chip row under the KPI tile's delta badge (`.kpi-delta`), only when `primaryIssue` is non-null — so healthy metrics stay visually quiet, matching the dataviz skill's "recessive by default, only the story is loud" principle already applied to the redesign.

---

## 3. Timeline Explorer

**The pattern:** the spend/CTR chart annotates its own spikes and drops instead of being a bare line the merchant has to interpret unaided.

### 3.1 Data model: this already exists, mostly

`DetectedIssue` is date-scoped, and — checked directly against the running app — is written at `entityType: ACCOUNT`, not per-campaign. That happens to be the right granularity for the two charts that actually exist today: `chart-spend-main` (Dashboard) and `chart-spend`/`chart-ctr` (Campaigns page) are both **workspace-wide** aggregates across every campaign, not a single campaign's line — there is currently no per-campaign chart in the UI to annotate. So Timeline Explorer v1 targets those two existing account-level charts, using account-level `DetectedIssue` rows, which matches their scope exactly. (`CampaignIntelligenceReport` + its child `CampaignIssue` rows — confirmed populated end-to-end against the seeded test data — is the right source *if and when* a genuinely per-campaign chart gets built, e.g. inside the Campaigns inspector modal; noted here so the next person doesn't have to re-derive this distinction.) The chart's x-axis is already dates (`chart-spend-main` builds `labels` from the same `DailyStat[]` window). Timeline Explorer is a **join**, not a new data source: for each point on the existing chart, look up whether a `DetectedIssue` exists for that account+date, and if so, render a marker.

### 3.2 What's missing: attributing a spike to a specific cause

A `DetectedIssue` says "budget waste detected on this account on this day" — it does not say "because ad set X's frequency crossed 5.2." That attribution needs the same driver-decomposition logic the dashboard's `renderAttribution()` already does for a fixed date range (`attribution.drivers.{impressions,ctr,cvr}` in the existing DTO) — but currently only for the whole 30-day window, computed once. Timeline Explorer needs this computed **per spike**, on demand (when the user clicks a marker), not eagerly for every day — eager computation would multiply the existing attribution query by the number of days in the window for a feature only used when a marker is actually clicked.

### 3.3 Design

- **Markers** (chart-side, near-zero backend cost): a new lightweight endpoint, `GET /api/workspaces/:wsId/issue-dates?days=30`, returns `{ date, issueCode, severity }[]` — a direct account-scoped `DetectedIssue` query, no new computation. Chart.js renders these as a secondary scatter dataset pinned to the x-axis (small dots under the line, colored by severity using the existing `--warning`/`--error`/`--critical` tokens).
- **On click**: call `attributeChange()` (`src/engines/analytics/attributeChange.ts` — the same deterministic engine `renderAttribution()` already uses for the dashboard's 30-day window) scoped to `[date-1, date]` vs `[date-8, date-7]` (day-over-day vs. the same weekday prior week, avoiding weekend/weekday noise). This is a plain function call, not an agent tool or an LLM turn — its `primaryDriver: "impressions" | "ctr" | "cvr"` output already answers "what moved" directly, with no new logic beyond calling it with a narrower window than the dashboard's fixed 30-day one.
- **Rendering**: a small popover anchored to the clicked point (same `.info-btn`-adjacent popover mechanics as the Explain modal, different content), showing the driver breakdown already visualized in `renderAttribution()` — reusing that component's markup rather than inventing a second attribution-bar widget.

### 3.4 Explicitly deferred

"Which creative triggered the movement" (per the brief) requires per-creative daily breakdowns joined to the spike date — `get_creative_performance` (T6) exists but returns *current-window* aggregates, not a specific day's numbers. Extending T6 with an optional `date` parameter is a small follow-up, not part of this doc's initial build — ship day-level driver attribution first (campaign/audience/metric level), add creative-level attribution once the tool supports a single-day query.

---

## 4. Benchmark Explorer (Tool T15)

**The pattern:** "your CTR is 1.38% — industry median is 2.11%, top 10% is 3.52%."

### 4.1 Why this was deferred out of Phase 2

T15 (`get_industry_benchmark`) needs a **data source Adlytic doesn't have yet**: cross-account industry medians require either (a) aggregating anonymized metrics across all Adlytic workspaces sharing an `industryProfileId` (the schema already has `IndustryProfile` — see `prisma/schema.prisma`), or (b) an external benchmark dataset (Meta doesn't publish one; third-party ad-benchmark data is a paid data source). Building the tool without deciding the data source first would mean fabricating numbers — exactly what the anti-hallucination post-check is designed to catch, so building this wrong would mean shipping a feature that fights its own safety net.

### 4.2 Recommended data source: cross-workspace aggregation, not a third-party feed

Option (a) is buildable with what exists today and doesn't require a new vendor contract:

- `IndustryProfile` already links to workspaces (confirm via `prisma/schema.prisma`'s existing relation).
- A scheduled job (mirrors the existing `auto-sync every 15m` pattern in `serve.ts`) computes, nightly, per `industryProfileId`: median and p90 for `ctr`, `cpm`, `cpa`, `roas` across all workspaces in that profile with ≥ 500 impressions in the trailing 30 days (a floor to avoid one tiny account skewing the median).
- Result stored in a new table, `IndustryBenchmarkSnapshot` (`industryProfileId`, `metric`, `computedAt`, `median`, `p90`, `sampleSize`), refreshed nightly — not computed live, since a live cross-workspace aggregate query on every chat turn would be a materially different (and much heavier) query than anything else the agent does.

### 4.3 The consent problem this doc must not skip

Cross-workspace aggregation means workspace A's data (in aggregate, never individually) shapes what workspace B sees as "industry median." This needs an explicit opt-in, not an implicit default:

- Add `User.benchmarkParticipation: Boolean @default(false)` (opt-in, not opt-out — this is the only defensible default for using one customer's data to inform another's, even in aggregate).
- `IndustryBenchmarkSnapshot`'s nightly job only includes workspaces where the owning user has opted in.
- `sampleSize` is always shown alongside the benchmark ("based on 34 accounts") so the merchant can judge reliability — and the tool refuses to answer (returns `ok: false` with a clear reason, matching the existing `ToolResult` error shape) when `sampleSize < 10`, to avoid a benchmark that's really just "one competitor's number with extra steps."

### 4.4 T15 shape (once the data source exists)

```ts
// get_industry_benchmark(metricKey, industryProfileId?)
// industryProfileId defaults to the workspace's own profile if set.
{
  ok: true,
  data: {
    metric: 'ctr',
    yourValue: 1.38,
    industryMedian: 2.11,
    industryP90: 3.52,
    sampleSize: 34,
    computedAt: '2026-07-04T02:00:00Z', // nightly job timestamp — this IS the data-lineage story for this tool
  },
}
```

This is the one tool in the whole catalog where `meta.freshness` (§5) is measured in hours, not minutes — the UI must say "based on last night's data across 34 accounts," not imply live computation.

---

## 5. Data Lineage (closing the gap from §0)

Every tool's `ToolResult<T>` already carries a `DataFreshness` meta field (`src/services/agent/envelope.ts`) — `lastSyncedAt`, `source`, `cachedSeconds`. This was built for the chat agent's own guardrails (so Claude can say "as of this morning's sync" instead of implying live data), but it never made it into the KPI tiles' Explain popover, which currently only shows static glossary content.

**Fix:** extend `renderMetricInfo()` (in `layout.ts`) to accept an optional `freshness` argument, and thread the dashboard's already-fetched `dashData.workspace.lastSyncedAt` through to each `data-metric-info` button as a `data-freshness` attribute (no new API call — this timestamp is already on the page, just not wired to the popover). Add a fourth block to the popover, "مصدر البيانات" (Data Source), showing:

```
المصدر: Meta Graph API · ads_insights
آخر تحديث: قبل 12 دقيقة
```

This is deliberately the smallest possible version of Data Lineage — it does not yet expose "attribution window" or "aggregation method" per the original brief's mockup, because those vary per metric and per campaign objective (a conversion metric's attribution window is a per-ad-account Meta setting, not a constant Adlytic can hardcode into the glossary). Extending `METRIC_GLOSSARY` entries with a per-metric attribution-window note is a follow-up once the glossary's static content (already shipped) proves useful in practice — don't build the harder version of a feature before confirming the cheap version gets used.

---

## 6. Build order

1. **Data Lineage** (§5) — smallest, no new backend, extends already-shipped UI.
2. **Smart Context Actions** (§2) — no new tools, a lookup table + a resolver function; highest leverage-to-effort ratio since it makes the already-shipped Explain/Ask-AI hooks context-aware instead of static.
3. **Timeline Explorer** (§3) — one new lightweight endpoint + reuses `attributeChange()` and `renderAttribution()`.
4. **AI Investigation** (§1) — heavier (5 tool calls + 1 LLM turn + new UI drawer), but fully self-contained.
5. **Benchmark Explorer / T15** (§4) — gated on the consent decision in §4.3, which is a product/legal call, not an engineering one; flag this to the user explicitly before starting, since opt-in benchmark participation is a user-facing settings change, not an invisible backend addition.

Items 1-3 do not require another design-doc pass — they're direct extensions of infrastructure this doc has traced to existing code. Item 5 should not start until the opt-in question is answered.
