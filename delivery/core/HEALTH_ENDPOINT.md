# `/api/health` — investigation (separate from heal-on-GET)

Status: **superseded in part by section 6 (owner decisions applied on `local/health-gate`): the public body no longer carries `dbReason` or `schema`, and readiness is gated on migration identities, not a count. Sections 1-5 describe the first fix (`fea80e4`) and the investigation. Not pushed, not deployed, not observed live.**
Base: `main @ 3f61e40`. Evidence files (scratchpad): `health_matrix_BEFORE.json`, `health_matrix_AFTER.json`.
Reproduction: `scripts/repro/health_matrix.ts` (+ `_prepare.sh`), loopback Postgres only.

## 1. What the endpoint did (before)

`src/api/server.ts:1397` ran `SELECT 1`: success → 200 `db:"ok"`; any exception → 503 `db:"unavailable"`.
Nothing else was inspected, nothing was logged, no test asserts its behaviour (`test_route_authz.ts` only lists it as public).

| # | Local situation (real Postgres 16, real app) | HTTP | Body | Server log naming the cause | Real app query |
|---|---|---|---|---|---|
| H0 | healthy, migrated | 200 | `db:ok` | — | works |
| H1 | server port closed (service removed) | 503 | `db:unavailable` | **none** | — |
| H2 | DNS name no longer resolves | 503 | **identical** | **none** | — |
| H3 | database dropped | 503 | **identical** | **none** | — |
| H4 | role/credentials rejected | 503 | **identical** | **none** | — |
| H5 | **reachable, schema empty** | **200** | `db:ok` | none | **fails (P2021)** |
| H6 | `_prisma_migrations` has an unfinished row | 200 | `db:ok` | none | works |
| H7 | last two migrations not applied | 200 | `db:ok` | none | `period_insights` missing |

Two defects: **(a)** four different causes are indistinguishable from outside *and* from the log; **(b)** H5 is a **false green** — a
platform healthcheck would promote a release that answers every real request with an error.

## 2. What the start path does around it (measured with the repository's real `.deploy/start.js`)

These come from the stopped read-only investigator (it ran the real script against throw-away local databases; I re-verified H0–H7 myself, the T-series below I did **not** re-run — treat as *observed by an investigator*, not by me):

| Situation | `node .deploy/start.js` | Consequence for the platform |
|---|---|---|
| fresh empty DB | exit 0 after applying all 41 migrations (≈2.3 s) | server starts |
| already migrated | exit 0, "No pending migrations" (≈1.6 s) | server starts |
| DB unreachable (closed port / unroutable host) | exit 1 `P1001`, **server never starts** | **no HTTP response at all → "healthcheck failed"**, restart policy `ON_FAILURE` ×5 |
| `DATABASE_URL` unset | exit 1 | same |
| schema present, `_prisma_migrations` missing | exit 1 `P3005` | same |
| failed migration row | exit 1 `P3009` | same |
| advisory lock held elsewhere | exit 1 `P1002` after 10 s | same |
| applied migration file edited afterwards | **exit 0** (`migrate deploy` does not verify checksums) | silent |
| DB ahead of code | exit 0 | silent |
| server started directly (no migrate: worker/validation configs use `node dist/src/api/serve.js`) against an unreachable DB | server runs; `/api/health` → 503 | the only path that ever produces the **`db=unavailable` 503** |
| TLS server with self-signed certificate | `migrate deploy` **succeeds**; app pool uses `rejectUnauthorized:true` (`src/lib/pgSsl.ts`) → every query fails, `/api/health` 503 with **no logged reason** | a plausible "migrations OK but 503" |

Reading this against the historical observations (`daf5251` → 503 `db=unavailable`; `8752602` → built, health failed ×4):
**both are consistent with "the database was unreachable"** (volume/service removed), and the two symptoms differ only by whether the
start path ran `migrate` first. That is a hypothesis consistent with the evidence, **not a verified root cause** — it needs the Railway deployment logs.

## 3. Change made (smallest, additive)

`src/lib/dbHealth.ts` + 23 lines in the route; every field `verify-live.yml` and the platform read is untouched.

* failure body gains `dbReason` ∈ `unreachable | database_missing | auth | tls | timeout | unknown` (classified from the driver-adapter error *structure*, never message text);
  one rate-limited log line per reason per minute with **no host, user or driver text**;
* success body gains `schema: { state: ok|missing|pending|failed|unknown, applied, expected }` (one cached, bounded query; cache 30 s);
* a missing core table is now **503** (`status:"degraded"`, `db:"ok"`); `pending`/`failed` are reported but do **not** change the status.

After (same matrix): H1/H2 `unreachable`, H3 `database_missing`, H4 `auth`, H5 **503** `schema=missing`, H6 `schema=failed (41/41)`, H7 `schema=pending (39/41)`.
(H2 logged nothing only because the same reason was logged for H1 within the minute — the rate limit working.)

Tests: `test_health_diagnostics.ts` — 43 assertions, no database; **9 fail on the previous route, 0 on the new one**; added to `test:all`.
Full `npm run typecheck` ✓ and `npm run test:all` ✓ (exit 0, 78 s) on the branch.

## 4. Decisions left to the owner (RESOLVED, see section 6)

1. **Public `dbReason`.** The endpoint is unauthenticated by design (same reasoning as the public commit SHA). A coarse reason such as `auth` tells an anonymous caller that credentials are wrong. Keep (recommended: the people who need it often cannot log in) or make it log-only.
2. **Gate deploys on `pending` / `failed`?** Currently report-only. Making them 503 would stop promotion of an unmigrated or half-migrated release, but production has not been exercised against that gate.
3. **Liveness vs readiness.** Railway has one `healthcheckPath`. If the schema check ever becomes a hard gate, consider splitting it into a separate path so a database blip cannot kill a healthy API during overlap.

