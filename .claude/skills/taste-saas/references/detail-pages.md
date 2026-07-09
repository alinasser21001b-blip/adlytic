# Detail pages — wireless body, breadcrumb leaf, right rail or single column

Detail pages are the second-most common archetype after list pages. They render ONE entity — an issue, a project, a session, a customer, a workflow run. Visit pattern: list → click row → detail. Back: breadcrumb or browser back.

## Three layout archetypes — pick by content shape

The wrong default is "always use the same layout". The right call depends on whether the entity is mostly **content** (long-form text), **metadata** (many small fields), or **timeline** (chronological events).

### A. Single column, max-w-3xl — reading-first

For entities whose primary surface is a body of prose / markdown / code (a doc, a wiki page, a deeply commented issue). Like GitHub Issues, Notion pages.

```
┌──────────────────────────────────────────────────────────┐
│ Pulse / Issues / DES-101                                 │  ← breadcrumb (in top chrome row, not body — stage row in Archetype A, inline top bar in B/D, page title row in C; see references/archetype-*.md)
├──────────────────────────────────────────────────────────┤
│         ┌─ max-w-3xl, mx-auto ─┐                         │
│         │ # Title              │                         │
│         │ [field strip]        │                         │
│         │                      │                         │
│         │ body markdown…       │                         │
│         │                      │                         │
│         │ Sub-issues           │                         │
│         │ Activity feed        │                         │
│         └──────────────────────┘                         │
└──────────────────────────────────────────────────────────┘
```

`pt-6 pb-12 px-6 space-y-6 max-w-3xl mx-auto`. Whitespace on the sides is the design. **Never widen this past `max-w-3xl`** (~48rem) — body text becomes uncomfortable past ~80ch. Field strip wraps inline at the top; activity feed is single-column below.

### B. 2-column with right rail — metadata-heavy, Linear-style

For entities with many small fields users scan / edit constantly — Linear issues, Jira tickets, Stripe charges, Datadog dashboards' run drawer. Body is medium-width; right rail holds stacked metadata.

```
┌──────────────────────────────────────────────────────────┐
│ Pulse / Issues / DES-101                                 │
├─────────────────────────────────┬────────────────────────┤
│ # Title                         │ 🔗 📋 🌿 🔔        ⋯  │  ← quick actions strip
│ description                     │ ┌──────────────────┐   │
│                                 │ │ PROPERTIES       │   │  ← card 1
│ Sub-issues                      │ │ Status   In Prog │   │
│ Activity feed                   │ │ Priority Low     │   │
│ Comment composer                │ │ Assignee P. Patel│   │
│ ↓ scroll independently ↓        │ └──────────────────┘   │
│                                 │ ┌──────────────────┐   │
│                                 │ │ LABELS           │   │  ← card 2
│                                 │ │ ● feature        │   │
│                                 │ └──────────────────┘   │
│                                 │ ┌──────────────────┐   │
│                                 │ │ PROJECT          │   │  ← card 3
│                                 │ │ Pulse 2.0 launch │   │
│                                 │ │ Due May 15       │   │
│                                 │ └──────────────────┘   │
└─────────────────────────────────┴────────────────────────┘
```

**Two-column shell with INDEPENDENT scroll containers** — body scrolls, rail does NOT (or scrolls separately). Linear, Jira, GitHub Issues all do this. Implementation:

```tsx
<div className="h-full grid grid-cols-[minmax(0,1fr)_300px] divide-x divide-border/60 overflow-hidden">
  <article className="min-w-0 overflow-y-auto px-6 pt-6 pb-12 space-y-6">
    {/* body */}
  </article>
  <aside className="overflow-y-auto px-3 pt-3 pb-12 flex flex-col gap-3">
    {/* top quick actions strip */}
    <div className="flex items-center gap-1">
      <IconBtn icon={Link2} label="Copy link" />
      <IconBtn icon={Copy} label="Copy ID" />
      <IconBtn icon={GitBranch} label="Copy branch" />
      <IconBtn icon={Bell} label="Subscribe" />
      <div className="flex-1" />
      <IconBtn icon={MoreHorizontal} label="More" />
    </div>
    {/* grouped property cards */}
    <RailCard title="Properties">…</RailCard>
    <RailCard title="Labels">…</RailCard>
    <RailCard title="Project">…</RailCard>
  </aside>
</div>
```

Why NOT `position: sticky` on the rail? Sticky needs a clear scroll-context ancestor. When the page lives inside `<main className="overflow-auto">` and the rail is inside a grid cell two levels deep, sticky often resolves to the wrong ancestor (or to `static` entirely under certain Tailwind/grid combinations) and the rail scrolls with the body. **Two independent overflow containers is bullet-proof** — neither column can ever drag the other.

