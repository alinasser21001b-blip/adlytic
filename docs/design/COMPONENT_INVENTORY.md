# Component Inventory

> **Generated — do not edit.** Usage counts and consumer lists are read from
> the source tree; specifications come from `platform/tools/design/notes.mjs`.

## Usage map

| Component | Usages | Rendered by |
| --- | --- | --- |
| `Banner` | 1 | — |
| `CodePanel` | 1 | ReservationScreen |
| `FactRow` | 4 | ReservationScreen, TodayScreen |
| `Row` | 29 | ConfirmScreen, DraftScreen, OfferDetailScreen, OffersScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen |
| `Spacer` | 11 | DraftScreen, OfferDetailScreen, OffersScreen, TodayScreen, WaitingScreen |
| `Grow` | 5 | ConfirmScreen, OfferDetailScreen, WaitingScreen |
| `Actions` | 4 | DraftScreen, FindScreen, PrescriptionScreen |
| `Card` | 14 | ConfirmScreen, DraftScreen, OfferDetailScreen, TodayScreen, WaitingScreen |
| `Note` | 8 | ConfirmScreen, DraftScreen |
| `Section` | 12 | ConfirmScreen, OfferDetailScreen, OffersScreen, TodayScreen, WaitingScreen, WhyNumberScreen |
| `Field` | 0 | — |
| `Chip` | 1 | ConfirmScreen |
| `StepButton` | 1 | DraftScreen |
| `Dial` | 1 | WaitingScreen |
| `ProgressBar` | 0 | — |
| `PhotoFrame` | 1 | PrescriptionScreen |
| `SearchField` | 1 | FindScreen |
| `Screen` | 17 | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen |
| `Primary` | 20 | ConfirmScreen, DraftScreen, OfferDetailScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen |
| `Secondary` | 15 | DraftScreen, FindScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen |
| `ActionCard` | 3 | FindScreen, OffersScreen |
| `InfoCard` | 12 | FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen |
| `Choice` | 2 | OfferDetailScreen |
| `StateBlock` | 1 | (rendered by Screen, on every screen) |
| `Label` | 137 | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen |
| `Digits` | 5 | ConfirmScreen, DraftScreen, ReservationScreen, TodayScreen |
| `Bidi` | 5 | DraftScreen, FindScreen, OfferDetailScreen |
| `RedirectNote` | 2 | ConfirmScreen, DraftScreen |

---

## Specifications

### `Banner`

A full-bleed strip under the header carrying a statement about the WHOLE screen — today, that the content came from the device rather than from a pharmacy.

| | |
| --- | --- |
| **Used by** | — (1 usages) |
| **Required variants** | `statement only`, `statement with a trailing age` |
| **Required interactions** | none — it is not a control |
| **Accessibility** | Read as text in reading order, immediately after the screen title, so the caveat arrives before the content it qualifies. |
| **Motion** | None specified. The delivery does not say whether it slides in when connectivity drops. |
| **RTL** | Statement on the leading edge, age on the trailing edge, by justification rather than by a physical direction. |
| **Responsive** | The two runs must not collide at 320pt; no wrapping behaviour is specified. |
| **Implementation constraints** | Full-bleed by definition — it deliberately opts out of the screen gutter, which is why it is drawn by the frame and not by a screen. |


### `CodePanel`

The reservation code, on the one light surface in the patient app. It reads as something printed and handed over rather than as another card in an app.

| | |
| --- | --- |
| **Used by** | ReservationScreen (1 usages) |
| **Required variants** | `caption + code`, `caption + code + hint` |
| **Required interactions** | none — deliberately not tappable; the code is read aloud, not copied |
| **Accessibility** | The panel carries one accessible label combining caption and code, so a screen reader announces what the number IS before reading it. |
| **Motion** | None specified. |
| **RTL** | The code itself is forced left-to-right: it is a token, not prose, and must be one direction whichever alphabet it uses. |
| **Responsive** | 76px digits at 390pt. The delivery does not say what happens at 320pt or at 200% text. |
| **Implementation constraints** | Its two text colours are measured separately by the contrast gate because it inverts. The caption ships darker than delivered — DEV-1. |


### `FactRow`

A labelled fact — muted label on one edge, value on the other — so the eye scans one column of labels instead of parsing sentences.

