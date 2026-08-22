# 15 — Final close gate

```
FINAL_APPLICATION_BEHAVIOR_COMMIT = 4fc27c2
FINAL_REPOSITORY_CANDIDATE_SHA    = PENDING (gate C will change it)

APPLICATION_BEHAVIOR_CLOSE_COMPLETE = YES
REPOSITORY_RELEASE_GATE_COMPLETE    = NO
OPERATIONAL_CLOSE_COMPLETE          = NO

CLOSE_CODE_STATUS   = NOT_CLOSED
REMAINING_GATE_COUNT = 4
```

`CODE_CLOSE_COMPLETE = YES` is **not** used, and the distinction is not
cosmetic: the application and intelligence behaviour is complete at `4fc27c2`,
but the repository still lacks a CI workflow able to execute the real suite
for `src/**` changes. Saying code close is complete would imply every
repository-level engineering gate is already satisfied. One is not.

## What is verified

```
ARCHITECTURAL_AUTHORITY_MAP_COMPLETE = YES
DATA_VALIDITY_OVERCLAIM              = 0
PERIOD_METRIC_SEMANTICS_AUDITED      = YES
UNEXPLAINED_DECISION_AUTHORITY_GAPS  = 0
LLM_CAN_OVERRIDE_CANONICAL_DECISION  = NO
LLM_CAN_CREATE_CANONICAL_EVIDENCE    = NO
META_CORDON_BYPASSES                 = 0
DUPLICATE_INTELLIGENCE_AUTHORITIES   = 0
DUPLICATE_CRITICAL_PERSISTENCE_OWNERS = 0
CURRENT_HEAD_CONTAINS_NO_LIVE_SECRET = YES
TOKEN_IN_URL_PATHS                   = 0
VALIDATION_MIGRATION_RISK            = CLOSED
ADMIN_INFORMATION_ARCHITECTURE_COMPLETE = YES
ADMIN_DUPLICATE_TRUTH_SURFACES       = 0
ADMIN_AUTHORIZATION_GAPS             = 0
ADMIN_DESTRUCTIVE_ACTION_SAFETY      = PASS
OBSERVATORY_READ_ONLY                = YES
OBSERVATORY_REDERIVES_INTELLIGENCE   = NO
TYPECHECK                            = PASS
TARGETED_TESTS                       = PASS
LOCAL_TEST_ALL_RUN_1                 = PASS (879 assertions)
LOCAL_TEST_ALL_RUN_2                 = PASS (879 assertions)
LOCAL_TEST_ALL_IDENTICAL             = YES
```

Those two runs are **local**, not CI. Labelled as such deliberately — see
gate C.

```
FINAL_TWO_RUN_VERIFICATION_PENDING = YES
```

The close contract requires two identical full-suite runs against the **final
repository diff**. The gate-C commit will change that diff, so the pair must be
re-run against the final repository candidate before closure. This documentation
commit does not waive that invariant; it records that it is still outstanding.

## The four remaining gates

Four operational and governance release gates around **one completed
application-behaviour candidate**. Not four architectural defects.

### A. NIXPACKS_SECRET_GATE — *deployment / security operational*

```
NIXPACKS_SECRET_GATE = OPEN
```

`JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` may be baked into generated image
layers. Platform-generated, not repository behaviour — no repository change
fixes it. Requirement, rotation condition and verification in doc 07. The
remediation **mechanism is not proven**: Railway's configuration surface is
unreachable from here, so the gate states the required outcome, not a setting
someone assumes exists.

### B. PERIOD_TRUTH_LIVE_GATE — *data migration / live behaviour operational*

```
PERIOD_TRUTH_LIVE_GATE = OPEN
```

Requires migration → worker deploy → worker sync pass → population proof →
reader deploy → Observatory read. Full evidence ladder in doc 07. A
validation-API deploy alone **cannot** satisfy this: that service is
structurally a reader. `PERIOD_FREQUENCY_PROVENANCE = UNKNOWN` may be
legitimate; both windows absent after a confirmed worker pass is not.

