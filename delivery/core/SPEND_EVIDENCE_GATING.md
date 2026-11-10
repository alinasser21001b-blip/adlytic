# Unverified IQD spend: visible per period, and kept out of the advice that rests on it

Status: **implemented and tested locally; not deployed; no production data touched.**
Branch `local/rc-spend-recs` (base `c25724d`). Builds on `DATA_HEALTH_ISOLATION.md` §4 and `IQD_REPAIR.md`.
No database migration. All response changes are additive.

> Owner requirement (verbatim): *"Keep SPEND_SCALE_UNVERIFIED visible for affected periods after factor=1. Exclude unverified spend from recommendations that depend on it."*

## 1. The problem in one paragraph

IQD money is stored in minor units with a canonical factor of 1, but an account that once carried the schema default (100) can hold rows that are exactly ×100. The **only** evidence is raw Meta spend in `raw_insights`: ACCOUNT-level rows only, several per day (sync appends one per run), pruned after `RAW_INSIGHTS_RETAIN_DAYS` (90, by `fetched_at`). The stored factor is **not** evidence: after the repair flips it to 1, every row the repair did not *prove* is exactly as unproven as before. Before this change `SPEND_SCALE_UNVERIFIED` was computed over a rolling 30-day window only, the older rows were a bare count (`history.withoutEvidence`), and nothing at all stopped a recommendation from being built on them.

## 2. Periods (visibility)

### The per-day rule — one function

`src/lib/spendScaleRule.ts::judgeDayAgainstRaws` (pure). The repair (`collectScaleEvidence`) and the new gate both call it, so a day is VERIFIED / OVERSCALED / UNVERIFIABLE by the same code whichever asks. Unchanged semantics: a stored value equal to **any** raw of that day is VERIFIED, unless another raw of that day proves it exactly ×100 (then it is contradicted, not certified); over-scale is judged only against raws that agree; raws that disagree and none matches → unverifiable (never a guess); no raw → unverifiable.

### What a period is

A **period** is a maximal run of consecutive ACCOUNT-level `daily_stats` rows (ascending by date) whose status is *neither verified nor proven over-scaled* — the same definition the existing `window.unverified` counter uses. A verified or over-scaled row ends a run; a calendar day with no row does **not** (no spend on it that could be wrong), so `rows` can be smaller than the calendar span. Over-scaled rows get their own list.

It is computed over the account's **whole history**, in one pass, independent of the stored factor, of whether the repair has run, and of "now". Nothing moves a row out of a period except a raw Meta counterpart that proves it (a re-sync/backfill of that day) or deleting the row.

### Response (additive) — `GET /api/workspaces/:id/data-health`, `spendScale` (IQD accounts only)

All existing keys are untouched (`currency`, `storedFactor`, `factorIsEvidence`, `window`, `history`, and every top-level key). New:

| key | meaning |
|---|---|
| `unverifiedPeriods` | `[{ from, to, rows }]`, newest first, **capped at 24** (`periodsCap`) |
| `unverifiedPeriodsTotal`, `unverifiedRowsTotal` | exact, whatever the cap |
| `unverifiedPeriodsTruncated` | `true` when the list was cut |
| `overscaledPeriods`, `overscaledPeriodsTotal`, `overscaledRowsTotal`, `overscaledPeriodsTruncated` | the same for rows **proven** ×100 |
| `periodsCap` | `24` |

### WARN or only listed? — decision, and why

* **Inside the 30-day window** → the existing `SPEND_SCALE_UNVERIFIED` (WARN) / `SPEND_SCALE_OVERSCALED` (CRITICAL) checks, unchanged in code and severity.
* **Older than the window** → **listed, not warned.** Because raws are pruned after 90 days, every IQD account older than about three months has permanently unverifiable oldest history. A WARN there would sit on nearly every account forever, could not be acted on, and would bury the WARN that *is* actionable (a hole in the last month, fixed by a backfill). `test_iqd_repair_postgres.ts` already pins this decision ("history … reported, not certified … raises no warning").
* The older period is nevertheless **durable and discoverable**: it stays in `unverifiedPeriods`, and **any read whose range overlaps it carries the flag** (§3). **Owner decision 1:** the data-health *page banner* (`campaignsPage.ts`) renders only WARN/CRITICAL checks, so an older-only period is visible to API consumers but not in the banner. Showing it there would make the banner amber for almost every IQD account; I did not touch the page.

