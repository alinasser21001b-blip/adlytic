# Empty states — first-run hero, "no results", and the line between them

The first time a user lands on `/projects` and sees an empty list, **the list area is a product surface, not the absence of one.** Most apps blow this moment with a muted "No data here yet" sentence that teaches the user nothing. The first principle here is to replace the usual empty cell with a **hero block** — a small piece of UI that names what's missing, explains why it matters, and hands the user the next action in a single glance. Get that block right and the user starts using the feature before they realize they learned it.

This doc covers the hero block in concrete spec, the difference between **first-run empty** and **filtered-to-zero empty** (they are not the same — collapsing them is the most common empty-state anti-pattern), and a reusable component shape that other pages can drop in.

For the vertical-centering mechanics inside the list area, see the "Body fills vertical space" rule in `references/datatable-mechanics.md` — the `flex-1` parent + `m-auto` empty state + `mt-auto` "N results" footer trio. This file covers what goes *inside* the centered block, not how it floats.

---

# First principle

A first-run empty state is a **product surface**, not the absence of one. The defining move:

1. Replace "No results" with a **hero block** centered in the list area using `m-auto` inside a `flex-1` zone.
2. The hero names *what's missing*, *why it matters*, and *the next action* in one viewport — illustration/monogram + 1-sentence headline + 1-sentence subhead + primary CTA + optional secondary.
3. Detect first-run via `localStorage` flag (e.g. `pulse-onboarded:/projects`) AND empty `data?.items` AND no active filter. **The flag distinguishes "user has never created an X" from "user has filtered to zero Xs"** — the two cases need different copy and a different visual.
4. Toolbar above the empty state **stays visible** (filter chips, search, display). The empty state only replaces the *body*. This is what makes the page feel like a tool the user is learning, not a wall they hit.

The teaching moment is the hero, not the absence. The empty state isn't telling the user nothing's there — it's telling them what to do next, and what to expect when they do it.

---

# When first-run vs when "no results"

These are two different states that share a single visual region. Collapsing them into one `<EmptyState title="No results" />` is the most common empty-state anti-pattern. The table:

| State | Detection | Tone | Affordance |
|---|---|---|---|
| **First-run** (user has never created an entity of this type) | `localStorage[pulse-onboarded:/<route>]` unset AND `data.items.length === 0` AND no active filter | Welcoming, instructive | Hero with illustration/monogram + 1-sentence headline + 1-sentence subhead + primary CTA + optional secondary |
| **No results** (data exists, filters/search zeroed it out) | `data.items.length === 0` AND (any filter is active OR `q !== ""`) | Helpful, neutral | Short title + small "Clear filters" link, no illustration, no big CTA |
| **Error / failed to load** | `error` truthy from the data hook | Apologetic, specific | Title = the actual failure reason (NOT "Something went wrong") + retry button |
| **Loading** | `isLoading && data == null` | Neutral | Skeleton rows matching the real row height + gap (see `references/datatable-mechanics.md` skeleton section) |

**Rule of thumb**: if the user has never created one of these, treat the empty state as an *invitation*. If they have created some and then filtered to zero, treat it as a *small fix*. Never the same component for both.

The `data.items.length === 0` check is necessary but not sufficient. A first-run state on `/issues` when the workspace has 200 issues but the user has filtered to `assignee = me` and the result is empty is **wrong** — that's "no results", not "first run". Always AND the empty check with the no-filter check.

---

# Hero block anatomy

> **Structure is universal; visual treatment adapts per archetype.** The centered hero, the headline+subhead+CTA shape, the "full layout mirror" skeleton rule, and the detection contract below all apply across Archetypes A/B/C/D. Specific tints (`bg-brand-subtle` circle, `bg-bg-surface` skeleton blocks) are Archetype A flavored — substitute your archetype's surface conventions. See `references/archetype-*.md`.

A reusable shape that fits inside a `flex-1` parent and centers itself with `m-auto`:

```
┌──────── flex-1 (vertically centered block) ─────────┐
│                                                      │
│              ┌─────────────────────┐                 │   ← optional illustration
│              │   ▲  P monogram    │                 │     64-96 px circle
│              │      in a circle    │                │     or 1-2 KB inline SVG
│              └─────────────────────┘                 │
│                                                      │
│        No projects yet.                              │   ← headline (text-lg font-medium text-fg)
│        Create your first one and start tracking work.│   ← (1 sentence, conversational)
│                                                      │
│        Projects group related issues together —      │   ← subhead (text-sm text-fg-muted)
│        try one to see how it works.                  │     (1 sentence, what to expect)
│                                                      │
│        [  + New project  ]    Take a tour →          │   ← primary CTA + secondary text
│                                                      │     (secondary uses underline-on-hover)
│                                                      │
│        ◯  ◯  ◯  ◯  + Invite teammates                │   ← optional social preview
│                                                      │     (4 empty avatar bubbles + plus)
└──────────────────────────────────────────────────────┘
```

