# Toast — when and how

> Read when: integrating a toast lib (sonner / Mantine Notifications / react-hot-toast) or unsure if a given state change deserves one.

Toasts are the most over-used surface in generic AI-built dashboards. Every keystroke gets a "✓ Saved!", every click a "Loaded", every page transition a "Welcome back". The result reads as cheap — the app keeps congratulating itself for working. Linear, Vercel, LangSmith, Cal.com use toast sparingly and on purpose. This file is the contract for when toast earns its place on screen.

## The single rule

Toast is for **async events that completed (or failed) out of view** of the user — usually paired with an **undo** affordance. NOT for confirming actions the user just performed with full visibility. When the user clicks "Save" and the value visibly updates in place, **the state change IS the confirmation.** Layering a toast on top of a visible change is noise, not feedback.

## When to toast (yes)

- Async mutation succeeded AND the result isn't visible on screen (moved an item to a different page, archived from a different view, sent an invite)
- Async mutation succeeded AND there's a useful undo (delete, archive, status change) — toast is the undo's home
- Async mutation failed (network error, server-side validation rejected, conflict) — toast becomes the error surface, with a Retry action if the request is idempotent
- Background event the user didn't initiate (collaborator made a change, deploy finished, long-running job completed)

## When NOT to toast

This is the section that gets generic AI dashboards wrong. Most "confirmations" are anti-confirmations — they tell the user something they already saw.

- **User clicked "Save" and the value visibly updated in-place.** No toast. The visible update IS the confirmation. If the field reverts on failure, the visible revert is the failure signal too — pair it with an inline error, not a toast.
- **Form field validation error.** Inline below the field at `text-xs text-danger`, NOT toast. Toast disappears in 4s; the user reads it as "something happened" but can't find what to fix. See `references/forms.md`.
- **Page-level error (load failed, no permission, 404).** Error banner inside the page body, NOT toast. The page has no content — the error needs to occupy the body, not float over the void. See `references/empty-states.md` "Error / failed to load".
- **A status pill / progress indicator already shows the state.** A pill flipping from "In Progress" to "Done" is the confirmation. A toast on top is redundant — the user just watched it change.
- **Optimistic UI already updated the row.** If the table row visibly updated before the network round-trip finishes, the toast is noise. Save toasts for the failure case (the optimistic update reverts AND a toast explains why).
- **"Loading..." while waiting.** Use a skeleton, inline spinner, or button-pending state. Toast is for completed events, not in-flight ones.
- **Welcome / re-engagement messages on page load.** "Welcome back!", "Tip: try Cmd+K" — these are interruptions, not feedback. If onboarding needs a hint, put it in an empty state hero, not a toast.
- **Telemetry / debug events.** "Synced", "Connected", "Cache warmed" — internal events the user has no reason to know about. If you're shipping these, you're confusing toast with a console.

The test: **can the user point to a visible change on screen that says the same thing as the toast?** If yes, drop the toast.

## The format contract

- **Position: bottom-right.** Universal across Archetypes A/B/C/D — Linear, Vercel, sonner's default. NEVER top-center (covers the page-header toolbar), NEVER bottom-center (covers the Cmd+K trigger), NEVER top-right (collides with avatar / notifications popovers).
- **Toast rounding adapts per archetype.** A's floating-card aesthetic uses softer corners (`rounded-lg`); C/D's flatter shells use tighter corners (`rounded-md` or `rounded-sm`). See `references/archetype-*.md`.
- **Duration:** ~4s success, ~6s error, **persistent for action-required** (undo, retry) with an explicit dismiss button.
- **One line of text.** No title + body split. If you need a headline plus an explanation, you actually need a Modal or an inline banner — not a toast.
- **Verb-first copy.** "Archived 3 issues", "Failed to save — retry", "Invite sent to anna@". NOT "Success!", "Done!", "Operation completed".
- **Action toast** (sonner's `action` prop, Mantine's `withCloseButton` + custom button) for undo within a 4–6s window. The action button extends the toast's lifespan until clicked or dismissed.
- **Stack vertically, max 3 visible**, rest queue. If you're firing more than 3 in a burst, batch them ("Archived 12 issues" not 12 separate toasts).
- **No icon by default.** sonner's default success/error swatch is enough. Custom icons (lucide) only when the toast represents a specific entity (e.g. `<GitBranch>` for a deploy toast).

## Accessibility

- `role="status"` (polite, sonner default for success) — screen readers announce on idle, doesn't interrupt
- `role="alert"` (assertive, sonner default for error) — screen readers announce immediately
- Action button MUST be keyboard-reachable; ESC dismisses the most recent toast
- Don't trap focus in the toast — it's ambient, not modal
- Respect `prefers-reduced-motion` — sonner does this automatically; verify in your lib

## Library specifics

| Lib | Mount | Fire | Action / undo | Position |
|---|---|---|---|---|
| **sonner** (React, default) | `<Toaster position="bottom-right" />` | `toast.success("Archived")` / `toast.error("Failed")` | `toast("Archived", { action: { label: "Undo", onClick: ... }})` | `position` prop |
| **Mantine Notifications** | `<Notifications position="bottom-right" />` | `notifications.show({ message, color: "green" })` | custom action via `withCloseButton` + body component | `position` prop |
| **react-hot-toast** | `<Toaster position="bottom-right" />` | `toast.success("Archived")` | `toast.custom(t => ...)` for action toasts | `position` prop |
| **Vue Sonner** | `<Toaster position="bottom-right" />` | `toast.success("Archived")` | same `action` shape as sonner | `position` prop |

The shape is intentionally identical across libs — pick the one that matches your framework and apply the same contract.

## Pulse example

Mount at the root, one `<Toaster>` for the whole app:

```tsx
// main.tsx
<QueryClientProvider client={queryClient}>
  <App />
  <Toaster position="bottom-right" theme="light" />
</QueryClientProvider>
```

Fire on completed async mutations that the user can't otherwise see:

```tsx
// Slash command moved the issue to "Done" from the comment composer —
// the issue row might be off-screen, so confirm with a toast.
save.mutate({ status: "Done" }, {
  onSuccess: () => toast.success(`Updated — status: Done`),
  onError:   () => toast.error("Couldn't update status — retry"),
});
```

```tsx
// Roadmap drag-to-reschedule: the bar moved visibly, but the network
// round-trip is invisible — toast confirms the server accepted it.
toast.success(`Rescheduled ${id} to ${fmtDate(startDate)}`);
```

Undo pattern for destructive actions:

```tsx
toast(`Archived ${count} issues`, {
  action: { label: "Undo", onClick: () => restore(ids) },
  duration: 6000,
});
```

## STOP rules

- Toasting after every form field save (autosave is its own UX — see `references/settings-pages.md` dirty-state)
- Toasting "Loading..." or "Saving..." — use skeletons / inline button-pending state
- Stacking 5+ toasts in a burst — batch into one summary toast ("Archived 12 issues")
- Toast as the ONLY indicator something happened — a visible state change must accompany, or the change won't survive the toast's 4s lifespan
- Top-center / top-right position — blocks toolbar, avatar, notifications popover
- Two-line toasts with a heading + body — that's a Modal or a banner, not a toast
- Toasting page-load errors — render an error banner in the page body instead
- Brand-color or rainbow toasts for variety — success = green tick, error = red, neutral = bg-surface. One swatch each, no exceptions

## See also

- `references/empty-states.md` — page-level errors live in the body, not a toast
- `references/forms.md` — field-level validation is inline, not a toast
- `references/settings-pages.md` — autosave dirty-state replaces "Saved!" toasts
