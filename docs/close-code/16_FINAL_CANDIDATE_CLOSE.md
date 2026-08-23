# 16 — Close gate on the final candidate

```
CANDIDATE                 = 4fcdad57f7fbab7645a56aa3e23d219a4ef20997  (main)
PREVIOUS_CLOSE_GATE_DOC   = 15  (candidate at that time: 853dc44)
TRACK_A_BRANCH            = claude/adlytic-graphify-analysis-ai34bu
```

Doc 15 left two gates open and named one blocker for both: Railway's build
queue had stopped moving, so the single observation Gates A and D each needed
could not be taken. **That blocker cleared.** This document records what was
then observed, and what is still not.

---

## 1. The sync

The Track-A branch was **0 ahead / 7 behind** main: every commit on it —
PRs #100, #101, #102, #103 — was already merged. Merging `origin/main` into it
was therefore a fast-forward. No reset, no force-push, and nothing to discard.

```
MAIN_SYNC_CONFLICTS  = 0   (fast-forward; no divergence existed)
SEMANTIC_CONFLICTS   = 0
```

Zero semantic conflicts is a statement about *this* sync, not a claim that the
tracks never collided. They did, once, and it was resolved in the Admin branch
before #104 merged: main had renamed `temporal.legacyDataStatus` /
`legacyDataBasis` to `dataConfidence` / `dataConfidenceBasis`, and the Admin
branch had restructured the same file, so git merged the text cleanly while
leaving the surface reading fields that no longer existed. It was resolved by
taking **main's** semantics inside the restructured file — the canonical
producer was not touched.

The relationship that resolution established is the one to preserve:
`brainObservatoryPage.ts` renders `tp.dataConfidence` and
`tp.dataConfidenceBasis` **verbatim**, and `test_brain_observatory.ts` requires
the shipped prose to name the basis field. The Admin surface consumes canonical
Track-A truth; it does not re-derive it.

---

## 2. Gate A — build-secret exposure · **CLOSED**

Observed on the final candidate's own build log, through the read-only path
`verify-live.yml` establishes (field proven by `__schema` introspection before
being called; output reduced to variable NAMES, never log text):

```
runs 34 and 36 · 2026-08-22T23:53Z and 2026-08-23T00:11Z
deployment 41c517af · commit 4fcdad5 · identical both times

BUILD_LOG_FIELD_PROVEN               = buildLogs
RAILWAY_BUILD_LOG_READ               = OK
BUILD_LOG_LINES_READ                 = 99
SECRETS_USED_IN_ARG_OR_ENV_WARNINGS  = 0
SECRET_NAMES_FLAGGED_COUNT           = 0
BUILDER_OBSERVED                     = Dockerfile
GATE_A_BUILD_WARNING_STATE           = CLEAN
```

The measurement that opened this gate was 16 warnings over 8 credentials on a
Nixpacks build. The candidate builds on the repo-owned Dockerfile, which
declares no `ARG`, and the warning count is zero. Repository-side conditions
were already enumerated and guarded in doc 15; this is the platform-side
observation they were waiting for.

---

## 3. Gate D — final health and build identity · **CLOSED**

```
41c517af-3597-4bc9-b486-8a70d81adbc9  SUCCESS  2026-08-22T23:45:13Z  4fcdad5
f1a1ccdc-b464-4815-ba97-e1c4fd4f6835  REMOVED  2026-08-22T23:18:38Z  853dc44

DEPLOYMENTS_QUEUED   = 0 (of 25 most recent)
DEPLOYMENTS_BUILDING = 0
DEPLOY_QUEUE_STATE   = CLEAR
```

The predecessor is `REMOVED` — superseded, not merely older — so the final
candidate is what serves. Migration state on that deployment's own runtime log:

```
NO_PENDING_MIGRATIONS      = YES   ("40 migrations found", "No pending migrations to apply.")
MIGRATION_FAILURE_OBSERVED = NO
```

`NO_PENDING_MIGRATIONS=YES` is read from the migrator's own output in the
deployment stream, not inferred from the service having booted — a service can
boot under a dashboard-overridden start command that never migrates at all.

`/api/health` answered on this deployment and reported the candidate:

```
PRODUCTION_BUILD         = 4fcdad5
PRODUCTION_DEPLOYMENT_ID = 41c517af-3597-4bc9-b486-8a70d81adbc9
```