## Spec (Tailwind, design tokens from `references/wireless-tokens.md`)

```tsx
<div className="m-auto text-center py-16 max-w-sm">     {/* vertical center via m-auto */}
  {/* Optional illustration OR monogram */}
  <div className="mx-auto mb-5 size-16 rounded-full bg-brand-subtle
                  inline-flex items-center justify-center">
    <Icon className="size-6 text-brand" />              {/* or a textual monogram */}
  </div>

  <h2 className="text-lg font-medium text-fg">          {/* headline */}
    No projects yet.
  </h2>
  <p className="mt-1 text-sm text-fg-muted">            {/* subhead */}
    Projects group related issues together — try one to see how it works.
  </p>

  <div className="mt-5 flex items-center justify-center gap-2">
    <Button variant="brand" size="md" onClick={onPrimary}>+ New project</Button>
    <Button variant="ghost" size="md" onClick={onSecondary}>Take a tour</Button>
  </div>

  {/* Optional social preview — avatar bubbles + plus */}
  <div className="mt-6 inline-flex items-center -space-x-1.5">
    {[1, 2, 3].map((i) => (
      <span key={i} className="size-6 rounded-full bg-bg-surface border border-border
                               inline-flex items-center justify-center text-[10px] text-fg-subtle">
        ?
      </span>
    ))}
    <button className="size-6 rounded-full border border-dashed border-border-strong
                       text-fg-subtle hover:text-fg hover:border-fg-subtle">
      <Plus className="size-3 mx-auto" />
    </button>
  </div>
</div>
```

## Each part, the why

- **Vertical centering: `m-auto` inside a `flex-1` parent.** The body row group in DataTable (or any "fill the remaining viewport" container) is `flex-1 flex flex-col`. A `<div className="m-auto">` inside it floats to the geometric center. This is the symmetric partner of the `mt-auto` "N results" footer — same `flex-1` parent does both jobs.

- **`py-16` not `py-32`.** 64 px of vertical padding on a block that already sits at the center is plenty. Going bigger makes the block feel like it's trying too hard to fill the screen — the eye reads it as a marketing page, not a tool surface.

- **Headline = 1 sentence, conversational.** "No projects yet. Create your first one and start tracking work." — addresses the user, names what's missing, names the next move. NOT "0 items in Projects" (state, not invitation) and NOT "You don't have any projects" (passive, no CTA implied). The verb is the action they should take next.

- **Subhead = 1 sentence, sets expectations.** "Projects group related issues together — try one to see how it works." Tells the user *what they'll get* when they do the action. Not a feature list, not a tooltip — a one-sentence preview of the result.

- **Primary CTA: `h-9 px-4 rounded-md bg-brand text-brand-fg`.** Concrete verb ("+ New project"), not "Get started" or "Learn more". The button should name the artifact it creates. If the keyboard shortcut exists, append it: `+ New issue   ⌘ K → New`.

- **Secondary action: text button with underline-on-hover.** "Take a tour", "Import from GitHub", "Read the docs" — the lower-stakes alternative. Same row, ghost variant, `hover:underline`. NOT a link to a marketing site by default; users in a tool want tool-level help, not docs.

- **Optional illustration: 1-2 KB inline SVG OR monogram.** A stylized abstract shape (concentric arcs, a tilted card with a dot inside) sized 64-96 px, centered. NEVER a stock photo (reads as "we didn't have time to make this"), NEVER a colored blob with no meaning (reads as "loading state, not empty state"). The brand-subtle circle around a brand-color monogram is the cheapest credible option — Pulse's `P` in a 64 px circle works for any first-run state that doesn't have a custom illustration.

- **Optional social preview: 3-4 empty avatar bubbles + `+`.** Slack trick — pre-populates the social sense so an empty workspace doesn't feel lonely. Each bubble is `size-6 rounded-full bg-bg-surface` with a `?` inside; the `+` is `border-dashed`. The plus is the only interactive affordance here (it triggers an invite flow). Don't put real team data in this preview — the whole point is that there *is no team yet*.

## Height hold

In a short list (`rows.length > 0` but small), the empty state won't appear because there's data. The "N results" footer uses `mt-auto` to push to the bottom. Both work because they share the same `flex-1` parent. Make sure the body row group keeps `flex-1` (or `flex-1 min-h-0`) so the centering math holds when the body is short:

```tsx
<div className="flex-1 flex flex-col">                  {/* body row group */}
  {rows.length === 0
    ? <EmptyState className="m-auto" />               {/* first-run / no-results */}
    : <>
        {rows.map(...)}
        <div className="mt-auto pt-3 text-center">     {/* N results footer */}
          {rows.length} results
        </div>
      </>}
</div>
```

