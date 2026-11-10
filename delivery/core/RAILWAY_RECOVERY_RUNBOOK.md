# Railway recovery runbook (Adlytic core)

Audience: the **owner** decides, an **operator** executes. Written for a production Postgres that Railway reported as REMOVED
(500 MB volume, about 0.497 GB used) while `/api/health` was failing.

> **Nothing in this document was executed against Railway, Cloudflare, GitHub or production data.** Every command in Appendix A
> was run by the author against synthetic Postgres 16 databases on loopback (`adlytic_repro_ops_*`). Every step that touches Railway
> is marked `UNVERIFIED`: the dashboard wording, backup features, volume resizing and the name of the public connection variable
> are not in this repository and were not checked.

Build under test: branch `local/railway-preflight`, base `12d7ac5` (see `git log` for the tip). Tools added by this branch:
`scripts/ops/preflight-schema.ts` (read-only go/no-go), `test_preflight_schema.ts`, `test_preflight_schema_pg.ts`.
Related: `delivery/core/HEALTH_ENDPOINT.md` (the readiness gate), `delivery/core/IQD_REPAIR.md` (IQD money repair),
`delivery/core/HEAL_ON_GET.md` (history of the GET writers).

---

## 0. Scope and authority

Everything not in this table is local and read-only (reading this repository, running the preflight and tests against a database you
restored yourself on your own machine).

| # | Step | Touches | Who must approve | Section |
|---|---|---|---|---|
| 1 | Read Railway state: service status, volume size/usage, backups list, deployment logs, variable **names** | Railway (read) | Operator with Railway access; never copy variable **values** into chat, tickets or files | 2 |
| 2 | Dispatch `verify-live.yml` (read-only: reads `/api/health` and allowlisted deployment log lines) | GitHub Actions + Railway API (read) | **Owner** | 2 |
| 3 | `pg_dump` of the production database over its public connection | Production data leaves Railway for the operator's machine | **Owner** (data handling: encrypted disk, access list, deletion date) | 3 |
| 4 | Create a volume backup / enlarge the volume / create a new Postgres service | Railway (write) | **Owner** (`UNVERIFIED` how) | 3, 5 |
| 5 | Restore the dump into a new production database; run the preflight against it | Production data (write by restore, read by preflight) | **Owner** | 5 |
| 6 | Change the `DATABASE_URL` reference on any service | Railway (write) | **Owner** | 5 |
| 7 | Disable / enable auto-deploy; stop or start `thriving-manifestation` (worker) and `lively-insight` (narration cron) | Railway (write) | **Owner** | 3, 5 |
| 8 | Deploy (dashboard "deploy latest commit", or dispatch `deploy-adlytic.yml`) | Railway / GitHub (write) | **Owner** | 5 |
| 9 | Push or merge to the tracked branch (may auto-deploy, see risk R6) | GitHub, possibly Railway | **Owner** | 5 |
| 10 | Set `SERVICE_ROLE` to anything other than `api` (turns background writers on) | Railway (write) | **Owner** | 5.6 |
| 11 | `POST /api/workspaces/:id/sync` (calls Meta, writes rows) and `scripts/repair-iqd-factors.ts --apply` | Production data (write), Meta API (read) | **Owner** | 5.6 |
| 12 | `prisma migrate resolve …` after a failed migration | Production data (write) | **Owner** | 2 |
| 13 | Cloudflare (DNS / proxy / cache for the public domain) | Cloudflare | **No change is required by this runbook.** Any change is the owner's. Whether the domain is proxied is `UNVERIFIED`. | n/a |

---

## 1. What is known and what is not

Status vocabulary: `CODE_PRESENT` (the code or file says so) · `LOCAL_PASS` (observed by running it on synthetic loopback data) ·
`CI_PASS` (a CI run passed: **none was observed here**; the CI-like local run is `LOCAL_PASS`) · `LIVE_VERIFIED` (observed on Railway
or production: **none**) · `BLOCKED` (cannot be known from this environment) · `NOT_RUN`.

