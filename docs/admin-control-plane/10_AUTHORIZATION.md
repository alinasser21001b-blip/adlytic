# 10 — Authorization

```
ADMIN_AUTH_GAPS      = 0
GRAPH_READ_ONLY      = YES
GRAPH_MUTATION_PATHS = 0
```

## Nothing was weakened

The existing model is unchanged:

- **Every `/api/admin/*` route** calls `requirePlatformAdmin` — bearer token →
  `tokenVersion` revocation check → `PLATFORM_ADMIN_EMAILS` allowlist. Missing
  allowlist returns **503**: we refuse to serve admin routes when the lock has
  no combination, rather than failing open.
- **Every `/admin/*` page route** goes through the `adminPage` gate, which reads
  the HttpOnly session cookie server-side. Anonymous callers get a redirect
  rather than a 403 — a 403 would still confirm the route exists.
- `/admin/login` is deliberately ungated: it is the door, and gating it would
  make a locked-out operator unable to reach the only page that can unlock them.

Seven new page routes and three new API routes were added. Each is asserted
individually.

## Assertions

| Assertion | Suite |
|---|---|
| every `/api/admin/*` route is behind `requirePlatformAdmin` | `test_admin_os.ts` |
| every `/admin/*` page route is behind `adminPage` | `test_admin_os.ts` |
| every `/api/admin/graph/*` route is behind `requirePlatformAdmin` | `test_admin_control_plane.ts` |
| every Control Plane page route is behind `adminPage` | `test_admin_control_plane.ts` |
| no Control Plane surface branches on admin-ness client-side | `test_admin_control_plane.ts` |
| the shell does not gate on admin-ness client-side | `test_admin_control_plane.ts` |

The client-side check matters because a page that hides a control is not a
guard. The server owns the decision; the UI must not appear to.

## The graph is read-only, structurally

Not by policy — by the absence of a path:

- Three routes under `/api/admin/graph`, **all GET**. A test enumerates every
  `app.<method>('/api/admin/graph…')` and fails on any non-GET.
- No import endpoint. Accepting a graph over the wire would make the map
  writable by whoever could reach the route.
- The graph modules cannot reach a database client, perform a `prisma` call, or
  contain `.upsert(`, `.createMany(`, `.deleteMany(`, `.updateMany(`, `enqueue(`
  or a Meta fetch. Asserted per file, with comments stripped so that *naming* a
  write in a provenance string — which is how the graph documents who owns a
  model — is allowed while *performing* one is not.
- The browser component issues no mutating request and carries no `<form>`.
- The inspector's only action is a **link** to a canonical admin surface, which
  owns its own writes and its own authorization.

The graph never mutates Meta, triggers a sync, writes a recommendation, executes
a decision, or updates a DB model. It observes and navigates.

## Danger is visible, not only enforced

The server is the boundary; this is about not discovering that a button was
irreversible by pressing it.

- **Privileged** actions (user activate/deactivate, subscription
  activate/cancel/extend, settings write and seed, cache bust) confirm first.
- The **destructive** action — permanent customer deletion — requires typing the
  customer's email; a yes/no box is too easy to click through.

Asserted in `test_admin_control_plane.ts`.

## Overlays carry no authority

The runtime overlay reports what `adminOpsHealth` observed. The trace overlay
reports what the Brain Observatory concluded. Neither can alter the architecture
graph — the snapshot is frozen and the overlay shape is `nodeId → state` with no
structural field. An overlay cannot grant, revoke, or imply a permission.
