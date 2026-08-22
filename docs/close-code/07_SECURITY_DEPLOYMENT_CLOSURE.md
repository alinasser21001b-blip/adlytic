# 07 — Security and deployment closure

```
CURRENT_HEAD_SECRET_SCAN = CLEAN (test_no_committed_secrets, 6 assertions)
TOKEN_URL_RISK           = CLOSED (one call site fixed — see doc 06)
VALIDATION_MIGRATION_RISK = CLOSED
BUILD_IDENTITY_SAFE      = YES
SERVICE_ROLE_SAFE        = YES
SECURITY_GAPS            = 0 in repository code; 1 operational gate OPEN
SECRET_EXPOSURE_PROVEN   = NO (unproven either way — A1)
ROTATION_MECHANISM       = already implemented for TOKEN_ENCRYPTION_KEY (A3)
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

### How the migration actually applies — and what is blocking everything

Two findings from re-verifying the live path, both of which change the plan:

**1. The migration needs no separate manual step on the main service.**
`railway.json`'s start command is:

```
npx prisma migrate deploy && node dist/src/api/serve.js
```

So `20260822120000_add_period_insights` applies automatically the next time the
**main** service boots a build containing it. Steps 1 and 2 of
`SAFE_DEPLOYMENT_ORDER` collapse into a single deploy for that service. Note
the correct exclusions are already in place: `railway.validation.json` runs
`node dist/src/api/serve.js` with **no** migrate — the validation reader must
never migrate the shared production database — and neither worker config
migrates either.

**2. Nothing has deployed since 19 August, and that is the real blocker.**
`RAILWAY_TOKEN` is not set as a GitHub secret. `.deploy/railway-deploy.sh`
fails deliberately when it is absent — a guard added precisely so a green
deploy job cannot mean a deploy that never happened. Consequently:

| Deploy run | Commit | Result |
|---|---|---|
| #143 | `de26b25` (PR #88 merge) | **failure** — `RAILWAY_TOKEN is not set` |
| #142 | `7846f97` (PR #87 merge) | failure — same |
| #141, #139 | — | failure — same |
| #138 | `751af4bf` (19 Aug) | last **successful** deploy |

**PR #88 merged the whole application-behaviour candidate `4fc27c2` into main
and deployed nothing.** Production is still running whatever `751af4bf` (or a
later hand-deploy) left there. This single missing secret blocks gate A's
verification build, gate B's migration and worker pass, and all of gate D.

Neither the token nor any other credential is requested here, and none should
be pasted into a chat or a source file. The remedy is one of:

1. set the GitHub repository secret `RAILWAY_TOKEN` (Railway account token,
   "No Team"), then re-run the deploy workflow; or
2. deploy by hand — Railway UI → the service → **Deploy Latest Commit** —
   then confirm `GET /api/health` reports the expected commit.

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

### A1 — Exposure model

Investigated against Railway/Nixpacks behaviour and this repository's own build
configuration. **Evidence grade is stated per line, because it differs.**

```
NIXPACKS_EXPOSURE_MODEL     = Railway injects ALL service variables into the
                              build environment; Nixpacks' generated Dockerfile
                              surfaces them as ARG/ENV, which BuildKit lints as
                              SecretsUsedInArgOrEnv
FINAL_IMAGE_SECRET_EXPOSURE = NOT PROVEN EITHER WAY (see below)
BUILD_LOG_SECRET_EXPOSURE   = warning names the variable, not its value;
                              no value was observed in any build log
RUNTIME_SECRET_PATH         = independent of the image — Railway injects
                              service variables into the running container;
                              config.ts reads them via env() at boot
