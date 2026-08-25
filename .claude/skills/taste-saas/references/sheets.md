# Sheets — slide-in panels for context-preserving operations

> Read when: deciding between Modal and Sheet, building a row-preview pattern (click list row → sheet slides in, list stays visible), or hosting a long form / wizard that benefits from background context.

A Sheet is not "a bigger Modal" or "a Modal that slides instead of fades". It's a different **purpose**. Modal is for *submitting* (the user is producing input); Sheet is for *viewing more about a row* (the user is consuming context, with light edit affordances). Picking the wrong one is the most common overlay mistake in this archetype — a Sheet where a Modal belongs feels heavy and unfocused; a Modal where a Sheet belongs makes the user lose the list they were just scanning.

## Sheet vs Modal — the decision

|  | Modal | Sheet |
|---|---|---|
| **Primary purpose** | **Submitting / committing data** (produce input, fire a discrete action) | **Viewing more info about a row** (read / scan, with light edit affordances) |
| Visual relationship | Overlays + dims the page behind | Slides in beside the page; page stays visible |
| Focus model | Single focus | Dual focus (context + operation) |
| Typical capacity | Short form / confirmation | Entity quick-look / long-form read |
| Best for | One-shot task, independent of background | Task that needs background as reference |

The primary axis is **submitting vs viewing**, not "small vs big" and not "fade vs slide". Focus model and capacity are useful tie-breakers when the purpose isn't obvious — but if you can answer "is the user producing input or consuming context?" first, the rest follows.

Note: Modal does **not** "block tasks". The difference is **focus**. Modal focuses on ONE thing; the background is dimmed and unreadable. Sheet keeps the page clear behind the panel; the user can reference the list while reading an entity.

**Pick Sheet when** (purpose = *see more about this row without leaving*):
- **Row preview — the canonical case**: clicking a list row opens entity details inline without leaving the list (Linear's issue preview, Notion's page preview, GitHub Files-changed sidebar). The user is scanning, not committing. Sometimes called "details panel" or "quick look".
- **Expand-in-place**: clicking a chart / KPI tile slides in a larger version with more detail, while the dashboard stays visible behind.
- **Side-by-side scan**: the user toggles between two items in the list, reading each as a sheet — the list is the navigator, the sheet is the reader.
- **Long form / wizard that needs the list as reference** — secondary case; a multi-step form benefits from the sheet model only when the list / source data must stay visible. Most forms are still Modal (see below).

**Pick Modal when** (purpose = *submit a form / confirm / commit*):
- **Create-new-entity form**: New project, New API key, Invite member. The user is producing input — focus belongs on the form, not the list behind it.
- **Confirmation** (Delete? Type DELETE to confirm.) — discrete action, background context isn't relevant.
- **Short one-shot form**: rename, share link, change password. Focus on the dialog.
- **Critical interrupt** (auth required, payment failed, dirty-state-on-navigate) — must steal focus.

The split with the **full detail page** completes the triple: full detail page is heavy — the user committed to drilling in via navigation. Sheet is the lighter middle ground for "I want to look at this row without committing to leaving the list".

If you're unsure, ask: *Is the user producing input or consuming context?* Producing → Modal. Consuming → Sheet. Default to Modal — Sheet is the specialized tool for the row-preview pattern.

## Geometry

