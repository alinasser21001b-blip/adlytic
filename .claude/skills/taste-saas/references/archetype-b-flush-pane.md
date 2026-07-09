# Archetype B — Flush-pane dashboard

> Read when: you've decided this archetype in step 0 (see `references/structural-archetypes.md`).
> The universal mechanics (alignment, wireless tokens, datatable bones) live in `references/archetype-a-floating-card.md`, `references/wireless-tokens.md`, `references/datatable-mechanics.md` and apply here too. THIS file only defines what's UNIQUE to Archetype B.

## When to pick this archetype

The product is an **operational dashboard** with big readable surfaces — multiple environments, projects, deploys, repos, services. Users glance, click into a card, take action. No "stage" framing, no nesting — every zone runs edge-to-edge with a single hairline separator. The result feels bigger and more confident than a floating card. Anchor products: **Vercel** (deploys dashboard), **GitHub** (repo home), **Sentry** (error dashboard), **PostHog** (event explorer).

## Structural recipe — the unique decisions

### Sidebar

> **Universal alignment laws still apply.** The icon SLOT rule (every row first child is a fixed-size `<span class="size-N grid place-items-center">` slot) and the X-axis padding lock come from `references/alignment-invariants.md`. SidebarHeader brand mark, every nav row icon, and the footer must share ONE slot class + ONE outer padding so icon centers land on a single vertical line. A misalignment of even 2 px reads as broken.