| # | Claim | Status | Evidence |
|---|---|---|---|
| 1 | Production `/api/health` was failing and the Postgres service/volume was reported removed (500 MB, ~0.497 GB used) | `BLOCKED` | Reported earlier in this project; no live access from here. Treat as unconfirmed until section 2 step 1. |
| 2 | The production start command runs `prisma migrate deploy` **before** the server | `CODE_PRESENT` + `LOCAL_PASS` | `railway.json`/`railway.toml` `startCommand`, `.deploy/start.js`; Appendix A, A12 |
| 3 | `railway.validation.json` starts `node dist/src/api/serve.js` (no migrate); `SERVICE_ROLE=api` runs no background work | `CODE_PRESENT` + `LOCAL_PASS` | `railway.validation.json`; `src/api/serve.ts:106,160`; A9 |
| 4 | Database unreachable → `prisma` exits 1 (`P1001`), the server never starts, there is **no HTTP answer** | `LOCAL_PASS` | A11 (re-run here) |
| 5 | Schema present but no `_prisma_migrations` → `P3005`; failed migration row → `P3009`; advisory lock held → `P1002` after ~10 s; `DATABASE_URL` unset → exit 1 | `LOCAL_PASS` | A11 (re-run here) |
| 6 | An applied migration file edited afterwards: `prisma migrate deploy` still exits 0 ("No pending migrations to apply") | `LOCAL_PASS` | `test_preflight_schema_pg.ts`, scenario `fileedit` |
| 7 | `prisma migrate deploy` on a restored database that is behind **is a write**: it applied 2 migrations (39 → 41 history rows, 4 tables created) | `LOCAL_PASS` | A12 |
| 8 | Directly started server (no migrate): unreachable DB → 503 `db:"unavailable"`; reachable but not ready → 503 `db:"ok"` plus one log line naming the state | `LOCAL_PASS` | A10 |
| 9 | `/api/health` cannot see a migration file edited after it was applied (answers 200 for a drifted history) | `LOCAL_PASS` | `test_preflight_schema_pg.ts`, scenario `checksumdb`: `probeReadiness` returned ready for the drifted database |
| 10 | The preflight's state equals `dbHealth.probeReadiness`'s state for 13 databases (healthy, empty, failed, behind, equal-count wrong history, ahead, dropped column/table, rolled-back, checksum, file edit, extra table) | `LOCAL_PASS` | `test_preflight_schema_pg.ts` (every scenario asserts it) |
| 11 | sha256 of the raw `migration.sql` bytes equals the checksum Prisma stores, for all 41 rows. Prisma does **not** normalise line endings or a BOM (a CRLF file is stored with the CRLF hash) | `LOCAL_PASS` | `test_preflight_schema_pg.ts` section 0; scratch probe with LF / CRLF / BOM files |
| 12 | The default role (`SERVICE_ROLE` unset = `combined`) writes within its first 45 s on a restored copy: flips old PENDING/PROCESSING sync jobs to FAILED, deletes `raw_insights` older than 90 days, and deletes orphaned campaign `daily_stats` **globally** (both tenants) | `CODE_PRESENT` + `LOCAL_PASS` | `src/api/serve.ts:106-112`, `src/workers/backgroundScheduler.ts:341,368,383-410,420-437`; A13 |
| 13 | Background sync cannot be limited to one account by configuration: the pass takes every `ACTIVE` account that has a token | `CODE_PRESENT` | `src/workers/backgroundScheduler.ts:73-100` (`syncAllAccounts`) |
| 14 | `GET /api/workspaces/:id/data-health?cleanup=true` deletes orphaned campaign stats globally at `12d7ac5` | `CODE_PRESENT` | `src/api/server.ts:1522-1527`; fixed on the separate core track, **not in this branch** |
| 15 | `scripts/repair-iqd-factors.ts` is report-only without `--apply` and wrote nothing (table digests identical before/after) | `CODE_PRESENT` + `LOCAL_PASS` | A7 |
| 16 | A custom-format `pg_dump` restores with `--exit-on-error --single-transaction` and the preflight then answers GO with the same counts | `LOCAL_PASS` | A3-A6 |
| 17 | `backup_database.command` can report "Backup complete" for an empty backup, prints `DATABASE_URL` (password included), and its fallback runs `prisma db push` | `CODE_PRESENT` + `LOCAL_PASS` (pipeline pattern: exit 0, 20-byte file) | `backup_database.command:39,66-72,82`; A18 |
| 18 | `scripts/count-undecryptable-tokens.ts` cannot run on this base (`new PrismaClient()` without the driver adapter → `PrismaClientInitializationError`) | `LOCAL_PASS` | A14. **Do not rely on it.** |
| 19 | Railway keeps serving the previous deployment when a new one fails its healthcheck | `CODE_PRESENT` as a **comment** only (`.deploy/start.js` header). Documented, **not exercised** | `LIVE_VERIFIED`: none |
| 20 | Auto-deploy on `main` for the `adlytic` service is ENABLED | Claimed by `railway.setup.txt`; `deploy-adlytic.yml` says a push no longer deploys. The Railway-side setting is `UNVERIFIED` | see R6 |
| 21 | The 500 MB volume is at 94.8% (if 500 MiB) to 99.4% (if 500 MB) of capacity | Arithmetic from the reported 0.497 GB; the real figures are `BLOCKED` | section 3.5 |
| 22 | Unit tests of the preflight (no database): RED on a deliberately wrong stub (185 of 255 assertions failed), GREEN on the implementation (276/276); 20 single-line mutants all killed. Postgres tests: 153/153; 7 mutants all killed | `LOCAL_PASS` | A17 |

---

## 2. First observation → likely cause class

Use only what the repository's behaviour can distinguish. Anything marked *hypothesis* is not verified.

### 2.1 Read first (Railway, read-only, `UNVERIFIED` wording: "dashboard" means the Railway web UI)

1. **Postgres service**: does it exist, is it running, was it removed? Note the time of the last deployment/removal event.
2. **Its volume**: does it exist, is it attached, size and used bytes. Write the two numbers down.
3. **Backups / snapshots** of that volume, if the dashboard offers them (`UNVERIFIED` whether enabled). Note the newest one.
4. **`adlytic` service, latest deployment log**, first 100 lines and the last 100 lines. Match against the table in 2.3.
5. **Variables of `adlytic`: names only.** `DATABASE_URL` should be a reference to the Postgres service (`railway.setup.txt` documents the
   `${{Postgres.DATABASE_URL}}` form). Is the referenced service present? Is `SERVICE_ROLE` set (`api` / `worker`) or absent (= `combined`)?
6. The services that also write to the same database: `thriving-manifestation` (sync worker, `railway.sync-worker.json`) and `lively-insight`
   (narration cron every 10 minutes, `railway.worker.json`). Are they running?
7. Optional, **owner approval**: dispatch `verify-live.yml` from GitHub; it prints `/api/health` and allowlisted runtime log lines.

### 2.2 Decision tree

