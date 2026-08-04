# 08 — UX Problems

Every problem found in the prototype, why it is a problem, and what replaces
it. Problems marked **(observed)** were reproduced in a browser; the rest are
architectural.

## Structural

### 1. One application serving three audiences
**Why.** Personas leak. Two cross-persona navigation leaks were reproduced: a
patient quick-action reached the pharmacy compose screen, and "send offer"
reached the patient's offers list. Neither survived review; both survived
until a test looked for them.
**Fix.** Three binaries. The screen is not in the build. See [02](02-user-types.md).

### 2. Screens are documents, not states
**Why.** Each screen ships a happy path; empty, loading, error, offline, and
permission-denied are discovered in production. **(observed:** timers started
at page load rather than screen entry, so a user who browsed for two minutes
arrived at a reservation already showing "expired" with no action available.**)**
**Fix.** A screen is defined by its state set. The inventory in
[04](04-screen-inventory.md) lists required states per screen; a screen is not
complete until each exists.

### 3. No source of truth for what a screen may claim
**Why.** Clinical text lived in markup. A withdrawn claim could remain on
screen indefinitely, because withdrawal happens in a different system from the
screen.
**Fix.** UI claim bindings: every element rendering a clinical output declares
claim, contract, and knowledge release, validated in CI against the manifest.

### 4. The pharmacy side is a CRUD dashboard
**Why.** It was designed as tables and buttons. The pharmacist decides whether
the platform lives, and a dense, fast workspace was never built for them.
**Fix.** Inbox-first, fifteen-second answer, one-handed reach, keyboard where a
keyboard exists. See [03](03-navigation.md).

## Patient experience

### 5. The wait is dead time
**Why.** After sending a request the patient stares at nothing and assumes it
failed. The wait is the highest-anxiety moment in the product.
**Fix.** Make the wait legible: which pharmacies were asked, who replied, who
is still thinking, how long is typical. Progress that is real, not a spinner.

### 6. "No interactions found" and "we could not check" look identical
**Why.** The most dangerous possible ambiguity in the product. **(observed:** an
`UNAVAILABLE` outcome could reach the UI as an absence of warnings.**)**
**Fix.** `UNAVAILABLE` is a designed state with its own visual treatment and a
route to a pharmacist. Enforced at the contract layer: the outcome is a union
of four, and a client that treats it as a boolean does not type-check.

### 7. Reorder asks questions the app can already answer
**Why.** The app knows the medicine, the subject, the usual pharmacy, and the
quantity, and asks again anyway.
**Fix.** Reorder is two taps. Everything else is a correction, not an input.

### 8. Family is a settings page
**Why.** The person ordering is often not the person taking. Burying the
subject switcher makes the primary use case the hard one.
**Fix.** Subject switcher on the home surface. Every clinical read and write
carries subject and actor separately.

### 9. Empty states apologise instead of teaching
**Why.** An empty state is the highest-attention moment in the product —
nothing competes for the eye — and it is spent on "no data".
**Fix.** Every empty state explains the model and offers the next action.

### 10. Errors do not name the next action
**Why.** "Something went wrong" tells the user nothing about whether their data
survived or what to press.
**Fix.** Every error states what failed, whether anything was lost, and one
action.

### 11. Offline is treated as an error
**Why.** Iraqi mobile data drops routinely. A blank screen implies the app is
broken.
**Fix.** Offline is a first-class state: read-only, clearly labelled, with
staleness stated, and writes queued in an outbox.

### 12. Prescription failure is undesigned
**Why.** Handwritten prescriptions will fail OCR often. The failure path got
less design attention than the success path.
**Fix.** Low-confidence is a designed screen: show the image, show what we
read, let the user correct, never guess. The confidence gate is server-side.

### 13. Destructive actions are one tap or fake
**Why.** **(observed:** "revoke access" had no handler at all; "delete account"
was a `confirm()` that returned true and was followed by nothing, so the user
believed the account was deleted when it was not.**)**
**Fix.** Destructive actions arm, confirm, and — where possible — offer undo.
Account deletion is typed confirmation plus a 30-day cancellable window.

### 14. A button that does nothing reads as a broken app
**Why.** **(observed:** eleven controls either had no handler or only raised an
`alert()`.**)** The user does not conclude "not built yet"; they conclude
"broken".
**Fix.** No shipped control without behaviour. Unbuilt features are absent, or
explicitly labelled as coming — never present and inert.

## Pharmacy experience

### 15. Declining costs more than ignoring
**Why.** Declines are the best coverage and inventory signal we can collect. If
they cost taps, pharmacies ignore instead, and the platform goes blind.
**Fix.** One tap to decline, one tap for the reason, done.

### 16. Offer and hold are not visibly different
**Why.** A pharmacy that thinks an offer commits stock will over-commit; a
patient who thinks an offer is a hold will arrive to nothing. This single
confusion is the product's main failure mode.
**Fix.** Different screens, different words, different colours, and the clock
appears only at hold confirmation.

### 17. Inventory invites data entry
**Why.** Any editable quantity field turns the app into an ERP the pharmacist
has no time to feed. Every platform that demanded this died.
**Fix.** Passive ledger. Movements, spot counts, and a measured trust score —
never a quantity field. A count that **matches** the ledger is valid and
valuable. **(observed:** the prototype rejected zero-variance counts, inverting
the trust signal entirely.**)**

### 18. No way to pause
**Why.** A pharmacy at capacity with no pause will simply stop answering, and
we cannot distinguish that from a pharmacy that has left.
**Fix.** Explicit capacity and pause, visible to patients as "not accepting
right now" rather than silence.

## Cross-cutting

### 19. Arabic treated as a translation
**Why.** RTL is where ports fail. **(observed:** centring broke twice from
pairing a logical offset with a physical transform; a badge overflowed at
320px; contrast failed at 4.08:1 on amber.**)**
**Fix.** Arabic-first from the token layer up. Logical properties, `<bdi>`
isolation, one numeral system per surface, measured contrast — see
[06](06-native-ux.md).

### 20. Accessibility is assumed rather than measured
**Why.** The target user is frequently elderly, low-vision, or has tremor.
**Fix.** Touch targets, contrast, text-zoom to 200%, screen-reader order, and
reduced motion are all measured in CI, and audited once with real Arabic
screen-reader users — automation does not catch announcement order.

### 21. Notifications have no preference model
**Why.** A medication app that wakes someone at 3am is uninstalled that night.
**Fix.** Per-category preferences with quiet hours. Safety alerts are the only
category that may override quiet hours, and that fact is stated plainly during
onboarding rather than discovered.

### 22. The system cannot be operated by a non-engineer
**Why.** Verification, support, catalogue curation, and incident response all
require a developer today.
**Fix.** The Owner console — see [02](02-user-types.md) and
[03](03-navigation.md).
