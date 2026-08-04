# 12 — Design system and UX knowledge

Design philosophy, tokens, interaction rules, accessibility, RTL, animation,
loading, offline UX, error UX and empty states.

---

## 1. The design philosophy

**UX is a first-class engineering responsibility, and most of it is checkable.**

> A screen that cannot say where the user is, what to do next and how to go back
> is not finished, and **that is a property of a declaration rather than an
> opinion in a review.** A screen without a contract does not render, and a
> contract that contradicts the frozen Blueprint fails the build — so improving
> UX can never quietly redesign the product.
> — `packages/design/src/ux/contract.ts`

Six rules follow from that:

1. **A component never picks a colour, a size or a distance — it names a role and
   receives a value.** *That is what makes the accessibility test meaningful: it
   measures the pairs this file can produce, and a raw hex in a stylesheet would
   be a pair nobody measured.*
2. **Contrast is measured, never eyeballed.** Amber on cream failed at 4.08:1 in
   the prototype and looked fine.
3. **Exactly one primary action per screen, per state.**
4. **Every animation must teach something.**
5. **Every state has an intentional treatment** — including the ones nobody
   enjoys designing.
6. **The three personas share semantic roles**, so a component never knows which
   persona it is in. *A component that branches on persona is where role
   isolation starts to rot.*

---

## 2. Tokens

### Space — the 4pt rhythm

```
space = { 0:0, 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 7:32, 8:40, 9:48, 10:64 }
radius = { sm:8, md:12, lg:16, xl:22, pill:999 }
elevation = { flat:0, raised:1, overlay:2, sheet:3, alert:4 }   ← roles, never shadow strings
```

**There is no value outside the scale.** *A raw number in a stylesheet is a
future inconsistency nobody can find.*

`frame` names the screen's edges rather than measuring them:

```
frame = { gutter: 16, safeTop: 24, safeBottom: 24 }
```

> They were two identical magic values in the header and the footer, which meant
> a device with a taller indicator would have needed the same edit made in two
> places by someone who remembered both. **`space[6]` says twenty-four;
> `safeBottom` says why.**

### Touch targets

| Token | Value | Why |
|---|---|---|
| `tap.min` | **44** | Everywhere. §25 |
| `tap.patientPrimary` | **48** | The user is frequently elderly or has a tremor |
| `tap.pharmacyPrimary` | **56** | That device is used one-handed, at speed, with a customer waiting |

### Type — tuned for Arabic

| Role | Size / line-height / weight | Clinical? | Note |
|---|---|---|---|
| `code` | 76 / 1.15 / 600 | ✅ | **The largest thing in the product**, because it is what a patient holds up at a counter |
| `display` | 34 / 1.25 / 700 | ❌ | |
| `poster` | 28 / 1.45 / 800 | ❌ | E4's promise copy |
| `title` | 24 / 1.40 / 800 | ✅ | Raised from 22/700 to match the delivery |
| `headline` | 17 / 1.50 / 600 | ✅ | |
| `body` | 16 / 1.65 / 400 | ✅ | **The clinical floor** |
| `caption` | 13 / 1.60 / 500 | ❌ | **Barred from clinical content by type** |

**Three rules that are correctness, not taste** (§25):

1. **`letterSpacing` is typed as the literal `0`.** *Arabic is a connected script
   and tracking breaks the joins.* No role can carry anything else.
2. **Nothing clinical below 16pt.** `clinicalAllowed` is a field, and
   `assertClinicalRole()` throws.
3. **The stack is Arabic-first.** *A Latin-first stack with an Arabic fallback
   produces inconsistent weight mid-sentence.*

```
arabic:  IBM Plex Sans Arabic → Noto Sans Arabic → system-ui → sans-serif
latin:   IBM Plex Sans → system-ui → sans-serif        (drug names, codes, prices)
tabular: IBM Plex Mono → ui-monospace → monospace      (countdowns, prices, quantities)
```

**The one tracking exception, and why it is a token.**

```
tracking = { arabic: 0, tabularCode: 2 }
```

