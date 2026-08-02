# Dawai — Design Handoff Requirements

**From:** Engineering
**To:** UI/UX Design
**Status of the build:** patient core loop complete end to end; 18 of 133 Blueprint screens contracted; 28 screen states rendered and audited; 636 tests passing; **not shippable** (see the release-readiness section of `review/index.html`).

---

## 0. What this document is, and what it is not

This is not a design brief and it is not a style guide. It is the list of things
Engineering **cannot proceed without**, derived by inspecting the repository:
the frozen Blueprint v3, the screen contracts, every reducer, every component,
every audit rule, the navigation graph, the technical-debt register and the
review dashboard.

Two things follow from that.

**Every requirement here has a WHY and a consequence.** If a requirement is not
delivered, this document says exactly what Engineering will be forced to do
instead — which is always the same thing: guess. Everything currently guessed
is listed in §2, and each guess is now a numbered design requirement.

**Some things are not open to design.** Blueprint v3 is frozen. Screen
purposes, primary actions, back behaviour, the set of states, exits, refusal
semantics and the clinical rules are product decisions already made and already
implemented. The designer owns how all of it *looks and feels*. A design that
changes what a screen *does* is a Blueprint amendment — raise it, don't absorb
it. §8 lists the specific things that are frozen.

**The success condition:** after these deliverables land, Engineering never
again invents a colour, a spacing value, a type size, an icon, a layout, an
animation, or a visual behaviour. Today it invents all six, every slice.

---

## 1. What already exists (do not redesign from zero)

The design system is **not** empty. A designer starting from a blank Figma
would throw away decisions that are already enforced in code by automated
checks, and the build would then fail those checks.

| Already fixed in code | Where | Enforcement |
| --- | --- | --- |
| 15 semantic colour roles × light/dark × 3 personas | `packages/design/src/tokens/color.ts` | 14 contrast pairs measured in both schemes every build |
| 4pt spacing scale, 11 steps (0–64) | `tokens/space.ts` | no value outside the scale exists |
| 5 radius tokens (8/12/16/22/999) | `tokens/space.ts` | — |
| 3 tap-target floors (44 / 48 / 56) | `tokens/space.ts` | every control on every screen state is measured |
| 5 type roles with size, line-height, weight, and a `clinicalAllowed` flag | `tokens/type.ts` | `caption` and `display` are barred from clinical content by type |
| Letter-spacing is **always 0** | `tokens/type.ts` | Arabic is connected; tracking breaks the joins |
| 8 motion tokens with durations and what each one teaches | `tokens/motion.ts` | declared, **never applied** — see R-14 |
| RTL as the app direction; logical edges only | `rtl.ts` | `row-reverse` and physical `left:`/`right:` are build failures |
| One numeral system per surface | `rtl.ts` + `ui/kit.tsx` | checked on every rendered state |

**Requirement R-0 — Adopt these tokens as the starting point.**
*Why:* they are enforced by `npm run check`; a design using a 5pt gap or a 15px
type size cannot be built without disabling a check that exists to prevent
inconsistency.
*If missing:* every screen becomes a negotiation between the design file and
the linter, and the linter loses first.

The designer **may** propose changing any token value. That is a normal
conversation. What the designer may not do is work outside the *shape* of the
system — semantic roles rather than hexes, a fixed scale rather than free
values.

---

## 2. Where the implementation is currently guessing

This is the most important section. Everything below is a visual decision
Engineering made **because no specification existed**. Each is now a design
requirement. Each is currently visible in `review/index.html`, so the designer
can see exactly what is being replaced.

### 2.1 Iconography — nothing exists at all

The repository contains **zero** icon assets. `find apps packages -name "*.svg"`
returns nothing. Every icon in the product today is a **text character** picked
by an engineer:

| Where | Current glyph | File |
| --- | --- | --- |
| Back affordance, every screen header | `‹` (U+2039) | `ui/kit.tsx:347` |
| "Add to request" affordance on every result row | `+` | `ui/kit.tsx:146` |
| Search field leading affordance | `⌕` (U+2315) | `FindScreen.tsx:63` |
| Quantity stepper | `+` and `−` | `DraftScreen.tsx` |
| Metadata separator, used in 6 places | `·` | multiple |
| Legibility checklist bullets on R3 | `·` | `PrescriptionScreen.tsx:124` |

**Requirement R-1 — A complete icon set, as SVG, with a named inventory.**
*Why:* `⌕` renders as a tiny hairline magnifier in the system fallback font and
reads as a typo. `‹` is a punctuation mark being used as navigation chrome. On
a low-end Android with a different fallback font, all of these change shape
without warning.
*If missing:* the app ships with punctuation marks as its interface, and every
device renders them differently.
*See `ASSET_CHECKLIST.md` for the full list of icons required.*

### 2.2 Typography — the named fonts are not bundled

`tokens/type.ts` declares `IBM Plex Sans Arabic`, `IBM Plex Sans` and
`IBM Plex Mono`. **No font file exists in the repository.** Every screenshot in
the review dashboard is rendered in a system fallback — which is why the
reservation code `4K D2 P9` appears in a serif face on V2, and why Latin drug
names sit at a different weight from the Arabic around them.

**Requirement R-2 — Licensed font files, or a decision to use a system stack.**
Required: the Arabic family (regular 400, medium 500, semibold 600, bold 700),
the Latin family used for drug names and codes, and a **tabular-figures** face
for countdowns, prices and quantities.
*Why:* §27 requires digits that do not change width — a countdown attached to a
patient's anxiety must not visibly jitter. That is a property of the font file,
not of CSS.
*If missing:* Engineering ships whatever the OS provides, the countdown jitters,
and Arabic/Latin mixed lines look broken on exactly the screens that matter most.

### 2.3 Elevation and shadow — a token exists and is never used

`tokens/space.ts` exports `elevation = { flat, raised, overlay, sheet, alert }`.
A grep for `elevation` or `shadow` across all `.tsx` files returns **zero
usages**. Every surface in the product is currently separated by a 1px border
and a background colour, because no shadow specification exists.

**Requirement R-3 — Elevation specification for all five levels, in both schemes.**
Needed per level: shadow colour, opacity, blur, spread, y-offset, and the
border treatment (if any) that replaces or accompanies it in dark mode.
*Why:* five elevation levels are declared in the design system and five are
unspecified. The modal sheets (R1, R4, R5, R7 are all `destination: modal`) are
currently indistinguishable from full screens.
*If missing:* modals continue to look like pushed screens, and the user loses
the "this is temporary and layered above" signal that motion token
`sheetPresent` explicitly says it exists to teach.

### 2.4 Border widths — hardcoded, no token

Border widths of `1` and `2` appear as literals in 7 places. There is no
border-width token, and `2` is used on the consent card to signal "answered"
(`OfferDetailScreen.tsx:126`) — a semantic use of an unspecified value.

**Requirement R-4 — A border-width scale, and a rule for what each width means.**
*If missing:* the difference between a resting card and a decided consent card
remains an engineer's guess about 1px versus 2px.

### 2.5 Four colour roles are declared and never used

`success`, `onSuccess`, `onWarning` and `onAlert` have **zero usages** in the
patient app. Success states currently borrow `accent`. There is no visual
language for "this went right" that is distinct from "this is the brand colour".

**Requirement R-5 — Either specify where `success` is used and how it differs
from `accent`, or confirm the role should be removed.**
*Why:* V2 (a confirmed reservation) and the `success` state treatment in
`ScreenContract` both plausibly want it. Right now a confirmed hold and a
primary button are the same green.
*If missing:* the most important positive moment in the product — "the pharmacy
is holding your medicine" — looks identical to an ordinary button.

### 2.6 Every layout dimension in the shared kit was invented

