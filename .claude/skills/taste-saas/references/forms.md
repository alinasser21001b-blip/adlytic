# Forms — three shapes, three contracts

> Read when: building any data-entry surface. Inline value edit on a detail page, a "new comment" / "new sub-issue" / "new saved view" affordance, a Settings section, a create-entity modal.

Forms in a Linear/Vercel-style console are NOT one pattern with three sizes. They are three different patterns that share a validation + submit contract. Picking the wrong shape is the most common form mistake in this archetype — a modal where inline edit belongs, an inline form where the entity needs ≥ 5 fields.

## The three shapes

| Shape | When | Example in Pulse |
|---|---|---|
| 1. Inline edit | Editing ONE existing field on an already-rendered entity. | `RailField` cells in the issue detail right rail; the `MiniSelect` popovers inside `TriagePanel`. |
| 2. Single-field-add | Adding one item to a list that's already on screen (comment, sub-issue, saved view, label). | Comment composer at the bottom of the activity feed; "Save current filters as new view" input in `SavedViews`. |
| 3. Create / wizard / Settings section | Creating a NEW entity with ≥ 3 fields, or editing a coherent group of settings. | Settings section cards; `ManageViewsModal`; any "New project" / "Invite member" dialog. |

The shape tells you the surface (in-place / inline-in-flow / modal-or-section), the submit model (autosave / explicit button), and the validation surface (none / inline-below / inline-below-with-summary).

---

## Shape 1: Inline edit

**When**: a single field on a rendered entity. Status pill, priority icon, name in a row, assignee avatar, due date, label set. NEVER a modal for this — see `references/detail-pages.md`'s *Inline edit — every field, no edit modal* for the rest-edit-pending visual states.

**Visual contract**:
- Trigger = the value itself. No pencil button taking up its own slot — pencil appears on row hover, optionally.
- Edit state REPLACES the value in-place. Same height, same horizontal slot. No layout shift.
- For one-of-N values (status, priority, assignee, project): the edit primitive is a `Popover` containing a vertical list of options — the same recipe as a filter chip popover, so the visual feels native to the page. See the `MiniSelect` shape in `components/TriagePanel.tsx`.
- For freeform text (title, name): the edit primitive is a bare `<input>` styled to look like the read state, NOT a TextField with label + border (would feel like a form landed on the row).

**Submit contract**: **autosave**, no Save button.
- Single-choice popover: commit on selection, close popover.
- Text input: commit on `blur` OR `Enter`. `Esc` cancels and restores the original value.
- Pending state during the mutation: brief opacity dim + spinner inside the field. Revert visually on error, then surface the error as a toast (this IS system-level — the user already moved on).

```tsx
// Read state → Popover trigger → Popover with options. Save on click.
<Popover>
  <PopoverTrigger asChild>
    <button className="inline-flex items-center gap-1 h-7 px-2 rounded-md hover:bg-bg-surface">
      <StatusPill status={value} variant="naked" />
      <ChevronDown className="size-3 text-fg-subtle" />
    </button>
  </PopoverTrigger>
  <PopoverContent className="w-48 p-1">
    {STATUSES.map((s) => (
      <button key={s} onClick={() => save.mutate({ status: s })}
        className="w-full h-7 px-2 inline-flex items-center gap-2 rounded-md hover:bg-bg-surface">
        <StatusPill status={s} variant="naked" />
        {s === value && <Check className="size-3 ml-auto" />}
      </button>
    ))}
  </PopoverContent>
</Popover>
```

**NEVERs**:
- A modal to edit one field. Two extra clicks, breaks flow.
- A separate "Edit" button next to the value. The value IS the trigger.
- A Save button inside the popover for a single-choice field. Selection IS the commit.
- `transition-all` on the trigger — only `transition-colors`. Width animation makes the row jitter.

---

## Shape 2: Single-field-add

**When**: adding one item to a list that's already on screen. The composer lives **inline** at the bottom (or top) of the list section, never a modal — modal for this is the AI-agent tell. Pulse examples: comment composer at the bottom of the activity feed, "Save current filters as new view" input in the `SavedViews` popover, "Add sub-issue" input under the sub-issues list.

**Visual contract**:
- The composer sits in the page flow as a flush row — same horizontal padding as the items it produces. Comment composer = sibling of the last `TimelineItem`, not docked outside it.
- Tinted surface (`bg-bg-surface/60 focus-within:bg-bg-surface`) so it reads as a single entity-row, not a form. `focus-within` swap is the entire focus affordance.
- One primary input (textarea OR text input). For textarea: `rows={3}`, `resize-none`, auto-grow optional.
- Action row sits inside the same tinted block at the bottom: optional secondary icons (mention, attach) on the left, **one** primary button on the right. NO Cancel button — backspacing the input is cancel.

**Submit contract**:
- `Enter` submits if the input is single-line; `Cmd+Enter` submits if it's a textarea. (`Enter` alone in a textarea inserts a newline — never bind submit to it there.)
- Primary button is `disabled` when the input is empty / invalid. Disabled state owns the user feedback — no validation message until they actually try.
- Optimistic insert into the list. On success: clear the input, keep focus there for the next item. On error: re-fill the input with the typed value, show a toast.

