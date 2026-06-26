# Adlytic Dashboard — Data Integrity Report

**Date:** 2026-06-26  
**Scope:** End-to-end trace of 10 dashboard metrics (Meta → mapper → sync → DB → `getDashboard` → UI)  
**Branch context:** main with restored dashboards (`cc00f93`) + IQD/metrics fixes  
**Live DB verification:** `scripts/diagnose-iqd-full.ts`, `scripts/compare-raw-vs-stats.ts`, ad-hoc aggregate query (3 accounts)

---

## Executive Summary Table

| Metric | UI shows | DB has | Match? | Severity |
|--------|----------|--------|--------|----------|
| **30-Day Spend** | Pro hero: client Σ first 30 insight rows (`hero-30-val`). Beginner/KPI: `dash.kpis[spend]` | `daily_stats.spend` Σ over rolling 30d, `entity_type=ACCOUNT` | ⚠️ Mostly — USD prod: **$155.64** both paths if synced; date-truncation can drift ±1 day | **MEDIUM** |
| **Lifetime Spend** | Pro hero: Σ all rows in 90d insights fetch (`hero-life-val`) — **mislabeled** | `ad_accounts.lifetime_spend_minor` from Meta `date_preset=lifetime` | ❌ **No** — prod USD: UI would show **$704.53** (90d) vs DB **$1,282.94** (true lifetime) | **HIGH** |
| **CTR (window)** | KPI grid `kpis[ctr].display`; charts from `trendSeries.ctr` or insights | Window Σclicks/Σimpressions×100 on `daily_stats` | ✅ KPI math correct when data present | **LOW** (delta badges differ — see below) |
| **CPM** | KPI `kpis[cpm].display` | `(Σspend_major/Σimpressions)×1000` on `daily_stats` | ✅ When factor correct | **LOW** |
| **Reach** | KPI `kpis[reach]` — “Reach (latest day)” | Last row in 30d window: `daily_stats.reach` | ❌ vs Meta 30d window reach | **MEDIUM** |
| **Frequency** | KPI `kpis[frequency]` | Arithmetic mean of daily `frequency` | ⚠️ Approximate vs Meta window frequency | **MEDIUM** |
| **Messages / Results** | KPI `kpis[messages]`; chart may plot messages as “Impressions” | Σ `daily_stats.messages` (`pickMessages` at ingest) | ✅ Messages match raw (prod verified) | **LOW** |
| **Health Score** | `dash.health.score` + band pill (beginner) | `health_scores.score` where `algorithm_version=2`, latest date | ✅ Engine output; **7d lagged window**, not 30d KPI window | **LOW** (semantic mismatch) |
| **Campaign budget/spend** | Active cards + table: `campaign.dailyBudget` / `lifetimeBudget` via `fmtCurrencyMinor` | `campaigns.daily_budget` (offset/minor, no ×factor at sync) | ✅ Budget display correct; card CTR/CPM are **latest-day** snapshots | **MEDIUM** |
| **Live Pulse / intraDaySpendPct** | `brain.livePulse.intraDaySpendPct` → `#brain-pulse-spendpct` | Σ campaign `daily_stats.spend` today UTC ÷ Σ `campaigns.daily_budget` ACTIVE | ⚠️ Null when no daily budgets; ignores lifetime-budget campaigns | **MEDIUM** |

**Production snapshot (2026-06-26, `act_2040815276495175` USD):**

| Field | Value |
|-------|-------|
| 30d spend (DB minor) | 15,564 → **$155.64** |
| 90d spend (hero “Lifetime”) | 70,453 → **$704.53** |
| `lifetime_spend_minor` | 128,294 → **$1,282.94** |
| Messages 30d | 606 (raw vs stat: OK) |
| Window CTR (computed) | 7.57% |
| Health score (v2) | 85 |

---

## Per-Metric Trace

### 1. 30-Day Spend

