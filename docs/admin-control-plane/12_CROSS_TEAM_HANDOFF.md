# 12 — Cross-team handoff

Another engineer owns Close-Code accounting, the CI/release gate,
Railway/security deployment gates, the PeriodInsight migration/rollout, and
final operational closure.

```
CROSS_TEAM_CONFLICTS = 1  (detected, deferred to the owner, nothing edited)
```

No file in their ownership area was edited. Specifically untouched:
`.github/workflows/**`, `railway*.json`, `railway*.toml`, `railway.setup.txt`,
`nixpacks.toml`, `.deploy/**`, `docs/close-code/**`, `src/services/periodInsights.ts`,
`src/workers/**`, and every deployment runbook.

## Notifications, not requests

### 1. `package.json` — `test:all` gained two suites

```
FILE_OR_AREA      = package.json (scripts.test:all)
WHY_ADMIN_NEEDS_IT= the two new Admin/Graph suites must run in the pre-merge gate,
                    or the parity and read-only guards are advisory
REQUESTED_CHANGE  = none — already made, additive only
BLOCKING          = NO
SAFE_INTERFACE    = two entries appended: test:admin-control-plane, test:system-graph
```

`test:all` now ends with `… test:admin-os && test:admin-control-plane &&
test:system-graph && test:admin-revocation && …`. Both suites are pure
static/pure-function checks: no database, no network, no browser. Combined
runtime is under three seconds, so Gate C's wall time is essentially unchanged.

Nothing was removed or reordered.

### 2. `test.yml` push trigger does not include this branch

```
FILE_OR_AREA      = .github/workflows/test.yml (on.push.branches)
WHY_ADMIN_NEEDS_IT= pushes to claude/admin-control-plane-graphify-y6wz0c do not
                    run the gate directly; it runs on pull_request only
REQUESTED_CHANGE  = none requested — deliberately NOT edited, it is your file
BLOCKING          = NO
SAFE_INTERFACE    = the pull_request trigger already covers 'src/**', 'test_*.ts',
                    'package.json' and 'docs/**', so every path this branch
                    touches is covered when a PR is opened
```

Raised only so the owner is not surprised. If they want push-time coverage on
admin branches, the one-line addition is theirs to make — the workflow keeps two
deliberately duplicated path lists that a test asserts are identical, and editing
one half of that from outside their scope is exactly the kind of change that
breaks a gate quietly.

### 3. `src/api/server.ts` — additive only

Seven page routes and three GET API routes were added; no existing route,
handler, guard or import was modified. If the other engineer is holding a diff
on this file, the additions are contiguous blocks at the admin page-mount site
and just above the cache-bust route.

### 4. `PeriodInsight` is absent from the system graph — deferred to you

```
FILE_OR_AREA      = test_period_insight_rollout.ts, "no pre-existing module reads
                    or writes the new table"
WHY_ADMIN_NEEDS_IT= the graph documents each DB model with its canonical writer
                    and readers; PeriodInsight is the one model it cannot name
REQUESTED_CHANGE  = after the rollout closes, add 'src/graph/architecture.ts' to
                    that assertion's allowlist — or tell us to leave it out
BLOCKING          = NO
SAFE_INTERFACE    = one entry in src/graph/architecture.ts's PERSISTENCE table;
                    the node is documentation only and reads nothing
```

The guard greps every `.ts` under `src/` for `periodInsight|period_insights` and
allows exactly three modules, on the stated invariant that *a table nothing
references is invisible to every deployed version that predates these modules*.

The graph builder briefly tripped it by naming `PeriodInsight` and
`src/services/periodInsights.ts` in a provenance string. That is a reference in
documentation, not a read or a write — but the gate cannot distinguish, it is
live during your rollout, and arguing the distinction from outside your scope is
how a deployment gate gets weakened by someone who does not own the risk.

So the entry was removed rather than the assertion edited. `test_period_insight_rollout.ts`
passes unchanged (11/11). The graph is 135 nodes instead of 137 — the model and
its writer module both drop out; the omission is commented at the removal site
so it is not re-added by accident.

## Nothing is blocked

No admin work waits on a change in their area. Item 4 is a one-line follow-up
whose timing is theirs to choose.