`divide-x divide-border/60` on the parent grid gives a single hairline between the two columns — visual isolation between body content and metadata without a heavy border. Rail width: `280–320px`. Below 280 it's cramped; above 320 it eats into reading width.

**Rail content structure — Linear convention:**

1. **Quick actions strip** at the top: 4–6 round icon buttons (copy link, copy ID, copy git branch, subscribe/notifications, plus an overflow `⋯`). These are page-level operations distinct from the entity's metadata.
2. **Grouped property cards** below — each card is `bg-bg-surface/40 rounded-lg p-3` (visual treatment is Archetype A flavored; B/C/D use their own surface conventions — see `references/archetype-*.md`) with a small uppercase title (`text-xs font-medium text-fg-subtle uppercase tracking-wider`) and a column of `label / value` rows. **Group by semantic meaning**, not by alphabetical order:
   - **Properties**: status, priority, assignee — the "who/what state" triple.
   - **Labels**: tag cluster + "Add label" empty state if none.
   - **Project / Relations / Dates**: project link, parent issue, due date, cycle / sprint.
3. **Cards separate semantic groups**; rows inside a card belong together. Each card row is a single `h-6 flex items-center gap-2` line with a `w-16` left label slot (uppercase `text-xs text-fg-subtle`) and the value to the right. NOT label-on-top stacked — that's a wider rail layout and Linear's narrow rail uses inline `label | value`.

Pick this when the entity has **6+ metadata fields**. The card grouping kicks in around **8+ fields** — below that, a single ungrouped column is fine.

### Notion-style alternative — top properties strip, single column

For doc-first products (wikis, Notion-clone pages, content CMS), skip the right rail entirely. Properties live in a **table at the top of the body** above the heading, then a single-column `max-w-3xl` body below. Same archetype A skeleton but with properties as a header-strip table instead of an inline pill row.

Trade-off: Notion's pattern works when metadata changes infrequently and the body is the primary surface. Linear's right-rail pattern works when metadata changes constantly and stays in view as the user reads/edits. Most SaaS consoles (Jira, Stripe, Datadog, Sentry, Linear) chose right-rail; only doc tools (Notion, Confluence, Coda) chose top-strip. **Pick by how often users edit metadata** — frequent → rail; rare → top-strip.

### C. 3-pane — list + detail + meta, Gmail/Linear-inbox style

For workflows where the user reads / triages many entities in a row without going back to a list. Gmail inbox, Linear inbox, Notion comments view.

```
┌──────────────────────────────────────────────────────────┐
│ ┌─ list ──┐ ┌─ entity body ──────┐ ┌─ meta ──────┐       │
│ │ • item  │ │ # Title             │ │ Status      │       │
│ │ • item  │ │ description         │ │ Assignee    │       │
│ │ • item  │ │ activity            │ │ Labels      │       │
│ │ * item  │ │ composer            │ │             │       │
│ └─────────┘ └─────────────────────┘ └─────────────┘       │
└──────────────────────────────────────────────────────────┘
```

`grid-cols-[260px_1fr_260px]`. The list pane replaces sidebar navigation while the user is in triage mode. **Reserve for inbox-like pages only.** A generic entity detail doesn't need 3 panes.

## Breadcrumb leaf is the entity id, not a duplicate title

