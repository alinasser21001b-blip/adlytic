# Design Fidelity Report

> **Generated — do not edit.** `npm run design` diffs the repository against
> the delivered specification transcribed in
> `platform/tools/design/fidelity.mjs`. **Colour and typography are computed**;
> the other eight categories are recorded judgement. A report written by hand is
> a self-assessment — this is a comparison.

**Delivery under assessment:** Night Mint (ليل النعناع) · turn `4a` · 360pt · dark · arabic-indic numerals

---

## Overall fidelity

# 78%

6 screens × 10 categories = 60 assessments.

| Verdict | Count | Share |
| --- | --- | --- |
| Exact Match | 38 | 63% |
| Minor Deviation | 6 | 10% |
| Intentional Deviation | 4 | 7% |
| Missing | 6 | 10% |
| Blocked | 6 | 10% |

Exact and Intentional both count 1.0 — an approved, recorded deviation is
faithful, because it is a decision rather than a defect. Minor counts 0.75.
Missing and Blocked count 0.

| Screen | | Fidelity |
| --- | --- | --- |
| `V2` | Reservation (cached-first) | 78% |
| `R7-queued` | Waiting · queued | 80% |
| `R7-sent` | Waiting · sent | 78% |
| `R8` | Offers | 75% |
| `R9` | Substitution consent | 78% |
| `E4` | Why we need your number | 78% |

- **Completed:** 6 of 6 built
- **Not started:** none
- **Blocked:** all 6 on Icon fidelity — no icon set exists, so that category cannot rise above Blocked on any screen

---

## Colour fidelity — computed

The installed dark palette, diffed role by role against the delivery.

| Role | Delivered | Installed | |
| --- | --- | --- | --- |
| `surface` | `#0D1A15` | `#0D1A15` | Exact Match |
| `surfaceRaised` | `#142720` | `#142720` | Exact Match |
| `surfaceSunken` | `#1B2B22` | `#1B2B22` | Exact Match |
| `line` | `#1E3A2D` | `#1E3A2D` | Exact Match |
| `ink` | `#F3F7F2` | `#F3F7F2` | Exact Match |
| `inkMuted` | `#9FC6B6` | `#9FC6B6` | Exact Match |
| `inkSubtle` | `#8FA89C` | `#8FA89C` | Exact Match |
| `accent` | `#2ECF9A` | `#2ECF9A` | Exact Match |
| `onAccent` | `#0B241B` | `#0B241B` | Exact Match |

**9 of 9 roles match exactly.** One deliberate
departure from a delivered value — see DEV-1.

Values the delivery names that no semantic role covers — see CLR-5:

| Name | Value | Where |
| --- | --- | --- |
| info surface | `#0F2A1E` | E4 preserved-request banner |
| warning surface | `#2A2314` · text `#D8C9A4` | warning blocks |
| alert ground | `#7A150F` | safety world |
| declined dot | `#5E7A6E` | R7 responder list |

---

## Typography fidelity — computed

| | Delivered | Installed |
| --- | --- | --- |
| Arabic family | IBM Plex Sans Arabic, weights 400/500/600/700/800 | named, **not bundled** |
| Mono family | IBM Plex Mono, weights 500/600 | named, **not bundled** |
| Largest size | 76px (the V2 code) | 76px (`display`) |
| Weights | includes 800 for poster type | 400, 500, 600, 700, 800 |
| Letter-spacing | 0 | 0 — enforced every build |

The 76px code and the 800 weight have no token. See CLR-4.

---

## Fidelity by screen

