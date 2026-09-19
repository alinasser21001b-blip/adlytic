# Structural archetypes — choose the bones BEFORE the skin

> Read when: starting any new project. Pick the structural archetype FIRST (this file), THEN pick visual style knobs (`references/visual-style.md`), THEN write tokens (`references/wireless-tokens.md`). If you skip this step, every taste-saas build ends up as a "Linear floating-card" clone because that's the only structure the references implicitly assume.

The previous skill version made one big mistake: it baked the **Linear-style structural archetype** (floating card on a gray stage, sidebar with no border, breadcrumb in a "stage row" above the card, row-pill DataTable) into every reference as if it were universal truth. It's not — it's **one** valid structure out of several.

Real-world SaaS consoles fall into 4 distinct structural archetypes. They differ in **layout topology** (where the panels live), **separation philosophy** (how zones are divided), **density paradigm** (how rows look), and **chrome philosophy** (how much UI border there is). Same product category (issue tracker), totally different shape.

**Pick the archetype based on the product's center of gravity:**

| Archetype | Best for | Anchor products |
|---|---|---|
| **A — Floating card on stage** | Dense, focused work tool — issue tracker, ticket queue, log viewer | Linear, LangSmith, Cron, Height |
| **B — Flush-pane dashboard** | Operational dashboard with big readable surfaces, no nesting | Vercel, GitHub, Sentry, PostHog |
| **C — Document workspace** | Content-first app — wiki, docs, knowledge base, CMS, project planner | Notion, Linen, Causal, Coda |
| **D — Enterprise data table** | High-density financial / admin / data tool with no "card" affectation | Stripe Dashboard, Plaid, Retool, Airtable |

Default if user doesn't specify: ask. If user just says "build a SaaS console", ask: *"Three quick choices: (1) Linear-style floating-card dense console, (2) Vercel-style flush-pane dashboard, (3) Notion-style document workspace, (4) Stripe-style enterprise data tool."* Don't default to A.

---

## Archetype A — Floating card on stage (Linear / Cron / Height)

The current default of the skill demo. Best when the product is a **focused work surface** where the user spends hours navigating dense rows.

```
viewport (bg-sidebar gray)
┌─────────────────────────────────────────────┐
│  ┌─ sidebar ──┐ ┌── content card ────────┐  │
│  │ workspace ▾│ │ breadcrumb (stage row) │  │  ← breadcrumb LIVES ON STAGE
│  │ search  ✎  │ │ ┌────────────────────┐ │  │     above the card
│  │            │ │ │ PageHeader portal  │ │  │
│  │ My work    │ │ │ (toolbar)          │ │  │
│  │ Inbox  (7) │ │ ├────────────────────┤ │  │
│  │ Issues  ●  │ │ │ <main> outlet      │ │  │
│  │ Projects   │ │ │ (only scroller)    │ │  │
│  │ user@bot   │ │ └────────────────────┘ │  │
│  └────────────┘ │  rounded-xl + shadow   │  │
│                 └────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Structural choices:**
- Sidebar: **floating on stage**, transparent bg (`bg-sidebar` = same as stage), no `border-r`. Padding `pl-3 pr-0`.
- Main: **rounded-xl floating card**, faint border + soft shadow, inset from stage on right + bottom (`pr-2 pb-2`).
- Breadcrumb: **above the card** in a "stage row" (`h-11`), three-rows-on-one-baseline with sidebar brand.
- DataTable rows: **pill style** — each row has its own `bg-bg-surface/50` + `rounded-md` background block; rows are separated by `gap-px` (1px); hover deepens the pill.
- Active nav: filled pill (`bg-sidebar-accent`).
- Default radii: 8–12px (rounded but not playful).
- Default shadow: faint two-layer (`0 1px 0 0/3%, 0 4px 12px -4px 0/8%`).

Reference impl: all current Pulse demos. See `references/archetype-a-floating-card.md` for the full recipe.

---

## Archetype B — Flush-pane dashboard (Vercel / GitHub / Sentry)

Sidebar is **flush to the viewport edge**, main content is a **plain pane** (not a card), they're separated by a **single hairline** + a small bg-color delta. No "stage" gray frame around things. Everything feels **bigger** because nothing is inset.

```
viewport
┌─────────────────────────────────────────────┐
│┌─ sidebar ──┐ ┌── main pane ──────────────┐│
││ workspace ▾│ │ All Projects ⌄  Overview  ⋯││  ← top bar IS the chrome, single
││ Find...  F ││  ───────────────────────────││     hairline below it
││            │ │                            ││
││ Projects ▮ │ │ Usage             Projects ││
││ Deployments│ │ ┌──────────┐  ┌──────────┐ ││
││ Logs       │ │ │  Last…   │  │ lucy-web │ ││  ← cards inside main use
││ Analytics  │ │ │  101/1M  │  │          │ ││     thick outline border
││            │ │ └──────────┘  └──────────┘ ││     (NO shadow)
││            │ │                            ││
││ Action Req!│ │                            ││
│└────────────┘ └────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Structural choices:**
- Sidebar: **flush to viewport edge** (no outer stage padding), has its own bg (slightly different from main, ~3-5% gap), separated from main by **a 1px border-r** AND a bg-color delta (belt + suspenders).
- Main: **plain pane**, no rounded corners, no shadow. Just `bg-bg`.
- Top bar inside main: **sticky h-12 with a single border-b**, holds breadcrumb + page actions. NO separate "stage row" above the pane — the top bar IS the chrome.
- DataTable rows: **hairline-divided rows** — no pills, no per-row bg. Each row has a `border-b border-border/50` separator. Hover changes whole-row bg with no rounding.
- Cards inside main (KPI tiles, project cards): **thick visible outline border** (`border border-border-strong`), NO shadow. The border IS the card.
- Active nav: **left vertical accent bar** (`border-l-2 border-fg`) on a slightly-darker-bg pill, OR icon+label both bold.
- Default radii: **mixed** — list items `rounded-sm` (2-4px), action buttons / pills `rounded-full` or `rounded-lg`, cards `rounded-md` (6-8px). Sharper than Archetype A overall.
- Default shadow: **none on internal surfaces**. Save shadow ONLY for true popovers (Modal, Dropdown). Cards rely on border.
- Primary action color: often **pure black** (`bg-fg text-bg`) rather than brand color — Vercel signature.

