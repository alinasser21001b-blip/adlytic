# Debug playbook — when something looks "almost right"

> Read when a build is functional but feels off, or before doing something risky (custom modal, sidebar collapse animation, etc.). Symptoms first.

When you can't put your finger on what's wrong, scan the symptom lines below. Each entry is a real bug we hit during iteration. Tags: `[shadcn]` `[Tailwind v4]` `[TanStack Table]` `[macOS]` `[browser API]`.

**Meta-rules before diving in:**
- **Run the audit first.** Before eyeballing or reading this catalog, inject `audit-overlay.snippet.js` and call `window.__taste.run()`. The four drift reports (`sidebarSlotDrift`, `mainChromeLeftDrift`, `mainTextAnchorDrift`, `crossSeamDrift`) plus `gridComplexity` point at the actual misalignment with machine-readable hints. The screenshot's grid skeleton (dashed lines through every coordinate shared by 2+ elements) shows drift as parallel lines where there should be one. Most of the symptoms in this catalog are now things the audit catches automatically.
- **Pixel measurements ≠ visual alignment.** `right=1418` on two containers can mean content edges sit far apart — each container has its own padding. The audit's `mainTextAnchorDrift` reads actual text-node positions; that's the line the eye sees.
- **The user's eyes are the spec.** Once they say "still not aligned", stop arguing with `getBoundingClientRect`. Sub-pixel rendering, font metrics, scrollbar gutter, ascender/descender baselines are all invisible to JS.
- **One source of truth.** When the same number appears in three places (`pr-4`, `px-3`, `pl-3 pr-4`), it WILL drift. Define a CSS variable, consume it everywhere. `gridComplexity.uniqueX > 15` confirms this is happening.
- **30-minute rule.** If alignment still doesn't work after 30 min: (1) ask the user to point at the two edges that should share an x-axis, (2) define one CSS var for that axis, (3) make every contributing element consume it.

---

## Cross-seam / alignment

> **Many entries in this section are Archetype A specific** (they reference "stage row", "card", "page-card", `--top-row-h`, `--stage-inset`). The diagnostic METHOD — finding two anchors that drifted because they had independent magic numbers, then collapsing them onto a shared token — is universal. For B/C/D's equivalent seams, see `references/archetype-*.md`.

**Symptom**: Toolbar inside card sits 6–10 px below sidebar's first nav row.
**Cause**: Toolbar uses `min-h-9 py-2`, sidebar uses `py-1` — independent magic numbers.
**Fix**: Both consume `--row-gap-y` for top padding; both rows are `--row-h`.
**Deeper**: `references/wireless-tokens.md` → Y-axis rhythm.

**Symptom**: Sidebar nav icons drift horizontally across rows (brand mark heavier than nav icons, search lighter still).
**Cause**: Centering by `padding + icon/2` — icon width varies row to row.
**Fix**: Wrap every icon in `<span class="size-S grid place-items-center">` SLOT; slot class identical across all rows. `padding + slot/2` is constant.
**Deeper**: `references/archetype-a-floating-card.md` → First principle 1.

**Symptom**: Sidebar brand row baseline doesn't match the stage breadcrumb (`centerY` differs by a few px).
**Cause**: Brand shoved into a dense `h-7` template, or `SidebarHeader` wrapped with `pt-1.5` / `pt-2` "to breathe".
**Fix**: Brand row is `h-11` at `y=0`. Verify with `getBoundingClientRect()` — every top-row element must report the same `centerY` (~22).

**Symptom**: Search / "+" / workspace switcher placed as separate rows under the brand row, reading as filler.
**Cause**: Treating them as nav items.
**Fix**: They live INSIDE the brand row on the right (Linear / Notion / Vercel pattern). The brand row is `h-11` with affordances.

**Symptom**: Page A and Page B don't open at the same x.
**Cause**: A page wrote `pl-3 pr-4 pt-3 pb-6` instead of consuming tokens.
**Fix**: Every page's outermost wrapper consumes `--page-pl/pr` + `--row-gap-y`. No exceptions.

**Symptom**: Detail page title is too small or doesn't anchor to a visible row.
**Cause**: `text-base` or `text-xl` and `pt-6` — both magic.
**Fix**: Title is `text-3xl font-display`; `padding-top: calc(--row-gap-y + --row-h + 1px)` (aligns top edge with second sidebar nav row).
**Deeper**: `references/detail-pages.md`.