### `V2` — Reservation (cached-first) · 78%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Exact Match | Built to the delivery in order: full-bleed cached banner, «حجزك باسم …», light code panel, facts card (pharmacy / expiry / price) as labelled rows with dividers, the cached-counter caption, a centred call link, and «الاتجاهات» as the one footer primary. Both the live and the cached states were compared against turn 4a. |
| Typography | Exact Match | Code renders at the delivered 76px mono; the panel caption at 13px; the «آخر وقت معروف» qualifier is present and set at caption scale beside the expiry, as delivered. |
| Spacing | Minor Deviation | Gutters and card padding land inside the delivered ranges, but the code panel's vertical padding is 32 (space 7) against a delivered 28 — the 4pt scale has no 28, and adding an off-scale value for one panel would cost more than the 4pt it buys. |
| Colour | Intentional Deviation | Ground, card, sunken banner, line, ink, muted and accent all match, and the light code panel is applied. The panel caption ships at #63726B rather than the delivered #6B7A74 — see DEV-1. |
| Component | Exact Match | `CodePanel`, `FactRow` and `Banner` are built and are what the screen composes. The banner is drawn by the frame from the declared offline treatment, so no screen can state «ما في اتصال» twice. |
| Motion | Missing | No transition is implemented anywhere in the product. |
| Icon | Blocked | No icon set exists. The back affordance is still the character ‹. |
| Accessibility | Exact Match | 44pt floor, accessible labels and measured contrast all enforced on this screen every build. |
| RTL | Exact Match | Direction-driven layout; no physical row reversal, banned at build time. |
| Responsive | Exact Match | Measured at 320/360/390/430pt. All 3 state(s) pass every detector: no overflow, no clipping, no cropped card, no target below the floor, no order change, no RTL regression. |

### `R7-queued` — Waiting · queued · 80%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Exact Match | Built to the delivery: «بانتظار الاتصال», the three-sentence explanation, the outbox card, the card explaining why there is deliberately no counter, then the primary «تمام — خبروني» with «إلغاء الطلب قبل الإرسال» centred beneath it at the bottom edge. |
| Typography | Exact Match | The `title` role now carries the delivered 24px/800, raised while building V2; this screen's heading picked it up with no screen-level change. |
| Spacing | Exact Match | 20px gutter, matching the delivered range. |
| Colour | Exact Match | Palette applied. |
| Component | Intentional Deviation | Composed entirely from the framework — Section, Card, Row, Spacer — with no screen-specific primitive. The delivery draws the explain card with a dashed border, which React Native cannot express on a rounded rectangle; it ships as a sunken card. See DEV-7. |
| Motion | Missing | None implemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | Enforced. |
| RTL | Exact Match | Enforced. |
| Responsive | Exact Match | Measured at 320/360/390/430pt. All 1 state(s) pass every detector: no overflow, no clipping, no cropped card, no target below the floor, no order change, no RTL regression. |

### `R7-sent` — Waiting · sent · 78%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Minor Deviation | Title, sub-line, the ring card and the bottom action pair are all built as delivered. The per-pharmacy responder list is absent — see CLR-6 and DEV-8; it is the delivery's main body, so the sent state is visibly thinner than the design. |
| Typography | Exact Match | Title at the delivered 24/800; the ring figure in mono tabular at headline scale, as delivered. |
| Spacing | Exact Match | Within the delivered ranges. |
| Colour | Exact Match | Palette applied. The delivered declined-dot #5E7A6E has no role and is recorded as an extra. |
| Component | Intentional Deviation | `Dial` is built and is the delivered ring, drawn with clipped rotated half-discs because React Native has no conic gradient — same arc, no new dependency, geometry proved by test. The responder row is not built: no responder entity exists in the domain (DEV-8). |
| Motion | Missing | `dwTick` on thinking dots is specified and unimplemented — the screen's whole point is that something is happening. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | The dial carries the fraction as an accessible percentage plus a label, so the arc is never the only thing conveying it — tested. |
| RTL | Exact Match | Enforced. |
| Responsive | Exact Match | Measured at 320/360/390/430pt. All 1 state(s) pass every detector: no overflow, no clipping, no cropped card, no target below the floor, no order change, no RTL regression. |

