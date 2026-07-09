# Menus + popovers — four patterns

> Read when: building a row-actions `⋯` menu, a "+" creation menu, a contextual right-click menu, a slash-command menu, or a complex popover for status / priority / assignee / label pickers. **Not for Cmd+K** — that's `references/overlays-and-keyboard.md`. This file is for *contextual*, anchored menus.

## The four patterns

| Pattern | Trigger | Position | Use case |
|---|---|---|---|
| **DropdownMenu** | Click on `⋯` / chevron | Anchored to trigger, `sideOffset=4` | Row actions, page-level "+" menu, header overflow |
| **ContextMenu** | Right-click on row / card | Cursor position | Power-user shortcuts — **always paired with a DropdownMenu** |
| **Popover (filter / picker)** | Click on chip / pill | Anchored to trigger, `collisionPadding=8` | Status / priority / assignee / label pickers, filter chips |
| **SlashCommandMenu** | Typing `/` in an editable field | Caret position (or input anchor) | Inline insertion of an entity, mention, or command |

**Decision rule.** Action with side effect (delete, archive, duplicate) → menu. Pick a value from a closed set → popover. Insert into text → slash menu. Discoverable button → DropdownMenu; non-discoverable power shortcut → ContextMenu.

---

## Pattern 1: DropdownMenu

Use for **discrete actions** on an entity. Trigger is always visible (`⋯` icon button, `+` button, chevron beside a name). Anchored below trigger, `sideOffset={4}`.

- **Trigger sizing**: icon-button `h-7 w-7`, ghost-style. Hover surface, no border at rest.
- **Container**: `min-w-[8rem]` (Radix default), `rounded-md`, `border`, `bg-popover`, `shadow-md`, `p-1`.
- **Open animation**: scale 95→100 + fade in 120ms; respect `prefers-reduced-motion`.
- **Close**: outside click, ESC, item activation, route change.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-bg-surface">
      <MoreHorizontal className="size-3.5" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" sideOffset={4}>
    <DropdownMenuItem onSelect={onEdit}>Edit<DropdownMenuShortcut>E</DropdownMenuShortcut></DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={onDelete} className="text-danger">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Pattern 2: ContextMenu

Right-click on a row, card, or canvas surface. Opens at the cursor position. **Discoverability is the gotcha** — Mac users right-click constantly, Windows users less, mobile users never. **Always pair with a DropdownMenu** that exposes the same actions through a visible trigger; ContextMenu is a power-user accelerator, never the sole entry point.

- Use the same primitive lib's `<ContextMenu>` (Radix, Mantine, Park UI all ship one with identical API to their DropdownMenu).
- Mac `Ctrl+Click` is also right-click — the primitive handles this; do not bind manually.
- Suppress on `<input>` / `<textarea>` / `<a>` — let the browser's native menu win (copy, paste, "open in new tab").

```tsx
<ContextMenu>
  <ContextMenuTrigger asChild>
    <tr>{/* row cells */}</tr>
  </ContextMenuTrigger>
  <ContextMenuContent>{/* same items as the row's DropdownMenu */}</ContextMenuContent>
</ContextMenu>
```

---

## Pattern 3: Popover (filter / picker)

For **choosing values**, not running actions. Status pickers, priority pickers, assignee selectors, filter chips. Internally hosts a `cmdk`-style search + list (the same primitive used inside Cmd+K) so type-to-filter is free.

- **Trigger**: a pill, chip, or flat value display. Active state visually distinct (e.g. `border-brand/40 bg-brand-subtle` — Archetype A flavored; B/C/D use their chip conventions, see `references/archetype-*.md`).
- **Container**: width auto (let content size it), `collisionPadding={8}` so the panel never spills past the card edge in narrow viewports.
- **Multi-select**: checkbox per row, footer "Clear selection" action when ≥1 selected. Popover stays open between toggles.
- **Single-select**: closes on activation; no checkbox needed (focused row is enough indicator).
- **20+ options**: mandatory search input — switch to combobox pattern (see Pulse `FacetedFilter`).

```tsx
<Popover>
  <PopoverTrigger asChild><FilterChipButton label="Status" active={selected.length > 0} /></PopoverTrigger>
  <PopoverContent align="start" sideOffset={4} collisionPadding={8} className="p-0 w-auto">
    <FacetedFilter options={STATUSES} selected={selected} onChange={setSelected} />
  </PopoverContent>
</Popover>
```

Reference: `app/src/components/FilterChip.tsx`.

---

## Pattern 4: SlashCommandMenu

Typing `/` in a textarea / editable field opens a popover at (or near) the caret. Filters live as the user types. Activation inserts text and (optionally) fires a mutation.

