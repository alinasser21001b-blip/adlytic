# Archetype C — Document workspace

> Read when: you've decided this archetype in step 0 (see `references/structural-archetypes.md`).
> The universal mechanics (alignment, wireless tokens, datatable bones) live in `references/archetype-a-floating-card.md`, `references/wireless-tokens.md`, `references/datatable-mechanics.md` and apply here too. THIS file only defines what's UNIQUE to Archetype C.

## When to pick this archetype

The product is **content-first** — the page IS the document. Wikis, knowledge bases, project planners, CMSes, long-form writing tools. Almost no chrome, almost no surface contrast, lots of whitespace. Sidebar is a hierarchical tree (nested pages). Tables exist but they're content blocks inside a document, not the page's main attraction. Anchor products: **Notion** (everything), **Linen** (community archives), **Causal** (modeling docs), **Coda** (document-first workspace).

## Structural recipe — the unique decisions

### Sidebar

> **Universal alignment laws still apply.** The icon SLOT rule (every row first child is a fixed-size `<span class="size-N grid place-items-center">` slot) and the X-axis padding lock come from `references/alignment-invariants.md`. SidebarHeader brand mark, every nav row icon, and the footer must share ONE slot class + ONE outer padding so icon centers land on a single vertical line. A misalignment of even 2 px reads as broken.


- **Bg color**: `--bg-sidebar` is barely tinted — only 2–3% off `--bg`. The sidebar feels like a "left margin" of the same surface, not a separate panel.
- **Border-r**: **YES** — `border-r border-border/60` hairline only. Even more subtle than B because the bg delta is smaller; without the hairline the seam disappears entirely.
- **Padding**: `px-2` outer; `px-2` per row (no extra inner offset for nested tree levels — use `pl-[calc(var(--depth)*0.75rem+0.5rem)]` instead).
- **Nav item style**: **tree** with expand/collapse arrows. Each row is `h-7 text-sm`, leading caret (`size-3` rotate-90 on expanded), then optional `size-4` icon (often emoji), then label. Pages without children get a `size-3` invisible spacer where the caret would be — so labels align across siblings.
- **Active indicator**: **bold text** + slightly darker bg (`bg-bg-surface/40 font-medium text-fg`). NO pill chrome, NO accent bar. The bolder text is the indicator.
- **Width**: `w-60` to `w-72`. Wider than A/B because deep page trees need horizontal room — let it grow. Avoid `w-48`; the nested page titles get truncated immediately.
- **Sidebar bottom**: workspace settings link + trash + user. Subtle text rows, no border above.

```tsx
<aside className="bg-sidebar border-r border-border/60 w-64 flex flex-col">
  <SidebarHeader className="px-2 pt-3 pb-2">
    <WorkspaceSwitcher />
    <SearchTrigger />
  </SidebarHeader>
  <nav className="px-2 flex-1 overflow-y-auto">
    <SectionLabel>Quick</SectionLabel>
    <TreeNode depth={0} ... />
  </nav>
  <div className="px-2 pb-3"><WorkspaceFooter /></div>
</aside>
```

Tree row:

```tsx
<button className="flex items-center gap-1 h-7 px-2 w-full text-left text-sm
                   text-fg-muted hover:bg-bg-surface/40 hover:text-fg
                   data-[active=true]:bg-bg-surface/40 data-[active=true]:text-fg
                   data-[active=true]:font-medium rounded-sm"
        style={{ paddingLeft: `calc(${depth} * 0.75rem + 0.5rem)` }}>
  {hasChildren
    ? <ChevronRight className="size-3 shrink-0 transition-transform
                                data-[open=true]:rotate-90" />
    : <span className="size-3 shrink-0" />}
  <span className="size-4 shrink-0 grid place-items-center">{icon ?? <PageIcon />}</span>
  <span className="truncate">{title}</span>
</button>
```

### Main / content area

- **Wrapped in a card**: **NO.** Plain document surface, no border, no shadow.
- **Padding inside**: generous horizontal — `px-12` to `px-16`. The body text is then `max-w-3xl mx-auto` (capped at ~768px reading width).
- **Breadcrumb**: **NONE in chrome.** The page title IS the chrome. A small breadcrumb may appear as a single line ABOVE the title in tiny `text-fg-subtle` text (`text-xs`), but it's editorial, not a structural row.
- **Inner top-bar**: **NO sticky h-12 bar.** A tiny utility row in the top-right (`Share`, `⋯`, status) floats in the corner without a `border-b`.
- **Vertical rhythm**: `pt-12 pb-24` (yes, that much padding — the page wants to breathe).

```tsx
<div className="flex w-full h-screen overflow-hidden">
  <AppSidebar />
  <div className="flex-1 min-w-0 flex flex-col min-h-0">
    <header className="h-10 shrink-0 flex items-center justify-between pl-6 pr-6">
      <DocCrumb className="text-xs text-fg-subtle" />  {/* optional */}
      <DocUtilities />  {/* Share, history, ⋯ */}
    </header>
    <main className="flex-1 min-h-0 overflow-auto bg-bg
                     [scrollbar-gutter:stable]">
      <article className="max-w-3xl mx-auto px-12 pt-12 pb-24">
        <Outlet />
      </article>
    </main>
  </div>
</div>
```

### Page title

- **Size**: `text-3xl` or `text-4xl`. Editorial weight.
- **Weight**: `font-semibold` (sans) OR `font-serif font-normal` if the project uses a serif display.
- **Alignment**: left, NOT centered. Centered titles read as marketing pages.
- **Subtitle / description**: smaller `text-base text-fg-muted` directly below.
- **NO uppercase, NO tracking-wider, NO eyebrow label above the title.** That's chrome — this is content.