| Layer | Detail |
|-------|--------|
| **UI (Pro hero)** | `#hero-30-val` — `renderHero()` sums `insights90.slice(0,30)` → `fmtCurrencyMinor` |
| **UI file:line** | `dashboardPage.ts:563-576`, `477-481` |
| **UI (Beginner)** | `getKpi(dash,'spend')` → `fmtSimpleMoney(spend.value, …)` |
| **UI file:line** | `beginnerDashboardPage.ts:307-314`, `259-266` |
| **UI (Advanced KPI)** | `renderKpis(dashData.kpis)` — key `spend` |
| **UI file:line** | `dashboardPage.ts:733-754`, `1180-1182` |
| **getDashboard** | `totalSpendMinor = sum(daily, "spend")` over window; `display: money(totalSpendMinor)` |
| **getDashboard file:line** | `getDashboard.ts:223-224`, `246-247`, `279`, `314-316`, `287-294` |
| **DB source** | `daily_stats.spend` BIGINT minor, `entity_type='ACCOUNT'`, `entity_id=ad_account.id` |
| **Ingest** | `insightMapper.ts:60-61` — `spendMajor × currencyMinorFactor` |
| **Sync** | `syncAccount.ts:282-289` — account-level upsert; auto-sync default **3 days** only (`syncAccount.ts:215`) |
| **Date range** | Server: rolling `now - 30×86400000ms`, then **UTC date floor** via `since.toISOString().slice(0,10)` (`getDashboard.ts:246-247`). Insights API: rolling 30×86400000ms **without** UTC floor (`server.ts:1776-1777`). Neither uses account timezone. |
| **currencyMinorFactor** | Ingest: `resolveCurrencyMinorFactor` (`syncAccount.ts:286`). Display: `money()` divides by factor; client `hydrateCurrencyState` forces IQD→1 (`dashboardPage.ts:504-506`). Auto-heal on dashboard read (`getDashboard.ts:237-244`). |
| **Meta divergence** | Matches Ads Manager “Last 30 days” **when** full 30d backfill exists and attribution settled (~72h lag). Auto 3-day sync leaves older days stale until chunked backfill (180d on connect, `server.ts:86`). |

---

### 2. Lifetime Spend

| Layer | Detail |
|-------|--------|
| **UI (Pro hero)** | `#hero-life-val` — `sumMinor(insights90)` (all rows returned, max 90) |
| **UI file:line** | `dashboardPage.ts:567-578`, `592-595` (subtitle: “Account history (N-day window)”) |
| **UI (Beginner)** | **Not shown** — only 30d spend card |
| **getDashboard** | **Not exposed in DTO** — no lifetime KPI field |
| **DB source (unused by hero)** | `ad_accounts.lifetime_spend_minor` — populated by `syncLifetimeTotals()` |
| **Sync file:line** | `syncAccount.ts:333-363` — Meta `getLifetimeTotals`, `spendMajor × factor` → BigInt |
| **Heal** | `iqdRepair.ts:208-234` — heuristic ÷100 if lifetime ≫ 90d sum |
| **Date range** | Hero: whatever `/insights?days=90` returns (cap 90, DESC). DB lifetime: Meta `date_preset=lifetime` (all-time). |
| **currencyMinorFactor** | Same as spend at sync + heal |
| **Meta divergence** | **HIGH** — hero label says “Lifetime Spend” but shows ≤90-day sum. Prod gap: **$578.41** (lifetime $1,282.94 vs 90d $704.53). Ads Manager account lifetime spend ≠ 90d rollup. |

---

### 3. CTR (window)

