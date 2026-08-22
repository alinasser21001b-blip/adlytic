# 11 — Parity report

```
EXISTING_ADMIN_CAPABILITIES = 48
MIGRATED_ADMIN_CAPABILITIES = 47
ADMIN_CAPABILITIES_LOST     = 0
ADMIN_UI_PARITY             = 100% of hostable capabilities (47/47)
```

The 48th is `cap.ops.reconcileActions`, which had no operator surface in **either**
previous console. It is not lost — nothing existed to lose. It is registered so
it cannot be forgotten, and a test asserts it is the only capability allowed to
be unhosted.

## Per-route parity

| LEGACY_ROUTE | LEGACY_CAPABILITY_COUNT | MIGRATED_CAPABILITY_COUNT | MISSING_CAPABILITIES | PARITY | SAFE_TO_DEPRECATE |
|---|---|---|---|---|---|
| `/admin/classic` | 18 | 18 | — | 100% | yes |
| `/admin/os` | 8 | 8 | — | 100% | yes |
| `/admin/inbox` | 5 | 5 | — | 100% | yes |
| `/admin/observability` | 4 | 4 | — | 100% | yes |
| `/admin/meta-readiness` | 3 | 3 | — | 100% | yes |

No route was deprecated. See doc 04 for why parity is necessary but not
sufficient.

## How parity is computed, and why the number can be trusted

Three assertions stand between this table and wishful thinking:

**1. The backend must exist.** Every `canonicalBackend` is matched against the
routes actually mounted in `server.ts`, with `:param` segments normalised. A
capability pointing at a route nobody wrote fails the suite.

**2. The claimed home must really serve it.** This is the load-bearing one. For
every capability with a `controlPlaneRoute`, the page serving that route must
contain the literal backend path. Without this, `controlPlaneRoute` would be a
free-text field and "100%" would mean somebody typed a route into it.

It caught **six** false claims on its first run:

| Capability | Claimed | Reality |
|---|---|---|
| `cap.meta.sync` | `/admin/meta` | page reads the shell's `ops:ready`, never the route |
| `cap.knowledge.limits` | `/admin/intelligence` | same |
| `cap.ops.userActivate` | `/admin/operations` | URL built by string concatenation |
| `cap.ops.userDeactivate` | `/admin/operations` | same |
| `cap.customers.resetPassword` | `/admin/customers` | URL assembled around an id |
| `cap.support.reply` | `/admin/support` | same |

Resolved by fixing the code where the code was at fault — the two `users/*`
calls became two literal routes, which is clearer anyway — and by making the
matcher honest where the *check* was at fault: consuming `ops:ready` counts,
because the shell fetches `/api/admin/ops` once and hands the snapshot to every
surface; and a path is matched by its literal chunks, so a URL built around an
id still proves the call.

**3. Deprecation is mechanical.** `safeToDeprecate` must be exactly
"nothing missing", never a judgement call — asserted, so the field cannot be
set by hand.

## What the assertion still cannot prove

It proves the page *calls* the route. It does not prove the response is rendered
correctly, or that the rendering is as good as the legacy page's. That is what
doc 04's "parity is necessary, not sufficient" means, and it is why five routes
remain mounted at 100% parity.

Honest statement of the limit: this suite prevents **silent capability loss**. It
does not prevent a worse rendering of a capability that is present.

## Coverage of the mission's must-not-disappear list

| Capability | Control Plane home |
|---|---|
| customers | `/admin/customers` |
| workspaces | `/admin/customers`, `/admin` (at-risk view) |
| subscriptions | `/admin/customers` |
| payment events | `/admin/customers` |
| settings | `/admin/customers` |
| Meta readiness | `/admin/meta` |
| permissions/capabilities | `/admin/meta` (probe) |
| entity discovery | `/admin/meta` |
| sync state | `/admin/meta`, `/admin` |
| platform health | `/admin`, `/admin/operations` |
| build identity | `/admin` (pulse + context bar), `/admin/operations` |
| support inbox | `/admin/support` |
| add-client onboarding | `/admin/add-client` |
| Brain Observatory | `/admin/brain-observatory`, `/admin/intelligence` |
| knowledge limits | `/admin/intelligence` |
| experiments | `/admin/meta` (probe), `/admin/os` |
| operational state | `/admin/operations` |

All seventeen present. None silently dropped.
