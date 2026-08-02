# Component Inventory

> **Generated — do not edit.** Usage counts and consumer lists are read from
> the source tree; specifications come from `platform/tools/design/notes.mjs`.

## Usage map

| Component | Usages | Rendered by |
| --- | --- | --- |
| `Screen` | 11 | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, WaitingScreen |
| `Primary` | 13 | ConfirmScreen, DraftScreen, OfferDetailScreen, PrescriptionScreen, ReservationScreen |
| `Secondary` | 9 | DraftScreen, FindScreen, PrescriptionScreen, ReservationScreen, WaitingScreen |
| `ActionCard` | 2 | FindScreen, OffersScreen |
| `InfoCard` | 13 | FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen |
| `Choice` | 2 | OfferDetailScreen |
| `StateBlock` | 1 | (rendered by Screen, on every screen) |
| `Label` | 93 | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, WaitingScreen |
| `Digits` | 7 | ConfirmScreen, DraftScreen, OffersScreen, ReservationScreen, WaitingScreen |
| `Bidi` | 3 | DraftScreen, FindScreen |
| `RedirectNote` | 2 | ConfirmScreen, DraftScreen |

---

## Specifications

### `Screen`

The frame every screen renders through. It is the reason no screen can ship without answering 'where am I' and 'how do I go back'.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, WaitingScreen (11 usages) |
| **Required variants** | `header with back (pop/replace)`, `header without back (tab root)`, `with flow progress`, `with sticky slot`, `with screen footer`, `with state footer`, `no footer` |
| **Required interactions** | back press; scroll; sticky slot behaviour on scroll |
| **Accessibility** | The title is the screen's accessible name. The back control has a 44pt hit area and an explicit label. |
| **Motion** | screenPush 350ms on push; sheetPresent 300ms for modal destinations; sheetDrag follows the finger 1:1. |
| **RTL** | Header runs right-to-left by direction, NOT by row-reverse — reversing inside an RTL container double-reverses and puts back on the wrong edge. This shipped once. |
| **Responsive** | Title must truncate to one line. Progress caption must not wrap at 320pt. |
| **Implementation constraints** | Footer padding is 16 + 24pt bottom, a guessed approximation of a home indicator, not a real safe-area inset. |


### `Primary`

The one dominant action. At most one per screen, counted from the rendered tree every build.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen, OfferDetailScreen, PrescriptionScreen, ReservationScreen (13 usages) |
| **Required variants** | `default`, `disabled`, `busy` |
| **Required interactions** | press; long-press (undefined); disabled press (no-op, but the reason must be visible) |
| **Accessibility** | accessibilityState carries disabled and busy. A disabled primary MUST have a visible explanation near it — the build checks that something readable is on screen. |
| **Motion** | No press animation exists. errorShake (200ms) is declared for validation failure and unused. |
| **RTL** | Label centres; no directional content. |
| **Responsive** | Full-width in the footer. Must hold a long Arabic label at 200% text without truncating — 'أرسله أول ما يرجع الاتصال' is the longest today. |
| **Implementation constraints** | 48pt tall, above the 44pt floor, because §25 raises the patient primary specifically. |


### `Secondary`

Never competes with the primary: no fill, no accent background.

| | |
| --- | --- |
| **Used by** | DraftScreen, FindScreen, PrescriptionScreen, ReservationScreen, WaitingScreen (9 usages) |
| **Required variants** | `default`, `with a distinct spoken label` |
| **Required interactions** | press |
| **Accessibility** | Supports a spoken label different from the visible text, so repeated row actions are distinguishable to a screen reader while the visible text stays short. |
| **Motion** | None specified. |
| **RTL** | Groups of secondaries lay out right-to-left. |
| **Responsive** | Up to three appear in a row on R1 and must wrap legibly at 320pt. |
| **Implementation constraints** | 44pt minimum. Adjacent secondaries need a specified minimum gap so two are not mistaken for one. |


### `ActionCard`

A whole card that is itself the action. Replaced a filled button per row, which put three competing primaries on one screen.

| | |
| --- | --- |
| **Used by** | FindScreen, OffersScreen (2 usages) |
| **Required variants** | `default`, `muted (unavailable)` |
| **Required interactions** | press anywhere on the card |
| **Accessibility** | The label names the subject — 'أضف بانادول للطلب', not 'أضف' — so a screen reader moving down a list says which row it is on. |
| **Motion** | responderArrive 200ms when a new offer enters the list. Unimplemented. |
| **RTL** | Content column leads; the affordance trails. |
| **Responsive** | R8's row carries six facts. Verify at 320pt. |
| **Implementation constraints** | The affordance is a '+' character in a 32pt accent circle. Both the glyph and the circle are inventions. |


### `InfoCard`

Information, not an action. A refused item renders as information rather than a control that would reject the tap.