## 3. Period reads carry the same flag

I searched the whole repository for an existing data-quality plumbing (`dataQuality`, `data_quality`, `data-quality`, confidence/trust fields): **there is none** on this base (the nearest things are the integrity-check vocabulary `{code, severity, message, messageAr, value}` and the funnel `dataConfidence`, which is about window completeness, not scale). So `dataQuality` is introduced here as the single additive namespace, reusing the **same codes** as the data-health checks:

| read | how the flag appears |
|---|---|
| `GET /api/dashboard/:id` | `dataQuality: { flags: [SpendScaleFlag], withheld: [{ surface, reason, detail? }] }` — present **only** when the 30-day window is not clean |
| `GET /api/workspaces/:id/insights?days=N` | header `X-Data-Quality: SPEND_SCALE_UNVERIFIED` (or `…_OVERSCALED`) when `[today−N, ∞)` holds affected rows (ACCOUNT level). The body stays the same array |
| `GET /api/workspaces/:id/campaigns?days=N` | the same header, judged at CAMPAIGN level (§4) |
| `GET /api/workspaces/:id/recommendations` | headers `X-Data-Quality` and `X-Recommendations-Withheld: n`; `?include=suppressed` returns `{ recommendations, suppressed, dataQuality }` (§5) |

`SpendScaleFlag = { code, severity: WARN|CRITICAL, message, messageAr, level, rows, of, from, to, periods }` — `rows` unverified (or over-scaled) rows in the range, `of` account rows in the range, `periods` the runs inside it. A range that holds no affected row (even if an older range does) carries nothing. Arrays cannot grow a key, hence headers there.

Not flagged: `/export/*.csv`, `/api/weekly-report`, the campaign inspector, `/campaigns/:id` — see §8.

## 4. Campaign-level rows

Production sync stores raws for ACCOUNT rows only (`syncAccount.ts`), so a campaign row can **never** be proven directly. Rule, implemented in `src/lib/spendEvidence.ts::dayStatusAtLevel`:

A campaign day D is **VERIFIED** only if **both**
1. the account row of D is VERIFIED by a raw counterpart, and
2. the sum of that day's campaign rows reconciles with the account row: `|Σcampaign − account| ≤ max(2 % × account, campaignRows + 1)` (2 % = the OK band of the existing `ACCOUNT_CAMPAIGN_DIVERGENCE` check; `campaignRows + 1` is what per-row integer rounding can add up to).

Otherwise: account row over-scaled → OVERSCALED; account row unproven, **or** campaigns that do not add up to a verified account row, **or** campaign rows with no account row at all → UNVERIFIED. A day with no campaign rows has nothing to judge. A reconciling campaign sum next to an *unproven* account row stays UNVERIFIED (both could be ×100 together).

Limits, stated plainly: this proves the campaigns are *consistent with the account total*, not that any individual campaign is right (an error that cancels between campaigns passes; one campaign mis-scaled while another compensates exactly is not caught). Campaign-level raws, if sync ever stores them, are **not** used by the gate. A campaign deleted inside the window (its rows gone, its spend still in the account total) makes that day diverge → UNVERIFIED: conservative, and the existing divergence check already reports the same thing. The partial current day can diverge by more than 2 % between the account fetch and the campaign fetch → UNVERIFIED until the next sync.

## 5. Excluding unverified spend from spend-dependent recommendations

### Honest note on "one choke point"

There is not one. Recommendations are written by four producers and read by three surfaces. What *is* central is **one policy module** (`src/lib/spendEvidence.ts`: the evidence, the classification of what depends on spend, the partition function) applied at every producer and every reader below. The two display readers of stored `recommendations` (`GET /recommendations`, `getDashboard`) cover rows from *any* producer and *any* date, so a recommendation stored before this change, or by a producer I did not touch, is still withheld at display.