**Symptom**: Detail page horizontal padding feels too tight.
**Cause**: Reused `--page-pl/pr` (list density) for a reading view.
**Fix**: Use `--detail-px` (wider). List = density, detail = reading comfort.

**Symptom**: Right rail icons don't align with sidebar nav icons.
**Cause**: Rail used `px-3` or `px-6` instead of the token.
**Fix**: Rail's outer `paddingLeft = var(--page-pl)` — same as toolbar and sidebar nav-icon column.

**Symptom**: Toolbar search input's right edge ≠ table's last cell right edge.
**Cause**: Two different padding chains (`pr-4` vs `px-3` + `min-w-max`). 8–24 px drift compounds.
**Fix**: Define `--page-pl` / `--page-pr` once in `:root`. PageHeader rows and DataTable inner column both consume them. Mathematically forced equal.

**Symptom**: Sidebar UserProfile bottom and card bottom not aligned.
**Cause**: Sidebar bottom = `<SidebarFooter>` padding; card bottom = AppShell `pb-2`. Two anchors.
**Fix**: Lift the bottom inset to the OUTER wrapper that contains both: `<div className="flex w-full bg-sidebar h-screen overflow-hidden pb-2">`.

**Symptom**: "+ New issue" button right edge pokes past the card right edge.
**Cause**: Top stage row uses `pl-3 pr-3` but the card has `pr-2`. Button at far right sits 4 px outside.
**Fix**: Top stage row uses `pl-3 pr-5` (`pr-5 = card pr-2 + button area px-3`). Rightmost button ends at card's right edge.

**Symptom**: Card top inset > side insets (top has the whole `--top-row-h`). [Archetype A only — see `references/archetype-a-floating-card.md`]
**Cause**: Breadcrumb lives in the stage row above the card; that row sets the top inset.
**Fix**: Don't try to make them equal — breadcrumb needs height. `--stage-inset` applies to right/bottom only; top IS the stage row.

**Symptom**: Inside a row, priority arrow, mono ID, pill, avatar don't share a midline.
**Cause**: `<td vertical-align: middle>` aligns text baselines, not box midlines. Mixed content has different intrinsic metrics.
**Fix**: Each `<td>` wraps its content in `<div className="flex items-center h-full">`. Flex `items-center` aligns box midlines.

**Symptom**: `--page-pl` ≠ sidebar `pl-3` (e.g. `0.875rem` "for breathing room").
**Cause**: Token drift.
**Fix**: Both must equal 12 px. Sidebar nav-icon column and page's first column share one number.

---

## Sidebar collapse animation

**Symptom**: Collapse looks "jittery" / "stuttery" — things shrink-then-expand.
**Cause**: Every element fires on one overlapping transition (width shrinks while labels fade while collapsed-stack grows).
**Fix**: Explicit 3-phase choreography via inline `style={{transition}}` driven by `collapsed` boolean — outgoing fades (0ms delay) → layout shifts (single 200ms transition, 100ms delay covering width / height / margin) → incoming fades (300ms delay so it never paints into a still-moving layout). Three reusable tokens: `LAYOUT_TR`, `FADE_IN_LATE_TR`, `FADE_OUT_EARLY_TR`.
**Deeper**: `references/archetype-a-floating-card.md` → First principle 3.

**Symptom**: First icon under brand row "jumps" y when toggling collapse.
**Cause**: Two sources both add `--row-gap-y` — `SidebarContent` `paddingTop` AND `CollapsedActionStack` `marginTop`. Doubles in collapsed state.
**Fix**: ONE thing owns each gap. `SidebarContent`'s paddingTop is enough — don't add marginTop on the collapsed stack. Cross-state invariant: the `centerY` of the first `span.size-5` under brand must match within 1 px across states.
**Deeper**: `references/archetype-a-floating-card.md` → Cross-state invariant.

**Symptom**: Collapsed state hides functional buttons (search, "+", notifications).
**Cause**: `display:none` on the brand-row buttons, or `flex-direction: row → column` swap (unanimatable, teleports), or FLIP-style `top/left` transition (looks like floating decoration).
**Fix**: TWO fixed-position sets — expanded-only set absolute-anchored in brand row's right slot, collapsed-only set as full-width nav-shaped rows in `SidebarContent`. Both live in DOM permanently; only `opacity` + `pointer-events` change. Collapsed-only set uses the same row template as nav items.
**Deeper**: `references/archetype-a-floating-card.md` → First principle 2.

