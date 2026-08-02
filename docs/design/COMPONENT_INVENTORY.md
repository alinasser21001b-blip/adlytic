# Component Inventory

Every reusable component that exists in the build today, what it is used for,
how many times, which variants exist, and **what the designer must specify**.

Source: `apps/patient/src/ui/kit.tsx`. Usage counts are from the patient app's
screens as of this handoff.

---

## Summary

| Component | Usages | Variants today | Design status |
| --- | --- | --- | --- |
| `Label` | 94 | 5 type roles × 7 colour roles | tokens exist; **no pressed/focus states needed** |
| `InfoCard` | 14 | `default`, `muted` | **invented** — padding, radius, border |
| `Primary` | 10 | `default`, `disabled`, `busy` | **invented** — no pressed state |
| `Secondary` | 10 | `default`, with distinct spoken label | **invented** — no pressed state |
| `Digits` | 7 | 4 type roles | needs a tabular font file |
| `Screen` | 3 (every screen renders through it) | with/without sticky, with/without footer | **invented** — header, footer, safe area |
| `Bidi` | 3 | 4 type roles | correct by construction |
| `ActionCard` | 2 | `default`, `muted` | **invented** — the `+` affordance |
| `Choice` | 2 | `selected`, `unselected` | **invented** — consent control |
| `RedirectNote` | 2 | one | **invented** |
| `StateBlock` | rendered by `Screen` | 6 treatments | **invented** — all six |

---

## 1. `Screen` — the frame every screen renders through

Every patient screen renders through this. It is the reason no screen can ship
without answering "where am I" and "how do I go back".

**Structure today:** header (back affordance + title + optional flow progress) →
optional sticky slot → scrolling body (state block, then content) → optional
footer.

**Variants in use:**
- header with back (`pop` / `replace`) vs without (`none` at a tab root)
- with flow progress caption (`تختار الدواء · 1/6`) vs without
- with sticky slot (F1/F2 pin the search field) vs without
- with screen-supplied footer vs state-supplied footer vs no footer

**Designer must specify**
| Item | Why Engineering needs it | If missing |
| --- | --- | --- |
| Header height, title alignment, back hit-area | Currently 44pt square, invented | Every screen inherits a guess |
| Flow progress treatment (`1/6`) | Currently a caption after a `·` | The journey indicator is punctuation |
| Sticky-slot elevation/divider on scroll | No scroll state exists | Content slides under the search field with no boundary |
| Footer: height, divider, background, safe-area inset | `16 + 24pt` bottom padding is a guessed approximation of a home indicator | Primary action sits under the home indicator on some devices |
| Scroll behaviour of the header (collapse? pin?) | Undefined | Undefined stays undefined |

---

## 2. `Primary` — the one dominant action

48pt tall (above the 44pt floor, because §25 raises the patient primary). A
screen may have **at most one**, counted from the rendered tree every build.

**Variants:** `default`, `disabled`, `busy` (renders a spinner).

**Designer must specify**
- **Pressed state.** *None exists.* This is the most-tapped element in the
  product and nothing happens on touch.
- **Disabled treatment.** Currently `surfaceSunken` fill with `inkSubtle` text.
  Note the rule the build enforces: a disabled primary must have a visible
  explanation near it, so the disabled style and the explanation must be
  designed **together**.
- **Busy treatment.** Currently a bare `ActivityIndicator`. Does the label stay?
  Does the width hold?
- **Full-width vs inset**, and behaviour with a long Arabic label at 200% text.

---

## 3. `Secondary` — never competes

44pt minimum, no fill, no accent background, accent-coloured text. Carries an
optional `spoken` label distinct from its visible text — this exists because
naming the medicine in the visible label wrapped onto two lines and crowded the
stepper, while a screen reader still needs to tell repeated rows apart.

**Designer must specify:** pressed state; whether secondaries are ever grouped
in a row (they are, up to 3 on R1) and how they wrap at 320pt; minimum spacing
between adjacent secondaries so two are not mistaken for one.

---

## 4. `ActionCard` — the whole card is the action

Used on F2 (search results) and R8 (offers). Replaced a filled button on every
row, which put three competing dominant controls on one screen.

**Structure:** content column + a 32pt accent circle containing `+`.

