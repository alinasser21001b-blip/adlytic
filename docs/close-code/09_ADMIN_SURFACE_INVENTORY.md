# 09 — Admin surface inventory

```
ADMIN_SURFACES_BEFORE = 8 page routes, 40 admin API routes, 7 page modules
ADMIN_SURFACES_AFTER  = 8 page routes, 40 admin API routes, 8 page modules
                        (+adminStatus.ts; nothing deleted, nothing orphaned)
ADMIN_DUPLICATE_TRUTH_SURFACES = 0 navigation maps (was 3)
```

## Page routes

| Route | Purpose | Data source | Authorization | Writes | Overlap | Status | Action |
|---|---|---|---|---|---|---|---|
| `/admin/login` | unauthenticated door | — | **public by design** | session | none | KEEP | KEEP |
| `/admin` | operator console (`adminOsPage`) | ops, platform-stats, customers, capability-probe | `adminPage` | none | with `/admin/classic` | KEEP | KEEP |
| `/admin/classic` | full console (`adminConsolePage`) | + overview, settings, subscriptions, payment-events | `adminPage` | PRIVILEGED | superset of `/admin` | KEEP | CONSOLIDATE (deferred — see debt) |
| `/admin/observability` | platform monitoring | platform-stats, users | `adminPage` | SAFE (cache bust) | platform-stats | KEEP | KEEP |
| `/admin/meta-readiness` | Meta capability | capability-probe | `adminPage` | none | none | KEEP | KEEP |
| `/admin/brain-observatory` | intelligence diagnostic | observatory API | `adminPage` | **none (trapped)** | none | KEEP | **now navigable** |
| `/admin/inbox` | support tickets | support APIs | `adminPage` | SAFE | none | KEEP | KEEP |
| `/admin/add-client` | onboarding wizard | onboarding APIs | `adminPage` | PRIVILEGED | with `/admin/classic#create` | KEEP | KEEP |

All 40 `/api/admin/*` routes carry `requirePlatformAdmin`. Asserted, not
assumed — see doc 10.

## What was actually wrong

**Three navigation maps.** `adminSurfaceNav` listed five destinations;
`adminConsolePage` carried its own seven groups mixing in-page tabs with
cross-page links; `adminOsPage` carried four more. Moving between admin
windows meant learning a different map each time.

**The Brain Observatory appeared in none of them.** Mounted, gated, tested —
and reachable only by typing the URL. The single highest-value fix in this
phase was adding one navigation entry.

**Duplicate truth reads.** `platform-stats` was consumed by all three console
pages, `ops` / `capability-probe` / `customers` / `cache-bust` by two each.

## Action safety classification

| Class | Examples |
|---|---|
| `READ_ONLY` | Brain Observatory, meta-readiness, observability, capability probe |
| `SAFE_MUTATION` | cache bust, ticket reply, settings read |
| `PRIVILEGED_MUTATION` | customer create/update, subscription activate/cancel/extend, password reset, user activate/deactivate |
| `DESTRUCTIVE` | account data purge |

No Meta campaign mutation control exists on any admin surface, and none was
added. Adlytic remains read-only against Meta.
