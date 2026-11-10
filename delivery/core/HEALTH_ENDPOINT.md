# `/api/health` — investigation (separate from heal-on-GET)

Status: **reproduced locally; fix implemented and tested locally on `local/railway-recovery` (commit `fea80e4`); not deployed; not observed live.**
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

## 4. Decisions left to the owner

1. **Public `dbReason`.** The endpoint is unauthenticated by design (same reasoning as the public commit SHA). A coarse reason such as `auth` tells an anonymous caller that credentials are wrong. Keep (recommended: the people who need it often cannot log in) or make it log-only.
2. **Gate deploys on `pending` / `failed`?** Currently report-only. Making them 503 would stop promotion of an unmigrated or half-migrated release, but production has not been exercised against that gate.
3. **Liveness vs readiness.** Railway has one `healthcheckPath`. If the schema check ever becomes a hard gate, consider splitting it into a separate path so a database blip cannot kill a healthy API during overlap.

## 5. Not covered (UNVERIFIED)

Live behaviour of Railway's healthcheck against this change; TLS classification against a real TLS-failing server (the classifier is unit-tested on the adapter's `TlsConnectionError` kind, which the investigator observed, but I did not provoke it myself).
