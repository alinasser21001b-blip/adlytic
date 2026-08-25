# Archetype A — Floating card on stage

> Read when: you've decided this archetype in step 0 (see `references/structural-archetypes.md`).
> The universal mechanics (alignment, wireless tokens, datatable bones) live in `references/archetype-a-floating-card.md`, `references/wireless-tokens.md`, `references/datatable-mechanics.md` and apply here too. THIS file only defines what's UNIQUE to Archetype A.

## When to pick this archetype

The product is a **focused work surface** where the user spends hours navigating dense rows of structured records — issues, tickets, traces, calendar events. The floating card on a tinted stage signals "you're in a focused workspace" the way a desk blotter signals you're at a desk. Whitespace around the card breathes; the inset gives the content visual weight. Anchor products: **Linear** (issue tracker), **Cron** (calendar), **Height** (project planner), **LangSmith** (trace explorer).

## Structural recipe — the unique decisions

### Sidebar

> **Universal alignment laws still apply.** The icon SLOT rule (every row first child is a fixed-size `<span class="size-N grid place-items-center">` slot) and the X-axis padding lock come from `references/alignment-invariants.md`. SidebarHeader brand mark, every nav row icon, and the footer must share ONE slot class + ONE outer padding so icon centers land on a single vertical line. A misalignment of even 2 px reads as broken.


- **Bg color**: `--bg-sidebar` matches the stage exactly. Sidebar is transparent on the stage — no separate panel feel.
- **Luminance**: `--bg-sidebar` is ~8% darker than `--bg` (or ~6% lighter in dark mode). The big delta vs. the card draws the seam.
- **Border-r**: **NONE.** A hairline anti-aliases against the card's rounded `tl` corner and looks dirty. The bg contrast draws the seam.
- **Padding**: `px-1.5` outer; `px-2` per row.
- **Nav item style**: flat icon + label list. `h-7` row, `size-5` icon slot, `gap-2`, `text-sm`. Inactive rows are **truly transparent** — no resting pill, no hover fill on the resting state, only an `:hover` fade to `bg-sidebar-accent/40`.
- **Active indicator**: **filled pill** — `bg-sidebar-accent text-fg font-medium`, full row width minus the row's `px-2`.
- **Width**: `w-12` collapsed → `w-56` expanded.
- **Sidebar bottom**: user profile row (`h-7` `px-2`, `size-5` avatar slot, name truncated). NO `border-t` above it — the hairline cuts a visible line across the bottom of the stage.

```tsx
<aside className="bg-sidebar w-56 flex flex-col">
  <SidebarHeader className="px-1.5">
    <BrandRow ... />   {/* h-11, baselines with stage row */}
  </SidebarHeader>
  <SidebarContent className="px-1.5 flex-1 overflow-y-auto">
    {/* nav rows */}
  </SidebarContent>
  <SidebarFooter className="px-1.5 shrink-0">
    {/* user profile h-7 row, NO border-t */}
  </SidebarFooter>
</aside>
```

### Main / content area

- **Wrapped in a card**: yes — `rounded-xl border border-border/60` + faint two-layer shadow.
- **Padding inside**: `<main>` itself has no padding; pages inside add `px-6 pt-6 pb-12` (or list-page sticky-header pattern).
- **Breadcrumb**: lives **in the stage row ABOVE the card** (`h-11 pl-3 pr-5`), NOT inside the card. Baselines with the sidebar's brand row.
- **Inner top-bar**: **NO.** The PageHeader portal renders inside the card's top (above `<main>`) — but the breadcrumb itself stays on the stage.
- **Inset**: `pb-2` on the outer wrapper, `pr-2` on the card column — card bottom/right kissed by stage gray.

```tsx
<div className="flex w-full bg-sidebar h-screen overflow-hidden pb-2">
  <AppSidebar />
  <div className="flex-1 min-w-0 flex flex-col min-h-0">
    <header className="h-11 flex items-center gap-1.5 pl-3 pr-5 shrink-0">
      <SidebarTrigger />
      <AppBreadcrumb />
    </header>
    <div className="flex-1 min-h-0 pr-2">
      <div className="h-full bg-bg rounded-xl border border-border/60
                      shadow-[0_1px_0_rgb(0_0_0/0.03),0_4px_12px_-4px_rgb(0_0_0/0.08)]
                      flex flex-col overflow-hidden">
        <div ref={pageHeaderSlot} className="empty:hidden shrink-0" />
        <main className="flex-1 min-h-0 overflow-auto overscroll-y-none
                         [scrollbar-gutter:stable]
                         [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          <Outlet />
        </main>
      </div>
    </div>
  </div>
</div>
```

### Cards inside main (KPI tile, project card, rail card)

- **Border philosophy**: **faint border** (`border border-border/60`) + a soft shadow only if it nests outside another card. Inside the main card, **drop the shadow** — nested shadows muddy.
- **Radius**: `rounded-lg` (8px). Matches the outer card's `rounded-xl` rhythm.
- **Hover**: subtle bg lift (`hover:bg-bg-surface/30`) for clickable cards; no border darken.

```tsx
<div className="rounded-lg border border-border/60 bg-bg-surface/40 p-4">
  {/* KPI tile content */}
</div>
```

### DataTable row visual treatment

The pill style is the Archetype A signature.