- **Bg color**: `--bg-sidebar` is its own panel bg, ~3–5% darker than `--bg`. Smaller delta than Archetype A — the panels read as siblings, not as stage + floating card.
- **Border-r**: **YES** — `border-r border-border` between sidebar and main. Belt-and-suspenders separation: bg delta + hairline.
- **Padding**: `px-2` outer; `px-2.5` per row.
- **Nav item style**: flat icon + label list, slightly tighter than A. `h-8` row, `size-4` icon, `gap-2`, `text-sm`. Sections can be labeled (uppercase `text-xs tracking-wider text-fg-subtle`).
- **Active indicator**: **left vertical accent bar** — `border-l-2 border-fg -ml-2.5 pl-[calc(0.625rem-2px)]` (subtract the bar width from the padding so the label doesn't shift). Optional slightly-darker bg (`bg-bg-surface/60`). Inactive: hover-only bg fill.
- **Width**: `w-12` collapsed → `w-60` expanded. Slightly wider than A because of labeled section groups + status badges.
- **Sidebar bottom**: alerts / action-required badge (Vercel uses a small red dot row), THEN user profile. `border-t border-border` is OK here (the panel has its own border-r, so a `border-t` reads as consistent panel chrome, NOT a stray hairline like in A).

```tsx
<aside className="bg-sidebar border-r border-border w-60 flex flex-col">
  <SidebarHeader className="px-2 h-12 flex items-center border-b border-border">
    <WorkspaceSwitcher />
  </SidebarHeader>
  <nav className="px-2 flex-1 overflow-y-auto">
    {/* labeled section groups */}
  </nav>
  <div className="px-2 py-3 border-t border-border">
    <UserProfileRow />
  </div>
</aside>
```

### Main / content area

- **Wrapped in a card**: **NO.** Plain pane.
- **Border + shadow**: none on the pane itself. Just `bg-bg`.
- **Padding inside**: `<main>` no padding; pages add `px-6 py-6` (often `px-8` on wider Vercel-style layouts).
- **Breadcrumb**: lives **inside the top bar** (the first row inside main), NOT on a stage.
- **Inner top-bar**: **YES** — sticky `h-12 border-b border-border` row that IS the page chrome. Holds breadcrumb on the left, page actions on the right.

```tsx
<div className="flex w-full h-screen overflow-hidden">
  <AppSidebar />
  <div className="flex-1 min-w-0 flex flex-col min-h-0">
    <header className="h-12 shrink-0 border-b border-border bg-bg flex items-center
                       justify-between pl-6 pr-6">
      <AppBreadcrumb />
      <div className="flex items-center gap-2"><PageActions /></div>
    </header>
    <main className="flex-1 min-h-0 overflow-auto bg-bg
                     [scrollbar-gutter:stable]">
      <Outlet />
    </main>
  </div>
</div>
```

No `pb-2` outer padding, no `pr-2` inset, no `rounded-xl` wrapper. The pane runs to the viewport edge.

### Cards inside main (project card, KPI tile, repo card)

- **Border philosophy**: **thick visible outline** — `border border-border-strong` (or `border-border` if your border token is already strong). NO shadow. The border IS the card.
- **Radius**: `rounded-md` (6–8px). Slightly sharper than A's nested cards.
- **Hover**: border darkens (`hover:border-fg-muted`) OR background fills slightly (`hover:bg-bg-surface/30`). NEVER add a shadow on hover — adds elevation Archetype B avoids.

```tsx
<a className="block rounded-md border border-border bg-bg p-4
              hover:border-fg-muted transition-colors">
  <div className="text-sm font-medium">{repo.name}</div>
  <div className="text-xs text-fg-muted">{repo.lastDeploy}</div>
</a>
```

### DataTable row visual treatment

The hairline row is the Archetype B signature.

- **Per-row treatment**: no pill, no per-row bg. Plain row.
- **Row separation**: `border-b border-border/60` on each `<tr>` (or `<td>`). No `gap`.
- **Hover**: whole-row bg fill — `hover:bg-bg-surface/40`. NO rounded corners on hover.
- **Selection**: `bg-bg-surface/60` row fill + optional left accent bar (`box-shadow: inset 2px 0 0 var(--brand)`).

`<td>` className recipe:

```tsx
const cellBase = "border-b border-border/60 h-row align-middle px-4 text-sm";
<tr className="group hover:bg-bg-surface/40">
  <td className={cellBase}>...</td>
  <td className={cellBase}>...</td>
</tr>
```

No `rounded-*` anywhere on the row. No `bg-bg-surface/50` on cells. The contrast is hover-only.

### Toolbar / page-header style

- **One row** is enough (`h-12 border-b`). The breadcrumb on the left, page actions on the right, fits in one row.
- **For list pages**, a second row beneath the top bar hosts filter chips + search — also `border-b border-border/60`, `h-11 px-6`.
- **Padding**: `px-6` to align with body content.

### Modal / Sheet quirks

- **Backdrop**: light dim (`bg-black/20`) — the pane is already flat, modal needs less contrast to feel elevated.
- **Sheet dock**: slide-in sheets dock to the right edge of the **viewport**, full height.
- **Sheet uses a border-l** (`border-l border-border`) instead of a shadow — consistent with the no-shadow philosophy.

## Anchor product visual evidence

- **Sidebar (Vercel)**: dark panel with hairline `border-r`, labeled groups ("Overview", "Resources", "Account"), small "Action Required" alert row near the bottom.
- **Main (Vercel)**: top bar with workspace + breadcrumb + Feedback/Changelog/Help on the right, single hairline below, then plain pane content. No card wrapping anything.
- **Cards (Vercel projects grid)**: thick visible border, NO shadow at rest, NO shadow on hover — border darkens instead. Card thumbnail has its own internal border (border-in-border).
- **Rows (GitHub Issues, Sentry events list)**: hairline divider between rows, hover fills the whole row with subtle bg. No pill, no rounding mid-list.
- **Primary action color**: **pure black** (`bg-fg text-bg`) — Vercel's signature "Add New..." button. Brand color is reserved for status (success/warning/error), NOT for primary actions in a black/white minimalist palette.

## CSS token VALUE recommendations

- `--bg-sidebar` luminance offset from `--bg`: **3–5% darker** (light mode) or **3–5% lighter** (dark mode). Smaller delta than A — sidebar reads as a sibling panel, not a stage.
- `--border` should be **strong enough to define cards by itself**. Aim for ~12–18% luminance delta from `--bg`. If your border looks faint, cards will look unlined.
- Card radius: `rounded-md` (6–8px). Avoid `rounded-xl` — too soft for the architectural feel.
- Shadow: **none** on internal surfaces. Only popovers (Dropdown, Modal, Toast) get shadow; everything in the document flow uses border only.
- Row height: **`h-10` (40px)** standard, `h-12` for content-heavy list rows (Vercel deployments). Looser than A's pill rows because hairlines feel cramped at `h-8`.
- Primary action: consider `--accent: var(--fg)` mapping so "primary button" = `bg-fg text-bg`. Reserve `--brand` for status badges.

## Anti-patterns unique to Archetype B

- **Wrapping main in `rounded-xl shadow`.** Kills the flush feel — instantly reads as Archetype A.
- **Omitting the sidebar/main `border-r`.** Without it the two zones bleed visually (bg delta alone is too subtle here).
- **Using row pills** (`bg-bg-surface/50 rounded-md` per `<td>`). Hairline rows are the signature — pills look like a transplanted Linear table.
- **Adding shadow to cards** (`shadow-sm` or stronger). The thick border IS the card. Shadow + border is Archetype A; border-only is Archetype B.
- **Using brand color for primary actions in a "minimal" palette.** Black-on-white primary is the Vercel/GitHub move. Brand color belongs on status pills + brand mark.
- **Adding a stage row above the main pane.** B has no stage. Breadcrumb lives in the top bar inside main.

## Building order specific to Archetype B

1. **Tokens** (`globals.css`): write `--bg`, `--bg-sidebar` (3–5% delta), `--border` (strong, 12–18% delta), `--border-strong` if needed for card outlines, `--fg` for primary actions (NOT `--brand`). NO `--shadow-card`. Set `--row-h: 2.5rem` (40px).
2. **AppShell**: flush flex row, `border-r border-border` sidebar, plain main with sticky `h-12 border-b` top bar — NO outer padding, NO card wrapper.
3. **Sidebar**: labeled section groups, `h-8` rows, left accent bar for active. Workspace switcher in its own `h-12 border-b` header row.
4. **Cards**: write a `<Card>` primitive with `border border-border rounded-md p-4` and NO shadow. Hover variants are `hover:border-fg-muted`, never `hover:shadow-*`.
5. **DataTable rows**: `<table>` skeleton (from `list-pages.md`) + apply hairline `<td>` className (`border-b border-border/60`, no rounding, no bg). Whole-row hover via `<tr className="hover:bg-bg-surface/40">`.
6. **Primary CTA**: implement `<Button variant="primary">` as `bg-fg text-bg` if the project's tone is minimal; only use `bg-brand` for brand-forward products.
