# 07 — Security and deployment closure

```
CURRENT_HEAD_SECRET_SCAN = CLEAN (test_no_committed_secrets, 6 assertions)
TOKEN_URL_RISK           = CLOSED (one call site fixed — see doc 06)
VALIDATION_MIGRATION_RISK = CLOSED
BUILD_IDENTITY_SAFE      = YES
SERVICE_ROLE_SAFE        = YES
SECURITY_GAPS            = 0
NIXPACKS_BUILD_SECRET_PROPAGATION_RISK = REQUIRES_DEPLOYMENT_CONFIG_CHANGE
```

## Secrets at HEAD

No live DB credential, JWT secret or token-encryption key is committed.
`.env*` is ignored except `.env.example`. The rotated historical credential is
inert. `test_no_committed_secrets.ts` is an active regression guard with a
shape-based classifier, not a path allowlist.

## Validation service

`railway.validation.json` sets `startCommand: node dist/src/api/serve.js` —
**no `prisma migrate deploy`** — and declares no `preDeployCommand`. Asserted
by `test_validation_deployment_safety` and again by
`test_period_insight_rollout` §7. It runs `SERVICE_ROLE=api`,
`SKIP_STARTUP_SYNC_CLEANUP=true`, `BULLMQ_ENABLED=false`, so it never starts
background work and therefore can never write.

## Build identity

`lib/buildIdentity.ts` reports absence as absence: with no commit injected it
returns `resolved: false` and `buildIdentityLine()` prints
`build=UNKNOWN (…)`. Both the boot log and `/api/health.build` are
unconditional, which is what made the earlier deployment-source mismatch
diagnosable in one pass:

> `build` present with `resolved:false` = environment problem.
> `build` absent entirely = the running code predates the feature.

---

# PERIOD_INSIGHT_ROLLOUT_PLAN

Introducing `PeriodInsight` is a **data migration**, not just a code change:
a new table, a new writer inside background work, and a new read in the
analytics path. Those three do not deploy atomically.

## Safety matrix — each cell asserted in `test_period_insight_rollout.ts`

```
OLD_CODE_WITH_NEW_SCHEMA_SAFE     = YES
NEW_API_WITHOUT_TABLE_SAFE        = YES
NEW_WORKER_WITHOUT_TABLE_SAFE     = YES (non-fatal; writes nothing)
NEW_API_WITH_EMPTY_PERIOD_TABLE_SAFE = YES
NEW_WORKER_WITH_NEW_SCHEMA_SAFE   = YES
```

- **Old code, new schema.** The migration contains only `CREATE` — no `DROP`,
  `ALTER`, `RENAME`, `DELETE` or `TRUNCATE` — and only three modules reference
  the table. Any deployed version predating them cannot see it.
- **New API, no table.** `readPeriodFact` catches and returns null ⇒ UNKNOWN.
  This is what lets the validation service, which cannot migrate, be deployed
  ahead of the schema without an outage.
- **New API, empty table.** A miss is UNKNOWN, **never 0**. Zero reach against
  real impressions would read as a catastrophic delivery collapse.
- **New worker, no table.** Each write throws where the sync catches it — per
  target, and again per phase — so a period-fact outage cannot abort an account
  sync or any later phase.
- **New worker, new schema.** Upsert on the exact tuple; a re-sync converges.

```
PERIOD_INSIGHT_MIGRATION_REQUIRED = YES (20260822120000_add_period_insights)
PERIOD_INSIGHT_BACKFILL_REQUIRED  = NO separate job — see below
```

## Backfill is bounded by construction

The intelligence layer reads exactly two windows, so the writer requests
exactly two: no `date_preset`, no historical sweep, no loop over days. The
request set is **(accounts + campaigns) × 2**, and the **first ordinary sync
pass after deployment IS the backfill**. There is no separate job to run or to
get wrong. Asserted, so a sweep cannot be added quietly later.

Retention is bounded too: rows whose span ends before the sync's re-request
horizon are pruned, because the window advances daily and old keys become
permanently unreachable.

## SAFE_DEPLOYMENT_ORDER

1. **Migrate** — apply `20260822120000_add_period_insights`. Additive; safe
   while the current production code is still running.
2. **Deploy the worker** (`SERVICE_ROLE=worker`/`combined`). It begins
   populating both windows on its next pass. Never deploy the worker *before*
   step 1 — it is non-fatal either way, but until the table exists it writes
   nothing and every metric stays UNKNOWN.
3. **Deploy the API / validation reader.** Safe at any point; before step 1 or
   2 it simply reports UNKNOWN.
4. **Verify** period facts are populated before drawing any conclusion about
   reach or frequency.

## ROLLBACK_ORDER

1. Roll the reader back first — old readers ignore the table entirely.
2. Roll the worker back — writes stop; existing rows are inert.
3. Leave the table in place. Dropping it is unnecessary (nothing else
   references it) and a `DROP` is the one destructive step in this whole plan.

## PERIOD_TRUTH_LIVE_VALIDATION_PREREQUISITES

**A validation-service deploy alone cannot validate period metrics.** The
validation service is `SERVICE_ROLE=api` with no migration and no background
sync — it is structurally a reader. To validate period truth live you need:

1. the migration applied to the shared database;
2. a **worker** (not the validation API) to have completed at least one sync
   pass, populating the current and prior windows;
3. only then a read through the Observatory, whose reach and frequency will
   otherwise correctly show UNKNOWN.

Until (1) and (2), UNKNOWN is the **correct** live result and must not be read
as a defect.

## NIXPACKS_BUILD_SECRET_PROPAGATION_RISK

**Generated Railway/Nixpacks behaviour, not repository behaviour.** No
`Dockerfile`, no `ARG`/`ENV` in `nixpacks.toml`, no build env in any railway
config; `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` are read at runtime only via
`env()` in `src/config.ts`. Railway injects all service variables into the
build environment by default and Nixpacks' generated Dockerfile emits `ENV`
lines that BuildKit then lints as `SecretsUsedInArgOrEnv`.

Exposure: the values are baked into image layers readable by anyone with image
access. Classification: `REQUIRES_DEPLOYMENT_CONFIG_CHANGE` — remediation is a
Railway-side setting excluding those variables from the build environment. No
repository change would fix it, and none was made. No secret value has been
printed at any point in this investigation.
