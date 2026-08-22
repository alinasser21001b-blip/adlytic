# 15 — Final close gate

```
FINAL_APPLICATION_BEHAVIOR_COMMIT = 4fc27c2
FINAL_REPOSITORY_CANDIDATE_SHA    = 0dbd60b  (last code-bearing commit)

APPLICATION_BEHAVIOR_CLOSE_COMPLETE = YES
REPOSITORY_RELEASE_GATE_COMPLETE    = YES   (gate C closed)
OPERATIONAL_CLOSE_COMPLETE          = NO

CLOSE_CODE_STATUS   = NOT_CLOSED
REMAINING_GATE_COUNT = 3   (A, B, D — all blocked on one missing credential)
```

**`4fc27c2` is now on `main`.** PR #88 merged this branch's
application-behaviour candidate into `main` as `de26b25`. The branch has since
merged `main` back (lineage only — the merge left the tree hash byte-identical),
so it is neither ahead nor behind in content. The four commits `main` lacks are
the gate-C governance and accounting commits.

**The PR #88 merge deployed nothing.** `RAILWAY_TOKEN` is unset, so
`.deploy/railway-deploy.sh` fails by design rather than reporting a phantom
success. No automated deploy has succeeded since 19 August (`751af4bf`). That
one missing secret is the sole blocker for **all three** remaining gates — see
doc 07.

`CODE_CLOSE_COMPLETE = YES` is **not** used, and the distinction is not
cosmetic. The application and intelligence behaviour is complete at `4fc27c2`
and the repository-level engineering gate is now satisfied at `0dbd60b` — but
three **operational** gates remain, and none of them is inside the repository.
Collapsing those into a single "code close complete" would claim readiness the
evidence does not support.

The final repository candidate is `0dbd60b`, not `4fc27c2`. Two commits sit
between them, both governance-only:

| Commit | Change | Application behaviour |
|---|---|---|
| `511883e` | `.github/workflows/test.yml` + a `test_deploy_gate.ts` path-drift guard | none |
| `0dbd60b` | `test_admin_scenarios.mjs` portability; chromium install in CI | none |

`git diff 4fc27c2 0dbd60b -- src/ prisma/ package.json package-lock.json
tsconfig.json` is **empty**. That is the mechanical statement of
`APPLICATION_BEHAVIOR_DIFF_FROM_4FC27C2 = NONE`.

**On the SHA named here.** A document cannot name the SHA of the commit that
contains it. `0dbd60b` is the last commit on this branch that changes any file
the build or test graph reads — source, schema, tests, lockfile, workflow.
Commits after it are documentation-only, and that is checkable rather than
asserted:

```
git diff 0dbd60b HEAD --stat -- ':!docs/'     # empty ⇒ docs-only
```

If that command is empty, `0dbd60b` is still the CI-verified code candidate
however many documentation commits have landed since. If it is **not** empty,
this section is stale and the gate must be re-run. Documentation commits are
themselves CI-covered — `docs/**` is in the workflow's push paths — so they get
their own green run, but they do not move the code candidate.

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
LOCAL_TEST_ALL_RUN_1                 = PASS (885 assertions)
LOCAL_TEST_ALL_RUN_2                 = PASS (885 assertions)
LOCAL_TEST_ALL_IDENTICAL             = YES
CI_TEST_ALL                          = PASS (run 32572081116)
```

The two local runs were re-executed against the **final** repository diff at
`0dbd60b`, not carried over from `4fc27c2`. The count moved 879 → 885 because
gate C added six assertions to `test_deploy_gate.ts` — the path-drift guard
(27 → 33, verified by running the `4fc27c2` copy of that file side by side).
No suite lost or changed an assertion.

**What the number 885 counts.** `test:all` is 46 suites. 885 is the subtotal
reported by the 40 that print the `════ N passed ════` banner — it is not the
whole suite's assertion count, and has never been. Six older suites predate
that convention and report differently:

| Suite | Reports |
|---|---|
| `test:relevance` | `16 passed, 0 failed` |
| `test:offline-reply` | `14 passed, 0 failed` |
| `test:llm-errors` | `7 passed, 0 failed` |
| `test:tenant` | 15 named `✓` assertions, no total |
| `test:refresh` | `all assertions passed`, no count |
| `test:freshness` | `all assertions passed`, no count |

So at least **937** assertions pass, across 46 suites, with two suites' counts
not machine-readable. 885 is kept as the tracked figure because it is the one
that has been compared run-to-run throughout; it is a consistent subtotal, not
a total. Stating it as "885 assertions" without this qualification would
overstate precision and understate coverage at the same time.

Those runs are local. They are no longer the only evidence: the same suite now
runs in CI on a clean runner — see gate C.

```
FINAL_TWO_RUN_VERIFICATION_PENDING = NO
```

The close contract requires two identical full-suite runs against the final
repository diff. Satisfied at `0dbd60b`.

## The gates

Four release gates were opened around **one completed application-behaviour
candidate** — not four architectural defects. One (C, repository governance)
is now closed. Three remain, and all three are **operational**: none of them
can be closed by a repository change, and none is reachable from this build
environment.

```
A. NIXPACKS_SECRET_GATE      = OPEN     (deployment / security)
B. PERIOD_TRUTH_LIVE_GATE    = OPEN     (data migration / live behaviour)
C. CI_GATE                   = CLOSED   (repository governance)
D. FINAL_HEALTH_BUILD_GATE   = OPEN     (deployment / live verification)