### What depends on spend (the classification)

* **Issue codes** (detectors): `RISING_COST_PER_RESULT`, `HIGH_CPM`, `BUDGET_BURNING_FAST`.
* **Action codes**, by producer: V1 composition `PAUSE_AND_RELAUNCH` (needs `RISING_COST_PER_RESULT`), `REVIEW_BUDGET_PACING`; AI agent `INCREASE_BUDGET`, `DECREASE_BUDGET`, `PAUSE`, `PAUSE_URGENT`; Brain `SCALE_BUDGET`, `PAUSE_CAMPAIGN`, `EMERGENCY_PAUSE`; V5 `ADJUST_BID`.
* **Knowledge-base metrics**: `cpm`, `cpc`, `cost_per_message`, `cost_per_thruplay`, `roas`. A stored KB recommendation is judged by the metric that *owns* its action (matched through the breach's own action ids); if none can be matched, any cost breach decides.
* **Does not depend on spend**: `REFRESH_CREATIVES`/`REFRESH_CREATIVE`, `BROADEN_AUDIENCE`, `IMPROVE_HOOKS`, `CHECK_TARGETING`, `NARROW/EXPAND_AUDIENCE`, `MONITOR`, `INVESTIGATE_TRACKING`, and every KB action owned by `ctr` / `frequency` / `link_ctr` / `cvr` / hook / hold / thruplay rates. A recommendation composed from `RISING_COST_PER_RESULT` is spend-dependent whatever its action code.

### Evaluation windows (the rows each producer actually reads)

| producer / reader | window (inclusive) | level |
|---|---|---|
| RulesEngine, RecommendationEngine, V5 shadow engine | 14 days ending 2 days before as-of (7 current + 7 prior, 2-day attribution lag) | ACCOUNT, or CAMPAIGN for a campaign entity |
| Brain orchestrator | 16 days ending now (period signals + latest row) | CAMPAIGN |
| AI agent `save_recommendation` | 30 days ending today | entity's level |
| `GET /recommendations` | **per stored row, by its own date**: engine window (V1) / 30 days (AI) | entity's level |
| `getDashboard` | the 30-day window | ACCOUNT |

A window is **clean** only if every row in it is VERIFIED. One unverified or over-scaled row in the window makes it not clean (reason `SPEND_SCALE_OVERSCALED` outranks `SPEND_SCALE_UNVERIFIED`). **No partial recompute from the verified remainder** (owner decision 3). Non-IQD accounts: not applicable, **zero** evidence queries, nothing withheld.

### Behaviour at each point

| point | when the window is not clean |
|---|---|
| `RulesEngine` | `spendTrend`, `cpmTrend`, `currentCpm` are null and `Signals.spendWithheld` is set → `RISING_COST_PER_RESULT` is not detected (the detector also declines on the flag). Fatigue, frequency, CTR, declining-results are unchanged. `RulesResult.spendWithheld` names it |
| `RecommendationEngine` | spend-dependent issue codes are dropped before composition and spend-derived KB metrics are not evaluated; a composed result that still rests on spend (by code / source issues / KB metric) is not written. `RecommendationResult.spendEvidence` and, on a surviving row, `details.spendEvidence` say what was left out |
| V5 shadow engine | its rising-cost rule is skipped, KB cost metrics not evaluated |
| Brain | cost-based verdicts (`SCALE_BUDGET`, `PAUSE_CAMPAIGN`, `RESCUE_WATCH`, `REFRESH_CREATIVE` from the physics score, spend-velocity `EMERGENCY_PAUSE`) become `HOLD_AND_MONITOR`, original in `decision.overriddenAction` and `decision.spendEvidence`, reason prefixed `[SPEND_SCALE_UNVERIFIED]`. Withheld *before* rule grounding, so a frequency/CTR fatigue refresh can still be raised. Period signals have their spend-derived fields nulled |
| `save_recommendation` | spend-dependent action codes are refused with `STALE_DATA` and `SPEND_SCALE_UNVERIFIED` in the message (nothing stored); an unreadable evidence read also refuses |
| `GET /recommendations` | spend-dependent rows are withheld; headers and `?include=suppressed` list each with `reason`, `basis` (`ACTION_CODE` / `SOURCE_ISSUE` / `KB_METRIC`), entity, date and the evidence window. Unreadable evidence → withheld (fail closed) |
| `getDashboard` | the best stored recommendation that does not rest on spend becomes `priorityAction` (the next one, not nothing); spend-dependent issues, the KB cost breaches, the cost diagnosis (`diagnose`), `drain`, `forecast`, `bleedAlert`, and the steady-state CPA/CPM/ROAS verdicts are left out; each is named in `dataQuality.withheld`. KPI **numbers** are still shown as stored — the gate withholds advice, it does not rewrite money |

Brain `HOLD_AND_MONITOR` was chosen over `KEEP_COLLECTING` because grounding then still lifts a spend-free fatigue refresh, and `ruleGrounding` already uses `overriddenAction` the same way. Its generic card text ("performance normal") is softened only by `reason`; see §8.

## 6. Evidence

Reproduce (synthetic, loopback only):

```
createdb -h 127.0.0.1 -p 54329 -U adlytic adlytic_repro_rc2
DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc2 npx prisma migrate deploy
npm run typecheck
env -i PATH=$PATH HOME=$HOME npm run test:spend-evidence                      # CI-safe, in test:all
DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc2 npm run test:spend-evidence-pg   # not in test:all; exit 2 = NOT RUN
```

Results are in the final report of the change (counts, RED-on-old, mutation table); the numbers are not copied here so this file cannot drift from the code. `test_spend_evidence.ts` covers the rule, periods, campaign reconciliation, classification, the read gate, generation (fake prisma), the Brain, the AI tool and the wiring; `test_spend_evidence_postgres.ts` repeats it on real rows through the real app: after the repair the periods and the WARN are unchanged, a period 45 days old is listed and flagged on a 90-day read but not a 30-day one, 80 alternating days give 40 runs capped at 24, campaign rows that do not reconcile, real engines on unverified / verified / USD twins (the twins identical), stored rows withheld and kept, the dashboard, the AI agent, the Brain orchestrator.

**"Exactly as before" is also checked as a differential**, not only asserted: `scripts/repro/spend_evidence_differential.ts` seeds one USD and one fully verified IQD synthetic account, runs the real engines (rules, recommendation, V5, Brain orchestrator) and reads eight routes through the real app, once with the old source and once with this one, and byte-compares the normalised responses and the rows the engines wrote. Result in the change report: the USD account is identical; the verified IQD account differs **only** by the additive `spendScale` period keys.

Existing engine tests (`test_rules`, `test_recommendation`, `test_evidence_contract`) construct fake Prisma objects; each gained a read-only `adAccount.findFirst` returning a USD account (the engines now read the account's currency). Nothing else in those tests changed.

## 7. Where it lives

`src/lib/spendScaleRule.ts` (rule) · `src/lib/spendEvidence.ts` (periods, windows, classification, partition, flag) · `src/lib/iqdRepair.ts` (now imports the rule, behaviour identical) · `src/services/dataIntegrityMonitor.ts` · `src/engines/rules/{RulesEngine,detectRisingCostPerResult,loadCampaignSignals,types}.ts` · `src/engines/recommendation/RecommendationEngine.ts` · `src/engines/intelligence/AdlyticIntelligenceSystem.ts` · `src/engine/{AdlyticBrain,DecisionEngine}.ts` · `src/workers/{runBrainOrchestrator,runEngines}.ts` · `src/services/agent/tools/saveRecommendation.ts` · `src/services/getDashboard.ts` · `src/api/server.ts` (the recommendations route, `/insights`, `/campaigns`: three small local edits).

## 8. Limits and honest caveats

1. **Verification is not remembered.** There is no per-row "verified on" mark (that would need a migration). A row verified today becomes *unverified* once its raws are pruned (90 days after `fetched_at`), so the oldest history of every IQD account drifts into `unverifiedPeriods` over time, and "was verified when fresh" cannot be told from "never verified". The gate itself is unaffected (its windows are ≤ 30 days, far inside retention). A re-sync/backfill of an old window re-appends raws and re-verifies rows whose stored value matches. **Owner decision 2.**
2. **Strict by design.** One unverified day anywhere in a 14/16/30-day window withholds the whole spend-dependent family for that window, including for a window that is *probably* correct (the common cause is a sync gap, not ×100). A zero-spend row counts as unverified like any row without a raw (same definition as the existing counter). The partial current day without a raw yet is unverified until the sync that writes its raw.
3. **Only the producers and readers listed.** *Not gated:* the AI **chat** answering from tools (free text); `predictions`; `weeklyReport` and the morning story's spend facts; the KPI cards/charts (shown as stored, flagged only through `dataQuality`/headers on the reads in §3); the CSV exports; ad-set / ad entities (no producer emits them); the V5 shadow engine's *signals* table still records `CPM_TREND` / `SPEND_TREND`; `campaignInspector`, `getCampaignDetails`, ad-assessor. Any of those can show a spend figure or a cost comparison computed from unverified rows.
4. **Brain snapshots are rewritten per tick.** A stored snapshot keeps its old verdict until the next orchestrator run (the next sync). Stored `recommendations` rows are judged again at every read, so they do not have that lag.
5. **Classification is by action code and source issues.** An AI-authored `PAUSE`/`PAUSE_URGENT` is treated as spend-dependent because the code cannot say why it paused. A new action code that is not in the table is treated as spend-independent until added (the table is `SPEND_DEPENDENT_ACTION_CODES`). A brand-new spend-derived KB metric must be added to `SPEND_DERIVED_KB_METRICS`.
6. **Brain verdicts are a blend.** The physics score weights cost-per-message in every verdict, so there is no spend-free remainder of a physics decision; all five cost-based verdicts are withheld together. The generic `HOLD_AND_MONITOR` card copy says "no intervention warranted"; only `reason` and `spendEvidence` say it was withheld.
7. **Cost.** IQD accounts add two to three small indexed reads per engine run / dashboard / recommendations read (account rows, grouped distinct raw spends, and — at CAMPAIGN level — one campaign aggregate). `GET /recommendations` reads once per entity, not once per stored row. Non-IQD accounts add none. I did not benchmark against production volumes.
8. **Existing data-health WARN scope is unchanged** (30 days). I did not extend it to the 90-day raw horizon, which would be the natural place to warn about *actionable* holes; see decision 1.
9. **Not verified live:** production's share of IQD accounts with unverified windows (on Railway the first effect will be that those accounts lose their cost-based recommendations until a backfill re-verifies the rows), raw-row coverage, real Meta payloads. Everything here ran on synthetic Postgres 16 rows.

## 9. Owner decisions

1. **Older-than-window periods: list only (done) or also surface in the data-health banner / WARN?** (§2.) My recommendation: list only; add a banner line only for periods inside the 90-day raw horizon, where a backfill can fix them.
2. **Persist a "verified on" mark per row** (needs a schema change, which is gated) so that verified history stays verified after its raws are pruned? Without it `unverifiedPeriods` slowly absorbs the oldest history of every account.
3. **Strict withhold (done) or partial recompute from the verified remainder** once it meets a minimum sample? The brief allowed either; I chose strict because partial recompute of trends across a hole is itself a guess.
4. **AI-agent `PAUSE` / `PAUSE_URGENT` as spend-dependent (done)?** If the agent pauses for non-spend reasons (tracking, policy), remove them from the table.
5. **Run a 90-day backfill for accounts whose data-health shows a recent unverified period.** The repair route already enqueues one; sync appends raws for what it fetches, so re-fetched days become verified again. Not run here.
6. **Campaign reconciliation tolerance** (2 % / rows + 1): keep, or tighten once real day-total deltas are measured.