| Layer | Detail |
|-------|--------|
| **UI** | KPI `kpis[ctr].display`; CTR chart `#chart-ctr` from `trendSeries.ctr` or per-day insights |
| **UI file:line** | `dashboardPage.ts:733-754`, `1189-1203`; `beginnerDashboardPage.ts:348-353` |
| **getDashboard** | `ctrWindow = totalImpr > 0 ? (totalClicks/totalImpr)*100 : null` |
| **getDashboard file:line** | `getDashboard.ts:282-283`, `302-304`, `319-321`, `337` |
| **DB source** | Σ `daily_stats.clicks`, Σ `daily_stats.impressions`; per-day `ctr` stored from Meta passthrough |
| **Ingest** | `insightMapper.ts:104` — `nullableFloat(row.ctr)` (daily rate, not recomputed) |
| **Date range** | 30d rolling window (default `windowDays=30`) |
| **currencyMinorFactor** | N/A for CTR |
| **Meta divergence** | Window-total CTR matches Ads Manager when impressions/clicks complete. **KPI delta badges** use `metric_trends.ctr_trend` from AnalyticsEngine — **impression-weighted mean of daily rates** (`aggregate.ts:57-68`), not window-total comparison → badge can disagree with KPI value. |

---

### 4. CPM

| Layer | Detail |
|-------|--------|
| **UI** | KPI `kpis[cpm].display` |
| **UI file:line** | `dashboardPage.ts:733-754`; not on beginner cards |
| **getDashboard** | `cpmWindow = (totalSpendMajor/totalImpr)*1000` |
| **getDashboard file:line** | `getDashboard.ts:305-307`, `322-324` |
| **DB source** | Σ `spend`, Σ `impressions`; per-day `cpm` in minor units from mapper |
| **Ingest** | `insightMapper.ts:107` — `nullableFloat(row.cpm, factor)` |
| **Date range** | 30d window |
| **currencyMinorFactor** | Spend summed in minor → converted to major for CPM; stored `cpm` already scaled at ingest |
| **Meta divergence** | Window formula correct. Trend deltas (`metric_trends.cpm_trend`) use weighted daily CPM mean — may diverge from KPI. IQD historical ×100 inflated CPM until heal (`iqdRepair.ts`). |

---

### 5. Reach

| Layer | Detail |
|-------|--------|
| **UI** | KPI `kpis[reach]` — label “Reach (latest day)” |
| **UI file:line** | `dashboardPage.ts:733-754`; fallback `buildKpisFromInsights` uses `insights[0].reach` (`1066-1076`); `beginnerDashboardPage.ts:308-318` |
| **getDashboard** | `totalReach = daily.length ? Number(daily[daily.length-1].reach) : 0` (last day in ASC window) |
| **getDashboard file:line** | `getDashboard.ts:281`, `328-329` |
| **DB source** | `daily_stats.reach` — daily unique users from Meta |
| **Ingest** | `insightMapper.ts:64` — `int(row.reach)` |
| **Date range** | Value = **most recent day** in 30d window, not Σ |
| **currencyMinorFactor** | N/A |
| **Meta divergence** | Meta Ads Manager “Reach” for 30d is **deduplicated across the window** (not available as a single daily field). Adlytic shows **yesterday’s daily reach** (prod: 737 on 2026-06-25). Expect large mismatch vs Ads Manager 30d reach. |

---

### 6. Frequency

| Layer | Detail |
|-------|--------|
| **UI** | KPI `kpis[frequency].display` |
| **UI file:line** | `dashboardPage.ts:733-754` (advanced KPI grid only) |
| **getDashboard** | `freqAvg = avg(daily, "frequency")` — unweighted mean of daily values |
| **getDashboard file:line** | `getDashboard.ts:308-312`, `325-327` |
| **DB source** | `daily_stats.frequency` per day |
| **Ingest** | `insightMapper.ts:109` |
| **Date range** | Mean over 30d days with non-null frequency |
| **currencyMinorFactor** | N/A |
| **Meta divergence** | True window frequency = impressions ÷ **unique reach over window**. Daily mean ≠ Meta window frequency. Code comment acknowledges limitation (`getDashboard.ts:308-311`). |

---

### 7. Messages / Results (conversions)

