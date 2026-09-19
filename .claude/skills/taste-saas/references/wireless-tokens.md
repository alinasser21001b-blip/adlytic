# Wireless tokens — the universal token system

> Every visible spacing, height, gap, and surface reads from one of these tokens or a `calc()` formula over them. Hard-coded pixels in component code is a bug.

"Wireless" = the relationships between elements expressed in tokens and CSS-derived formulas, **not in hard-coded pixels or per-component overrides**. When a measurement looks "off", the answer is always "what token / formula?" — never "what px?".

The token NAMES below are the universal contract — they're identical across all four structural archetypes (A floating-card / B flush-pane / C document / D data-table). The VALUES are picked per archetype + visual style; see `references/structural-archetypes.md` and `references/visual-style.md` for the picking. This file defines the names and the shape of the contract, not the values.

---

## The five token families

Each family encodes one wireless rule. Pick the right family for your concern; derive everything else from it.

### 1. X-axis padding lock — `--page-pl` / `--page-pr` / `--detail-px`

**Why this family exists.** Every row in the content area must open at the same x. Without one shared variable, toolbar uses `pr-4`, table uses `px-3`, the scroll container has its own padding, the empty state hand-picks 24 px, and the right/left edges drift by 8–24 px. The only fix is one variable that every consumer reads. List/dense pages use `--page-pl/pr`; detail pages use `--detail-px` because reading benefits from more inset than dense lists do.

**Value-picking rule.** `--page-pl` MUST equal the sidebar's nav-icon-column outer padding so the sidebar's nav icons and the main pane's first column land on the same vertical line. If you change one, change the other. See `references/alignment-invariants.md` → "Padding-lock principle".

Consumers (every archetype): PageHeader title/toolbar rows, DataTable `<table>` cushion, empty-state wrapper. All apply `style={{ paddingLeft: 'var(--page-pl)', paddingRight: 'var(--page-pr)' }}`. Detail-page `<article>` swaps in `--detail-px`. Now `toolbar.left`, `thead.firstCol.left`, `body.firstCol.left` share an x by construction.

### 2. Y-axis row rhythm — `--top-row-h` / `--row-h` / `--row-gap-y`

**Why this family exists.** The y-axis counterpart to the X-axis padding lock. Without it, the top chrome's first row drifts 6–10 px off the sidebar's first nav row across the seam. Each side independently picks `h-11 → py-1 → h-7` vs `min-h-9 → py-2 → h-8`; the numbers happen to be different, the drift follows.

Consumers:

| Element | Use |
|---|---|
| Top chrome row (whatever the archetype's top element is) and sidebar brand row | `height: var(--top-row-h)` |
| SidebarContent / PageHeader toolbar y-padding | `padding-block: var(--row-gap-y)` |
| Every nav / toolbar / table-pill row | `height: var(--row-h)` |
| Inter-group sidebar gap | `margin-top: calc(var(--row-gap-y) * 2)` — derive, don't magic |
| Collapsed-stack height (N icon rows) | `calc(N * var(--row-h) + (N - 1) * 1px)` — derive |

Result by construction: top chrome's first row top === sidebar's first row top (cross-seam baseline lock). Verify with `getBoundingClientRect()`.

> **Two height tokens, two roles.** `--top-row-h` is for the top chrome band; `--row-h` is for every dense row. Don't reuse one for the other. KPI cards / chart cards are content (not chrome) — they keep their own `h-28 / h-56 / h-72`.

**When `html { font-size }` ≠ 16 px.** A project may set 14 px root for a compact console. All rem-based heights resolve against this. The token approach is unaffected — `--top-row-h: 2.75rem` resolves the same way for every consumer — but hard-coded `mt-[44px]` reservations break. Always `calc(...)` from the token.

### 3. Stage inset frame — `--stage-inset`

**Why this family exists.** When the archetype has a "stage" (e.g. a tinted band around a floating card), the band thickness on every side that isn't adjacent to the sidebar must be one value. AppShell's outer wrapper uses `paddingRight: var(--stage-inset)` and `paddingBottom: var(--stage-inset)`. The **top** inset (above the top chrome row) is NOT this token — it's whatever element holds the top chrome row.

**Archetype impact.** Set to `0` for archetypes that don't have a stage. Keep the variable in the system so component code doesn't have to branch — components that wrap with `padding: var(--stage-inset)` produce no inset when the value is 0, and a non-zero inset when the visual style asks for one. One contract, every archetype.

### 4. Icon SLOT size — `--slot-size`

**Why this family exists.** Different rows carry different-sized icons (brand mark > nav icon > footer chevron). The thing that aligns is the fixed-size SLOT wrapper, not the icon itself.

```tsx
<span className="size-[var(--slot-size)] shrink-0 grid place-items-center">
  <Icon />
</span>
```

Across every row in the sidebar (brand, every nav row, footer, search/+ buttons), the slot is identical; the icon inside can be any size. Centers align because `padding-left + slot_width/2` is constant. `padding-left + icon_width/2` is not — see `references/alignment-invariants.md` → "Icon SLOT is the alignment unit" for the full reasoning and verification snippet.

**Value-picking rule.** Match `--slot-size` to the footer avatar size (commonly 20 px). The icon inside is decoration; the slot is the alignment unit.

### 5. Motion — `--dur-*` + `--ease-*` + `LAYOUT_TR`

**Why this family exists.** Three durations × three eases referenced by every animation means `prefers-reduced-motion` is one block away. Hardcoded `200ms` / `400ms` need their own overrides. A single `LAYOUT_TR` JS constant is what makes choreographed multi-property layout transitions (sidebar width + collapsed-stack height + panel margins) land on the same frame. Per-property timing causes staircased "shrink-then-expand" jitter — one duration, one easing, one delay, all properties end together.

Three durations (`--dur-quick / --dur-base / --dur-slow`) × three eases (`--ease-soft` iOS-spring for modal/toast; `--ease-snap` for hover/press; `--ease-quart` for layout shifts), referenced by every animation. `LAYOUT_TR` is a *JS constant* (not a CSS var) — used for the choreographed multi-property layout transitions defined in `references/archetype-a-floating-card.md`.

---

## Closed scales (universal — no exceptions across archetypes)

These don't depend on archetype. Don't invent new values mid-build.

### Height scale

| Token | px | Where |
|---|---|---|
| `h-7` | 28 | dense secondary chip, mini icon button, every dense row (= `--row-h`) |
| `h-8` | 32 | toolbar chip, button, search input |
| `h-9` | 36 | form input, table row inner cell, header cell |
| `h-11` | 44 | top chrome row / sidebar header / tenant switcher (= `--top-row-h`) |
| `h-28` | 112 | KPI card |
| `h-56` / `h-72` | 224 / 288 | chart card (pick one per dashboard) |

Anything else (`h-10`, `h-12`, `h-14`, `h-[33px]`) is wrong — re-pick from the list. Micro utility heights (`h-1.5` dot, `h-4` checkbox) are fine; they're component primitives, not chrome.

### Type scale

| Class | px | Where |
|---|---|---|
| `text-xs` | 12 | secondary metadata, timestamps, chord chips, eyebrow labels |
| `text-sm` | 14 | **body default** — table cells, form labels, nav items, prose |
| `text-base` | 16 | callout body, currency suffix next to a big number |
| `text-lg` | 18 | section heading inside a detail page |
| `text-xl` | 20 | page title in PageHeader (rare — breadcrumb usually owns the name) |
| `text-3xl` `font-display` | 30 | KPI card big number, hero stat |

No `text-[10.5px] / [11.5px] / [12.5px] / [13px] / [13.5px]` half-step. Tailwind's default ladder has visible steps because the gaps are perceptual; sneaking 0.5 px between adjacent tokens creates three sizes that all read as "about 12 px" and looks ad-hoc.

Weights: `font-medium` (500) for emphasis, `font-semibold` (600) for headings. **Never `font-bold` (700)** in console UI — too heavy at 14 px.

### Icon discipline

- Lucide default `stroke-width=2`. Don't override per-icon or in CSS. Mixed stroke widths read as "designer ran out of time" before any other tell.
- Two size tokens only: `size-3.5` (14 px) for toolbar / table cells, `size-4` (16 px) for nav items / buttons. No `size-3`, no `size-5` on the icon *itself* (that's the SLOT class, not the icon class).

---

## Focus rings — subtle, NOT slapped on every element

Universal across archetypes — the focus contract is independent of visual style.

```css
/* 1px outline + 1px offset sits flush against borders instead of producing
   a thick double-line. Inputs / buttons inside bordered containers ride
   inside a border already; outline on top of that draws a chunky double. */
*:focus-visible {
  outline: 1px solid var(--ring);
  outline-offset: 1px;
  border-radius: 4px;
}
input:focus-visible,
textarea:focus-visible,
button:focus-visible,
[cmdk-input]:focus-visible,
[role="menuitem"]:focus-visible {
  outline: none;  /* use focus-within: styles on the parent instead */
}
```

If a free-floating button (skip-link, etc.) DOES need a visible ring, set it explicitly with `focus-visible:ring-2` on that element.

---

## Reduced motion — one block covers everything

Universal — relies on every consumer reading the motion family rather than hardcoding ms.

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-quick: 1ms;
    --dur-base: 1ms;
    --dur-slow: 1ms;
  }
  .animate-pulse, .animate-bounce { animation: none !important; }
  .animate-spin { animation-duration: 5s !important; }  /* slowed, not stopped */
}
```

If every component animates via `duration-[var(--dur-base)]` or inline `transition: var(--dur-*)`, this single block adds reduced-motion coverage everywhere. Hardcoded 200 / 400 ms transitions need their own override — which is one of the reasons family 5 exists.

---

## FOUT — font-readiness gate

Universal — applies regardless of archetype. Google Fonts default `font-display: swap` produces a visible jump when fonts arrive. Gate the first paint until fonts are loaded.

```html
<style>
  #root { visibility: hidden; }
  html.fonts-ready #root { visibility: visible; }