The breadcrumb in the AppShell's top chrome row (stage row in Archetype A, inline top bar in B/D, page title row in C — see `references/archetype-*.md`) already shows `Pulse / Issues / DES-101`. **Do NOT add a `<h2>DES-101</h2>` row at the top of the body** — Redundancy is the cardinal sin. The body opens directly with the entity's title (the page's `<h1>`).

The breadcrumb leaf is read from route metadata (`handle.crumb`, `meta.crumb`, etc.) — the page sets `crumb: () => issue.id` once and the AppBreadcrumb renders it. Don't render the id inside the body except in places that have semantic meaning (e.g. linking to a parent issue via `#ENG-117`).

### Sub-entity (parent-child) breadcrumb chain

When a detail page shows an entity that has a parent (sub-issue under an issue, page under a parent page, run under a workflow), the breadcrumb MUST include the parent so the chain reads `Pulse / Issues / DES-101 / ENG-138` — not just `Pulse / Issues / ENG-138`. The parent crumb is **fetched, not routed** (you only know the parent after the entity data loads), so static `handle.crumb` can't produce it.

Pattern: expose a `setExtraCrumbs(crumbs)` setter on the outlet context. The detail page calls it from a `useEffect` once it knows the parent, and the AppBreadcrumb component inserts those extras **between the parent route's crumb and the leaf**:

```tsx
// AppShell.tsx — outlet context
type Crumb = { to?: string; label: string };
type AppOutletContext = {
  // …
  setExtraCrumbs: (crumbs: Crumb[]) => void;
};

// AppBreadcrumb
function AppBreadcrumb({ extra }: { extra: Crumb[] }) {
  const routeCrumbs = useMatches()
    .map((m) => (m.handle as any)?.crumb?.(m))
    .filter(Boolean);
  const crumbs =
    extra.length === 0 || routeCrumbs.length < 2
      ? routeCrumbs
      : [
          ...routeCrumbs.slice(0, -1),  // parent route crumbs
          ...extra,                       // injected parent-entity crumbs
          routeCrumbs[routeCrumbs.length - 1],  // leaf
        ];
  // render…
}

// Detail page
React.useEffect(() => {
  if (!ctx.setExtraCrumbs) return;
  if (issue?.parentId) {
    ctx.setExtraCrumbs([
      { to: `/issues/${issue.parentId}`, label: issue.parentId },
    ]);
  } else {
    ctx.setExtraCrumbs([]);  // clear when not sub
  }
  return () => ctx.setExtraCrumbs([]);  // clear on unmount
}, [issue?.parentId]);
```

The same pattern handles deeper chains — `setExtraCrumbs([{to:'/projects/X', label:'X'}, {to:'/projects/X/Y', label:'Y'}])` for a grandchild.

Equivalents in other routers: Next.js App Router uses parallel layouts to compose breadcrumbs; TanStack Router uses `meta` + parent route loaders; Remix uses the same `handle.crumb` pattern as React Router. Whichever, the route's static crumb only knows what the URL knows — fetched relationships need a separate injection mechanism.

## Field strip vs right rail — same fields, two surfaces

Both layouts list the entity's metadata: status, priority, assignee, labels, due date, project link. The only difference is **inline strip** (archetype A — flex-wrap row of pills) vs **stacked rail** (archetype B — column of label/value rows).

Pick by field count:
- **≤ 5 fields**: inline strip (archetype A or as an intro row in archetype B).
- **6–12 fields**: right rail.
- **> 12 fields**: collapsible groups in right rail (Linear's `... 5 more` reveal).

Never duplicate — if a field shows in the strip, it doesn't show in the rail too. Pick one surface per field per layout.

## Wireless body — no section borders

This is the same rule from the trunk SKILL.md: between body sections (Description / Sub-issues / Activity / Comments) use **whitespace + a faded uppercase section label**, not `<hr>` or `border-b`. Background tints are OK (`bg-bg-surface/40 rounded-lg p-4`) when a section needs visual grouping (e.g. an inline comment composer that should look like a box).

```tsx
<section className="space-y-2">
  <h2 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Activity</h2>
  <ActivityFeed events={events} />
</section>
```

Section heading is `text-xs uppercase tracking-wider text-fg-subtle` — the same micro-label style as DataTable column headers. Body sections separated by `space-y-8`.

## No back-link row

The breadcrumb is the back affordance. Don't add `← Back to Issues` at the top of the body. Browser back works. `g i` (the `g+letter` chord — see `references/overlays-and-keyboard.md`) is faster.

## Activity feed — visual contract

The vertical timeline showing what happened on the entity is its own design surface. Rules:

- **Each event = `<li>` with avatar, actor name, verb, optional object, timestamp.** "Aria changed status to Done" — verb leads, not "status changed from X to Y by Aria".
- **System events** (status change, assignment, label) are single-line, low contrast (`text-fg-muted`).
- **User events with content** (comments) have a slightly raised background (`bg-bg-surface/60 rounded-lg p-3`) to separate the body from the system events.
- **Timestamp** is relative ("3h ago", "yesterday") with full date in `title` tooltip. `tabular-nums`.
- **Single connector line** runs vertically through the CENTER of each event's marker (avatar). NOT two parallel lines. Implementation: pseudo-element on the `<ol>` at `left = marker_size / 2`, with each marker carrying `ring-2 ring-bg` so the line is visually "cut" by the marker — it appears to pass THROUGH, not next to.
- **Newest first** unless the user is mid-conversation (then chronological with the composer pinned at bottom).

The single-line + ring-cut recipe is non-obvious to get right. Wrap it in a reusable component (e.g. `<Timeline>` + `<TimelineItem>`):

```tsx
// ui/timeline.tsx
export function Timeline({ markerSize = 24, ...p }) {
  return (
    <ol
      {...p}
      style={{ "--tl-marker": `${markerSize}px`, ...p.style }}
      className={cn(
        "relative flex flex-col gap-3",
        "before:absolute before:top-2 before:bottom-2 before:w-px before:bg-border",
        // Line sits at the marker's centerline.
        "before:left-[calc(var(--tl-marker)/2)]",
        p.className,
      )}
    />
  );
}
export function TimelineItem({ marker, header, meta, body, ...p }) {
  return (
    <li {...p} className={cn("relative flex items-start gap-2", p.className)}>
      <div
        // ring-2 ring-bg punches a hole through the line at this marker's
        // spot, so the line APPEARS to pass through the marker instead
        // of running parallel to it.
        className="relative z-10 shrink-0 rounded-full ring-2 ring-bg"
        style={{ width: "var(--tl-marker)", height: "var(--tl-marker)" }}
      >
        {marker}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {header && <div className="text-sm">{header}</div>}
        {meta && <div className="text-xs text-fg-subtle tabular-nums">{meta}</div>}
        {body && <div className="mt-2 text-sm">{body}</div>}
      </div>
    </li>
  );
}
```

Then pages just:

```tsx
<Timeline markerSize={24}>
  {events.map(e => (
    <TimelineItem
      key={e.id}
      marker={<Avatar name={e.actor.name} size={24} />}
      header={<><b>{e.actor.name}</b> {e.verb}</>}
      meta={formatRelative(e.at)}
      body={e.body && <div className="bg-bg-surface/60 rounded-lg p-3">{e.body}</div>}
    />
  ))}
</Timeline>
```

**Don't reach for `@mui/lab` Timeline or other third-party libs** — they bring tons of weight for what is ~50 lines of CSS. The `ring-2 ring-bg` cut trick is the only non-obvious bit; once wrapped in a component, every detail page reuses it identically.

## Comment composer

If the entity supports comments, the composer goes at the **bottom of the activity feed**, pinned visually (not `position: sticky`) — composer is a flush part of the feed, not a separate dock. Auto-grow textarea + `Cmd+Enter` to submit. Disabled submit button while empty.

Avoid having the composer always-visible at top; users get distracted from reading the feed if the composer is in their face.

## Inline edit — every field, no edit modal

Modal-based editing of a detail page is anti-pattern. Each field in the right rail or strip should be **click-to-edit**:

- **Rest state**: value text + faint pencil on hover.
- **Edit state**: replaces value with input/select/popover. Esc cancels, Enter / blur commits.
- **Pending state**: brief opacity dim + spinner; reverts on error.

See `references/forms.md` (to be written) for optimistic update pattern. The key UX detail: **never block the field with a modal** — that's two extra clicks and breaks flow. Field-level inline edit is the Linear / Notion feel.

For complex fields (rich markdown body, code) a "full edit" modal IS OK — but invoked from the field itself, not from a separate toolbar.

## Sticky meta strip — optional, only for tall scrolling pages

> **Archetype A flavored visuals.** The `bg-bg/95 backdrop-blur` recipe below is the Archetype A treatment; B/C/D adapt the surface to their own conventions. The mechanic (sticky condensed strip on tall pages) is universal — see `references/archetype-*.md`.

If the body is long enough that the user scrolls past the field strip and loses context, sticky the strip:

```tsx
<div className="sticky top-0 z-10 bg-bg/95 backdrop-blur -mx-6 px-6 py-2">
  {/* condensed strip: just title + status + assignee */}
</div>
```

`backdrop-blur` + 95% opacity bg so content shows through faintly while scrolling. **Only condensed** version (3 fields max) in sticky mode — don't sticky the full strip, it eats vertical space.

Archetype B (right rail) doesn't need this — the rail is already an independent scroll column that never moves with body scroll.

## Skeleton must mirror the full layout

Loading state isn't "show a spinner" or "show one bar where the title goes" — it's **the same component shapes the loaded state will render**, in the same positions. Loading → loaded should produce zero layout jump (no flash, no scroll-position reset, no rail width change).

For archetype B specifically, the skeleton is the same 2-column shell + same paddings + placeholder rectangles where each section will appear:

```tsx
if (isLoading) {
  return (
    <div className="h-full grid grid-cols-[minmax(0,1fr)_300px] divide-x divide-border/60 overflow-hidden">
      <div className="min-w-0 overflow-y-auto px-6 pt-6 pb-12 space-y-6">
        <div className="h-9 w-3/4 bg-bg-surface rounded animate-pulse" />          {/* title */}
        <div className="space-y-2">                                                {/* body */}
          <div className="h-4 w-full   bg-bg-surface rounded animate-pulse" />
          <div className="h-4 w-11/12 bg-bg-surface rounded animate-pulse" />
          <div className="h-4 w-5/6   bg-bg-surface rounded animate-pulse" />
        </div>
        <div className="space-y-3">                                                {/* activity */}
          <div className="h-3 w-16 bg-bg-surface rounded animate-pulse" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="size-6 rounded-full bg-bg-surface animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-3 w-1/3 bg-bg-surface rounded animate-pulse" />
                <div className="h-3 w-16 bg-bg-surface rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pt-6 pb-12 space-y-5">                                  {/* rail */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-12 bg-bg-surface rounded animate-pulse" />
            <div className="h-5 w-24 bg-bg-surface rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

Key rules:
- **Same outer shell** (grid, divide-x, overflow). The page chrome MUST appear instantly.
- **Same paddings**. `px-6 pt-6 pb-12` body and `px-5 pt-6 pb-12` rail. Anything different and rows reflow when data arrives.
- **One placeholder per real section**: title → 1 bar; body → 3 staggered bars (mimics ragged paragraph end); activity → 5 avatar rows; rail → 6 stacked label/value pairs. Section labels (`h-3 w-16`) are also skeletoned because they appear instantly in the loaded state too.
- **Decreasing widths** in body lines (`w-full`, `w-11/12`, `w-5/6`) so it reads as multi-line text, not a uniform block.
- **Avatar circles match real avatar size** (`size-6` here for `size={24}`). If the loaded avatar is larger, the row jumps.
- **`animate-pulse` everywhere bg-bg-surface is used as a placeholder.** Without it, skeleton reads as broken empty cells.

The single-bar `<div className="h-6 w-1/2 bg-bg-surface rounded animate-pulse" />` skeleton is wrong — the page reflows entirely when data arrives, scroll position resets, and the user sees a "loading screen → app screen" transition instead of a smooth paint-in.

## NEVERS

- A redundant `<h2>{entity.id}</h2>` at the top of the body when the breadcrumb already shows it. Pick one surface.
- A back-link row (`← Back to Issues`). Breadcrumb covers it.
- `border-b` between body sections. Use `space-y-8` + faded section labels.
- A right rail using `position: sticky` instead of an independent overflow column. Sticky breaks under common grid + main-overflow ancestor chains (resolves to static, drifts with body scroll). Use two independent `overflow-y-auto` columns inside `h-full grid grid-cols-[1fr_300px] overflow-hidden divide-x divide-border/60`.
- A right rail with no visual divider from the body. The columns blur together; hairline (`divide-x divide-border/60` on the grid OR `border-l` on the rail) gives the necessary content-vs-metadata isolation Linear / Jira / GitHub all use.
- Edit modal for a single field. Inline edit. Modal is reserved for create / multi-field bulk edits.
- Right rail wider than `280–320px`. Past that it's a sidebar; rail is a thin column of fields.
- Hand-rolled timeline that paints a vertical line via pseudo-element on the `<ol>` AND adds a separate `<span absolute>` dot per item — that's two parallel lines + dots competing visually. Use a single line on the parent at the marker's centerline (`left = marker_size / 2`), with each marker carrying `ring-2 ring-bg` to "cut" the line — the line then visually passes THROUGH the marker. Wrap the recipe in a `<Timeline>` component and reuse.
- An activity feed that lists events oldest-first when the conversation is closed / archived. Newest-first for triage; oldest-first only during active chat.
- A "Save changes" button anywhere except modals. Inline edits commit on blur / Enter.
- Comments rendered as raw text without an actor avatar + name + timestamp triple. Without those three, it's just an unattributed blob.
- A detail page that renders before data loads, with placeholder zeros. Use skeleton with the same layout shape so loading → loaded has zero jump (see `references/empty-states.md`).
- A skeleton that's just a single `<div className="h-6 w-1/2 ...animate-pulse" />`. The page reflows entirely when data arrives. Mirror the FULL layout (outer shell + each section's placeholder rectangles); see *Skeleton must mirror the full layout* above.
- A sub-entity detail page that shows `Pulse / Issues / ENG-138` instead of `Pulse / Issues / DES-101 / ENG-138`. Parent chain MUST appear in the breadcrumb. Inject fetched parent crumbs via an outlet-context setter (`setExtraCrumbs`); the static `handle.crumb` doesn't know about parent relationships because they live in the entity, not the URL.