| Layer | Detail |
|-------|--------|
| **UI** | KPI `kpis[messages]`; beginner “الرسائل”; chart mislabels messages series as “Impressions” |
| **UI file:line** | `beginnerDashboardPage.ts:320-323`; `dashboardPage.ts:1198`, `426-427` |
| **getDashboard** | `totalMsgs = sum(daily, "messages")`; delta from `trend.resultsTrend` |
| **getDashboard file:line** | `getDashboard.ts:280`, `317-318` |
| **DB source** | `daily_stats.messages` |
| **Ingest** | `insightMapper.ts:76`, `205-214` — **`pickMessages()`** single canonical action (not summed types) |
| **Date range** | 30d Σ |
| **currencyMinorFactor** | N/A |
| **Meta divergence** | **Fixed** vs prior double-count bug. Prod raw-vs-stat: messages **OK** on sampled days. `conversions` column defaults to messages-first (`insightMapper.ts:82`) — not objective-aware (P2 in METRICS_AUDIT). |

---

### 8. Health Score

| Layer | Detail |
|-------|--------|
| **UI** | `dash.health.score`, `dash.health.band` → beginner status pill + progress bar |
| **UI file:line** | `beginnerDashboardPage.ts:288-297`, `366-394`, `408-414` |
| **getDashboard** | Reads latest `health_scores` where `algorithm_version=2` |
| **getDashboard file:line** | `getDashboard.ts:255-265`, `400`; bands `getDashboard.ts:192-196` |
| **DB source** | `health_scores` (engine output), facets from 7d window + 2d attribution lag |
| **Engine file:line** | `HealthScoreEngine.ts:104-117`, `HEALTH_ALGORITHM_VERSION=2` |
| **Date range** | **7 days**, ending `asOf - 2 days` — **not** the 30d KPI window |
| **currencyMinorFactor** | N/A |
| **Meta divergence** | Adlytic composite score — no direct Meta equivalent. Users may expect score to reflect same 30d window as spend KPI. |

---

### 9. Campaign Card Spend / Budget

| Layer | Detail |
|-------|--------|
| **UI (budget)** | Active cards + campaigns table: `c.dailyBudget` or `c.lifetimeBudget` → `fmtCurrencyMinor` |
| **UI file:line** | `dashboardPage.ts:666-668`, `781-783` |
| **UI (performance)** | Spotlight `bestCampaign` / `worstCampaign` — health, messages, ctr, cpm, frequency from cards DTO |
| **getDashboard** | `buildCampaignCards()` — latest `daily_stat` per campaign + latest health |
| **getDashboard file:line** | `getDashboard.ts:411-467`, `382-407` |
| **DB source (budget)** | `campaigns.daily_budget`, `campaigns.lifetime_budget` — Meta offset units, stored as-is |
| **DB source (metrics)** | `daily_stats` where `entity_type=CAMPAIGN` — latest date only for card ratios |
| **Sync** | Budgets: `syncAccount.ts:396-408`; campaign stats: no `raw_insights` backup (`syncAccount.ts:381-383`) |
| **Date range** | Card CTR/CPM/frequency = **single latest day**, not 30d window |
| **currencyMinorFactor** | Display: `minor/factor`; budgets already in billable units |
| **Meta divergence** | Budget values match Meta when synced. Card performance metrics ≠ Ads Manager campaign 30d aggregates. |

---

### 10. Live Pulse / intraDaySpendPct