| Element | Current value | Invented in |
| --- | --- | --- |
| Skeleton loader | 3 bars, 48pt tall, 12pt gap | `ui/kit.tsx` StateBlock |
| Progress / countdown bar | 8pt tall, pill radius | `kit.tsx`, `ReservationScreen` |
| Add affordance circle | 32pt diameter, accent fill | `kit.tsx` ActionCard |
| Reservation code panel | 32pt padding, `radius.xl`, centred | `ReservationScreen` |
| Prescription photo frame | 192pt tall grey box | `PrescriptionScreen` |
| Header | title + optional progress caption, 44pt back hit-area | `kit.tsx` Screen |
| Footer | 1px top border, `surfaceRaised`, 16pt + 24pt bottom padding | `kit.tsx` Screen |
| Empty state | vertically centred, `title` type role | `kit.tsx` StateBlock |

**Requirement R-6 — Specify each of these as a component, with measurements.**
*Why:* these are the eight things a user actually looks at. All eight are
currently an engineer's arithmetic.
*If missing:* they stay as they are, and every new screen copies the guess.

### 2.7 The countdown urgency thresholds are a presentation invention

`model/reservation.ts` classifies a hold as `comfortable`, `soon` or `last` at
**>34% remaining**, **≤34%**, and **≤10 minutes**. The screen maps those to
`accent`, `warning`, `alert`. Nothing in Blueprint v3 fixes these thresholds —
the code comment says so explicitly: *"They are presentation only."*

**Requirement R-7 — Confirm or replace the urgency thresholds and their colours.**
*Why:* this is the moment a patient decides whether to walk or hurry. The
boundary between calm and urgent is a design decision that is currently a
number an engineer chose.
*If missing:* a patient with 35% of a two-hour hold sees calm green; at 33% they
see amber, for no reason anyone can explain.

### 2.8 No tab bar exists

The screen contracts declare eight destinations: `today`, `find`, `me`,
`inbox`, `holds`, `branch`, `modal`, `entry`. **There is no tab bar component.**
Screens declare which destination they belong to and nothing renders it.

**Requirement R-8 — Design the tab bar: which destinations are tabs, their
icons, labels, selected/unselected states, badge treatment, and its behaviour
when a modal is presented.**
*Why:* `back: { kind: "none" }` on S1 and F1 means "root of a tab — the OS
gesture exits the app". That contract is currently a lie: there are no tabs.
*If missing:* the app has no top-level navigation and the patient cannot reach
Today, Find or Me at all.

### 2.9 Motion is declared and entirely unapplied

Eight motion tokens exist with durations and a stated purpose each
(`screenPush` 350ms, `sheetPresent` 300ms, `skeletonToReal` 150ms,
`responderArrive` 200ms, `errorShake` 200ms, `undoDwell` 4000ms, `doseConfirmed`
250ms, `sheetDrag` follows the finger). **Not one transition is implemented.**
Every state change in the product is instant.

**Requirement R-9 — Motion specifications for each declared token: the
property animated, the easing curve as cubic-bézier values, and the reduced-motion
fallback.**
*Why:* `sheetDrag` is documented as "follows the finger 1:1" — that is an
interaction specification with no visual definition. `responderArrive` is meant
to teach "someone answered, just now", which is the emotional peak of the whole
product and currently a list that silently grows by one row.
*If missing:* the app reads as a series of jumps. This is registered as **TD-3,
high priority**, and is the single largest remaining gap against "feels native".

### 2.10 Dark mode has never been rendered

The dark palette exists and its contrast is measured every build. **No dark-mode
screenshot has ever been taken.** All 28 rendered states are light.

**Requirement R-10 — Dark-mode designs for every state, or an explicit decision
to ship light-only in Phase 0.**
*Why:* the palette is real and `useColorScheme()` is wired, so the app *will*
render dark on a device set to dark — in a configuration nobody has ever looked at.
*If missing:* half the users see an unreviewed product.

### 2.11 One screen renders a placeholder that must be replaced

R3 (`شوف الصورة`) renders a grey 192pt box labelled "صورة الوصفة" **instead of
the photograph**, because no photo-viewer design exists. The comment in the code
says so: *"A placeholder frame is rendered here rather than a fake image."*