- **Slides in from the right edge** of the viewport (or from the bottom on mobile — same primitive, `side="bottom"`).
- **Default width: 480–600 px.** Linear's issue preview is ~520; Notion's page preview is ~600. Below 480 the body feels cramped; above 600 it stops feeling like a panel and starts feeling like a half-page split.
- **Header: `h-11`** (= `--top-row-h`) so the top of the sheet baseline-aligns with the app's top chrome row (the breadcrumb / page-card top edge in Archetype A; the inline top bar in B/D; the page title row in C — see `references/archetype-*.md`). The sheet reads as a continuation of the chrome row, not a floating intruder.
- **No backdrop dim.** A translucent scrim captures clicks (so click-outside closes), but the page behind stays fully legible. This is THE visual difference from a Modal — a sheet that dims the page is a Modal that happens to be docked right; the focus model is wrong.
- **Body: scrollable**, `padding-inline: var(--page-pl)` so the sheet's content baselines with the page's left-padding system (universal across archetypes — every archetype defines its own `--page-pl`; see `references/archetype-*.md`). A sheet that uses ad-hoc `px-6` while the rest of the app uses `--page-pl` looks subtly off.
- **Footer (optional)**: same pattern as Modal — `px-6 py-4`, sticky bottom — rendered only when caller passes one. **No `border-t`** (wireless first principle — separate with whitespace, not lines).
- `max-w-[100vw]` cap so on narrow viewports the sheet fills the screen rather than spilling off-canvas.

## Expand to fullscreen

A row-preview sheet is a teaser — sometimes the user wants the full route. Every sheet that previews a route gets an **expand button** (`Maximize2` from lucide, top-right of header, next to the close X).

- Clicking it navigates to the corresponding full route. Example: clicking *Expand* on the issue-preview sheet for ENG-138 navigates to `/issues/ENG-138`.
- The full route's content should be **visually identical to what the sheet was showing** — same header, same archetype, same field strip. The transition feels like "the sheet just grew to fill the viewport", not "a sheet closed and a different page opened".
- If there is no corresponding full route, **do not show the expand button**. A button that promises fullscreen and delivers nothing is worse than the missing affordance.

## Animation

- `transform: translateX(100%)` → `translateX(0)` on open; reverse on close.
- **200 ms `cubic-bezier(0.4, 0, 0.2, 1)`** — the same `LAYOUT_TR` token used elsewhere in the app (see `references/wireless-tokens.md` and `references/archetype-a-floating-card.md`). Don't invent a separate ease/duration; the sheet feels native when it shares the shell's motion vocabulary.
- Scrim fades in over 100 ms (`--dur-quick`) — faster than the panel slide, so the user perceives the page "going still" first, then the panel arriving.
- Reduced-motion: respect `prefers-reduced-motion` via `--dur-slow: 1ms` (per `references/wireless-tokens.md`) — the sheet still appears, it just doesn't slide.

## Keyboard

- **ESC** closes (same as Modal).
- **`Cmd/Ctrl + \`** (optional, but recommended if your app uses sheets heavily) toggles expand-to-fullscreen — the keystroke matches the visual metaphor of "open the side panel into the full page".
- **Focus trap** inside the sheet while open (Radix Dialog / Mantine Drawer / Park UI Drawer all handle this — don't reinvent).
- On close, **focus returns to the trigger element** — the row that opened the sheet, the `+` button, the list cell. Without this, the user's keyboard cursor is lost in the void.
- The list behind the sheet **should not respond to row navigation keys** (`j` / `k` / arrow) while the sheet is open — the sheet's focus trap owns the keyboard. Click-outside-or-ESC to release.

## Library implementations

| Lib | Primitive | Notes |
|---|---|---|
| shadcn | `Sheet` / `SheetTrigger` / `SheetContent` / `SheetHeader` / `SheetTitle` / `SheetDescription` / `SheetFooter` | Built on Radix Dialog with sheet-specific styling. `side="right" \| "left" \| "top" \| "bottom"`. Both Sheet and Dialog share the Radix Dialog ARIA model — they're styled differently. |
| Mantine | `Drawer` | `position="right"`, `size={520}` (number → px, string → CSS value), `withOverlay={false}` for no-dim scrim, `overlayProps={{ opacity: 0 }}` for click-capture-only. |
| Park UI / Ark UI | `Drawer` (= Dialog with slide-in styling) | `placement="end"` for right-edge slide. Headless — you provide styling tokens. |
| Headless UI | `Dialog` + `Transition` with `enterFrom="translate-x-full"` / `enterTo="translate-x-0"` | Bare primitive. Use only when shadcn / Mantine / Park UI are off the table. |

Don't reach for a separate "drawer library" — the four above cover every case. Sheet is just Dialog with a different transition + scrim treatment.

## Wrapper contract (build once per project)

Like the Modal wrapper in `references/overlays-and-keyboard.md`, build a Sheet wrapper at `ui/sheet.tsx` that locks the project's shape decisions in ONE place. **Same shape as the Modal wrapper — header / body / optional footer / caller-set width — different transition + scrim.** Don't re-derive padding, max-height, or footer rules; the only differences from the Modal wrapper are:

- `side` prop (default `"right"`).
- `defaultWidth: 520` (px or class), in place of Modal's `max-w-lg`.
- `expandable: boolean` (default `false`) — when true, header renders the `Maximize2` button.
- `onExpand?: () => void` callback — wire this to your router's navigate to the full route.
- No `max-h-[85vh]` cap — sheet is full-height of the viewport.
- No backdrop-dim styling — overlay is `bg-transparent pointer-events-auto`, just a click-capture layer.

```tsx
<Sheet open={open} onOpenChange={setOpen} width={520} expandable>
  <SheetHeader>
    <SheetTitle>{issue.id} — {issue.title}</SheetTitle>
    <SheetExpandButton to={`/issues/${issue.id}`} />
  </SheetHeader>
  <SheetBody>
    {/* same content the full route renders, archetype B / right rail still applies */}
  </SheetBody>
  <SheetFooter>
    <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
    <Button variant="brand" onClick={save}>Save</Button>
  </SheetFooter>