**Designer must specify**
| Item | Why | If missing |
| --- | --- | --- |
| The affordance itself | Currently a `+` character in a circle | The product's most repeated affordance is a text glyph |
| Pressed state for a full-card target | None | A card tap gives no feedback |
| `muted` variant (refused/unavailable item) | Currently `surfaceSunken` | A refused medicine and an available one differ only by background |
| Row density at 320pt with 6 metadata lines | R8's row is the densest thing in the app | It wraps badly on the commonest device |

---

## 5. `InfoCard` — information, not an action

The most-used container (14 usages). Deliberately not pressable: a refused item
renders as information rather than a control that would reject the tap.

**Designer must specify:** padding, radius, border vs elevation, the `muted`
variant, and how nested `InfoCard`s read — R9 nests one (the pharmacist's note)
inside the consent card.

---

## 6. `Choice` — the consent control (safety-critical)

Two options, `radio` role, `accessibilityState.selected`. **Both options carry
deliberately identical visual weight**: a filled "agree" beside an outlined
"refuse" is a nudge, and a nudged consent is not consent (§4 R10).

**Designer must specify**
- Selected vs unselected, keeping the two answers visually equal in weight.
- A **non-colour** selection signal (R-19): today selection is a 2px accent
  border only.
- Pressed state.
- Layout at 320pt: the two labels are `أوافق على البديل` and
  `لا، أريد اللي طلبته` — the second is longer and will wrap.

**Why this one matters most:** it is the control through which a patient
consents to receiving a different medicine than the one prescribed. Any visual
asymmetry between the two answers is a clinical-consent defect, not a style
preference.

---

## 7. `StateBlock` — the six treatments

Renders whichever treatment the screen's contract declared. It cannot fall
through to a generic message; `ux-check` fails the build if a declared state has
no treatment.

| Treatment | Today | Must specify |
| --- | --- | --- |
| `loading` | 3 bars, 48pt tall, 12pt gap, centred, fills the screen | Skeleton per archetype, matching real content shape |
| `empty` (teaching) | centred `title` text + footer action | Illustration or not; tone; spacing |
| `empty` (success/quiet) | same component, muted colour, no action | How "all is well" differs from "nothing here" |
| `error` | alert headline + "work preserved" caption + footer action | Icon? Colour band? Tone at 200% text |
| `offline` | sunken panel, relative age ("آخر تحديث قبل 5 دقيقة") | How "stale" is signalled without alarming |
| `permissionRefused` | centred headline naming the alternative | Never a wall — the alternative is the primary |
| `success` | **never rendered, no usage** | Define it or remove it (R-5) |

---

## 8. `Label`, `Bidi`, `Digits` — the text layer

- **`Label`** — 5 type roles × 7 colour roles. Normalises numerals at render, so
  no call site can leak a second numeral system.
- **`Bidi`** — isolates a Latin run inside Arabic (drug names, codes, prices) so
  it does not reorder. Correct by construction; nothing to design beyond the
  font pairing.
- **`Digits`** — tabular figures for countdowns, prices, quantities.
  **Currently renders in a system fallback because no tabular font is bundled.**

**Designer must specify:** the Arabic/Latin font pairing at every type role, and
the tabular face. See R-2.

---

## 9. Components that do NOT exist and are needed

| Missing component | Needed by | Consequence today |
| --- | --- | --- |
| **Tab bar** | S1, F1 and every `destination` | No top-level navigation exists at all |
| **Modal / sheet chrome** | R1, R4, R5, R7 (`destination: modal`) | Modals render as full screens |
| **Toast / transient confirmation** | `undoDwell` (4000ms) token | The token has nothing to animate |
| **Destructive confirmation** | V5, and the `two-step` state kind | The first destructive action invents its own pattern |
| **Photo viewer** | R3 | A grey placeholder box |
| **Badge / count** | `inbox` destination | Nothing shows pending work |
| **Pull-to-refresh** | Every cached list | Not implemented, no spec |
| **Focus ring** | Accessibility (R-17) | Assistive input hardware is unusable |
| **Text input** — variants and states | F1/F2 search; every form in Entry and Account | One inline input exists, invented, with no error/focus/disabled state |

**This last one is significant.** The Entry group (13 screens) and the Account
group (15 screens) are almost entirely forms, and **no form input component has
been designed** — only a single search field improvised on F1.

---

## 10. Deprecation

Nothing is deprecated. No component has been replaced; two were reshaped
(`ActionCard` replaced per-row primaries; `Choice` replaced an improvised
`Secondary` pair) and the old shapes were removed in the same commit.