**Requirement R-11 — Design the prescription photo viewer:** aspect handling for
an arbitrary phone photo, zoom/pan affordance if any, retake affordance, and how
the legibility checklist sits beside it.
*Why:* R3's entire purpose is the patient judging whether a photo is readable.
They currently cannot see the photo.
*If missing:* the prescription flow is undeliverable.

---

## 3. States that must be designed

The application implements **six** state treatments, each with a contract-level
definition. These are not decoration — `tools/ux-check.mjs` fails the build if a
screen declares a state the Blueprint requires and has no treatment for it.

| Treatment | Contract requires | Currently |
| --- | --- | --- |
| `loading` | a skeleton whose shape matches the content that is coming | 3 grey bars |
| `empty` | an explanation **and** — for the teaching variant — one action. Has an `isSuccess` flag: S1 alone has two empties with opposite meanings | centred title text |
| `error` | what failed, whether the user's work survived, and exactly one thing to press | alert-coloured headline + caption |
| `offline` | whether the content is read-only, and its **age** | sunken panel with a relative time |
| `permissionRefused` | must remain usable, and must name the alternative | centred headline |
| `success` | an optional next step | **never rendered — no design, no usage** |

**Requirement R-12 — A visual specification for all six, including the two
distinct empty variants.**
*Why:* §22 of the Blueprint says the empty state is the highest-attention moment
in the product. S1's two empties are a brand-new account that must be *taught*
and a well-managed patient having a *quiet day* — the same component with
opposite emotional targets.
*If missing:* they stay as text on a background, which is what "no data" looks
like, which is what §22 exists to prevent.

**Requirement R-13 — A skeleton specification per screen archetype** (list,
detail, form), matching the real content's shape.
*Why:* the motion token `skeletonToReal` (150ms) has nothing to animate from.
*If missing:* the page jumps when data arrives.

**The full state list per screen is in `SCREEN_INVENTORY.md`.** Across the 133
Blueprint screens the vocabulary is: `loading`, `empty`, `quiet`, `error`,
`offline`, `stale`, `expired`, `expiring`, `refused`, `closed`, `paused`,
`permission-refused`, `no-match`, `mismatch`, `rate-limited`, `two-step`, and
`per reason`. **Seven of these have no treatment defined anywhere** — `stale`,
`expiring`, `closed`, `paused`, `mismatch`, `rate-limited` and `two-step`.

**Requirement R-14 — Define a treatment for the seven undefined state kinds.**
*If missing:* the first screen that needs `two-step` (V5, cancel reservation —
a destructive confirmation) will have its confirmation pattern invented by an
engineer.

---

## 4. Interactions that need visual treatment

Derived from the reducers and the rendered tree. Each of these is behaviour that
**already exists in code** and currently has no visual definition.

| Interaction | Where | What is missing |
| --- | --- | --- |
| Pressed / hover / focus on every control | all | **no pressed state exists at all** — nothing changes on touch |
| Disabled primary | R1, R6, R9 | currently a grey fill; no specification |
| Busy primary (in-flight send) | R6 | a bare spinner; no specification |
| Card as a tap target | F2, R8 | the whole card is pressable; no press feedback |
| Quantity stepper at its floor | R1 | at 1 pack, "−" removes the line — undocumented visually |
| Consent choice selected/unselected | R9 | equal-weight outline, 2px when chosen |
| Offer that withdrew between render and tap | R8 | greyed card |
| An offer arriving into a live list | R7→R8 | **nothing** — the list grows silently |
| Countdown crossing an urgency band | V2 | colour swap, no transition |
| Pull-to-refresh | — | **not implemented anywhere**; no spec |
| Keyboard appearing over the search field | F1/F2 | **unhandled** |
| Text selection / long-press on the reservation code | V2 | undefined; the code must be copyable |

**Requirement R-15 — A press/focus/disabled/busy specification for every
interactive component.**
*Why:* there is currently **no touch feedback anywhere in the product**. A tap
either navigates or appears to do nothing.
*If missing:* the app feels broken on the first tap, before any content loads.