### `R8` — Offers · 75%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Minor Deviation | Built to the delivery: «العروض (ن)» with the ordering rule beneath, then rows carrying name and price as baseline peers, coverage as n-of-m beside distance, the amber missing line, and the caveats as tags. The trailing add affordance is gone. Missing: the readiness chip (no such field exists — DEV-10) and the «وسّع البحث» footer link (not a Blueprint exit — DEV-11). |
| Typography | Minor Deviation | Name and price now sit at the same headline weight as delivered, and prices read «د.ع» across the product. The delivery sets the currency suffix at 11px, which is below the caption role and outside the type scale; it renders at caption size. |
| Spacing | Exact Match | 14px card padding, 10px gaps — inside the delivered ranges. |
| Colour | Exact Match | All rows identical: same card, same 1px line, no highlight. Matches the delivery's central requirement. |
| Component | Exact Match | `Tag` is built and is what every caveat renders through, with one neutral treatment so no tag can be dressed up to favour a pharmacy. `ActionCard` gained an affordance choice rather than being forked. |
| Motion | Missing | Offer arrival stagger (~200ms) unimplemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | Enforced. Row labels name the pharmacy and the ACT — «افتح عرض …», so a screen reader user is told the tap opens rather than reserves. The two new text-on-line pairs the tags introduced are now measured by the contrast gate (17 pairs, was 14). |
| RTL | Exact Match | Enforced. |
| Responsive | Exact Match | Measured at 320/360/390/430pt. All 3 state(s) pass every detector: no overflow, no clipping, no cropped card, no target below the floor, no order change, no RTL regression. |

### `R9` — Substitution consent · 78%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Minor Deviation | Built to the delivery in full: «دواء غير اللي طلبته», the neutrality sentence, asked and offered side by side with BOTH names in both scripts, the verbatim quote signed by its verified author, both consent statements, and two identical answers. The two comparison cards do not equalise height (DEV-14), and the answers sit inside the card rather than pinned at the bottom (DEV-15). |
| Typography | Exact Match | Heading at the delivered 24/800, the quote at body scale, captions at 13. Prices read «د.ع». |
| Spacing | Exact Match | Within the delivered ranges. |
| Colour | Exact Match | Both answers share the same #142720 fill and 2px #2ECF9A border — the delivery's non-negotiable. |
| Component | Exact Match | Composed from Section, Row, Grow, Card, Bidi and Choice — no screen-specific primitive. `Choice` gained a spoken label so shortening «أوافق على البديل» to «أوافق» did not strip the subject from a screen reader. |
| Motion | Missing | None implemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | Radio semantics with selection state, identical weight for both answers, and a spoken label naming the medicine each answer refers to. Both answers clear the 44pt floor at every measured width. |
| RTL | Exact Match | Enforced. |
| Responsive | Exact Match | Measured at 320/360/390/430pt. All 3 state(s) pass every detector: no overflow, no clipping, no cropped card, no target below the floor, no order change, no RTL regression. |

### `E4` — Why we need your number · 78%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Minor Deviation | Built to the delivery: the preserved-request strip, the poster promise, the privacy sentence, then «أدخل رقمي» with «مو هسه — رجعني لطلبي» centred beneath it. The delivered phone field is absent — see DEV-16; Blueprint v3 puts phone entry on E5, so a field here would be either inert or a second place a number can be typed. |
| Typography | Exact Match | The promise renders at the delivered 28/800 through the `poster` role, added while building V2 and used here for the first time. |
| Spacing | Exact Match | Gutter and stack gaps inside the delivered ranges. |
| Colour | Exact Match | Palette applied, and the delivered info surface #0F2A1E now exists as a token with both of its text pairs measured by the contrast gate. |
| Component | Intentional Deviation | Composed from Section, Row, Primary and Secondary plus one new piece, `InfoStrip`. No TextField is used because no field is drawn — DEV-16. |
| Motion | Missing | None implemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | The reason shown is the guard's own string, so what a screen reader announces is what the redirect said. Both controls clear the 44pt floor at every measured width, and the way out is a labelled control rather than only a chevron. |
| RTL | Exact Match | Direction-driven; the strip mixes weights inside one run without splitting the sentence. |
| Responsive | Exact Match | Measured at 320/360/390/430pt. All 2 state(s) pass every detector: no overflow, no clipping, no cropped card, no target below the floor, no order change, no RTL regression. |


