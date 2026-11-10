# data-health: read-only GET, tenant-scoped orphans, platform-only global cleanup — and factor = 1 certifies nothing

Status: **implemented and tested locally; not deployed; no production data touched.**
Branch `local/data-health` (base `12d7ac5`): `23fc723` code · `d4b5478` tests · `511b9d5` doc · review fixes after it (§6, see `git log`).
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

An orphan = a campaign `daily_stats` row whose campaign row no longer exists. The row names no owner, so ownership can only come from a record that **outlives** the campaign, names it, **and that a tenant cannot write**: `campaign_brain_snapshots(workspace_id, campaign_id)` (written by the Brain worker from the workspace's own campaigns). `recommendation_logs(workspace_id, campaign_id)` is **not** evidence — its `campaign_id` is whatever a member put in the body of `POST …/recommendations/action` (§6). `campaign_history_snapshots` cascade-delete with the campaign and prove nothing.

**Verified ownership** = named by this workspace's brain snapshots **and by no other workspace's**. An orphan nobody names, or two workspaces name, belongs to nobody: no tenant sees it, counts it, or can delete it.

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

Figures after the independent review (§6); the first version had 29 / 25 / 60.

* `npm run typecheck` ✓ · `npm run test:all` ✓ (exit 0, 80 s, CI-equivalent `env -i`, no database) — includes `test_data_health_isolation.ts` **30/30** (no database) and the IQD static test **31/31**.
* `npm run test:data-health-isolation-pg` — **35/35** on a synthetic Postgres. It proves: A sees only `a1,f1` (brain-named), B only `b1`; the ambiguous `c1`, the unattributed `u1` and the log-only `a3,b2` are visible to nobody; a VIEWER of B writing recommendation logs that name A's orphans neither vetoes A's nor claims anything (§6); GET `?cleanup=true` leaves the `xmin` of every row unchanged; VIEWER / another tenant's owner / no token cannot POST, a MANAGER can; only `CAMPAIGN` rows go; a workspace without an ad account gets 404; tenants get 401/403 on the platform routes; the admin must quote a plain integer count (400 missing/malformed, 409 wrong); the scheduler refuses an implausible share.
* `npm run test:iqd-repair-pg` — **64/64** (was 48 before this work): see §4 and §6.
* **Mutation checks.** The author's ten (each turned the suite red, then reverted): foreign claim ignored · unattributed counted as owned · GET deletes again · VIEWER check dropped · admin gate dropped · scheduler guard off · `expectedRows` ignored · scale warning gated on the factor · "matches any raw" removed · unproven rows counted only inside the raw range. The review added sixteen more (MANAGER refused, no-ad-account guard dropped, delete not restricted to CAMPAIGN rows, window ignored, platform report returning ids, monitor ownership check removed, `factorIsEvidence` true, optimistic check dropped, `expectedRows` accepting text, `unverified` forgetting over-scaled rows, the §6 contradiction rule removed, LIMIT clamp, page button back to GET, report route without the gate, ownership inverted, scheduler guard inverted): twelve were red at once, **four survived and got a test** (entity type, monitor ownership, `expectedRows` format, window arithmetic) — all sixteen are now red.

## 4. Factor = 1 does not certify historical spend

Before: `SPEND_SCALE_UNVERIFIED` fired only while the stored factor was not 1, so the repair's flip to 1 made the warning disappear although the rows it left intact were exactly as unproven as before.

Now the signal is driven by the **rows**:

* `SPEND_SCALE_UNVERIFIED` (WARN): account-level rows in the 30-day window with no raw Meta counterpart — at **any** factor. `SPEND_SCALE_OVERSCALED` (CRITICAL): proven ×100 — at any factor.
* `data-health` gains `spendScale` (IQD accounts): `{ storedFactor, factorIsEvidence:false, window:{accountRows,verified,overscaled,unverified}, history:{accountRows,withoutEvidence} }`. `history.withoutEvidence` counts account-level rows of **all time** that have no raw row for their date (everything past `RAW_INSIGHTS_RETAIN_DAYS`, plus days sync never captured). It is **reported, not turned into a warning**, because it would warn on every long-lived account.
* Evidence rule refined (found while verifying): sync **appends** a raw row on every run, so a day can carry an earlier, different value next to the final one. A stored value equal to **any** raw spend of that day is verified (no false alarm for restated days); over-scale is still judged only against raws that all agree.
* The repair now counts **every** row it did not prove as left intact (it used to count only rows inside a raw date range, i.e. "0" for an account with no raws at all): `rescale.rowsLeftIntact` on `POST repair-iqd`.

## 5. Limits and owner decisions

1. **Orphans nobody names — or that only a recommendation log names — become platform-only.** A tenant's banner now counts only verified-owned orphans. The rest wait for a platform admin or for the scheduler's sweep.
2. **Decision — the scheduler still deletes unattributed orphans automatically** (below the 20 % guard). Keep, or require an admin to run the POST?
3. Only `daily_stats` are cleaned (as before); orphaned `raw_insights`, period insights etc. are untouched.
4. Expect **new WARNs** on IQD accounts whose window rows have no raw counterpart (synced before raw capture, or `RAW_INSIGHTS_RETAIN_DAYS` < 30). That is the intended truthfulness, not a regression — but it is visible.
5. `recommendation_logs.campaign_id` has no index, but the ownership query no longer reads that table (§6), so the missing index no longer costs a full scan per data-health call (it was 347 ms at 1 M rows). `campaign_brain_snapshots` is read through its existing `(campaign_id, tick_date)` unique index.
6. Platform routes fail closed (503) when `PLATFORM_ADMIN_EMAILS` is unset.
7. Not verified live: production orphan population, `brain/recommendation` coverage, scheduler behaviour on a real restore.

## 6. Independent review (adversarial) — what it found and what changed

Reproduced on synthetic Postgres 16 databases (`adlytic_repro_rev_*`), through the real Hono app. Every fix below has a test that was red before it.

**Fixed**

1. **Forged ownership claims (tenant integrity).** `POST /api/workspaces/:id/recommendations/action` stores `campaignId` from the request body unchecked in `recommendation_logs`. Under the first version of the ownership rule a plain VIEWER of tenant B could (a) **veto** A's orphans — A's data-health stopped listing them and A's cleanup deleted 0 rows — and (b) **claim** an orphan nobody else names and have B's Manager/Owner cleanup delete A's rows (B's cleanup deleted 9 rows, including A's ownerless one). The attacker must know the foreign internal campaign id (a cuid; no tenant-facing read in this repository returns another tenant's campaign ids — checked), but ids are not secrets (URLs, CSV, screenshots, a user who sits in both workspaces). Ownership evidence is now brain snapshots only.
2. **False all-clear in the scale signal.** "Stored equals ANY raw of the day" certified a row when another raw of that day proved it exactly ×100 (raws `[100000, 1000]`, stored `100000`): data-health said ALL_CLEAR and the dry run reported every row verified. A raw that proves ×100 now withdraws the certificate (unproven, counted, never rewritten).
3. **Performance.** The platform/scheduler global orphan count did two index probes per row (8.9 s at 2.2 M `daily_stats` rows) → one `LEFT JOIN` (0.6 s, identical counts). The evidence read pulled every appended raw row (80,640 for one account; 200–350 ms of the main thread per data-health call, 1.9 s for ten parallel) → `GROUP BY` the distinct values (70–105 ms; 26 scenarios give byte-identical verdicts).

