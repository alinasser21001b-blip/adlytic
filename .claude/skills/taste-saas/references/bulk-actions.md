# Bulk actions — selection model + action bar

> Read when: adding multi-row operations to a list page (delete / archive / assign / move-to-project / ...). The DataTable host lives in `references/datatable-mechanics.md`; the Modal wrapper used for destructive confirmation lives in `references/overlays-and-keyboard.md`. This file is what happens when N>=1 rows are selected.

The pattern is three layers stacked: a **selection model** that the page owns; an **action bar** that takes over the PageHeader portal while selection is active; a **confirmation step** for destructive verbs only.

## Selection model

- Click on a row's checkbox cell toggles a single row.
- Shift-click extends from the last anchor — the row you most recently toggled — to the clicked row, selecting the range.
- Cmd/Ctrl-click toggles an individual row without disturbing the rest (sparse multi-select).
- A `Select all` checkbox in `<thead>` toggles every row on the current page. When the result set is paginated, surface a second-line link directly under the checkbox: `Select all 247 matching results` — clicking it widens the selection to the whole filtered set, not just the loaded page.
- ESC clears selection — but only when no popover, modal, or menu is open (those own ESC first).
- Selection state lives in `useState<Set<id>>` lifted to the page component, NOT in TanStack Table's internal `rowSelection`. Pages own it because (a) some apps reflect it in the URL for sharable selections, (b) clearing on filter-change is page-level policy, (c) the action-bar count needs to be readable without a `table.getState()` round-trip.

```tsx
const [selected, setSelected] = useState<Set<string>>(new Set());
const toggle = (id: string, e: MouseEvent) => setSelected(prev => {
  const next = new Set(prev);
  if (e.shiftKey && lastAnchor) extendRange(next, lastAnchor, id, rows);
  else if (e.metaKey || e.ctrlKey || next.has(id)) next.has(id) ? next.delete(id) : next.add(id);
  else { next.clear(); next.add(id); }
  return next;
});
```

When the user changes a filter chip, clear selection — the IDs in the Set may no longer be visible, and silently carrying them into a bulk action is worse than starting over.

## Action bar — geometry

The action bar **replaces the toolbar in-place** when N>=1 rows are selected. NOT a stacked second row. NOT a floating bottom pill. NOT a dark-inversion overlay strip. The same `PageHeader` toolbar slot, the same `--row-h` row height, the same `--page-pl/pr` outer padding — the toolbar **becomes** the bulk-action bar for the duration of the selection. Same DOM position, same flex layout, different children.

> **Replace-in-place is universal; chip styling adapts per archetype.** The brand-colored count pill + `h-7` chip recipe below is Archetype A flavored. B/C/D substitute their archetype's chip / button conventions while keeping the replace-in-place principle. See `references/archetype-*.md`.

Why replace, not stack, dim, or float:
- Stacking a second row breaks the y-rhythm contract (sidebar's first nav row no longer aligns with the page-card's first row).
- A dark-inversion overlay strip is heavier than needed — selection is a state change inside the page, not an OS-level interrupt. Reserve the dark treatment for system banners (auth expired, deploy failed).
- A floating bottom pill drifts visually away from the table — the user's eye has to rescan to find it, and on long lists the pill covers data.
- Replacing in-place keeps geometry stable and clearly says "the toolbar's purpose is now this".

Layout (left to right, all `h-7` to share the row template):
- `[× N selected]` — single brand-colored pill combining the clear-icon (×) and the count. Clicking it clears selection. One target, two affordances; doesn't waste two pill widths on `[N selected] [Cancel]`.
- Action chips — `h-7 px-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-surface/40 hover:bg-bg-surface text-xs font-medium`. Same template as filter chips so the visual rhythm is identical.
- Destructive verb (`Delete`) uses `text-danger` + `hover:bg-danger/10`. Always last in the row.