```tsx
<h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
{description && <p className="mt-2 text-base text-fg-muted">{description}</p>}
```

### Cards inside main (callout, embed, database block)

- **Border philosophy**: **none** by default. Callouts have a tinted bg (`bg-bg-surface/60`) and `rounded-md`. Embed blocks use a thin `border border-border/40` and `rounded-md`.
- **Radius**: `rounded-md` (6px) — sharper than A's nested cards.
- **Hover**: none on content blocks; subtle for interactive blocks.

### DataTable row visual treatment

The hairline grid is the Archetype C signature — looks like a printed table or a Notion database view.

- **Per-row treatment**: no pill, no per-row bg.
- **Row separation**: `border-b border-border/40` (lighter than B's because the surrounding doc has less contrast).
- **Hover**: very subtle — `hover:bg-bg-surface/20`. NOT a fill bg.
- **Selection**: subtle bg + checkbox column.
- **Header row**: lighter weight than A/B — `text-xs text-fg-muted font-medium`, NOT uppercase. The table is content, not chrome.

`<td>` className recipe:

```tsx
const cellBase = "border-b border-border/40 h-row align-middle px-3 text-sm";
<tr className="hover:bg-bg-surface/20">
  <td className={cellBase}>...</td>
</tr>
```

### Toolbar / page-header style

- **None** in the traditional sense. Page actions live in the small utility row top-right (`Share`, `⋯`).
- For pages that DO need a toolbar (e.g. a database view), it sits **inline at the top of the database block**, NOT as a global page row.

### Modal / Sheet quirks

- **Backdrop**: light dim (`bg-black/30`).
- **Sheet dock**: slide-in panels (Notion comments, page history) dock to the **right edge of the viewport** with a small `border-l border-border/60` — same flat philosophy as the main pane.
- **Inline popovers** (mention picker, slash menu) are more common than modals here — Notion lives on `/` triggers.

## Anchor product visual evidence

- **Sidebar (Notion)**: same surface as content (almost), tree of pages with carets, page emoji icons, no pill chrome on active items — just bolder text + slight bg.
- **Main (Notion)**: massive whitespace; centered `max-w-3xl` body with a giant page emoji + title at top; NO toolbar, NO breadcrumb row, just a small `Share` button in the top right.
- **Cards (Notion callouts, Coda inline databases)**: no visible card border, just a tinted bg or a tiny icon. Embeds use the lightest possible border.
- **Rows (Notion database table view)**: hairline rows, very subtle hover, header cells are tiny lowercase property names — not uppercase column headers.
- **Primary action color**: **subtle / link-style** — Notion's `+ New` is a faint blue text link, not a filled brand button. Filled brand buttons feel out of place in a document.

## CSS token VALUE recommendations

- `--bg-sidebar` luminance offset from `--bg`: **2–3% darker** (light mode) or **2–3% lighter** (dark mode). Smallest delta of any archetype.
- `--border` is faint here — aim for `border-border/40` to `border-border/60` everywhere. The document feel REQUIRES lower contrast.
- Card radius: `rounded-md` (6px) for callouts/embeds.
- Shadow: **none anywhere** except popovers (slash menu, mention picker, share dialog).
- Row height: **`h-9` (36px)** for database tables. Looser than A; matches Notion's table density.
- Type stack: pair a **serif display** (Inter Display, Charter, Söhne, GT Super) with a sans body, OR all-sans with strong size hierarchy. Notion uses sans-only but with a very large title size; Linen uses serif headings.

## Anti-patterns unique to Archetype C

- **Adding a `stage row` with breadcrumb above the page.** Doesn't exist here — the page title IS the chrome.
- **Adding a sticky `h-12 border-b` top bar inside main.** Kills the document feel — page becomes "page chrome + body" instead of "the body IS the page".
- **Floating cards with shadow** (anywhere). Shadow signals elevation, which signals "app UI"; documents are flat.
- **Row pills** in tables. Hairlines only.
- **Sidebar `w-48` or narrower.** Truncated tree titles become useless 2 levels deep. Let the sidebar breathe at `w-64`+.
- **Brand-color filled primary buttons in body content.** Use a faint text link or a small outline button. Reserve brand color for the brand mark itself.
- **Centered page title.** Reads as marketing landing page, not a document.
- **Uppercase tracking-wider section headers** inside the document body. That's app chrome — use mixed-case `text-base font-semibold` for section headings in a document.

## Building order specific to Archetype C

1. **Tokens** (`globals.css`): write `--bg`, `--bg-sidebar` (2–3% delta), `--border` faint (10% delta), no `--shadow-card`. Type stack: pick serif display + sans body OR sans-only with `--text-display: 2.25rem` (36px) for titles. Set `--row-h: 2.25rem` (36px).
2. **AppShell**: flush flex row, `border-r border-border/60` sidebar, plain main, NO top bar with `border-b`. Just a small `h-10` utility row for `Share` + `⋯`.
3. **Sidebar tree**: implement nested `<TreeNode>` with caret + icon + label. Active is bolder text + faint bg, NO pill.
4. **Page shell**: `article max-w-3xl mx-auto px-12 pt-12 pb-24`. Large left-aligned title at the top.
5. **Body sections**: separated by `space-y-8`, NEVER by `<hr>` or `border-b`. Section headings are `text-base font-semibold`, mixed case.
6. **Database blocks**: hairline-row table with light header. Inline toolbar at the top of the block, NOT as page chrome.