`role` and `runsBackgroundSync` are evidenced directly by the application's own
output rather than only by a health field: it printed
`[adlytic] Auto-sync: every 15m (role=worker)` at boot and then completed a
worker pass (§8). `status` and `db` were read as fields in the runtime-config
verification (§4) on the immediately preceding deployment, whose service
configuration this one inherits unchanged; on this deployment they are carried
by the deployment reaching `SUCCESS` — Railway promotes only after its
healthcheck, which is `/api/health`, passes — and by the schema being read and
14 rows written. Stated this way rather than as a direct field quote, because
that is what was actually observed.

---

## 4. Runtime configuration · applied and verified

`runtime-config.yml` run 3, in `apply` mode, fixed the two findings production
reported about itself at boot and then re-read the result:

```
prod_JWT_IDENTICAL_WARNING_COUNT = 0     (was: JWT_SECRET identical to META_APP_SECRET)
prod_BULLMQ_MISCONFIG_COUNT      = 0
prod_BULLMQ_DISABLED_LINE_COUNT  = 1

PRODUCTION_HTTP            = 200      PRODUCTION_STATUS = ok
PRODUCTION_DB              = ok       PRODUCTION_ROLE   = worker
PRODUCTION_BACKGROUND_SYNC = true     PRODUCTION_BULLMQ = disabled
PRODUCTION_RESOLVED        = true
```

Those variables live on the service, so a later deployment inherits them; the
fix is not re-applied per build and `runtime-config.yml` is **not** re-run —
its apply path rotates `JWT_SECRET`, which costs every user a re-login and
would be pure churn here.

One thing this run also showed, and it is worth stating rather than leaving in
a log: the brain-validation service serves `d499744` from branch
`claude/brain-admin-v2-integration`, not main. It is `SERVICE_ROLE=api` with
`runsBackgroundSync=false` — structurally a reader — so it cannot validate
period truth and is not on the release path. Recorded so nobody later reads its
commit as a discrepancy in the candidate.

---

## 5. Where this environment stands, measured

The release environment cannot reach Railway or the deployed services. That is
not an assumption carried over from an earlier cycle — it was re-measured this
pass:

```
$ curl https://adlytic-production.up.railway.app/api/health
http=000

agent proxy relay failure log:
  adlytic-production.up.railway.app:443 | connect_rejected
  gateway answered 403 to CONNECT (policy denial or upstream failure)
```

Every live fact in this document therefore comes from a GitHub Actions run,
whose log is the evidence record. That is the same reason `verify-live.yml`
exists, and its header says so.

---

## 6. D5 — the reopening trigger fired

`13_OPEN_DEBT_REGISTER.md` classes D5 `ADVISORY_LOCK_SESSION_NOT_PINNED` as
`NON_BLOCKING_DEBT`, with an explicit condition:

> **Reopen when** the unlock-returned-false warning appears in production, or
> the pool gains a path that keeps one connection hot indefinitely.

It appeared. Twice per pass, on the predecessor and again on the final
candidate — same two lock keys both times, so this is systematic rather than a
one-off:

```
ADVISORY_UNLOCK_WRONG_SESSION_OBSERVED = YES

[adlytic:advisory-lock] unlock of 787349506 returned false — this pooled
  connection does not hold it, so the DB-side lock stays until that session
  closes. This process has released it locally; another instance may skip a
  pass until then.
[adlytic:advisory-lock] unlock of 254083077 returned false — …
```

**D5 is reopened.** Its own analysis of the failure direction still holds —
the leak over-blocks rather than under-blocks, so a competing pass is refused
and retries rather than double-acquiring — and the pass in that same log
completed on both builds (`✓ full sync done`, 156768ms then 157814ms). So this
is a liveness cost, not a correctness violation, and it does not block the
release.

What it does do is end the item's stated grounds for staying deferred. It is no
longer "a condition that has not occurred"; it is a condition that occurs in
normal operation. Fixing it means pinning one session across
acquire → work → release, which takes these helpers off Prisma and onto a
`pg.Pool` client and would give the concurrency suite a live-database
dependency it deliberately does not have. That is a design change, and this
pass is not the place to start one — but it is now scheduled work rather than
watched debt.

---

## 7. Repository verification

```
TYPECHECK (root)          = PASS
TYPECHECK (tsconfig.tools) = PASS
TEST_ALL_RUN_1            = PASS   55 suites · 1053 assertions · 0 failed
TEST_ALL_RUN_2            = PASS   55 suites · 1053 assertions · 0 failed
TEST_ALL_IDENTICAL        = YES    (per-suite banners compared, not just exit codes)
```