```

Two things are established from the repository itself and need no vendor
assurance: `nixpacks.toml` declares **no `[variables]` block**, and no railway
config sets build env — so the repository never places these values anywhere.
They arrive purely from Railway's service-variable injection. And they are
read only at runtime: `env('JWT_SECRET')` / `env('TOKEN_ENCRYPTION_KEY')` in
`src/config.ts`. **No build step needs either value**, which is what makes a
build/runtime split viable at all.

`FINAL_IMAGE_SECRET_EXPOSURE` is recorded as **not proven** rather than as
"exposed" or "safe", and the distinction is deliberate:

- Railway's own position is that `SecretsUsedInArgOrEnv` is *"extremely
  misleading"* and the warning **has since been disabled** on the platform;
  passing secrets through Railway Variables is the intended mechanism.
- Generic Docker behaviour is that `ENV` values persist in image layers and
  appear in `docker inspect`. Whether Railway's Nixpacks pipeline actually
  emits `ENV` for injected service variables — rather than a build-time-only
  `ARG` — was **not confirmable from here**.

Deciding between those requires inspecting a built image. Railway's control
plane, its registry, and the running services are all unreachable from this
environment (403 CONNECT at the egress proxy), there is no Railway CLI and no
credentials. Recording "exposed" would overstate; recording "safe" on a vendor
forum answer would be worse. It is **unproven**, and that is the honest state.

**Evidence limitation, stated plainly.** Railway and Railpack documentation
domains (`docs.railway.com`, `blog.railway.com`, `railpack.com`,
`station.railway.com`) are all egress-blocked. The vendor statements above come
from *search-result summaries* of those pages, not from pages read directly.
They are second-hand and should be re-verified by a human with browser access
before being treated as decisive.

### A2 — Runtime-only mechanism

```
RAILWAY_RUNTIME_ONLY_SECRET_SUPPORTED = NO (no per-variable build/runtime split)
EXACT_MECHANISM                       = none at variable scope; the remedy is
                                        at BUILDER scope
REPOSITORY_CHANGE_REQUIRED            = YES if the builder is switched
                                        (railway*.json "builder")
DEPLOYMENT_CONFIG_CHANGE_REQUIRED     = YES (Railway service must accept the
                                        builder change)
```

Railway documents that **all service variables are available during both the
build step and at runtime**. There is no documented per-variable "runtime only"
flag, and none should be invented. The earlier `REQUIRED_RAILWAY_CHANGE` in
this document — "exclude these two from the build environment on every
service" — described an outcome Railway does not appear to offer at variable
scope. It is corrected here.

The remedy is therefore at builder scope. Two candidates:

| Option | Mechanism | Cost |
|---|---|---|
| **Railpack** (`"builder": "RAILPACK"`) | Uses BuildKit **secret mounts**; secrets are not written to build logs or the final image | Build-system migration; `nixpacks.toml` stops applying |
| **Dockerfile** (`"builder": "DOCKERFILE"`) | We control every layer; never `ENV` a secret | We own the whole build |

All four configs — `railway.json`, `railway.worker.json`,
`railway.sync-worker.json`, `railway.validation.json` — currently pin
`"builder": "NIXPACKS"`. Railway's current schema documents **RAILPACK
(default) or DOCKERFILE**; Nixpacks is the superseded builder.

**Not changed here, deliberately.** Switching the builder alters how every
service is built, and it cannot be validated from this environment — no
Railway access means no way to confirm the resulting image boots, resolves
Node 22 and OpenSSL, and still runs `prisma migrate deploy`. Pushing an
unvalidatable build-system change onto the production service trades a
*possible* secret-in-layer risk for a *certain* deployment risk. That is a
worse trade, and it is the user's call, not one to make silently.

### A3 — Rotation decision

```
JWT_ROTATION_REQUIRED                  = CONDITIONAL (see trigger below)
TOKEN_ENCRYPTION_KEY_ROTATION_REQUIRED = CONDITIONAL (same trigger)
ROTATION_RISK                          = LOW for TOKEN_ENCRYPTION_KEY
                                         (dual-key path already implemented)
                                         MODERATE for JWT_SECRET
                                         (no dual-secret path — all sessions drop)
