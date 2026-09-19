# Settings / Preferences pages

> **Structural moves universal; tint values Archetype A flavored.** The two-level nav, sectioned cards, per-section Save/Discard, theme-as-only-autosave, and `role="switch"` toggle pattern are universal across Archetypes A/B/C/D. The exact card tints (`bg-bg-surface/60`) and chrome elevations below are Archetype A flavored — substitute your archetype's surface conventions; see `references/archetype-*.md`.

The third page archetype. Same shell + PageHeader + tokens as everything else; what changes is the **two-level nav** and the **section/card form**. Settings is NOT a long form with labels down the left and inputs down the right — that's the 2010-era GitHub pattern. Modern Settings = sub-nav on the left, **sectioned content cards** on the right, each section = one concern, one Save/Discard footer.

The rules below are the structural moves. Density, motion, and primitive-library choices come from `references/wireless-tokens.md` and `references/wireless-tokens.md` — not duplicated here.

---

## The defining structural move

```
┌── PageHeader portal slot ───────────────────────────────────────────┐
│ Settings                                                            │  ← title only, no toolbar
└─────────────────────────────────────────────────────────────────────┘
┌── <main> scroll container ───────────────────────────────────────────┐
│                                                                    │
│  Personal      │  PROFILE                                          │
│  • Profile  ◀  │  ┌────────────────────────────────────────────┐  │
│  • Display     │  │  Name                                        │  │
│  • Shortcuts   │  │  [ Ada Lovelace                       ]      │  │
│  • ...         │  │  Help text                                 │  │
│                │  │                                              │  │
│  Workspace     │  │  Email                                       │  │
│  • General  ◀  │  │  [ ada@example.com                     ]      │  │
│  • Members     │  └────────────────────────────────────────────┘  │
│  • Billing     │                                                    │
│  • ...         │  DISPLAY                                           │
│                │  ┌────────────────────────────────────────────┐  │
│  ── danger ──  │  │  Theme        [   ●  Light  Dark  Auto   ]  │  │
│  • Delete      │  │                                              │  │
│                │  │  Reduce motion                          [○●] │  │
│                │  └────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Two levels of nav, both on the same left rail. Top level = **scope** (Personal vs Workspace vs …). Second level = **section** within that scope. Each scope groups related sections; the active section's content fills the right pane. This is the Linear / Vercel / Stripe / GitHub pattern. Anything that drops the scope level (just a flat list of 30 sections) becomes un-navigable the moment the product has two settings per user.

A route URL is **mandatory per section** — `?tab=profile` or `/settings/profile`. Cmd+K navigation, deep linking, browser back, and bookmarking all depend on it. Hidden tab state in component memory is the AI-agent tell of "I didn't finish the archetype".

---

## Anatomy — sub-nav (left rail)

Fixed width **220 px** (do not let the rail flex — settings have predictable character counts, and a flexing rail causes text labels to wrap mid-word on different scopes). One column, vertical stack, no icons required (text-only is calmer; icons just decorate).

Each item is one button:

```tsx
<button
  className={cn(
    "h-7 w-full px-2 rounded-md text-left text-sm transition-colors",
    "hover:bg-bg-surface",
    active && "bg-bg-surface text-fg font-medium",
    !active && "text-fg-muted",
  )}
  aria-current={active ? "page" : undefined}
>
  {label}
</button>
```

The active item is **text-only** — no chevron, no leading bar, no colored text. The `bg-bg-surface` background + `font-medium` weight is the entire signal. Same `aria-current` semantics as a tab list (this IS a tab list — `role="tablist"` vertical). The `rounded-md` shape matches every other interactive element in the app; do NOT use `rounded-full` chips for nav items (chips are for filter state, not navigation).

**Scope dividers** (`Personal` / `Workspace`) render as **quiet group labels**, not section headers:

```tsx
<div className="px-1 pt-4 pb-1.5 text-xs font-medium uppercase tracking-wider text-fg-subtle">
  Personal
</div>
{/* nav items */}
<div className="px-1 pt-4 pb-1.5 text-xs font-medium uppercase tracking-wider text-fg-subtle">
  Workspace