If the page's `<main>` scroll container collapses to content height (because the body is `flex-1` and content is short), the empty state sits at the geometric center of the body group — which equals the geometric center of the card's body area. Get the body to fill the card's body area first (via `h-full` on the outer scroll container, `flex-1 min-h-0` on the inner), and `m-auto` does the rest.

---

# "No results" (filtered-to-zero) — different message, smaller visual

When `data.items.length === 0` AND the user has filters or search active, this is a different state. The copy and visual size should reflect that:

```tsx
<div className="m-auto text-center py-12">
  <p className="text-sm font-medium text-fg">No issues match these filters.</p>
  <p className="text-sm text-fg-muted mt-1">
    Try clearing a filter or searching by id.
  </p>
  <button
    onClick={clearFilters}
    className="mt-3 text-sm text-brand hover:underline"
  >
    Clear filters
  </button>
</div>
```

Differences from the first-run hero:

- No illustration. No monogram. No 64-px circle. The "no results" state is a small fix, not a learning moment — over-decorating it reads as "the system doesn't know the difference between first-run and filtered".
- One sentence for the reason, one for the fix, one small text button. Three lines total.
- The "Clear filters" button is a text link with brand color, underline-on-hover. It appears ONLY when filters/search are active — it's the user's escape hatch from the dead-end they walked into.

This state goes inside the same `m-auto` slot as the first-run hero. The DataTable's `emptyTitle` / `emptyHint` props handle the simplest case, but for "Clear filters" you need the page to detect active filters and render the button.

---

# Detection — the contract

```ts
const ONBOARDED_KEY = (route: string) => `pulse-onboarded:${route}`;

const isOnboarded = (route: string) => {
  try { return localStorage.getItem(ONBOARDED_KEY(route)) === "1"; }
  catch { return false; }
};
const markOnboarded = (route: string) => {
  try { localStorage.setItem(ONBOARDED_KEY(route), "1"); } catch {}
};
```

Render decision:

```tsx
const hasActiveFilter = status.length > 0 || q !== "";
const isFirstRun = !isOnboarded("/projects") && rows.length === 0 && !hasActiveFilter;

return (
  <DataTable ... emptyState={
    isFirstRun
      ? <FirstRunHero onPrimary={...} onSecondary={...} />
      : <NoResults onClear={clearFilters} hasFilters={hasActiveFilter} />
  } />
);
```