---

## Intentional deviations

### DEV-16 — E4 draws no phone field; the delivery shows «+964» beside a masked «77_ ___ ____».

**Why.** Blueprint v3 separates the two: E4 explains («Explain before the one hard ask») and E5 takes the number («Phone entry»). Drawing a field on E4 gives one of two bad outcomes — a decoration that does nothing when tapped, which is the placeholder pattern this project forbids, or a second place in the product where a phone number can be entered. The primary keeps the contract's «أدخل رقمي» and leads to E5 rather than the delivery's «أرسل الرمز», which belongs to the merged screen the delivery drew.

| | |
| --- | --- |
| Temporary | No — this is the rule now |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `None for E4. E5–E8 remain unbuilt and are tracked as TD-4.` |

### DEV-14 — The asked and offered cards do not equalise their heights.

**Why.** The offered card carries a price line and is therefore taller. Equalising needs a height-stretch escape hatch on `Card` that nothing else wants, and the two cards are a comparison of facts rather than two answers competing — the two ANSWERS are pixel-identical, which is the part §4 R10 governs.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `Give Card an optional fill so a row of cards can equalise.` |

### DEV-15 — The two answers sit inside the substitution card rather than pinned at the bottom of the screen.

**Why.** The delivery draws one substitution and pins one pair of buttons. R9 can carry several — an offer may substitute more than one line — and a single pinned pair cannot answer them all, nor say which one it is answering. Each substitution owns its own answers, directly beneath the comparison they refer to.

| | |
| --- | --- |
| Temporary | No — this is the rule now |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `None. Confirm with Design that a multi-substitution offer keeps per-card answers.` |

### DEV-9 — R8 states distance in bands — «قريبة منك» / «أقل من كيلومتر» / «حوالي ٣ كم» — where the delivery prints «١٫١ كم».

**Why.** `distanceM` is measured from the district centroid, and the domain says so in as many words: presented as a rough distance, never as a live position, because Phase 0 does not track the patient. A decimal kilometre would claim a precision the number does not have, on the screen where the patient decides how far to walk with a sick child. The delivery's precision is a visual choice; the imprecision of the underlying figure is a fact.

| | |
| --- | --- |
| Temporary | No — this is the rule now |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `None. Confirm with Design that banded distance is acceptable, or deliver real positioning first.` |

### DEV-10 — R8 rows carry no readiness chip («جاهز هسه» / «جاهز خلال ١٥ د»).

**Why.** No readiness field exists on an Offer. The domain knows `openNow` — whether the branch is open — which is a different fact and is rendered as its own tag. Inventing a preparation time on the screen where a patient decides where to walk would be inventing an entity and a promise at once.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `Needs a readiness field on Offer, and a pharmacy-side way to set it truthfully.` |

### DEV-11 — R8 has no «ما يعجبك شي؟ وسّع البحث» footer link.

**Why.** Blueprint v3 gives R8 two exits — offer detail and reserving. Widening the search is neither, and adding an exit a screen is not declared to have would put a destination in the navigation graph that the Blueprint does not contain.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `Needs a Blueprint revision adding the exit, or Design dropping the link.` |

### DEV-6 — R7 queued lists outbox ENTRIES with their delivery state, not individual medicines with pack counts.

**Why.** The delivery lists «أموكسيسيلين ٢٥٠/٥ شراب — علبة» per line. The outbox holds REQUESTS, and an outbox item's payload is opaque to the UI by design, so a per-medicine breakdown would mean either casting through the offline boundary or inventing lines. What ships is what the outbox actually knows: the entry's own label and its real delivery state.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `Needs either a per-line outbox projection or Design accepting the entry-level list.` |

### DEV-7 — R7 queued draws the «no counter on purpose» card as a sunken card, not the delivered dashed outline.