**Residual risks — documented, not fixed (out of scope for this change)**

* `POST …/recommendations/action` still stores an unvalidated `campaignId`. It no longer carries authority here, but the field is client-controlled for every other reader. Validating it against the workspace's campaigns is a code change at that one write site (no migration); existing rows can be audited read-only: `SELECT l.workspace_id, b.workspace_id, count(DISTINCT l.id) FROM recommendation_logs l JOIN campaign_brain_snapshots b ON b.campaign_id = l.campaign_id WHERE b.workspace_id <> l.workspace_id GROUP BY 1,2`.
* The platform allowlist (`PLATFORM_ADMIN_EMAILS`) is the only authority for the admin routes. By design (`server.ts`, `INACTIVE_ALLOWED_API`) a **deactivated** admin row (`isActive=false`) keeps access — revoking an admin means removing the address from the variable (read once per process: redeploy) or bumping `tokenVersion`. Also, whoever registers an allowlisted address first becomes a platform admin (registration does not verify the address): the admin accounts must exist before the variable is set.
* The scheduler's 20 % guard still lets a restore that lost up to 20 % of `campaigns` delete that share of campaign history. Lower it, or make the sweep report-only, before relying on it after a restore.
* `?cleanup=TRUE`, `=1` etc. are ignored silently (no `cleanup` block in the answer); only the exact `true` returns the "not performed" note. Both are read-only.
* A VIEWER still sees the page's "clean" button when verified orphans exist; the click gets 403 and a generic error toast.
* Tenant cleanup writes no log line (who deleted how many rows); the platform route does.
* `judgeSpendScale` accepts ±2 % around ×100, so a 99× or 101× row is judged over-scaled and repaired to 990 / 1010 against a raw of 1000: the repaired row then matches no raw and stays UNVERIFIED. (Pre-existing; the tolerance is asserted by `test_iqd_no_get_writes.ts`.)
* Sync writes raws for ACCOUNT rows only: campaign-level rows can never be verified or proven ×100 in production (`rowsLeftIntact` counts them; the account/campaign divergence check is what catches a split).
* The repair's optimistic check compares `spend` only; a writer that re-stores the same over-scaled spend with fresh ratios would be overwritten with ratios derived from the older read (IQD sync cannot produce that today).