**STOP rules unique to this archetype:**
- Don't wrap main in `rounded-xl shadow` — it kills the flush feel.
- Don't omit the sidebar/main border-r — without it the two zones bleed.
- Don't use row pills (`bg-bg-surface/50` per `<td>`). Use `border-b` rows.
- Don't use brand-color for primary actions if the project signals "minimal" — black is the move.

---

## Archetype C — Document workspace (Notion / Linen)

The page IS the document. Almost no chrome, almost no surface contrast, **lots of whitespace**. Sidebar is hierarchical (tree of pages). Tables are content blocks inside the document, not the page's main attraction.

```
viewport (bg-bg — single surface, sidebar barely tinted)
┌─────────────────────────────────────────────┐
│┌─ sidebar ──┐ ┌── document ───────────────┐│
││ workspace ▾│ │                            ││
││ Search   F │ │       Issues               ││  ← page title is editorial
││            │ │       ──────               ││     (serif or large sans),
││ Quick      │ │                            ││     left-aligned, no chrome
││ ▾ Pages    │ │  Description / intro text  ││
││   ▸ Spec   │ │                            ││
││   ▸ FAQ    │ │  ┌──────────────────────┐  ││  ← table is a content block
││ ▾ Bugs     │ │  │ ID  | Title  | Status│  ││     with hairline grid
││   ▸ ENG-1  │ │  │ ─── ─────── ────── │  ││
││            │ │  │ ENG-1 │ Foo │ Todo  │  ││
│└────────────┘ └────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Structural choices:**
- Sidebar: **slightly tinted** (`--bg-sidebar` only 2-3% off main), separated by hairline only. Tree-style with expand/collapse arrows. Nested nav.
- Main: **plain document surface**, generous horizontal padding (`--detail-px` larger than other archetypes, ~48-64px). Max width often capped (`max-w-3xl`) and centered.
- Page title: **editorial** — large (text-2xl/3xl), serif display, no breadcrumb row above (the page title is its own crumb).
- DataTable rows: **hairline grid** style — each row separated by `border-b`, NO pills, NO hover bg fill. The table looks like a printed table or a Notion database view.
- Active nav: **bold text** + slightly darker bg, no pill chrome.
- Default radii: **sharp** (0-4px). Document-y.
- Default shadow: **none**. Hairlines do all separation work.
- Type stack: serif display + sans body, OR all sans with strong size hierarchy.

**STOP rules unique to this archetype:**
- Don't add a "stage row" with breadcrumb — the page title IS the chrome.
- Don't use floating cards / shadow — kills the document feel.
- Don't use row pills.
- Don't use a small max-width for the sidebar (no `w-56`); let it grow with the deepest nav item.
- Don't introduce brand-color action buttons in the body — primary actions are usually subtle text links or small buttons in a corner.

---

## Archetype D — Enterprise data table (Stripe / Retool / Plaid)

When the product IS the data. The table fills the whole viewport area. Sidebar is utilitarian. No card, no float, no shadow, no extras. Information density is the only goal.

```
viewport
┌─────────────────────────────────────────────┐
│┌─ sidebar ──┐ ┌── header bar (h-12) ──────┐│
││ workspace  │ ├─────────────────────────────┤│  ← page title left, actions right
││            │ │ Filters  │  Search   [⬇ csv]││
││ Payments   │ ├─────────────────────────────┤│
││ Customers  │ │ ID    Amount  Status  Date  ││  ← table fills the rest,
││ Disputes ●9│ │ ─────────────────────────── ││     zebra OR hairline rows,
││ Reports    │ │ pi_…  $4.50   Succ.  10:32  ││     sticky header
││ Settings   │ │ pi_…  $11.20  Fail   10:33  ││
││            │ │ pi_…  $7.00   Succ.  10:35  ││
││            │ │ pi_…  $9.40   Pend.  10:36  ││
│└────────────┘ └────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Structural choices:**
- Sidebar: **flush, slim** (`w-48` to `w-56`), simple text nav, no flashy chrome.
- Main: **plain pane**, no card, no rounding. Just `bg-bg`.
- Top bar: **two stacked rows** — page title row (h-11) + filters/actions row (h-10), separated by `border-b`. Maximally efficient header.
- DataTable rows: **hairline OR zebra** style. Stripe uses hairline + slight hover-tint. Airtable uses zebra. NEVER pills.
- Sticky thead with strong bg + bottom border. Sticky leftmost column for wide tables.
- Active nav: text-only highlight OR thin vertical accent bar.
- Default radii: **near-zero** on internal surfaces (1-2px); only buttons/inputs have soft radius (4-6px).
- Default shadow: **none**, ever.
- Tabular numbers everywhere (`font-variant-numeric: tabular-nums`).
- Pagination at table bottom (not infinite scroll — admin / financial users need page boundaries).