| | |
| --- | --- |
| **Used by** | ReservationScreen, TodayScreen (4 usages) |
| **Required variants** | `first (no divider)`, `subsequent (divider above)`, `string value`, `composed value` |
| **Required interactions** | none |
| **Accessibility** | Label and value are adjacent in reading order, so the pair is announced as one fact. |
| **Motion** | None. |
| **RTL** | Label leading, value trailing, via a spacer rather than a physical edge. |
| **Responsive** | A long value wraps under itself; the behaviour at 320pt with a long pharmacy name is unspecified. |
| **Implementation constraints** | The divider is the 1pt line role. Rows are meant to sit inside one card, not to be scattered. |


### `Row`

Things side by side. The single place `flexDirection` is written in the patient app.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen, OfferDetailScreen, OffersScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen (29 usages) |
| **Required variants** | `align baseline / center / stretch`, `justify center / space-between`, `any gap token` |
| **Required interactions** | none |
| **Accessibility** | Transparent. |
| **Motion** | None. |
| **RTL** | Always `row` — never `row-reverse`. Under an RTL container `row` already runs right-to-left; reversing again flips it back, which put the back chevron on the wrong edge once. A screen can no longer type the property at all. |
| **Responsive** | Does not wrap. Use Actions when the content can exceed one line. |
| **Implementation constraints** | Baseline is the common alignment by count — a number beside its unit is one sentence and their feet must line up. |


### `Spacer`

Pushes what follows to the far edge of a Row.

| | |
| --- | --- |
| **Used by** | DraftScreen, OfferDetailScreen, OffersScreen, TodayScreen, WaitingScreen (11 usages) |
| **Required variants** | `none` |
| **Required interactions** | none |
| **Accessibility** | Transparent. |
| **Motion** | None. |
| **RTL** | In RTL the far edge is the left one, which no call site has to know. |
| **Responsive** | Absorbs all slack; content on either side must still fit at 320pt. |
| **Implementation constraints** | Grow with no children — one implementation, so a change to how leftover space is distributed happens once. |


### `Grow`

Takes whatever width is left in a Row, and carries content while doing it.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, OfferDetailScreen, WaitingScreen (5 usages) |
| **Required variants** | `with children` |
| **Required interactions** | none |
| **Accessibility** | Transparent. |
| **Motion** | None. |
| **RTL** | Direction-neutral. |
| **Responsive** | The shrinking element in every row; long Arabic names wrap inside it rather than pushing the row wider. |
| **Implementation constraints** | The only expression of flex in a screen. |


### `Actions`

A cluster of secondary actions under the content.

| | |
| --- | --- |
| **Used by** | DraftScreen, FindScreen, PrescriptionScreen (4 usages) |
| **Required variants** | `one to three secondaries` |
| **Required interactions** | press, per child |
| **Accessibility** | Children carry their own labels; the cluster adds none. |
| **Motion** | None. |
| **RTL** | Leading-edge first, wrapping onto new lines in reading order. |
| **Responsive** | Wraps, because Arabic labels are long and a fixed row truncates them at 320pt. |
| **Implementation constraints** | Never contains a Primary — the one dominant action belongs in the footer, and a filled button inside a wrapped cluster is exactly the competing hierarchy the kit exists to prevent. |


### `Card`

A rectangle of content raised off the ground. The one card primitive.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen, OfferDetailScreen, TodayScreen, WaitingScreen (14 usages) |
| **Required variants** | `raised / sunken`, `border line / accent / alert / warning / none`, `1pt or 2pt border`, `any pad and gap token` |
| **Required interactions** | none — a card that is an action is ActionCard |
| **Accessibility** | Transparent; grouping is conveyed by the content, not by the container. |
| **Motion** | None. |
| **RTL** | Direction-neutral. |
| **Responsive** | Full-width inside the gutter at every size checked. |
| **Implementation constraints** | Replaced four hand-rolled copies that differed only in padding or border colour, so a change to 'what a card is' is now one edit. |


### `Note`

A short statement about the content beside it — a missing prescription, a guard's reason for sending you here, work waiting for a signal.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen (8 usages) |
| **Required variants** | `neutral`, `caution`, `alert` |
| **Required interactions** | may contain secondaries |
| **Accessibility** | Read in place. It is not a live region — nothing announces it when it appears. |
| **Motion** | None specified, and the delivery does not say whether one that appears mid-screen should animate in. |
| **RTL** | Direction-neutral. |
| **Responsive** | Wraps freely. |
| **Implementation constraints** | Always sunken — a remark ABOUT the screen sits below the content plane rather than competing as another card. Only the alert tone is outlined: a caution that is also outlined reads as an error. |


