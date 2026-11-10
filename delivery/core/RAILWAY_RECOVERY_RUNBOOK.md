# Railway recovery runbook (Adlytic core)

Audience: the **owner** decides, an **operator** executes. Written for a production Postgres that Railway reported as REMOVED
(500 MB volume, about 0.497 GB used) while `/api/health` was failing.

> **Nothing in this document was executed against Railway, Cloudflare, GitHub or production data.** Every command in Appendix A
> was run against synthetic Postgres 16 databases on loopback (`adlytic_repro_ops_*`): first by the author, then re-run from scratch
> by an independent adversarial reviewer (section 8). Every Railway-side step is either backed by a file in this repository (cited) or
> marked `UNVERIFIED`: the dashboard wording, backup features, volume resizing and the name of the public connection variable are not
> in this repository and were not checked.

Build under test: branch `local/railway-preflight`, base `12d7ac5` (see `git log` for the tip). Tools added by this branch:
`scripts/ops/preflight-schema.ts` (read-only go/no-go), `scripts/ops/schema-shape.ts` + `scripts/ops/expected-schema.json` (the shape it compares
against), `scripts/ops/schema-snapshot.ts` (regenerates that file), `scripts/ops/table-digest.sh` and `scripts/ops/per-workspace-counts.sql`
(the two proofs of "nothing was written"), `test_preflight_schema.ts`, `test_preflight_schema_pg.ts`.
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
| 8 | Deploy (dashboard "deploy latest commit" (`UNVERIFIED` wording), or dispatch `deploy-adlytic.yml`) | Railway / GitHub (write) | **Owner** | 5 |
| 9 | Push or merge to the tracked branch (may auto-deploy, see risk R6) | GitHub, possibly Railway | **Owner** | 5 |
| 10 | Set `SERVICE_ROLE` to anything other than `api` (turns background writers on) | Railway (write) | **Owner** | 5.6 |
| 11 | `POST /api/workspaces/:id/sync` (calls Meta, writes rows) and `scripts/repair-iqd-factors.ts --apply` | Production data (write), Meta API (read) | **Owner** | 5.6 |
| 12 | `prisma migrate resolve …` after a failed migration | Production data (write) | **Owner** | 2 |
| 13 | Cloudflare (DNS / proxy / cache for the public domain) | Cloudflare | **No change is required by this runbook.** Any change is the owner's. Whether the domain is proxied is `UNVERIFIED`. | n/a |
| 14 | Run the preflight (or `psql` / `pg_dump`) against a Railway or production database: read-only, but it needs that database's credentials and reads production aggregates | Production data (read) | **Owner**; credentials through the environment (`DATABASE_URL`, `PG*`), never in argv, chat, tickets or files | 3.3, 5.1, 5.5 |
| 15 | Set or change a service variable (`DATABASE_URL`, `SERVICE_ROLE`, `BULLMQ_ENABLED`) | Railway (write) | **Owner** | 5.3 |

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
| 10 | The preflight's state equals `dbHealth.probeReadiness`'s state for every scenario database of the Postgres test (healthy, empty, failed, behind, equal-count wrong history, ahead, dropped column/table, rolled-back, checksum, file edit, extra table, a copied history row, 17 shape breakages, 7 healthy differences) | `LOCAL_PASS` | `test_preflight_schema_pg.ts` (every scenario asserts it) |
| 11 | sha256 of the raw `migration.sql` bytes equals the checksum Prisma stores, for all 41 rows. Prisma does **not** normalise line endings or a BOM (a CRLF file is stored with the CRLF hash) | `LOCAL_PASS` | `test_preflight_schema_pg.ts` section 0; scratch probe with LF / CRLF / BOM files |
| 12 | The default role (`SERVICE_ROLE` unset = `combined`) writes within its first 45 s on a restored copy: flips old PENDING/PROCESSING sync jobs to FAILED and **deletes `raw_insights` older than 90 days** (the evidence the IQD repair needs). At `12d7ac5` it also deleted orphaned campaign `daily_stats` globally (both tenants); on the release candidate that sweep only **reports** (see 14) | `CODE_PRESENT` + `LOCAL_PASS` | `src/api/serve.ts:106-112`, `src/workers/backgroundScheduler.ts` (`pruneRawInsights`, `runDailyMaintenance`, `runIntegritySweep`); A13 (12d7ac5), A21 (release candidate: `SERVICE_ROLE=api` and `RAW_INSIGHTS_RETAIN_DAYS=36500` keep `raw_insights`, the default role prunes it, no role deletes orphans) |
| 13 | Background sync cannot be limited to one account by configuration: the pass takes every `ACTIVE` account that has a token | `CODE_PRESENT` | `src/workers/backgroundScheduler.ts:73-100` (`syncAllAccounts`) |
| 14 | `GET /api/workspaces/:id/data-health?cleanup=true` deletes orphaned campaign stats globally at `12d7ac5` | `CODE_PRESENT` at `12d7ac5` (`src/api/server.ts:1522-1527`) | Fixed on the release candidate: the GET is read-only; a tenant's scoped cleanup is an Owner/Manager POST on **verified ownership**; the global cleanup is a platform-admin POST bound to the **exact dry-run batch** (`GET /api/admin/data-health/orphans` returns `batchId`; `POST …/cleanup?expectedRows=N&batchId=H` deletes only that batch, 409 otherwise); the scheduler **only reports** orphans and has no delete path. `LOCAL_PASS` (`test_data_health_isolation.ts` 37, `test_data_health_isolation_postgres.ts` 46); not deployed |
| 15 | `scripts/repair-iqd-factors.ts` is report-only without `--apply` and wrote nothing (table digests identical before/after) | `CODE_PRESENT` + `LOCAL_PASS` | A7 |
| 16 | A custom-format `pg_dump` restores with `--exit-on-error --single-transaction` and the preflight then answers GO with the same counts | `LOCAL_PASS` | A3-A6 |
| 17 | At `12d7ac5`, `backup_database.command` could report "Backup complete" for an empty backup, printed `DATABASE_URL` (password included), and its fallback ran `prisma db push`. **On the release candidate it does none of these**: it only reads (`pg_dump`), has no fallback that writes, never prints the URL, user or password, and exits non-zero without leaving a file unless the dump is complete | `CODE_PRESENT` (`12d7ac5`: `backup_database.command:39,66-72,82`) + `LOCAL_PASS` (release candidate: `test_backup_database.ts` 42, shimmed `pg_dump`, 32 of them red on the old script; `test_backup_database_pg.ts` 23, real server) | A18 (old pipeline), A22 (new script) |
| 18 | `scripts/count-undecryptable-tokens.ts` cannot run on this base (`new PrismaClient()` without the driver adapter → `PrismaClientInitializationError`) | `LOCAL_PASS` | A14. **Do not rely on it.** |
| 19 | Railway keeps serving the previous deployment when a new one fails its healthcheck | `CODE_PRESENT` as a **comment** only (`.deploy/start.js` header). Documented, **not exercised** | `LIVE_VERIFIED`: none |
| 20 | Auto-deploy on `main` for the `adlytic` service is ENABLED | `CODE_PRESENT` as claims: `railway.setup.txt` ("Auto Deploy: ENABLE on branch main") and the comment in `.github/workflows/deploy-adlytic.yml` ("Railway's own GitHub integration already deploys every push to main"; its push trigger only runs `verify`). The Railway-side setting is `UNVERIFIED` | see R6 |
| 21 | The 500 MB volume is at 94.8% (if 500 MiB) to 99.4% (if 500 MB) of capacity | Arithmetic from the reported 0.497 GB; the real figures are `BLOCKED` | section 3.5 |
| 22 | Unit tests of the preflight (no database): RED on a deliberately wrong stub and on every mutant tried (author: 20 single-line mutants; reviewer: 4 mutants of the verdict function and a stubbed / 7 mutated shape check, all killed), GREEN on the implementation. Postgres tests: all pass, mutants killed. Final counts are in Appendix A, A17 | `LOCAL_PASS` | A17, section 8 |
| 23 | Before the review the preflight printed GO for a column of another type, a dropped default, a dropped or renamed enum value, a dropped enum type, a dropped UNIQUE / PRIMARY index, a dropped or re-targeted foreign key, and a migration identity recorded twice. `prisma migrate deploy` / `migrate status` and `/api/health` call all of these fine. Now: NO-GO (shape / identities), named | `LOCAL_PASS` | section 8, `test_preflight_schema_pg.ts` section 1b |
| 24 | For a non-loopback host the preflight (and the app pool) verify the server certificate strictly (`src/lib/pgSsl.ts`: `rejectUnauthorized: true`, `DATABASE_CA_CERT` adds the CA). A Railway public proxy that does not present a publicly trusted chain therefore fails with `NOT RUN … reason=tls` | `CODE_PRESENT` + `LOCAL_PASS` (the classification, with simulated driver errors); whether the Railway proxy's certificate verifies is `UNVERIFIED` | `delivery/core/HEALTH_ENDPOINT.md` section 2 (self-signed TLS row), section 5.1 below |

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
| `Error: P1000` (authentication) / `P1003` (database does not exist) | Credentials rejected / database absent (the health classifier maps these the same way). **Not reproduced here** (A11 ran P1001, P1002, P3005, P3009 and the unset variable); the meaning is Prisma's documented one and `src/lib/dbHealth.ts` `PRISMA_CODE_TO_REASON` |
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
| `[adlytic:integrity] ORPHANED campaign stats (REPORT ONLY — nothing was deleted): N row(s) / M campaign id(s) = X% of K campaign stat rows have no campaign` | Release candidate: the scheduled sweep **reported**, deleted nothing. After a restore, compare `campaigns` with the source before any cleanup (7, R3) |
| `[adlytic:integrity] auto-cleaned N orphaned daily_stat row(s) globally` | `12d7ac5` only: the scheduled sweep deleted orphaned campaign stats of **every** tenant. If this line appears, the build is not the release candidate |

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
validates the file and restores selectively. Whether the Railway public proxy requires TLS for `pg_dump` / `psql` (libpq's `PGSSLMODE`) is `UNVERIFIED`; the **preflight** verifies the
certificate strictly (section 4.2).

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
check out **the commit you intend to deploy** (the preflight judges the database against *this checkout's* `prisma/migrations`, Prisma client and `scripts/ops/expected-schema.json`); `npx tsc` (or `npm run build`) so `dist/` exists.
If the preflight answers `[NOT_RUN] shape: … expected-schema snapshot … generated for N migration(s)`, the commit's snapshot is stale (a migration was added without regenerating it; `test_preflight_schema.ts` fails on such a commit): use a commit whose snapshot matches, do **not** work around it.

### 4.2 Restore and preflight
```bash
LOCAL=postgresql://<user>@127.0.0.1:<port>                                   # no password in argv; loopback only
psql "$LOCAL/postgres" -c "create database adlytic_restore_check"
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname="$LOCAL/adlytic_restore_check" restore_point_<UTC>.dump     # A5
DATABASE_URL="$LOCAL/adlytic_restore_check" npx tsx scripts/ops/preflight-schema.ts --counts --volume-bytes <destination volume bytes>        # A6
```
Exit 0 = GO, 1 = NO-GO, 2 = NOT RUN (could not connect, bad arguments, or a non-loopback URL without `--i-understand-this-reads-a-real-database`).
Reading the output: every line is `[PASS|FAIL|WARN|NOT_RUN] <check>: <reason>`; `identities` lists missing / unexpected / unfinished / **duplicated** migration **names**; `checksums` names edited migrations;
`tables` / `columns` name absent tables and `table.column`; `shape` names every column whose type, NOT NULL or default differs, every enum value that is absent, every UNIQUE / PRIMARY KEY index and every
foreign key that is absent (non-blocking WARN: a dropped plain index, a column that lost NOT NULL); the last two lines are the `/api/health` state this database would get and the verdict. `--json` prints the same as one JSON document. It prints no host, port, user, password, full database
name, id or customer value; the database name is shown as its first 3 characters and its length; an argument it does not know is never echoed (a URL passed as an argument is refused, not printed).

**Against a non-loopback host** (sections 3.3, 5.1, 5.5) pass `--i-understand-this-reads-a-real-database`; the connection verifies the server certificate (`src/lib/pgSsl.ts`). If it answers
`NOT RUN: cannot connect (reason=tls code=…)`, the certificate chain is not publicly trusted: set `DATABASE_CA_CERT` to the server's CA certificate (PEM) in the environment. Whether Railway's proxy needs
that is `UNVERIFIED`. Credentials go in `DATABASE_URL` (environment), never as an argument.

**What the preflight does NOT cover** (so that a GO is not read as more than it is): privileges of the application role; extensions; the current value of sequences; CHECK constraints, triggers, functions,
views; the order of columns and the names of indexes and constraints (ignored on purpose: a definition under another name is the same definition); extra tables / columns / indexes / enum values (ignored: a newer
database is not a broken one); any schema other than `public` and any `?schema=` / `?sslmode=` parameter of the URL (ignored: the preflight always reads `public` and always applies the TLS rule above); whether a column that lost NOT NULL
now holds NULLs; data correctness; the live Railway service. A PostgreSQL other than 16 was not tried (the production major version is `BLOCKED`). The read-only guarantee is the server's `BEGIN READ ONLY` plus two statement guards
(an exact list of the tool's own statements, and a denylist); a function that opens its **own** connection (dblink) would escape a READ ONLY transaction, but the tool never calls a function by name or selects from a view.

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
`scripts/ops/table-digest.sh <url>` (Appendix A, A0) prints one digest of every table's content **and** `xmin`. Run it on the copy before starting the API and after stopping it: identical digests (A9).

### 4.6 GO / NO-GO table (every row must be GO to proceed to section 5)

| # | Condition | GO | NO-GO |
|---|---|---|---|
| V1 | R1-R3 of 3.4 | all pass | any fails |
| V2 | Preflight exit status | **0** | 1 or 2 |
| V3 | `identities` | `PASS` (or `WARN` "ahead" and the owner accepts running an older build on a newer database) | `FAIL`: pending, diverged, failed, no history, or a migration **recorded more than once**; or `NOT_RUN` (no shipped list) |
| V4 | `checksums` | `PASS` (or `WARN` "line-endings only": a CRLF/LF checkout, identical SQL) | `FAIL` (an applied migration differs from the shipped file) or `NOT_RUN` |
| V5 | `tables` and `columns` | `PASS` | `FAIL` or `NOT_RUN`; a `WARN` on `columns` means a required table is absent, which `tables` already fails |
| V5b | `shape` | `PASS`. A `WARN` (a dropped plain index, a column that lost NOT NULL) needs the owner's explicit acceptance, recorded in the incident notes | `FAIL` (column type / NOT NULL / default, enum value, UNIQUE or PRIMARY KEY index, foreign key) or `NOT_RUN` (stale or missing snapshot, shape unreadable) |
| V6 | Counts (R5) | the six tables ≥ 1 | any = 0 |
| V7 | Freshness (R6) | within 7 days of the incident date | older (owner decides whether the data loss window is acceptable) |
| V8 | `counts.duplicates` | `PASS` (0 groups) | `FAIL` |
| V9 | Volume | destination `PASS`, or `WARN` accepted by the owner | `FAIL` (> 95%) |
| V10 | `counts.sync_status` | no PENDING/PROCESSING, or the owner accepts they will be marked FAILED by the first non-`api` start | PENDING/PROCESSING present and not accepted by the owner |
| V11 | `counts.orphans` / `counts.iqd` | recorded; decisions R3/R4 in section 7 taken **before** background work | not recorded |
| V13 | `counts.rows` / `counts.unread` | every requested count was read | `counts.unread` is `NOT_RUN` (a requested count did not run; the exit status is 1) |
| V12 | Validation API (4.4) | stays up 60 s; health 200 with `role:"api"`, `runsBackgroundSync:false`, `bullmq:"disabled"`, `build.commit` = intended SHA; digests equal; no migrate lines | anything else |

### 4.8 The restored copy is BEHIND (`state pending`: the restore point is older than this build's migrations)

This is the expected result when the dump predates the newest migrations. Do **not** let `.deploy/start.js` migrate the live database (4.7 item 1). Migrate the **copy**, where a failure costs nothing:
1. On the local copy only: `DATABASE_URL="$LOCAL/adlytic_restore_check" npx prisma migrate deploy` (a write to the disposable copy; A12: applied the missing migrations, 39 → 41 history rows, the 4 missing tables created). Write down the wall time: `healthcheckTimeout` is 60 s (`railway.json`).
2. Re-run the preflight on the copy: it must now be GO with `identities`, `checksums`, `tables`, `columns` and `shape` all `PASS` (A20).
3. For the cut-over, restore a **dump of the migrated copy** (`pg_dump`, then `pg_restore --exit-on-error --single-transaction` into the empty target, A20), run the preflight on the target, and only then continue with section 5. The start path's `migrate deploy` is then a no-op.
If a migration fails on the copy (`P3018` / `P3009`), stop: that is the evidence the owner needs before any production step.

### 4.7 Why `.deploy/start.js` must NOT be used against an unvalidated restored database
1. It runs `prisma migrate deploy` first. On a database that is behind, that **writes**: it applied 2 migrations and changed the table digest (A12). A migration that fails halfway on real data leaves a `P3009` row.
2. It does not verify checksums: an edited-after-apply migration exits 0 (`fileedit` scenario). The preflight does.
3. On any failure the server never starts: no HTTP at all, so the failure is invisible to a healthcheck-only view.
4. The service's default role is `combined`: within 45 s it prunes `raw_insights` older than 90 days and flips old sync jobs to FAILED (A13, A21); at `12d7ac5` it also deleted orphaned stats of every tenant (the release candidate only reports them).
5. Against a **validated** database (preflight GO) `migrate deploy` is a no-op ("No pending migrations to apply", digest unchanged, A11 healthy), which is why section 5 allows it only after V2-V12.

---

## 5. Cut-over (**each step REQUIRES OWNER APPROVAL**)

Preconditions: section 4 all GO; the dump and its sha256 stored in two places; section 7 decisions R1-R6 taken.

**5.1 Target database.** Either (a) the existing Postgres service/volume, if it is alive: run the preflight against it with `--i-understand-this-reads-a-real-database --counts --volume-bytes <bytes>` (approval row 14; a `reason=tls` answer: see 4.2);
or (b) a **new** Postgres service on a larger volume (`UNVERIFIED` how): restore into it *empty* with the 4.2 `pg_restore` command pointed at its public connection, then run the same preflight. Required: exit 0.

**5.2 Keep other writers off.** `thriving-manifestation` and `lively-insight` stay stopped; auto-deploy of `adlytic` is off (R6) until 5.4.

**5.2a IQD evidence gate: preserve `raw_insights`, keep every worker stopped (**owner approval** for each Railway change).** `raw_insights` is the only proof of what Meta reported (`IQD_REPAIR.md`); without it a stored spend cannot be called right or wrong, and `SPEND_SCALE_UNVERIFIED` stays on. Daily maintenance of **any** role other than `api` deletes `raw_insights` rows whose `fetched_at` is older than `RAW_INSIGHTS_RETAIN_DAYS` (90) **counted from the day the service starts**, so on a restored database it deletes most of the evidence within 30 s of boot (A13, A21 case B). Therefore, until the evidence has been reviewed:
1. `thriving-manifestation` (sync worker) and `lively-insight` (narration cron) stay **stopped**, and `adlytic` runs `SERVICE_ROLE=api` (5.3). Nothing in a `SERVICE_ROLE=api` process prunes anything (A21 case A).
2. **Preserve the table.** From the validated copy or target, before any writer exists: `pg_dump --format=custom --data-only --table=public.raw_insights --file=raw_insights_<UTC>.dump` on the operator's disk (never the Postgres volume), `pg_restore --list` on it, `sha256sum` next to it (same handling as 3.3), and record per account: `select entity_id, count(*), min(date), max(date) from raw_insights where entity_type='ACCOUNT' group by 1` (counts and dates only).
3. **Review the evidence** (read-only): `repair-iqd-factors.ts` without `--apply` (4.3), and `GET /api/workspaces/<id>/data-health` → `spendScale` for each IQD workspace (`window.verified / overscaled / unverified`, `history.withoutEvidence`). Record, per account, how many rows are verified, proven ×100, and unverifiable. Rows older than the oldest `raw_insights` row can never be verified (`IQD_REPAIR.md`). The owner signs the decision (repair what is proven ×100 with `POST …/repair-iqd`, leave the rest visible as `SPEND_SCALE_UNVERIFIED`).
4. **Only then** may any non-`api` role start. If a worker must start earlier, set `RAW_INSIGHTS_RETAIN_DAYS=36500` on **that service first**: the retention cutoff then lies in the year 1926 and nothing is pruned (A21 case C). Lower it again only on the owner's written decision, after the dump of step 2 exists.
No writer may delete `raw_insights` between the restore and the signed decision; `raw_insights` is never truncated, "cleaned" or re-created as part of recovery.

**5.3 Point the service.** Set `DATABASE_URL` on `adlytic` to the validated database (the repository documents the reference form `${{<Postgres service>.DATABASE_URL}}`; service naming is `UNVERIFIED`).
Set `SERVICE_ROLE=api` and `BULLMQ_ENABLED=false` on `adlytic` for this first deploy (the default role is `combined`, which starts the writers of 4.7 item 4 and **prunes `raw_insights`**, 5.2a).

**5.4 Deploy with migrations** (dashboard "deploy latest commit" (`UNVERIFIED` wording) or dispatch of `deploy-adlytic.yml`, whose own comment says it sends `latestCommit=true`: both build the tip of the branch the service tracks, so the owner confirms the tip **is** the intended SHA).
`startCommand` is `node .deploy/start.js`; on the validated database it logs `No pending migrations to apply.` and starts the server (A11 healthy; `HEALTH_ENDPOINT.md` records about 1.6 s for a no-op migrate, not timed here; Railway's `healthcheckTimeout` is 60 s, so a migrate that has real work to do could exceed it: *hypothesis*).

**5.5 Expected healthcheck result.** HTTP **200**, body `status:"ok"`, `db:"ok"`, `role:"api"`, `runsBackgroundSync:false`, `bullmq:"disabled"`, `build.commit` equal to the intended SHA (first 7 characters equal `git rev-parse --short`).
What a **503** means now: `db:"ok"` = reachable but not ready, read the `state=` log line (2.3, 2.4); `db:"unavailable"` = unreachable, read `reason=`. Railway then keeps the previous deployment (documented in `.deploy/start.js`, **not exercised**); the previous
deployment points at the same `DATABASE_URL`, so this protects against a bad build, not against a bad database.
Then run `preflight --counts --i-understand-this-reads-a-real-database` against the live database: aggregates equal to the validated copy.

**5.6 Background work: one account first.** There is **no** configuration that limits the scheduled pass to one account (`backgroundScheduler.ts:73-100`, `syncAllAccounts`: every `ACTIVE` account with a user or system-user token). The supported way to try one account is a manual sync through the API while the service stays `SERVICE_ROLE=api`:
1. Take the section 7 decisions R3-R5 first (orphan sweep, IQD, raw_insights) and complete the **5.2a gate** (`raw_insights` dumped, IQD evidence reviewed and signed). A manual sync appends raw rows; it never prunes them.
2. As an OWNER/MANAGER member of **one** workspace: `POST /api/workspaces/<workspaceId>/sync` with `{"windowDays": 3}` (rate limit 3 per 15 min per workspace; the job runs in-process with `setImmediate` when `BULLMQ_ENABLED` is off, which 5.3 sets: `src/api/server.ts:6344-6480`). This calls Meta (read) and writes rows; owner approval.
3. Poll `GET /api/sync-jobs/<jobId>` until COMPLETED. A `TokenDecryptError` or a Meta 190 here means the `TOKEN_ENCRYPTION_KEY` on this service is not the key that encrypted the restored tokens (or the token expired): **stop**. (`scripts/count-undecryptable-tokens.ts` is the documented read-only counter, but it cannot run on this base, A14.)
4. Verify with aggregates only:
   - duplicates: `preflight --counts` → `counts.duplicates` still `PASS`;
   - no tenant crossover: run `scripts/ops/per-workspace-counts.sql` (A15) before and after; **only the synced workspace's row may change**; every other `ws_no` row identical;
   - PeriodInsight: `period_insights` for the synced workspace increased, and the `dup.period_insights` line stays 0;
   - IQD (if the account is IQD): `repair-iqd-factors.ts` report shows `proven-x100=0`;
   - `counts.sync_status` gained one COMPLETED job; no `[adlytic:sync]` failure lines in the log.
5. Widen: repeat 2-4 per workspace, then (owner) set `SERVICE_ROLE` to `combined`/`worker`, **only after 5.2a step 4** (or with `RAW_INSIGHTS_RETAIN_DAYS=36500` on that service). **Before that**, read R3-R5 below. Watch the first 60 s of the log: `[adlytic:retention] Deleted …` must **not** appear while `RAW_INSIGHTS_RETAIN_DAYS=36500`; `[adlytic:integrity] ORPHANED … REPORT ONLY` is expected and deletes nothing; `auto-cleaned` means the wrong build is running.

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
| R3 | Orphaned campaign `daily_stats` (a stat whose campaign row is gone) after a restore may be a real orphan **or** a campaign the restore lost: the `campaigns` table can be behind while `daily_stats` is intact. At `12d7ac5` the scheduled sweep deleted them of every tenant (global, 30 s after boot of any non-`api` role and every 6 h) and `GET …/data-health?cleanup=true` did the same | A13; `backgroundScheduler.ts`, `server.ts:1522-1527` | **Resolved on the release candidate; no owner decision remains on the scheduler.** The sweep only **reports** (`[adlytic:integrity] ORPHANED … REPORT ONLY`); there is no scheduler delete path (A21: orphans 2 → 2 in all three cases). A tenant's cleanup is a scoped POST on verified ownership. A global cleanup is a **platform-admin** act on an **approved batch**: (1) dry run `GET /api/admin/data-health/orphans` → `orphanRows`, `orphanFraction`, `batchId`; (2) compare `campaigns` with the restore source (is `orphanFraction` plausible? a restore that lost campaigns shows a high share); (3) `POST /api/admin/data-health/orphans/cleanup?expectedRows=<orphanRows>&batchId=<batchId>` deletes exactly that batch and answers 409, deleting nothing, if even one row differs. Record `counts.orphans`, the `batchId` and who approved it in the incident notes |
| R4 | Daily maintenance of every non-`api` role prunes `raw_insights` older than 90 days **relative to the day the service starts**, which is the evidence the IQD repair needs | A13, A21; `backgroundScheduler.ts` (`pruneRawInsights`) | **5.2a**: preserve `raw_insights` (dump + per-account counts), keep `thriving-manifestation`, `lively-insight` and every non-`api` role **stopped until the IQD evidence is reviewed and the decision is signed**; if a writer must start sooner, `RAW_INSIGHTS_RETAIN_DAYS=36500` on that service first |
| R5 | A restored database may hold IQD accounts with `currency_minor_factor <> 1` | A6 / A7 | Size it (4.3) and decide before any sync (sync also repairs from evidence) |
| R6 | A push/merge to the tracked branch may deploy by itself: `railway.setup.txt` says Auto Deploy is ENABLED on `main` (`UNVERIFIED` on the Railway side), and the comment in `deploy-adlytic.yml` says "Railway's own GitHub integration already deploys every push to main … independently of this workflow" while its push trigger only runs `verify` | `railway.setup.txt`, `.github/workflows/deploy-adlytic.yml` | Confirm the setting; keep auto-deploy off until 5.4; treat a merge of this branch as a possible deployment |
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
| `backup_database.command` | Presented as the backup tool | **`12d7ac5` version: do not use it.** It printed `DATABASE_URL` including the password; `PGPASSWORD=""` + `--no-password` + `2>/dev/null \| gzip` could end "Backup complete" with a 20-byte file (A18); its fallback ran `prisma db push` (a write). **The release candidate rewrote it** (row 17, A22: read-only, no printed credentials, fails without leaving a file). The recovery restore point stays the custom-format `pg_dump` of 3.3, which `pg_restore --list` can validate; the script produces a plain-SQL gzip for ad-hoc backups |
| `release-manifest.yaml` | A release manifest | It describes the Dawai pharmacy platform (`platform-1.5.0`), not Adlytic's Railway deployment. |

---

## 8. Adversarial review record (an independent reviewer, commits after `f7827e6`)

The reviewer assumed the preflight and this runbook were wrong, built throw-away databases (`adlytic_repro_ops_rev_*`) from the migrated template, and re-ran every command of Appendix A. Exit codes are what the CLI printed.

### 8.1 Fail-open search: states that were broken, and what the preflight said

| State (one database each) | Exit before | Exit now |
|---|---|---|
| one identity renamed (equal count); name upper-cased; trailing / leading space; trailing newline | 1 | 1 |
| `rolled_back_at` set on a shipped row; history truncated (20 rows, or empty) | 1 | 1 |
| `_prisma_migrations` moved to another schema / copied there and emptied / dropped; a model table moved to another schema | 1 | 1 |
| a column renamed (also to a different case) / dropped | 1 | 1 |
| a table replaced by a view or a materialized view | 1 | 1 |
| checksum edited; empty database; history present but no model tables | 1 | 1 |
| **one identity recorded twice (same name, same checksum)** | **0** | 1 (`identities` FAIL, "duplicated") |
| **column type changed** (bigint → integer / text / numeric(10,2); date → timestamp; timestamp(3) → timestamptz / timestamp(6)) | **0** | 1 (`shape` FAIL) |
| **column DEFAULT dropped**; **NOT NULL added** where the model is optional | **0** | 1 |
| **enum value dropped / renamed; enum type dropped** (column left as text) | **0** | 1 |
| **UNIQUE index dropped / replaced by a plain index / made partial**; PRIMARY KEY dropped (Postgres test) | **0** | 1 |
| **FOREIGN KEY dropped / re-created with ON DELETE NO ACTION** | **0** | 1 |
| NOT NULL dropped (the column is nullable, the model requires a value) | 0 | 0 with `[WARN] shape` (reads work until a NULL appears; V5b needs the owner's acceptance) |
| a plain (non-unique) index dropped | 0 | 0 with `[WARN] shape` (slower queries only) |

Healthy-in-production states that must stay GO, observed GO: ahead (an applied migration this build does not ship, `[WARN] identities`); rolled-back attempt then re-applied; an extra table / column / index / foreign key / enum value / enum type;
a column re-added at the end of its table (another column order); an index or foreign key under another name; a default the model does not have; a CRLF checkout of LF-applied migrations and the reverse (`[WARN] checksums … line endings only`, 41 of 41);
a `pg_dump` / `pg_restore` round trip (A5/A6, A20).

### 8.2 Read-only proof

Every statement the tool sent was captured on the wire (`pg.Client.prototype.query` spy, `--counts --volume-bytes`, a database holding a table named `x"; drop table users; --`, a column and a table with quotes in their names and a `_prisma_migrations.migration_name` containing SQL):
40 distinct statements (the capture was repeated on the final code, with the four shape statements), all constants, the first `BEGIN READ ONLY`, the last `ROLLBACK`, none containing a `;` or any of the hostile text; `users` and all 50 tables intact afterwards. Inside `BEGIN READ ONLY` the server refused an `INSERT` made by a function called from a row-level-security policy
(25006, reported as `read_only_violation`; the log table stayed empty). **Found:** `assertReadOnlySql` is a denylist; `pg_stat_reset()`, `pg_logical_emit_message()` and any user function pass it, and a READ ONLY transaction does **not** forbid the first two (both ran). Fixed: every statement sent must also be byte-for-byte
one the tool defines (`assertKnownStatement`). A function that opens its own connection (dblink) was **not** demonstrable here (trust authentication: dblink refuses a non-superuser, 2F003); it is documented as a limit in 4.2.

### 8.3 Leaks

A distinctive password, user and database name were put in `DATABASE_URL`; output (human and `--json`, stdout and stderr) was searched for them, for the host and the port on every path: success with `--counts`, a non-loopback URL without the flag, with the flag (DNS failure), closed port, missing database, missing role, unparseable URL, non-postgres URL.
None appeared. **Found:** a URL passed as an *argument* was echoed for its first 40 characters (user name and the start of the password). Fixed: no argument text is echoed. `--counts` printed no id, e-mail, name, token or external id for the seeded two-tenant data.

### 8.4 Mutations of the verdict function (reverted, never committed)

| Mutation | Result of `test_preflight_schema.ts` |
|---|---|
| checksum drift not recorded | RED (5 failed) |
| a count of identities instead of the identities | RED (7 failed) |
| `NOT_RUN` (unknown) not blocking | RED (9 failed) |
| missing columns ignored | RED (5 failed) |
| shape check stubbed to PASS (the behaviour before the fix) | RED (35 unit + 38 Postgres assertions failed) |
| shape: type / UNIQUE / enum value / foreign key / default / stale snapshot / unreadable shape ignored (7 mutants) | each RED |

### 8.5 Runbook defects found and fixed

| Defect | Fix |
|---|---|
| Appendix A0 and A15 described `digest.sh` and `per_workspace.sql` that were not in the repository; A15's observed row `(2,2,4,10,4,2)` could not be reproduced (the last column counted only COMPLETED jobs) | committed `scripts/ops/table-digest.sh` and `scripts/ops/per-workspace-counts.sql` (tested); observed `(2,2,4,10,4,4)` |
| A13 did not say which columns to age: with `started_at` / `date` instead of `created_at` / `fetched_at` nothing is swept or pruned (the code filters on those two) | exact seed SQL and the code lines |
| the approvals table had no row for reading a live database with the preflight, nor for setting service variables | rows 14 and 15 |
| "deploy latest commit" and the redeploy step were not labelled `UNVERIFIED` everywhere; `P1000` / `P1003` were presented like observed codes | labelled |
| the GO / NO-GO table had no row for the new shape check, nor for `NOT_RUN` of `identities` / `tables` / `columns`; V10 had no NO-GO condition | rows V3, V5, V5b, V10, V13 |
| no procedure when the restore point is older than the build (`state pending`) | 4.8 |
| R6 omitted that `deploy-adlytic.yml`'s own comment says Railway's integration deploys every push to `main` | R6, claim 20 |
| no statement of what a GO does not cover; no mention of TLS verification for a Railway proxy | 4.2, claim 24 |

### 8.6 Not fixed / not knowable here

`BLOCKED`: every fact about live Railway or production (section 1); the production Postgres major version; whether the production schema equals what the migrations create (if it does not, the shape check answers NO-GO and the owner must read the named differences: there is no override flag);
whether the Railway public proxy certificate verifies (`reason=tls`). Not detected: NOT NULL silently dropped with NULLs present; privileges, sequences, triggers, check constraints; `?schema=` in the URL (the preflight always reads `public`).

---

## Appendix A. Commands that were run (synthetic loopback databases; secrets replaced by placeholders)

Local Postgres 16.15 at `127.0.0.1:54329`; databases `adlytic_repro_ops_*` created by the author, every row re-run by the reviewer on `adlytic_repro_ops_rev_*`. Working directory: the repository checkout at the tip of `local/railway-preflight` (`git log`). `$B` = `postgresql://<user>@127.0.0.1:54329`.

| ID | Command | Observed |
|---|---|---|
| A0 | `scripts/ops/table-digest.sh <url>`: for each table in schema `public`, the row count and `md5(string_agg(md5(x::text)\|\|x.xmin::text, ',' order by x.ctid))`, then `md5sum` of all lines; read-only session; table names passed as psql variables | One 16-hex digest. Two runs on an untouched copy: equal. `xmin` moves on any write, even an `UPDATE` that changes no value (positive control). A table named `x"; drop table users; --` is digested as a name. |
| A1 | `git rev-parse --short HEAD; git status --short \| wc -l` | the tip's short SHA, 0 |
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
| A13 | `env -u SERVICE_ROLE NODE_ENV=production PORT=3220 DATABASE_URL="$B/<copy>" ALLOWED_ORIGINS=… JWT_SECRET=<throw-away> TOKEN_ENCRYPTION_KEY=<throw-away> node dist/src/api/serve.js`, stopped after 45 s. Copy = restore + `insert into raw_insights (id, entity_type, entity_id, date, raw_json, fetched_at) select 'old_raw_1', 'CAMPAIGN', id, (now() - interval '100 days')::date, '{}'::jsonb, now() - interval '100 days' from campaigns limit 1` + `insert into sync_jobs (id, ad_account_id, status, window_days, window_since, window_until, created_at) select 'old_proc_1', id, 'PROCESSING', 3, now()::date-3, now()::date-1, now() - interval '2 hours' from ad_accounts limit 1` (the code filters on `fetched_at`, `backgroundScheduler.ts:345`, and `created_at`, `backgroundScheduler.ts:62`; ageing any other column changes nothing) | log: `Cleaned up 1 orphaned sync job(s)`, `Deleted 1 raw_insight rows older than 90 days`, `auto-cleaned 4 orphaned daily_stat row(s) globally`. Before/after: orphans 4 rows / 3 ids → **0 / 0** (both tenants); raw_insights 7 → 6; PROCESSING 1 → FAILED 1 |
| A14 | `DATABASE_URL=… TOKEN_ENCRYPTION_KEY=<throw-away> npx tsx scripts/count-undecryptable-tokens.ts` | exit 1: `PrismaClientInitializationError` (client built without the driver adapter). **BLOCKED**: not usable. |
| A15 | `psql -q "$B/<copy>" -X -A -t -F ' ' -f scripts/ops/per-workspace-counts.sql` (per workspace, `row_number()` instead of ids: `ad_accounts`, `campaigns`, `daily_stats` (account + campaign rows via joins), `period_insights`, `sync_jobs`) | 2 rows: `1 1 2 5 2 1` and `2 2 4 10 4 4`; nothing but numbers |
| A16 | `pg_dump --format=custom --data-only --table=public.daily_stats --file=daily_stats_before_iqd.dump "$B/<copy>"`; `pg_restore --list … \| grep -c "TABLE DATA"` | exit 0; 1 |
| A17 | `npm run test:preflight-schema`; `PREFLIGHT_PG_URL=… npm run test:preflight-schema-pg` | 447 passed, 0 failed; 380 passed, 0 failed |
| A18 | `PGPASSWORD="" pg_dump -h 127.0.0.1 -p 1 -U x -d y --no-password 2>/dev/null \| gzip > f.gz; echo $?; ls -l f.gz` (the pipeline of `backup_database.command`) | exit 0, 20 bytes |
| A19 | preflight on the "pending" copy / on a copy with one `_prisma_migrations.checksum` changed / `DATABASE_URL=postgresql://<user>:<password>@db.example.invalid:5432/<db>` without the flag / `--help` | exit 1: `[FAIL] identities … pending` (2 names), `[FAIL] tables` (4 names), `state pending` / exit 1: `[FAIL] checksums … drift: 20260710120000_add_platform_settings`, `state ok` / exit 2: `NOT RUN: DATABASE_URL is not a loopback address…`, nothing printed from the URL / exit 0 usage |
| A20 | `DATABASE_URL="$B/<behind copy>" npx prisma migrate deploy`; preflight on it; `pg_dump --format=custom` of the migrated copy; `pg_restore --exit-on-error --single-transaction` into an empty database; preflight on the restored database | before: exit 1 `state pending`; after `migrate deploy` (2 migrations applied): exit 0, `identities`, `checksums`, `tables`, `columns`, `shape` all `PASS`; restore exit 0; restored database exit 0 (`shape` PASS) |
| A21 | `TEMPLATE=adlytic_repro_rc1 SECS=80 bash scripts/repro/raw_insights_hold.sh` (three copies of a migrated synthetic database, each with 2 `raw_insights` rows — one `fetched_at` 100 days old, one 5 days old — and 2 orphaned campaign stats; the server is `npx tsx src/api/serve.ts`, `NODE_ENV=production`, `BULLMQ_ENABLED=false`, 80 s) | **A** `SERVICE_ROLE=api`: raw_insights 2 → 2, orphans 2 → 2, no prune line. **B** default role (control): raw_insights 2 → **1** (the 100-day-old row), orphans 2 → 2, log `Deleted 1 raw_insight rows older than 90 days` and `ORPHANED … REPORT ONLY`, no `auto-cleaned`. **C** default role with `RAW_INSIGHTS_RETAIN_DAYS=36500`: raw_insights 2 → 2, orphans 2 → 2. Source run, not the built `dist/` of A13 |
| A22 | `DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc1 npm run test:backup-database-pg` (real `pg_dump`, `gzip`, `psql`; the script is `./backup_database.command`) | 23 passed, 0 failed: exit 0 and "Backup complete"; the `.sql.gz` is 0600 and carries pg_dump's completion marker; `gunzip < file \| psql -q --set ON_ERROR_STOP=1 --single-transaction` into a **new** database `adlytic_repro_bkrestore_<id>` exits 0; all 48 tables (3 841 rows) equal the source by row count and content digest; columns, indexes, constraints, enum values and the `_prisma_migrations` history equal; the source's digest is unchanged by the backup and by the restore; a role that cannot read, a real dump cut after 40 KB (exit 1 and exit 0), an unreachable server and a missing database each exit non-zero and leave **no file** |

### Not run (`NOT_RUN`) and why
Every Railway and Cloudflare action (no access); any `railway` CLI command (no flags were invented; none are needed by this runbook); dispatching `verify-live.yml` or `deploy-adlytic.yml` (GitHub, owner);
`prisma migrate resolve` (a write on a database that does not exist here); `scripts/repair-iqd-factors.ts --apply` (covered by `npm run test:iqd-repair-pg` on the IQD track, not re-run); `POST /api/workspaces/:id/sync` (needs Meta, owner);
restoring the validated dump into a Railway Postgres (no access); the preflight against anything but loopback databases.
