# 09 — Visual system

One visual system, defined once in `src/web/adminShell.ts` and used by every
Control Plane surface. Values come from the existing Adlytic Daylight tokens
(`src/ui/tokens.ts` / `layout.ts`); no new palette was introduced.

## Principles

**Desktop-first.** This is an internal operations tool used on a large screen.
Grids collapse at 1100px and 720px so a phone is usable, but nothing is
compromised at full width to make that happen.

**RTL-first, LTR equally valid.** Every directional rule uses logical properties
(`border-inline-start`, `margin-inline-start`, `padding-inline-start`), so LTR
falls out of the same stylesheet rather than being a second, worse layout. The
attention drawer's slide direction flips via a `--drawer-out` custom property
rather than a duplicated rule.

**Technical identifiers stay LTR and monospaced.** A commit SHA, a route, a
`workspaceId` or a Meta account id renders in `--font-mono` with
`direction: ltr; unicode-bidi: isolate` inside Arabic prose — translating or
re-ordering them would reduce precision, which is the opposite of the point.

**Dense but calm.** 13.5px base, 1.55 line height, 7–9px cell padding. Tables
have sticky headers and hover rows. Cards hold related facts rather than one
enormous number each.

## What was removed

| Was | Now |
|---|---|
| Four different sidebars | one, from `ADMIN_IA` |
| Three header treatments | one topbar + one context bar |
| Pages with no context | context bar on every screen, always visible |
| Endless stacked diagnostic cards | secondary view strip; one question per view |
| Oversized cards with one number | compact status tiles with state + why |
| Raw engineer dumps as default | inspector on demand; JSON only where it *is* the answer |

## Status treatment

Unchanged from `adminStatus.ts` — the vocabulary was already right, and this
work reuses it rather than restyling it.

- Absence (`UNKNOWN`, `NOT_TESTED`, `INSUFFICIENT_DATA`, `NOT_GOVERNED`,
  `NOT_VETOED`, `NOT_REACHED`) is **always dashed and muted**. Never green,
  never red, in either direction.
- Colour is never the only signal: every state carries a distinct glyph and its
  own literal name, so meaning survives greyscale, colour-blindness and a
  screenshot pasted into a ticket.
- The graph's runtime legend states the rule in words, on screen: *"absence is
  drawn dashed — neither green nor red."*

A test asserts no new surface maps `UNKNOWN` to anything but the absence tone,
and that none renders `NOT_TESTED` as a verdict.

## Keyboard and accessibility

- **Ctrl-K** opens the command palette from anywhere; arrows move, Enter runs,
  Escape closes the palette and the drawer.
- Every interactive control has a visible `:focus-visible` ring.
- Graph nodes are `tabindex="0"` with `role="button"` and respond to Enter and
  Space; each carries a `<title>` for the accessible name.
- The sidebar is a labelled `<nav>`, the drawer and palette are labelled
  regions, and the view strip uses real `<button>` elements.

## Motion

Motion supports comprehension and nothing else: node focus dimming
non-neighbours, the inspector filling, the drawer sliding, skeletons while
loading, 150–180ms transitions. No decorative gradients, no scroll animation,
no entrance effects.

`@media (prefers-reduced-motion: reduce)` collapses every animation and
transition to 0.01ms.

## The graph's visual choices

**Deterministic layered layout, not force simulation.** Columns read
left-to-right as the system's own direction of flow — what Meta gives us, what
crosses the cordon, what reasons over it, where it is stored, what serves it,
what an operator sees. An operator comparing today's graph with yesterday's
screenshot needs the same node in the same place; a force layout moves
everything whenever one node is added, destroying exactly that comparison.
Determinism beats prettiness here.

**Mode changes paint, never layout.** Switching architecture → runtime → trace
never re-lays-out, never adds a node, never removes an edge. What moves is
colour and emphasis, which is what makes the three views comparable.
