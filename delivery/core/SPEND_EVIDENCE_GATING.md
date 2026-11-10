# Unverified IQD spend: visible per period, and kept out of the advice that rests on it

Status: **implemented and tested locally; not deployed; no production data touched.**
Branch `local/rc-spend-recs` (base `c25724d`). Builds on `DATA_HEALTH_ISOLATION.md` §4 and `IQD_REPAIR.md`.
No database migration. All response changes are additive.

> Owner requirement (verbatim): *"Keep SPEND_SCALE_UNVERIFIED visible for affected periods after factor=1. Exclude unverified spend from recommendations that depend on it."*

**Second round (branch `local/rc-fix-spend`, base `2a5fb34`).** An independent review of the first version found that the gate did not cover every advice path it claimed to. This file has been corrected: §3 and §5 now include `aiRecommendations`, the weekly report and the prior window, §8.3 is a table of what is gated and what is not (the first version's list was incomplete and one sentence in §5 — that `aiRecommendations` were "already judged at their own tick" — was wrong: the Brain gate rewrites only `decision.action`, while the pattern and `finalScore` those cards are built from carry the cost-blended physics score), and §8.10–8.12 and §9 record the findings that are owner decisions rather than code. Thresholds and tolerances are unchanged.

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
| `GET /api/dashboard/:id` | `dataQuality: { flags: [SpendScaleFlag], withheld: [{ surface, reason, detail? }] }` — present **only** when something is in doubt: the 30-day window (flag first), the 30 days **before** it (a flag marked `window: 'prior'` — the KPI deltas compare against it; it gates nothing), the weekly report's own 7+7 day window, or a surface was withheld. Surfaces: `priorityAction`, `issues`, `knowledgeBase`, `drain`, `forecast`, `bleedAlert`, `steadyState`, `predictions`, `aiRecommendations`, `weeklyReport` |
| `GET /api/weekly-report/:id` | the report's own `dataQuality` (same shape, flags judged at CAMPAIGN level over its 7+7 days) and `X-Data-Quality` (§5) |
| `GET /api/workspaces/:id/insights?days=N` | header `X-Data-Quality: SPEND_SCALE_UNVERIFIED` (or `…_OVERSCALED`) when `[today−N, ∞)` holds affected rows (ACCOUNT level). The body stays the same array. **If the evidence cannot be read the answer is still 200 with the rows and `X-Data-Quality: SPEND_SCALE_UNVERIFIED`** (fail closed on the flag, open on the data; it used to be a 500) |
| `GET /api/workspaces/:id/campaigns?days=N` | the same header, judged at CAMPAIGN level (§4), the same fail-closed-flag / open-data behaviour |
| `GET /api/workspaces/:id/recommendations` | headers `X-Data-Quality` and `X-Recommendations-Withheld: n` whenever the account's own 30-day window is not clean **or** a stored row was suppressed — independent of what is stored: the engines *decline to write* spend-dependent rows on unverified spend, so an empty list must not read as "nothing to do". `n` counts the stored rows suppressed (0 when the engines simply declined). `?include=suppressed` returns `{ recommendations, suppressed, dataQuality: { spendWithheldCount, flags } }` (§5) |

`SpendScaleFlag = { code, severity: WARN|CRITICAL, message, messageAr, level, rows, of, from, to, periods, window?: 'prior', unreadable?: true }` — `rows` unverified (or over-scaled) rows in the range, `of` account rows in the range, `periods` the runs inside it, `window: 'prior'` the comparison window, `unreadable` an evidence read that failed (treated as unverified). A range that holds no affected row (even if an older range does) carries nothing. Arrays cannot grow a key, hence headers there.

**What a user sees.** `apiFetch` hands a page the JSON body, not the headers, so the headers are for API consumers and the pages read `dataQuality` from the dashboard body they already load: the dashboard page and the recommendations page each render a banner (`#data-quality-banner`, Arabic, server text escaped) when it is present; the recommendations banner ignores the prior-window flag (it is about KPI comparisons, not advice). The dashboard's weekly-report block drops its "Scale this" budget link while the report carries `dataQuality`. The mobile app does not read `dataQuality` (not changed).

Not flagged: `/export/*.csv`, the campaign inspector, `/campaigns/:id` — see §8.3.

## 4. Campaign-level rows

Production sync stores raws for ACCOUNT rows only (`syncAccount.ts`), so a campaign row can **never** be proven directly. Rule, implemented in `src/lib/spendEvidence.ts::dayStatusAtLevel`:

A campaign day D is **VERIFIED** only if **both**
1. the account row of D is VERIFIED by a raw counterpart, and
2. the sum of that day's campaign rows reconciles with the account row: `|Σcampaign − account| ≤ max(2 % × account, campaignRows + 1)` (2 % = the OK band of the existing `ACCOUNT_CAMPAIGN_DIVERGENCE` check; `campaignRows + 1` is what per-row integer rounding can add up to).

Otherwise: account row over-scaled → OVERSCALED; account row unproven, **or** campaigns that do not add up to a verified account row, **or** campaign rows with no account row at all → UNVERIFIED. A day with no campaign rows has nothing to judge. A reconciling campaign sum next to an *unproven* account row stays UNVERIFIED (both could be ×100 together).

Limits, stated plainly: this proves the campaigns are *consistent with the account total*, not that any individual campaign is right (an error that cancels between campaigns passes; one campaign mis-scaled while another compensates exactly is not caught). Campaign-level raws, if sync ever stores them, are **not** used by the gate. A campaign deleted inside the window (its rows gone, its spend still in the account total) makes that day diverge → UNVERIFIED: conservative, and the existing divergence check already reports the same thing. The partial current day can diverge by more than 2 % between the account fetch and the campaign fetch → UNVERIFIED until the next sync.

## 5. Excluding unverified spend from spend-dependent recommendations

### Honest note on "one choke point"

There is not one. Recommendations are written by four producers and read by three surfaces, and two further dashboard blocks (`aiRecommendations`, the weekly report) generate advice of their own from other inputs. What *is* central is **one policy module** (`src/lib/spendEvidence.ts`: the evidence, the classification of what depends on spend, the partition function) applied at every producer and every reader below. The two display readers of stored `recommendations` (`GET /recommendations`, `getDashboard`) cover rows from *any* producer and *any* date, so a recommendation stored before this change, or by a producer I did not touch, is still withheld at display.

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
| `getDashboard` (prior window; flag only) | the 30 days before it (`priorSinceDate` → the day before `sinceDate`) | ACCOUNT |
| `aiRecommendations` | the dashboard's 30-day verdict, **and** each campaign's own latest stored Brain verdict (`decision.spendEvidence`, judged at CAMPAIGN level by the orchestrator) | — |
| weekly report (route and dashboard) | 7 + 7 days ending yesterday (`date >= today−14 && date < today`, as its queries read them) | CAMPAIGN (it sums campaign rows) |

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
| `getDashboard` | the best stored recommendation that does not rest on spend becomes `priorityAction` (the next one, not nothing); spend-dependent issues, the KB cost breaches, the cost diagnosis (`diagnose`), `drain`, `forecast`, `bleedAlert`, `predictions.budgetExhaustion` (pace/budget from today's spend against the burn rate), and the steady-state CPA/CPM/ROAS verdicts are left out; `aiRecommendations` and `weeklyReport` are gated as in the next rows; each is named in `dataQuality.withheld`. `predictions.creativeFatigue` does not rest on spend and is not touched. KPI **numbers** are still shown as stored — the gate withholds advice, it does not rewrite money |
| `aiRecommendations` (dashboard cards) | built from the Brain snapshots' `patternSignature` / `finalScore`, **not** from the gated `decision.action`: the pattern comes from the physics score, which blends cost-per-message, so the Brain's own gate never reached it. On an unverified dashboard window (or for a campaign whose **latest** stored Brain snapshot carries `decision.spendEvidence.withheld` — an older withheld tick next to a newer clean one does not count) the **scale** card (mirrors `SCALE_BUDGET`) and the **pause / creative-refresh** card (mirrors `PAUSE_CAMPAIGN` / `REFRESH_CREATIVE`) are not emitted — the cards that mirror what the Brain keeps (`HOLD_AND_MONITOR`, `KEEP_COLLECTING`: watch, optimize) stay. The AI narrative is **not used** when gated: it is handed the scores and may answer with a budget move, and a model answer cannot be post-checked. The DTO says what was left out (`spendWithheld: { reason, ids }`, absent when nothing was) and the dashboard lists it |
| weekly report (`weeklyReport.ts`: `dashboard.weeklyReport`, `GET /api/weekly-report/:id`) | evaluates its own 7+7 day CAMPAIGN window (unreadable = unverified; the report is still served). When not clean: **no budget-increase line** for the best-CTR campaign, **no pause** (the worst-CTR campaign gets the creative-only line), **no "paused automatically to protect the budget" line**, `delta.spendPct` and `delta.costPerResultPct` are null and the spend-trend sentence is dropped (a change across a ×100 boundary reads as a 99 % swing), the highlights lose `pattern` / `healthScore` (cost-blended) and a spend-dependent `action` left over from before the gate, the AI narrative is not used, and a line says the spend-based advice is withheld and why. **Kept:** the creative-refresh line, the results-dropped line, `delta.resultsPct` / `ctrPct`, the CTR ranking, and the absolute figures (`spend`, `cpm`, `costPerResult`, shown as stored). `dataQuality: { flags, withheld }` is on the report and `X-Data-Quality` on the route |

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

Second round: `test_spend_evidence.ts` §10 (fake prisma: `aiRecommendations`, the weekly report with and without a stubbed AI provider, the fail-closed flag, the prior-window flag, wiring, and the two page banners lifted out of their source and run against a stub DOM with hostile server text) and `test_spend_evidence_postgres.ts` §8 (an IQD twin — verified / unverified / USD — through the real app: dashboard `aiRecommendations` and `weeklyReport`, `GET /api/weekly-report/:id`, `GET /recommendations` with no stored row, the prior window, and a `raw_insights` that cannot be read).

Existing engine tests (`test_rules`, `test_recommendation`, `test_evidence_contract`) construct fake Prisma objects; each gained a read-only `adAccount.findFirst` returning a USD account (the engines now read the account's currency). Nothing else in those tests changed.

## 7. Where it lives

`src/lib/spendScaleRule.ts` (rule) · `src/lib/spendEvidence.ts` (periods, windows, classification, partition, flag) · `src/lib/iqdRepair.ts` (now imports the rule, behaviour identical) · `src/services/dataIntegrityMonitor.ts` · `src/engines/rules/{RulesEngine,detectRisingCostPerResult,loadCampaignSignals,types}.ts` · `src/engines/recommendation/RecommendationEngine.ts` · `src/engines/intelligence/AdlyticIntelligenceSystem.ts` · `src/engine/{AdlyticBrain,DecisionEngine}.ts` · `src/workers/{runBrainOrchestrator,runEngines}.ts` · `src/services/agent/tools/saveRecommendation.ts` · `src/services/getDashboard.ts` · `src/services/aiRecommendations.ts` · `src/services/weeklyReport.ts` · `src/web/pages/{dashboardPage,recommendationsPage}.ts` (the banners) · `src/api/server.ts` (the recommendations route, `/insights`, `/campaigns`, `/api/weekly-report`: small local edits).

## 8. Limits and honest caveats

1. **Verification is not remembered.** There is no per-row "verified on" mark (that would need a migration). A row verified today becomes *unverified* once its raws are pruned (90 days after `fetched_at`), so the oldest history of every IQD account drifts into `unverifiedPeriods` over time, and "was verified when fresh" cannot be told from "never verified". The gate itself is unaffected (its windows are ≤ 30 days, far inside retention). A re-sync/backfill of an old window re-appends raws and re-verifies rows whose stored value matches. **Owner decision 2.**
2. **Strict by design.** One unverified day anywhere in a 14/16/30-day window withholds the whole spend-dependent family for that window, including for a window that is *probably* correct (the common cause is a sync gap, not ×100). A zero-spend row counts as unverified like any row without a raw (same definition as the existing counter). The partial current day without a raw yet is unverified until the sync that writes its raw.
3. **Which surfaces are gated, flagged, or neither** (verified against the code and, where noted, a test; an item marked *not probed* was read, not run):

   | surface | state | how it was checked |
   |---|---|---|
   | RulesEngine, RecommendationEngine, V5 shadow engine (rising-cost rule, KB cost metrics), Brain verdicts, `save_recommendation` | **gated** | `test_spend_evidence.ts` §6–8 and the PG twin |
   | `GET /recommendations` (stored rows, any producer, any date) | **gated**; the window flag and count are also set when nothing is stored | PG §5, §8 |
   | dashboard: `priorityAction`, issues, KB cost breaches, `diagnose`, `drain`, `forecast`, `bleedAlert`, `predictions.budgetExhaustion`, steady-state verdicts | **gated** | PG §6 (steady-state: static only, see below) |
   | dashboard `aiRecommendations` | **gated** (scale and pause / creative-refresh cards; AI narrative not used) | PG §8, static §10 |
   | weekly report (dashboard block and `GET /api/weekly-report/:id`) | **gated** (advice, spend and cost-per-result changes, cost-blended highlight fields; figures shown as stored) | PG §8, static §10 |
   | KPI numbers and charts, `/insights`, `/campaigns` (rows), dashboard KPI **deltas** | shown as stored; **flagged** (`dataQuality`, `X-Data-Quality`); the prior-window flag covers the deltas | PG §2, §8 |
   | `/data-health` | reports the periods (§2) | PG §1 |
   | AI **chat** answers (`aiContextBuilder`: KPIs, per-campaign CPM, daily spend series) | **not gated** — free text from ungated figures; see 8.12 | read, not probed |
   | dashboard `intelligence.health` efficiency facet | **not gated** — the reviewer's twins gave the same score (66) and efficiency facet (60) verified and unverified; see 8.13 | reviewer's probe |
   | dashboard `morningStory` ("at X IQD per message") | **not gated** — a KPI-style figure from stored rows, the same number the KPI cards show; see 8.13 | reviewer's probe |
   | dashboard `brain.livePulse.intraDaySpendPct` and the strip line built from it | **not gated** — today's spend against the budget; see 8.13 | reviewer's probe |
   | `brain.cmoFeedV2` narrations | verdicts are the Brain's (gated at their tick); the cost-per-message efficiency numbers in a snapshot payload are the physics values | *not probed* |
   | `weeklyReport.brainActions` counts | not gated — counts of the Brain verdicts stored in the last 7 days; a snapshot written before the gate keeps its old verdict until the next tick (8.4) | read |
   | CSV exports, `campaignInspector`, `getCampaignDetails`, ad-assessor, ad-set / ad entities (no producer emits them), the V5 shadow engine's *signals* table (`CPM_TREND` / `SPEND_TREND`) | **not gated** | read |

   Any of the not-gated rows can show a spend figure or a cost comparison computed from unverified rows. The steady-state benchmark gating (CPA / CPM / ROAS verdicts) is asserted statically only: a steady-state dashboard needs zero issues, and no realistic IQD seed gets there (every measured CTR breaches the knowledge-base floor or the benchmark band), so no behavioural test reaches it.
4. **Brain snapshots are rewritten per tick.** A stored snapshot keeps its old verdict until the next orchestrator run (the next sync). Stored `recommendations` rows are judged again at every read, so they do not have that lag.
5. **Classification is by action code and source issues.** An AI-authored `PAUSE`/`PAUSE_URGENT` is treated as spend-dependent because the code cannot say why it paused. A new action code that is not in the table is treated as spend-independent until added (the table is `SPEND_DEPENDENT_ACTION_CODES`). A brand-new spend-derived KB metric must be added to `SPEND_DERIVED_KB_METRICS`.
6. **Brain verdicts are a blend.** The physics score weights cost-per-message in every verdict, so there is no spend-free remainder of a physics decision; all five cost-based verdicts are withheld together. The generic `HOLD_AND_MONITOR` card copy says "no intervention warranted"; only `reason` and `spendEvidence` say it was withheld.
7. **Cost.** IQD accounts add two to three small indexed reads per engine run / dashboard / recommendations read (account rows, grouped distinct raw spends, and — at CAMPAIGN level — one campaign aggregate). `GET /recommendations` reads once per entity, not once per stored row. Non-IQD accounts add none. I did not benchmark against production volumes.
8. **Existing data-health WARN scope is unchanged** (30 days). I did not extend it to the 90-day raw horizon, which would be the natural place to warn about *actionable* holes; see decision 1.
9. **Not verified live:** production's share of IQD accounts with unverified windows (on Railway the first effect will be that those accounts lose their cost-based recommendations until a backfill re-verifies the rows), raw-row coverage, real Meta payloads. Everything here ran on synthetic Postgres 16 rows.

10. **Owner decision — the Brain loses its cost-based verdicts on a small campaign-vs-account drift (SE-3).** The Brain's window is `EVIDENCE_WINDOWS.brain` (16 days **ending today**, lag 0) at CAMPAIGN level, where a day is verified only if the account row is verified **and** the campaign rows reconcile within `max(2 %, rows + 1)` (§4). So a fully verified account — every account row has its raw counterpart — still loses every cost-based verdict when the campaign rows do not add up. The reviewer's four synthetic tenants (8 MESSAGES campaigns, every ACCOUNT row matched by a raw): clean → `HOLD_AND_MONITOR` + `SCALE_BUDGET`, no `spendEvidence`; **today's campaign rows at 97 % of the account row → `HOLD_AND_MONITOR` only, `spendEvidence = { reason: SPEND_SCALE_UNVERIFIED, rows: 16, unverified: 1 }`**; one campaign (12 % of spend) missing its last 3 days → `HOLD_AND_MONITOR` only, `unverified: 3`; the USD twin of the drift case → `HOLD_AND_MONITOR` + `SCALE_BUDGET`. Two things make it more than a strict-by-design note: the reason text on the verdict says "not verified against raw Meta data", which is not what failed (the account total was verified; the campaigns did not add up to it), and the account row is fetched in `backgroundScheduler.ts` Phase 1 and the campaign rows in Phase 2 (campaign fetch concurrency 5, `syncAccount.ts`), so today's partial row is the likeliest to drift. A second reviewer's reproduction found it transient (the snapshot is upserted per tick-day, and the next pass with caught-up campaign rows restores the verdict) and, with uniform spend and a 5 s account-vs-campaign fetch skew, reconciling from minute 5 of the account's day (15 s from minute 13, 30 s from 25, 60 s from 50, 120 s from 100); **how often it happens in production was not measured.** **I changed nothing** — no threshold, tolerance, window or wording. Options for the owner: keep (strict); exclude (or widen the tolerance for) the current partial day at CAMPAIGN level; reword the reason to "the campaigns do not reconcile with the verified account total". The same mechanism applies to the weekly report (CAMPAIGN level), which excludes today, so only a campaign missing days or a day with a real divergence trips it there.
11. **The prior window is flagged, not gated (SE-4).** The KPI deltas (`deltaPct`) compare the 30-day window with the 30 days before it. A clean current window next to an unverified prior one — exactly the shape after a stale-factor repair — used to show "spend and CPM down ~99 %" with no flag (reviewer's probe: spend `3,000,000 IQD` Δ −0.99, CPM `4,000 IQD` Δ −0.99, `dataQuality` undefined; the twin whose prior window has the same evidence but correct values shows Δ 0). The dashboard now evaluates the prior window too (one more small ACCOUNT-level read, IQD only) and lists its unverified days in `dataQuality.flags` marked `window: 'prior'` (a CRITICAL / WARN flag with the same code, `rows`, `of`, `from`, `to`, `periods`). It **gates nothing**, and the delta is **still shown as stored**: suppressing `deltaPct` was not a small change (it is a shared KPI shape the pages and the mobile app read), and the money-as-stored rule of §5 applies. `attributeChange` takes impressions, clicks and results only, so it does not rest on spend (a second reviewer's probe: identical with a ×100 prior window). Because the dashboard is called with the default 30-day window, the prior window is days 30–60 back, inside the 90-day raw retention; an account whose rows there were never evidenced now carries a prior-window flag and the banner — that is accurate, and visible on more accounts than before.
12. **AI chat context is ungated (SE-9).** `src/services/aiContextBuilder.ts` hands the model the account KPIs, per-campaign CPM (line 100) and the daily spend series (line 125) and never tells it the window is unverified; `save_recommendation` itself is gated, the free-text answer is not, so a chat answer can state CPA or budget conclusions from unverified figures. The reviewer suggested passing `dataQuality` into the context and prompt and telling the model not to give budget / pause / CPA advice when it is set. **Not done** — a prompt instruction is not a gate (the model cannot be post-checked) and the chat context is a separate producer; owner decision. Related (doc caveat 5): an AI-authored `REFRESH_CREATIVE` / `MONITOR` row is kept, and may carry spend-based text, because classification is by action code only.
13. **Residual spend-derived dashboard facets (SE-10).** `dashboard.intelligence.health` (the efficiency facet; the reviewer's twins: score 66, efficiency 60, identical verified and unverified), `dashboard.morningStory` (`بكلفة 3,273 IQD للرسالة`, identical) and `dashboard.brain.livePulse.intraDaySpendPct` (3.6, identical) are KPI-style figures with no `dataQuality` entry. They are shown as stored under the same rule as the KPI cards; none is an action. I did not gate them (gating one facet of a composite health score is not cheap, and a cost-per-message in the morning story is the same number the KPI cards show). Owner decision.
14. **Not run / not verified (second round).** The LLM paths were exercised against a stubbed provider only (no real model); production share of IQD accounts that will now show a prior-window or weekly-report flag is unmeasured; the mobile app does not render `dataQuality`; the weekly-report worker (`runWeeklyReportWorker.ts`) stores each report as JSON in `platform_settings` (`weekly-report:<workspaceId>`) — nothing in `src` reads that copy back (grepped), and it now carries `dataQuality`.

## 9. Owner decisions

1. **Older-than-window periods: list only (done) or also surface in the data-health banner / WARN?** (§2.) My recommendation: list only; add a banner line only for periods inside the 90-day raw horizon, where a backfill can fix them.
2. **Persist a "verified on" mark per row** (needs a schema change, which is gated) so that verified history stays verified after its raws are pruned? Without it `unverifiedPeriods` slowly absorbs the oldest history of every account.
3. **Strict withhold (done) or partial recompute from the verified remainder** once it meets a minimum sample? The brief allowed either; I chose strict because partial recompute of trends across a hole is itself a guess.
4. **AI-agent `PAUSE` / `PAUSE_URGENT` as spend-dependent (done)?** If the agent pauses for non-spend reasons (tracking, policy), remove them from the table.
5. **Run a 90-day backfill for accounts whose data-health shows a recent unverified period.** The repair route already enqueues one; sync appends raws for what it fetches, so re-fetched days become verified again. Not run here.
6. **Campaign reconciliation tolerance** (2 % / rows + 1): keep, or tighten once real day-total deltas are measured. Linked to 7 below.
7. **Brain at CAMPAIGN level on today's partial row (8.10):** keep strict; exclude / widen for the current day; and fix the reason wording. The reviewer's numbers are in 8.10.
8. **AI chat context (8.12):** pass `dataQuality` into the context and prompt, gate the chat's spend figures, or accept free-text answers from ungated figures.
9. **Health efficiency facet, morning story, live pulse (8.13):** gate, flag, or leave as KPI-style figures shown as stored.
10. **Prior-window flag (8.11):** keep it flag-only, or suppress `deltaPct` of spend-derived KPIs when the prior window is not clean (a shared-shape change).