### C. CI_GATE — *repository governance* (inside the repository)

```
CI_GATE               = BLOCKED_BY_ABSENCE
CI_WORKFLOW_REQUIRED  = YES
CI_WORKFLOW_PRESENT   = NO
CI_GREEN              = UNOBTAINABLE_UNTIL_WORKFLOW_EXISTS
```

**No workflow runs the test suite.** Investigated, not assumed:

| Workflow | Trigger | Covers `src/**`? | Runs tests? |
|---|---|---|---|
| `deploy-adlytic.yml` | `push` → `main` | yes — only after merge | **no** (`npm ci`, `prisma generate`, `npm run typecheck`) |
| `platform.yml` | PR/push on `platform/**`, `docs/technical/**`, `docs/product/v3/**` | no | n/a |
| `release-governance.yml` | PR/push on `release-manifest.yaml`, `releases/**`, … | no | n/a |
| `technical-architecture.yml` | PR/push on `docs/technical/**`, … | no | n/a |

Three consequences:

1. **A PR to `main` would trigger nothing.** No `pull_request` trigger matches
   this candidate's paths, so opening one produces no run. It is not the
   repository's normal CI trigger for this code.
2. **No `workflow_dispatch` covers `src/**`.** The three that have one cover
   paths this candidate does not touch.
3. **CI and production deployment are fused.** The only workflow that ever
   executes against `src/**` runs on push-to-main and then calls
   `.deploy/railway-deploy.sh`. CI evidence cannot be obtained without
   deploying production — precisely what must not happen before these gates
   pass. This coupling is a finding in its own right.

`CI_GREEN` is therefore not red; it is **unobtainable**.

#### Required close-gate change (not a recommendation)

One later **governance-only** commit adding `.github/workflows/test.yml`:

```yaml
on:
  pull_request:
  push:
    branches:
      - claude/brain-admin-v2-integration
```

covering at minimum `src/**`, `prisma/**`, `test_*.ts`, `package.json`,
`package-lock.json`, `tsconfig*.json`, and any other path that materially
affects the test or build graph. Executing:

```
npm ci
npx prisma generate
npm run typecheck
npm run test:all
```

Triggers must allow validation **before** merge to main. That commit does not
change application behaviour, but it **will change the final repository
candidate SHA** — which is why `FINAL_REPOSITORY_CANDIDATE_SHA` is PENDING and
the two-run verification must be repeated afterwards.

Deliberately **not** added in the accounting commit, which is documentation
only.

### D. FINAL_HEALTH_BUILD_GATE — *deployment / live verification*

```
FINAL_HEALTH_BUILD_GATE                 = OPEN
FINAL_VALIDATION_SERVICE_HEALTHY        = UNKNOWN
FINAL_VALIDATION_SERVICE_BUILD_IDENTITY = UNKNOWN
```

Requires a Railway deploy of the final repository candidate and a
`/api/health` read. Railway is unreachable from the build environment:
`backboard.railway.app:443` returns a 403 CONNECT policy denial, there is no
CLI and no credentials, and the service URL is blocked by the same policy.

Must confirm: `status=ok`, `db=ok`, `role=api`, `runsBackgroundSync=false`,
`bullmq=disabled`, `build.resolved=true`, `build.shortCommit` = the final
repository candidate, `build.branch=claude/brain-admin-v2-integration`; the
admin console loads and authenticates; the Observatory is reachable **from the
navigation**, not just by URL; decision ownership, Action Authority and the
narration-only LLM pane read correctly; temporal UNKNOWN semantics stay honest.

## Order

1. **C** — governance commit adding the CI workflow (new repository candidate SHA)
2. **C** — CI green on that candidate
3. **C** — two identical `npm run test:all` runs against the final repository diff
4. **A** — Railway build-secret exposure resolved or proven safe
5. **B** — migration → worker → population proof
6. **D** — deploy the final candidate, read `/api/health`

Gate A is independent and may run in parallel. B cannot complete before its
migration and worker steps. D is last by construction.
