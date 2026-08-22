# 01 — Existing capabilities

The machine-readable source is `src/web/pages/adminCapabilities.ts`. This
document reports it; the registry is what the tests read, so the two cannot
drift without a test failing.

```
ADMIN_CAPABILITY_TOTAL   = 48
DUPLICATED_CAPABILITIES  = 1    (cap.meta.probe.os → cap.meta.probe)
ORPHAN_CAPABILITIES      = 1    (cap.ops.reconcileActions — no UI in either console, ever)
HIDDEN_CAPABILITIES      = 0
```

## By domain

| Domain | Capabilities | Question it answers |
|---|---|---|
| CONTROL_CENTER | 6 | What is happening right now? |
| META_AND_DATA | 8 | Is our connection to Meta and our data truth healthy? |
| INTELLIGENCE | 5 | What does Adlytic know, how did it reason, what did it decide? |
| OPERATIONS | 6 | Is the platform itself operating correctly? |
| CUSTOMERS | 18 | Who are we serving and how are their workspaces configured? |
| SUPPORT | 5 | Who needs assistance and what is unresolved? |

Customers carries 18 because the classic console genuinely owned the most: the
customer lifecycle, subscriptions, the payment ledger and platform settings. It
was the console most at risk of being "consolidated" into deletion.

## Access classification

Copied from `docs/close-code/09` rather than re-invented, so one vocabulary
describes admin danger everywhere.

| Class | Count | Examples |
|---|---|---|
| `READ_ONLY` | 29 | ops snapshot, platform stats, Brain Observatory, the whole graph |
| `SAFE_MUTATION` | 6 | cache bust, capability probe, ticket reply/triage, onboarding re-check |
| `PRIVILEGED_MUTATION` | 12 | customer create/edit, subscription activate/cancel/extend, settings write, user activate/deactivate |
| `DESTRUCTIVE` | 1 | `DELETE /api/admin/customers/:userId` |

Migration actions, computed the same way: `REUSE` 34, `WRAP` 8, `KEEP` 4,
`MERGE` 2. Nothing is marked `DEPRECATE_AFTER_PARITY` or `REMOVE_AFTER_PROOF`
at capability level — deprecation is a property of a ROUTE, not of the
capabilities it happens to host, and doc 04 tracks it there.

Every one is `PLATFORM_ADMIN`. The field exists so that a future capability that
is *not* stands out rather than blending in.

## The six views over one payload

Six CONTROL_CENTER and META_AND_DATA capabilities are served by a single route,
`GET /api/admin/ops`. They are listed separately because an operator loses a
distinct answer if any one stops being rendered — but recording that they share
a payload is itself useful: they cannot disagree with each other, because there
is nothing to disagree about.

The shell fetches that route once and hands the snapshot to every surface via an
`ops:ready` event, so the Control Plane makes one request where the previous
consoles made three.

## Fields, and why each exists

`canonicalBackend` is asserted to be a mounted route. `controlPlaneRoute` is
asserted to be a page that really calls that backend — see doc 11. `duplicateOf`
must name a capability sharing the same backend, or it is not a duplicate.
`operatorValue` states what is lost if the capability disappears, in impact
terms rather than as a restatement of the name: a registry whose "value" column
paraphrases the title cannot be used to decide what is safe to drop.