</style>
<script>
  /* List the (weight size family) tuples the project actually uses. */
  const targets = [ /* '500 14px "<your sans>"', '400 16px "<your display>"', … */ ];
  const reveal = () => document.documentElement.classList.add('fonts-ready');
  if (document.fonts && document.fonts.load) {
    Promise.all(targets.map((f) => document.fonts.load(f, "Sample 123"))).then(reveal);
  } else {
    reveal();
  }
  setTimeout(reveal, 1500);  /* hard cap so a slow network can't blank the page */
</script>
```

`document.fonts.load(font, text)` forces the browser to actually fetch the listed fonts and resolves only when they're cached — `document.fonts.ready` is unreliable.

---

## `:root` block — names + value shape only

Variable names below are the universal contract. Values are placeholders — pick per archetype + visual style.

```css
:root {
  /* Brand — ONE color picked per project. Saturation < 80%, NOT AI purple. */
  --brand:        /* picked per visual style */;
  --brand-hover:  /* picked per visual style — ~6% darker than --brand */;
  --brand-subtle: /* picked per visual style — very light tint */;
  --brand-fg:     /* foreground on --brand; choose for AA contrast */;

  /* Elevation layers — neutral surface palette. Number of layers + step
     sizes depend on archetype: a floating-card needs strong L1↔L2 delta;
     a flush-pane needs subtle L1↔L2 + a hairline; a document collapses
     to one layer. See structural-archetypes.md. */
  --bg:         /* L1: the page surface */;
  --bg-sidebar: /* L2: the sidebar / stage band (may equal --bg in C) */;
  --bg-surface: /* L3: sunken inset on L1, for row pills / panels */;

  /* Foregrounds */
  --fg:         /* primary text */;
  --fg-muted:   /* secondary text */;
  --fg-subtle:  /* tertiary text, eyebrow labels */;
  --border:        /* hairline */;
  --border-strong: /* heavier outline (e.g. B-archetype cards) */;

  /* Semantic — same names across archetypes; hues picked per visual style */
  --success: /* … */;  --success-subtle: /* … */;
  --warning: /* … */;  --warning-subtle: /* … */;
  --danger:  /* … */;  --danger-subtle:  /* … */;
  --info:    /* … */;  --info-subtle:    /* … */;

  /* Motion — three durations + three eases. The 100 / 150 / 220 ms set is
     one well-trodden default; bolder visual styles may pick 80 / 120 / 180. */
  --dur-quick: /* short pop, hover/press */;
  --dur-base:  /* standard transition */;
  --dur-slow:  /* layout shift, modal in */;
  --ease-soft:  /* iOS-spring for modal/toast */;
  --ease-snap:  /* for hover/press */;
  --ease-quart: /* for layout shifts */;

  /* Shadow + hairline — values per archetype. A leans on a faint two-layer
     shadow + border; B uses a thick visible border with NO shadow; C/D
     usually set every shadow to none. */
  --shadow-card: /* picked per archetype */;
  --shadow-sm:   /* picked per archetype */;
  --shadow-md:   /* picked per archetype */;

  --radius: /* primary radius — sharper archetypes 2–4 px; rounder 8–12 px */;

  /* X-axis padding lock */
  --page-pl:   /* MUST equal sidebar nav-icon-column outer padding */;
  --page-pr:   /* usually equal to --page-pl */;
  --detail-px: /* larger inset for reading-oriented detail pages */;

  /* Y-axis row rhythm — cross-seam baseline lock */
  --top-row-h: /* top chrome row height — typically 2.75rem (44 px) */;
  --row-h:     /* dense list row height — typically 1.75rem (28 px) */;
  --row-gap-y: /* sidebar / toolbar inner y-padding — typically 0.25rem */;

  /* Stage inset — non-zero only when the archetype has a stage; else 0 */
  --stage-inset: /* picked per archetype */;

  /* Icon SLOT — match the footer avatar size (commonly 20 px = 1.25rem) */
  --slot-size: /* picked per project */;
}
```

---

## Tailwind v4 `@theme` mapping

The variable names below are the universal contract — keep them stable so primitive aliases and templates agree. Only the names matter here; values come from `:root`. For vanilla CSS or CSS Modules, skip this block and reference `var(--bg)` directly. For Panda CSS, define equivalents in `panda.config.ts` `theme.tokens`.

```css
@theme {
  --color-bg: var(--bg);
  --color-bg-sidebar: var(--bg-sidebar);
  --color-bg-surface: var(--bg-surface);
  --color-fg: var(--fg);
  --color-fg-muted: var(--fg-muted);
  --color-fg-subtle: var(--fg-subtle);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-brand: var(--brand);
  --color-brand-hover: var(--brand-hover);
  --color-brand-subtle: var(--brand-subtle);
  --color-brand-fg: var(--brand-fg);
  --color-success: var(--success); --color-success-subtle: var(--success-subtle);
  --color-warning: var(--warning); --color-warning-subtle: var(--warning-subtle);
  --color-danger:  var(--danger);  --color-danger-subtle:  var(--danger-subtle);
  --color-info:    var(--info);    --color-info-subtle:    var(--info-subtle);

  /* Chart palette — 5 slots, NOT 7+, NOT an AI-purple gradient. Hues per visual style. */
  --color-chart-1: var(--brand);
  --color-chart-2: /* picked per visual style */;
  --color-chart-3: /* picked per visual style */;
  --color-chart-4: /* picked per visual style */;
  --color-chart-5: /* picked per visual style */;

  --radius-md: var(--radius);
  --radius-lg: /* one step rounder than --radius */;
  --radius-sm: /* one step sharper than --radius */;

  --font-sans:    /* picked per visual style */;
  --font-display: /* picked per visual style — serif or display sans */;
  --font-mono:    /* picked per visual style */;
}
```

---

## Body base

```css
body {
  font-family: var(--font-sans);
  font-size: 0.875rem;   /* 14 px — denser than marketing; tunable per archetype */
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
```

Use `font-display` (serif or display sans) for modal titles, brand-mark, dashboard hero stat. `font-mono` for IDs, code, version strings, brand wordmarks. Apply `font-variant-numeric: tabular-nums` to every column showing counts/durations/timestamps and every KPI value. Touch targets ≥ 32×32 (small icon buttons), ≥ 44×44 on mobile menu items.

---

## Primitive-library token aliases

Component primitives (DropdownMenu, Modal, Popover, Tooltip) ship with their own token names. If you don't map yours onto theirs, popovers render with **transparent backgrounds** (you'll see table rows bleed through) and buttons lose their brand color. Pick the section for your library; the others are for reference only. These mappings are universal across archetypes — they connect *your* token names to the *library's* token names.

### shadcn / Tailwind v4

shadcn primitives reach for `bg-popover` / `bg-accent` / `text-foreground` etc. Map them onto your palette inside the same `@theme` block:

```css
@theme {
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --color-card: var(--bg);
  --color-card-foreground: var(--fg);
  --color-popover: var(--bg);
  --color-popover-foreground: var(--fg);
  --color-primary: var(--brand);
  --color-primary-foreground: var(--brand-fg);
  --color-secondary: var(--bg-surface);
  --color-secondary-foreground: var(--fg);
  --color-muted: var(--bg-surface);
  --color-muted-foreground: var(--fg-muted);
  --color-accent: var(--bg-surface);
  --color-accent-foreground: var(--fg);
  --color-destructive: var(--danger);
  --color-destructive-foreground: #ffffff;
  --color-input: var(--border);
}
```

### Mantine / Park UI / Chakra

- **Mantine**: override via `MantineProvider`'s `theme` prop. Set `primaryColor: 'brand'`, `white: var(--bg)`, `black: var(--fg)`, `defaultRadius: 'md'`. For surfaces beyond built-in slots (`bgSurface`, sidebar), mirror them through `theme.other` so custom components can read `theme.other.bgSurface`.
- **Park UI / Chakra v3**: declare tokens in `panda.config.ts` (Park UI) or `theme.tokens` (Chakra) as semantic tokens that resolve to the `:root` vars, e.g. `bg: { canvas: { value: '{colors.bg}' } }`.

For any other library: find where it declares its color/surface/popover defaults and point them at the CSS vars from `:root`.

---

## Cushion that scrolls with content (DataTable subtlety)

For DataTable's horizontal scroll, `--page-pl/pr` goes on the **inner** `<div>` (the table-flex container), NOT on the outer scroll container. This way the cushion scrolls with the table:

- at `scrollLeft = 0`: cushion shows as a gap on the left edge
- in the middle: cushion is offscreen, content uses full viewport width
- at `scrollLeft = max`: cushion shows as a gap on the right edge

If you put padding on the scroll container instead, the cushion is always visible and the content can't reach the viewport edges — wastes space and reads as "the table is in a smaller box than the rest of the page". Universal — applies in any archetype that has a horizontally scrolling table.