**Why.** React Native cannot draw a dashed border on a rounded rectangle. Sinking the card below the content plane carries the same meaning — this is a remark about the screen rather than content — using the Note/Card treatment already used everywhere else for exactly that.

| | |
| --- | --- |
| Temporary | No — this is the rule now |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `None. Confirm the substitution with Design.` |

### DEV-8 — R7 sent does not render the per-pharmacy responder list.

**Why.** Two independent blocks. CLR-6 is an open PRODUCT question — whether naming a pharmacy that declined may be disclosed before it chose to answer. And no responder entity exists in the domain: the model knows the window and the offer count, nothing per pharmacy. Building it would mean inventing an entity and answering a product question inside implementation, both forbidden. The sent state is visibly thinner than the delivery as a result, and that emptiness is the honest rendering of what is known.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | `Blocked on CLR-6, then on a responder projection in the Marketplace domain.` |

### DEV-1 — V2 code-panel caption ships at #63726B, not the delivered #6B7A74.

**Why.** The delivered value measures 4.10:1 on #F7F4EE — below the 4.5:1 body floor the build enforces. It is the line telling the patient what to do with the code, on the screen Blueprint v3 says must never fail. #63726B is the nearest value in the same hue family that clears, at 4.61:1.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | **Yes** |
| Product approval required | No |
| Tracked as debt | `TD-11` |

### DEV-2 — The patient app forces the dark scheme and ignores the device's light preference.

**Why.** The delivery is dark-only; its daylight sibling is a known open item in the handoff README. Rendering the device's light preference would ship a scheme nobody drew. `patientLight` aliases `patientDark` so nothing renders half-designed.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | **Yes** |
| Product approval required | No |
| Tracked as debt | `TD-10` |

### DEV-3 — An alphanumeric reservation code is left in Latin digits and marked LTR, rather than converted to Arabic-Indic like every other number.

**Why.** Converting only the digits of `4KD2P9` produced «٤K D٢ P٩» — one token in two scripts, worse than either system. A code is read aloud to a pharmacist and typed into their system, so it must be one alphabet. The delivery shows a purely numeric code («٤٧ ٢٩»), which would need no exemption — see CLR-1.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | No |
| Product approval required | **Yes** |
| Tracked as debt | Not debt — a resolved decision |

### DEV-4 — The one-numeral-system rule now exempts isolated Latin runs.

**Why.** The delivery itself places «أوجمنتين ٦٢٥» and "Augmentin 625" on adjacent lines, so both systems legitimately appear on one screen. The rule was tightened to what §25 actually protects: two systems inside ARABIC text.

| | |
| --- | --- |
| Temporary | No — this is the rule now |
| Design approval required | No |
| Product approval required | No |
| Tracked as debt | Not debt — a resolved decision |

### DEV-5 — Turn-3 screens (welcome, guest search, capture sheet, My medicines, quiet Today, safety layer) are not implemented.

**Why.** Out of scope for this pass, which takes turn 4 — the delivery. The handoff also flags that the safety layer may be cut by v3/D18 and says to confirm with Product before building it.

| | |
| --- | --- |
| Temporary | Yes — reverts when resolved |
| Design approval required | No |
| Product approval required | **Yes** |
| Tracked as debt | Not debt — a resolved decision |


---

## Design clarification requests

6 ambiguities, collected into one report rather than
asked one at a time. **Engineering has not guessed at any of them.**

### CLR-7 — undefined

**Context.** Every screen in the request flow renders «تنتظر الردود — الخطوة ٤ من ٦» beneath its title. The turn-4 delivery shows no progress row on any of the five screens — it shows a device status bar instead.

**Screenshot.** `review/screenshots/R7-waiting.png`

**Current implementation.** Progress renders on R1, R2, R6, R7, R8 and V1, derived from the declared flow.

**Design reference.** Turn 4 shows no progress indicator on V2, R7, R8, R9 or E4.

**Why Engineering cannot decide.** undefined