> §25 fixes tracking at zero, and that rule is about **Arabic text**. One thing in
> the product is not Arabic text — a verification code: six unrelated digits set
> LTR in the tabular family and read aloud one at a time. There, spacing is what
> separates a digit from its neighbour so a patient copying from an SMS does not
> lose their place.
>
> It is a token rather than a literal because **a number typed at a call site is a
> second, unstated rule**: nobody reading `letterSpacing: 2` in a component can
> tell whether it is the exception or a violation of the invariant.

### Colour — roles, never hues

15 semantic roles: `surface`, `surfaceRaised`, `surfaceSunken`, `line`, `ink`,
`inkMuted`, `inkSubtle`, `accent`/`onAccent`, `success`/`onSuccess`,
`warning`/`onWarning`, `alert`/`onAlert`.

Three personas × two schemes. **Palettes are looked up, never merged.** Each app
imports exactly one persona; the lookup function exists so the accessibility
tests can iterate all six.

#### Patient — "Night Mint" (ليل النعناع)

Dark-first: a deep green ground with **mint as the ONLY signal colour**, so a
single accent carries every "this is the action" moment and nothing else competes.

```
surface #0D1A15   surfaceRaised #142720   surfaceSunken #1B2B22   line #1E3A2D
ink #F3F7F2       inkMuted #9FC6B6        inkSubtle #8FA89C
accent #2ECF9A    onAccent #0B241B
```

Three honest annotations in that file, all of them worth keeping:

- **`success` is held equal to `accent`.** Design did not distinguish them
  (R-5 unanswered), and the delivery uses mint for "replied — offer arrived".
  **Held equal rather than invented.**
- **`alert` was inverted from the delivery.** Design's alert is a *ground* for
  the safety world (`#7A150F`), not a text colour; the roles here are
  text-on-surface, so the ground became `onAlert` and the readable red became
  `alert`. **Flagged in the handoff notes.**
- **`patientLight` is an alias of `patientDark`.** The daylight sibling is not
  designed, so *the patient app renders dark until one arrives — showing an
  undesigned light scheme would ship something nobody drew.* (**TD-10**, and it
  means the contrast gate cannot catch a light-scheme regression either.)

#### Two surfaces outside the role system

| Surface | What it is | Why it is separate |
|---|---|---|
| `patientCodePanel` | The **light** panel carrying V2's reservation code | *A deliberately light card on the dark ground, so the code reads like something printed.* **The one surface in the patient app that inverts** — and a light card on a dark ground is not expressible as two roles from one palette, so it was invisible to the contrast gate until measured explicitly |
| `patientInfoStrip` | E4's «طلبك محفوظ» band | *A delivered colour with no semantic role: not a card, not a warning, not the sunken plane. It says "the thing you were doing is still here", which is a category the role system does not have and should not grow one for on the strength of a single use* |

Both are in `EXTRA_PAIRS` so the gate measures them like any other.

---

## 3. Accessibility — measured, never judged by eye

> §25 states that the target user is frequently **elderly, low-vision or has a
> tremor**, and that this is **the median user rather than an edge case.**

```
CONTRAST = { bodyText: 4.5, largeText: 3.0, uiBoundary: 3.0 }   // WCAG 2.1, as product requirements
```

`luminance` and `contrastRatio` implement WCAG 2.1 §1.4.3 directly.
**`reportRatio` rounds DOWN**, *so a reported figure never flatters a pair that
is borderline.*

`CONTRACT_PAIRS` lists exactly which pairs a component may place together —
**listing them is what lets the test measure every combination that can actually
appear**, because an untested pair is a pair that fails in production. The suite
measures **84 renderable pairs across 3 personas × 2 schemes**, plus
`EXTRA_PAIRS`.

**A role that quietly becomes a background must be added.** Three pairs were
added when it did:

> `line` became a background the moment R8 got tags. It was a border-only role,
> so text on it was going unmeasured and **the accessibility gate was passing
> without looking at two pairs the product actually renders.**

**The one deliberate deviation from the delivery (TD-11):** V2's code-panel
caption ships at `#63726B` rather than the delivered `#6B7A74`, which measures
**4.10:1** on `#F7F4EE` — below the 4.5 body floor, *on the screen Blueprint v3
says must never fail, for the line that tells the patient what to do with the
code.* Darkened to the nearest value in the same hue family that clears the floor
(4.61:1). **Reverts the moment Design confirms a replacement.**