**Symptom**: Collapsed icons sit at slightly different x than expanded nav icons.
**Cause**: Hand-rolling collapse with `justify-center` — places icon at centerline of whatever width the sidebar happens to be, so x changes per sidebar width.
**Fix**: Fixed icon container inside consistent x-padding. Same slot pattern as expanded state.

---

## Table / DataTable

**Symptom**: Sticky thead seems to fail (header scrolls with body, or pin position is off).
**Cause**: Multiple — go through this list:
1. `[macOS]` Rubber-band overscroll pulls sticky thead down during pull → `overscroll-y-none` on `<main>` (NOT `overscroll-none`, which kills back/forward swipe gesture).
2. `<table>` nested inside another `overflow` / `transform` ancestor between it and the real scroller → keep `<table>` as direct child of the `overflow-auto` scroller.
3. Ancestor has `transform`, `filter`, or `will-change` → creates new containing block, sticky anchors wrong. Walk up and remove, or move sticky out.
4. `border-spacing-y-1.5` on parent `<table>` adds a 6 px gap above pinned thead → use `border-collapse: separate` + `border-spacing: 0 6px` and live with it (reads as breathing room), OR `border-spacing: 0` + cell padding for row gap.
5. No background on header → row content scrolls THROUGH. Add `bg-bg` to every sticky element.
6. Hand-rolled div+flex columns → header columns drift, reads as "sticky broken". See next entry.

**Symptom**: Header columns drift out of alignment with body cells (STATUS text off-center from pill; LABELS header left of chips; drift compounds rightward).
**Cause**: Rendering with div+flex; header row contains an extra non-cell child (Display button, filter summary, `ml-auto` anchor). Flex distributes leftover space per row — rows with different children distribute differently. Bandaid: anchoring Display with `position: absolute` inside sticky rowgroup — works at one viewport, breaks at others.
**Fix**: Real `<table>` + `<colgroup><col style={{width}}>` per column + `table-layout: fixed`. Browser reads colgroup ONCE and applies same widths to thead and tbody — cannot drift. Non-cell affordances (Display button) live in PageHeader's toolbar next to search; DataTable exposes table via `onTableReady` callback. Mixed-content midline = `<td>` wraps content in `<div class="flex items-center h-full">`, NOT `vertical-align`.
**Deeper**: `references/datatable-mechanics.md` → 4 first principles.