| Layer | Detail |
|-------|--------|
| **UI** | `#brain-pulse-spendpct` — `pulse.intraDaySpendPct.toFixed(1) + '%'` |
| **UI file:line** | `dashboardPage.ts:356-358`, `1038-1044`, `1046-1055` (polls `/api/dashboard/pulse/:wsId` every 60s) |
| **getDashboard / pulse** | `intraDaySpendPct = totalSpendTodayMinor / totalDailyBudgetMinor × 100` |
| **getDashboard file:line** | `getDashboard.ts:604-625`, `631-638`; pulse: `689-764` |
| **DB source** | Campaign `daily_stats.spend` for `date=tickToday` (UTC midnight); `campaigns.daily_budget` for ACTIVE campaigns |
| **Date range** | **Today UTC** only |
| **currencyMinorFactor** | Both spend and budgets in same minor/offset units — ratio is factor-invariant |
| **Meta divergence** | Denominator excludes campaigns with only `lifetime_budget` (null daily). Meta intraday pacing not identical. Requires `CampaignBrainSnapshot` rows for section visibility. |

---

## Major Discrepancies

### 🚨 [Root Cause]: “Lifetime Spend” hero shows 90-day sum, not account lifetime

**English:** The Pro dashboard hero card is labeled “Lifetime Spend” but computes `sum(insights)` over the `/insights?days=90` payload. It never reads `ad_accounts.lifetime_spend_minor`, which `syncLifetimeTotals()` populates from Meta’s true lifetime preset. On production USD account, UI would show **$704.53** while DB holds **$1,282.94** lifetime — a **$578** under-report.

**Arabic:** بطاقة «Lifetime Spend» تجمع إنفاق ٩٠ يوماً فقط وليس إجمالي عمر الحساب من Meta؛ الفجوة في الإنتاج ~٥٧٨ دولار.

#### 🗺️ [Data Path Trace]

```
Meta getLifetimeTotals → syncAccount.ts:333-353 → ad_accounts.lifetime_spend_minor  (NOT USED BY UI)
Meta daily insights   → insightMapper → daily_stats → GET /insights?days=90 → dashboardPage.ts:1118-1119
                                                                                → renderHero():567-578 → #hero-life-val
getDashboard.ts — no lifetime KPI field
```

#### 💊 [The Fix Recipe]

```diff
--- a/src/services/getDashboard.ts
+++ b/src/services/getDashboard.ts
@@ workspace block
+  lifetimeSpend?: { minor: number; display: string; syncedAt: string | null };
@@ after account fetch
+  const lifetimeMinor = Number(account.lifetimeSpendMinor ?? 0);
+  const lifetimeSpend = {
+    minor: lifetimeMinor,
+    display: money(lifetimeMinor),
+    syncedAt: account.lifetimeSyncedAt?.toISOString() ?? null,
+  };

--- a/src/web/pages/dashboardPage.ts
+++ b/src/web/pages/dashboardPage.ts
@@ renderHero
-    document.getElementById('hero-life-val').textContent = fmtCurrencyMinor(spend90);
+    var lifeMinor = (dashData.lifetimeSpend && dashData.lifetimeSpend.minor != null)
+      ? dashData.lifetimeSpend.minor
+      : spend90; // fallback if lifetime sync pending
+    document.getElementById('hero-life-val').textContent = fmtCurrencyMinor(lifeMinor);
@@ hero-life-sub
-      'Account history (' + days + '-day window)';
+      dashData.lifetimeSpend ? 'Meta account lifetime total' : ('Account history (' + days + '-day window)');
```

Also call `syncLifetimeTotals()` after IQD heal (`iqdRepair.ts` post-heal hook) and on initial connect (already fire-and-forget in connect flow — verify it runs).

---

### 🚨 [Root Cause]: Reach is daily snapshot, not Meta window reach

**English:** `getDashboard` sets reach to the **last day** in the 30-day window (`daily[daily.length-1].reach`). Meta Ads Manager’s reach for “Last 30 days” deduplicates users across the whole window. Summing or picking one day both diverge; picking latest day is honest in the label but still mismatches the manager UI users compare against.

**Arabic:** الوصول المعروض = آخر يوم فقط، بينما Meta يعرض وصولاً فريداً على نافذة ٣٠ يوماً.

#### 🗺️ [Data Path Trace]

