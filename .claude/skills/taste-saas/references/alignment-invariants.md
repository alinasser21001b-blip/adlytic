# Alignment invariants — universal geometry laws

> Read when: the shell, sidebar, or top chrome looks "almost right but a few pixels off". Every rule here applies regardless of which structural archetype you picked (A floating-card, B flush-pane, C document, D data-table). The elements differ — the geometry doesn't.

These are the laws. Each rule has a WHY (the universal principle), a verification snippet (how to confirm it holds), and a remediation note (what to do when the measurement fails). Measurement is the spec — if a designer says "looks off" but you can't reproduce it in `getBoundingClientRect()`, you don't have a bug yet.

---

## 1. Viewport lock — pin the shell at viewport height

**Rule.** `index.css` MUST contain:

```css
html, body, #root { height: 100%; margin: 0; overflow: hidden; }
```

**Why.** The sidebar and top chrome are global frame elements that must NEVER scroll out of view. Without these three rules, a tall portal pushes `<body>` past the viewport and the whole shell scrolls — sidebar disappears, breadcrumb / top bar disappears, the page feels broken. Pinning all three at viewport height forces every scroll into `<main>` where it belongs.

**Applies to every archetype.** A's floating card and B/C/D's flush pane all use `<main>` as the only scroller. Same lock, same reason.

**Verify.** In devtools, scroll the page with the mousewheel:

```js
window.addEventListener('wheel', () => console.log('scrollY:', window.scrollY), { once: true });
// Then wheel anywhere on the page. window.scrollY must stay 0.
```

If it changes, find the culprit: a `min-height: 200vh` on a wrapper, an `overflow: visible` override on `body`, or a missing `height: 100%` on `#root`.