| First observation | What the code distinguishes | Likely cause class (hypotheses unless stated) | Next read-only step |
|---|---|---|---|
| **No HTTP answer at all** (connection refused, healthcheck "failed", restarts ×5) and the log has `[adlytic:start] prisma migrate deploy exited N — not starting the server` | The start path ran `migrate deploy` and it failed, so the server never started (`.deploy/start.js`). The `Error: P…` line above it names why (2.3). | Database unreachable (`P1001`): Postgres service removed/stopped, volume full, wrong or unresolved `DATABASE_URL`. History problem: `P3005`, `P3009`. Lock: `P1002`. | Read the `P…` code; step 1-2 of 2.1 |
| No HTTP answer, log has `[adlytic:config] FATAL — N required configuration error(s) in production` | `reportConfig()` exits 1 before listening. A missing `DATABASE_URL` is one such error (observed). | A variable reference that no longer resolves (for example the Postgres service was removed, so `${{Postgres.DATABASE_URL}}` resolves to nothing), or a missing `JWT_SECRET` / `TOKEN_ENCRYPTION_KEY` | Variable **names** on the service |
| No HTTP answer, log has `Cannot find module '/app/.deploy/start.js'` | Entrypoint not packaged (`Dockerfile` comment) | Image problem, not a database problem | `Dockerfile` `COPY .deploy/start.js` line |
| HTTP **503**, body `status:"degraded"`, `db:"unavailable"` | The server is running **and did not run `migrate`** (a validation/worker config, or `start.js` was bypassed) but cannot reach the database. Log: `[adlytic:health] database probe failed reason=<unreachable\|database_missing\|auth\|tls\|timeout\|unknown>` | `unreachable` = service/volume gone or network; `database_missing` = server answered, database absent; `auth` = credentials rotated/rejected; `tls` = certificate problem; `timeout` | The `reason=` value |
| HTTP **503**, `status:"degraded"`, `db:"ok"` | The database is **reachable but not release-ready**. Log: `[adlytic:health] database not release-ready state=<…>` | See 2.4 | The `state=` value and the names that follow |
| HTTP **200** `status:"ok"` `db:"ok"` | Ready by the gate: every shipped migration identity applied, no failed row, every required table and column present | **Not proof the data is there.** If a fresh empty Postgres was attached, `migrate deploy` migrates it and the gate answers 200 with **no data** (`LOCAL_PASS`: an empty migrated database is GO, counts WARN) | `build.commit` equals the intended SHA; then `preflight --counts`: `users`, `workspaces`, `ad_accounts` must be non-zero |

### 2.3 Log lines and what they mean

| Line (exact text or prefix) | Meaning |
|---|---|
| `Error: P1001: Can't reach database server at …` | Postgres not reachable from the service |
| `Error: P1000` (authentication) / `P1003` (database does not exist) | Credentials rejected / database absent (the health classifier maps these the same way) |
| `Error: P1002` (after about 10 s) | Another session holds Prisma's migration advisory lock, or the database timed out |
| `Error: P3005` | Schema is not empty and there is no `_prisma_migrations` (a restore without the history table) |
| `Error: P3009` + "migrate found failed migrations" | An unfinished row exists in `_prisma_migrations`; no new migration will apply until it is resolved (**owner**, `prisma migrate resolve`, not run here) |
| `Error: The datasource.url property is required…` | `DATABASE_URL` is unset for the migrate step |
| `[adlytic:start] prisma migrate deploy exited N — not starting the server` | The start path stopped before the server |
| `No pending migrations to apply.` | `migrate deploy` was a no-op |
| `Applying migration …` | `migrate deploy` is **writing** to the database |
| `[adlytic] Server listening on …` then `[adlytic] build=<sha7>` | The server is up; compare `<sha7>` with the intended commit |
| `[adlytic] SERVICE_ROLE=api — background sync/queues run in the worker service` | No background writers in this process |
| `[adlytic:health] database probe failed reason=…` | Connectivity failure, once per reason per minute, no host/user/driver text |
| `[adlytic:health] database not release-ready state=… applied=N shipped=M missingMigrations=… failedMigrations=… missingTables=… missingColumns=…` | Reachable, not ready; at most 5 names per list |
| `[adlytic:startup] Cleaned up N orphaned sync job(s)` | Non-`api` role flipped PENDING/PROCESSING jobs older than 15 min to FAILED (a write) |
| `[adlytic:retention] Deleted N raw_insight rows older than 90 days` | Daily maintenance pruned the evidence the IQD repair uses |
| `[adlytic:integrity] auto-cleaned N orphaned daily_stat row(s) globally` | The scheduled sweep deleted orphaned campaign stats of **every** tenant |

### 2.4 `state=` values (same vocabulary as `delivery/core/HEALTH_ENDPOINT.md`)

`pending` shipped migration not applied · `diverged` some shipped not applied **and** extras (includes equal-count wrong histories) · `failed` an unfinished row ·
`missing` a required table or column is absent (also an empty database) · `unknown` shipped list unreadable, history table absent, or the probe errored.
`ok` and `ahead` (an older build on a newer database) answer 200.

---

## 3. Preserve before anything else

**Rules.** Never delete or recreate the volume or the Postgres service. Never let `.deploy/start.js` run against a database that has not passed the preflight
(4.7). Never point production at a new **empty** Postgres and deploy: the start path would migrate it and answer 200 with no data, and a later restore would then
collide with the migrated schema.

### 3.1 Stop other writers (**owner approval**, `UNVERIFIED` how)
Make sure no new deployment of `adlytic`, `thriving-manifestation` or `lively-insight` can start against the database under recovery (disable auto-deploy; stop the
worker and the cron). Reason: each one writes (migrate, sync, narration), and a restart after a Postgres replacement would act on whatever `DATABASE_URL` then resolves to.

### 3.2 Record facts (read-only)
`git rev-parse HEAD` of the build you intend to run; volume size and used bytes; Postgres service state; the newest backup if one exists. Keep them in the incident notes.