| | |
| --- | --- |
| **Used by** | FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen (13 usages) |
| **Required variants** | `default`, `muted` |
| **Required interactions** | none — deliberately not pressable |
| **Accessibility** | No role; content carries its own semantics. |
| **Motion** | None. |
| **RTL** | Inherits. |
| **Responsive** | Nests one level (R9 puts the pharmacist's note inside the consent card). |
| **Implementation constraints** | Most-used container: 14 usages. Padding, radius and 1px border are all invented. |


### `Choice`

One answer among two, where the choice itself is the point. Used only for substitution consent.

| | |
| --- | --- |
| **Used by** | OfferDetailScreen (2 usages) |
| **Required variants** | `selected`, `unselected` |
| **Required interactions** | press; change after answering — allowed until the offer is accepted |
| **Accessibility** | radio role with accessibilityState.selected. Without it a patient using TalkBack cannot tell which answer they gave. |
| **Motion** | None specified. A selection change should not animate in a way that implies the app made the choice. |
| **RTL** | Two side by side; the longer label ('لا، أريد اللي طلبته') must not force a different height. |
| **Responsive** | Both labels must fit at 320pt without truncation — a truncated consent option is a consent defect. |
| **Implementation constraints** | SAFETY-CRITICAL. Both options must remain visually equal in weight. Selection is currently a 2px accent border only, which is colour-alone. |


### `StateBlock`

Renders whichever treatment the screen's contract declared. It cannot fall through to a generic message.

| | |
| --- | --- |
| **Used by** | (rendered by Screen, on every screen) (1 usages) |
| **Required variants** | `loading`, `empty (teaching)`, `empty (quiet/success)`, `error`, `offline`, `permissionRefused`, `success (never used)` |
| **Required interactions** | the treatment's single action, which moves to the footer when the screen has no footer of its own |
| **Accessibility** | loading carries progressbar role. Errors must not rely on colour alone. |
| **Motion** | skeletonToReal 150ms. Unimplemented, and the skeleton's shape does not match any real content. |
| **RTL** | Inherits. |
| **Responsive** | Fills the screen and centres; must not push its action out of thumb reach at 200% text. |
| **Implementation constraints** | Six treatments, every dimension invented. The success treatment has never been rendered. |


### `Label`

All text. 5 type roles × 7 colour roles.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, WaitingScreen (93 usages) |
| **Required variants** | `display`, `title`, `headline`, `body`, `caption` |
| **Required interactions** | none |
| **Accessibility** | display and caption are barred from clinical content by type — a dosage in caption is a compile error. |
| **Motion** | None. |
| **RTL** | textAlign right, writingDirection rtl. Normalises Arabic-Indic digits to Western at render, so no call site can leak a second numeral system. |
| **Responsive** | Must reflow at 200%. |
| **Implementation constraints** | Letter-spacing is always 0. Arabic is connected and tracking breaks the joins. |


### `Digits`

Countdowns, prices, quantities, the reservation code.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen, OffersScreen, ReservationScreen, WaitingScreen (7 usages) |
| **Required variants** | `body`, `headline`, `title`, `display` |
| **Required interactions** | none — but the reservation code should arguably be selectable |
| **Accessibility** | Read as a number by screen readers; the reservation code is grouped in pairs so it can be read aloud. |
| **Motion** | A ticking countdown must not reflow. |
| **RTL** | Numbers run LTR inside RTL text. |
| **Responsive** | The code is the largest element on V2 and must survive 200% text. |
| **Implementation constraints** | Requires a TABULAR figures face. None is bundled, so digits currently change width as they tick. |


### `Bidi`

Isolates a Latin run inside Arabic — drug names, codes, prices — so it does not reorder.

| | |
| --- | --- |
| **Used by** | DraftScreen, FindScreen (3 usages) |
| **Required variants** | `body`, `headline`, `caption`, `title` |
| **Required interactions** | none |
| **Accessibility** | Correct reading order for screen readers. |
| **Motion** | None. |
| **RTL** | This IS the RTL component. Unisolated, a price beside Arabic reorders and the patient reads the wrong number. |
| **Responsive** | Mixed-script lines wrap unpredictably; verify at 320pt. |
| **Implementation constraints** | Correct by construction. Needs only the Arabic/Latin font pairing. |


### `RedirectNote`

Says why a guard sent the user here, so a screen never appears for no reason.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen (2 usages) |
| **Required variants** | `one` |
| **Required interactions** | none |
| **Accessibility** | Should be announced on arrival — currently it is not. |
| **Motion** | None. |
| **RTL** | Inherits. |
| **Responsive** | One or two lines. |
| **Implementation constraints** | Entirely invented. |


---

## Components that do not exist and are needed

| Component | Needed by | Consequence today |
| --- | --- | --- |
| **TabBar** | S1, F1 and all eight declared destinations | No top-level navigation exists. S1 and F1 declare 'root of a tab' and there are no tabs. |
| **Sheet / modal chrome** | R1, R4, R5, R7 (destination: modal) | Modals render as full screens; the 'temporary and layered above' signal is absent. |
| **TextField** | F1/F2 search, and 28 form screens in Entry and Account | One inline search field was improvised. No focus, error or disabled state exists. |
| **PhotoViewer** | R3 | A grey placeholder box renders instead of the prescription. |
| **DestructiveConfirm** | V5, and the 'two-step' Blueprint state kind | The first destructive action will invent its own pattern. |
| **Toast / transient confirmation** | the undoDwell motion token (4000ms) | The token has nothing to animate. |
| **Badge** | the inbox destination | Nothing can show pending work. |
| **FocusRing** | accessibility | Assistive input hardware is unusable — nothing renders focus. |
| **PullToRefresh** | every cached list | Not implemented, no specification. |
