# 07 — Security and deployment closure

```
CURRENT_HEAD_SECRET_SCAN = CLEAN (test_no_committed_secrets, 6 assertions)
TOKEN_URL_RISK           = CLOSED (one call site fixed — see doc 06)
VALIDATION_MIGRATION_RISK = CLOSED
BUILD_IDENTITY_SAFE      = YES
SERVICE_ROLE_SAFE        = YES
SECURITY_GAPS            = 0 in repository code; 0 operational gates OPEN
SECRET_EXPOSURE_PROVEN   = NO (unproven either way — A1)
ROTATION_MECHANISM       = already implemented for TOKEN_ENCRYPTION_KEY (A3)
NIXPACKS_SECRET_GATE     = CLOSED — measured on the candidate's own build:
                           0 SecretsUsedInArgOrEnv, builder Dockerfile (doc 16 §2)
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
PERIOD_TRUTH_LIVE_GATE = CLOSED
```

Closed live, and then re-checked against the final candidate `4fcdad5` rather
than assumed to survive it: `period facts: 14/200 stored`, `full sync done`,
`PERIOD_INSIGHT_WRITE_PATH_EXECUTED=YES`, `UNAVAILABLE_OR_FAILED=0`. Evidence
and the first (correctly UNOBSERVED) read are in doc 16 §8.

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

### LIVE EVIDENCE — 22 Aug 2026, CI run 32575215184 / 32575346317

First real observation of the running system. Obtained through a read-only
GitHub Actions job (`verify-live.yml`) because this environment cannot reach
Railway; the Actions log is the record.

**Production service — `adlytic-production`**

```
status              = ok
db                  = ok
role                = worker
runsBackgroundSync  = true
bullmq              = enabled
build.resolved      = true
build.commit        = de26b25290c755be1d5bc9668f6bfe48fd0c899c
build.branch        = main
build.message       = "Merge pull request #88 …"
bootedAt            = 2026-08-22T11:39:53Z
```

**Validation service — `adlytic-brain-validation`**

```
status              = ok
db                  = ok
role                = api          ✓ reader
runsBackgroundSync  = false        ✓ not competing for the sync lock
bullmq              = disabled     ✓
build.shortCommit   = bcd6cf4      ✗ OLD — a Mission-A commit, booted 01:09Z
build.branch        = claude/brain-admin-v2-integration
```

Three findings that change the operational picture:

**1. Railway deploys itself; the Actions workflow has never succeeded.**
Production booted `de26b25` at **11:39:53Z** — about fifty seconds *after*
deploy run #143 failed at 11:39:40Z. Railway's own GitHub integration did that,
independently of `deploy-adlytic.yml`. Every "no deploy has happened since
19 August" conclusion drawn from the Actions history was wrong about the
*outcome* while being right about the *workflow*: the workflow genuinely never
deployed anything, but the platform did.

**2. `RAILWAY_TOKEN` is set but NOT AUTHORIZED.**

```
HTTP 200
{"errors":[{"message":"Not Authorized","path":["serviceInstanceDeploy"]}],"data":null}
```

The token reached Railway and Railway refused the mutation. `railway-deploy.sh`
caught it exactly as designed — a GraphQL error inside an HTTP 200 is the
precise false-success shape that script exists to reject, and it did.
Railway distinguishes **project** tokens (different header, cannot trigger
deploys) from **account/personal** tokens (`Authorization: Bearer`, can). The
symptom matches a project token being used where an account token is required.
The script's own error text already says "Railway account token, No Team".

**3. Production is `role=worker` with `runsBackgroundSync=true`.** So the
service that serves the public API is also the one running
`backgroundScheduler`, which is what calls `syncPeriodInsightsForAccount`. The
period-truth writer is therefore live and has been running since 11:39Z — the
Gate B question "is there anything that would ever write these rows" is
answered YES, by observation rather than by reading config.

### What this does NOT prove

`MIGRATION_APPLIED` is **UNPROVEN**, not YES. The reasoning that tempts a YES:
`railway.json`'s start command is `npx prisma migrate deploy && node …`, so a
serving process implies the migration succeeded. The reason that is not
sufficient: a Railway service can override its start command in the dashboard,
and this one demonstrably carries dashboard-set variables (`SERVICE_ROLE=worker`
appears nowhere in the repo). So the service may not be running that command at
all. A booted service with `db=ok` is consistent with *both* "migration applied"
and "this service never migrates". Recording YES here would be inference
dressed as observation.

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

## GATE A — BUILD_SECRET_GATE (DEPLOYMENT / SECURITY OPERATIONAL GATE)

```
BUILD_SECRET_GATE = repository fix landed; awaiting one fresh build
```

> **Read A5 first.** Everything from "Where it comes from" down to A4 was
> written while the exposure could only be reasoned about, and it reached the
> conclusion that "no repository change would fix it". A5 records the
> measurement that became available afterwards, and the repository change that
> does fix it. Where the two disagree, A5 is current.

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

### A4 — Gate state *(superseded by A5; the state below is historical)*

```
NIXPACKS_SECRET_GATE = OPEN      ← as it stood then. Now CLOSED — doc 16 §2.
```