OPEN_OPERATIONAL_GATES = 3
SHARED_BLOCKER         = RAILWAY_TOKEN present but NOT AUTHORIZED
```

**Updated 22 Aug after the first live observation** (doc 07 carries the full
readout). The earlier statement here — that nothing had deployed since 19
August — was wrong about the outcome while right about the workflow. Railway's
own GitHub integration deploys independently of `deploy-adlytic.yml`, and
production has been running `de26b25` since 11:39:53Z. The Actions deploy path
has still never once succeeded.

`RAILWAY_TOKEN` is now set, and Railway answers `serviceInstanceDeploy` with
`"Not Authorized"` inside an HTTP 200. The token is present and refused, which
is a different state from absent and a different fix: it needs to be an
**account/personal** token, not a project token.

What the live read settled, and what it did not:

| | |
|---|---|
| production `status`/`db` | `ok` / `ok` |
| production role | `worker`, `runsBackgroundSync=true` — the period-truth writer **is** live |
| production build | `de26b25`, `resolved=true`, branch `main` |
| validation posture | `role=api`, `runsBackgroundSync=false`, `bullmq=disabled` — correct |
| validation build | `bcd6cf4` — an **old** Mission-A commit |
| migration applied | **UNPROVEN** — see doc 07 for why a serving process is not proof |
| period facts | **UNPROVEN** — behind `requirePlatformAdmin`, not readable from CI |

So the three gates are no longer blocked by one thing. A is unchanged and needs
a Railway build log. B needs the admin-authenticated Observatory or the worker
log. D needs production to be running the final candidate, which it is not.

### A. NIXPACKS_SECRET_GATE — *deployment / security operational*

```
NIXPACKS_SECRET_GATE        = OPEN
A1 exposure model           = ANSWERED (exposure itself: UNPROVEN either way)
A2 runtime-only mechanism   = ANSWERED (none at variable scope; builder scope)
A3 rotation decision        = ANSWERED (low-risk path already implemented)
A4 verification build       = BLOCKED (needs a build + a running service)
```

A1–A3 are complete; full detail in doc 07. The three findings that matter:

1. **Exposure is unproven, not proven.** Railway's own position is that
   `SecretsUsedInArgOrEnv` is misleading and the warning has been disabled;
   generic Docker behaviour says `ENV` persists in layers. Deciding between
   them needs image inspection, which is unreachable. Recording "exposed"
   would overstate it; recording "safe" on a forum answer would be worse.
2. **Railway has no per-variable runtime-only flag.** This document previously
   required "exclude these two from the build environment on every service" —
   an outcome Railway does not offer at variable scope. Corrected. The remedy
   is at *builder* scope (Railpack's BuildKit secret mounts, or a Dockerfile),
   which is a build-system migration that cannot be validated from here and so
   was deliberately **not** made.
3. **Rotation is cheaper than assumed.** `TOKEN_ENCRYPTION_KEY` already has a
   dual-key rotation window implemented (`..._PREVIOUS`, `..._VERSION`, a
   per-row generation column, and a tested fallback read path), so rotating it
   is low-risk. `JWT_SECRET` has no dual-secret path — rotating it drops every
   session, which is bounded and non-destructive. One previously undocumented
   caveat is now recorded: **there is no re-encryption sweep**, so
   `..._PREVIOUS` can only be retired once no row remains on the old
   generation.

### B. PERIOD_TRUTH_LIVE_GATE — *data migration / live behaviour operational*

```
PERIOD_TRUTH_LIVE_GATE = OPEN
```

Requires migration → worker deploy → worker sync pass → population proof →
reader deploy → Observatory read. Full evidence ladder in doc 07. A
validation-API deploy alone **cannot** satisfy this: that service is
structurally a reader. `PERIOD_FREQUENCY_PROVENANCE = UNKNOWN` may be
legitimate; both windows absent after a confirmed worker pass is not.

```
B1 migration safety = VERIFIED (CREATE-only: 1 table, 2 indexes; no
                      DROP/ALTER/DELETE/TRUNCATE/UPDATE/RENAME anywhere)
