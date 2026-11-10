# data-health: read-only GET, tenant-scoped orphans, platform-only global cleanup — and factor = 1 certifies nothing

Status: **implemented and tested locally; not deployed; no production data touched.**
Branch `local/data-health` (base `12d7ac5`): `23fc723` code · tests commit (see `git log`).
Reproduction: `scripts/repro/data_health_orphans.ts` (two synthetic tenants, loopback Postgres only).

## 1. What was wrong (reproduced on 12d7ac5)

`GET /api/workspaces/:id/data-health` — a route any workspace member may call:

| Observation, tenant A = a VIEWER | on 12d7ac5 | now |
|---|---|---|
| orphan ids A could see | `a1 b1 b2 c1 u1` — B's, an ambiguous one and an unattributed one included | `a1` (its own) |
| `orphanedCount` for A | 5 (global) | 1 |
| `GET …?cleanup=true` as A | **200, 15 rows deleted** — every tenant's orphans | **200, 0 deleted**, `cleanup.performed:false` |
| rows left after that GET | all orphan rows gone (a1, b1, b2, c1, u1) | all still there |
| the page's "clean" button | did exactly that GET | POSTs a scoped cleanup |

(`delivery/core/IQD_REPAIR.md` §4 had flagged this GET as "another mutating GET, untouched".)

## 2. Design

An orphan = a campaign `daily_stats` row whose campaign row no longer exists. The row names no owner, so ownership can only come from a record that **outlives** the campaign and names it: `campaign_brain_snapshots(workspace_id, campaign_id)` and `recommendation_logs(workspace_id, campaign_id)` (`campaign_history_snapshots` cascade-delete with the campaign and prove nothing).

**Verified ownership** = named by this workspace **and by no other**. An orphan nobody names, or two workspaces name, belongs to nobody: no tenant sees it, counts it, or can delete it.

| Route | Who | Does |
|---|---|---|
| `GET /api/workspaces/:id/data-health` | any member | read-only. `orphanedCampaignIds`/`orphanedCount` = verified-owned only. `?cleanup=true` is acknowledged as **not performed**. Adds `spendScale` (§4) |
| `POST /api/workspaces/:id/data-health/cleanup` | Owner/Manager (VIEWER → 403, non-member → 403, no token → 401) | one SQL statement deleting this workspace's verified-owned orphan stats; spares any campaign that exists again |
| `GET /api/admin/data-health/orphans` | platform admin | **aggregate counts only**, across tenants (`orphanRows`, `orphanCampaignIds`, `campaignStatRows`) — never ids |
| `POST /api/admin/data-health/orphans/cleanup?expectedRows=N` | platform admin | deletes every orphan, whoever's; **N must equal the `orphanRows` just read**, else 409 and nothing is deleted |
| scheduler sweep | system | still sweeps globally, as an explicit system principal, and **refuses** when orphans exceed 20 % of all campaign stats (a restored database whose `campaigns` table is missing or behind) and logs why |

`src/lib/platformOrphanCleanup.ts` is importable only by the admin routes and the scheduler; the integrity monitor additionally checks that the account belongs to the workspace it was asked about. Both are enforced by `test_data_health_isolation.ts` (in `test:all`).

Response contract: all previous keys are kept. `?cleanup=true` still returns `orphanedRowsDeleted` (now `0`) plus `cleanup:{performed:false,…}`; new keys are additive.

## 3. Evidence

* `npm run typecheck` ✓ · `npm run test:all` ✓ (exit 0, 82 s) — includes `test_data_health_isolation.ts` **29/29** (no database) and the IQD static test 31/31.
* `npm run test:data-health-isolation-pg` — **25/25** on a synthetic Postgres; **19 of the 22 assertions that can run on 12d7ac5 fail there**. It proves: A sees only `a1,a3`, B only `b1,b2`; the ambiguous `c1` and unattributed `u1` are visible to nobody; GET `?cleanup=true` leaves the `xmin` of every row unchanged; VIEWER / another tenant's owner / no token cannot POST; A's owner deletes exactly A's 6 rows; ownership follows the records live (drop A's claim on `c1` and it becomes B's, never A's); tenants get 401/403 on the platform routes; the admin must quote the count (400 missing, 409 wrong); the scheduler refuses an implausible share.
* `npm run test:iqd-repair-pg` — **60/60** (was 48): see §4.
* **Mutation checks** (each turns the suite red, then reverted): foreign claim ignored (8 fail) · unattributed counted as owned (10) · GET deletes again (3 static + 7) · VIEWER check dropped (1 + 3) · admin gate dropped (1 + 1) · scheduler guard off (1 + 2) · `expectedRows` ignored (3 + 2) · scale warning gated on the factor (3) · "matches any raw" rule removed (1) · unproven rows counted only inside the raw range (2).

## 4. Factor = 1 does not certify historical spend

Before: `SPEND_SCALE_UNVERIFIED` fired only while the stored factor was not 1, so the repair's flip to 1 made the warning disappear although the rows it left intact were exactly as unproven as before.

Now the signal is driven by the **rows**:

* `SPEND_SCALE_UNVERIFIED` (WARN): account-level rows in the 30-day window with no raw Meta counterpart — at **any** factor. `SPEND_SCALE_OVERSCALED` (CRITICAL): proven ×100 — at any factor.
* `data-health` gains `spendScale` (IQD accounts): `{ storedFactor, factorIsEvidence:false, window:{accountRows,verified,overscaled,unverified}, history:{accountRows,withoutEvidence} }`. `history.withoutEvidence` counts account-level rows of **all time** that have no raw row for their date (everything past `RAW_INSIGHTS_RETAIN_DAYS`, plus days sync never captured). It is **reported, not turned into a warning**, because it would warn on every long-lived account.
* Evidence rule refined (found while verifying): sync **appends** a raw row on every run, so a day can carry an earlier, different value next to the final one. A stored value equal to **any** raw spend of that day is verified (no false alarm for restated days); over-scale is still judged only against raws that all agree.
* The repair now counts **every** row it did not prove as left intact (it used to count only rows inside a raw date range, i.e. "0" for an account with no raws at all): `rescale.rowsLeftIntact` on `POST repair-iqd`.

## 5. Limits and owner decisions

1. **Orphans nobody names become platform-only.** A tenant's banner now counts only verified-owned orphans. The rest wait for a platform admin or for the scheduler's sweep.
2. **Decision — the scheduler still deletes unattributed orphans automatically** (below the 20 % guard). Keep, or require an admin to run the POST?
3. Only `daily_stats` are cleaned (as before); orphaned `raw_insights`, period insights etc. are untouched.
4. Expect **new WARNs** on IQD accounts whose window rows have no raw counterpart (synced before raw capture, or `RAW_INSIGHTS_RETAIN_DAYS` < 30). That is the intended truthfulness, not a regression — but it is visible.
5. `recommendation_logs.campaign_id` has no index (a schema change; gated). The ownership query scans that table filtered by candidates: fine at today's size, an index is the follow-up.
6. Platform routes fail closed (503) when `PLATFORM_ADMIN_EMAILS` is unset.
7. Not verified live: production orphan population, `brain/recommendation` coverage, scheduler behaviour on a real restore.