```tsx
toolbar={
  selected.size > 0 ? (
    <BulkActionBar count={selected.size} onClear={clearSelection} />
  ) : (
    <>
      <FilterChip label="Status" … />
      <FilterChip label="Priority" … />
      …
      <SearchInput … />
    </>
  )
}

// BulkActionBar.tsx — the ENTIRE thing
function BulkActionBar({ count, onClear, actions }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <button onClick={onClear} aria-label="Clear selection"
        className="h-7 px-2 inline-flex items-center gap-1.5 rounded-md text-xs font-medium
                   bg-brand text-brand-fg hover:bg-brand-hover transition-colors">
        <X className="size-3.5" />
        <span className="tabular-nums">{count} selected</span>
      </button>
      {actions.map(a => <ActionButton key={a.key} action={a} count={count} />)}
    </div>
  );
}
```
```

Page-padding tokens (`--page-pl` / `--page-pr`) keep the bar's interior on the same x-axis as the table cells underneath — the count number sits directly above the first column.

## The verbs (typical SaaS console)

| Verb | Confirmation | After fire |
|---|---|---|
| Archive | No (toast with undo) | Hide from default filters; row count refetches |
| Delete | YES — type-to-confirm Modal | Toast with undo (soft-delete 30 d) OR refetch list (hard delete) |
| Move to project | No (toast with undo) | Refetch list once the new project filter takes effect |
| Assign to user | No | Optimistic update + refetch |
| Add label | No | Optimistic update |
| Status change | No | Optimistic update |

Each verb's anchored popover holds the picker (assignee list, status list, project list). Confirm by clicking inside the popover; the bar stays visible until the page refetches and the rows acknowledge the change.

## Confirmation pattern (destructive only)

Type-to-confirm Modal. Wrap your dialog primitive per `references/overlays-and-keyboard.md`; the contents:

- Title: `Delete N issues?`
- Body: `This action cannot be undone. Type DELETE to confirm.`
- Input: empty, must match `DELETE` exactly (case-sensitive) before the destructive button enables.
- Buttons: `[Cancel]` `[Delete N issues]`. The destructive button starts disabled + muted; only after the input matches does it flip to `bg-danger text-white`. The color change IS the affordance.

A single-button confirm — even with a red button — is too easy to fire accidentally with Enter. The typed gate forces a deliberate keystroke per character.

```tsx
<Modal open={open} onClose={close} title={`Delete ${count} issues?`} maxWidth="max-w-md"
  footer={<>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <Button disabled={typed !== "DELETE"}
      className={cn("bg-fg-muted", typed === "DELETE" && "bg-danger text-white hover:bg-danger/90")}
      onClick={fire}>Delete {count} issues</Button>
  </>}>
  <p className="text-sm text-fg-muted mb-3">This action cannot be undone. Type <code>DELETE</code> to confirm.</p>
  <input value={typed} onChange={e => setTyped(e.target.value)} className="w-full h-9 px-2 rounded-md border border-border" />
</Modal>
```

## Undo (non-destructive verbs)

For Archive / Move / Status change, fire the mutation immediately and surface a toast with an action button:

- `3 issues archived` · `[Undo]`
- Undo window: 6 s — long enough to react, short enough that the user trusts the operation completed.
- On undo, refetch the list (or revert an optimistic update). Keep selection cleared either way; the user already moved on mentally.

Undo on the toast is the trust contract for non-destructive verbs. Without it, every non-destructive verb starts to feel destructive — users hesitate, then read a confirm modal that wasn't needed.

## Accessibility

- Every row checkbox needs `aria-label="Select issue ENG-138"` — screen readers can't infer from the icon glyph.
- The action bar carries `role="region"` + `aria-label="Bulk actions"`, plus `aria-hidden={count === 0}` while collapsed so the always-mounted bar isn't announced empty.
- Each verb button needs an `aria-label` that includes the count: `Archive 3 issues`, not just `Archive`.
- A separate `role="status"` live region announces `"N issues selected"` on mount of the bar; the bar itself shouldn't be `role="status"` (it changes too often as the count ticks).

## Pulse example

`src/components/BulkActionBar.tsx` exports `<BulkActionBar count onClear actions? />` and portals into the PageHeader slot. Each action is `{ key, label, icon, danger?, renderBody(close): ReactNode }`; `renderBody` returns the Popover body so pages can inject any picker (assignee list, status list, type-to-confirm). The default action set is `Assign` / `Status` / `Delete`. The bar is always mounted (so the slide transition can run in BOTH directions) and uses `bg-fg text-bg` for the dark-inversion treatment. Delete's body shows the destructive button with `bg-danger` — the type-to-confirm gate is the wiring left to the page.

## STOP rules

- Stacking the action bar BELOW the toolbar (a second row appears, the page jumps). Use the same portal slot; the bar replaces the toolbar's content.
- Showing the selection count without a `[Cancel]` exit. Selection feels sticky — a user needs an obvious dismiss that isn't ESC (some keyboards make ESC awkward).
- Destructive verb with one-click execution (no confirmation modal). `[Delete]` → done is the canonical horror story.
- Confirmation modal with a single `[Delete]` button and no typed gate. Enter-to-confirm fires it for free.
- Action bar that disappears on outside click. The bar must require ESC or `[Cancel]` — outside-click dismisses popovers, not selection.
- Bulk action that fires N individual mutations sequentially in a `for` loop. Batch the request: `PATCH /v1/issues` with an `ids: [...]` array. N round-trips will rate-limit you and the user will see N toast pops.
- Selection state in the URL when entity ids are sensitive (PII, internal-only). Use the in-memory `Set` + optional `sessionStorage`. URL sync is fine for opaque ids; never for emails or names.
- Letting a filter-chip change carry selection forward. The IDs may no longer be visible — clear the Set when filters change.
