# ADMIN DECISION AUDIT — BASELINE

State frozen before the adversarial audit. Recorded so that any later claim
about improvement can be checked against a real starting point rather than a
recollection of one.

## Repository state

```text
HEAD          f5119f8
working tree  clean
admin routes  5   /admin  /admin/inbox  /admin/observability
                  /admin/meta-readiness  /admin/add-client
admin APIs    38  every one gated by requirePlatformAdmin (verified by
                  test_route_authz.ts, which scans server.ts source)
console tabs  8   overview · workspaces · customers · create ·
                  subscriptions · ledger · probe · settings
```

## Admin API dependencies of the console

| endpoint | feeds |
|---|---|
| `/api/auth/me` | admin gate, shell reveal |
| `/api/admin/ops` | system health, attention queue, workspaces |
| `/api/admin/platform-stats` | reach, money under management, narration coverage |
| `/api/admin/overview` | customer/workspace counters |
| `/api/admin/customers` | customer table, probe workspace list |
| `/api/admin/subscriptions`, `/api/admin/payment-events` | revenue surfaces |
| `/api/admin/settings` | platform settings |
| `/api/admin/support/counts` | support KPIs |
| `/api/admin/capability-probe` | the probe run |
| `/api/admin/cache/bust` | stats recompute |

## What the console CLAIMED at baseline

- **Observed and reported**: database reachability, Redis connection state,
  queue acceptance, recent-sync presence, Meta connection per account,
  token presence/expiry, Meta's own account status, last sync status and
  error, freshest daily-stat date.
- **Derived (interpretation, marked as such)**: connection axis, data axis,
  overall per-workspace status, attention items.

## What the console explicitly did NOT know

```text
worker liveness of a separate service   → UNKNOWN
intelligence runtime health             → NOT_TESTED (no score invented)
real Meta capabilities                  → probe never run
live job/queue state                    → BullMQ disabled by config
account-scoped probe concurrency        → no server-side lease exists
```

## Gate results at baseline

```text
tsc                     clean
admin pages             22/22
click-through           22/22
scenarios               11/11
route authz             OK
capability probe        81/81
analytics architecture  27/27
result semantics        42/42
campaign lifecycle      23/23
page scripts            clean
```

## Frozen for this task

Meta probe semantics · candidate set · baseline ladder · 40-call cap ·
read-only behaviour · `NOT_TESTED` / `UNKNOWN` meanings · Gate 1 ·
attribution · measurement logic · intelligence logic · diagnosis logic.

The admin UI may evolve. None of the above may change to make the UI simpler.