### Known accessibility defect — TD-12

`ActionCard` sets `accessibilityLabel` on the `Pressable`, which makes the card
**one** accessibility element on both platforms: the label is announced and the
children are not.

> On R8 an offer card reads as «افتح عرض صيدلية الرشيد» alone — **the price, the
> coverage, the substitution flag, the distance and the honoured band are all
> rendered and none of them is spoken.**
>
> A patient using TalkBack or VoiceOver makes **the most consequential decision in
> the product** — which pharmacy to reserve from — **without hearing anything the
> decision is based on. The visible card and the spoken card are different
> products.**

The engineering defect is clear; the fix is not, because *what an offer card
should announce, in which order, in Iraqi Arabic, is a content decision.* §25 and
the Blueprint state no spoken-content rule for a composite card, **so
implementation must not invent one.** Blocked on product/design.

---

## 4. RTL and bidirectional text

> RTL is where ports quietly fail. §25 names three specific hazards this module
> removes.

| Hazard | Removal |
|---|---|
| A physical offset paired with a physical transform — **broke centring twice in the prototype** | Components name **logical edges** (`start`/`end`), resolved at render. *A component never names left or right — that is the bug.* |
| An unisolated Latin run — **reorders a price beside Arabic so the user reads the wrong number** | `isolate(text)` on every drug name, price, phone number and reservation code; `needsIsolation()` detects mixed runs |
| Two numeral systems inside one comparison | One system per surface, chosen once and applied everywhere. **Mixing them inside a single comparison is a defect, not a style** |

`APP_DIRECTION = "rtl"` is a **constant, not a setting**, because Phase 0 is
Arabic only (D34) — *named as an export so the day Kurdish arrives there is one
place to change.*

**Things that must NOT mirror**, because mirroring them is a bug rather than
localisation: `play`, `pause`, `media-controls`, `clock`, `timer-face`,
`map-north`, `route-direction`, `checkmark`, `logo`. Anything representing
physical direction of travel or a clock face stays as it is.

**`toWesternDigits`** folds both the Arabic-Indic (U+0660–0669) and
Extended-Arabic (U+06F0–06F9) ranges. It is the inverse of `formatDigits` and the
thing every caller that **accepts** text needs before it can parse — *a phone
number pasted from a contacts app, a search query typed on an Arabic keyboard, a
code read off an SMS.*

> It lived as four copies of the same two `.replace` calls — in the search
> normaliser, twice in the onboarding parser, and in the render-time numeral pass
> — **which is four places for the Extended-Arabic range to be forgotten in the
> fifth.**

**Digits are converted to Arabic-Indic once, at the render layer** (§25).
Modules that compose counted strings keep them Western, so nothing has to be
kept in step with the render pass.

### Arabic plural agreement

Arabic has **four** counted forms, and the agreement runs past the noun into the
pronouns after it: «باقي بديل واحد تقرر بيه» against «باقي ٣ بدائل تقرر بيهم».

> English has two forms and **a screen written by someone thinking in English
> gets three of the four wrong.**

It shipped wrong: «آخر تحديث قبل ١ دقائق» ("1 minutes ago") on a cached search,
and «باقيلك ٢ محاولات» to a patient on their fourth verification attempt, where
Arabic wants the dual «محاولتين».

`PluralForms<T>` is generic and holds **whole phrases rather than nouns**,
*because the agreement does not stop at the noun — a helper that returned only
the noun would leave the rest of the sentence at the call site to be got wrong,
which is where it was got wrong.*

The categories are **CLDR's for Arabic**, so a translator or reviewer can check
this against a published table rather than against someone's memory.
`counted(n, forms)` also handles **where the numeral goes**, which is part of the
rule: one and two omit it, three and above state it.

**Not verified: the dialect (TD-22).** The product is written in Iraqi Arabic,
and «دوائين», «٣ أدوية تحتاج وصفة» and «اثنين غيرهم» are three worth a native
reader's eyes.

---

## 5. Animation philosophy