Exact blocker recorded at the time: **closing A4 requires a build and a running
service, and this environment has neither.** Railway's control plane and the
deployed services return 403 CONNECT at the egress proxy; there was no Railway
CLI, no `RAILWAY_TOKEN`, and no service credentials.

A1, A2 and A3 were complete and were the parts answerable then. No secret value
has been printed at any point in this investigation.

---

### A5 — Measured, then fixed

**The blocker A4 named is gone.** `RAILWAY_TOKEN` is configured, and
`verify-live.yml` now reads the build log of the running deployment. Two
properties make that safe to do at all: the field is proven by `__schema`
introspection before it is called — querying a guessed name returns an error
whose empty result would read as "0 warnings", which is the false clean this
whole programme exists to prevent — and the output is reduced to bare
identifiers captured from inside the warning's own quotes, so no log line can
reach a public Actions log.

Measurement against the build of `094a37b`:

```
RAILWAY_SCHEMA_INTROSPECTION            = OK
BUILD_LOG_FIELD_PROVEN                  = buildLogs
BUILD_LOG_LINES_READ                    = 120
SECRETS_USED_IN_ARG_OR_ENV_WARNINGS     = 16
SECRET_NAMES_FLAGGED_COUNT              = 8
BUILDER_OBSERVED                        = Nixpacks
GATE_A_BUILD_WARNING_STATE              = SECRETS_IN_BUILD_ENV
```

The eight names, printed by the job and reproduced here because names are not
secrets: `ANTHROPIC_API_KEY`, `JWT_SECRET`, `META_APP_SECRET`,
`META_SYSTEM_USER_TOKEN`, `META_VERIFY_TOKEN`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY`. Sixteen warnings over eight
names is one `ARG` and one `ENV` each. `ENV` persists into the image
configuration, so the VALUES remain readable from the image by anyone who can
pull it, long after the build ended. A successful deployment says nothing about
that, and this is treated as exposure rather than as a lint nit.

**The build needs none of them.** `npm run build` is `prisma generate && tsc`.
Run with all eight unset, plus `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`
and `META_APP_ID`, it exits 0.

**A4's conclusion that no repository change could fix this was wrong**, and the
reason it was wrong is worth keeping: it assumed the builder was fixed. It is
not — it is declared in `railway.json`.

```
BUILD_SECRET_FIX = repository-owned Dockerfile, DOCKERFILE builder on all
                   seven railway configs
```

Why a Dockerfile rather than another builder: Railway's documentation is
unreachable from here (403 at the egress proxy), so no claim about Railpack's
variable handling could be proven, and switching to a builder whose behaviour
cannot be verified is exactly the blind swap to avoid. Docker's own semantics
need no external source — **a build argument reaches a build only if the
Dockerfile declares `ARG` for it.** This one declares none, so the exposure is
structurally impossible rather than merely unused, and that property is
checkable in the repository.

Verified without a Docker daemon by running the image's own sequence against a
clean copy of the build context: `npm ci --omit=dev --ignore-scripts` (233
packages) then `npm run build`, exit 0 with every credential stripped;
`dist/src/api/serve.js` produced; the generated Prisma client, the `prisma` CLI
and `tsx` all present in the prod-only tree; and the artefact boots far enough
to run config validation and fail on exactly the four variables it should.

`NODE_ENV=production` is set deliberately in the image. `config.ts` computes
`IS_PRODUCTION = NODE_ENV !== 'development' && NODE_ENV !== 'test'` over a
value that DEFAULTS to `'development'`. Nixpacks supplied `NODE_ENV`; a plain
node base image does not — so omitting it would have quietly downgraded the
prod-fatal `JWT_SECRET` / `TOKEN_ENCRYPTION_KEY` / `DATABASE_URL` /
`ALLOWED_ORIGINS` checks to warnings. That is a fail-open this cycle
introduced and closed in the same change; the smoke run shows them firing as
errors.

Mechanically guarded in `test_deploy_gate.ts` §8: no `ARG`, no
credential-shaped `ENV`, `NODE_ENV` present, `.dockerignore` still excluding
`.env`, and no railway config allowed to name `NIXPACKS` again — in both the
JSON and TOML spellings. `nixpacks.toml` is kept as a fallback and now says so
in its own header, because a deploy that actually uses it is a Gate-A
regression rather than a neutral default.

**What remains for A5** is one observation, not one decision:

```
closing condition:  SECRETS_USED_IN_ARG_OR_ENV_WARNINGS = 0
                    BUILDER_OBSERVED                    = Dockerfile
                    /api/health still ok, db ok, build.resolved true
```

Both come from the same deployment Gate D needs, read by the same read-only
workflow that produced the measurement above.

**On rotation.** The eight values were present in image configuration for the
life of every Nixpacks build. Eliminating future exposure is done. Deciding
which credentials must actually be rotated is A3, and the part of it that
cannot be done from here is stated there rather than performed: Meta and Stripe
credentials rotate in their own provider consoles, and `TOKEN_ENCRYPTION_KEY`
must not be rotated without the two-key procedure in the audit conventions, or
every stored Meta token becomes undecryptable. No secret value has been
printed, logged, or committed at any point.
