# 11 — Admin information architecture

One map, defined once in `src/web/pages/adminSurfaceNav.ts`, rendered by every
admin surface.

```
ADMIN_INFORMATION_ARCHITECTURE_COMPLETE = YES
ADMIN_ENTITY_CONTEXT_PERSISTENT         = YES (via the shared map + page headers)
BRAIN_OBSERVATORY_INTEGRATED            = YES
ADMIN_UI_REDERIVES_INTELLIGENCE         = NO
```

## Sections

| Section | Destination | Answers |
|---|---|---|
| **OVERVIEW** | `/admin` | what is happening now, what needs attention |
| **META & DATA** | `/admin/meta-readiness` | permissions, capabilities, discovery |
| **INTELLIGENCE** | `/admin/brain-observatory` | Meta truth → decision, layer by layer |
| **OPERATIONS** | `/admin/observability` | services, sync, build identity |
| **WORKSPACES & CUSTOMERS** | `/admin/classic`, `/admin/add-client` | customers, subscriptions, settings |
| **SUPPORT** | `/admin/inbox` | customer tickets |

Each page's own views nest **under** the shared map rather than replacing it,
so consolidation cost no functionality.

## SECURITY & AUDIT is deliberately absent

The specification asks for it. No route today serves privileged-action
history, deletion events or an audit trail, and the nearest surfaces —
settings, payment events — are configuration, not audit.

A heading over a link to those would tell an operator a capability exists when
it does not. That is the same class of dishonesty as a UI that turns UNKNOWN
into healthy, and this codebase spends real effort avoiding it everywhere
else. The section is omitted and the gap is recorded as debt. A test asserts
no section renders empty.

## Status vocabulary

`src/web/pages/adminStatus.ts` owns the whole vocabulary and encodes three
rules:

1. **Absence is always dashed and muted.** `UNKNOWN`, `NOT_TESTED`,
   `NOT_REACHED`, `NOT_GOVERNED`, `INSUFFICIENT_DATA` never borrow a verdict's
   colour — in either direction.
2. **FAILED is solid red; UNKNOWN never is.** "We could not tell" reading as
   "it is broken" teaches operators to ignore red.
3. **Colour is never the only signal.** Every state carries a distinct glyph
   and its own literal name, so meaning survives greyscale, colour-blindness
   and a screenshot pasted into a ticket.

Eight pairs are asserted to render differently: UNKNOWN/HEALTHY,
UNKNOWN/FAILED, NOT_TESTED/FAILED, NOT_TESTED/UNAVAILABLE,
NOT_VETOED/RECOMMENDED, NOT_GOVERNED/AVAILABLE, NOT_REACHED/REACHED,
INSUFFICIENT_DATA/HEALTHY. Each is a conflation the product could otherwise
make.

## Investigation flow

The Observatory presents its panes in chain order — Object Identity → Temporal
Truth → Meta Truth → Semantics → Anomalies → Evidence → Diagnosis → Decision →
LLM Narration → Trace — with provenance expandable at each step and the
decision owned by DECISION rather than the LLM pane.
