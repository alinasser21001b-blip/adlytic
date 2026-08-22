# 17 — Visual quality gate

Answered against the rendered product, not the source. Evidence is the browser
audit in `tools/admin-acceptance/`: 7 surfaces × 11 scenarios × 2 viewports,
plus an LTR pass and 19 driven operator questions.

```
VISUAL_FRAGMENTATION_REMOVED     = YES
NAVIGATION_FRAGMENTATION_REMOVED = YES
DUPLICATE_ADMIN_PRODUCTS_VISIBLE = NO
GRAPH_DISCOVERABILITY            = STRONG
OPERATOR_INFORMATION_HIERARCHY   = STRONG
EMPTY_SPACE_PROBLEM              = RESOLVED
RTL_QUALITY                      = STRONG
STATUS_SEMANTICS_VISUALLY_DISTINCT = YES
LEGACY_VISUAL_LANGUAGE_REMAINING = 5 routes, out of the sidebar, reached from their successor
```

## VISUAL_FRAGMENTATION_REMOVED — YES

Before: four sidebars, three header treatments, a Meta page that read as a
different application. Now one shell renders every Control Plane surface, and
the audit asserts `.rail` appears exactly once on every page in every scenario.
There is one function in the codebase that produces an admin document.

## NAVIGATION_FRAGMENTATION_REMOVED — YES

The previous map's headings were domains and its links were the historical
pages, so clicking a domain left the console. Now every sidebar destination is
a Control Plane surface. Ctrl-K reaches every destination plus every graph node
by name, asserted rather than assumed.

## DUPLICATE_ADMIN_PRODUCTS_VISIBLE — NO

No legacy route is a sidebar destination — asserted. Each is reachable only
from the surface that replaced it, with a line saying what it still owns.

## GRAPH_DISCOVERABILITY — STRONG (and it was WEAK when first rendered)

This is where the audit changed the verdict twice.

First render: 39 routes truncated to `_GET /api/admin/c` and `_GET /api/admin/brai`
— indistinguishable, because head-truncation cuts off the part that differs.
275 edges as one hairball. No search, no filters. **Decorative.**

Then the measurement itself was wrong. It reported labels at 23px by dividing
rendered width by viewBox width, but `preserveAspectRatio: meet` scales to the
*constraining* axis, and height was constraining. The real size was ~4px on the
preview and 5.9px on the full page — legible as shapes, unreadable as
information.

Now: tail-biased labels, search, per-class filters with counts, a runtime
status filter, neighbourhood isolation, reset, column headers, seven preset
questions, an inspector drawer, empty columns that collapse, and natural scale
inside a scrolling stage. Labels measure **10px on both viewports**, and the
audit fails the build below 6px.

Nineteen operator questions are answered by driving the UI — search narrows,
filters remove, isolation isolates, the inspector names the canonical writer
and renders DailyStat's recorded blind spot.

## OPERATOR_INFORMATION_HIERARCHY — STRONG

`/admin` opens on the three questions asked first — is anything broken, does
anyone need me, which customers are affected — then the follow-ups: what
changed, what intelligence has been doing, and the map to jump from.

## EMPTY_SPACE_PROBLEM — RESOLVED

Measured, not judged: the audit flags any `.card` taller than 220px holding
under 60 characters. It found one (273px, 44 chars) at laptop width; grid cards
now size to their content instead of stretching to the tallest sibling. Current
count across all scenarios and viewports: **zero**.

## RTL_QUALITY — STRONG

Every directional rule uses logical properties, so LTR is the same stylesheet
rather than a second, worse layout. The audit runs an LTR pass and asserts no
horizontal scroll. Identifiers — commit SHAs, routes, workspace ids — stay LTR
and monospaced inside Arabic prose, isolated so a mixed line does not reorder.

Timestamps were the RTL-adjacent defect the audit caught: raw ISO strings in
columns an operator scans. One formatter in the shell now renders them
readably, keeps them LTR, and preserves the exact instant on hover.

## STATUS_SEMANTICS_VISUALLY_DISTINCT — YES

Unchanged from `adminStatus.ts`, and now verified in the DOM: the audit reads
every rendered `.st-chip` and fails if an absence state lost its class or its
dashed border. The graph's runtime legend states the rule on screen — *absence
is drawn dashed, neither green nor red* — and no dashed node may carry a
verdict fill.

## LEGACY_VISUAL_LANGUAGE_REMAINING — 5 routes

They still carry their own chrome. That is the honest state: each renders
something the Control Plane does not, and doc 14 gives each a disposition and a
retirement condition. `/admin/os`'s condition is now met — its epistemic ladder
was ported to `/admin/intelligence#ladder`.

## What was deliberately not done

No minimap, edge labels, force layout, clustering, load animation, decorative
gradients, or scroll effects. Motion is limited to drawer, inspector, focus
dimming and skeletons, and `prefers-reduced-motion` collapses all of it. A
force layout would specifically break the property that makes two screenshots
of this graph comparable.