**Requirement R-16 — Specify the arrival of a new offer** (motion token
`responderArrive`, 200ms, "someone answered, just now").
*Why:* it is the moment the product delivers its promise.
*If missing:* the most important event in the app is a silent row insertion.

---

## 5. Accessibility requirements that need visual support

The build already enforces: a 44pt minimum tap target on every control in every
rendered state; an accessible label on every control; measured WCAG contrast on
14 pairs in both schemes; one numeral system per surface; `accessibilityRole`
and `accessibilityState` on every button, radio and progress element.

What is **not** covered and needs design:

**Requirement R-17 — A visible focus indicator.**
*Why:* nothing in the product renders focus. A patient using an external
keyboard or a switch control cannot see where they are.
*If missing:* the app is unusable with assistive input hardware.

**Requirement R-18 — Text-scaling behaviour up to 200%.**
Every screen must be specified at the largest supported text size, particularly
R8 (offer rows carry six lines of metadata) and V2 (the reservation code is
already the largest element on the screen).
*Why:* the target users include elderly patients who run large text as default.
*If missing:* the reservation code overflows on the screen the Blueprint says
must never fail.

**Requirement R-19 — A non-colour signal for every state that currently uses
colour alone.** Specifically: the countdown urgency bands (`accent`/`warning`/
`alert`), the offer coverage indicator, and the consent decision state.
*Why:* red/green colour blindness is common, and the countdown urgency is
currently *only* a hue change.
*If missing:* a colour-blind patient cannot tell a comfortable hold from an
expiring one.

**Requirement R-20 — Contrast for the four unused colour roles** if R-5 keeps
them. Any new colour must pass 4.5:1 body / 3.0:1 boundary in **both** schemes,
because the contrast test measures every declared pair and fails the build.

---

## 6. Responsive and platform requirements

Every screenshot in the review is **390 × 844** (iPhone 14). That is the only
viewport ever tested. The layout check fails on horizontal overflow at that
width and no other.

**Requirement R-21 — Layouts specified at three widths: 320pt, 360pt, 430pt.**
*Why:* the target market is Iraq, where low-cost Android devices at 360pt
logical width are common and 320pt still exists. R8's offer row currently
carries a branch name, a distance, a coverage line, a missing-items line, a
price and up to three status captions — at 320pt this will wrap badly and no one
has looked.
*If missing:* the app is designed for a phone most of its users do not own.

**Requirement R-22 — Safe-area specification** for notch, home indicator and
Android navigation bars.
*Why:* the footer is currently `padding: 16 + 24pt bottom` — a number chosen to
approximate a home indicator. It is not derived from an inset.
*If missing:* the primary action sits under the home indicator on some devices
and floats on others.

**Requirement R-23 — Landscape: support it or explicitly refuse it.**
*Why:* nothing in the code handles orientation. An unstated decision is still a
decision, made by whoever writes the manifest.

---

## 7. Assets that must be exported

Summarised here; the full list with sizes and formats is in `ASSET_CHECKLIST.md`.

- **App icon** — every iOS and Android size. **Does not exist.** Blocks any
  store submission and any device build.
- **Splash / launch screen** — E1 "Launch" is a Blueprint screen with a
  `loading` state and no design.
- **Notification icon** (Android monochrome) — the product's core promise is a
  notification when a pharmacy answers.
- **The icon set** from R-1.
- **Empty-state and error illustrations, if any.** Currently none exist and
  every empty state is text. This is a legitimate design choice either way, but
  it must be *made*: §22 calls the empty state the highest-attention moment in
  the product.
- **Font files** from R-2.

---

## 8. What is frozen — design may not change these without a Blueprint amendment

The designer owns all appearance. These are behaviour, and they are already
implemented and machine-checked:

1. **One primary action per screen.** Counted from the rendered tree on every
   registered state; more than one filled accent control fails the build.
2. **Back behaviour per screen** (`pop` / `dismiss` / `replace` / `none`), and
   the reason each was chosen. V1 is deliberately un-poppable because a hold
   request is in flight.