> §27's rule is that every animation must answer **"what did this teach the
> user?"**, and that motion with no answer is **latency in a costume**. Each
> duration therefore carries what it teaches; **a new entry without one does not
> type-check.**

| Token | ms | Teaches |
|---|---|---|
| `screenPush` | 350 | where you are in the hierarchy |
| `sheetPresent` | 300 | this is temporary and layered above |
| `sheetDrag` | 0 | you are in control of it — follows the finger 1:1 |
| `doseConfirmed` | 250 | it was recorded |
| `skeletonToReal` | 150 | the wait is over |
| `responderArrive` | 200 | someone answered, just now |
| `undoDwell` | 4000 | you still have time |
| `errorShake` | 200 | **that** input, not another |
| `dwPulse` 🔁 | 1800 | we are still asking |
| `dwTick` 🔁 | 1600 | this pharmacy is still deciding |
| `dwSweep` 🔁 | 4500 | the search is live |
| `dwFloat` 🔁 | 3000 | this is waiting, not stuck |
| `offerArrival` | 200 | this one just came in |

**Rule 1: nothing over 500 ms** except a deliberate signature moment.
`SIGNATURE_EXEMPT = ["undoDwell"]` — *a dwell is not an animation.*

**Loops are exempt from the ceiling**, because *a loop reports ongoing activity
rather than a completed change — a 1.8 s pulse is not a slow transition, it is a
heartbeat.* The four loops exist for R7, the screen whose entire job is saying
that something is still happening while nobody has answered.

**Magnitudes are tokens too** (`MAGNITUDE`), *because "the smallest movement that
still reads" is a design decision, and a decision that lives in a comment beside
a number is one nobody can change in one place or check in any place*:

- `enterRise: 8` — *eight points, not thirty: this says "this one is new", not
  "this one flew in from somewhere"* (§27 rule 2).
- `pulseFloor: 0.35` — *below this it reads as flicker; above it, the thing stops
  looking present at all while it waits.*
- `shakeThrow: 6` — *enough to read as refusal on the field itself, not enough to
  look like the screen is breaking.*

**Easing curves are declared once.** They were written twice — as CSS strings and
as `Easing.bezier(...)` calls — *and two hand-kept copies of four control points
in two notations is a curve that can be adjusted in one place and not the other.*
The CSS copy had **no consumers** and was deleted rather than derived: *a second
notation kept alive for nobody is a second thing to keep right.*

**Reduced motion cross-fades rather than removes** (§27 rule 4), *because removing
feedback leaves the user unsure anything happened* — **except a loop, which stops
entirely**: *a pulse clamped to 100 ms is not a gentler pulse, it is a flicker,
and flicker is the specific thing the setting exists to prevent.*

**Haptics accompany state changes, never taps** (§27 rule 7):
`doseConfirmed`, `reservationConfirmed`, `handoverComplete`, `errorShake`.

> **TD-3 — screen transitions are not implemented.** Element-level motion is real
> (`Enter`, `Pulse`, `Shake` with native-driver and reduced-motion support, on
> eight call sites), but **2 of 13 tokens are spent**. The 11 unspent include
> every one that describes moving *between* screens, so the app root swaps a
> component per `state.screen` with nothing in between — going from a request to
> the sign-in ask is **a cut rather than a movement**, and that loses the one cue
> telling a patient whether they went deeper or sideways.

---

## 6. Loading philosophy

**`skeletonMatchesContent: true` is a required field.** A skeleton that does not
match what arrives is a second layout the user has to re-read.

**Busy is shown on the control, not as a screen-wide spinner.** E6's `checking`
and E8's `savingProfile` both sit on the button — *"a patient at the end of
onboarding must not be able to send it twice."*

`skeletonToReal` is 150 ms and teaches *"the wait is over."*

**A wait is not always a loading state.** R7's `empty` treatment carries no
separate message, because **the screen's whole content IS the wait**:

> The old «سألنا الصيدليات القريبة — ننتظر أول رد» was printed **twice**, once as
> the state treatment filling the screen and once inside the countdown card.

---

## 7. Empty states — §22

> **An empty state is the highest-attention moment in the product**, and spending
> it on "no data" wastes the best teaching opportunity there is.

Rules enforced by `auditContract`:

- An empty state **must explain** (`explains` non-blank).
- A **non-success** empty state **must carry an action**.
- A **success** empty state may carry `action: null`.

The distinction is real and S1 is why it exists — the same screen has **two**
empty states with opposite meanings:

| | `isSuccess: false` | `isSuccess: true` |
|---|---|---|
| Who | A brand-new account | A well-managed patient on a quiet day |
| Says | «هنا راح تشوف حجوزاتك وأدويتك اللي استلمتها» | «كل شي تمام — ما عندك شي يحتاج انتباهك هسه» |
| Action | «أطلب أول دواء» | **none** — *offering an action here would invent urgency the user does not have* |

`model/view.ts` `treatmentFor` matches on `isSuccess` because *picking the first
one would greet a new user with "everything is fine" and no way to start.*

Two more instructive empties:

- **F2 (no results)** — §13.1: *the catalogue is incomplete, not the patient
  wrong.* «ما لكيناه بقائمتنا — ممكن يكون موجود بالصيدليات» + «أطلبه بالاسم مع
  صورة». A bare "no results" is what this replaces.
- **R7 (no offers yet)** — `action: null` and `primaryWhen.empty: null`, because
  the patient's only real option is to keep waiting, *which needs no button.*

---

## 8. Error UX — §23

Every error must answer **three** questions:

1. **What failed** — and `"something went wrong"` is **regex-rejected by
   `auditContract`**, so it is a literal build failure.
2. **Whether the user's work survived** — `workPreserved`.
3. **One thing to press** — a non-blank `action`.

### Wording lives in exactly one place

`apps/patient/src/ui/refusal.ts`:

> Rule 4 in both directions: the domain decides **WHETHER**, and returns a code
> with structured detail rather than a sentence, because **a rule that formats
> prose is a rule that has an opinion about a screen.** Wording is the app's job
> and it happens exactly here, so **the same refusal never reads two different
> ways in two places**, and a code with no wording is a compile error rather than
> a raw enum shown to a patient.

Selected wordings, and what each is doing:

| Code | Says | Doing |
|---|---|---|
| `CONTROLLED_NOT_SUPPORTED` | «هذا الدواء ما ينطلب من التطبيق — لازم تروح للصيدلية بنفسك» | States the boundary **as a fact about the app, not a judgement about the patient**, and points at the thing that does work |
| `PRESCRIPTION_REQUIRED` | «هذا الدواء يحتاج وصفة — صوّرها وكمّل» + «صوّر الوصفة» | Names the **fixable condition** |
| `NOT_FOUND_OR_NOT_YOURS` | «ما لكيناه» | §5 rule 3 — *so no screen becomes an oracle telling a stranger that someone exists* |
| `OUTSIDE_COVERAGE` | «ما عدنا صيدليات بمنطقتك بعد» | **Our limit, not their mistake** |
| `SUBJECT_MEMORIALISED` | «هذا السجل صار للقراءة فقط» | Reused verbatim by `sayRedirect`, *because a patient meeting it twice by two routes must not read two sentences* |
| default | «ما كدرنا نكمّل هذي الخطوة» + «أعد المحاولة» | **Deliberately vague and deliberately actionable** — the remaining codes belong to flows this slice does not build, and *inventing wording for a refusal the patient cannot reach would be inventing behaviour* |

`sayRedirect` is **exhaustive by type**: a `RedirectReason` added with no wording
**fails to compile**.

`SESSION_REQUIRED` reads «نحتاج رقمك حتى نخبرك عندما ترد الصيدليات» — *why we are
asking, stated as what it buys them rather than as a demand.*

**`action: null` is legitimate** where there is genuinely nothing to press —
*§23 forbids inventing one.*

---

## 9. Offline UX — §21

**Offline has two shapes, and treating them as one produced a rule that demanded
an age from screens with nothing to age.**

| Shape | Declares | Meaning |
|---|---|---|
| **Degraded** | `readOnly`, **`showsAge: true`** | Still shows something — cached offers, a held reservation — **and must label how old it is** |
| **Blocked** | **`because`** | Shows nothing, because the thing it does cannot happen without a connection |

