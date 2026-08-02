# Design Fidelity Report

> **Generated — do not edit.** `npm run design` diffs the repository against
> the delivered specification transcribed in
> `platform/tools/design/fidelity.mjs`. **Colour and typography are computed**;
> the other eight categories are recorded judgement. A report written by hand is
> a self-assessment — this is a comparison.

**Delivery under assessment:** Night Mint (ليل النعناع) · turn `4a` · 360pt · dark · arabic-indic numerals

---

## Overall fidelity

# 51%

6 screens × 10 categories = 60 assessments.

| Verdict | Count | Share |
| --- | --- | --- |
| Exact Match | 23 | 38% |
| Minor Deviation | 9 | 15% |
| Intentional Deviation | 1 | 2% |
| Missing | 21 | 35% |
| Blocked | 6 | 10% |

Exact and Intentional both count 1.0 — an approved, recorded deviation is
faithful, because it is a decision rather than a defect. Minor counts 0.75.
Missing and Blocked count 0.

| Screen | | Fidelity |
| --- | --- | --- |
| `V2` | Reservation (cached-first) | 68% |
| `R7-queued` | Waiting · queued | 57% |
| `R7-sent` | Waiting · sent | 45% |
| `R8` | Offers | 63% |
| `R9` | Substitution consent | 65% |
| `E4` | Why we need your number | 10% |

- **Completed:** 5 of 6 built
- **Not started:** `E4`
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

### `V2` — Reservation (cached-first) · 68%

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
| Responsive | Missing | Rendered and checked at 390pt only. The delivery is 360pt and the brief requires 320/360/430. |

### `R7-queued` — Waiting · queued · 57%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Minor Deviation | The build has the right shape — title, explanation, no countdown — but lacks the delivered outbox card listing the queued lines and the dashed card that explains why there is no timer. |
| Typography | Exact Match | The `title` role now carries the delivered 24px/800, raised while building V2; this screen's heading picked it up with no screen-level change. |
| Spacing | Exact Match | 20px gutter, matching the delivered range. |
| Colour | Exact Match | Palette applied. |
| Component | Missing | The dashed explain card is a new component; the outbox line list is not built. |
| Motion | Missing | None implemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | Enforced. |
| RTL | Exact Match | Enforced. |
| Responsive | Missing | 390pt only. |

### `R7-sent` — Waiting · sent · 45%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Missing | The delivery replaces the bar with a conic-gradient ring plus a per-pharmacy responder list (replied / thinking / declined). The build renders a linear progress bar and an offer count. |
| Typography | Minor Deviation | Ring time is delivered as 15px mono tabular; the build uses the `display` role. |
| Spacing | Exact Match | Within the delivered ranges. |
| Colour | Exact Match | Palette applied. The delivered declined-dot #5E7A6E has no role and is recorded as an extra. |
| Component | Missing | Conic ring and responder row are both new components. |
| Motion | Missing | `dwTick` on thinking dots is specified and unimplemented — the screen's whole point is that something is happening. |
| Icon | Blocked | No icon set. |
| Accessibility | Minor Deviation | The ring needs a text equivalent; a conic gradient conveys progress by shape alone. |
| RTL | Exact Match | Enforced. |
| Responsive | Missing | 390pt only. |

### `R8` — Offers · 63%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Minor Deviation | Row content and order match the delivery — name, exact price, coverage as n-of-m, distance, band chips, readiness, amber missing-line. The build additionally renders a trailing add affordance the delivery does not have, and states the ordering rule above the list as delivered. |
| Typography | Minor Deviation | Price is delivered at 19px mono 700 with an 11px currency suffix; the build renders one `title` run with no suffix scaling. |
| Spacing | Exact Match | 14px card padding, 10px gaps — inside the delivered ranges. |
| Colour | Exact Match | All rows identical: same card, same 1px line, no highlight. Matches the delivery's central requirement. |
| Component | Minor Deviation | Chips are not a component — they are inline Labels. The delivery uses them on every row. |
| Motion | Missing | Offer arrival stagger (~200ms) unimplemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | Enforced. Row labels name the pharmacy. |
| RTL | Exact Match | Enforced. |
| Responsive | Missing | The densest screen in the product, checked at 390pt only. The brief singles it out for 320pt. |

### `R9` — Substitution consent · 65%

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Minor Deviation | Requested-vs-offered as two equal cards, verbatim pharmacist quote, scope note and two equal answers — all as delivered. The build orders them consent-first, then the price breakdown; the delivery has no price breakdown on this screen. |
| Typography | Minor Deviation | The delivery shows the Arabic name and the Latin name as separate lines inside each card; the build does the same. Sizes differ (16px/12px delivered vs the 17px/13px roles). |
| Spacing | Exact Match | Within the delivered ranges. |
| Colour | Exact Match | Both answers share the same #142720 fill and 2px #2ECF9A border — the delivery's non-negotiable. |
| Component | Exact Match | `Choice` already renders two visually identical answers with radio semantics. |
| Motion | Missing | None implemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Exact Match | Radio role and selected state; both answers equal in weight, enforced by test. |
| RTL | Exact Match | Enforced. |
| Responsive | Missing | 390pt only. |

### `E4` — Why we need your number · 10%

**NOT BUILT.** A contract exists; no pixels do.

| Category | Verdict | Detail |
| --- | --- | --- |
| Layout | Missing | Contract exists; no pixels. The delivery specifies a preserved-request banner, poster-scale promise copy, and a phone field with LTR mono runs. |
| Typography | Missing | 28px/800 poster type is above the `title` role and has no token. |
| Spacing | Missing | Not built. |
| Colour | Exact Match | Palette available; the delivered info surface #0F2A1E has no role and is recorded as an extra. |
| Component | Missing | No TextField component exists anywhere in the product. |
| Motion | Missing | None implemented. |
| Icon | Blocked | No icon set. |
| Accessibility | Missing | Not built. |
| RTL | Missing | Not built. |
| Responsive | Missing | Not built. |


---

## Intentional deviations

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

### CLR-3 — R8 rows: does the delivery intend a tap affordance?

**Context.** R8's rows are the action — there is no primary button, which both the delivery and the Blueprint require.

**Screenshot.** `review/screenshots/R8-offers.png`

**Current implementation.** Each row carries a trailing 32pt mint circle as its affordance, introduced before the design landed.

**Design reference.** Turn 4 R8 has no affordance on any row. The subtitle says «افتح أي عرض حتى تشوف تفاصيله».

**Why Engineering cannot decide.** Removing it makes the rows read as static text with no signal that they are tappable; keeping it adds a mint element the delivery does not have, on the one screen where visual equality between pharmacies is a hard requirement.

**Options.**
1. Remove the circle and rely on the subtitle plus a pressed state.
2. Replace it with a low-contrast chevron on every row — equal across rows, so neutrality holds.
3. Keep the mint circle.

**Engineering recommendation.** Option 2, once an icon set exists. A chevron is the platform-conventional 'this row opens' signal, carries no emphasis, and is identical on every row so it cannot elevate one pharmacy. Until then, option 1 with a pressed state.

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