The `markOnboarded` call goes on the primary CTA click — once the user has clicked "+ New project" at least once, the empty state stops appearing on future sessions (even if they later delete all their projects, the page now shows "no results" because they've seen the "first run" message already).

For demo / dev environments where you want to *re-show* the first-run state, a separate `pulse-empty:/<route>` override flag works well: when set, the page temporarily treats `data` as `[]` and the first-run state shows. The override clears on the first CTA click.

---

# Real-product reference

Brief notes on what specific moves each does well — concrete, not aspirational:

- **Notion's empty workspace**: greyscale illustration of a workspace with floating document icons + a single sentence ("Capture your thoughts, your way") + a single CTA. The illustration does real work — it previews what the user will see once they create content. NOT a stock photo.
- **Linear's empty project**: the CTA button shows the keyboard shortcut inline: `+ New issue   ⌘ K → New`. Tiny detail, big win — it teaches the shortcut at the moment the user is most likely to remember it.
- **Slack's empty channel**: 3 placeholder avatar bubbles + "+ Invite teammates" on the bottom right. The bubbles aren't real users — they're `?` initials in muted circles. Pre-populates the social sense so the channel doesn't feel lonely.
- **Stripe's "No products yet" dashboard**: small monogram icon in a 64 px circle + the headline reads "Add your first product" (action verb, not state description) + secondary "Import from CSV" for power users.
- **Vercel empty deployments list**: the empty state is intentionally tiny — Vercel assumes you came from a deploy and have work to do. The lesson: a power-user tool can have a smaller empty state because the audience doesn't need hand-holding. Default to a smaller hero for power tools, larger for new-user onboarding.

---

# Anti-patterns

- **"No data here yet" as the entire empty state** (no CTA, no subhead, no illustration). The user lands, reads the sentence, leaves. There's no next move.
- **Reusing the same `<EmptyState>` for "no data" and "filtered to zero"**. They need different copy AND different visual weight — first-run is a teaching moment, no-results is a small fix.
- **Putting the empty state at the top of the list area instead of vertically centered.** Top-anchored empty states look like the page forgot to render the table. `m-auto` in a `flex-1` parent is the fix.
- **Showing a generic illustration that has nothing to do with the product.** Stock photos of smiling people, abstract blobs with no meaning, oversized brand marks — all read as "designer didn't have time to think about this". A monogram in a brand-subtle circle is the cheapest credible option.
- **CTA that says "Get started" or "Learn more"**. These are abstract verbs. The button should name the artifact: "+ New project", "Create your first issue", "Connect GitHub".
- **Putting the empty state in place of the toolbar too** (no filter chips, no search, no display). The toolbar stays. The empty state replaces the *body* of the list, not the page chrome.
- **A "Skip" or "Maybe later" link as the only secondary action**. If the user is going to skip onboarding, give them a useful alternative ("Import from GitHub", "Take a tour", "Read the docs"), not a dismissal.
- **A modal that opens the moment the user lands on the empty page**. A modal is a forced interruption. The hero block is an invitation. Don't gate the page behind a dialog.

---

# Pulse integration

This file covers what goes inside the centered hero block. The other constraints (vertical-centering mechanics, `flex-1` parent, `mt-auto` "N results" footer, `--page-pl/pr` padding) live in `references/datatable-mechanics.md` — link to those, don't repeat them.

For the toolbar styling (filter chip at rest vs active, the brand pill outline) see `references/datatable-mechanics.md` "Filter chips in the toolbar". The empty state lives BELOW the toolbar, in the body region.

For the button sizing (`h-9 px-4 rounded-md bg-brand`) see `references/wireless-tokens.md` "Height scale" — the hero CTA is one step larger than toolbar chips (`h-7`) because the empty state is a more deliberate action.

For cell-misalignment, header backgrounds, and the cushion issues that can mask the empty state's vertical position, see `references/debug-playbook.md` "header has no background" and "cell misalignment" entries. A sticky thead that loses its background makes the empty state's vertical position look wrong because the eye can't find the body's top edge.

---

# Reference impl: a reusable component

A component that other pages can drop in. Lives at `src/components/EmptyState.tsx`, exports both `FirstRunHero` and `NoResults`:

```tsx
import * as React from "react";
import { Button } from "@/components/ui/primitives";
import { Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function FirstRunHero({
  icon: Icon,
  monogram,                          // optional — overrides icon
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  shortcut,                          // optional — "⌘ K → New" inside the CTA
  avatars,                           // optional — 0..4 placeholders
  onInvite,                          // optional — wired to the `+` bubble
}: {
  icon?: LucideIcon;
  monogram?: string;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  shortcut?: string;
  avatars?: number;
  onInvite?: () => void;
}) {
  return (
    <div className="m-auto text-center py-16 max-w-sm">
      <div className="mx-auto mb-5 size-16 rounded-full bg-brand-subtle
                      inline-flex items-center justify-center">
        {monogram
          ? <span className="font-display text-2xl text-brand">{monogram}</span>
          : Icon && <Icon className="size-6 text-brand" />}
      </div>
      <h2 className="text-lg font-medium text-fg">{title}</h2>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Button variant="brand" size="md" onClick={onPrimary}>
          {primaryLabel}
          {shortcut && <span className="ml-1 text-xs opacity-70">{shortcut}</span>}
        </Button>
        {secondaryLabel && (
          <Button variant="ghost" size="md" onClick={onSecondary}
                  className="hover:underline">
            {secondaryLabel}
          </Button>
        )}
      </div>
      {!!avatars && avatars > 0 && (
        <div className="mt-6 inline-flex items-center -space-x-1.5">
          {Array.from({ length: avatars }).map((_, i) => (
            <span key={i}
              className="size-6 rounded-full bg-bg-surface border border-border
                         inline-flex items-center justify-center text-[10px] text-fg-subtle">
              ?
            </span>
          ))}
          {onInvite && (
            <button onClick={onInvite}
              className="size-6 rounded-full border border-dashed border-border-strong
                         text-fg-subtle hover:text-fg hover:border-fg-subtle
                         inline-flex items-center justify-center">
              <Plus className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NoResults({
  message = "No results match these filters.",
  hint = "Try clearing a filter or searching differently.",
  onClear,
  clearLabel = "Clear filters",
  hasFilters,
}: {
  message?: string;
  hint?: string;
  onClear?: () => void;
  clearLabel?: string;
  hasFilters: boolean;
}) {
  return (
    <div className="m-auto text-center py-12">
      <p className="text-sm font-medium text-fg">{message}</p>
      <p className="text-sm text-fg-muted mt-1">{hint}</p>
      {hasFilters && onClear && (
        <button onClick={onClear}
          className="mt-3 text-sm text-brand hover:underline">
          {clearLabel}
        </button>
      )}
    </div>
  );
}
```

The two components share the `m-auto` slot — same parent, same centering math, different visual weight. Other pages import what they need:

```tsx
import { FirstRunHero, NoResults } from "@/components/EmptyState";
```