3. **The set of states each screen has.** Adding a state is a Blueprint change;
   dropping one fails `ux-check`.
4. **Exits.** A screen's destinations come from its contract. The navigation
   graph is derived, and unreachable screens and traps fail the build.
5. **Refusal semantics.** 31 refusal codes; a missing record and a forbidden one
   are deliberately byte-identical so no screen becomes an identity oracle.
6. **Clinical rules.** Controlled items are refused on the row before the tap
   (D42). Prescription items cannot be sent without a photo (D18). Substitution
   consent is explicit, per line, and never pre-ticked (§4 R10).
7. **No ranking of offers** (D12). The order is coverage then price, both
   printed on the row, and the screen says so. A design that visually elevates
   one pharmacy — a badge, a highlight, a "recommended" ribbon — breaks this.
8. **Reliability is a band, never a number** (D11).
9. **A queued request is never presented as sent** (D27).
10. **Prices are exact.** Rounding was a shipped defect; it is now tested.

---

## 9. Priority checklist

### Priority 0 — Blocking Engineering *(work stops without these)*

| # | Requirement | Blocks |
| --- | --- | --- |
| R-1 | Icon set as SVG, named inventory | Every screen. Text glyphs are shipping today. |
| R-8 | Tab bar design | Top-level navigation does not exist. S1/F1 contracts are currently unfulfillable. |
| R-15 | Press / focus / disabled / busy states | No touch feedback exists anywhere. |
| R-11 | Prescription photo viewer | R3 renders a grey box instead of the photograph. |
| R-2 | Font files or a system-stack decision | Countdown jitter; Arabic/Latin weight mismatch. |

### Priority 1 — Required before implementation of the next slice

| # | Requirement | Blocks |
| --- | --- | --- |
| R-12 | The six state treatments, incl. both empty variants | Every screen state added from now on. |
| R-6 | The eight invented layout components, with measurements | Every new screen copies the current guess. |
| R-3 | Elevation for all five levels | Modals are indistinguishable from screens. |
| R-9 | Motion specs with easing curves and reduced-motion | TD-3. The app reads as jumps. |
| R-21 | Layouts at 320 / 360 / 430pt | The Iraqi device reality is untested. |
| R-22 | Safe-area specification | The primary action's position is guessed. |

### Priority 2 — Required before production

| # | Requirement |
| --- | --- |
| R-10 | Dark mode for every state, or an explicit light-only decision |
| R-17 | Visible focus indicator |
| R-18 | Text scaling to 200%, especially R8 and V2 |
| R-19 | Non-colour signals for the countdown, coverage and consent states |
| R-14 | Treatments for the seven undefined Blueprint state kinds |
| R-7 | Countdown urgency thresholds confirmed or replaced |
| App icon, splash, notification icon (see `ASSET_CHECKLIST.md`) |  |
| R-23 | Landscape supported or explicitly refused |

### Priority 3 — Polish

| # | Requirement |
| --- | --- |
| R-4 | Border-width scale with semantics |
| R-5 | `success` role defined or removed |
| R-13 | Per-archetype skeletons |
| R-16 | New-offer arrival animation |
| R-20 | Contrast for any newly introduced role |
| Empty-state illustrations, if the answer is illustrations |  |

---

## 10. How Engineering will consume the design

1. Tokens land first, as values in `packages/design/src/tokens/*`. The contrast
   test runs against them immediately; a failing pair is a design bug, reported
   back with the measured ratio.
2. Components land in `apps/patient/src/ui/kit.tsx`. Every component is
   automatically audited against the product rules the moment it is used by a
   registered screen state.
3. Screens are re-rendered into `review/index.html`, and the visual-regression
   step lists every changed screenshot. **Design review happens against the
   regenerated dashboard, not against a Figma export**, because the dashboard
   shows what the code actually produces.
4. Anything the design does not specify is escalated as a question, not filled
   in by an engineer. That is the entire point of this document.

**Definition of done for the handoff:** `DESIGN_QA_CHECKLIST.md` passes in full.