```
Meta insights.reach (daily) → insightMapper.ts:64 → daily_stats.reach
→ getDashboard.ts:281,328-329 (last row in ASC 30d window)
→ dashboardPage.ts:733-754 / beginnerDashboardPage.ts:308-318
```

#### 💊 [The Fix Recipe]

Short term (label — partially done):

```diff
# Already: label "Reach (latest day)" at getDashboard.ts:328
```

Long term — add Meta aggregate call or document limitation:

```typescript
// Option A: periodic sync of window reach into daily_stats metadata JSON
// Option B: new endpoint GET /insights/aggregate?preset=last_30d with reach from Meta breakdown
// insightMapper unchanged; store window reach on ad_accounts.reach30d BigInt (new column)
```

---

### 🚨 [Root Cause]: Dual spend paths + mismatched trend delta math

**English:** Pro dashboard hero 30d spend is computed **client-side** from `/insights?days=90`, while KPI cards use **`/api/dashboard`** (server 30d with UTC date floor). Spend trend arrows use `metric_trends.spend_trend` from AnalyticsEngine (7d vs prior 7d, 2d lag, weighted rate math for CTR/CPM). Additionally `getDashboard` marks spend `goodWhenUp: true` while hero deltas treat spend-up as bad — inconsistent coloring.

**Arabic:** مساران للإنفاق (عميل/خادم) + deltas من نافذة ٧ أيام مختلفة عن KPI ٣٠ يوماً.

#### 🗺️ [Data Path Trace]

```
Path A (hero): server.ts:1776-1781 → dashboardPage.ts:1118-1158 → renderHero:565-566
Path B (KPI):  getDashboard.ts:246-316 → dashboardPage.ts:1180-1182
Trend deltas:  AnalyticsEngine.ts:72-107 → metric_trends → getDashboard.ts:268-271,316-327
goodWhenUp:    getDashboard.ts:316 (true) vs dashboardPage.ts:585-590 (false for hero)
```

#### 💊 [The Fix Recipe]

```diff
--- a/src/web/pages/dashboardPage.ts
+++ b/src/web/pages/dashboardPage.ts
@@ renderHero — prefer authoritative KPI when present
+  function renderHeroFromKpis(dashData, insights90) {
+    var spendKpi = (dashData.kpis || []).find(function(k){ return k.key === 'spend'; });
+    if (spendKpi) {
+      document.getElementById('hero-30-val').textContent = spendKpi.display;
+      return;
+    }
+    /* existing insight sum fallback */
+  }

--- a/src/services/getDashboard.ts
+++ b/src/services/getDashboard.ts
-      goodWhenUp: true },
+      goodWhenUp: false },

--- a/src/engines/analytics/calculateCtrTrend.ts (and siblings)
+# Replace avgRate comparison with window-total:
+# ctrTrend = (windowCtr(current) - windowCtr(prior)) / windowCtr(prior)
+# Align windowDays with dashboard (30) or document 7d badge as "7d trend"
```

---

### 🚨 [Root Cause]: IQD historical ×100 storage (mitigated, not impossible)

**English:** Schema defaults `currency_minor_factor=100`. Pre-fix IQD syncs stored spend/CPM/CPC at 100× Meta major values. Heal path (`healAccountCurrencyAndSpend`) fixes factor + rescales from `raw_insights` (account) and heuristics (campaign). Demo IQD account now `factor=1`, 30d sum 497,900 IQD — consistent. Residual risk: accounts without `raw_insights` or never loaded after heal.

**Arabic:** حسابات IQD القديمة almacenat ×100؛ الإصلاح التلقائي يعمل عند القراءة لكن ليس مضموناً 100%.

#### 🗺️ [Data Path Trace]

```
schema.prisma:81 default 100
→ insightMapper.ts:60-61 × factor
→ daily_stats (overscaled if IQD factor was 100)
→ heal: getDashboard.ts:237-244, server.ts:384-387, syncAccount.ts:224-229
→ iqdRepair.ts:240-256, rescaleMonetaryFields, healLifetimeSpendMinor
```