</Sheet>
```

The shadcn `SheetContent` ships its own `sm:max-w-sm` baked-in width cap — the same trap as Dialog (see `references/overlays-and-keyboard.md`, *The shadcn trap*). Apply the same `!` prefix + safelist pattern. Don't repeat the recipe — go read it there.

## Sheets inside sheets — don't

A sheet should not open another sheet. If your flow has steps, use a **stepped sheet** (one sheet, internal step state, `Back` / `Next` like the wizard in `references/forms.md`). Stacking sheets is the slide-in equivalent of nested modals — users lose track of the focus model entirely.

A sheet **can** open a Modal — `Delete this entity? Type DELETE.` confirmation from a sheet's destructive action is fine. The Modal's full backdrop dims both the page AND the sheet, and the user understands "the confirmation is the only thing that matters right now". On confirm-or-cancel, the Modal closes and the sheet remains.

## STOP rules

- **Sheet with no scrim** — users accidentally interact with the background and the sheet's contents go unsaved when click-outside doesn't close.
- **Sheet that ALSO dims the background** — wrong focus model; use Modal. The point of Sheet is the page stays legible.
- **Sheet for a single-field confirmation** — overkill. Confirmations are submitting → Modal (see `references/overlays-and-keyboard.md`).
- **Multiple sheets stacked** — a sheet can't open a sheet. Stepped sheet (one panel, internal `Back` / `Next`) is the pattern; see *Sheets inside sheets — don't* above.
- **Sheet width changes mid-session** — a user-initiated resize handle is fine; auto-growing to fill the viewport as content lengthens is jarring.
- **Sheet doesn't return focus to its trigger on close** — keyboard cursor lands in the void; the user has to mouse-pick a row again.
- **Expand button without a corresponding full route** — you're promising a fullscreen view; deliver one, or hide the button.
- **Sheet replaces the right rail of a detail page** — the rail (`references/detail-pages.md` archetype B) is an integrated column, not an overlay. If you find yourself sheeting the rail, you're confusing layout with overlay.
- **Custom animation curve** — share `LAYOUT_TR` (200 ms, `cubic-bezier(0.4, 0, 0.2, 1)`) with the rest of the shell, or the sheet feels grafted-on.
- **Sheet that doesn't respect `prefers-reduced-motion`** — `--dur-slow: 1ms` should collapse the slide; the sheet still opens, it just doesn't fly.