</div>
{/* nav items */}
```

The "Danger zone" scope sits last with a `text-danger` label. The "Delete account" item inside is the only nav row in red.

**URL contract**: `?tab=display` (or `/settings/personal/display` if your router is path-based). Default = first item in the **first** scope. Unknown tab → first tab of the **Personal** scope (NOT 404 — the page itself is real, just the section is unknown).

---

## Anatomy — section card (right pane)

Right pane is one vertical stack of **section cards**. One section = one card. **Never** scatter 5 inputs across the page in a long form — the section is the load-bearing unit.

```
SECTION HEADER     (text-sm font-medium text-fg mb-2)
┌── section card ─────────────────────────────────────────────┐
│  Field 1     (label + control)                              │
│  Field 2     (label + control + help text)                  │
│  Field 3     (label + control)                              │
└──────────────────────────────────────────────────────────────┘
SECTION FOOTER     (optional: Save / Discard, only when dirty)
```

### Section card

```tsx
<section className="bg-bg-surface/60 rounded-lg p-4">
  <Field … />
  <Field … />
</section>
```

`bg-bg-surface/60` (NOT `border border-border` — same wireless principle as detail pages; see `references/wireless-tokens.md`). The 60% opacity makes the card feel like a sunken tile inside the page surface, not a separate card floating on the page. If the page is already on `bg-bg`, the section card sits **one step down** on the elevation ladder.

Padding: `p-4` is the standard. `p-6` if the section is sparse and you want to give it presence (max 2–3 fields). `p-3` is too cramped for forms.

### Section header

Two acceptable styles, depending on whether the page has a global title (PageHeader) or not:

- **Inside the card** (recommended when the section header is short): `text-sm font-medium text-fg mb-2`. The header sits inside the card, not above it.
- **Above the card** (use when the header is long enough to wrap): `text-xs font-medium uppercase tracking-wider text-fg-subtle px-1 mb-1.5` — same shape as the sub-nav group label, so the two "label" levels share a visual style.

Don't mix the two styles on the same page.

### Section footer — Save / Discard

A section gets a footer ONLY when its fields are dirty (user has changed something since last save). The footer is one row inside the card at the bottom:

```tsx
<div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-end gap-2">
  <Button variant="ghost" size="sm" onClick={onDiscard}>Discard</Button>
  <Button variant="brand"  size="sm" onClick={onSave}>Save changes</Button>
</div>
```

- `border-t border-border/40` on the footer is the ONE legitimate use of a divider in a Settings page — it separates form fields from action buttons inside a single card. The space between sections uses whitespace, not a border. (See `references/debug-playbook.md` for the "no `border-b` between sections" pattern.)
- "Discard" is a **ghost** button (no border). "Save changes" is **brand**.
- "Save changes" is disabled until at least one field is dirty. Track dirty state per-section, NOT per-field — one section is one save unit.
- After save, success is acknowledged by the **footer disappearing** (the field reverts to non-dirty). Do NOT show a "Saved!" toast for every save — it's noise.
- "Save changes" sits right-aligned, not left-aligned. Reads as a confirm action.

### Auto-save: the ONE exception

Theme (Display → Theme) is the **only** field that auto-saves. Toggling the theme switch flips the value immediately and applies the theme. No Save button, no dirty state. This matches Linear. The reason: theme change is instant, reversible, and obvious — there's no "I changed it by accident" risk because the user is staring at the result. Every other field uses explicit Save.

---

## Form row primitives

These are the load-bearing primitives that AI agents keep reinventing wrong. Build them ONCE in `components/ui/primitives.tsx`, then every Settings page composes them.

### TextField

```tsx
<div className="space-y-1.5">
  <label htmlFor={id} className="text-sm font-medium text-fg block">
    {label}
  </label>
  <input
    id={id}
    className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm
               placeholder:text-fg-subtle
               focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20
               disabled:opacity-50 disabled:cursor-not-allowed"
    {...props}
  />
  {help && <p className="text-xs text-fg-subtle">{help}</p>}
</div>
```

- `h-9` (36 px) is the standard input height in the design system — matches the height of `Button size="md"` so they align when stacked.
- `bg-bg` (NOT `bg-bg-surface`) so the input sits **on top of** the section card visually. Using `bg-bg-surface` makes the input the same tint as the card and it disappears.
- Focus state: `border-brand + ring-2 ring-brand/20`. NOT the global `*:focus-visible` 1 px outline — inputs handle their own focus.
- Label sits ABOVE the input (top-aligned), NOT next to it (left-aligned). Top-aligned labels scale better when labels wrap to two lines and keep the input column at one width.
- Help text (`text-xs text-fg-subtle`) goes BELOW the input, in `text-fg-subtle` (NOT `text-fg-muted` — help is reference, not primary content).
- `text-fg-subtle` placeholders are quiet; the real label above carries the meaning.

### Toggle (the role="switch" pattern)

This is the most-reinvented primitive in the codebase. Use a button with `role="switch"`, NOT a checkbox styled to look like a toggle.

```tsx
<button
  role="switch"
  aria-checked={on}
  onClick={() => onChange(!on)}
  className={cn(
    "relative w-9 h-5 rounded-full transition-colors duration-[var(--dur-base)] ease-[var(--ease-soft)]",
    on  ? "bg-brand" : "bg-bg-surface border border-border",
  )}