### 3.3 Take a restore point (**owner approval**; only if the Postgres service still answers)
Run on the operator's machine, output on the operator's disk, **never** on the Postgres volume. Use the environment, not the command line, for credentials so they do
not appear in `ps`: set `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` from the Postgres service's public/proxy connection (the variable name is `UNVERIFIED`).

```bash
pg_dump --format=custom --no-owner --no-privileges --file=restore_point_<UTC>.dump      # A3 (synthetic run: exit 0, 0.14 s, 133 730 bytes)
pg_restore --list restore_point_<UTC>.dump > toc.txt; echo $?                            # A4 (exit 0, 326 lines, 48 TABLE DATA)
sha256sum restore_point_<UTC>.dump                                                       # store it next to the file
```
`pg_dump` must be the same or a newer major version than the server (standard PostgreSQL rule; only 16 → 16 was run). Custom format is used because `pg_restore --list`
validates the file and restores selectively.

If the Postgres service does **not** answer: there is nothing to dump. Use a volume backup or snapshot if the dashboard shows one (`UNVERIFIED`), and stop here for the owner.

### 3.4 "The restore point is usable" (all must hold)

| # | Condition | How measured | Pass |
|---|---|---|---|
| R1 | Dump finished | exit status of `pg_dump` | 0 |
| R2 | Dump is readable | `pg_restore --list` | exit 0; `TABLE DATA` entries = number of tables in the source schema (48 at `78f1a33`: 47 model tables + `_prisma_migrations`) |
| R3 | Restores | `pg_restore --exit-on-error --single-transaction` into an empty **local** database | exit 0 |
| R4 | Preflight on the restored copy | `preflight-schema.ts --counts` | **exit 0 (GO)** |
| R5 | Counts non-zero | `counts.rows` | `users`, `workspaces`, `workspace_members`, `ad_accounts`, `campaigns`, `daily_stats` each ≥ 1 |
| R6 | Newest sync is recent | `counts.freshness`: newest `daily_stats` date and newest COMPLETED sync | both ≥ (incident date − 7 days). The preflight's own WARN is relative to *today* (threshold 7 days); judge against the incident date |
| R7 | Integrity numbers captured | `counts.duplicates` (gating), `counts.orphans`, `counts.iqd`, `counts.sync_status` | duplicates = 0; the other three **recorded** in the incident notes |
| R8 | Same as the source | if the source is reachable: `preflight --counts --i-understand-this-reads-a-real-database` against it | aggregates equal, except rows written between the two runs |

### 3.5 Capacity rule for the 500 MB volume
Thresholds used by the preflight (`--volume-bytes N`): **WARN above 80%, FAIL above 95%** of the volume (a full volume makes writes and migrations fail). The figure is
`pg_database_size` only; WAL and other databases on the volume are not included, so the real figure is higher.

At the reported 0.497 GB: 497 000 000 / 524 288 000 (500 MiB) = **94.8%** and 497 000 000 / 500 000 000 (500 MB) = **99.4%**. Either way the current volume is not an acceptable
destination for a restore or for migrations. **Enlarge it or restore onto a new, larger volume** (owner, `UNVERIFIED` how) so the restored database is at most 80% of the destination:
destination ≥ 1.25 × `pg_database_size` of the restored copy (derived from the 80% line; the margin itself is a policy choice, not a Postgres rule). Never write the dump to the volume.

---

## 4. Validate on a COPY (local Postgres, nothing on Railway)