## 5. Not covered (UNVERIFIED)

Live behaviour of Railway's healthcheck against this change; TLS classification against a real TLS-failing server (the classifier is unit-tested on the adapter's `TlsConnectionError` kind, which the investigator observed, but I did not provoke it myself).

## 6. Owner decisions applied (`local/health-gate`)

| Decision | What was done |
|---|---|
| Keep `dbReason` in sanitised internal logs | Removed from the public JSON. Connectivity failures log `[adlytic:health] database probe failed reason=<unreachable\|database_missing\|auth\|tls\|timeout\|unknown> prismaCode=.. adapterKind=..`, once per reason per minute. No driver text, host, port, user, URL or SQL. |
| Preserve public verify-live fields | The body has exactly `status, service, version, timestamp, db, role, runsBackgroundSync, bullmq, build` (asserted by key list and order, and cross-checked against the `jq` fields `verify-live.yml` reads). The `schema` block is gone too. |
| Gate release readiness on required migration identities and schema | `src/lib/dbHealth.ts`: shipped = directories under `prisma/migrations` holding a `migration.sql`; applied = `_prisma_migrations` rows finished and not rolled back; required tables = every Prisma model's table. READY = `ok` or `ahead`. |
| Test pending, failed and equal-count wrong histories before enabling | `test_health_migration_gate.ts` was written first and run against `858339d`: 53 of 73 assertions failed (including the equal-count wrong history answering 200 with `schema.state: "ok"`); 0 of 93 fail on the new code. |

Public contract: ready 200 `status ok, db ok`; reachable but not ready 503 `status degraded, db ok`; unreachable 503 `status degraded, db unavailable`.

| State | Meaning | HTTP |
|---|---|---|
| ok | every shipped identity applied, nothing else | 200 |
| ahead | every shipped identity applied plus identities this build does not ship (older release, newer database) | 200 |
| pending | a shipped identity is not applied, no extras | 503 |
| diverged | a shipped identity is not applied and extras exist (includes equal-count wrong histories) | 503 |
| failed | any unfinished, not-rolled-back row | 503 |
| missing | a required table is absent, or the database is empty; or (identities and tables fine) a required column is absent | 503 |
| unknown | shipped or table list unreadable, history table absent, or the probe errored | 503 |

Local matrix on synthetic Postgres 16 (`scripts/repro/health_matrix.ts`, H0-H9): H0, H9 200; H1-H4 503 `db: unavailable`; H5-H8 503 `db: ok`; every public body has only the legacy keys.

Before the gate is enabled against production, compare its `_prisma_migrations` identities with `ls prisma/migrations` (read-only). A renamed or squashed history there is `diverged` and would hold every release. Not verified: Railway's healthcheck behaviour, the live production history, TLS classification against a real TLS-failing server.

## 7. Independent review of the gate (`local/health-gate`, commits after `b878560`)

Method: adversarial search on synthetic Postgres 16 (`adlytic_repro_*` databases built from the migrated `adlytic_repro_heal`), the real Prisma CLI for the failed / rolled-back / resolved flows, and the compiled `dist/` output run with `node` from several working directories. Every new test was run against the previous module first and failed there.

Fixed (one commit each, test first):

| Finding | Evidence | Fix |
|---|---|---|
| Fail-open: a dropped column answered 200 | `ALTER TABLE users DROP COLUMN email`, identities and tables intact: HTTP 200 while `prisma.user.findFirst()` failed with P2022 | Required columns (from the generated client, `@map` names) compared with `pg_attribute`; read only when identities and tables pass; state `missing`, log `missingColumns=`. Widens the owner's tables-only reading of "schema": one separable commit. |
| Fail-open: the shipped list was read from `process.cwd()` first | cwd with an older `prisma/migrations`: a database lacking the newest migration read as `ok` | Module-relative directories first, cwd last |
| 500 instead of the health contract | `process.cwd()` threw (deleted directory) outside every try block | Guarded, last resort |
| Log fields were a charset filter, not an allowlist | `code`/`kind` carrying a host or user name reached the log verbatim | `prismaCode`: `P####` or a known Node/SQLSTATE code; `adapterKind`: Prisma's kinds, else `other` |
| Closed vocabulary was not closed | kind `constructor` logged `reason=function Object() { [native code] }` | Own-property lookups |
| Backward clock step | negative age counted as fresh: a READY result served and a state left unlogged for the length of the step | Negative age is outside the window |
| Verdict defined in three places | adding `unknown` to `READY_STATES` changed nothing (equivalent mutant) | `isReady(state)` is the only source |

Checked and found correct: public keys identical to `3f61e40` for 200 and both 503 shapes; no secret, URL, host or user in the body or any log line for errors thrown by the liveness, table and history queries; renamed, truncated, dropped, case-only and whitespace-only history, tables dropped or renamed, rolled-back rows, a finished plus a failed row for one identity: all 503. Not false-red: a failed migration resolved `--rolled-back` (200), re-deployed after it (200, rows rolled-back + finished), `resolve --applied` (200), a newer database (`ahead`, 200), a directory without `migration.sql` (Prisma itself refuses it with P3015, so no running build can have one).

Residual, unchanged: ready results are trusted for 30 s (a not-ready database is noticed at the end of the window; a racing slow probe can overwrite a newer not-ready observation for at most one window); no single-flight; schema `public` is hard-coded; checksums are not compared; privilege problems (a role that cannot read a table) are not probed; production's history and column set are unverified.
