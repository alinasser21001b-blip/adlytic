# 00 — Executive state

```
BASE_BRANCH   = claude/brain-admin-v2-integration
BASE_COMMIT   = ba145c3b5fde283cfa837c0d9e24a0b84bc124ec
ADMIN_BRANCH  = claude/admin-control-plane-graphify-y6wz0c

ADMIN_CAPABILITY_TOTAL      = 48
ADMIN_CAPABILITIES_LOST     = 0
LEGACY_ADMIN_PRODUCTS_BEFORE = 6   (console, Admin OS, observability, readiness, inbox, add-client)
LEGACY_ADMIN_PRODUCTS_AFTER  = 1   (one shell; 5 legacy routes survive as strangler hosts)
ADMIN_SHELL_COUNT            = 1
ADMIN_TOP_LEVEL_IA_COUNT     = 6
ADMIN_ORPHAN_ROUTES          = 0
ADMIN_AUTH_GAPS              = 0

GRAPH_NODES = 135
GRAPH_EDGES = 275
GRAPH_DUPLICATE_ENGINES_CREATED = 0
GRAPH_READ_ONLY = YES
GRAPH_MUTATION_PATHS = 0
GRAPH_REDERIVES_BRAIN_LOGIC = NO
```

## What was actually wrong

The admin surface was not one product. It was six generations of internal tool
running side by side, each built for a real reason and each still owning
capability nobody else had.

A previous phase fixed the most visible symptom — three different navigation
menus — by introducing one shared map. But the map's destinations were the
historical pages themselves. An operator clicking **Meta والبيانات** left the
console and arrived at a page with its own layout, its own header treatment and
its own idea of where things live. The heading said "domain"; the link went to a
different application.

So the fragmentation was one level deeper than the menu.

## What this branch changes

**The domains became the destinations.** Six domains, each answering one
operator question, each served by a surface rendered inside one shell
(`src/web/adminShell.ts`). There is exactly one function in the codebase that
produces an admin document, which is the mechanism behind "one shell" — not a
convention, but the absence of anywhere for a second product to grow.

**The historical pages did not die.** All five stay mounted and working. They
are out of the global sidebar and reached from the surface that replaced them,
which is the strangler contract: a route dropped from the menu but not linked
from its successor is not consolidated, it is hidden — and hiding is how
capability gets lost while everyone believes it was migrated.

**Migration became data.** 48 capabilities, each read out of `server.ts` and the
page that calls it, with the route that now serves it. Parity is computed from
that table, and a legacy route can only be retired when nothing is missing.

**Graphify was completed, not restarted.** A dependency registry already existed
and had already caught a real omission in production. The graph builder reads
it rather than deriving dependencies a second time.

## The one honest gap

`cap.ops.reconcileActions` (`POST /api/admin/reconcile-actions`) has no operator
surface in the Control Plane — because it never had one in *either* previous
console. It is listed in the registry so it cannot be forgotten, and the test
asserts it is the **only** capability allowed to be unhosted. Building a UI for
it was outside this scope; pretending it had one would have been worse.

## What was deliberately not built

- **No GraphQL.** The word "graph" here means the system map. No GraphQL
  infrastructure existed in this repository, and none was introduced.
- **No Security & Audit section.** Still absent, still for the reason
  `docs/close-code/11` gives: no route serves privileged-action history or an
  audit trail, and a heading over settings and payment events would claim a
  capability the platform does not have.
- **No second intelligence engine.** The graph visualises the Brain's output
  and calculates none of it.
