# 20 — UI stabilization

Post-merge pass on `claude/admin-control-plane-ui-stabilization`, branched from
`main` after the Control Plane merged via PR #92.

```
OLD_VISUAL_GATE_INVALIDATED = YES
FALSE_GREEN_ROOT_CAUSE      = a page that renders whatever it is handed cannot be
                              verified; compounded by a fixture written from memory
                              and an audit that measured structure, not comprehension
                              (doc 18)

RAW_JSON_OPERATOR_LEAKS_BEFORE = 5
RAW_JSON_OPERATOR_LEAKS_AFTER  = 0   (1 classified: a settings editor must show the literal)

ADMIN_NAVIGATION_TRANSITIONS_TESTED = 16
BROKEN_TRANSITIONS_BEFORE           = 9
BROKEN_TRANSITIONS_AFTER            = 0

LEGACY_META_READINESS_DEPENDENCY_BEFORE = 4  (page link, 2 ops actionHrefs, IA entry)
LEGACY_META_READINESS_DEPENDENCY_AFTER  = 0

LEGACY_ROUTES_BEFORE = 5
LEGACY_ROUTES_AFTER  = 4
```

## Meta & Data, recomposed

The overview answers the seven questions before anything else: a health header
(connection, connected accounts, blocked accounts, last successful sync, oldest
data, capability state, quota), an attention strip whose items navigate to the
row they describe, connections worst-first with impact, quota, recent events and
the error breakdown.

Quota is **translated**, not relabelled:

| Field | What the operator reads |
|---|---|
| `errorRateLast500` / `errorRateGatePct` | "error rate over the last 500 calls — the metric Meta gates on — against a 15% ceiling" |
| `progressToThresholdPct` / `callThreshold` | "3,106 of 500 calls toward the access-tier upgrade", with a bar |
| `meetsErrorGate` | "met" / "not met", with what being not-met costs |
| `errorBreakdown15d` | six named causes as proportional bars |
| `redisAvailable: false` | **"no measurement"** — never a zero, which would read as "no errors" |

Raw payloads live behind `<details class="tech">` and nowhere else.

## Navigation

Sixteen transitions driven by clicking. Nine were broken: `/admin/brain-observatory`
and `/admin/add-client` are **sidebar destinations** that drew their own sidebar,
topbar and header, so choosing them lost the shell, emptied the context bar and
left no nav item active. Both render in the shell now, content untouched.
`add-client` also carried a client-side authorization branch that redirected
itself out of the console; the server gate was always the boundary.

Three links into legacy routes remain, classified as temporary legacy fallback
per doc 14: operations→observability, customers→classic, support→inbox.

## Composition

`CONTENT_OCCUPANCY` after: control-center 97%, meta 95%, support 96%, customers
70%, intelligence 65%, operations 60%, graph 132% (it scrolls). Before, the
worst were support at 30% and the graph mis-measured at 20%.

Used to detect pathological emptiness only, and applied only to scenarios that
carry data — demanding a failure state fill a screen would mean padding.

## Verification

```
TYPECHECK   = PASS
ADMIN_TESTS = admin-os 17 · control-plane 24 · graph 37 · acceptance 21 · pages 28
FULL_SUITE  = 976 assertions, 51 suites, 0 failures
UI_AUDIT    = 0 findings · 7 surfaces × 11 scenarios × 3 viewports (1680/1440/1280)
NAV_AUDIT   = 16/16 transitions keep shell, context, active nav, tab and Back
GRAPH_AUDIT = 19/19 operator questions
LTR_PASS    = 7/7 no horizontal scroll, identifiers stay LTR
SCREENSHOT_GATE = reviewed by eye; found 4 defects the audit had passed
TRACK_A_FILES_TOUCHED = 0
```

## Files this pass did not touch

No PeriodInsight semantics, worker rollout, Railway gate, CI closure, Meta
intelligence authority, Decision Engine, recommendation authority or Brain
diagnosis logic. `adminOpsHealth.ts` changed only two `actionHref` strings —
presentation, not measurement.