```

Rotation trigger, unchanged and unmet-so-far: rotate if image layers or the
registry were reachable outside the team, if a build log surfaced a value, or
if exposure cannot be bounded. Because A1 is **unproven**, "cannot be bounded
confidently" is arguably satisfied — so rotation is a defensible precaution
even though no exposure has been demonstrated. What follows makes that cheap.

**`TOKEN_ENCRYPTION_KEY` — rotation is already engineered.** It encrypts Meta
access tokens (AES-256-GCM) in two tables: `AdAccount.access_token_encrypted`
and `MetaConnection.access_token_encrypted`. The codebase **already implements
a dual-key rotation window**:

| Variable | Role |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | the new key; all new writes use it |
| `TOKEN_ENCRYPTION_KEY_PREVIOUS` | the outgoing key; still used for reads |
| `TOKEN_ENCRYPTION_KEY_VERSION` | generation stamped onto each row written |

`decryptToken` tries the current key, and on failure falls back to the previous
key, logging `[adlytic:TOKEN_KEY_ROTATION]`. Migration
`20260810090000_add_token_key_version` added the per-row generation column, and
`test_token_encryption.ts` exercises the two-key path directly.

So `SAFE_ROTATION_PLAN` for this key is genuinely low-risk — **but one caveat
matters and is not currently written down anywhere:**

> **There is no re-encryption sweep.** Rows migrate to the new key only when
> something rewrites them — a token refresh (`refreshMetaTokens.ts`), a
> reconnect, or an account write. Any workspace whose token is never rewritten
> stays on the old key indefinitely. `TOKEN_ENCRYPTION_KEY_PREVIOUS` therefore
> cannot be safely unset on a timer; it can only be unset once no row remains
> on the old generation. `access_token_key_version` is exactly the column that
> can prove it — but nothing currently queries it for that purpose.

Rotating **without** setting `..._PREVIOUS` does not corrupt anything: reads
raise a distinct `TokenDecryptError` (never mistaken for a Meta 190 expiry) and
the product routes the operator to `/workspace?connect=manual`. Every workspace
would have to re-paste a token. Recoverable, but user-visible and avoidable.

**`JWT_SECRET` — no dual-secret path.** `verifyToken` verifies against
`getJwtSecret()` alone; there is no previous-secret fallback. Rotating it
invalidates **every outstanding session immediately** — tokens are signed with
`expiresIn: '7d'`, so without rotation the natural drain is up to seven days.
Impact is bounded and non-destructive: users log in again. No data is at risk.
Schedule it for a low-traffic window; nothing else is required.

```
SAFE_ROTATION_PLAN =
  TOKEN_ENCRYPTION_KEY:
    1. generate a new 32-byte key (openssl rand -hex 32)
    2. set TOKEN_ENCRYPTION_KEY_PREVIOUS = the current key
       set TOKEN_ENCRYPTION_KEY          = the new key
       set TOKEN_ENCRYPTION_KEY_VERSION  = current + 1
       — all three together, on EVERY service that reads tokens
    3. redeploy; confirm the boot log's key fingerprint changed
    4. let refreshMetaTokens migrate rows; watch for
       [adlytic:TOKEN_KEY_ROTATION]
    5. unset ..._PREVIOUS only once no row remains on the old
       access_token_key_version
  JWT_SECRET:
    1. generate a distinct value (must NOT equal META_APP_SECRET — config.ts
       fails that case explicitly)
    2. set it on all services at once, redeploy, accept one forced re-login
```

### A4 — Gate state

```
NIXPACKS_SECRET_GATE = OPEN
```

Exact blocker: **closing A4 requires a build and a running service, and this
environment has neither.** Railway's control plane and the deployed services
return 403 CONNECT at the egress proxy; there is no Railway CLI, no
`RAILWAY_TOKEN`, and no service credentials. A4's closure conditions — a fresh
build emitting no `SecretsUsedInArgOrEnv` for these two variables, runtime
config still resolving them, `/api/health` still healthy — are all live
observations.

A1, A2 and A3 are complete and are the parts that were actually answerable.
No secret value has been printed at any point in this investigation.