**STOP rules unique to this archetype:**
- Don't insert a "stage" gray frame — wastes pixels.
- Don't use row pills, ever.
- Don't make the table its own card with shadow — the table IS the page.
- Don't hide pagination — admin/financial users count on it.
- Don't omit `tabular-nums` on numeric columns — alignment IS the read.

---

## The decision flow on a new project

```
1. Read the user's prompt + any product screenshots they shared.
2. Categorize: focused-tool (A) / dashboard (B) / document (C) / data (D)?
   If unclear → AskUserQuestion with the 4 named options.
3. With archetype chosen, go to references/visual-style.md and pick
   color/radius/shadow/type/density knobs WITHIN that archetype's
   allowed ranges (each archetype has different defaults).
4. With both chosen, go to references/wireless-tokens.md to write the token
   values to globals.css. Most token NAMES are the same across
   archetypes (--brand, --bg, --row-h…) but the VALUES + the
   structural elements that consume them differ wildly.
5. Build the AppShell using THIS archetype's structural choices.
```

## What changes per archetype — quick lookup

| Concern | A — Floating card | B — Flush pane | C — Document | D — Data table |
|---|---|---|---|---|
| Sidebar bg vs main bg | =stage (8% darker than main) | 3-5% darker | 2-3% darker | 3-5% darker |
| Sidebar border-r | NONE | YES (hairline) | YES (hairline) | YES (hairline) |
| Main wrapper | rounded-xl card + shadow | flush plain | flush plain | flush plain |
| Stage gray around main | YES (pr-2 pb-2) | NO | NO | NO |
| Breadcrumb location | Above card in stage row | Inside top bar | Page title is the crumb | Inside top bar |
| Top bar inside main | NO (handled by stage row) | YES (h-12, border-b) | NO | YES (often 2 rows) |
| DataTable row style | Pill (bg+rounded per td) | Hairline (border-b) | Hairline | Hairline OR zebra |
| Card-surface chrome | Faint border + shadow | Thick border, no shadow | None | None |
| Default radius | 8-12px | mixed (sm-md + full pills) | 0-4px | 0-2px |
| Default shadow | Faint two-layer | None on surfaces | None | None |
| Active nav indicator | Filled pill | Left accent bar | Bold text + bg | Vertical bar OR bold |
| Primary action color | Brand | Often black (`bg-fg`) | Subtle / link-style | Brand OR black |
| Sidebar nav style | Flat icon+text list | Flat icon+text list | Tree with expand | Flat text list |

## The skill's other references — how they apply per archetype

Most existing references assume Archetype A. When working in another archetype, **inverse-translate** as follows:

- `references/archetype-a-floating-card.md` — describes A's stage-row + card. For B/C/D, drop the stage row and the card wrapper. Keep the 3-top-rows-baseline RULE (it still applies, just to different elements: B's top bar row, C's page title row).
- `references/datatable-mechanics.md` — DataTable code uses pill rows (A). For B/C/D, change `pillBase` from `bg-bg-surface/50 + rounded-md` to `border-b border-border/50` (no bg, no rounding). The `<table>` + `<colgroup>` + `table-layout: fixed` skeleton still applies.
- `references/detail-pages.md` — archetypes B-rail and C-doc still apply within their structural archetype.
- `references/wireless-tokens.md` — token NAMES are universal; VALUES come from the visual-style.md knobs chosen for this project's archetype.
- `references/sheets.md`, `references/overlays-and-keyboard.md`, `references/menus.md` — fully archetype-agnostic. Sheet / Modal / Popover behave the same regardless of structural archetype.

## Anti-patterns

- **Defaulting to A without asking.** The biggest one. If the user said "make me a SaaS console" and showed a Vercel screenshot, building it as Linear is failure.
- **Mixing structural archetypes.** A floating-card dashboard inside a flush-pane shell is incoherent. Pick one for the whole app.
- **Copying token values from one archetype's example into another.** A `shadow-card` value that works on Archetype A makes Archetype B's flush pane look wrong. Each archetype has its own shadow philosophy — don't cross-pollinate.
- **Adding "stage row" breadcrumb to non-A archetypes.** B/C/D don't have a stage; the breadcrumb belongs inside the main pane's top bar (or doesn't exist at all in C).