**Symptom**: Right cushion `--page-pr` invisible at max scrollLeft (last column touches card's right edge, no gap).
**Cause**: Chrome bug 906463 — `padding-right` on a flex parent is NOT in scroll-reachable region when `scrollWidth > clientWidth`.
**Fix**: `min-w-fit` on the padded inner element so it encompasses content + padding, and padding-right becomes part of `scrollWidth`.
```tsx
<div className="overflow-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
  <div className="w-full min-w-fit"
       style={{ paddingLeft: 'var(--page-pl)', paddingRight: 'var(--page-pr)' }}>
    <table>...</table>
  </div>
</div>
```

**Symptom**: Row pill not rounded on right edge.
**Cause**: `bg + rounded` on `<tr>` doesn't paint with `border-collapse: separate`.
**Fix**: bg + rounded on every `<td>`. First td `rounded-l-md`; BOTH last real td AND trailing fake-space td get `rounded-r-md` (whichever is visible carries the visual).

**Symptom**: A list page can hide columns but has no way to show them again ("Hide" menu has no inverse).
**Cause**: Missing global "Display" entry.
**Fix**: Surface a "Display / Columns" popover entry (one toggle per column). The right place: trailing fake-space at far right of header row, anchored `ml-auto`. Without this, hiding a column is one-way.

**Symptom**: Header label `PRIORITY` overlaps neighbor `ID` column on a 32px-wide priority column.
**Cause**: `width: 32px` too small to fit "PRIORITY".
**Fix**: For icon-only columns (priority arrow, status icon, drag handle), set `header: ""`. The body icon is self-evident. Otherwise widen.

**Symptom**: Hovering a header button paints a hover background that crosses into the neighbor column.
**Cause**: Padding on cell wrapper (`<th class="px-3">`), button is `w-full` inside. Button bg covers padding gap that was the visual gutter.
**Fix**: Move padding INSIDE the button. Cell wrapper no horizontal padding; button has `px-3`.
```tsx
<div role="columnheader" style={{ width: col.size }} className="shrink-0 h-9 flex items-stretch">
  <button className="flex-1 px-3 hover:bg-bg-surface ...">{label}</button>
</div>
```

**Symptom**: Chip text wraps to two lines (`In Progress` becomes `In` / `Progress`).
**Cause**: Default `inline-flex` chip lacks `whitespace-nowrap` AND `shrink-0`.
**Fix**: Every chip primitive (StatusPill / LabelChip) sets both: `className="inline-flex items-center gap-1 ... whitespace-nowrap shrink-0"`. Property of the primitive, not each consumer.

**Symptom**: Short or empty list collapses into a sliver instead of filling the card vertically.
**Cause**: No anchor for the bottom edge.
**Fix**: Scroll container `h-full flex flex-col`; inner column `flex-1 min-h-0`; body rowgroup `flex-1` plus an `mt-auto` "N results" footer (or empty-state `m-auto`).

**Symptom**: List page does `.filter(r => r.x === y)` over loaded rows.
**Cause**: Client-side filtering lies when more pages exist.
**Fix**: Endpoint accepts the query param. Server-side contract: `status`, `q`, `sort=field:dir`, etc.

**Symptom**: Short content columns (dates `Jul 15`, relative times `2h ago`, single-digit counts) right-aligned, creating a visual zigzag.
**Cause**: Mixing left- and right-aligned columns — eye keeps re-anchoring.
**Fix**: Default left for ALL content. Use `align: "right"` only on long numeric columns where digit-stack alignment helps (currency totals) OR trailing actions (Edit / `⋯`).

### Tool-specific gotchas

**Symptom**: `[shadcn]` `[Tailwind v4]` DropdownMenuContent / PopoverContent renders with TRANSPARENT background — rows show through.
**Cause**: shadcn primitives reach for `bg-popover`, `bg-accent`, `text-foreground`. If `@theme` didn't map them onto your palette tokens, Tailwind v4 silently emits no rule.
**Fix**: Add shadcn aliases in `@theme`:
```css
--color-background: var(--bg);
--color-foreground: var(--fg);
--color-popover: var(--bg);
--color-popover-foreground: var(--fg);
--color-accent: var(--bg-surface);
--color-accent-foreground: var(--fg);
--color-input: var(--border);
```
**Deeper**: `references/wireless-tokens.md`.

---

## Modal / overlay

**Symptom**: Popover content overflows the card's right edge (panel pokes half off screen).
**Cause**: Popover has fixed width / `min-width` > available space; no collision detection.
**Fix**: `<PopoverContent align="start" sideOffset={4} collisionPadding={8} className="w-auto">`. Let content size; Radix Floating UI auto-flips/shifts. Avoid fixed `w-44`.

**Symptom**: Writing a custom Modal / Combobox / Toast / Pagination.
**Cause**: Reinventing.
**Fix**: Your primitive lib (shadcn / Mantine / Park UI / Headless UI) has it. Wrap once for layout (header / scrollable body / optional footer / locked max-width); don't replace.

### Tool-specific gotchas

**Symptom**: `[shadcn]` Modal silently collapses to 384 px wide regardless of `max-w-lg`.
**Cause**: shadcn `<DialogContent>` ships `sm:max-w-sm` baked in — at sm+ viewports it overrides every size you pass.
**Fix**: Build one project wrapper that forces width with `!` important, and safelist the variants:
```tsx
const widthClass = `!${maxWidth.replace(/^!/, "")}`;
<DialogContent className={cn("max-h-[85vh] flex flex-col gap-0 p-0", widthClass)}>
// JIT safelist: !max-w-sm !max-w-md !max-w-lg !max-w-xl !max-w-2xl !max-w-3xl !max-w-4xl
```
**Deeper**: `references/overlays-and-keyboard.md`.

---

## Cmd+K / keyboard

**Symptom**: Cmd+K works on Mac but not Windows / Linux.
**Cause**: Bound `e.metaKey` only.
**Fix**: `e.metaKey || e.ctrlKey` (Linear convention — works everywhere).

**Symptom**: Cmd+K is just a route menu, or runs client-side fuzzy filter over loaded data.
**Cause**: Treating it as a navigation widget.
**Fix**: Global mount, dual-key, four sections in fixed order: Recent / Actions / Navigate / Search. Search is server-side `q` across entities, debounced 100–150ms, only when `query ≥ 2 chars`.
**Deeper**: `references/overlays-and-keyboard.md`.

---

## Tokens / density

**Symptom**: Card stops feeling like it's floating; sidebar and card bg read as one slab.
**Cause**: `--bg` and `--bg-sidebar` differ by less than ~4% luminance.
**Fix**: Recompute the elevation ladder; ≥4% luminance gap pairwise across `--bg`, `--bg-sidebar`, `--bg-surface`.
**Deeper**: `references/wireless-tokens.md`.

**Symptom**: One-off `h-10` / `h-12` / `text-[12.5px]` / `<Icon strokeWidth={1.5} />` scattered through pages.
**Cause**: Magic numbers bypassing the closed scale.
**Fix**: Pick from canonical scales — heights `h-7 / h-8 / h-9 / h-11 / h-28 / h-56 / h-72`; type `text-xs / text-sm / text-base / text-lg / text-xl / text-3xl`; icons `size-3.5 / size-4` with default `stroke-width=2`.
**Deeper**: `references/wireless-tokens.md`.

**Symptom**: Reaching for `border-*` to make a section visible.
**Cause**: Treating borders as the layout glue.
**Fix**: `bg-bg-surface/60` tint + whitespace.

**Symptom**: Error handling dispatches on `error.message.includes(...)`.
**Cause**: String matching is brittle.
**Fix**: Define stable `error.code`. Frontend reads `ApiError.code === "invalid_status"`. NEVER `error.message.includes(...)`.

**Symptom**: Same label / count / status appears twice on the page.
**Cause**: Skipped the redundancy hunt.
**Fix**: Before adding text or chrome, find where it already lives. Page name in PageHeader when breadcrumb shows it → `<PageHeader title={null} />`. Status pill AND `Status: In Progress` label → drop the label. Modal title duplicating trigger label → drop one. Refresh button when stale-while-revalidate already handles it → delete.

**Symptom**: Dashboard has a 7-slice pie, dual-axis chart, donut+center-number, gauge.
**Cause**: Reaching for ornamental viz.
**Fix**: Sorted bar / two stacked / just-the-number.

---

## Misc (FOUT, focus rings, scrollbars, splitters)

**Symptom**: `[browser API]` Page text "jumps" on first load — fallback fonts paint, then swap to real fonts and every width shifts.
**Cause**: Google Fonts default `font-display: swap`.
**Fix**: Gate first paint until fonts loaded. Use `document.fonts.load(font, text)` NOT `document.fonts.ready` (`ready` can resolve before declared-but-unused `@font-face` is fetched).
```html
<style>
  #root { visibility: hidden; }
  html.fonts-ready #root { visibility: visible; }
</style>
<script>
  const targets = ['500 14px "DM Sans"', '400 16px "Instrument Serif"', '500 12px "JetBrains Mono"'];
  const reveal = () => document.documentElement.classList.add('fonts-ready');
  if (document.fonts && document.fonts.load) {
    Promise.all(targets.map((f) => document.fonts.load(f, "Sample 123"))).then(reveal);
  } else { reveal(); }
  setTimeout(reveal, 1500);  // hard cap
</script>
```

**Symptom**: Clicking a header (`PRIORITY ▾`) or filter chip adds a 2 px outline that looks "selected" rather than "focused".
**Cause**: Global `*:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` applies to buttons already inside borders, drawing an outer ring that isolates them.
**Fix**: Lower global to 1 px; exempt `button`, `input`, `textarea`, `[role="menuitem"]`, `[cmdk-input]`. Free-floating buttons that need a ring use `focus-visible:ring-2` explicitly.
```css
*:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; }
input:focus-visible, textarea:focus-visible, button:focus-visible,
[role="menuitem"]:focus-visible, [cmdk-input]:focus-visible { outline: none; }
```

**Symptom**: Default browser scrollbar visible on detail page panels.
**Cause**: No scrollbar override.
**Fix**: `[&::-webkit-scrollbar]:hidden [scrollbar-width:none]` on every internal scroller. `<main>` keeps `scrollbar-gutter: stable`.

**Symptom**: Splitter line constantly visible between body and rail on a detail page.
**Cause**: `divide-x divide-border/60` on the grid wrapper.
**Fix**: Replace with hover-only fade-in hairline; widen with a 6 px invisible drag track for resize.