#### 💊 [The Fix Recipe]

```diff
--- a/scripts/repair-iqd-factors.ts (ops)
+# Run POST /api/workspaces/:id/repair-iqd then syncChunked 90d

--- a/src/lib/iqdRepair.ts
+++ b/src/lib/iqdRepair.ts
@@ healAccountCurrencyAndSpend end
+    await syncLifetimeTotals(prisma, account.id); // inject worker call
```

---

### 🚨 [Root Cause]: Auto-sync 3-day window leaves 30d dashboard stale

**English:** Scheduled sync (`syncAccount.sync`) defaults to `backfillDays=3`. Dashboard KPIs aggregate 30 days from DB. Days 4–30 update only after manual sync, connect backfill (180d), or `repair-iqd` (90d). Accounts with `lastSyncedAt` recent can still have incomplete 30d history.

**Arabic:** المزامنة التلقائية ٣ أيام فقط — لوحة ٣٠ يوماً قد تكون ناقصة.

#### 🗺️ [Data Path Trace]

```
serve.ts auto-sync → syncAccount.ts:215-217 (backfillDays=3)
vs getDashboard.ts:223 (windowDays=30)
vs INITIAL_BACKFILL_DAYS=180 on connect (server.ts:86, kickoffInitialSync)
```

#### 💊 [The Fix Recipe]

```diff
--- a/src/workers/serve.ts (or cron config)
+# Weekly: syncChunked(windowDays: 30) per account

--- a/src/workers/syncAccount.ts
-    const backfillDays = Math.max(1, opts.backfillDays ?? 3);
+    const backfillDays = Math.max(1, opts.backfillDays ?? 7); // optional bump
```

---

## Verification SQL / Queries (Ops)

Replace `:account_id` with internal `ad_accounts.id` (cuid), not `act_*`.

### 30-day spend (minor + major)

```sql
SELECT
  a.currency,
  a.currency_minor_factor,
  SUM(ds.spend) AS spend_minor_30d,
  CASE WHEN a.currency = 'IQD' OR a.currency_minor_factor = 1
       THEN SUM(ds.spend)::float
       ELSE SUM(ds.spend)::float / a.currency_minor_factor
  END AS spend_major_30d
FROM daily_stats ds
JOIN ad_accounts a ON a.id = ds.entity_id
WHERE ds.entity_type = 'ACCOUNT'
  AND ds.entity_id = :account_id
  AND ds.date >= NOW() - INTERVAL '30 days'
GROUP BY a.currency, a.currency_minor_factor;
```

### Lifetime vs 90-day hero comparison

```sql
SELECT
  a.lifetime_spend_minor,
  a.lifetime_synced_at,
  (SELECT SUM(spend) FROM daily_stats
   WHERE entity_type = 'ACCOUNT' AND entity_id = a.id
     AND date >= NOW() - INTERVAL '90 days') AS sum_90d_minor
FROM ad_accounts a
WHERE a.id = :account_id;
```

### Raw vs stored spend (IQD / factor audit)

```sql
SELECT
  ds.date::date,
  (ri.raw_json->>'spend') AS meta_spend_major,
  ds.spend AS stored_minor,
  a.currency_minor_factor,
  ROUND((ri.raw_json->>'spend')::numeric * a.currency_minor_factor) AS expected_minor
FROM daily_stats ds
JOIN raw_insights ri
  ON ri.entity_type = ds.entity_type
 AND ri.entity_id = ds.entity_id
 AND ri.date = ds.date
JOIN ad_accounts a ON a.id = ds.entity_id
WHERE ds.entity_type = 'ACCOUNT'
  AND ds.entity_id = :account_id
ORDER BY ds.date DESC
LIMIT 14;
```

### Window CTR vs stored daily CTR