```tsx
<form
  onSubmit={(e) => { e.preventDefault(); postComment.mutate({ body }); setBody(""); }}
  className="rounded-lg bg-bg-surface/60 p-3 focus-within:bg-bg-surface"
>
  <textarea
    value={body}
    onChange={(e) => setBody(e.target.value)}
    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) e.currentTarget.form?.requestSubmit(); }}
    rows={3} placeholder="Leave a comment…"
    className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-fg-subtle"
  />
  <div className="flex items-center gap-1 mt-1">
    <IconBtn icon={AtSign} /> <IconBtn icon={Paperclip} />
    <div className="flex-1" />
    <Button type="submit" variant="brand" size="sm" disabled={!body.trim() || postComment.isPending}>
      Comment
    </Button>
  </div>
</form>
```

For per-item rules like duplicate-name detection (e.g. the SavedViews save form), surface the warning inline at `text-[11px] text-warning` under the input — see *Validation* below.

**NEVERs**:
- A modal for adding one comment / one sub-issue. Inline.
- Cancel button next to Submit. Backspace cancels.
- A Save button bound to `Enter` inside a multi-line textarea. Newline wins; bind to `Cmd+Enter`.
- A toast that says "Comment posted!" — the comment appearing in the feed IS the confirmation.

---

## Shape 3: Create / wizard (modal or multi-section)

**When**: creating a NEW entity with ≥ 3 fields (New project, Invite members, New API key), OR editing a coherent group of settings.

Two sub-shapes:

**Modal create** — for new-entity flows. Dialog from `references/overlays-and-keyboard.md`. Body uses the stacked `Field` row primitives from `references/settings-pages.md`. Fields are vertically stacked at `gap-3`, primary action at the bottom right of the dialog footer.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <form onSubmit={handleSubmit(onCreate)} className="px-5 pt-4 pb-3 space-y-3">
      <DialogTitle>New project</DialogTitle>
      <TextField label="Name" {...register("name")} error={errors.name?.message} />
      <Select label="Team"  {...register("teamId")} options={teams} />
      <TextField label="Description" {...register("description")} help="Optional." />
      <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
        <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
        <Button type="submit" variant="brand" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : "Create project"}
        </Button>
      </div>
    </form>
  </DialogContent>