>
  <span
    aria-hidden
    className={cn(
      "absolute top-0.5 size-4 rounded-full bg-bg shadow-sm",
      "transition-[left] duration-[var(--dur-base)] ease-[var(--ease-soft)]",
      on ? "left-[18px]" : "left-0.5",
    )}
  />
</button>
```

Critical details:
- `role="switch" aria-checked` — assistive tech announces "on" / "off" correctly. A `<input type="checkbox">` styled to look like a toggle is announced as "checked, 1 of 1" which is the wrong mental model.
- The knob animates `left` (NOT `transform: translateX`). Some libraries reach for `translate-x-full`; with `left` the math is direct: knob width 16 px, container 36 px, `left-0.5` (2 px) and `left-[18px]` (20 px) account for the 16 px of knob travel + 2 px breathing room on each side.
- `transition-[left]` instead of `transition-all` — we ONLY want `left` to animate, not `bg-color` (which is on the parent and animates separately via `transition-colors`).
- Off state: `bg-bg-surface border border-border` (NOT transparent, NOT just `bg-bg-sidebar`). A transparent track makes the toggle look unfinished against the section card.
- On state: `bg-brand` (full opacity). NOT `bg-brand/50` — half-opacity brand reads as "disabled".
- No text label inside the knob. Toggles in a row context get their label from the **sibling** label/heading, not from inside the toggle.

### Select

Same shell as `TextField` but with a chevron on the right. Options render in a Popover, not a native `<select>`, because native selects carry their own OS chrome (arrow icons, hover states, focus rings) that fight the design system.

```tsx
<button
  className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-left
             flex items-center justify-between
             hover:border-border-strong
             focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
>
  <span className="truncate">{value || <span className="text-fg-subtle">Select…</span>}</span>
  <ChevronDown className="size-3.5 text-fg-subtle shrink-0" />
</button>
{/* Popover with a vertical list of options, not a menu — same shape as
   filter chip popover. Selected option: `bg-bg-surface text-fg font-medium`. */}
```

### Radio group

Vertical stack of rows. Each row is a real `<input type="radio">` with a `<label>`, NOT a styled div. The visible "radio" comes from `accent-color: var(--brand)` (one line of CSS, picks up the design system color).

```tsx
<label className="flex items-start gap-2.5 p-2 rounded-md cursor-pointer hover:bg-bg-surface">
  <input type="radio" name={name} value={v} className="mt-0.5 accent-brand" />
  <div className="min-w-0">
    <div className="text-sm text-fg">{label}</div>
    {description && <div className="text-xs text-fg-subtle mt-0.5">{description}</div>}
  </div>
</label>
```

`accent-brand` (Tailwind v4 arbitrary value) sets `accent-color: var(--color-brand)` on the radio. That's the entire "style a radio" recipe. Don't build a custom radio indicator out of divs.

### Token row (API keys, copy-on-click)

Monospace + copy button. Token is shown once after generation (re-copy-able from a list, not re-readable after dismiss).

```tsx
<div className="flex items-center gap-2">
  <code className="flex-1 h-9 px-3 inline-flex items-center rounded-md
                   bg-bg border border-border font-mono text-xs text-fg-muted truncate">
    {token}
  </code>
  <Button variant="outline" size="md" onClick={onCopy}>
    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    {copied ? "Copied" : "Copy"}
  </Button>
</div>
```

Copy state: button shows `Check` icon + "Copied" text for 2 s, then reverts. NOT a toast — toasts on copy are noise. State lives in the row, not in a notification.

### Field row wrapper (label + control layout)

Two layouts: stacked (label above control) and inline (label left, control right). Stacked is the default; inline is for short controls (Toggle, short Select) where horizontal real estate helps.

```tsx
// Stacked
<div className="space-y-1.5">
  <label className="text-sm font-medium text-fg">…</label>
  <Control />
</div>

// Inline (label left, control right, vertical center)
<div className="flex items-center justify-between gap-4 py-2">
  <div className="min-w-0">
    <div className="text-sm font-medium text-fg">{label}</div>
    {description && <div className="text-xs text-fg-subtle mt-0.5">{description}</div>}
  </div>
  <div className="shrink-0"><Control /></div>