> A verification SMS leaves now or not at all, and **queueing one would strand a
> patient waiting for a message nobody sent.**

E5 and E6 are `blocked`; F1, F2, S1, R7 and **V2** are degraded.

**V2 is the screen that must never fail.** Served from cache, the code stays
readable and the countdown is **labelled as last known** — *presenting a cached
countdown as live would send someone to a pharmacy for a hold that had already
lapsed.*

**R6 is `readOnly: false` while offline**: sending is still allowed, and D27 makes
the result honest — the request becomes `queued`, not `broadcast`, and
`@dawai/offline`'s `describe()` supplies the only words a screen may use:

```
queued    → «بانتظار الاتصال»
sending   → «قيد الإرسال»
rejected  → «ما وصل — تكدر تعيد المحاولة»
cancelled → «ملغى»
accepted  → «تم الإرسال»
```

**Connectivity is advisory.** `host.online()` is a hint; **the outbox remains the
authority on whether something was actually sent.**

---

## 10. Interaction rules

| Rule | Enforcement |
|---|---|
| Exactly one primary action, always | The `ScreenContract` type — a screen **cannot declare two** |
| A state may override the primary | `primaryWhen`, keyed by **presence not truthiness**, so a declared `null` means "this state offers nothing" |
| Secondary actions may not outnumber three | `auditContract` — *three is the point at which a screen stops having an obvious next step* |
| `tapsToOutcome` is declared per action | *The brief asks to reduce taps without violating the Blueprint, so the number is declared and can be regression-tested rather than estimated* |
| Purpose is one sentence | `auditContract` counts sentence terminators — *if it cannot be stated in one, the screen does too much* |
| A permission refusal is never a wall | `permissionRefused` requires `stillUsable: true` **and** an `alternative` |
| A field never rewrites keystrokes | E5 holds the phone number **verbatim** — *a field that rewrites keystrokes is a field people fight* |
| Typing clears the last refusal | *the patient is answering it* |
| Nothing reshuffles under a reading thumb | Offer ties keep arrival order; the sort is computed **at render, never stored** |
| A destructive/irreversible action states its consequence | Account deletion requires a **typed word**; every managed subject must be explicitly disposed |

---

## 11. Theming, in practice

`apps/patient/src/ui/theme.ts` resolves the patient palette once:

```ts
const BUILT = { light: build("light"), dark: build("dark") };
export const themeFor = (scheme) => BUILT[scheme];
```

> There are two themes and they are constants, so there are two objects.
>
> Building a fresh one per call gave every render a theme with a **new
> identity**. `t` is threaded through every component in the app, so that
> identity is a prop on all of them: **nothing downstream can ever be skipped by
> `React.memo` or held stable by a dependency array**, however carefully it is
> written. The theme is derived from frozen tokens and cannot change at runtime —
> **a new object per render was never describing a new value.**

`textStyle(theme, role, colorRole)` converts a token to a React Native style
once: line height is a **multiplier** in the token and an **absolute value** in
RN, so the conversion happens in exactly one place. It always sets
`writingDirection: rtl` and `textAlign: right`.

---

## 12. Generated design documentation

`npm run design` regenerates six derived documents from the tokens and contracts
(`platform/tools/design/`):

| Output | From |
|---|---|
| `docs/design/DESIGN_TOKENS.md` | The token modules |
| `docs/design/SCREEN_INVENTORY.md` | `phase0.js` + the contracts |
| `docs/design/COMPONENT_INVENTORY.md` | The kit |
| `docs/design/RESPONSIVE_REPORT.md` | `review/responsive/` (320/360/390/430 px) |
| `docs/design/DESIGN_FIDELITY_REPORT.md` | Delivered values vs shipped values |
| `docs/design/DESIGN_QA_CHECKLIST.md` | The audit rules |

**Do not hand-edit them.** `tools/docs-check.mjs` fails the build if a generated
artefact contains `undefined`, `NaN` or `[object Object]` — *no generated
document may print a hole.*

Open questions still marked **"OPEN to the designer"** in the design package:
S1's visual, R4, R5, **R11 («OPEN to the designer: Everything. Not rendered.»)**,
R13, the patient light palette, and R-5 (whether `success` is distinct from
`accent`).