**Options.**
1. Keep the progress row as built.
2. Drop it on modal workflow screens, where the title already answers «where am I».
3. Replace it with a non-numeric form the delivery would accept.

**Engineering recommendation.** Keep it until Design rules. The separator defect it had — a middle dot beside Arabic-Indic digits read as a numeral, so «٤/٦» rendered as «٤/٦٠» — is fixed independently; it now reads «الخطوة ٤ من ٦».

### CLR-1 — Is the reservation code numeric or alphanumeric?

**Context.** V2 is the screen Blueprint v3 says must never fail. The code is its largest element and is read aloud to a pharmacist.

**Screenshot.** `review/screenshots/V2-held.png`

**Current implementation.** The build's fixture is `4KD2P9` — six alphanumeric characters, grouped in pairs, rendered in Latin because mixing scripts inside one token is worse than either system (DEV-3).

**Design reference.** Turn 4 V2 shows «٤٧ ٢٩» — four Arabic-Indic digits in two pairs, 76px mono.

**Why Engineering cannot decide.** The alphabet of the code is a product decision with real operational weight: it sets the collision space, whether a pharmacist can type it on an Arabic keypad, and whether the Arabic-Indic conversion applies at all. Blueprint v3 does not fix it, and Engineering picking one would be inventing product behaviour.

**Options.**
1. Numeric only, 4 digits, as drawn — matches the delivery exactly and needs no script exemption, but 4 digits is a small collision space if codes are reused within a district.
2. Numeric only, 6 digits — same rendering, materially larger space.
3. Alphanumeric, as the fixture — largest space, but must stay Latin and therefore breaks the all-Arabic-Indic surface the delivery draws.

**Engineering recommendation.** Numeric, 6 digits, grouped in pairs («٤٧ ٢٩ ٣١»). It keeps the delivery's rendering and its all-Arabic-Indic surface, removes the script exemption entirely, and is still readable aloud in three short groups.

### CLR-2 — IBM Plex Mono has no Arabic-Indic glyphs.

**Context.** The handoff specifies IBM Plex Mono for digits, codes and prices — 'never Arabic' — but the numerals throughout the delivery are Arabic-Indic (٤٧ ٢٩, ٨٬٥٠٠), which are Arabic-script characters.

**Screenshot.** `review/screenshots/V2-held.png`

**Current implementation.** No font is bundled, so everything renders in a system fallback. In the browser mock the same substitution happens silently, which is why the mismatch is not visible in the canvas.

**Design reference.** Turn 4 sets the 76px code and all prices in IBM Plex Mono with `font-variant-numeric: tabular-nums`.

**Why Engineering cannot decide.** A font either contains a glyph or it does not; Engineering cannot resolve this by choosing a value. On device the substitution will differ from the mock, and the tabular-figures guarantee — which §27 requires so a countdown does not jitter — would be lost precisely where it matters.

**Options.**
1. Use IBM Plex Sans Arabic for Arabic-Indic digits and verify its figures are tabular, keeping IBM Plex Mono only for genuine Latin runs.
2. Switch the surface to Latin digits, which IBM Plex Mono does contain — contradicts the delivery.
3. Nominate a different Arabic mono face that has both.

**Engineering recommendation.** Option 1. Confirm IBM Plex Sans Arabic's Arabic-Indic figures are tabular (or supply a face that is), and scope IBM Plex Mono to Latin runs only. This keeps the delivery's numeral system and preserves the no-jitter guarantee.

### CLR-4 — Poster type (28px/800) and the 800 weight are outside the type scale.

**Context.** E4's promise line is 28px/800; R7 and R8 titles are 24px/800. The scale has five roles, the largest non-display being `title` at 22px/700.

**Screenshot.** `review/screenshots/R8-offers.png`

**Current implementation.** Titles render at `title` 22px/700. The delivery reads noticeably heavier.

**Design reference.** Turn 4 uses 24px/800 for screen titles and 26–34px/800 for poster lines; the handoff lists an 800 weight for poster headers.