The suite is larger than doc 15's 49 suites / 985 floor because the Admin merge
registered five admin test files that existed on disk with no npm script and so
had never run: `test_admin_pages`, `test_admin_console`,
`test_admin_adversarial`, `test_admin_clickthrough`, `test_admin_viewports`.
No suite lost or weakened an assertion.

Track-A guards, unweakened:

| Guard | Result |
|---|---|
| `test:deploy-gate` | 67 passed |
| `test:period-rollout` | 11 passed |
| `test:period-metrics` | 18 passed |
| `test:brain-observatory` | 49 passed |
| `test:session-routing` | 36 passed |

Admin guards, unweakened: `admin-os` 17 · `admin-control-plane` 25 ·
`system-graph` 37 · `admin-acceptance` 21 · `admin-pages` 28 ·
`admin-clickthrough` ALL PASS · `admin-viewports` all widths pass.

---

## 8. Gate B — period truth, re-checked against the final build · **CLOSED**

Doc 00 said Gate B "will be re-checked against the final build rather than
assumed to survive it." It was, and the first attempt is worth recording
because it shows the check working.

**First read, 00:11 minus 18 minutes** — eight minutes after the deployment
came up:

```
PERIOD_FACT_REQUESTED              = UNOBSERVED
PERIOD_INSIGHT_WRITE_PATH_EXECUTED = UNPROVEN
WORKER_SYNC_COMPLETED              = UNPROVEN
PERIOD_PHASE_CLASSIFICATION        = PASS_STILL_BEFORE_PHASE_2B — account sync in progress, not a failure
```

That is the correct answer to a question asked too early, and it was left as
UNOBSERVED rather than resolved either way. The scheduler runs every 15
minutes and a full pass takes ~2.5 minutes, so the honest response was to wait
for one.

**Second read, 2026-08-23T00:11Z**, after a pass had run:

```
[adlytic] Auto-sync:  every 15m (role=worker)
[adlytic:auto-sync] Syncing 1 account(s)…
[adlytic:auto-sync:<redacted>] period facts: 14/200 stored
[adlytic:auto-sync:<redacted>] ads: 0 ads, 0 creatives
[adlytic:auto-sync:<redacted>] ✓ full sync done (157814ms)

PERIOD_FACT_LOG_PRESENT            = YES
SYNC_PASS_OBSERVED                 = YES
PERIOD_FACT_REQUESTED              = 200
PERIOD_FACT_STORED                 = 14
PERIOD_FACT_UNAVAILABLE_OR_FAILED  = 0
PERIOD_INSIGHT_WRITE_PATH_EXECUTED = YES
WORKER_SYNC_COMPLETED              = YES
PERIOD_FACT_POPULATION             = YES
ACCOUNT_SYNC_COMPLETION_OBSERVED   = YES
PHASE3_ADS_REACHED                 = YES
PERIOD_SYNC_EXCEPTION_OBSERVED     = NO
TOKEN_DECRYPT_FAILURE_OBSERVED     = NO
ACCOUNT_SYNC_ERROR_OBSERVED        = NO
```

The write path executed on the candidate's own build, stored rows, and the
pass completed. `stored=14` against `requested=200` is not a shortfall to
explain away: `fetchAndStore` returns false for an all-null row, which
increments neither `stored` nor `failed` — and `UNAVAILABLE_OR_FAILED=0` says
none failed. The comparable figure on the predecessor was 13/200; one more
day's window had become available.

---

## 9. What is still not proven, and stays that way

```
PERIOD_FACTS_EXIST_IN_DB = NOT PROVEN FROM CI
```

The verify job says so itself in its closing step. Period facts live behind
`/api/admin/brain-observatory/*`, which is `requirePlatformAdmin`-gated and
deliberately unreachable from an unauthenticated CI job. What is proven is
that the write path executed and reported rows stored. Reading them back
requires an authenticated admin session, which no automated gate in this
repository has, and none is given one to close a gate faster.

---

## 10. Verification of the combined tree

Admin and Graphify are present and intact on this tree: the Control Plane
shell, the six-domain IA, all three graph modes (`architecture`, `runtime`,
`trace`) mounted on `/admin/graph`, the typed real-payload fixtures, all five
legacy pages rendering inside the shell, and the server-side admin gate.
