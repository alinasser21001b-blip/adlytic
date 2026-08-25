# Archetype D — Enterprise data table

> Read when: you've decided this archetype in step 0 (see `references/structural-archetypes.md`).
> The universal mechanics (alignment, wireless tokens, datatable bones) live in `references/archetype-a-floating-card.md`, `references/wireless-tokens.md`, `references/datatable-mechanics.md` and apply here too. THIS file only defines what's UNIQUE to Archetype D.

## When to pick this archetype

The product **IS the data**. High-density financial / admin / data tooling where users count rows, sort, filter, and export — they don't want chrome, they want pixels of data. Sidebar is utilitarian; the table fills the rest. No card, no float, no shadow, no decoration. Information density is the only goal. Anchor products: **Stripe Dashboard** (payments, customers, disputes), **Plaid** (transactions, items), **Retool** (internal admin), **Airtable** (database grid).

## Structural recipe — the unique decisions

### Sidebar

> **Universal alignment laws still apply.** The icon SLOT rule (every row's first child is a fixed-size `<span class="size-N grid place-items-center">` slot wrapper) and the X-axis padding lock (every row in the sidebar shares the SAME outer + inner padding so icon centers land on one vertical line) come from `references/alignment-invariants.md`. Without these, the brand mark in the SidebarHeader and the nav-row icons end up on different x-axes — a misalignment of even 2 px reads as broken. D's slim utilitarian style does not exempt it from this.

- **Bg color**: `--bg-sidebar` is 3–5% darker than `--bg` — same range as B but the sidebar feels even more utilitarian (no labeled groups, no flashy chrome).
- **Border-r**: **YES** — `border-r border-border` hairline. Defines the panel.
- **Padding**: `px-2` outer (use this same value for SidebarHeader, SidebarContent, SidebarFooter — non-negotiable so x-axis stays locked).
- **Nav item style**: **flat text list, slim**. `h-7` row, **mandatory `size-4` icon SLOT** in the first child position (so the brand mark in the header and every nav icon share one vertical line), `text-sm`. Minimal decoration. Groups separated by `space-y-px` + a small label only when needed (Stripe groups "Payments / Connect / More" with tiny labels).
- **Active indicator**: **text-only highlight** (`text-fg font-medium`) on a faint `bg-bg-surface/40` row OR a thin `border-l-2` accent bar. Pick one and stick with it.
- **Width**: **`w-48` to `w-56`** — slim. The table needs every horizontal pixel; sidebar is reference, not workspace.
- **Sidebar bottom**: small status row (Stripe shows test/live mode toggle here), then a user avatar. Compact.

```tsx
{/* Universal: every row's first child is the icon SLOT, identical class
    across SidebarHeader, every NavItem, and the footer user row. Brand
    mark goes INSIDE the slot — the slot is what aligns. */}
<aside className="bg-sidebar border-r border-border w-52 flex flex-col">
  <SidebarHeader className="px-2 h-11 flex items-center gap-2">
    <span className="size-5 grid place-items-center shrink-0">
      <BrandMark />  {/* the icon SLOT; brand mark fits inside */}
    </span>
    <AccountSwitcherLabel />
  </SidebarHeader>
  <nav className="px-2 flex-1 overflow-y-auto py-2">
    {items.map(i => (
      <a key={i.to} href={i.to}
         className="h-7 flex items-center gap-2 px-2 rounded-sm text-sm
                    text-fg-muted hover:text-fg hover:bg-bg-surface/40">
        <span className="size-5 grid place-items-center shrink-0">
          <i.icon className="size-4" />  {/* icon INSIDE the slot */}
        </span>
        <span>{i.label}</span>
      </a>
    ))}
  </nav>
  <div className="px-2 py-2 border-t border-border flex items-center gap-2">
    <span className="size-5 grid place-items-center shrink-0">
      <Avatar size={20} />
    </span>
    <span className="text-sm">{user.name}</span>
  </div>
</aside>
```

The three locations (SidebarHeader, every NavItem, footer user row) all use the **same `<span class="size-5 grid place-items-center shrink-0">` slot** + the same `px-2` outer padding + the same `gap-2`. By construction every icon centers on the same x.

### Main / content area

- **Wrapped in a card**: **NO.** Plain pane.
- **Border + shadow**: none.
- **Padding inside**: `<main>` no padding; the top bar's two rows + the table fill the pane edge-to-edge.
- **Breadcrumb**: lives in the top bar (first row, left side) — but more often the top bar shows **the page title** since users navigate by sidebar, not by breadcrumb chains.
- **Inner top-bar**: **YES — two stacked rows**.
  - Row 1 (`h-11 border-b border-border`): page title left, primary actions + global search right.
  - Row 2 (`h-10 border-b border-border/60`): filter chips + view tabs left, secondary actions right (Export CSV, Column picker).

```tsx
<div className="flex w-full h-screen overflow-hidden">
  <AppSidebar />
  <div className="flex-1 min-w-0 flex flex-col min-h-0">
    <header className="shrink-0">
      <div className="h-11 border-b border-border flex items-center justify-between pl-6 pr-4">
        <h1 className="text-sm font-medium">Payments</h1>
        <div className="flex items-center gap-2">
          <GlobalSearch />
          <Button>+ Create payment</Button>
        </div>
      </div>
      <div className="h-10 border-b border-border/60 flex items-center justify-between pl-6 pr-4">
        <FilterChips />
        <div className="flex items-center gap-2">
          <ColumnPicker />
          <ExportButton />
        </div>
      </div>
    </header>
    <main className="flex-1 min-h-0 overflow-auto bg-bg">
      <DataTable />
    </main>
  </div>
</div>
```

### Cards inside main (KPI tile on dashboards, not list pages)

- **Border philosophy**: **thin hairline** (`border border-border/60`), NO shadow. KPI tiles are sparse — most D pages don't have cards at all.
- **Radius**: `rounded-sm` (2–4px). Architectural, not soft.
- **Hover**: none on KPI tiles (they're not clickable, mostly). Hover only on clickable cards: `hover:bg-bg-surface/40`.

### DataTable row visual treatment

The hairline (Stripe) OR zebra (Airtable) row is the Archetype D signature.

- **Per-row treatment**: no pill, no rounding. **Pick ONE: hairline OR zebra**, don't mix.
  - **Hairline** (Stripe, Plaid): `border-b border-border/60` per row, even bg.
  - **Zebra** (Airtable, Retool): alternate rows get `bg-bg-surface/30`. Faint stripes help the eye track across very wide tables.
- **Hover**: subtle bg tint — `hover:bg-bg-surface/40`. NO rounding, NO accent bar.
- **Selection**: `bg-bg-surface/60` row fill + checkbox column. Optional left accent inset shadow (`box-shadow: inset 2px 0 0 var(--brand)`).
- **Sticky thead**: `<thead className="sticky top-0 bg-bg z-10 border-b-2 border-border">`. The double-bottom-border (or a thicker bottom border) lets the header stand out when content scrolls under it.
- **Sticky leftmost column** for wide tables: `<td className="sticky left-0 bg-bg z-[1]">` on the first cell — usually the ID or selection column.

`<td>` className recipe — hairline:

```tsx
const cellBase = "border-b border-border/60 h-row align-middle px-3 text-sm \
                  tabular-nums whitespace-nowrap";
<tr className="hover:bg-bg-surface/40">
  <td className={cellBase}>...</td>
</tr>
```

`<td>` className recipe — zebra:

```tsx
const cellBase = "h-row align-middle px-3 text-sm tabular-nums whitespace-nowrap";
<tr className="odd:bg-bg even:bg-bg-surface/30 hover:bg-bg-surface/50">
  <td className={cellBase}>...</td>
</tr>
```

**`tabular-nums` everywhere on numeric columns** — alignment IS the read. Without it, `$1,234.56` and `$987.00` don't column-align.

### Toolbar / page-header style

- **Two stacked rows** (see Main above). NEVER one — there's too much to fit (title + global search + filter chips + export). Two rows let each have a clear job.
- **Border below**: yes — both rows have `border-b` (row 1 strong, row 2 faint). Defines the table viewport.
- **Padding**: `pl-6 pr-4`. Slightly tighter right padding to give export buttons room.

### Pagination

- **At table bottom** — NEVER infinite scroll. Admin / financial users need page boundaries to count, audit, export.
- Sticky to the bottom of `<main>` with `border-t border-border bg-bg`.
- Shows `Showing 51–100 of 1,247` + `Prev / Next` + page-size picker. `tabular-nums` on the counts.

```tsx
<div className="sticky bottom-0 h-10 border-t border-border bg-bg
                flex items-center justify-between px-6 text-sm tabular-nums">
  <span className="text-fg-muted">Showing 51–100 of 1,247</span>
  <Pagination />
</div>
```

### Modal / Sheet quirks

- **Backdrop**: light dim (`bg-black/30`).
- **Sheet dock**: slide-in detail sheet (Stripe payment drawer) docks **right of viewport**, full height, with `border-l border-border`. Width `420–540px`. Closes on Esc and on backdrop click.
- **Filter / column-picker popovers** open from their respective row 2 buttons, anchored below.

## Anchor product visual evidence

- **Sidebar (Stripe)**: slim panel with simple text nav, "test mode" toggle pinned at the bottom, no pill chrome on inactive — just text color shifts.
- **Main (Stripe Payments)**: two-row top bar (title + Create button on row 1; filter pills + Export on row 2), then table fills everything else edge-to-edge.
- **Cards (Stripe dashboard tiles)**: thin `border-border` rectangles, no shadow, `rounded-sm`. Numbers in tabular-nums.
- **Rows (Stripe payments table)**: hairline-only, subtle hover. Numeric columns are right-aligned with `tabular-nums`. Sticky thead with stronger bottom border. (Airtable / Retool show zebra instead — same archetype, different row mode.)
- **Pagination (Stripe)**: bottom bar `Showing 1–25 of 4,892`, Prev / Next buttons, page-size dropdown. Never infinite.
- **Primary action color**: **brand OR black**. Stripe uses brand purple for `+ Create`; Retool uses black. Either works — pick by brand voice.

## CSS token VALUE recommendations

- `--bg-sidebar` luminance offset from `--bg`: **3–5% darker** (light mode) or **3–5% lighter** (dark mode).
- `--border` should be strong enough to define table rows clearly. Aim for ~14–20% luminance delta — table rows live or die on the row divider.
- Card radius: **`rounded-sm` (2–4px)** on internal surfaces. Buttons / inputs get `rounded-md` (4–6px). Sharper than every other archetype.
- Shadow: **never** on internal surfaces. Popovers only.
- Row height: **`h-9` (36px)** or **`h-8` (32px)** for high-density modes (Airtable Compact, Stripe with Density: Compact toggle). Denser than B's `h-10`.
- Font: **monospace numeric** (`font-variant-numeric: tabular-nums`) is non-negotiable on numeric columns. Use a body font with good tabular figures (Inter, Söhne, IBM Plex Sans all qualify).

## Anti-patterns unique to Archetype D

- **Inserting a "stage" gray frame around the table.** Wastes pixels. The table IS the page; let it run edge-to-edge.
- **Row pills.** Reads as Archetype A. Hairline or zebra only.
- **Making the table its own card with shadow.** The table IS the page. Wrapping it in a card is redundant chrome.
- **Hiding pagination behind infinite scroll.** Admin / financial users count rows; without pagination they can't audit, can't deep-link to page N, can't export "rows 1001–2000".
- **Omitting `tabular-nums` on numeric columns.** `$1,234.56` and `$987.00` won't column-align. The misalignment kills the entire visual function of the table.
- **Mixing hairline AND zebra row styles in the same product.** Pick one. The visual rhythm has to be consistent across all data tables in the app.
- **One-row top bar with everything jammed in.** Two rows let each row have a clear job (chrome + data controls).
- **Soft radii (`rounded-xl`) on cards or rows.** Reads as consumer app. Stay sharp.

## Building order specific to Archetype D

1. **Tokens** (`globals.css`): write `--bg`, `--bg-sidebar` (3–5% delta), `--border` strong (14–20% delta), NO `--shadow-card`, `--radius-sm: 2px` for internal surfaces. Set `--row-h: 2.25rem` (36px). Pick a body font with tabular figures and apply `font-variant-numeric: tabular-nums` globally on `<table>` or on a `.tabular` utility class.
2. **AppShell**: flush flex row, `border-r border-border` slim `w-52` sidebar, plain main with a **two-row** `<header>` (h-11 + h-10, both `border-b`).
3. **Sidebar**: flat text list, `h-7` rows. Pick text-only OR left-accent active style and use it everywhere.
4. **DataTable**: `<table>` skeleton (from `list-pages.md`) + apply hairline OR zebra `<td>` className (pick one for the whole product). Sticky thead with strong border-b. Sticky first column for wide tables.
5. **Pagination**: bottom sticky `h-10 border-t` bar with row counts (`Showing X–Y of Z`) + Prev/Next. Never infinite scroll.
6. **Numeric columns**: `text-right tabular-nums` on every column with numbers. KPI tiles use the same.
7. **Audit before declaring done.** D is the densest archetype, so misalignment is most visible. Inject `audit-overlay.snippet.js`, call `window.__taste.run()`, screenshot. The four drift reports must all be `ok: true`:
   - `sidebarSlotDrift` — brand mark + every nav icon + footer avatar on one x.
   - `mainChromeLeftDrift` — toolbar, filter row, pagination row left edges match.
   - `mainTextAnchorDrift` — page title text, first filter chip text, ID column header, first cell, "Showing N of M" all on one x. This is the visible alignment line; row borders are not enough.
   - `gridComplexity` — `uniqueX` should land around 5–8 (page-pl, sidebar inner, icon col, label col, page-right, plus a couple). If > 15, ad-hoc paddings are leaking; route them through `--page-pl` / `--page-pr`.
   Common D-specific failure: toolbar uses `pl-4` (16px) but table cell inner div uses `px-3` (12px), so chrome text starts at sidebar+16 but cell text starts at sidebar+12. Pick one token, route both through it.