B2 deployment order = PLANNED, and simplified by a re-verification finding
B3–B9              = BLOCKED (need the database and a worker pass)
```

B1 was re-verified mechanically, not by reading: the migration contains exactly
one `CREATE TABLE` and two `CREATE INDEX` and no destructive verb; the reader
degrades to UNKNOWN through a catch-all (`readPeriodFact` → `null`); the writer
upserts on the exact `(entityType, entityId, since, until)` tuple, so replays
are idempotent. `test_period_insight_rollout.ts` 11/11 and
`test_period_metric_semantics.ts` 15/15.

B2 gained a finding that removes a manual step: `railway.json`'s start command
is `npx prisma migrate deploy && node dist/src/api/serve.js`, so the migration
**applies automatically** when the main service next boots a build containing
it. The validation reader and both workers correctly do **not** migrate.

### C. CI_GATE — *repository governance* — **CLOSED**

```
CI_GATE               = CLOSED
CI_WORKFLOW_REQUIRED  = YES
CI_WORKFLOW_PRESENT   = YES  (.github/workflows/test.yml)
CI_RUN_ID             = 32572081116
CI_RUN_STATUS         = completed
CI_RUN_CONCLUSION     = success
CI_GREEN              = YES
CI_HEAD_SHA           = 0dbd60bc450985cb9f6d903b82702a3f09a49e18
```

This gate was `BLOCKED_BY_ABSENCE`, not red. The distinction mattered: there
was no workflow that ran the suite at all, so no run could be produced to pass
or fail. The finding, before the fix:

| Workflow | Trigger | Covers `src/**`? | Runs tests? |
|---|---|---|---|
| `deploy-adlytic.yml` | `push` → `main` | yes — only after merge | **no** (`npm ci`, `prisma generate`, `npm run typecheck`) |
| `platform.yml` | PR/push on `platform/**`, `docs/technical/**`, `docs/product/v3/**` | no | n/a |
| `release-governance.yml` | PR/push on `release-manifest.yaml`, `releases/**`, … | no | n/a |
| `technical-architecture.yml` | PR/push on `docs/technical/**`, … | no | n/a |

A PR to `main` triggered nothing; no `workflow_dispatch` covered `src/**`; and
CI was **fused to production deployment** — the only workflow that ever ran
against `src/**` ran on push-to-main and then called
`.deploy/railway-deploy.sh`. CI evidence could not be obtained without
deploying production. `.github/workflows/test.yml` breaks that fusion: it is
the first workflow in this repository that validates `src/**` **without**
deploying anything.

#### Offline safety, verified before the workflow was written

The suite was run with `DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`,
`ANTHROPIC_BASE_URL`, `PLATFORM_ADMIN_EMAILS`, `RAILWAY_GIT_COMMIT_SHA`, every
API key and **every proxy variable** stripped from the environment: **879
assertions, 0 failures**. No suite silently depends on live infrastructure, so
none had to be weakened, mocked down, or skipped to make CI pass. That was a
precondition of the gate, not a consequence of it.

#### The gate earned its place on its first run

Run **32571812135** (`511883e`) **failed** — after two identical local
full-suite passes. `test_admin_scenarios.mjs` carried two absolute paths that
existed only on the machine it was written on:

```
cwd: '/home/user/adlytic'
executablePath: '/opt/pw-browsers/chromium'
```

It could pass there and nowhere else. The failure was also misleading:
`spawnSync` against a non-existent `cwd` reports `ENOENT` against `/bin/sh`,
which reads as a broken shell rather than a bad directory.

Fixed as portability, not by lowering the bar — `process.cwd()`, and the
browser executable pinned only where that path genuinely exists. **25/25
assertions before and after; not one changed.** The suite drives the shipped
admin page in a real browser to assert that two different incidents read
differently to an operator; that boundary needs a DOM, so CI installs chromium
rather than the test being reduced to markup matching.

This is the one permissible exception the gate-C brief anticipated: a
test-harness-only fix, proven necessary by a real CI failure.

#### What the passing run actually proves

All eight steps green; `npm run test:all` ran 40s (12:07:26 → 12:08:06 UTC).
`test:all` is 46 npm scripts joined by `&&` — strictly fail-fast — and its
final link, `test:admin-scenarios`, ran and reported `25 passed, 0 failed`.
A green tick on the last link of a fail-fast chain is proof every prior link
executed and passed, not merely that nothing errored.

Cross-environment determinism spot-checked on the three suites whose CI counts
are directly readable: `probe-discovery` 44, `dependency-drift` 9,
`admin-scenarios` 25 — identical locally and in CI, browser suite included.

```
CI_TRIGGERS   = pull_request + push to claude/brain-admin-v2-integration
CI_STEPS      = checkout → setup-node@22 → npm ci → prisma generate
                → typecheck → playwright install chromium → test:all
CI_DEPLOYS    = NOTHING
```

`test_deploy_gate.ts` gained a drift guard (+6 assertions, 27 → 33) asserting
that the workflow's `pull_request` and `push` path lists are identical and that
every path any suite reads is covered — so a future path added to one trigger
and not the other fails the suite rather than silently narrowing CI. It was
negative-tested: removing `docs/**` from the push list alone fails it.

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
Re-verified, not carried over — both endpoints were retested and both still
return 403, and `RAILWAY_TOKEN`, `DATABASE_URL`, `JWT_SECRET` and
`TOKEN_ENCRYPTION_KEY` are all absent from this environment.

```
D5 CI + local verification = DONE (the one part of gate D not needing live access)
D1–D4, D6                  = BLOCKED
```

Must confirm: `status=ok`, `db=ok`, `role=api`, `runsBackgroundSync=false`,
`bullmq=disabled`, `build.resolved=true`, `build.shortCommit` = the final
repository candidate, `build.branch=claude/brain-admin-v2-integration`; the
admin console loads and authenticates; the Observatory is reachable **from the
navigation**, not just by URL; decision ownership, Action Authority and the
narration-only LLM pane read correctly; temporal UNKNOWN semantics stay honest.

## Order

1. ~~**C** — governance commit adding the CI workflow~~ — done, `511883e` → `0dbd60b`
2. ~~**C** — CI green on that candidate~~ — done, run `32572081116`
3. ~~**C** — two identical `test:all` runs against the final repository diff~~ — done, 885 × 2
4. **A** — Railway build-secret exposure resolved or proven safe
5. **B** — migration → worker → population proof
6. **D** — deploy the final candidate, read `/api/health`

Steps 1–3 are complete. Gate A is independent and may run in parallel. B
cannot complete before its migration and worker steps. D is last by
construction and must verify `build.shortCommit` against the final repository
candidate, **not** `4fc27c2`.

### Step 0, which precedes all of A, B and D

```
PREREQUISITE = a working deploy path
```

Nothing in A, B or D can start until one of these is true:

1. the GitHub repository secret **`RAILWAY_TOKEN`** is set (Railway account
   token, "No Team"), after which the deploy workflow can be re-run; **or**
2. someone deploys by hand — Railway UI → service → **Deploy Latest Commit** —
   and confirms `GET /api/health` reports the expected commit.

This is a single credential in GitHub's secret store. It must not be pasted
into a chat, a source file, or a document — including this one. Once a deploy
succeeds, the remaining gates run in the order above, and every piece of
evidence each one needs is already specified per-gate.

Everything in A, B and D that did **not** require live access is finished:
A1/A2/A3 (doc 07), B1/B2 (doc 07), and D5 (below). What remains is
observation, not engineering.
