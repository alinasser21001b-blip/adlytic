# 07 — Security and deployment closure

```
CURRENT_HEAD_SECRET_SCAN = CLEAN (test_no_committed_secrets, 6 assertions)
TOKEN_URL_RISK           = CLOSED (one call site fixed — see doc 06)
VALIDATION_MIGRATION_RISK = CLOSED
BUILD_IDENTITY_SAFE      = YES
SERVICE_ROLE_SAFE        = YES
SECURITY_GAPS            = 0 in repository code; 1 operational gate OPEN
NIXPACKS_SECRET_GATE     = OPEN   ← see gate A below
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

## GATE B — PERIOD_TRUTH_LIVE_GATE (DATA MIGRATION / LIVE BEHAVIOUR OPERATIONAL GATE)

```
PERIOD_TRUTH_LIVE_GATE = OPEN
```

**A validation-service deploy alone cannot validate period metrics.** That
service is `SERVICE_ROLE=api` with no migration and no background sync — it is
structurally a reader. Period truth needs the migration applied **and a worker
pass**.

### Evidence ladder — what must be true at each step

| Step | Required evidence |
|---|---|
| 1. Migration | `MIGRATION_APPLIED=`, `PERIOD_INSIGHT_TABLE_PRESENT=` |
| 2. Worker deployed | `WORKER_BUILD=` (the final repository candidate), `WORKER_ROLE=` ∈ {`worker`, `combined`} |
| 3. Worker pass | `WORKER_SYNC_COMPLETED=`, plus the `[period-insights] n/m stored` log line |
| 4. Population | `CURRENT_WINDOW_PERIOD_FACT_PRESENT=`, `PRIOR_WINDOW_PERIOD_FACT_PRESENT=`, `PERIOD_REACH_PROVENANCE=META_PERIOD_FACT` |
| 5. Reader deployed | `API_BUILD=`, `VALIDATION_BUILD=` |
| 6. Read | `OBSERVATORY_PERIOD_TRUTH_READABLE=` |

```
PERIOD_FREQUENCY_PROVENANCE = META_PERIOD_FACT | UNKNOWN
```

### How to read the result honestly

**UNKNOWN frequency may be entirely legitimate.** Meta omitting a frequency
for a span is a valid outcome, and the code deliberately does not derive one
from period impressions ÷ reach (see doc 02). A null frequency is therefore
**not** evidence of failure.

**But absence everywhere is.** If both period windows remain entirely absent
after a confirmed successful worker pass, the write/read path did **not** work
and the gate is NOT validated. The minimum proof that the new path functions
end to end is **reach populated for both windows carrying
`META_PERIOD_FACT` provenance**.

Until steps 1 and 2 complete, UNKNOWN is the **correct** live result across the
board and must not be read as a defect.

## GATE A — NIXPACKS_SECRET_GATE (DEPLOYMENT / SECURITY OPERATIONAL GATE)

```
NIXPACKS_SECRET_GATE = OPEN
```

**This is a close gate, not debt.** Doc 15 previously declared
`SECURITY_GAPS = 0` while this same document recorded that `JWT_SECRET` and
`TOKEN_ENCRYPTION_KEY` may be baked into generated image layers. Both cannot
be true. Debt is what ships unfixed; a gate is what must pass first. This is a
gate.

### Where it comes from

**Generated Railway/Nixpacks behaviour, not repository behaviour.** No
`Dockerfile`, no `ARG`/`ENV` in `nixpacks.toml`, no build env in any railway
config; both values are read at runtime only via `env()` in `src/config.ts`.
Railway injects all service variables into the build environment by default,
and Nixpacks' generated Dockerfile emits `ENV` lines that BuildKit lints as
`SecretsUsedInArgOrEnv`. No repository change would fix it, and none was made.

### Exposure

The values are baked into image layers readable by anyone with image access.

```
REQUIRED_RAILWAY_CHANGE =
  prevent JWT_SECRET and TOKEN_ENCRYPTION_KEY from being embedded into the
  generated build image / build ARG / ENV path, while preserving them at
  runtime

SECRET_ROTATION_REQUIRED_IF =
  the affected image layers, registry, or build output were accessible outside
  the trusted team, OR the secret values were surfaced outside the intended
  runtime boundary

VERIFICATION_AFTER_CHANGE =
  a fresh build emits no SecretsUsedInArgOrEnv warnings for these two
  variables; runtime config still reports them present without printing their
  values; and /api/health remains healthy
```

**The remediation mechanism is not proven.** Whether Railway exposes a setting
to scope a variable to runtime only — and what it is called — has not been
confirmed against Railway's own configuration surface, which is unreachable
from this environment. The requirement above states the OUTCOME that must
hold. If no such setting exists, the alternative is moving off Nixpacks'
generated Dockerfile to one that never places these values in a layer. Do not
record this gate as closed on the strength of a mechanism nobody has verified.

Rotation is the containment; the config change only stops recurrence. If the
`SECRET_ROTATION_REQUIRED_IF` condition holds, rotate first.

No secret value has been printed at any point in this investigation.
