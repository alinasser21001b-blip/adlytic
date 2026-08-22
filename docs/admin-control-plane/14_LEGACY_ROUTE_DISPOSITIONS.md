# 14 — Legacy route dispositions

Five routes survive the consolidation. This is the disposition of each, with
the evidence behind it. The objective is one Admin product — not one new
product beside five old ones forever — but retirement is evidence-driven, and
"the capability moved" is only half the evidence.

```
LEGACY_ROUTES_KEEP          = 0
LEGACY_ROUTES_REDIRECT      = 0
LEGACY_ROUTES_STRANGLE      = 4
LEGACY_ROUTES_REMOVE_LATER  = 1
```

## Why nothing is REDIRECT

Redirecting a legacy route into its successor is the move `docs/close-code/12`
already caught once: it silently deletes whatever the old page rendered that
the new one does not. A redirect looks like consolidation in the route table
and reads as a regression to the operator who used the thing that vanished.

Every one of these five still renders something the Control Plane does not.
That is what STRANGLE means here, and why none is a redirect.

---

## `/admin/os` — Admin OS → REMOVE_LATER

| | |
|---|---|
| Capabilities | 8 (pulse, attention, workspaces, activity, build, knowledge limits, sync, probe) |
| Control Plane destination | `/admin`, `/admin/meta`, `/admin/intelligence` |
| Capability parity | 8/8 · 100% |
| Presentation parity | **now met** — the epistemic ladder was ported to `/admin/intelligence#ladder` in this pass |
| Behavioral parity | met — same `GET /api/admin/ops`, same probe route |
| Deep-link risk | **NONE** — this route was created three commits ago in this branch; before it, `adminOsPage` served `/admin` |
| Bookmark risk | **NONE** — an existing `/admin` bookmark now lands on the Control Center, which is the intended upgrade |
| Tests depending on it | `test_admin_os.ts` asserts `adminOsPage` renders the shared map; no test navigates to `/admin/os` |
| Safe retirement condition | **MET.** Removing the mount is one line; deleting the 992-line module is the owner's call |

The last thing this page uniquely owned was the epistemic ladder — four rungs
(observed fact → derived signal → interpretation → recommendation) where the
connector arrow *is* the argument: each layer rests on the one below, and a
break anywhere below invalidates everything above.

That is exactly the chain the acceptance brief asks the intelligence view to
expose, so it was ported rather than dropped: `/admin/intelligence#ladder`,
substance unchanged, top two rungs still `NOT_TESTED` because no live check
exists. Its states are counts from evidence already held — fresh accounts from
the ops snapshot, narration coverage from platform stats. It computes no
intelligence.

**Not removed in this pass.** An acceptance audit is the wrong moment to delete
a 992-line module unilaterally; the port is the evidence, and the deletion is a
deliberate follow-up now unblocked.

---

## `/admin/classic` — the classic console → STRANGLE

| | |
|---|---|
| Capabilities | 18 — the largest legacy surface |
| Control Plane destination | `/admin/customers` (16), `/admin/meta` (2) |
| Capability parity | 18/18 · 100% |
| Presentation parity | **NOT met** — the deep customer-detail drawer and the settings editor are richer there |
| Behavioral parity | met — identical guarded routes |
| Deep-link risk | **MEDIUM** — `#settings`, `#subscriptions`, `#ledger`, `#probe` are in-page hashes that may be shared internally |
| Bookmark risk | **MEDIUM** — it was the primary console for months |
| Tests depending on it | none navigate it; four close-code documents reference it |
| Safe retirement condition | the customer drawer and settings editor reach presentation parity **and** an operator confirms nothing is missing |

This is the console `docs/close-code/12` refused to redirect, for the reason
that still holds: it alone owned settings, subscriptions and payment events.
Those were extracted **first**, into `/admin/customers`, before this route was
touched — which is why its capability parity is 100% while its presentation
parity is not.

---

## `/admin/observability` — platform monitoring → STRANGLE

| | |
|---|---|
| Capabilities | 4 (platform stats, cache bust, users, narration coverage) |
| Control Plane destination | `/admin/operations`, `/admin/intelligence` |
| Capability parity | 4/4 · 100% |
| Presentation parity | **NOT met** — detailed reach and money tables are not reproduced |
| Behavioral parity | met |
| Deep-link risk | LOW |
| Bookmark risk | LOW-MEDIUM |
| Tests depending on it | `test_admin_clickthrough.mjs`, `test_route_authz.ts`, `test_no_english_in_ar_pages.mjs` |
| Safe retirement condition | port the money/reach tables, then update the three suites in one change |

Three suites navigate this route. Retiring it means editing them, and a route
retirement that also rewrites three test files is not a cleanup — it is a change
that deserves its own review.

---

## `/admin/meta-readiness` — Meta readiness → STRANGLE

| | |
|---|---|
| Capabilities | 3 (readiness, usage, audit) |
| Control Plane destination | `/admin/meta` |
| Capability parity | 3/3 · 100% |
| Presentation parity | **NOT met** — the full quota breakdown is richer there; `/admin/meta` renders the counters generically |
| Behavioral parity | met |
| Deep-link risk | LOW |
| Bookmark risk | LOW |
| Tests depending on it | `test_admin_clickthrough.mjs`, `test_route_authz.ts`, `test_no_english_in_ar_pages.mjs` |
| Safe retirement condition | `/admin/meta#overview` renders the quota breakdown with the same fidelity |

This is the page that most obviously "looked like a different application". It
is now out of the sidebar and reached from the Meta workspace it feeds.

---

## `/admin/inbox` — classic support inbox → STRANGLE

| | |
|---|---|
| Capabilities | 5 (counts, list, thread, reply, triage) |
| Control Plane destination | `/admin/support` |
| Capability parity | 5/5 · 100% |
| Presentation parity | **NOT met** — the original thread rendering handles attachments and history the new panel does not |
| Behavioral parity | met — messaging backend untouched by design |
| Deep-link risk | **MEDIUM** — ticket deep links may exist in operator notes |
| Bookmark risk | MEDIUM |
| Tests depending on it | `test_admin_clickthrough.mjs`, `test_route_authz.ts` |
| Safe retirement condition | thread parity confirmed **and** ticket deep-links either supported at `/admin/support` or redirected per-ticket |

---

## The sequence that ends with one product

1. `/admin/os` — mount removable now; module deletion is the owner's call.
2. `/admin/meta-readiness` — smallest remaining gap (one quota panel).
3. `/admin/observability` — port two tables, update three suites together.
4. `/admin/inbox` — needs a deep-link decision, not just a port.
5. `/admin/classic` — last, because it is largest and most bookmarked.

Each step is gated by `routeParity()` **and** a presentation check. The registry
proves nothing was lost; it cannot prove nothing got worse, and doc 11 says so.