### `Section`

A heading and the things it governs, as one unit.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, OfferDetailScreen, OffersScreen, TodayScreen, WaitingScreen, WhyNumberScreen (12 usages) |
| **Required variants** | `none` |
| **Required interactions** | none |
| **Accessibility** | Provides no heading semantics — nothing in the product exposes a heading level yet. A real gap. |
| **Motion** | None. |
| **RTL** | Direction-neutral. |
| **Responsive** | No behaviour change. |
| **Implementation constraints** | Its gap is deliberately tighter than Stack's, and that difference is the whole reason a screen reads as groups rather than a list of equal parts. |


### `Field`

A quiet label above the value it names — the vertical sibling of FactRow.

| | |
| --- | --- |
| **Used by** | — (0 usages) |
| **Required variants** | `none` |
| **Required interactions** | none |
| **Accessibility** | Label and value adjacent in reading order. |
| **Motion** | None. |
| **RTL** | Direction-neutral. |
| **Responsive** | Used where the value is prose, so it wraps rather than truncating. |
| **Implementation constraints** | Chosen over FactRow when the value is a medicine name rather than a figure: a long Arabic name set beside its label wraps under it and stops looking like an answer. |


### `Chip`

One option in a set where the options are worded rather than numbered — D09's three urgency windows.

| | |
| --- | --- |
| **Used by** | ConfirmScreen (1 usages) |
| **Required variants** | `selected`, `unselected`, `with an explanatory line` |
| **Required interactions** | press |
| **Accessibility** | radio role with selected state; the spoken label carries the window AND its explanation, so the choice is audible in full. |
| **Motion** | None. No selection transition is specified. |
| **RTL** | Text leading-aligned. |
| **Responsive** | Full-width; a long window label must not truncate at 320pt. |
| **Implementation constraints** | Selection is carried by a 2pt border and an accent label — never by fill weight, so no option is nudged. |


### `StepButton`

One step of a quantity, up or down.

| | |
| --- | --- |
| **Used by** | DraftScreen (1 usages) |
| **Required variants** | `up`, `down` |
| **Required interactions** | press; repeat-press (no acceleration specified) |
| **Accessibility** | The spoken label names the MEDICINE, because 'زيادة' alone is meaningless when three rows offer it. |
| **Motion** | None. No feedback distinguishes a registered press from an ignored one. |
| **RTL** | Direction-neutral glyphs. |
| **Responsive** | Fixed 44pt square at every size. |
| **Implementation constraints** | 44pt is the floor, not a decoration: this is pressed repeatedly, with a thumb, by someone in a hurry. |


### `Dial`

A window of time, drawn as a ring with the remaining figure inside it.

| | |
| --- | --- |
| **Used by** | WaitingScreen (1 usages) |
| **Required variants** | `any fraction 0..1, clamped` |
| **Required interactions** | none |
| **Accessibility** | progressbar role carrying the fraction as a percentage, so the arc is never the only thing conveying it. The figure inside is the remaining minutes. |
| **Motion** | The arc does not animate; it redraws on each render. The delivery does not specify a sweep. |
| **RTL** | Direction-neutral. The arc sweeps from the top in both schemes. |
| **Responsive** | Fixed 64pt at every width, as delivered. |
| **Implementation constraints** | The delivery draws this with a conic gradient, which React Native cannot express. Two clipped, rotated half-discs produce the same arc from platform primitives — no new dependency. A ring rather than a bar because nothing is being COMPLETED here: time is passing while several pharmacies decide. |


### `ProgressBar`

How far along something is, as a bar rather than a spinner.

| | |
| --- | --- |
| **Used by** | — (0 usages) |
| **Required variants** | `any fraction, clamped to 0..1` |
| **Required interactions** | none |
| **Accessibility** | progressbar role carrying a percentage, so the shape is never the only thing conveying the information. |
| **Motion** | The fill does not animate; it jumps on each re-render. |
| **RTL** | The fill grows from the leading edge. |
| **Responsive** | Full-width. |
| **Implementation constraints** | A spinner says 'working' and tells a patient nothing about how much longer. The delivery replaces this with a conic ring on R7 — see the fidelity report. |


### `PhotoFrame`

Where a captured photograph goes.

