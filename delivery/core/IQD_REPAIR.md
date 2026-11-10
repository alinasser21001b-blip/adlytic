# IQD scale: reads no longer write; the repair is evidence-based, atomic and scoped

Status: **implemented and tested locally; not deployed; not run against any production data.**
Branch `local/iqd-repair` (base `858339d`): `afd70df` code · `366bcb0` tests · `2523012` static-test hardening · `2a9f17c` evidence query.
Supersedes the options table in `HEAL_ON_GET.md` (owner chose A for reads, B's safeguards for repair).

## 1. What changed

**Reads (A).** `getAccount()` (shared by 20 GET routes), `GET /api/workspaces/:id` and `getDashboard()` no longer touch the database.
They report the canonical factor *for that response, in memory* — exactly what the old heal returned — so response contracts are unchanged.
Two readers that were silently relying on the old write now resolve the factor themselves: `weeklyReport` (inside the dashboard DTO) and `runBrainOrchestrator`.
Without that, the weekly report printed **900 000 IQD instead of 9 000 IQD** for a stale account (found by mutation M6).

**Signal.** Spend whose scale cannot be verified is reported through the existing data-integrity check (`GET …/data-health`, and the scheduler's integrity observer):
`SPEND_SCALE_UNVERIFIED` (WARN) — an IQD account stores a non-canonical factor and its window rows are not proven;
`SPEND_SCALE_OVERSCALED` (CRITICAL) — raw Meta spend proves rows are exactly 100×. Both are read-only; neither changes a number.

**Repair (B's safeguards), only in sync and `POST /api/workspaces/:id/repair-iqd`** (`src/lib/iqdRepair.ts`):
* **Row-level evidence.** A row is rewritten only if `raw_insights` for that entity and date proves `stored ≈ 100 × raw` (±2 %). No magnitude/CPM heuristic. No evidence, two raw fetches that disagree, or a ratio matching neither scale → **left intact** and counted.
* **One transaction** per account; the factor flag is set **last**, in the same commit.
* **Concurrency:** per-account advisory lock + every row update conditional on the spend it was judged on (a concurrent sync wins; the repair skips the row).
* **Stranded rows** (factor already 1, rows still ×100) are repaired from evidence — the decision rests on the rows, not the flag.
* **Scope: one account.** `POST repair-iqd` used to `UPDATE` the factor and rescale rows of **every IQD account in the database** — any workspace member could rewrite other tenants' money. Fixed and tested.
* `lifetimeSpendMinor` is no longer rewritten by the repair (sync writes it every run). `scripts/repair-iqd-factors.ts` is now report-only unless `--apply`.

## 2. Before / after (same synthetic scenarios, real Postgres 16, real app; `scripts/repro/heal_on_get.ts`)

| | Before | After |
|---|---|---|
| A. correct rows, stale factor, no raw | spend 150 000 → **1 500** | **unchanged** |
| C. repair fails mid-way | HTTP 500, factor flipped, rows stay ×100 forever | HTTP 200, nothing changed; a retry repairs |
| D. 4 concurrent GETs | **1 500 in 10 of 12 trials** (double division) | unchanged in 12 of 12 |
| F. dashboard | factor 100→1, rows rewritten | nothing written |
| B. rows truly ×100 **with** raw proof | repaired *by the GET* | **stay inflated until sync / repair-iqd** — flagged `SPEND_SCALE_OVERSCALED` |

Row B is the price of choosing A: a viewer no longer fixes data by looking at it.

## 3. Evidence

* `npm run typecheck` ✓ · `npm run test:all` ✓ (exit 0, 86 s, clean CI-like environment, includes `test_iqd_no_get_writes.ts`, 31 assertions).
* `npm run test:iqd-repair-pg` — **48 assertions on a synthetic local Postgres** (loopback, database `adlytic_repro*` only; exits 2 rather than pass if it cannot run): correct rows never rewritten; 22 read routes write nothing (xmin of every tenant row unchanged) and answer identically for a stale and a canonical account; replay is a no-op; 6 simultaneous repairs rescale exactly once; a concurrent writer wins; an injected failure rolls back rows **and** flag; stranded rows repaired; ambiguous rows intact; another tenant untouched; VIEWER still 403; sync-side behaviour; integrity signal.
* **Mutation checks** (each makes the suite red, then reverted): no CAS/lock (2) · flag outside the transaction (5) · cross-tenant scope (12) · heuristic back (3) · `getAccount()` repairs again (7) · `weeklyReport` trusts the column (3).
* The static test fails 11 assertions against the previous GET/sync code.

## 4. Limits the owner should know

1. Repair covers **account and campaign** rows (as before). **Ad-set and ad rows are not repaired** (they never were).
2. Rows older than `RAW_INSIGHTS_RETAIN_DAYS` (90) have no evidence and are **left as stored**. After the factor flips to 1 the UNVERIFIED warning clears — there is no persisted "unverified" marker (that needs a schema change, which is gated).
3. A row is only rewritten if its *spend* is proven ×100; cpc/cpm/cost-per-message/revenue of that row are divided with it (same mapper scaling).
4. **Another mutating GET, untouched:** `GET /api/workspaces/:id/data-health?cleanup=true` deletes orphaned campaign stats (`cleanupOrphanedCampaignStats`). Keep it out of live probes.
5. Not verified live: production's stale-factor population, `raw_insights` coverage, Railway behaviour.

## 5. Operator procedure (NOT executed here; production repair is outside this execution)

1. Read-only sizing: `select count(*) from ad_accounts where currency='IQD' and currency_minor_factor <> 1;`
2. `DATABASE_URL=… npx tsx scripts/repair-iqd-factors.ts` — **report only**: per account `proven-x100`, `verified`, `left-intact`.
3. Back up the rows that would change (`COPY (SELECT … FROM daily_stats WHERE entity_id IN (…)) TO …`) — the repair rewrites in place and has no undo besides re-deriving from `raw_insights`.
4. Owner reviews the report, then `--apply` (or `POST …/repair-iqd` per workspace). Re-run: second run must report `rescaled=0`.
5. Rollback of the *code* is a revert + redeploy (no schema change). Rows already rewritten are not reverted by it.