```sql
SELECT
  SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100 AS window_ctr_pct,
  AVG(ctr) AS unweighted_daily_ctr_avg  -- wrong for comparison
FROM daily_stats
WHERE entity_type = 'ACCOUNT'
  AND entity_id = :account_id
  AND date >= NOW() - INTERVAL '30 days';
```

### Intra-day spend % (Live Pulse)

```sql
WITH active AS (
  SELECT id, daily_budget FROM campaigns
  WHERE ad_account_id = :account_id AND status = 'ACTIVE'
),
budget AS (SELECT COALESCE(SUM(daily_budget), 0) AS total FROM active),
spend AS (
  SELECT COALESCE(SUM(ds.spend), 0) AS total
  FROM daily_stats ds
  JOIN active c ON c.id = ds.entity_id
  WHERE ds.entity_type = 'CAMPAIGN'
    AND ds.date = DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
)
SELECT spend.total AS spend_today_minor,
       budget.total AS budget_minor,
       CASE WHEN budget.total > 0
            THEN ROUND(100.0 * spend.total / budget.total, 1)
       END AS intra_day_pct
FROM spend, budget;
```

### CLI scripts

```bash
# From repo root with .env DATABASE_URL
npx tsx scripts/diagnose-iqd-full.ts
npx tsx scripts/compare-raw-vs-stats.ts act_XXXXXXXX
# POST repair (IQD workspace, owner token)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/workspaces/$WS_ID/repair-iqd"
```

**Note:** `compare-raw-vs-stats.ts:53` compares Meta major string to stored minor without applying `currencyMinorFactor` — “MISMATCH” on spend is **expected for USD** (e.g. meta=3.11, stored=311). Use the SQL above for real validation.

---

## Comparison with METRICS_AUDIT.md

| METRICS_AUDIT finding | This report | Status |
|----------------------|-------------|--------|
| IQD ×100 P0 | Confirmed; heal path verified on demo IQD (`factor=1`, sane magnitudes) | **Mitigated** — residual for never-healed accounts |
| Reach sum bug in dashboard fallback | Fixed (`dashboardPage.ts:1066-1076` latest day) | **Closed** |
| Reach ≠ Meta 30d window | Confirmed with prod `latestReach=737` vs window metric | **Open P1** |
| CTR/CPM trend ≠ KPI math | Confirmed — AnalyticsEngine weighted daily rates | **Open P1** |
| Frequency mean daily | Confirmed | **Open P1** |
| Messages pickMessages fix | Prod raw-vs-stat messages **OK** | **Closed** |
| lifetimeSpendMinor stale | Prod USD lifetime populated; **UI ignores it** | **Open P1** — new finding: hero mislabel |
| Auto 3-day sync | Confirmed | **Open P2** |
| Campaign cards latest-day | Confirmed | **Open P1** |
| Chart “Impressions” uses messages | Confirmed `dashboardPage.ts:1198` | **Open P2** |
| goodWhenUp spend inconsistency | **New** — server `true`, hero `false` | **Open P2** |

METRICS_AUDIT severity **HIGH** for IQD remains directionally correct; this report adds **HIGH** severity for **Lifetime Spend mislabel** with measured prod gap.

---

## Top 3 Root Causes (Summary)

1. **Lifetime Spend hero is not lifetime** — UI sums ≤90 days of `daily_stats` via insights API; ignores `lifetime_spend_minor` ($578 under-report on prod USD account).

2. **Reach / frequency semantics ≠ Meta Ads Manager** — reach uses last daily value; frequency uses mean of daily rates; users comparing to Meta 30d columns will always see divergence.

3. **Split brain: client hero vs server KPI vs analytics trends** — three window/math paths (30d insights sum, 30d getDashboard with UTC floor, 7d lagged trend engine with weighted daily rates) produce inconsistent spend display, delta badges, and “good direction” coloring.

---

*Report generated from static code trace + live DB reads on 2026-06-26. No code changes applied.*