| | |
| --- | --- |
| **Used by** | PrescriptionScreen (1 usages) |
| **Required variants** | `empty frame (the only state that exists)` |
| **Required interactions** | none — tap-to-enlarge is not built |
| **Accessibility** | image role with a label; there is no alternative text for a real photograph because there are no real photographs. |
| **Motion** | None. |
| **RTL** | Direction-neutral. |
| **Responsive** | Fixed height at every size. |
| **Implementation constraints** | Renders a labelled frame rather than a stand-in image, because the review gallery must never show a picture the app has not taken. Blocked on TD-9. |


### `SearchField`

The one text input in the patient app.

| | |
| --- | --- |
| **Used by** | FindScreen (1 usages) |
| **Required variants** | `empty`, `with a query` |
| **Required interactions** | type; clear (not implemented) |
| **Accessibility** | Explicit label; placeholder is not relied on as the name. |
| **Motion** | None. |
| **RTL** | Text and placeholder run right-to-left; a Latin drug name typed into it is not isolated, which is an open defect. |
| **Responsive** | Fills the sticky slot at every size. |
| **Implementation constraints** | 48pt minimum — the patient primary height, because this is the control a frightened person types a drug name into. No focus, error or disabled state is designed. |


### `Screen`

The frame every screen renders through. It is the reason no screen can ship without answering 'where am I' and 'how do I go back'.

| | |
| --- | --- |
| **Used by** | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen (17 usages) |
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
| **Used by** | ConfirmScreen, DraftScreen, OfferDetailScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen (20 usages) |
| **Required variants** | `default`, `disabled`, `busy` |
| **Required interactions** | press; long-press (not specified); disabled press (no-op, but the reason must be visible) |
| **Accessibility** | accessibilityState carries disabled and busy. A disabled primary MUST have a visible explanation near it — the build checks that something readable is on screen. |
| **Motion** | No press animation exists. errorShake is implemented and drives the field-level Shake on E5 and E6; a primary itself does not move on press. |
| **RTL** | Label centres; no directional content. |
| **Responsive** | Full-width in the footer. Must hold a long Arabic label at 200% text without truncating — 'أرسله أول ما يرجع الاتصال' is the longest today. |
| **Implementation constraints** | 48pt tall, above the 44pt floor, because §25 raises the patient primary specifically. |


### `Secondary`

Never competes with the primary: no fill, no accent background.

| | |
| --- | --- |
| **Used by** | DraftScreen, FindScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen (15 usages) |
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
| **Used by** | FindScreen, OffersScreen (3 usages) |
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
| **Used by** | FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen (12 usages) |
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
| **Used by** | ConfirmScreen, DraftScreen, FindScreen, OfferDetailScreen, OffersScreen, PrescriptionScreen, ReservationScreen, TodayScreen, WaitingScreen, WhyNumberScreen (137 usages) |
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
| **Used by** | ConfirmScreen, DraftScreen, ReservationScreen, TodayScreen (5 usages) |
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
| **Used by** | DraftScreen, FindScreen, OfferDetailScreen (5 usages) |
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
| **TabBar (icons, badges)** | the six destinations this build has no root for | TabBar exists and the frame draws it from the view, so «اليوم» and «ابحث» are reachable from each other for the first time. What is NOT designed: an ICON set — the tabs are words, because the only glyph in this product is the header's «‹» and two invented pictograms would be two things to learn — and a badge, so `inbox` still cannot show pending work. The other six destinations have no built root to be a tab of. |
| **Sheet / modal chrome** | R1, R4, R5, R7 (destination: modal) | Modals render as full screens; the 'temporary and layered above' signal is absent. |
| **TextField (states)** | F1/F2 search, and 28 form screens in Entry and Account | SearchField exists as a real component, but no focus, error or disabled state is designed — so 28 form screens still have nothing to build against. |
| **PhotoViewer** | R3 | PhotoFrame renders a labelled frame, deliberately, because no photograph is ever captured (TD-9). Nothing displays, zooms or retakes a real image. |
| **DestructiveConfirm** | V5, and the 'two-step' Blueprint state kind | The first destructive action will invent its own pattern. |
| **Toast / transient confirmation** | the undoDwell motion token (4000ms) | The token has nothing to animate. |
| **Badge** | the inbox destination | Nothing can show pending work. |
| **FocusRing** | accessibility | Assistive input hardware is unusable — nothing renders focus. |
| **PullToRefresh** | every cached list | Not implemented, no specification. |
