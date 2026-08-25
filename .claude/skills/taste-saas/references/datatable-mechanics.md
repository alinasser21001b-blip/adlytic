# DataTable mechanics — universal

> Read when: building any list view (issues, sessions, customers, payments, deployments...). This file is **archetype-agnostic** — every recipe below works regardless of whether the project picked Archetype A (Linear-style pill rows), B (Vercel-style hairline rows), C (Notion-style hairline grid), or D (Stripe-style hairline-or-zebra). For the actual row look, see "Row visual style — pick per archetype" at the bottom.

List pages are 60% of the routes in a SaaS console, so the same `<DataTable>` shape appears over and over. The mechanics in this file (column alignment, cushion, sticky thead, header modes, filter chips, server contract, cache behavior) are what every archetype shares; only the per-row `<td>` className changes.

---

## Anatomy

```
┌── toolbar (--row-h) ─────────────────────────────────────────────┐
│ [Status ▾] [Priority ▾] [Assignee ▾] [Label ▾]   [search] [▦ Display] │
└──────────────────────────────────────────────────────────────────┘
┌── <main> scroll container (sticky thead inside, overscroll-y-none) ┐
│ ID    TITLE                STATUS    LABELS    ASSIGNEE    DUE   │  ← sticky <thead>
│ ─────────────────────────────────────────────────────────────── │
│  · row (style depends on archetype — see bottom) ·               │
│  · row ·                                                         │
└──────────────────────────────────────────────────────────────────┘
```

Three things sit in the toolbar at the top: **filter chips** (left), **search input** (middle/right), **Display button** (trailing). The whole toolbar is one `--row-h` row, sticky-able with the thead beneath.

---

## Three render-contract laws

These laws govern the `<table>` skeleton. Violate one and you get the classic list-page bugs (column drift, unreachable right cushion, mystery vertical band on the right edge). They're universal — they apply to every archetype.

### Law 1: Real `<table>` + `<colgroup>` + `table-layout: fixed`

The browser's `table-layout: fixed` algorithm reads `<colgroup><col style={{width}}>` ONCE and applies the same widths to `<thead>` AND `<tbody>`. Header and body **mathematically cannot drift**.

```tsx
<table className="w-full" style={{ tableLayout: "fixed" }}>
  <colgroup>
    {cols.map(c => <col key={c.id} style={{ width: c.size }} />)}
    <col />                                {/* trailing fake-space col — see Law 3 */}
  </colgroup>
  <thead className="sticky top-[var(--row-h)] z-10 bg-bg">
    <tr>
      {cols.map(c => <th key={c.id} className="text-left">…</th>)}
      <th />                               {/* trailing fake-space th */}
    </tr>
  </thead>
  <tbody>
    {rows.map(r => (
      <tr key={r.id}>
        {cols.map(c => <td key={c.id}>…</td>)}
        <td />                             {/* trailing fake-space td */}
      </tr>
    ))}
  </tbody>
</table>
```

Hand-rolled `div + flex` is the bug source: any non-cell child in the header row (a Display button, an `ml-auto` spacer) makes flex distribute leftover space differently in header vs body rows. Cells drift a few px per column, compounding rightward. `<colgroup>` removes the drift surface entirely.

### Law 2: Right cushion (`--page-pr`) needs `min-w-fit` on the padded element

Chrome bug 906463: when a flex parent has `padding-right` AND `scrollWidth > clientWidth`, the padding-right rectangle is NOT included in the scroll-reachable region. `scrollLeft` stops at the last cell's right edge; the cushion sits beyond, invisible.

The fix is one class on the inner cushion element:

```tsx
<div className="overflow-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">  {/* outer */}
  <div className="w-full min-w-fit"                                                  {/* ← critical */}
       style={{ paddingLeft: 'var(--page-pl)', paddingRight: 'var(--page-pr)' }}>
    <table>…</table>
  </div>
</div>
```

`min-w-fit` lets the inner element expand past `clientWidth` to encompass its content + padding. Now `padding-right` IS in `scrollWidth`, and `scrollLeft = scrollLeftMax` reveals the cushion. Hide the inner scrollbar because `<main>` already has the page-level one; two scrollbars on the same axis look broken.

### Law 3: Trailing fake-space `<col />` + matching empty `<th>`/`<td>` absorbs horizontal leftover

Two viewport states need different handling, and you want **one set of rules** that covers both:

- **Viewport wider than sum(cols)**: trailing auto-width `<col />` stretches to fill leftover space.
- **Viewport narrower than sum(cols)**: trailing `<col />` collapses to 0; horizontal scroll engages.

Solution: declare a trailing `<col />` (no width) plus empty `<th />` and `<td />` in every row. When the viewport is wide, the fake column absorbs the slack and prevents the last real column from accidentally stretching. When the viewport is narrow, the fake column disappears.

**Archetype-specific note:** if your archetype paints a per-row background (Archetype A's pill), apply that bg to both the last real `<td>` AND the trailing fake `<td>` so the row treatment spans the absorbed width. Archetypes B/C/D leave the trailing td bare since they don't paint per-row bg. See archetype files for the exact className.

---

## Sticky thead inside `<main>`

`<thead className="sticky top-0">` (or `top-[var(--row-h)]` if the toolbar above is also sticky) works natively when `<table>` is a direct child of the scroll container. Use ONE `<table>` — don't split into a fixed header table + scrolling body table; the columns will fight to stay aligned. `<colgroup>` already solved alignment for you.

**macOS rubber-band**: when `<main>` is the scroller and you sticky-pin the thead, the bounce on overscroll lifts the thead off the top and reveals the bg underneath. Kill it with `overscroll-y-none` on `<main>`.

---

## Cell internals — inner flex div, NOT `vertical-align: middle`

`<td>` is a width slot. Put a `<div className="flex items-center h-full">` inside every cell to handle the actual layout (icon + text, badge + truncate, avatar stack). `vertical-align: middle` aligns baselines, not bounding-box midlines, so mixed-content cells (an avatar next to a single-line label) look subtly off.

```tsx
<td>
  <div className="flex items-center h-full min-w-0 px-3">
    <Icon className="size-4 shrink-0" />
    <span className="ml-2 truncate">{value}</span>
  </div>
</td>
```

`min-w-0` lets `truncate` work inside flex (flex children default to `min-width: auto` = content-size, which never truncates).

---

## Cell padding lives on the inner div, NOT on `<td>`

When the archetype paints a row hover state (every archetype does, even if just a faint bg tint), the hover bg paints whatever the `<td>` covers. If the `<td>` has `padding-right: 12px`, the hover bg paints that 12px gap too — bleeding visually into the next cell.

Put `px-3` on the **inner flex div** instead. The `<td>` stays bare; the inner div holds the padding; the hover bg now stops at the visual cell edge.

```tsx
<td>
  <div className="flex items-center h-full min-w-0 px-3">…</div>  {/* px-3 here */}
</td>
```

---

## Three header modes

Every column header is one of three things. Pick per column via `meta.headerMode`.

- **`static`** — a plain label. No cursor, no hover, no button. Use for columns where sorting + hiding don't apply (avatar stack, computed group).
- **`sort`** — a button that toggles sort cycle on click (asc → desc → unsorted). Shows `ChevronsUpDown` (idle) / `ArrowUp` / `ArrowDown` (active) on the right. Use when sort is the only header action.
- **`menu`** — a button that opens a popover with `Sort asc / Sort desc / Group by / Hide column`. Use when the column needs hide / group affordances.

**Padding lives on the inner button, NOT on the `<th>` wrapper.** Same reason as cells — if the button has its own hover bg, the bg should paint the visual button area, not the full cell width.

```tsx
<th className="text-left">
  <button className="flex items-center h-full px-3 hover:bg-bg-hover w-full">
    <span className="text-xs text-fg-muted">{label}</span>
    <SortIndicator dir={dir} className="ml-auto" />
  </button>
</th>
```

---

## Compact column groups — `meta.compact`

When a row has multiple narrow leading cells that semantically belong together (priority arrow + ID `ENG-123`, status icon + ID), default per-cell `px-3` leaves 24px between two glyphs that should read as one tight unit.

Solution: `meta.compact: 'left' | 'right' | 'both'` flag on the column def. The cell renderer drops the corresponding side padding on those cells so adjacent compact columns visually merge:

```ts
{ id: "priority", size: 32, meta: { compact: "right" }, … },
{ id: "id",       size: 76, meta: { compact: "left"  }, … },
// renders "[↓ ENG-123]   Title" instead of "[ ↓   ENG-123    Title]"
```

Use sparingly — only for true visual groups, not as a workaround for over-wide columns.

---

## Alignment defaults

Left-align by default. **Right-align is reserved for long numeric columns where digit-stack alignment helps scanning** — currency totals, vote counts, durations with hours, file sizes. Short numeric content (1–2 digit counts, ISO short dates `Jul 15`, relative times `2h ago`) reads better left-aligned with the rest of the table.

Mixing right- and left-aligned columns creates a visual zigzag — the eye keeps re-anchoring. Reach for `align: "right"` only when content is provably long enough that digit-stack alignment improves scanning, OR when it's a **trailing action column** (Manage / Edit / `⋯` menu) by convention.

Whenever you do right-align numeric columns, apply `font-variant-numeric: tabular-nums` (`tabular-nums` in Tailwind) — without it, proportional digits negate the alignment benefit.

---

## Icon-only column — header label MUST be empty

A 32px-wide priority column with `header: "Priority"` will render the word "Priority" overflowing into the next column. Either widen the column or set `header: ""`. The glyph is self-evident at this size.

---

## Filter chips in the toolbar

Pattern: one chip per filter dimension, popover-anchored multi-select. Decoration follows selection — at rest the chip is naked text + chevron; when active it gets a brand pill outline + clear-X.

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button className={cn(
      "inline-flex items-center gap-1 h-7 px-2 text-sm shrink-0 transition-colors outline-none",
      active
        ? "rounded-full border border-brand/40 text-brand bg-brand-subtle"
        : "text-fg-muted hover:text-fg rounded-md",
    )}>
      <span>{label}</span>
      {active && display && <span className="font-medium max-w-[14ch] truncate">: {display}</span>}
      {!active && <ChevronDown className="size-3" />}
      {active && <ClearXButton onClick={onClear} />}
    </button>
  </PopoverTrigger>
  <PopoverContent align="start" sideOffset={4} collisionPadding={8} className="p-0 w-auto">
    <Command className="w-[220px]">
      <CommandInput />
      <CommandList>{options.map(opt => <CommandItem key={opt.value} … />)}</CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

**`collisionPadding={8}`** is mandatory — this is what stops the popover spilling past the card right edge in narrow containers, without resorting to fixed max-width hacks. Radix Floating UI auto-flips and shifts within the budget.

Use cmdk-inside-Popover NOT a DropdownMenu for facet selection. cmdk inside Radix Menu fights for focus / keyboard control; Popover has identical Floating-UI auto-flip without the menu semantics in the way.

---

## Server-side filtering — the contract

Filters MUST round-trip to the server. Client-side `.filter()` over loaded rows lies when more pages exist.

| Param            | Type        | Notes                              |
|------------------|-------------|------------------------------------|
| `status`         | enum        | strict validation, typed 400       |
| `created_after`  | epoch ms    | `Date.parse`, 400 on `NaN`         |
| `created_before` | epoch ms    | same                               |
| `q`              | string      | LIKE on a designated text field    |
| `sort`           | `field:dir` | only when header mode is sort/menu |

Errors return the structured envelope:

```json
{ "type": "error", "error": { "type": "invalid_status", "message": "..." } }
```

Frontend reads it via `ApiError.code === "invalid_status"`. NEVER `error.message.includes(...)`.

---

## Data layer — keep previous results across param changes

When a filter chip changes the request params, the query key changes, and the cache layer would normally toss the old data and re-skeleton from empty — every chip click flashes "loading". The fix is universal: **keep the previous result rendered while the new fetch runs**. Without this, **filter chips look broken even though they work**.

Reference impl (TanStack Query):

```tsx
return useQuery<T>({
  queryKey: [path, normalizedParams],
  queryFn: ({ signal }) => api<T>(buildUrl(path, normalizedParams), { signal }),
  enabled: (opts.enabled ?? true) && !!path,
  placeholderData: keepPreviousData,
  staleTime: opts.staleTime ?? 30_000,
});
```

SWR has `keepPreviousData: true`. Vue Query has the same flag. Hand-rolled fetch hook? Hold the last successful response in state, render it through the next `loading` cycle.

---

## Column-visibility "Display" button — always in the trailing fake-space

Every list page ships a `<DisplayColumnsButton />` in the toolbar's trailing fake-space (anchored right with `ml-auto`). It opens a popover with one toggle per column. The page owns the visibility state (`Record<columnId, boolean>`) and passes it back via `columnVisibility` + `onColumnVisibilityChange` props.

This button is non-negotiable. If a header-menu "Hide column" affordance exists, the user can hide a column but has **no way to un-hide it** without this button. Hide-via-popover without a re-show surface is a one-way trip — broken UX.

---

## Pagination default — cursor-paginated infinite scroll

`IntersectionObserver`-driven LoadMoreRow at the bottom of `<tbody>`, fetching the next page when in view. Use Prev/Next + numbered tiles only when the user explicitly needs to jump pages (admin/financial archetypes — see Archetype D — typically prefer numbered pagination because the audience counts on page boundaries).

---

## Verification protocol

Open the page at three viewports — **wide** (sum < viewport, trailing stretches), **medium** (sum ≈ viewport), **narrow** (sum > viewport, scroll engages). For each:

- Header cells line up pixel-perfect with body cells (probe with `getBoundingClientRect()` if needed; widths should be identical column-by-column).
- Scrolling horizontally to the rightmost position reveals `--page-pr` cushion on the right (symmetric with the left cushion at scrollLeft=0).
- Sticky thead doesn't lift on macOS rubber-band scroll.
- An empty list shows the empty state centered in the table area; a short list shows the "N results" footer anchored to the table area's bottom.

If any of these fail, one of the three laws was violated — check colgroup, `min-w-fit`, or the trailing fake-space col + td.

---

## NEVERS — universal violations

- **DataTable that hand-rolls column alignment in div+flex** (no `<colgroup>`, no `table-layout: fixed`). Violates Law 1: any non-cell child in the header row drifts cells out of sync with body. Use a real `<table>` + `<colgroup>`.
- **Missing `min-w-fit` on the inner cushion column.** Violates Law 2: the right `--page-pr` cushion is unreachable by horizontal scroll (Chrome bug 906463). Add `min-w-fit` on the element carrying `padding-right`.
- **No trailing fake-space `<col />` + `<td>`.** Without it, the last real column stretches awkwardly on wide viewports, and the row visual (any archetype's per-row treatment) ends mid-table on narrow viewports.
- **Cell padding on `<td>` instead of inner flex div.** Hover-bg bleeds past the visual cell. Move `px-3` to the inner div.
- **`vertical-align: middle` instead of an inner `flex items-center` div.** Aligns baselines, not midlines; mixed-content cells look subtly off.
- **Click-header sort that runs client-side over loaded rows.** Order is whatever the server returns; client sort lies when more pages exist. Same for client-side free-text filter.
- **Error dispatch via `err.message.includes(...)` string matching.** Use the typed envelope's `error.code`.
- **A "Hide column" affordance with no global "Display" button to un-hide.** Hiding becomes a one-way trip. Display button is mandatory.
- **Two scrollbars on the same axis** (inner `overflow-auto` showing its scrollbar alongside `<main>`'s page-level scrollbar). Hide the inner one with `[&::-webkit-scrollbar]:hidden [scrollbar-width:none]`.
- **Reaching past the data hook to hand-roll `useEffect` + `setState` for fetching, or `setInterval`/`setTimeout` for polling.** Use the query lib's `refetchInterval`. It already dedups concurrent requests.

---

## Row visual style — pick per archetype

The actual look of a row body — pill vs hairline-divided vs zebra — is decided by the **structural archetype**, NOT by this file. The `<table>` + `<colgroup>` skeleton above is identical across all four archetypes; only the `<td>` className (and whether the trailing fake-space `<td>` carries the row treatment) changes.

- **Archetype A — pill rows.** Each `<td>` gets `bg-bg-surface/50 hover:bg-bg-surface`; first cell `rounded-l-md`, last real cell + trailing fake `<td>` both `rounded-r-md`. Row gap from `border-collapse: separate` + `border-spacing: 0 6px`. See `references/archetype-a-floating-card.md`.
- **Archetype B — hairline rows, no per-row bg.** Each `<tr>` gets `border-b border-border/50`; hover sets a whole-row `bg-bg-hover`. Trailing fake `<td>` stays bare. See `references/archetype-b-flush-pane.md`.
- **Archetype C — hairline grid.** `<tr>` gets `border-b`; no hover bg (document feel). Looks like a printed table. See `references/archetype-c-document.md`.
- **Archetype D — hairline OR zebra.** Either `<tr>` gets `border-b border-border/40`, OR `<tr:nth-child(even)>` gets a faint `bg-bg-surface/30`. Sticky leftmost column for wide tables. See `references/archetype-d-data-table.md`.

When in doubt about which to pick, re-read `references/structural-archetypes.md` — the archetype decision happens before any list-page work, and this file's mechanics drop in unchanged once that decision is made.