**Why Engineering cannot decide.** Adding a type role or a weight changes the token contract every screen is built on, and the design system deliberately bars `display` from clinical content. Engineering should not add a sixth role or an eighth weight unilaterally.

**Options.**
1. Raise `title` to 24px/800 and add a `poster` role at 28–34px/800.
2. Keep the scale and accept lighter titles.
3. Reuse `display` (34px/700) for poster lines, with its clinical bar intact.

**Engineering recommendation.** Option 1. The delivery uses both consistently across six screens, so they are part of the system rather than one-offs — and adding them once is cheaper than every screen deviating.

### CLR-5 — Four delivered colours have no semantic role.

**Context.** The role system has 15 names; the delivery names values that do not map onto any of them.

**Screenshot.** `review/screenshots/R8-offers.png`

**Current implementation.** Recorded as `extra` values, unused by any component: info surface #0F2A1E (E4 banner), warning surface #2A2314 with text #D8C9A4, alert ground #7A150F (safety world), declined dot #5E7A6E (R7).

**Design reference.** Each appears in exactly one place in turns 3–4.

**Why Engineering cannot decide.** A colour with no role is a colour a component cannot name, so it either gets hard-coded — which the design system forbids — or the role set grows. Engineering can do neither without Design.

**Options.**
1. Add roles: `infoSurface`, `warningSurface`, `onWarningSurface`, `alertGround`, `inkDisabled`.
2. Fold them into existing roles and accept the shift.
3. Confirm they are one-offs and allow a documented exception list.

**Engineering recommendation.** Option 1 for `infoSurface` and the warning pair, which recur across screens; option 3 for the safety-world ground, which the handoff itself flags as possibly cut by v3/D18.

### CLR-6 — R7 'sent' shows named pharmacies before any offer arrives.

**Context.** The delivery lists «صيدلية الرشيد» as replied and «صيدلية الليل ٢٤» / «صيدلية النور» as thinking, while the request is still open.

**Screenshot.** `review/screenshots/R7-waiting.png`

**Current implementation.** The build shows a count only — «سألنا الصيدليات القريبة» — and names no pharmacy until an offer exists.

**Design reference.** Turn 4 R7-sent names four pharmacies with per-pharmacy status.

**Why Engineering cannot decide.** This is a product question, not a visual one. Revealing which pharmacies were asked, and that a named pharmacy declined, discloses commercial behaviour before any of them chose to answer. D12 forbids ranking; whether it also forbids exposing non-participation is not something Engineering can read off the Blueprint.

**Options.**
1. Show names and per-pharmacy status, as delivered.
2. Show anonymous status only — «٤ صيدليات · ١ ردّت · ٢ تفكّر».
3. Show names only once a pharmacy has replied.

**Engineering recommendation.** Option 2 until Product rules on it. It preserves the delivery's core feeling — that something is actively happening, with several parties involved — without publishing a named pharmacy's decision not to answer.


---

## Remaining implementation work

In the delivery's own priority order.

| # | Work | Blocked by |
| --- | --- | --- |
| 1 | V2 layout — cached banner, light code panel, labelled facts card | CLR-1, CLR-2 |
| 2 | R7 sent — conic ring, responder rows, `dwTick` | CLR-6 |
| 3 | R7 queued — outbox card, dashed explain card | — |
| 4 | R8 — chip component, price suffix scaling, row affordance | CLR-3 |
| 5 | R9 — drop the price breakdown, match delivered sizes | CLR-4 |
| 6 | E4 — build the screen and the `TextField` it needs | CLR-4 |
| 7 | Motion — 5 specified, 0 implemented | — |
| 8 | Icons — 0 of the required set exist | Asset delivery |
| 9 | Responsive — 320 / 360 / 430pt; currently 390pt only | — |
| 10 | Turn-3 screens | DEV-5, Product confirmation |

**Today's fidelity ceiling is 90%.** Icon fidelity is Blocked on
every screen until an icon set exists, so one category in ten is pinned at zero
no matter how faithfully everything else is built.