</Dialog>
```

**Multi-section (Settings)** — for editing a coherent group of settings. Each section is one card with its own dirty state and Save/Discard footer. Full recipe in `references/settings-pages.md` (do not duplicate here): scope sub-nav, `bg-bg-surface/60` cards, per-section dirty state, theme is the only autosave.

**Wizard** (multi-step modal) — same Dialog shell, but `[Back]` / `[Next]` instead of `[Cancel]` / `[Create]`. A step indicator (`Step 2 of 4`) sits in the dialog title row, not body. Each step is its own short form — the wizard is "N modal-creates in a row", not "one giant scrolling form". Only build a wizard when steps depend on previous answers (e.g. invite type → role → permissions); for independent fields, ONE modal with grouped sections is better.

**NEVERs**:
- A modal taller than 80vh. Use a wizard or a route.
- A wizard for independent fields. One modal, grouped.
- `[Cancel]` as a primary-styled button. Cancel is always `variant="ghost"`.
- A modal `[Save]` button that is enabled while `isSubmitting`. Disabled + spinner.
- Settings sections rendered as one giant form with one bottom Save bar. One section = one dirty unit; see `references/settings-pages.md`.

---

## Validation — one contract for all three

- **Schema co-located with the form component.** zod + react-hook-form for ≥ 3 fields; plain controlled state + a `canSubmit` boolean for ≤ 2 fields (see `SavedViews`'s `canSave = trimmed.length > 0 && !duplicate`).
- **Errors render inline, below the field**, at `text-xs text-warning mt-1`. The field's border shifts to `border-warning` while invalid. NEVER use a toast for field-level errors — the user is looking at the field, not the corner of the screen.
- **Server errors that pin to a field** (e.g. "Email already taken") render in the same spot, via `setError("email", { message })`. Server errors with no field (network, 500) → toast.
- **Submit guard**: the primary button is `disabled` while the form is invalid AND while `isSubmitting`. While submitting, button content is a spinner — never both spinner-and-label, never just label (looks unresponsive).
- **Duplicate name / "already exists" feels like a warning, not an error** — render in `text-warning`, not `text-danger`. Red is for destructive confirms (`Danger zone` in `references/settings-pages.md`), not for "pick a different name".
- **Don't validate on every keystroke.** `mode: "onBlur"` for react-hook-form, or check on submit + clear on next change. Live-validating an email as the user types it is hostile — the field is invalid for 95% of typing time.

## Form controls — closed primitive set, never native dropdowns

Every form in this skill uses **the same six primitives**, used the same way. Skipping into native HTML or building one-off variants breaks the visual coherence and creates surface area for bugs.

| Need | Primitive | Why not native |
|---|---|---|
| Single-line text | `<input type="text">` with project's text-input class | Native is fine here — there's nothing to style beyond `border` + `outline` |
| Multi-line text | `<textarea>` | Same — native works |
| Pick one from a small enum (status, priority, project, role) | **Popover + PickerItem** (see "Picker chip" below) | Native `<select>` cannot show icons / colored pills / avatars / multi-column layout; styling is OS-locked; you can't open it programmatically; it doesn't match the FilterChip / inline-edit popover used elsewhere in the app |
| Pick from a long searchable list (assignee, label) | **Combobox** (cmdk pattern) | Native `<select>` becomes unusable past ~10 options; no search |
| Boolean | `<Checkbox>` or `<Switch>` | Switch for settings (instant effect), Checkbox for forms (only commits on submit) |
| Date / time | DatePicker popover (build on Radix Popover + react-day-picker) | Native pickers vary wildly per OS; can't theme |

**`<select>` is BANNED in this skill.** Three reasons:
1. Visual mismatch — the rest of the app uses Popover-driven pickers; a single native dropdown breaks the page's rhythm.
2. Can't show colored status pills, priority arrows with color, avatar+name, project icons — but those ARE the values the user is choosing among in a SaaS console.
3. Doesn't share the keyboard contract with the other pickers (arrow keys, type-ahead, ESC close).

### Picker chip — the canonical pattern

> **Mechanic universal; visual treatment per archetype.** The mechanic (chip-button trigger opens a Popover of options that shares the row template with DropdownMenu items) is universal across Archetypes A/B/C/D. The exact visual recipe below (`h-7 px-2 rounded-md border border-border bg-bg-surface/40`) is Archetype A flavored — B/C/D substitute their chip conventions. See `references/archetype-*.md`.

A "picker chip" is a `h-7 px-2 rounded-md border border-border bg-bg-surface/40` button showing `[icon] [current value] [▾]`. Click opens a Popover containing `PickerItem` rows (same row template as DropdownMenu items). Used by:

- FilterChip in list-page toolbars (`references/datatable-mechanics.md`).
- Inline-edit on table cells / detail rail rows (Shape 1 above).
- Property pickers inside create modals (Shape 3 — the Status / Priority / Project chips at the bottom of `NewIssueModal`).

Because all three reuse the same template, a user who learns "click a chip to change its value" learns the entire system at once.

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button className="h-7 px-2 inline-flex items-center gap-1.5 rounded-md
                       border border-border bg-bg-surface/40 hover:bg-bg-surface
                       text-xs transition-colors">
      <Icon className="size-3.5 text-fg-muted" />
      <span>{currentValueLabel}</span>
      <ChevronDown className="size-3 text-fg-subtle" />
    </button>
  </PopoverTrigger>
  <PopoverContent align="start" sideOffset={4} className="p-1 w-48">
    {options.map(o => (
      <PickerItem key={o.value} active={o.value === current}
                  onSelect={() => set(o.value)}>
        {o.label}
      </PickerItem>
    ))}
  </PopoverContent>
</Popover>
```

```tsx
const schema = z.object({ name: z.string().min(1, "Required").max(64) });
const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
  resolver: zodResolver(schema), mode: "onBlur",
});

<input {...register("name")} className={cn("...", errors.name && "border-warning")} />
{errors.name && <p className="text-xs text-warning mt-1">{errors.name.message}</p>}
```

---

## Submit — autosave vs explicit

The submit model is chosen by the shape, not by the field:

| Shape | Submit |
|---|---|
| Inline edit | **Autosave** on selection (popover) / blur (text) / Enter. No Save button. |
| Single-field-add | **Autosave on Enter / Cmd+Enter.** Primary button mirrors the same action for discoverability; disabled when input is empty. |
| Create / wizard modal | **Explicit `[Create]` / `[Save]` / `[Next]`.** Disabled while invalid or submitting. |
| Settings section | **Explicit Save per dirty section.** Footer appears only when dirty, disappears on save (= success indicator). See `references/settings-pages.md`. Theme toggle is the only exception. |

Across all four: success is acknowledged by **state**, not by a toast. The new comment appears in the feed; the inline value updates; the dialog closes; the section footer disappears. Toast is reserved for async outcomes the user can no longer see (e.g. background export finished) and for system errors — see `references/empty-states.md` for the error-vs-empty taxonomy.

---

## STOP rules

- A modal for editing a single existing field. Inline edit (Shape 1).
- A modal for adding one comment / one sub-issue. Single-field-add inline composer (Shape 2).
- A Save button inside a single-choice popover. Selection IS the commit.
- A `[Cancel]` button next to a single-field-add composer. Backspace IS cancel.
- A toast on every successful save. The state change is the confirmation.
- A toast for a field-level validation error. Inline below the field, `text-xs text-warning`.
- A primary button that stays enabled during `isSubmitting`. Disabled + spinner.
- A multi-section Settings page with one bottom Save bar. Per-section dirty + per-section Save. See `references/settings-pages.md`.
- Live validation on every keystroke. `onBlur` or on-submit.
- A wizard where the steps are independent. Collapse to ONE modal with grouped sections.
- An autosaved Settings field that ISN'T theme. Theme is the only autosave; see `references/settings-pages.md`.
