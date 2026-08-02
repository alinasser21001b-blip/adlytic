# Dawai — Native Re-Architecture Blueprint

**Status: Draft for approval. Nothing here is implemented.**
Implementation begins only after this blueprint is approved.

The existing application is treated from here on as an **exploratory
prototype**. It is not the baseline. No screen, component, route, or table
carries forward into the new system on the grounds that it already exists.

## Documents

| # | Document | Answers |
|---|---|---|
| [01](01-product-architecture.md) | Product Architecture | What are the modules, and how do they communicate? |
| [02](02-user-types.md) | User Types & Separation | Why three apps rather than one app with roles? |
| [03](03-navigation.md) | Navigation Architecture | Every screen, every destination, every relationship |
| [04](04-screen-inventory.md) | Screen Inventory | Every screen and every state it can be in |
| [05](05-user-journeys.md) | User Journeys | Patient, Pharmacy, Owner — end to end |
| [06](06-native-ux.md) | Native Mobile UX | What "native" obliges us to change |
| [07](07-gap-analysis.md) | Missing Features | What does not exist and must |
| [08](08-ux-problems.md) | UX Problems | Every problem, why it is one, and the fix |
| [09](09-information-architecture.md) | Information Architecture | How the whole product is organised |
| [10](10-component-architecture.md) | Component Architecture | The layer rules that keep it coherent |
| [11](11-state-and-data-flow.md) | State & Data Flow | Where state lives and how it moves |
| [12](12-permission-matrix.md) | Permission Matrix | Who may do what, enforced where |

## What carries forward, and why

"Nothing copied without justification" is the rule. Six things earn their way
across. Each was found by a defect or a review round, not by preference. They
are constraints on the new architecture, not inherited code.

| Carried forward | Justification |
|---|---|
| **No diagnosis, no dose calculation, no automatic substitution** | Dawai transports and records; it does not practise medicine. This is the boundary that keeps the product legal and safe. |
| **A failed interaction check is never a green light** | `UNAVAILABLE` must never render as "no interactions found". Presenting a failed check as an all-clear is the single most dangerous thing this product could do. |
| **Severe safety alerts have no dismiss affordance** | Not disabled — absent. They clear by fixing their cause. A dismissible severe alert trains the dismissal reflex. |
| **Clinical records are append-only** | Corrections are new records. An editable clinical history is not a history. |
| **Inventory is passive; there is no editable quantity field** | Pharmacists have no time to be data-entry clerks. Every platform that demanded it died. Stock is inferred from movement, and confidence in the inference is measured rather than assumed. |
| **Arabic-first typography rules** | `letter-spacing: 0` always, line-height ≥ 1.6, logical properties, `<bdi>` isolation for Latin and numerals, one numeral system per surface. Arabic is a connected script; these are correctness, not style. |

Everything else is open for redesign.

## What this blueprint deliberately does NOT decide

Naming these keeps them from being decided by accident in a pull request.

- **Pricing, commission, and payments.** Out of scope until the reservation
  loop is proven. Introducing money changes the regulatory profile.
- **Delivery.** The product deliberately stops at pharmacy pickup. Delivery of
  prescription medicine is a different legal product. Do not add it because a
  screen has room for it.
- **The first launch geography.** An architectural non-issue but a product
  life-or-death one: the system must work densely in one district before it
  works thinly everywhere. See [05](05-user-journeys.md) § Cold start.

## Approval checklist

This blueprint is approved when the following are each explicitly accepted:

- [ ] Three separate applications, not one application with role switching ([02](02-user-types.md))
- [ ] The chosen native stack and its migration cost ([10](10-component-architecture.md) § Platform decision)
- [ ] The reservation lifecycle state machine, including who owns each transition ([11](11-state-and-data-flow.md))
- [ ] The permission matrix, including family proxy scopes ([12](12-permission-matrix.md))
- [ ] The Owner console scope — it is the largest single addition in this plan ([02](02-user-types.md) § Owner)
- [ ] The six carried-forward invariants above
- [ ] The offline model and what is deliberately unavailable offline ([11](11-state-and-data-flow.md))
