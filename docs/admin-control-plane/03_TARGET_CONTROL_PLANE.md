# 03 — Target Control Plane

```
ADMIN_SHELL_COUNT        = 1
ADMIN_TOP_LEVEL_IA_COUNT = 6
ADMIN_ORPHAN_ROUTES      = 0
```

## The six domains

| Domain | Route | Answers |
|---|---|---|
| مركز التحكّم | `/admin`, `/admin/graph` | What is happening right now? |
| Meta والبيانات | `/admin/meta` | Is our connection to Meta and our data truth healthy? |
| الذكاء | `/admin/intelligence`, `/admin/brain-observatory` | What does Adlytic know, how did it reason, what did it decide? |
| العمليات | `/admin/operations` | Is the platform itself operating correctly? |
| الزبائن ومساحات العمل | `/admin/customers`, `/admin/add-client` | Who are we serving and how are their workspaces configured? |
| الدعم | `/admin/support` | Who needs assistance and what is unresolved? |

Each section carries a `question` field, and a test asserts it is a question.
That is not decoration: a domain whose purpose cannot be phrased as something an
operator wants to know is a filing cabinet, not an information architecture.

## The shell

`src/web/adminShell.ts` owns everything around the page body:

- **Global sidebar** rendered from `ADMIN_IA`. Domains, not history.
- **Context bar** — environment, build, service role, workspace, Meta account,
  entity. Every slot renders; unresolved slots render **dashed and labelled
  "not set"** rather than blank, because a missing context that looks like an
  absent field trains the reader to ignore the bar.
- **Command palette** (Ctrl-K) over every IA destination plus whatever commands
  a surface registers. Destinations are picked up automatically — a test asserts
  every destination is a command, so adding a domain cannot silently skip search.
- **Operator identity and logout**, in one place.
- **Attention centre** — the same ranked queue the Control Center shows,
  reachable from every screen without navigating away.
- **Page container**, with an optional secondary view strip the shell switches
  and the page fills.

There is exactly one function in the codebase producing an admin document. That
is the mechanism behind "one shell": not a convention, but the absence of
anywhere for a second product to grow. Two tests enforce it — no Control Plane
surface may contain `<!DOCTYPE html>`, and none may render `adminSurfaceNav`
itself.

## Control Center

`/admin` opens on the three questions an operator actually asks first:

1. **System pulse** — API, database, Redis, queues, workers, Meta, intelligence,
   build, environment. Compact, above the fold. The API tile is evidence rather
   than inference: the page rendered, so the API answered.
2. **Needs attention** — one queue, ranked by the severity `adminOpsHealth`
   already assigned. No score is invented here.
3. **Workspaces at risk** — every workspace not in the healthy state, worst
   first, with connection and data freshness separated.

Then the follow-ups: intelligence changes (verbatim from `platform-stats`, and
`—` rather than `0` when there are no snapshots), the operational timeline, and
an interactive System Graph preview in architecture and runtime modes.

## What each surface may and may not do

Surfaces render. They do not reason. The same guards that protected the previous
admin pages now cover the new ones: no `reconcileIntelligence()`,
`diagnoseFunnel()`, `detectAnomaly()` or `buildEntityIntelligence()` call; no
numeric threshold; no client-side branch on admin-ness. A surface that needs a
verdict asks the service that owns it.

## Data flow

```
adminShell ──GET /api/admin/ops──> adminOpsHealth.getAdminOpsSnapshot()
     │
     └── dispatches `ops:ready` ──> Control Center, Meta & Data,
                                    Intelligence, Operations
```

One request, six capabilities, every surface. The previous consoles each fetched
it independently; three copies of the same snapshot could disagree about
*when*, which is a subtle way for two screens to show different truths.