**Bonus.** `<main>` should also have `overscroll-behavior-y: none` (kills macOS rubber-band that drags sticky thead) and `scrollbar-gutter: stable` (reserves the gutter so width doesn't shift when content overflows).

---

## 2. Three top rows on ONE baseline

**Rule.** Whatever elements live at the top of the shell, they share one baseline. Each archetype names them differently; the law is the same.

| Archetype | The top elements that must align |
|---|---|
| A — floating-card | sidebar brand row · stage-row breadcrumb · PageHeader toolbar's first row (if visible) |
| B — flush-pane | sidebar brand row · top-bar title row · top-bar actions row (if separate) |
| C — document | sidebar brand row · page title row |
| D — data-table | sidebar brand row · top-bar title row · filters/actions row |

**Why.** The eye reads the top of the shell as one band. If the brand row baseline sits 4 px below the breadcrumb / top bar, the whole app reads as "thrown together". A 2 px miss is detectable; 4 px is loud.

**How.** All of those elements use `height: var(--top-row-h)`. Don't reuse `--row-h` here — `--row-h` is the dense nav-row height and is shorter. Two height tokens, two roles.

**Verify.** From devtools, on any route:

```js
[ 'aside [data-brand]',
  'header [data-top-chrome] > *:nth-child(1)',
  'header [data-top-chrome] > *:nth-child(2)'  /* if your archetype has a second top row */
].map(s => document.querySelector(s)?.getBoundingClientRect())
 .map(r => r && Math.round(r.top + r.height / 2));
```

Every entry must return the same number. Spread ≥ 2 px = fail. The remediation is always one of: something between the element and viewport top added padding (`pt-*`, `mt-*`), an extra wrapper introduced height, or one row used the wrong height token. Find and remove — don't shim with negative margins.

---

## 3. Cross-seam first-row alignment

**Rule.** The sidebar's first nav row top === the main pane's first content row top. The seam between sidebar and main is invisible on the y-axis.

**Why.** Eyes track horizontal lines. If the sidebar's first nav row sits at y=80 and the toolbar's first row sits at y=86, the eye reads "the two columns are unrelated" — even if every other alignment is perfect. The whole shell feels uncoordinated. This is THE most common visible bug in taste-saas builds because every component independently picks its own top padding.

**The mechanical contract.** Both sides MUST be assembled from the same three layout pieces, in the same order:

```
[outer chrome row: --top-row-h]   ← stage row (A), top bar (B/D), or page title row (C)
[gap of --row-gap-y]              ← MANDATORY — the "breathing space" between chrome and content
[first content row: --row-h]      ← first nav item, first toolbar chip, first heading
```

The sidebar's first nav row sits at `--top-row-h + --row-gap-y` from the page top. The main pane's first content row sits at `--top-row-h + --row-gap-y` from the page top. Identity by construction.

**The implementation contract.** On BOTH the sidebar and main pane:

1. The inner scroll container ("SidebarContent" / `<main>`'s inner div) gets `padding-top: var(--row-gap-y)` and NOTHING else above its first child. No `mt-1`, no `py-2`, no extra wrappers.
2. The first child IS the first nav row / first content row, sized to `--row-h` (or its multiple for sections), NOT given its own `mt-*`.
3. The outer chrome row above both is `height: var(--top-row-h)` exactly, with NO bottom margin.

```tsx
// Sidebar — Step 1 wraps everything; Step 2 sets the gap; Step 3 is the first row
<aside className="flex flex-col">
  <div className="h-[var(--top-row-h)]">{/* brand */}</div>      {/* chrome row */}
  <nav className="pt-[var(--row-gap-y)] flex-1 overflow-y-auto"> {/* gap */}
    <NavItem className="h-[var(--row-h)]" />                     {/* first row */}
    {/* ... */}
  </nav>
</aside>

// Main — mirror exactly the same three-piece structure
<div className="flex-1 flex flex-col">
  <header className="h-[var(--top-row-h)]">{/* breadcrumb / top bar */}</header>
  <main className="pt-[var(--row-gap-y)] flex-1 overflow-y-auto">
    <Toolbar className="h-[var(--row-h)]" />                     {/* first row, aligned by construction */}
    {/* ... */}
  </main>
</div>
```

**Verify (do this on every shell build, not just visual eyeball).**

```js
// In devtools console — pass returns true for both numbers within 1px
const sidebarFirstNavTop = document.querySelector('aside nav > :first-child')?.getBoundingClientRect().top;
const mainFirstRowTop = document.querySelector('main > :first-child')?.getBoundingClientRect().top;
console.log({ sidebar: sidebarFirstNavTop, main: mainFirstRowTop, drift: Math.abs(sidebarFirstNavTop - mainFirstRowTop) });
// drift > 1 = bug. Fix at the source, not by adding compensating margin.
```

**Common ways this breaks (and how to spot them in code):**

1. **Sidebar uses `pt-2` while main uses `pt-3`** — find both pt-* values; they must be identical (`pt-[var(--row-gap-y)]`).
2. **An extra wrapper between SidebarContent and first NavItem** with `mt-1` or `space-y-1` — the first item then sits `1 + --row-gap-y` below the chrome instead of just `--row-gap-y`. Audit the JSX tree above the first child.
3. **Header carries `border-b` + main pane carries `pt-2`** — the `border-b` shifts main's top by 1px relative to sidebar's. Either give sidebar a matching `border-b` on its chrome row, OR move the gap above the border on both sides.
4. **Sidebar nav row is `h-9` while main toolbar row is `h-8`** — different `--row-h` interpretations. Both must consume the SAME variable, not their own preferred height.
5. **Page header inside main has its own `py-3` wrapper** — adds invisible 12px on top of `--row-gap-y`. Strip the extra padding; let `--row-gap-y` own all of it.

A quick code audit: search the whole project for `mt-`, `pt-`, `padding-top` near sidebar / nav / main / toolbar. There should be ZERO occurrences except where the value is `var(--row-gap-y)` or `var(--top-row-h)`. Any hard-coded `pt-2` or `mt-1` near top-of-shell elements is the bug.

---

## 4. Icon SLOT is the alignment unit — and so is everything in front of it

**Rule.** Every sidebar row — brand, every nav row, footer / user row — must put its SLOT at **the same x-distance from the sidebar's left edge**. That x-distance is the sum of EVERY padding/margin between the sidebar edge and the slot. The SLOT itself must be the same width on every row; AND every wrapper between the sidebar edge and the slot must contribute the same horizontal offset on every row.

A correct slot wrapper:

```tsx
<span className="size-[var(--slot-size)] shrink-0 grid place-items-center">
  <Icon />
</span>
```

**Why.** Different rows carry different-weight icons — brand mark, nav icon, search/+, footer avatar. If you align icons directly, `padding-left + icon_width/2` only equals across rows when every icon is the exact same size. They aren't. So we wrap each icon in a uniform SLOT and align the slots.

**But the slot is necessary, not sufficient.** Two common mistakes still misalign icons even with a perfect slot:

1. **Brand row wraps its slot in an interactive button with its own `px-*`.**
   Header: `<header className="px-2"><button className="px-1.5"><Slot /></button></header>` → slot center = `8 + 6 + 10 = 24px`
   Nav: `<nav className="px-2"><a className="px-2"><Slot /></a></nav>` → slot center = `8 + 8 + 10 = 26px`
   Footer: `<div className="px-2"><Slot /></div>` → slot center = `8 + 10 = 18px`
   All three slots are 20px wide, but they sit at THREE DIFFERENT x positions because the wrapper chains differ.

2. **Footer skips the row-level inner padding wrapper.** Nav items live inside an `<a className="px-2">` (or `<NavItem className="px-2">`). The footer's user row often skips that intermediate wrapper and puts the slot directly inside the outer `px-2` container — so the footer's slot is shifted left by the missing inner `px-2`.

**The complete contract**: the chain of horizontal padding from the sidebar's left edge to the slot's left edge must be **byte-identical** across brand row, every nav row, and the footer row. Easiest enforcement: every row uses the exact same className for its outermost-inner row wrapper (the thing immediately inside the outer container's `px-2`).

A correct, symmetric sidebar:

```tsx
const ROW = "flex items-center gap-2 h-[var(--row-h)] px-2 rounded-sm";

<aside className="flex flex-col">
  <header className="h-[var(--top-row-h)] flex items-center px-2">
    {/* Brand row's inner element uses the SAME ROW class as nav and footer */}
    <button className={ROW + " flex-1"}>
      <span className="size-[var(--slot-size)] shrink-0 grid place-items-center">
        <BrandMark />
      </span>
      <span>Pulse</span>
    </button>
  </header>
  <nav className="pt-[var(--row-gap-y)] px-2 flex-1 overflow-y-auto">
    {items.map(i => (
      <a key={i.to} href={i.to} className={ROW}>
        <span className="size-[var(--slot-size)] shrink-0 grid place-items-center">
          <i.icon className="size-4" />
        </span>
        <span>{i.label}</span>
      </a>
    ))}
  </nav>
  <footer className="px-2 py-[var(--row-gap-y)] border-t">
    {/* Footer's user row uses the SAME ROW class — without it, the avatar shifts left */}
    <button className={ROW + " w-full"}>
      <span className="size-[var(--slot-size)] shrink-0 grid place-items-center">
        <Avatar />
      </span>
      <span>{user.name}</span>
    </button>
  </footer>
</aside>
```

The shared `ROW` constant guarantees brand/nav/footer have the SAME inner padding chain. Slot widths are equal by `--slot-size`. By construction every slot lands on the same x.

**Verify (do BOTH checks — width parity is not enough):**

```js
// Check 1: all slots are the same width
const slots = [...document.querySelectorAll('aside .grid.place-items-center')];
const widths = slots.map(el => Math.round(el.getBoundingClientRect().width));
new Set(widths).size === 1;  // must be true

// Check 2 — the one that catches the wrapper-padding bug:
// all slots sit at the same LEFT x relative to the sidebar
const aside = document.querySelector('aside');
const left = aside.getBoundingClientRect().left;
const slotLefts = slots.map(el => Math.round(el.getBoundingClientRect().left - left));
new Set(slotLefts).size === 1;  // must ALSO be true
```

If check 2 fails: walk the JSX tree from the sidebar's outer container down to each slot. The chain of `px-*` / `pl-*` / `ml-*` between them must be identical for brand, nav, footer. The most common culprit is a brand button with its own `px-1.5` that nav rows don't have, OR a footer that skips the row-level `px-2` wrapper.

**Failure mode spotter (greppable):**

```bash
# Any `<button className="...px-...">` inside SidebarHeader is suspect.
# Any nav-row className mismatch with the brand button's className is suspect.
grep -nE 'px-[0-9]\\.?5?' src/components/sidebar.tsx | grep -v "var(--"
```

If the brand button's row className differs from the nav-row className in any way other than what's inside the slot, fix it.

---

## 5. Cross-state invariants — anchors that must not jump

**Rule.** Pick stable anchors and confirm their `centerY` is identical across UI state changes (sidebar collapse, drawer toggle, density swap). The most common one: **the first icon below the brand row** must not shift y when the sidebar collapses.

**Why.** The single thing every user's eye locks onto when the sidebar toggles is the first icon below the brand row. If this icon's centerY differs between states, the collapse feels like things shift unpredictably even when the choreography itself is clean. Users register the jump as instability — they can't articulate it, but they read it.

**Verify**, after every sidebar / state change:

```js
// Run in devtools, in state A:
const stateA_y = (() => {
  const anchor = document.querySelector('aside [data-first-anchor]');
  const r = anchor.getBoundingClientRect();
  return r.top + r.height / 2;
})();
// Trigger the state change. Wait for the transition to finish. Re-run.
// The two numbers must match within 1 px (sub-pixel rounding allowed).
```

If they differ, something contributes layout space in ONE state that doesn't exist in the other. Common culprits:

1. `marginTop` on the COLLAPSED-ONLY content stacking with SidebarContent's `paddingTop` — both contribute to the same gap; stacking them shifts the first icon by `--row-gap-y` when toggling.
2. A wrapper that switches between `flex` and `inline-flex` — `inline-flex` adds a baseline gap.
3. Tailwind `space-y-*` on the SidebarContent — `space-y` lies when any sibling has `height: 0`.

Other anchors worth checking: brand slot centerY, group-label first-appearance row centerY, footer slot centerY. All should be identical in both states.

---

## 6. Measurement is the spec

**Rule.** When the design "looks off", don't argue with screenshots; measure. If you can't reproduce the misalignment in numbers, you can't fix it.

**Why.** "Almost right" alignment problems are caused by 2–4 px drifts that are obvious to the eye but invisible in a casual screenshot read. They're caused by a single class — `pt-1` on a wrapper, an extra `<div>` with implicit margin — that's hard to spot in source but trivial to spot in `getBoundingClientRect()` output.

**Template probe** (Puppeteer / Playwright / devtools console — same shape):

```js
const probe = [
  ['sidebar brand center y',  'aside [data-brand]',                  'top+h/2'],
  ['top chrome row center y', 'header [data-top-chrome] > *:first-child', 'top+h/2'],
  ['sidebar first nav top',   'aside nav > :first-child',            'top'],
  ['main first row top',      'main [data-first-row]',               'top'],
  ['sidebar slot width',      'aside [data-slot]:first-of-type',     'width'],
  ['nav slot width',          'aside nav [data-slot]:first-of-type', 'width'],
].map(([label, sel, prop]) => {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  if (!r) return [label, 'MISSING'];
  if (prop === 'top+h/2') return [label, Math.round(r.top + r.height / 2)];
  if (prop === 'top')     return [label, Math.round(r.top)];
  if (prop === 'width')   return [label, Math.round(r.width)];
}).reduce((acc, [k, v]) => (acc[k] = v, acc), {});

console.table(probe);
```

Expected invariants:
- `sidebar brand center y` === `top chrome row center y` (Rule 2)
- `sidebar first nav top` === `main first row top` (Rule 3)
- `sidebar slot width` === `nav slot width` (Rule 4)

If any pair differs by ≥ 2 px, you have a regression. Don't ship. For CI: wrap the probe in a Playwright test that fails on spread ≥ 2 px and prints the offending pair plus the route under test.

---

## 7. The padding-lock principle — one variable, two columns

**Rule.** `--page-pl` MUST equal the sidebar's nav-icon-column outer padding. These two values lock together; changing one without the other breaks cross-pane x-alignment.

**Why.** The sidebar's nav icons sit at `x = sidebar_outer_pl + slot/2`. The main pane's first content column sits at `x = page_pl + (whatever the content is)/2`. For their LEFT EDGES (not their centers — slot widths can differ from content widths) to line up across the seam, the outer paddings on each side must be equal. If sidebar uses 12 px and `--page-pl` uses 16 px, the toolbar's first chip starts 4 px to the right of where the sidebar nav icons start, and the seam reads as broken.

**How.** Define `--page-pl` to match the sidebar's outer padding. Don't pick them independently. Don't pick `--page-pl` "to look right" without checking what the sidebar uses — and don't quietly change one without the other.

**Verify.**

```js
const sidebarPl = parseFloat(
  getComputedStyle(document.querySelector('aside')).paddingLeft
);
const mainContentX =
  document.querySelector('main [data-first-col]').getBoundingClientRect().left -
  document.querySelector('main').getBoundingClientRect().left;
Math.round(sidebarPl) === Math.round(mainContentX);  // must be true
```

If false, either `--page-pl` or sidebar padding moved without the other. Re-lock them.

---

## 8. Wireless first principle — tokens or `calc()`, never raw px

**Rule.** Every visible spacing, height, gap, and surface reads from a token (`var(--row-h)`, `var(--page-pl)`, etc.) or a `calc()` over tokens. Hard-coded pixels in component code (`mt-[44px]`, `py-[7px]`, `top-[57px]`) are bugs — re-pick from a token.

**Why.** When a measurement looks off, the answer is always "what token / formula?" — never "what px?". This is the only thing that lets one designer / agent touch one variable and have the whole shell move together. Hard-coded px scatter the truth across N components; the next change becomes a hunt across every one of them. The wireless approach is also what makes the `html { font-size }` swap, the dark-mode swap, and the reduced-motion override all one-liner safe.

**Exceptions** (the few times raw px are fine):
- Component primitives at sub-row scale (a `h-1.5` indicator dot, a `h-4` checkbox) — these aren't chrome, they're internal to a component.
- Decorative borders / dividers — `border-t` is fine.
- Anything that pre-existed in third-party primitive defaults you intentionally chose not to override.

**Verify (by inspection).** Grep for arbitrary Tailwind values:

```bash
rg '\b(h|w|p|pt|pb|pl|pr|m|mt|mb|ml|mr|top|left|right|bottom|gap)-\[\d' src/
```

Every hit is a candidate bug. Either pick a token that the rest of the system uses, or — if the value really is one-off — promote it to a new token and document why.

---

## How these laws compose

Rule 1 (viewport lock) is the foundation. Rule 8 (wireless) is the discipline that makes all the others possible. Rules 2–4 establish the visible geometry the user reads as "the app is well-built". Rule 5 protects that geometry across UI state. Rules 6–7 are the tools for diagnosing failure.

Violate one and the shell reads as "slightly off" in a way users can't articulate but designers can. Hold all eight and the shell reads as effortless — which is the actual goal.
