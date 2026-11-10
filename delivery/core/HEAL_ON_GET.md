# Heal-on-GET — read routes that write to the database

> **Update:** the owner chose option A for reads and option B safeguards for the repair; implemented on `local/iqd-repair`, see `IQD_REPAIR.md`. This file records the original investigation and the reproduction *before* the change.

Status: **reproduced locally (LOCAL_PASS of the reproduction); not observed live.**
Line numbers are for `main @ 3f61e40` (`/home/user/wt/core`). Reproduction:
`scripts/repro/heal_on_get.ts` on branch `local/railway-recovery` (commit `51e6631`).

> **Keep every route in section 1 out of live probes** — including the parity
> runner and any "validation" instance pointed at a restored database — until
> the owner decides section 6. `GET /api/health` is *not* one of them (read-only).

## 1. Routes, file and line

| Route | Handler | Reaches the writer at |
|---|---|---|
| `GET /api/workspaces/:workspaceId` | `src/api/server.ts:3126` | loop `3129-3133`, call `3131` |
| `GET /api/dashboard/:workspaceId` | `src/api/server.ts:1530` → `getDashboard()` | `src/services/getDashboard.ts:874-881`, call `877` |
| 20 GET routes through `getAccount()` | helper `src/api/server.ts:917-927`, call `924` | see list below |

`getAccount()` GET callers (call-site line in `server.ts`): `data-health` 1494 ·
`campaigns` 3319 · `export/campaigns.csv` 3590 · `export/insights.csv` 3614 ·
`campaigns/:id` 3636 · `…/why` 3673 · `…/inspector` 3725 · `campaigns/:id/adsets` 4411 ·
`adsets/:id` 4431 · `adsets/:id/ads` 4452 · `ads/:id` 4473 · `insights` 4494 ·
`issue-dates` 4518 · `attribution` 4553 · `insights/trends` 4643 · `recommendations` 4665 ·
`refresh-log` 4848 · `issues` 4892 · `ad-assessor/campaigns` 4946 · `ad-assessor/context` 4963
(all under `/api/workspaces/:workspaceId/…`).
Also reached from POST handlers that are *not* read-only by name anyway:
`…/ai/chat` 5028 and `…/ai/chat/v2` 5174 (via `getDashboard`), `discover-creatives`, `recommendations/action`,
`ad-assessor/assess`, `investigate`, `sync`, and the intentional `repair-iqd` (6205).
The same writer also runs in the sync worker (`src/workers/syncAccount.ts:293`, `:1623`) — that is its proper home.

## 2. Mutating calls (`src/lib/iqdRepair.ts`)

`healAccountCurrencyAndSpend()` (`:289`), in this order, **with no transaction**:

1. `prisma.adAccount.update({ currencyMinorFactor })` — `:296`
2. if `currency === "IQD"`: `rescaleIqdSpendForAccount()` — `:301`
   * `prisma.dailyStat.update(...)` divides `spend, cpc, cpm, costPerMessage, revenueMinor` by 100:
     * proven path — compares with `raw_insights` — `:118`
     * **heuristic path** (campaign has no `raw_insights`) — `rescaleCampaignRowsHeuristic` `:130`, write `:152`
3. `healLifetimeSpendMinor()` (`:258`) — `prisma.adAccount.update({ lifetimeSpendMinor / 100 })` — `:279`

`raw_insights` are purged after `RAW_INSIGHTS_RETAIN_DAYS` (default 90; `src/config.ts:448`,
`src/workers/backgroundScheduler.ts:339`), so older campaigns fall into the heuristic path.

## 3. Trigger condition

`currencyFactorNeedsHeal(currency, stored)` = `currencyMinorFactorFor(currency) !== stored`
(`src/lib/currency.ts`): canonical factor is **1 for IQD, 100 for everything else**.
`ad_accounts.currency_minor_factor` defaults to **100** in the schema, so **any IQD account still carrying the
default is "stale" and is rewritten by the first read that touches it.** Non-IQD accounts with the default are untouched.
The flag is self-limiting for the *next* reads (after step 1 the predicate is false) — which is exactly what makes failures permanent (4.3).

## 4. What the local reproduction showed (synthetic IQD data, real Postgres 16, real Hono app)

| # | Scenario | Observed |
|---|---|---|
| A | IQD, factor 100, rows **already correct** (spend 150 000, CPM 6 000), no `raw_insights` | one `GET /api/workspaces/:id` → factor 100→1 **and spend 150 000→1 500, CPM 6 000→60 on every row** |
| B | IQD, factor 100, rows ×100 **with** `raw_insights` (via `getAccount()` route `/campaigns`) | rows corrected to 150 000 / 6 000; a replay changes nothing (the intended behaviour) |
| C | same as B but `dailyStat.update` fails once (injected) | first GET → **500**; factor already **1**; a healthy retry leaves rows at **15 000 000** — *the repair never retries* |
| D | same as A-style heuristic data (×100, no raw), **4 concurrent GETs**, 12 trials | final spend/day: **1 500 in 10 of 12 trials**, 150 000 (correct) in only 2 — the writers read the same stale rows, then re-divide already-divided rows |
| E | USD, factor 100 (control) | no writes |
| F | `GET /api/dashboard/:id` on B-type data | factor 100→1 and rows changed — same writer |

Why A and D happen: the heuristic's "CPM ratio" signal (`campaignCpmRatioSignal`, `:59-70`) reduces, for any
self-consistent row, to `rescaledCpm >= 50`, i.e. *true CPM ≥ 5 000 IQD*; with the spend signal (`≥ 10 000`) it
cannot tell a correct row from a ×100 row, and it is not idempotent. Raw evidence: `…/scratchpad/heal_on_get_result.json`.

## 5. Why it matters for the recovery

* A restored database is exactly the situation where `currency_minor_factor` and the rows can disagree.
  A "read-only" validation service (`SERVICE_ROLE=api`, which `serve.ts` documents as writing nothing) **still performs these writes on GET.**
* Any signed-in member viewing a stale IQD workspace can trigger it; concurrency makes it likelier on a dashboard that fires several routes at once.

## 6. Owner decision required (no behaviour change has been made)

| Option | Effect | Cost |
|---|---|---|
| **A. GETs never write** | `getDashboard()` already resolves its factor with `resolveCurrencyMinorFactor()` (IQD→1 whatever is stored). `getAccount()` and the workspace route would set the *in-memory* factor from the canonical value without persisting it (they already assign `account.currencyMinorFactor = healed`; verified only for those two call sites, not for every consumer of the factor). Rows are fixed by sync (`syncAccount.ts:293`) or the explicit `POST …/repair-iqd`. | Rows that are really ×100 stay inflated until the next sync / manual repair |
| **B. Make the writer safe, keep it on GET** | compare-and-swap on the factor (`updateMany … where currencyMinorFactor ≠ canonical`, only the winner rescales), rescale **before/with** the flag in one transaction, and **drop the heuristic path from GET** (proven path only) | more code; still writes on GET |
| C. Leave as is | — | A, C and D above can corrupt correct data |

Recommendation: **B immediately (it removes the corruption modes), A as the end state.**
Before any restore: run a read-only count `select count(*) from ad_accounts where currency='IQD' and currency_minor_factor <> 1` to size the exposure.