</div>
```

---

## Section dividers — the rule

**Never use `border-b` between sections.** The visual break comes from:

1. The section header (label inside or above the card)
2. The `bg-bg-surface/60` card surface (sunk from the page)
3. Vertical whitespace (`mb-6` between sections, or `space-y-6` on the parent stack)

Putting `border-b border-border` between every section is the 2014 pattern. It makes the page look like a printed form, not a Settings page. The skill's `references/debug-playbook.md` covers the same rule for the rest of the app — Settings is the worst offender because the temptation is highest here.

The ONE exception: `border-t border-border/40` inside a section card to separate the form fields from the Save/Discard footer. That divider sits between two sub-regions of ONE card, not between two cards.

---

## Privacy / destructive — Danger zone

Destructive actions (delete workspace, delete account, revoke all sessions, transfer ownership) live in their own scope at the **bottom** of the sub-nav, labeled `Danger zone` in `text-danger`. The section's header is the only red text on the page; the button is `variant="ghost"` (no border) at rest, and on hover switches to `bg-danger-subtle text-danger` — the button gets DANGEROUS, not the page.

The action button does NOT trigger the destructive action on click. It opens a **Dialog** (not a confirm popover — see `references/overlays-and-keyboard.md`) that requires the user to type the workspace name OR their password, then confirms. Two-step confirmation is non-negotiable for `Delete workspace` and `Delete account`.

```tsx
<button
  className="h-8 px-3 rounded-md text-sm font-medium text-danger
             hover:bg-danger-subtle transition-colors"
>
  Delete account
</button>
```

---

## Real-product references

- **Linear Settings** — sub-nav with scope groups, sections that are clearly one concern each, explicit Save per section (NOT auto-save), theme auto-save is the lone exception. The "Danger zone" is its own scope, last in the rail.
- **GitHub Settings** — same scope/section pattern. GitHub adds breadcrumbs for sub-settings (`/settings/profile` → "Profile" with a back chevron). Don't over-engineer; the sub-nav handles most of it.
- **Stripe Dashboard Settings** — shows what NOT to do in one spot: they auto-save almost everything, including billing email. Don't copy this. The Save/Discard pattern is the right call because accidental edits on a billing field are scary; explicit Save forces the user to confirm.

---

## Anti-patterns

- **One long form, no sub-nav.** Five inputs across the page in a single form with section headers as bold text. Doesn't scale past ~5 inputs; impossible to navigate once a product has 30 settings; can't be deep-linked.
- **Auto-saving everything.** Annoying for fields the user changes accidentally (esp. workspace name, billing email). Theme is the only auto-save; everything else is explicit Save.
- **`border-b` between sections.** The 2014 form pattern. The section card surface + header text + whitespace is the modern break. See `references/debug-playbook.md`.
- **Destructive actions not separated.** "Delete account" sitting at the bottom of a "General" section next to "Workspace name". User muscle-mouses and clicks it. Put it in its own scope, label it `Danger zone` in red, two-step confirm.
- **Hidden tab state.** `useState("profile")` instead of `?tab=profile` in the URL. Breaks Cmd+K, breaks deep linking, breaks browser back.
- **Sub-nav without a route.** Even if the rail uses internal state, expose a `?tab=` param. State + URL sync is one `useSearchParams` line; the agent that skips it is the same one that built the long form.
- **Toggles built on `<input type="checkbox">`.** Wrong ARIA role ("checked" instead of "on"/"off"). Use `role="switch"`.
- **Section headers as `text-2xl`.** Section headers are H2-level, but `text-sm font-medium` reads as label, not heading. Big section headers make the page feel like a marketing landing.
- **"Saved!" toast on every save.** Noise. The footer disappearing is the confirmation.
- **Inline save buttons next to every field.** Save is per-section, not per-field. Inline save next to a Toggle makes sense (and IS the auto-save case for theme), but for TextField it's noise.

---

## STOP rules

- A Settings page with no left sub-nav. The archetype is two-level nav (scope + section). Drop one level and it stops being a Settings page — it becomes a profile form.
- More than ONE auto-saved field. Theme only. Everything else explicit.
- `border-b` between sections. Use whitespace + card surface.
- A Toggle that uses a checkbox. Use `role="switch"`.
- A destructive action without a two-step confirm Dialog.
- A "Saved!" toast on every save. Footer disappearing is the confirmation.