- **Per-row treatment**: each row is its own **pill** — `bg-bg-surface/50 rounded-md`.
- **Row separation**: `gap-px` (1px) between rows, no `border-b`. The space + the pill bg do the visual work.
- **Hover**: pill deepens — `hover:bg-bg-surface`.
- **Selection**: `bg-bg-surface ring-1 ring-brand/30` on the pill.

`<td>` className recipe (the row style only — `<table>` mechanics live in `references/datatable-mechanics.md`):

```tsx
const cellBase = "first:rounded-l-md last:rounded-r-md bg-bg-surface/50 \
                  group-hover:bg-bg-surface h-row align-middle px-3 text-sm";
// <tr> gets `group` so descendant `group-hover:` paints
<tr className="group">
  <td className={cellBase}>...</td>
  <td className={cellBase}>...</td>
</tr>
```

Note `first:rounded-l-md` / `last:rounded-r-md` on `<td>` to round the whole row block — NOT on `<tr>` (rounding on `<tr>` is unreliable across browsers).

### Toolbar / page-header style

- **One row** (`h-12` or `h-11`), sticky, lives in the PageHeader portal inside the card's top.
- **Border below**: yes — `border-b border-border/60`.
- **Padding**: `pl-6 pr-6`.
- **Holds**: page title or first filter chip on the left, primary CTA on the right.

```tsx
<div className="h-12 sticky top-0 bg-bg/95 backdrop-blur z-10 border-b border-border/60
                flex items-center justify-between pl-6 pr-6">
  <h1 className="text-sm font-medium">Issues</h1>
  <Button className="bg-brand text-brand-fg">New issue</Button>
</div>
```

### Modal / Sheet quirks

- **Backdrop**: medium-dim (`bg-black/40`) — the stage is already dark, modal needs to be a clear step above.
- **Sheet dock**: slide-in sheets dock to the right edge of the **viewport** (not the card). They appear over both card and stage.
- **Sheet width**: `420–520px`. Bigger than B/C/D because the dense list often shows in the sheet.

## Anchor product visual evidence

- **Sidebar (Linear)**: workspace switcher button on the left + the small search trigger and "+" button on the right, all inside one `h-11` row. No `border-r`. Stage tint is ~8% darker than the card.
- **Main (Linear)**: clearly inset card — you can see the stage gray on top (where the breadcrumb sits) and on the right + bottom edges. Single `rounded-xl` everywhere, including the bottom-right corner.
- **Cards (LangSmith)**: rail cards on a detail page use a faint border + `bg-bg-surface/40`, no shadow — they're inside the outer floating card already.
- **Rows (Linear, Height)**: hover any row and the pill darkens slightly; rows have visible 1px gaps between them (not borders).
- **Primary action color**: **brand color** (`bg-brand text-brand-fg`). Linear's purple, Height's coral. The brand pops because the rest of the surface is restrained.

## CSS token VALUE recommendations

- `--bg-sidebar` luminance offset from `--bg`: **~8% darker** (light mode) or **~6% lighter** (dark mode). Big delta — sidebar must read as a distinct zone from the card.
- Card radius: **`rounded-xl`** outer (12px), `rounded-lg` inner (8px), `rounded-md` pills (6px).
- Shadow strength: **faint two-layer** — `shadow-[0_1px_0_rgb(0_0_0/0.03),0_4px_12px_-4px_rgb(0_0_0/0.08)]`. Strong enough to read as floating; quiet enough not to compete with content.
- Row height: **`h-9` (36px)** for standard density. `h-8` (32px) only for an explicitly compact mode.
- Border: `border-border/60` — half-strength border so the shadow can do most of the elevation work.

## Anti-patterns unique to Archetype A

- **Adding `border-r` to the sidebar.** Anti-aliases against the card's `tl` corner — looks dirty. Bg contrast draws the seam.
- **Adding `border-t` to the sidebar footer.** Cuts a visible line across the bottom of the stage. Whitespace separates.
- **Putting the breadcrumb inside the card.** Splits the top into two bands, kills the three-rows-on-one-baseline alignment. Breadcrumb belongs in the stage row.
- **Using `border-b` row dividers instead of pills.** Reads as Archetype B. The signature of Archetype A is the row pill with `gap-px`.
- **Putting `rounded-xl shadow` on cards INSIDE the main card.** Nested shadows muddy the elevation. Inner cards use border only.

## Building order specific to Archetype A

1. **Tokens** (`globals.css`): write `--bg`, `--bg-sidebar` (~8% delta), `--bg-surface` (~3% offset for pills), `--brand` for primary actions, faint two-layer `--shadow-card`. Set `--row-h: 2.25rem` (36px).
2. **AppShell**: outer `pb-2` + `bg-sidebar`, transparent sidebar (no `border-r`), stage row with breadcrumb (`h-11`), inset `pr-2` card with `rounded-xl border shadow`.
3. **Sidebar brand row**: `h-11` to baseline with the stage row. `size-5` slot for the brand mark, with search + "+" buttons in the brand row's right slot.
4. **DataTable rows**: `<table>` skeleton (from `list-pages.md`) + apply pill `<td>` className (`first:rounded-l-md last:rounded-r-md bg-bg-surface/50 group-hover:bg-bg-surface`).
5. **PageHeader portal**: sticky `h-12 border-b` inside the card top, hosts toolbar + primary CTA in brand color.