- **Detection**: regex `/(^|[\s\n])([\/][\w-]*)$/` on the substring before the caret. Match → open + set query; no match → close.
- **Anchor**: anchor to the textarea, not the caret pixel. Caret-pixel anchoring needs a mirror-div trick; textarea anchor is good enough for full-width composers.
- **Keys**: ↑/↓ navigate, Enter/Tab insert, ESC closes **without** inserting the literal `/`.
- **Filtered list empty**: close the popover (don't show "No results" — the user is mid-typing).
- **Recent ring buffer**: 5 most-recent commands sorted to the top. `localStorage` key per app.

```tsx
const { ref, slashProps, popover } = useSlashCommand({ value, onChange, issue, users, labels });
return <>
  <textarea ref={ref} {...slashProps} />
  {popover}
</>;
```

Reference: `app/src/components/SlashCommandMenu.tsx`.

---

## Shared item types (work across all 4 patterns)

The same item primitives compose into every pattern. Pulse uses Radix names; Mantine / Park UI / Headless UI ship structurally identical types.

| Item type | Shape | Use |
|---|---|---|
| **Default** | label + optional left icon + optional right `<Shortcut>` | Plain action: `Edit`, `Duplicate`, `Open in new tab` |
| **Destructive** | Default + `text-danger` | `Delete`, `Archive`, `Remove member`. Place last, separator above. |
| **Checkbox item** | Indicator slot left (`pl-8`) + label + `checked` state | Multi-select inside a filter popover; toggling doesn't close |
| **Radio item** | Same shape as checkbox, grouped in `<RadioGroup>` | Single-select within a group (e.g. theme picker: Light / Dark / Auto) |
| **Separator** | 1px line, `-mx-1 my-1 h-px bg-muted` | Between unrelated action groups |
| **Group label** | `px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle` | Section header above 2+ related items |
| **Submenu** | Trigger with `ChevronRight` on right + nested `<SubContent>` | Nested choices — **one level only** |

**Item geometry (every pattern).** Row `h-9` for menus and palettes (`h-7` for dense popovers like filter chips). Left padding `px-2`, icon slot `size-3.5`, label `text-sm`, right shortcut `text-xs opacity-60 ml-auto`. Even pure-text rows reserve the icon column — mixed iconed/icon-less rows break the left edge.

---

## Keyboard contract (all four patterns)

| Key | Behavior |
|---|---|
| `↑` / `↓` | Move focus, skipping separators and group labels |
| `→` | Open submenu (if focused row is a submenu trigger) |
| `←` | Close submenu, return focus to its trigger |
| `Enter` | Activate focused item |
| `Esc` | Close menu; SlashCommandMenu must **not** insert a stray `/` |
| `Tab` | Close menu, move focus on to the next focusable element |
| `Type-ahead` | Jump to first item whose label starts with the typed characters |

The primitive libs implement all of this — do not re-implement. Submenus auto-handle `→`/`←`. Type-ahead is built into Radix's `<Menu>` and `cmdk`.

---

## Library specifics

Pick the one that matches your stack and use it for all four patterns (consistency beats best-of-breed).

| Lib | DropdownMenu | ContextMenu | Popover | Slash menu |
|---|---|---|---|---|
| shadcn (Radix) | `ui/dropdown-menu` | `ui/context-menu` | `ui/popover` + `ui/command` | `ui/popover` + custom detect |
| Mantine | `<Menu>` | `<Menu trigger="click-hover">` + `onContextMenu` | `<Popover>` + `<Combobox>` | `<Popover>` + custom detect |
| Park UI / Ark UI | `<Menu>` | `<ContextMenu>` | `<Popover>` + `<Combobox>` | `<Popover>` + custom detect |
| Headless UI | `<Menu>` | none — build on `<Popover>` + `onContextMenu` | `<Popover>` + `<Combobox>` | `<Popover>` + custom detect |

Pulse uses shadcn (Radix) — see `app/src/components/ui/dropdown-menu.tsx` for the item primitives, including `CheckboxItem` (`pl-8` indicator slot), `RadioItem`, `Label`, `Separator`, `Shortcut`, and `SubTrigger`/`SubContent`.

---

## STOP rules

- **Building a custom dropdown** when your primitive lib ships one. Radix / Mantine / Park UI handle focus, ARIA, type-ahead, submenus — re-implementation always misses something.
- **Mixing actions and value-pickers** in the same menu. Actions go in DropdownMenu; values go in Popover. A DropdownMenu with `Status →` opening a nested submenu of statuses is acceptable; a DropdownMenu with `Todo / In Progress / Done` items directly is not.
- **Unrelated items without a separator + group label.** When the menu hits 5+ items, group them.
- **Submenus nested 2+ levels deep.** Flatten with a separator + group label, or move the deep branch into a dedicated modal.
- **ContextMenu without a parallel DropdownMenu.** Right-click is invisible — the same actions must be reachable via a visible `⋯` trigger.
- **Popover with 20+ options and no search input.** Switch to the `cmdk`/`Combobox` pattern with type-to-filter.
- **Filter chip popover without keyboard nav.** ↑/↓/Enter/Esc must work; lean on `cmdk` or `Combobox` so you get it free.
- **SlashCommandMenu that swallows Enter when closed.** Only intercept ↑/↓/Enter/Tab/Esc when `open` is true; otherwise the user can't insert a newline.
- **Hard-coded popover widths** that break in narrow card containers. Use `collisionPadding={8}` so Radix Floating-UI clamps to the viewport.
- **Cmd+K-style global palette in this layer.** Cmd+K is a Dialog at the AppShell level — see `references/overlays-and-keyboard.md`. This file is for *anchored, contextual* menus only.