### 4.1 Prerequisites
Local Postgres of the same major version as production (`connect` line of the preflight prints the server version of whatever it connects to); Node 22; `npm ci`;
check out **the commit you intend to deploy** (the preflight judges the database against *this checkout's* `prisma/migrations` and Prisma client); `npx tsc` (or `npm run build`) so `dist/` exists.

### 4.2 Restore and preflight
```bash
LOCAL=postgresql://<user>@127.0.0.1:<port>                                   # no password in argv; loopback only
psql "$LOCAL/postgres" -c "create database adlytic_restore_check"
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname="$LOCAL/adlytic_restore_check" restore_point_<UTC>.dump     # A5
DATABASE_URL="$LOCAL/adlytic_restore_check" npx tsx scripts/ops/preflight-schema.ts --counts --volume-bytes <destination volume bytes>        # A6
```
Exit 0 = GO, 1 = NO-GO, 2 = NOT RUN (could not connect, bad arguments, or a non-loopback URL without `--i-understand-this-reads-a-real-database`).
Reading the output: every line is `[PASS|FAIL|WARN|NOT_RUN] <check>: <reason>`; `identities` lists missing / unexpected / unfinished migration **names**; `checksums` names edited migrations;
the last two lines are the `/api/health` state this database would get and the verdict. `--json` prints the same as one JSON document. It prints no host, port, user, password, full database
name, id or customer value; the database name is shown as its first 3 characters and its length.

### 4.3 IQD sizing and orphan counts (read-only)
```bash
psql "$LOCAL/adlytic_restore_check" -Atc "select count(*) from ad_accounts where currency='IQD' and currency_minor_factor <> 1"                 # A7a
DATABASE_URL="$LOCAL/adlytic_restore_check" npx tsx scripts/repair-iqd-factors.ts                                                             # A7b report only; prints 8-character id prefixes
psql "$LOCAL/adlytic_restore_check" -Atc "select count(*), count(distinct ds.entity_id) from daily_stats ds where ds.entity_type='CAMPAIGN' and not exists (select 1 from campaigns c where c.id=ds.entity_id)"   # A8 counts only
```
`counts.orphans` and `counts.iqd` in the preflight give the same numbers. Per `IQD_REPAIR.md`: rows older than 90 days have no `raw_insights` evidence and are left as stored.

### 4.4 Start the API against the copy with the validation configuration (no migrate, no background work)
```bash
NODE_ENV=production SERVICE_ROLE=api BULLMQ_ENABLED=false SKIP_STARTUP_SYNC_CLEANUP=true PORT=3217 \
DATABASE_URL="$LOCAL/adlytic_restore_check" ALLOWED_ORIGINS=http://127.0.0.1:3217 RAILWAY_GIT_COMMIT_SHA="$(git rev-parse HEAD)" \
JWT_SECRET=<throw-away 32+ characters> TOKEN_ENCRYPTION_KEY=<throw-away 64 hex> \
node dist/src/api/serve.js                                                      # A9: NOT `node .deploy/start.js`
curl -s -i http://127.0.0.1:3217/api/health
```
Use throw-away secrets: the copy must not be able to decrypt production tokens or call Meta with them. Expected: HTTP 200 and
`{"status":"ok","service":"adlytic","version":"0.1.0","timestamp":…,"db":"ok","role":"api","runsBackgroundSync":false,"bullmq":"disabled","build":{"commit":"<sha>",…,"resolved":true}}`;
the log shows `SERVICE_ROLE=api — startup orphaned-SyncJob sweep skipped`, `SERVICE_ROLE=api — background sync/queues run in the worker service`, and **no** `migrate` / `Applying migration` line.
Do **not** call `GET …/data-health?cleanup=true`, `POST …/sync` or `POST …/repair-iqd` against the copy or anything else (they write).

### 4.5 Prove the validation step wrote nothing
`digest.sh` (Appendix A, A0) prints one digest of every table's content **and** `xmin`. Run it on the copy before starting the API and after stopping it: identical digests (A9).

### 4.6 GO / NO-GO table (every row must be GO to proceed to section 5)

| # | Condition | GO | NO-GO |
|---|---|---|---|
| V1 | R1-R3 of 3.4 | all pass | any fails |
| V2 | Preflight exit status | **0** | 1 or 2 |
| V3 | `identities` | `PASS` (or `WARN` "ahead" and the owner accepts running an older build on a newer database) | `FAIL`: pending, diverged, failed, or no history |
| V4 | `checksums` | `PASS` (or `WARN` "line-endings only": a CRLF/LF checkout, identical SQL) | `FAIL` (an applied migration differs from the shipped file) or `NOT_RUN` |
| V5 | `tables` and `columns` | `PASS` | `FAIL` |
| V6 | Counts (R5) | the six tables ≥ 1 | any = 0 |
| V7 | Freshness (R6) | within 7 days of the incident date | older (owner decides whether the data loss window is acceptable) |
| V8 | `counts.duplicates` | `PASS` (0 groups) | `FAIL` |
| V9 | Volume | destination `PASS`, or `WARN` accepted by the owner | `FAIL` (> 95%) |
| V10 | `counts.sync_status` | no PENDING/PROCESSING, or the owner accepts they will be marked FAILED by the first non-`api` start | n/a |
| V11 | `counts.orphans` / `counts.iqd` | recorded; decisions R3/R4 in section 7 taken **before** background work | not recorded |
| V12 | Validation API (4.4) | stays up 60 s; health 200 with `role:"api"`, `runsBackgroundSync:false`, `bullmq:"disabled"`, `build.commit` = intended SHA; digests equal; no migrate lines | anything else |

### 4.7 Why `.deploy/start.js` must NOT be used against an unvalidated restored database
1. It runs `prisma migrate deploy` first. On a database that is behind, that **writes**: it applied 2 migrations and changed the table digest (A12). A migration that fails halfway on real data leaves a `P3009` row.
2. It does not verify checksums: an edited-after-apply migration exits 0 (`fileedit` scenario). The preflight does.
3. On any failure the server never starts: no HTTP at all, so the failure is invisible to a healthcheck-only view.
4. The service's default role is `combined`: within 45 s it prunes `raw_insights`, flips sync jobs and deletes orphaned stats of every tenant (A13).
5. Against a **validated** database (preflight GO) `migrate deploy` is a no-op ("No pending migrations to apply", digest unchanged, A11 healthy), which is why section 5 allows it only after V2-V12.

---

## 5. Cut-over (**each step REQUIRES OWNER APPROVAL**)

Preconditions: section 4 all GO; the dump and its sha256 stored in two places; section 7 decisions R1-R6 taken.

**5.1 Target database.** Either (a) the existing Postgres service/volume, if it is alive: run the preflight against it with `--i-understand-this-reads-a-real-database --counts --volume-bytes <bytes>`;
or (b) a **new** Postgres service on a larger volume (`UNVERIFIED` how): restore into it *empty* with the 4.2 `pg_restore` command pointed at its public connection, then run the same preflight. Required: exit 0.

**5.2 Keep other writers off.** `thriving-manifestation` and `lively-insight` stay stopped; auto-deploy of `adlytic` is off (R6) until 5.4.

**5.3 Point the service.** Set `DATABASE_URL` on `adlytic` to the validated database (the repository documents the reference form `${{<Postgres service>.DATABASE_URL}}`; service naming is `UNVERIFIED`).
Set `SERVICE_ROLE=api` and `BULLMQ_ENABLED=false` on `adlytic` for this first deploy (the default role is `combined`, which starts the writers of 4.7 item 4).

**5.4 Deploy with migrations** (dashboard "deploy latest commit" or dispatch of `deploy-adlytic.yml`; both build the tip of the branch the service tracks, so the owner confirms the tip **is** the intended SHA).
`startCommand` is `node .deploy/start.js`; on the validated database it logs `No pending migrations to apply.` and starts the server (A11 healthy; `HEALTH_ENDPOINT.md` records about 1.6 s for a no-op migrate, not timed here; Railway's `healthcheckTimeout` is 60 s, so a migrate that has real work to do could exceed it: *hypothesis*).

**5.5 Expected healthcheck result.** HTTP **200**, body `status:"ok"`, `db:"ok"`, `role:"api"`, `runsBackgroundSync:false`, `bullmq:"disabled"`, `build.commit` equal to the intended SHA (first 7 characters equal `git rev-parse --short`).
What a **503** means now: `db:"ok"` = reachable but not ready, read the `state=` log line (2.3, 2.4); `db:"unavailable"` = unreachable, read `reason=`. Railway then keeps the previous deployment (documented in `.deploy/start.js`, **not exercised**); the previous
deployment points at the same `DATABASE_URL`, so this protects against a bad build, not against a bad database.
Then run `preflight --counts --i-understand-this-reads-a-real-database` against the live database: aggregates equal to the validated copy.

**5.6 Background work: one account first.** There is **no** configuration that limits the scheduled pass to one account (`backgroundScheduler.ts:73-100`, `syncAllAccounts`: every `ACTIVE` account with a user or system-user token). The supported way to try one account is a manual sync through the API while the service stays `SERVICE_ROLE=api`:
1. Take the section 7 decisions R3-R5 first (orphan sweep, IQD, raw_insights).
2. As an OWNER/MANAGER member of **one** workspace: `POST /api/workspaces/<workspaceId>/sync` with `{"windowDays": 3}` (rate limit 3 per 15 min per workspace; the job runs in-process with `setImmediate`, `src/api/server.ts:6344`). This calls Meta (read) and writes rows; owner approval.
3. Poll `GET /api/sync-jobs/<jobId>` until COMPLETED. A `TokenDecryptError` or a Meta 190 here means the `TOKEN_ENCRYPTION_KEY` on this service is not the key that encrypted the restored tokens (or the token expired): **stop**. (`scripts/count-undecryptable-tokens.ts` is the documented read-only counter, but it cannot run on this base, A14.)
4. Verify with aggregates only:
   - duplicates: `preflight --counts` → `counts.duplicates` still `PASS`;
   - no tenant crossover: run `per_workspace.sql` (A15) before and after; **only the synced workspace's row may change**; every other `ws_no` row identical;
   - PeriodInsight: `period_insights` for the synced workspace increased, and the `dup.period_insights` line stays 0;
   - IQD (if the account is IQD): `repair-iqd-factors.ts` report shows `proven-x100=0`;
   - `counts.sync_status` gained one COMPLETED job; no `[adlytic:sync]` failure lines in the log.
5. Widen: repeat 2-4 per workspace, then (owner) set `SERVICE_ROLE` to `combined`/`worker`. **Before that**, read R3-R5 below. Watch the first 60 s of the log for `[adlytic:integrity] auto-cleaned …` and `[adlytic:retention] Deleted …`.

---

## 6. Rollback

| What | Can it be rolled back? | How |
|---|---|---|
| Code (a bad build) | **Yes** | Redeploy the previous deployment/commit (dashboard `UNVERIFIED`, or revert on GitHub and deploy). Railway keeping the previous deployment when a new one fails its healthcheck is documented in `.deploy/start.js` and **not exercised**. An older build on a newer database is tolerated by the gate (`ahead` → 200, `LOCAL_PASS`). |
| Schema | **No.** There are no down migrations (all 41 `prisma/migrations/*` directories contain only `migration.sql`). A revert does not undo applied migrations. | Restore the restore point into a **new** database (below). |
| Data | **Yes, to the restore point only** | New empty database → `pg_restore` (4.2) → preflight GO → re-point `DATABASE_URL`. Rows written after the restore point are lost; record that time (R9). |
| IQD rows rewritten by `--apply` or by a sync | **Not by a code revert** (`IQD_REPAIR.md` section 5) | Take a table backup **before** applying: `pg_dump --format=custom --data-only --table=public.daily_stats --file=daily_stats_before_iqd.dump` (A16); restore only that table if needed. |
| `prisma migrate resolve` | Not reversible by this runbook | Owner decision; not run here. |

Exact revert steps for a bad deploy: (1) owner stops the new deployment / redeploys the previous one; (2) read `/api/health` and the log line of 2.3; (3) if the database changed (migrations applied, sync run), decide data rollback vs. accept; (4) after any database action run the preflight again.

---

## 7. Decisions the owner must take before background work (risks)

| # | Risk | Evidence | Decision needed |
|---|---|---|---|
| R1 | The restore point may not be recent enough | R6 in 3.4 | Accept the data-loss window or look for a newer source |
| R2 | The volume is at 94.8-99.4% | 3.5 | Larger volume before restoring (no restore onto the current one) |
| R3 | **The scheduled integrity sweep deletes orphaned campaign `daily_stats` of every tenant** (global), 30 s after boot of any non-`api` role and every 6 h; `GET …/data-health?cleanup=true` does the same at `12d7ac5` | A13; `backgroundScheduler.ts:383-410`, `server.ts:1522-1527` | Enable background work only on a build whose cleanup is tenant-scoped and platform-gated (core track, not in this branch), or accept the counts of `counts.orphans` as deletable |
| R4 | Daily maintenance prunes `raw_insights` older than 90 days **relative to the day the service starts**, which is the evidence the IQD repair needs | A13; `backgroundScheduler.ts:341-352` | Run the IQD report (4.3) and, if rows are over-scaled, the repair **before** non-`api` roles run |
| R5 | A restored database may hold IQD accounts with `currency_minor_factor <> 1` | A6 / A7 | Size it (4.3) and decide before any sync (sync also repairs from evidence) |
| R6 | A push/merge to the tracked branch may deploy by itself: `railway.setup.txt` says Auto Deploy is ENABLED on `main` (`UNVERIFIED` on the Railway side), and `deploy-adlytic.yml` says a push only runs `verify` | `railway.setup.txt`, `.github/workflows/deploy-adlytic.yml` | Confirm the setting; keep auto-deploy off until 5.4 |
| R7 | The checkout used for the preflight must be the commit that will be deployed | 4.1 | Record both SHAs |
| R8 | `TOKEN_ENCRYPTION_KEY` / `JWT_SECRET` must be unchanged from the original service or every stored token is undecryptable | `src/config.ts`, `AUDIT-REPORT.md` D-1 | Locate the original values **before** deleting any variable or service |
| R9 | Rows written between the restore point and the cut-over are lost | 6 | Record the restore point's time |

### Existing documents that contradict this runbook (not edited)

| File | Statement | Why it is wrong or risky now |
|---|---|---|
| `railway.setup.txt` | The production `startCommand` is `npx prisma migrate deploy && node dist/src/api/serve.js` and the build is Nixpacks | Superseded: the Dockerfile builder and `node .deploy/start.js` (see the `.deploy/start.js` header). |
| `railway.setup.txt` (validation service) | "a stray `migrate deploy` is a no-op, not a schema change" | False on a restored database that is behind: it applied 2 migrations (A12). |
| `railway.setup.txt` / `HEAL_ON_GET.md` | The validation service "never writes" | At `12d7ac5` `GET …/data-health?cleanup=true` still deletes (`server.ts:1522-1527`). |
| `PRODUCTION_DEPLOYMENT_READY.md` ("Rollback Procedure") | "The database is not deleted, so user data persists"; "deploy the previous version" | Contradicted by the reported removal of the Postgres service; and a code rollback does not roll the schema back. |
| `DEPLOYMENT_REPORT.md` | Nixpacks builder; migrations give "zero-downtime" | Dockerfile builder in `railway.json`; migrations run inside the start command and a failure means no HTTP at all. |
| `README_DEPLOYMENT.md` | `npx prisma migrate dev` creates the tables | `migrate dev` is a development command; never against a restored database. Use `migrate deploy` only after the preflight. |
| `STEP_13_RUNBOOK.md` | `migrate dev`, `db seed`, `migrate reset (DESTRUCTIVE)` | A development verification runbook; none of it belongs in recovery. |
| `SESSION_HANDOFF.md` | `railway run npx tsx scripts/repair-iqd-factors.ts` as a "one-time repair" | The script is report-only without `--apply`, and `railway run` would point it at production: owner approval. |
| `backup_database.command` | Presented as the backup tool | Prints `DATABASE_URL` including the password (line 39); `PGPASSWORD=""` + `--no-password` + `2>/dev/null \| gzip` can end "Backup complete" with a 20-byte file (A18); its fallback runs `prisma db push` (a write). **Do not use it.** |
| `release-manifest.yaml` | A release manifest | It describes the Dawai pharmacy platform (`platform-1.5.0`), not Adlytic's Railway deployment. |

---

## Appendix A. Commands that were run (synthetic loopback databases; secrets replaced by placeholders)

Local Postgres 16.15 at `127.0.0.1:54329`; databases `adlytic_repro_ops_*` created by the author. Working directory: the repository checkout at `78f1a33`. `$B` = `postgresql://<user>@127.0.0.1:54329`.

| ID | Command | Observed |
|---|---|---|
| A0 | `digest.sh <url>`: for each table in schema `public`, `select count(*), md5(string_agg(md5(x::text)\|\|x.xmin::text, ',' order by x.ctid)) from public."<table>" x`, then `md5sum` of all lines | One 16-hex digest. Two runs on an untouched copy: equal. `xmin` moves on any write, even an `UPDATE` that changes no value. |
| A1 | `git rev-parse --short HEAD; git status --short \| wc -l` | `78f1a33`, 0 |
| A2 | `psql "$B/adlytic_repro_ops_src" -Atc "select pg_size_pretty(pg_database_size(current_database()))"` | 10 MB |
| A3 | `pg_dump --format=custom --no-owner --no-privileges --file=restore_point.dump "$B/adlytic_repro_ops_src"` | exit 0, 0.14 s, 133 730 bytes |
| A4 | `pg_restore --list restore_point.dump > toc.txt; wc -l < toc.txt; grep -c "TABLE DATA" toc.txt; sha256sum restore_point.dump` | exit 0; 326 lines; 48; digest printed |
| A5 | `psql "$B/postgres" -c "create database adlytic_repro_ops_restore"`; `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname="$B/adlytic_repro_ops_restore" restore_point.dump` | exit 0, 0.48 s |
| A6 | `DATABASE_URL="$B/adlytic_repro_ops_restore" npx tsx scripts/ops/preflight-schema.ts --counts --volume-bytes 524288000` | exit 0. `identities` 41/41, `checksums` 41/41, `tables` 47, `columns` 512 of 47 tables, `volume` 2.0%, counts: users 2, workspaces 2, ad_accounts 3, campaigns 6, daily_stats 19; duplicates 0; **orphans WARN: 4 rows / 3 ids**; **IQD WARN: 1 of 2**; tokens 3 + 2; `state ok`; `VERDICT: GO (exit 0)` |
| A7 | (a) `psql "$B/adlytic_repro_ops_restore" -Atc "select count(*) from ad_accounts where currency='IQD' and currency_minor_factor <> 1"`; (b) `DATABASE_URL="$B/adlytic_repro_ops_restore" npx tsx scripts/repair-iqd-factors.ts` | (a) `1`; (b) "REPORT ONLY (no writes)", 2 IQD accounts, `proven-x100=2` each (synthetic raw rows), exit 0; digest before = after |
| A8 | the orphan-count `select` of 4.3 | `4\|3` |
| A9 | the 4.4 `serve.js` start (throw-away secrets) + `curl -s -i http://127.0.0.1:3217/api/health` | `HTTP/1.1 200`, body as in 4.4 with `build.commit` = checkout SHA; log lines as in 4.4; digest before = after |
| A10 | the same `serve.js` start against: a copy with the last two migrations removed and their 4 tables dropped / a copy with `_prisma_migrations` dropped / a copy with an unfinished row / `postgresql://<user>@127.0.0.1:1/<db>` | 503 `db:"ok"`, log `state=pending applied=39 shipped=41 missingMigrations=…,… missingTables=meta_usage_daily,meta_usage_outcomes,meta_usage_state,period_insights` / 503 `db:"ok"`, `state=unknown applied=? shipped=41 unknownReason=history_absent` / 503 `db:"ok"`, `state=failed applied=41 shipped=41 failedMigrations=…` / 503 `db:"unavailable"`, `reason=unreachable prismaCode=P2010 adapterKind=DatabaseNotReachable`. Every body has exactly the 9 public keys. |
| A11 | `node .deploy/start.js` (with `SERVICE_ROLE=api`) against: closed port / no `_prisma_migrations` / unfinished row / advisory lock `72707369` held by another session / `DATABASE_URL` unset / the healthy copy | exit 1 `P1001` (2 s) / exit 1 `P3005` / exit 1 `P3009` / exit 1 `P1002` after 12 s / exit 1 "datasource.url property is required" (and `node dist/src/api/serve.js` with `DATABASE_URL` unset in a production environment: exit 1, `[adlytic:config] FATAL — 1 required configuration error(s) in production`) / **exit 0 path**: `No pending migrations to apply.`, `Server listening`, HTTP 200, digest before = after. Each failure ends with `[adlytic:start] prisma migrate deploy exited 1 — not starting the server`. |
| A12 | `DATABASE_URL="$B/<behind copy>" npx prisma migrate deploy` | `Applying migration 20260822120000_add_period_insights`, `…23010000_add_meta_usage_telemetry`; exit 0; history rows 39 → 41; `period_insights` created; digest changed |
| A13 | `env -u SERVICE_ROLE NODE_ENV=production DATABASE_URL="$B/<copy>" … node dist/src/api/serve.js`, stopped after 45 s. Copy = restore + one 100-day-old `raw_insight` + one 2-hour-old PROCESSING sync job | log: `Cleaned up 1 orphaned sync job(s)`, `Deleted 1 raw_insight rows older than 90 days`, `auto-cleaned 4 orphaned daily_stat row(s) globally`. Before/after: orphans 4 rows / 3 ids → **0 / 0** (both tenants); raw_insights 7 → 6; PROCESSING 1 → FAILED 1 |
| A14 | `DATABASE_URL=… TOKEN_ENCRYPTION_KEY=<throw-away> npx tsx scripts/count-undecryptable-tokens.ts` | exit 1: `PrismaClientInitializationError` (client built without the driver adapter). **BLOCKED**: not usable. |
| A15 | `psql "$B/<copy>" -f per_workspace.sql` (per workspace, `row_number()` instead of ids: `ad_accounts`, `campaigns`, `daily_stats` (account + campaign rows via joins), `period_insights`, `sync_jobs`) | 2 rows: `(1,1,2,5,2,1)` and `(2,2,4,10,4,2)` |
| A16 | `pg_dump --format=custom --data-only --table=public.daily_stats --file=daily_stats_before_iqd.dump "$B/<copy>"`; `pg_restore --list … \| grep -c "TABLE DATA"` | exit 0; 1 |
| A17 | `npm run test:preflight-schema`; `PREFLIGHT_PG_URL=… npm run test:preflight-schema-pg` | 276 passed, 0 failed; 153 passed, 0 failed (final numbers are in the commit notes) |
| A18 | `PGPASSWORD="" pg_dump -h 127.0.0.1 -p 1 -U x -d y --no-password 2>/dev/null \| gzip > f.gz; echo $?; ls -l f.gz` (the pipeline of `backup_database.command`) | exit 0, 20 bytes |
| A19 | preflight on the "pending" copy / on a copy with one `_prisma_migrations.checksum` changed / `DATABASE_URL=postgresql://<user>:<password>@db.example.invalid:5432/<db>` without the flag / `--help` | exit 1: `[FAIL] identities … pending` (2 names), `[FAIL] tables` (4 names), `state pending` / exit 1: `[FAIL] checksums … drift: 20260710120000_add_platform_settings`, `state ok` / exit 2: `NOT RUN: DATABASE_URL is not a loopback address…`, nothing printed from the URL / exit 0 usage |

### Not run (`NOT_RUN`) and why
Every Railway and Cloudflare action (no access); any `railway` CLI command (no flags were invented; none are needed by this runbook); dispatching `verify-live.yml` or `deploy-adlytic.yml` (GitHub, owner);
`prisma migrate resolve` (a write on a database that does not exist here); `scripts/repair-iqd-factors.ts --apply` (covered by `npm run test:iqd-repair-pg` on the IQD track, not re-run); `POST /api/workspaces/:id/sync` (needs Meta, owner);
restoring the validated dump into a Railway Postgres (no access); the preflight against anything but loopback databases.
