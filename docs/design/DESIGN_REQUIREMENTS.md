# Dawai (دوائي) — Design Requirements Package

**Audience:** UI/UX Designer producing the Figma design system and screens for Dawai.
**Not the audience:** Engineers. This is not code documentation.

**Purpose:** This document tells the designer exactly what must exist inside the Figma
files before engineering can build from them without guessing. It contains **no new
colors, no new typography, no new layouts of my own invention** — every requirement
below is either (a) something the existing product blueprint already specifies and the
designer must honor, (b) something the existing code already encodes as a contract and
the designer must honor or formally supersede, or (c) an open gap where engineering
would otherwise have to guess, flagged explicitly as a decision the designer must make.

**Correction note:** an earlier draft of this document was written against the wrong
product (Adlytic, a marketing dashboard also present in this repo). This version is
about **Dawai**, the pharmacy/medicine-discovery-and-reservation product.

---

## 0. What already exists — read this before designing anything

Dawai's repo contains **four layers of prior work at very different levels of
authority**. The designer needs to know which layer wins when they disagree, because
they currently do disagree with each other in several places.

1. **The written product specification** — `docs/product/DAWAI_PRODUCT_BLUEPRINT.md`
   (v1) is explicitly marked superseded by `docs/product/v3/blueprint-v3.html` ("v3
   wins where they disagree"). Both must be read by the designer. v1 contains the
   product's terminology, personas, screen inventory (197 screens), flows, and a
   product-level design-system chapter (§25–27) that predates and partially
   contradicts the code-level tokens below. **The designer's first task is to read v3
   and confirm with the product owner which chapters of v1's §25–27 design-system
   language still apply** — do not silently take v1 as final.

2. **A code-enforced design-token and contract system** —
   `platform/packages/design/src/{tokens/color.ts, tokens/type.ts, tokens/space.ts,
   tokens/motion.ts, rtl.ts, a11y.ts, ux/contract.ts}`. This is real, tested,
   type-checked TypeScript that already defines exact colors, a type scale, a spacing
   scale, a motion catalogue, RTL rules, and a per-screen UX contract schema (see §1–§9
   below — every value is quoted from this code, not invented). **This is the strongest
   available source of truth for tokens** because it's the only layer that's
   machine-verified (contrast checks, contract audits, tests). Treat it as the design
   system's current canonical state, subject to the designer's revision — not as
   something to ignore in favor of a nicer-looking mockup.

3. **Four mutually-inconsistent static HTML concept mockups** —
   `dawai-ui-preview.html`, `dawai-developed.html` (repo root), plus further variants
   in `dawai-site/` (`classic.html`, `dawai-ui-kit.html`, `index.html`/`next.html`).
   These use *different color palettes, different fonts, and different information
   architecture for the same screens* (e.g. two different "welcome" screens). They are
   **design exploration artifacts, not an approved system** — do not treat any single
   one of them as ground truth. The designer's job includes explicitly resolving which
   ideas from which mockup (if any) carry forward, and retiring the rest.

4. **A real, tested, substantially-complete full-stack app** — `dawai-platform/`
   (Express server + Postgres + React SPA with 26 real routes across patient/pharmacy/
   admin). Its actual rendered pages (`dawai-platform/src/pages/*.tsx`) have **not been
   visually reconciled with any of the mockups in layer 3** — this app is currently
   running on ad hoc styling, not a designed system. This is the app the design system
   must ultimately be applied to.

**A packaging fact the designer must know:** `dawai-manifest.webmanifest`'s
`start_url` currently points at `dawai-ui-preview.html` — the installable PWA opens a
static mockup, not the real app. This is a product/engineering decision to fix, not a
design one, but the designer should know that the "canonical-looking" file a
stakeholder might open on their phone is not actually the product.

---

## 1. Product Context the Designer Must Design Against

*(Summarized from the blueprint — restated here because every design decision below
depends on it. If v3 changes any of this, the designer must get the updated version
before proceeding.)*

- **One-line pitch:** Dawai tells you which nearby pharmacy has your medicine, and
  holds it for you.
- **What it is not** (do not design toward these, even if they seem like natural
  extensions): a delivery service, a payment platform, a diagnosis tool, a dose
  calculator, a pharmacy ERP, a telemedicine service, or a prescription issuer.
- **The single most important distinction in the product**, which must be
  visually distinct everywhere it appears: **an Offer commits nothing; a Reservation
  starts a clock.** If a screen shows an offer and a reservation with the same visual
  weight, that is a defect.
- **Three user populations with three different design personas** (already named and
  color-scoped in code — see §2): **Patient** ("calm"), **Pharmacy** ("fast, one-handed,
  at speed, behind a counter"), **Owner/Admin** ("certain, neutral, tabular/dense-data").
  These are not just role-based color themes — the blueprint states pharmacy users are
  frequently operating one-handed at speed, and patient users are frequently elderly,
  low-vision, or have a tremor. Every pharmacy-facing screen needs a distinctly larger
  primary touch target than patient screens (see §6).
- **Core terminology the designer must use verbatim in every screen/label/annotation**
  (Arabic-first; do not invent alternate phrasing):

  | Concept | Arabic | Note |
  |---|---|---|
  | Subject (whose medicine) | الشخص | |
  | Medicine (catalogue entry) | الدواء | |
  | Medication (a subject's specific med) | دوائي | |
  | Schedule | المواعيد | |
  | Dose event | الجرعة | |
  | Request | الطلب | patient broadcasts a need |
  | Offer | العرض | **commits nothing** |
  | Reservation | الحجز | **starts a clock** |
  | Pickup | الاستلام | |
  | Movement (stock change) | حركة مخزون | |
  | Count (physical recount) | جرد | |
  | Grant (family access) | الوصول | |

- **Core loop the flagship interaction design must optimize for:** patient describes a
  need → nearby pharmacies see a request (with limited PII per §4) → pharmacy sends an
  offer → patient compares offers → patient reserves → hold timer starts only after
  pharmacy acknowledgement → patient picks up.
- **Explicit non-features** the designer must not accidentally introduce through
  generic "best practice" UI patterns: no chat between patient and pharmacy, no star
  ratings, no price comparison across the city as a first-class feature, no gamification/
  streaks, no automatic substitution, no symptom checker, no editable stock-quantity
  field (inventory is shown as a computed/derived signal, not a number a pharmacy types
  in — see §10 Blister Strip component).

---

## 2. Color Tokens (current code state — designer to ratify or revise)

`platform/packages/design/src/tokens/color.ts` defines **three persona palettes, each
with light and dark variants**, using an identical semantic role set. This structure —
three personas × two modes, same roles — is the contract the designer should either
keep or explicitly replace; do not design a fourth ad hoc palette for a specific screen.

**Semantic roles (same 15 for every palette):** `surface, surfaceRaised,
surfaceSunken, line, ink, inkMuted, inkSubtle, accent, onAccent, success, onSuccess,
warning, onWarning, alert, onAlert`.

Current values (for the designer's reference — confirm/replace, don't silently drift
from whatever is finally chosen):

- **Patient (persona: calm)** — light: surface `#FBFAF7`, surfaceRaised `#FFFFFF`,
  surfaceSunken `#F2F1EC`, line `#DFDDD3`, ink `#16211D`, inkMuted `#42524C`, inkSubtle
  `#5C6B64`, accent `#186047` (calm mint/green), warning `#7A4E0A`, alert `#8C2F1F`.
  Dark: surface `#0F1513`, ink `#F1F6F4`, accent `#7BD6AC`, warning `#F0BE72`, alert
  `#FF9C8A`.
- **Pharmacy (persona: fast)** — dark-primary: surface `#0B1512`, surfaceRaised
  `#132320`, accent `#A8E85C` (high-contrast lime, deliberately for speed/legibility at
  a glance), onAccent `#0A1703`. Light: surface `#F7F9F7`, accent `#2F5E12`.
- **Owner/Admin (persona: certain)** — light: surface `#FAFAFA`, ink `#151719`, accent
  `#14497D` (functional blue). Dark: surface `#111315`, accent `#8CC2F5`.

A `CONTRACT_PAIRS` list in code enumerates every text/background combination that must
pass automated contrast checking (14 pairs). **The designer must supply the full set of
pairs for any new roles they add, and every pair must be verified against §9's contrast
requirement before handoff — not eyeballed.**

**Known conflict the designer must resolve, not ignore:** the four static HTML mockups
use a completely different, mutually-inconsistent palette from the above and from each
other (`dawai-ui-preview.html`'s forest/mint/coral/amber/blue system; `dawai-developed.html`'s
distinct "lantern" dusk/river/leaf/lantern/ember system; further variants in
`dawai-site/`). **Pick one system.** If the code tokens above are being kept, the
mockups' colors should be treated as discarded exploration, not blended in piecemeal.

One color-specific defect already flagged by an internal audit (`docs/dawai/
BLUEPRINT_EXECUTION.md`) and worth the designer's attention: an amber/urgency color
(`#a76614` in one mockup) measured at 4.08:1 contrast — **failing** the 4.5:1 body-text
threshold — and was corrected to `#7a4a0f` (~5.6:1). Any warning/urgency color the
designer proposes must be checked the same way before it's used for body text.

---

## 3. Typography Tokens (current code state)

`platform/packages/design/src/tokens/type.ts` — a 5-step scale, each step marked
whether it's allowed for clinical content (dosage, schedules, medicine names) or
decorative-only:

| Role | Size | Line-height | Letter-spacing | Weight | Clinical content allowed? |
|---|---|---|---|---|---|
| display | 34 | 1.25 | 0 | 700 | **No** — codes/countdowns/marketing only |
| title | 22 | 1.40 | 0 | 700 | Yes |
| headline | 17 | 1.50 | 0 | 600 | Yes |
| body | 16 | 1.65 | 0 | 400 | Yes |
| caption | 13 | 1.60 | 0 | 500 | **No** — never for clinical information |

**Hard rule, already enforced in code (`assertClinicalRole`) and not negotiable without
an explicit product decision:** dosage, schedule, and medication-identity text must
never render in `display` or `caption` role. If the designer wants an exception,
it must be raised as a product decision, not silently designed around.

**Letter-spacing is always zero, on every role, with no exceptions** — because Arabic
is a connected script; positive/negative tracking breaks letterform joining. This
single rule already caused two real defects (`docs/dawai/BLUEPRINT_EXECUTION.md`
documents an h1 with `letter-spacing:-0.035em` and headings with line-height 1.42 that
were corrected to the values in the table above). The designer must not reintroduce
letter-spacing anywhere in Arabic text.

**Font families — three separate, currently-conflicting answers exist; the designer
must resolve to one:**
- Code (`tokens/type.ts` `fontStack`) says: Arabic body/UI = **IBM Plex Sans Arabic**
  (fallback Noto Sans Arabic), Latin runs = **IBM Plex Sans**, tabular/numeric/codes =
  **IBM Plex Mono**.
- `dawai-ui-preview.html` mockup uses IBM Plex Sans Arabic for body but **Noto Kufi
  Arabic** for headings.
- `dawai-developed.html` mockup uses IBM Plex Sans Arabic for body but **Cairo** for
  headings.

Pick one heading typeface and update all three sources to agree — do not let this stay
a 3-way disagreement into implementation. Whatever is chosen must be self-hostable
(see §14 in the Adlytic-style constraint that also applies here: no external font CDN
in production, per the app's CSP posture — confirm this constraint with engineering,
but design as if it applies).

---

## 4. Spacing, Sizing, Radius, Elevation Tokens (current code state)

From `platform/packages/design/src/tokens/space.ts` — quoted exactly, treat as the
scale to keep or deliberately revise (not a value to drift from ad hoc):

- **Spacing scale (4pt rhythm, 10 steps):** 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Radius scale:** sm 8, md 12, lg 16, xl 22, pill 999.
- **Touch target minimums — three tiers, not one:** general minimum **44pt**,
  patient-primary action **48pt**, **pharmacy-primary action 56pt**. This 56pt tier
  exists specifically because pharmacy staff operate one-handed, at speed, behind a
  counter — the designer must apply it to every primary pharmacy action (accept/decline
  request, send offer, confirm reservation, mark ready), not just decoratively to one
  screen.
- **Elevation scale:** flat 0, raised 1, overlay 2, sheet 3, alert 4 — five named
  levels, each needs a corresponding shadow/visual treatment defined by the designer.

---

## 5. Motion Tokens (current code state — designer must review, not just restyle)

`platform/packages/design/src/tokens/motion.ts` requires every motion entry to declare
what it **teaches the user** — this is enforced by the type system, not just a
comment convention, and the designer should follow the same discipline when proposing
new motion: don't add an animation without being able to state what it communicates.

| Motion | Duration | Easing | What it teaches |
|---|---|---|---|
| screenPush | 350ms | standard | where you are in the hierarchy |
| sheetPresent | 300ms | spring | this is temporary, layered above |
| sheetDrag | 0 (1:1 with finger) | standard | you are in control of it |
| doseConfirmed | 250ms | decelerate | it was recorded |
| skeletonToReal | 150ms | standard | the wait is over |
| responderArrive | 200ms | decelerate | someone answered, just now |
| undoDwell | 4000ms | standard | you still have time |
| errorShake | 200ms | standard | that input, not another |

Blueprint rule: **nothing exceeds 500ms** except a small set of named "signature
moments" (e.g. the Blister Strip depleting animation, ~500ms — see §10). The designer
should treat any animation proposal over 500ms as requiring explicit product sign-off.

`HAPTIC_EVENTS` in code currently ties haptic feedback to: doseConfirmed,
reservationConfirmed, handoverComplete, errorShake — the designer should specify the
haptic pattern (or confirm none) for each.

**`prefers-reduced-motion` is a hard requirement**, already respected in the existing
mockups — the designer must specify, per animation in the table above, what the
reduced-motion fallback is (typically: same state change, no transition), not leave it
implied.

---

## 6. RTL Rules (current code state — read literally, this is unusually strict)

Dawai is **Arabic-only in Phase 0 by explicit product decision**, encoded as a literal
constant in code (`APP_DIRECTION: Direction = "rtl"`, comment: *"the day Kurdish
arrives there is one place to change"*). The designer should design Phase 0 as
RTL-only — do not build a parallel LTR/English design track unless told the product
decision has changed. (Blueprint §29 lists "Do we support Kurdish at launch?" as an
**open, unresolved** product question — if it resolves during the design phase, this
section needs revisiting.)

Required RTL rules, already enforced or flagged in code and must be honored in every
screen the designer produces:

1. **Never-mirror icon list** (already enumerated in code, `NEVER_MIRROR`): play,
   pause, media-controls, clock, timer-face, map-north, route-direction, checkmark,
   logo. Every other directional icon (chevrons, back/forward arrows) must mirror.
   The designer must classify every icon in the icon set (§12) against this rule
   explicitly — don't leave any icon's mirroring behavior implicit.
2. **Numeral system is a per-surface, deliberate choice — never mixed within one
   comparison.** Code supports both Arabic-Indic digits (٠١٢…) and Western digits
   (012) via a formal `formatDigits()` function. The designer must specify, per
   context (prices, countdown timers, dosage numbers, dates), which numeral system
   applies, and never let both appear side-by-side in a single comparative view (e.g.
   two offer cards must use the same numeral system).
3. **Bidirectional isolation is mandatory for every Latin/numeric run inside Arabic
   text** — code has a `needsIsolation()` detector and an `isolate()` helper; the
   existing mockups already wrap every drug name, price, and reference code in
   `<bdi dir="ltr">`. The designer must flag, for every text element in a screen spec,
   whether it contains a mixed Latin/Arabic run requiring isolation (medicine names
   like "Augmentin 625 mg", prices, order codes like "DW-4821").
4. **A specific, previously-real bug the designer must not reintroduce:** pairing a
   *physical* CSS offset (e.g. `left:`) with a *physical* transform on the same
   element broke centering twice in the prototype. Design specs must be expressed in
   **logical terms (start/end, not left/right)** throughout, so engineering
   implements with logical properties consistently.
5. Countdown timers, prep-time minutes, and other "always LTR" numeric displays
   (already implemented this way in the reservation screen) should keep rendering
   left-to-right even inside the RTL page — confirm this as an explicit rule per
   numeric-display component, the same exception pattern used elsewhere in
   RTL products.

---

## 7. The UX Contract System — what every screen spec must include

`platform/packages/design/src/ux/contract.ts` defines a strict, code-enforced shape
for what counts as a *complete* screen specification. The designer's screen specs
(whether in Figma annotations or an accompanying spec sheet) must supply values for
every field this contract requires, because engineering will literally fail a build
if a screen is implemented without them. Required per screen:

- **Location**: a title, and a declared destination in the navigation ({today, find,
  me, inbox, holds, branch, modal, entry}).
- **Back behaviour**: exactly one of pop / dismiss(returnsTo) / replace(with, why) /
  none(why) — the designer must specify which, and for `replace`/`none`, the *why*.
- **Primary action**: exactly one per screen — label, where it leads, and the number
  of taps from screen-entry to outcome (`tapsToOutcome`). A screen with zero or more
  than one primary action fails this contract; if a screen genuinely needs multiple
  equally-weighted actions, that itself is a decision to flag back to product, not
  something to design around silently.
- **State treatments** — for every screen that can be in more than one state, the
  designer must specify, per state:
  - **Loading**
  - **Empty** — must include *what this emptiness means* (`explains`) and *what the
    user can do about it* (`action`), unless the empty state is itself a success
    condition (e.g. "no active reservations" can be a good thing).
  - **Error** — must include *what specifically failed* (`whatFailed`), whether *the
    user's input/work is preserved* (`workPreserved`), and *what they can do next*
    (`action`). A generic "something went wrong" is explicitly rejected by an
    automated check in code (`auditContract` regex-matches and flags this exact
    phrase) — the designer must never propose this copy pattern, and should design
    real, specific error copy for every failure mode.
  - **Offline**
  - **Permission refused**
  - **Success**
- A screen's purpose statement (if the designer writes one per frame) should be one
  sentence — `auditContract` rejects multi-sentence purposes as a smell that the
  screen is doing too much.
- No screen should carry more than 3 secondary actions (also code-enforced) — if a
  screen wants more, that's a signal to split the screen or demote actions into a
  secondary surface (menu, settings), and the designer should flag which.

**Deliverable implication:** for every screen frame in Figma, attach (via dev-mode
annotation or a linked spec sheet) the contract fields above. This is not optional
documentation flavor — it is the literal shape engineering's own tooling checks
screens against.

---

## 8. Product-Specific ("Native") Components

The blueprint (§26) names components specific to this product that generic UI kits
don't provide off the shelf. Each needs a full component spec (all variants/states) in
Figma — do not substitute a generic equivalent without flagging the substitution:

- **Safety layer** — a persistent/dismissible(?) layer surfacing clinical safety
  information (interactions, allergy conflicts). An internal review already flagged
  that in one implementation pass, "the severe safety layer has no dismiss and no
  role can clear it" — the designer must make an explicit decision on dismissibility
  per severity level, not leave it ambiguous.
- **Subject switcher** — lets a user (e.g. Hussein, managing his mother's account)
  switch whose medicine/record they're viewing. Blueprint calls this "a primary
  control, not a setting" — it must be prominent, not buried in a settings menu.
- **Blister strip** — supply/stock shown as a *depleting strip* visual metaphor
  rather than a raw number, explicitly because there is no editable stock-quantity
  field in the data model (inventory is derived from a movement ledger, not typed in
  directly). Called out in the blueprint as **"the product's signature moment"** —
  deserves real design craft and its own ~500ms depletion animation (see §5).
- **Confidence marker** — a visual indicator of how reliable/fresh a piece of
  information is (e.g. "last confirmed" freshness on an offer). An internal audit
  flagged that a "sold since"/reliability score referenced in mockups is never
  formally defined — the designer must specify exactly what data drives this marker
  and how its visual states map to underlying confidence levels.
- **Reservation pass** — the confirmed-hold view (shown to the patient at pickup) —
  needs a design that reads clearly at a glance to both patient and pharmacist,
  including any offline/no-signal fallback state.
- **Live responders** — an indicator that pharmacies are actively viewing/responding
  to a request in real time (seen in the mockup's "live matching radar" concept) —
  needs states for zero responders, some responding, and a timeout/escalation state
  (see the 4-step escalation ladder in §9).
- **Answer bar** — the pharmacy-side quick-reply mechanism for a request (already
  partially implemented in code as `PillBar` / the Attention/PillBar priority system:
  `SEV_ALERT > ACTION_REQUIRED > IN_PROGRESS > SUGGESTION > IDLE`). The designer must
  design all 5 priority states with distinct, unambiguous visual weight — this
  ordering is load-bearing (a pharmacist scanning quickly must be able to tell
  "must act now" from "nice to know" instantly).
- **Count sheet** — the pharmacy-side physical-inventory-recount interface (جرد).

---

## 9. Empty, Error, Escalation, and "Zero Offers" States

This product has an unusually well-specified empty-state ladder that must be designed
exactly, not generically. The blueprint and the existing mockup both describe a
**4-step escalation** when a patient's request gets no valid offers:

1. Wait up to 5 minutes (soft empty state, not yet alarming).
2. Automatically/optionally expand search radius to 5 km.
3. Rarely, expand to 10 km — **requires explicit user consent**, not silent.
4. End and offer to retry later.

The designer must design each of these 4 steps as a distinct visual state of the same
screen (not 4 separate unrelated empty-state illustrations), with clear, calm,
non-alarming copy at each stage — an internal audit already flagged "the trust surface
is too empty" as a critique of an earlier pass; this ladder is the opportunity to fix
that rather than just showing a blank state with a spinner.

Blueprint §17 additionally defines **4 distinct "medicine does not exist" cases** —
the designer must confirm with product what these 4 cases are (not fully detailed in
research covered here) and design a distinct state for each, since a single generic
"not found" screen would under-serve this requirement.

**Reservation expiry** must be designed as its own explicit state (not just the
countdown reaching zero and freezing) — the existing mockup already implements a
countdown timer with an "expired" state that swaps in re-send/home actions; the
designer should formalize this rather than leave it as prototype-only.

---

## 10. Screens & Personas — What Must Be Designed

Per the blueprint's screen inventory (§6), Dawai has **197 specified screens** across
4 shared/entry, 81 patient, 46 pharmacy, and 56 owner/admin screens, each with a
required-states column (E/L/X/O/P/S — empty/loading/error/offline/permission-refused/
success, matching §7's contract). **Confirm with product whether all 197 are in scope
for this design pass, or whether a subset (e.g. the Phase 0 core loop) is the actual
near-term target** — designing 197 fully-stated screens is a large commitment and the
designer should get explicit scope confirmation before starting, rather than assuming
"all of them."

At minimum, the **Phase 0 core loop** (confirmed as implemented end-to-end in
`dawai-platform/`, per its own MVP readiness report) must be fully designed with every
state:

**Patient side:**
- Welcome/landing (role choice: patient vs. pharmacy)
- Find/describe need (text entry, photo-of-package, prescription upload — 3 input
  modes per the existing mockup)
- Active request / waiting for offers (with live-responder indicator)
- Zero-offers escalation ladder (§9, all 4 steps)
- Offers comparison (sort by best-match/nearest/cheapest; each offer card shows
  match-type badge EXACT/PARTIAL, trust chips, price/prep-time/freshness, and the
  explicit "price is not a guess from a catalogue" disclaimer copy)
- Reservation hold (pending-ACK state, active countdown, expired state)
- Reservation pass / pickup instructions
- History / My medicines
- Family/subject switcher
- Account & privacy screens
- Notifications

**Pharmacy side:**
- Pharmacy status toggle (accepting requests / not)
- Request inbox (limited-PII request cards — explicit privacy statement that before a
  pharmacy is chosen, only approximate area + medicine are shown, no name/phone/
  prescription)
- Quick decline with reason chips (OUT_OF_STOCK / NOT_CARRIED / CLOSED_NOW at minimum)
- Offer composition (offer type EXACT/PARTIAL/ORDERABLE/ALTERNATIVE_REVIEW_REQUIRED/
  UNAVAILABLE, price, quantity, prep time, pickup availability, note ≤200 chars,
  required confirmation checkbox affirming price/quantity accuracy and that an offer
  is not a stock reservation)
- Reservations list / fulfillment
- Inventory (Blister Strip component, §8 — never an editable raw quantity)
- Branch/settings
- Support

**Owner/Admin side (currently implemented as an "Admin" route group, not a separate
"Owner" app — confirm with product whether these are meant to be the same thing):**
- Pharmacy verification queue (application intake — **flagged by internal review as
  currently having zero designed screens despite being a required flow**; this is a
  priority gap for the designer to close)
- Pharmacy directory / management
- Requests oversight
- User management
- Reports
- Notifications/settings

Every screen above needs, per §7's contract: desktop and mobile frames (mobile-first,
since the product is phone-first per the blueprint's personas), and every applicable
state (loading/empty/error/offline/permission-refused/success).

---

## 11. Known Gaps the Designer Should Prioritize

An internal independent review (`docs/product/review/INDEPENDENT_REVIEW.md`) already
flagged concrete, unresolved product/design gaps. The designer should treat the
following as open work items requiring either a design or an explicit "raise this back
to product" flag — not silently invented defaults:

1. **No allergy-recording screen exists**, despite 4 roles being granted read-access
   to allergy data in the permission matrix. Needs a screen or an explicit decision
   that allergy data entry is out of scope for this phase.
2. **Zero screens exist for pharmacy application/verification intake** — a pharmacy
   currently has no way to apply. High-priority gap.
3. **The safety layer has no dismiss affordance for the severe tier, for any role** —
   confirm this is intentional (a hard safety stop) rather than an oversight, and
   design it either way explicitly.
4. **Guest state (an unauthenticated browsing state named in the nav map) is
   currently unreachable** in the specified navigation — the designer should confirm
   whether guest browsing is truly in scope and, if so, design the entry point that's
   currently missing.
5. **No screens exist for a family member invited before they have an account** —
   needs an explicit invited-pending state.
6. **Pharmacies are described as having a "support channel" with no actual screen** —
   needs a real design or removal of the claim.
7. **A "sold since"/freshness reliability score is referenced in mockups but never
   formally defined** — the designer needs the underlying data definition from product
   before designing its visual treatment (see Confidence marker, §8).
8. **A filtered-out pharmacy is never notified and can be silently marked
   inactive** — this is more a product/notification-strategy gap than a screen gap,
   but if a "why was I filtered out" or status screen is warranted, flag it.
9. Gendered-only Arabic copy was flagged in an earlier pass (no gender field in the
   data model, but UI copy defaults to masculine grammatical forms) — the designer
   should confirm the copy strategy for gender-neutral or gender-aware Arabic phrasing
   with whoever owns Arabic content, since this is a language question as much as a
   visual one but affects every screen's copy layout.

The designer is not expected to resolve all of these alone — they are listed here so
none of them get silently designed-around with a guess. Each should get either a real
screen/state or an explicit "descoped, confirmed by product" note before final handoff.

---

## 12. Iconography, Imagery, Branding

- **App icon**: already exists in two forms — `dawai-icon.svg` (rounded-square mark,
  fill `#173c37`, two rotated lime/mint bars) and `dawai-icon-maskable.svg` (same mark,
  full-bleed for maskable safe zone). The designer should treat this as the current
  brand mark to refine or deliberately replace — not silently invent a new logo
  alongside it without flagging the change.
- **Icon style**: no icon library is currently in use; the mockups use emoji as
  interim icons in several places (📷 🔔 🏪 👤 📎 ⏱ 🔍) — these are placeholders, not a
  final icon direction. The designer must deliver a real, consistent icon set (single
  style, single stroke weight) covering: all nav items across all 3 personas, all
  request/offer/reservation state icons, all safety/alert icons, camera/upload/
  prescription icons, and every icon must be classified per the never-mirror rule in
  §6.1.
- **Photography/illustration**: no photography direction currently exists anywhere in
  the product. The designer should establish whether pharmacy/medicine photography,
  illustration, or icon-only treatment is the direction for trust-building surfaces
  (pharmacy profile, verification badges, empty states) — this is currently undefined
  and affects perceived trust, which the blueprint explicitly treats as a core product
  concern ("the trust surface is too empty" — existing critique).
- **PWA/app-store assets**: `docs/dawai/APP_STORE_READINESS.md` already specifies a
  launch-screen color (`#173c37`, solid) and drafted Arabic/English App Store copy —
  the designer should confirm the launch screen and icon final versions align with
  whatever palette decision comes out of §2.

---

## 13. Accessibility Requirements (already partly code-enforced)

- `platform/packages/design/src/a11y.ts` implements exact WCAG 2.1 contrast math and
  defines explicit thresholds: **body text 4.5:1, large text 3.0:1, UI-boundary
  elements 3.0:1**. Every color pairing the designer proposes (§2's `CONTRACT_PAIRS`
  and any new ones) must be checked against these exact numbers before handoff — this
  is testable in code, so there's no ambiguity about whether a pairing passes.
- Blueprint §25 states explicitly: the product must work at **200% text zoom**, with
  full screen-reader support, respect for reduced-motion (§5), and support for
  high-contrast mode — because "the target user is frequently elderly, low-vision, or
  has a tremor — this is the median user, not an edge case." Design every screen with
  this as the primary user, not an accessibility afterthought pass at the end.
- Countdown timers (reservation hold) already implement `role="timer"` with polite
  `aria-live` announcements at minute/30-second/10-second marks in the existing
  mockup — the designer should preserve and formalize this pattern for any other
  time-sensitive UI (e.g. offer-response windows).
- Touch targets per §4 (44/48/56pt tiers) are themselves an accessibility requirement,
  not just an ergonomic one, given the stated user base.
- Color must never be the sole signal for a state (safety severity, offer match-type,
  reservation status) — pair every color-coded state with an icon and/or text label.

---

## 14. Figma Organization, Naming, Versioning, Handoff (process requirements)

These mirror standard practice but are stated explicitly because this product's
complexity (3 personas × many states × a formal contract schema) makes an
unstructured file unusable for engineering:

1. **Foundations page**: color/type/space/motion/radius/elevation as Figma Variables,
   with a **collection per persona** (Patient/Pharmacy/Owner) × light/dark mode, mapped
   explicitly to the code token names in §2–§5 so engineering can trace 1:1 —
   mismatched or renamed tokens between Figma and code are a handoff blocker.
2. **Components page**: every component in §8, plus generic components (buttons,
   inputs, badges, cards, modals, empty/error/loading states) as true Figma components
   with variant properties — built with auto-layout so real Arabic text lengths don't
   break them.
3. **Screens organized by persona and flow**, one page per persona
   (Patient/Pharmacy/Owner-Admin/Shared-Entry), frames named
   `[Persona]/[Flow]/[Screen]/[State]`, e.g. `Patient/Offers/Compare/Empty-Radius5km`.
4. **A contract-annotation layer**: for every screen frame, attach the §7 contract
   fields (location, back-behaviour, primary action + tap count, per-state
   explains/action/whatFailed/workPreserved text) as Figma dev-mode notes or a linked
   spec sheet row — this is a hard requirement, not optional polish, because
   engineering's own tooling checks for these fields.
5. **RTL-only**: build every frame in RTL directly (not "design LTR then flip") — per
   §6, this is a Phase-0 constant, not a mode to support both ways.
6. **Real Arabic content, real lengths, in every frame** — no Latin lorem ipsum, and
   no short placeholder Arabic (e.g. "دواء" alone) where real content would be a full
   medicine name + dosage + Latin dosage units requiring bidi isolation (§6.3) — this
   class of layout bug (RTL/Latin mixing) is exactly what broke the prototype twice
   before and needs to be tested with real-length content in the design file itself.
7. **Versioning**: tagged Figma versions with descriptive names; any token value
   change, component-state addition/removal, or contract-field change must be called
   out in the version description, since it changes what engineering's automated
   checks expect.
8. **Sign-off checklist before a screen is considered ready for implementation:**
   - Every state in §7's list is present, or explicitly marked not-applicable with a
     reason.
   - Every color pairing used passes the §13 contrast thresholds (checked, not
     eyeballed).
   - Every icon's mirroring behavior is classified per §6.1.
   - Every Latin/numeral run inside Arabic text is marked as needing bidi isolation
     per §6.3.
   - Primary action count is exactly 1, secondary actions ≤3 (§7), or an explicit
     product exception is documented.
   - The screen uses only components from the Components page — no one-off,
     un-componentized elements.
   - No unnamed layers/frames.

**Pixel-perfect expectation**: engineering will implement directly from Figma
dev-mode measurements. Any value that can't be pulled directly from the file (motion
curves, haptic timing, the exact freshness/confidence-marker calculation) must be
documented as a written spec note attached to the relevant frame.

**Sign-off**: implementation of a given screen does not start until that screen
passes the checklist above. If a required state, token, or contract field is missing
at implementation time, the engineer stops and sends it back to Design rather than
guessing — this is the entire purpose of this document.
