# Asset Checklist

Everything that must be exported and handed to Engineering. **The repository
currently contains zero design assets** — no icons, no fonts, no images:

```
$ find apps packages -name "*.svg" -o -name "*.png" -o -name "*.ttf" -o -name "*.otf"
(no results)
```

Every visual element in the product today is a Unicode character, a background
colour, or a border.

---

## 1. Icons — Priority 0

**Format:** SVG, 24×24 viewBox, single path where possible, `currentColor` fill
(so a component can tint by colour role rather than shipping a variant per
colour). Stroke-based icons must be outlined before export, or the stroke
scales wrongly at 200% text.

**Naming:** `icon-<name>-<style>.svg`, kebab-case, e.g. `icon-back-line.svg`.

### 1.1 Icons currently faked by a text character — these block the build

| Icon | Currently | Used on |
| --- | --- | --- |
| `back` | `‹` U+2039 | every screen header |
| `add` | `+` | F2 and R8 result rows |
| `search` | `⌕` U+2315 | F1, F2 search field |
| `increase` | `+` | R1 quantity stepper |
| `decrease` | `−` U+2212 | R1 quantity stepper |
| `bullet` | `·` | R3 legibility checklist |

**Mirroring:** the design system already declares which icons must **never**
mirror under RTL — `play`, `pause`, media controls, `clock`, `timer-face`,
`map-north`, `route-direction`, `checkmark`, `logo`. Every delivered icon must
be marked mirror / do-not-mirror.

### 1.2 Icons the built screens need and do not have

| Icon | Needed by |
| --- | --- |
| `close` / `dismiss` | every modal (R1, R4, R5, R7) |
| `camera` | R2 |
| `retake` | R3 |
| `phone` | V2 "اتصل بالصيدلية" |
| `directions` / `map-pin` | V2 "خذني للصيدلية" |
| `pharmacy` | R8 offer rows, V2 |
| `prescription` | R1 lines requiring a photo |
| `warning` | prescription-required, substitution, urgency |
| `error` | error treatments |
| `offline` / `cloud-off` | offline treatments |
| `check` | consent agreed, collected reservation |
| `clock` | countdowns on R7 and V2 |
| `chevron-end` | rows that lead somewhere |

### 1.3 Tab bar icons — blocked on R-8

One selected and one unselected per tab. The destinations declared in the
contracts are `today`, `find`, `me`, `inbox`, `holds` (pharmacy) and `branch`
(pharmacy). Which of these are patient tabs is a design decision that has not
been made.

---

## 2. Typography — Priority 0

| Need | Weights | Why |
| --- | --- | --- |
| Arabic family | 400, 500, 600, 700 | Four weights are declared across the 5 type roles |
| Latin family | 400, 500, 600, 700 | Drug names, codes; must not shift weight mid-sentence |
| Tabular / monospaced figures | at least 400, 600 | §27: countdowns must not jitter |

**Formats:** `.ttf` or `.otf` for React Native, plus `.woff2` if the review
dashboard is to render in the real face.
**Licence:** commercial-use licence documentation, per family.
**Delivery:** `apps/patient/assets/fonts/`.

Currently declared but not bundled: `IBM Plex Sans Arabic`, `IBM Plex Sans`,
`IBM Plex Mono`. Either supply those files or nominate replacements.

---

## 3. App identity — Priority 2 (blocks store submission)

| Asset | Sizes | Notes |
| --- | --- | --- |
| App icon (iOS) | 1024 master + full set | Must read at 40pt |
| App icon (Android) | adaptive: foreground + background layers, 108dp | Plus legacy 512 |
| Notification icon (Android) | 24dp monochrome, white on transparent | The product's core promise is a notification |
| Splash / launch | per density, both orientations if R-23 says landscape | E1 "Launch" has a `loading` state and no design |
| Store screenshots | per store spec | After the redesign, not before |

**None of these exist.** No device build can be produced without the app icon,
and no store submission without the rest.

---

## 4. Illustrations — Priority 3, but a decision is Priority 1

Currently **every empty and error state is text on a background**. Blueprint §22
says the empty state is the highest-attention moment in the product, which
argues for illustration; the calm, medical tone argues against.

**A decision is required either way.** If illustrations: SVG, both schemes,
with a specified maximum height so they do not push the action out of thumb
reach. If not: say so explicitly, and specify the typographic treatment that
replaces them.

States that would need one: F1 teaching-empty, F2 catalogue miss, R1 empty
draft, R7 waiting, R8 no offers, R13 nothing pending, S1 both empties, every
error treatment, permission-refused on R2.

---

## 5. What Engineering does with these

| Asset | Destination |
| --- | --- |
| Icons | `packages/design/src/icons/` — exported as a typed set so an unknown icon name is a compile error |
| Fonts | `apps/patient/assets/fonts/`, registered in the native build |
| App icon / splash | native project configuration |
| Illustrations | `packages/design/src/illustrations/` |

**Naming is not cosmetic here.** Icons become a typed union in the design
package; a name that does not exist fails the type check rather than rendering
an empty box at runtime. Renaming an icon after delivery is a breaking change.

---

## 6. Definition of done

- [ ] Every icon in §1.1 and §1.2 delivered as SVG with a mirror flag
- [ ] Tab bar icon set delivered, once R-8 decides the tabs
- [ ] Font files delivered with licences, all four weights per family
- [ ] Tabular figures verified: `0000` and `1111` measure identically
- [ ] App icon at every required size, both platforms
- [ ] Notification icon, monochrome
- [ ] Splash screen, both schemes
- [ ] Illustration decision made and, if yes, assets delivered for the 10 states
- [ ] Every asset legible at 320pt width and at 200% text scale
