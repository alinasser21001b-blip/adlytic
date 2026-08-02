# Design Tokens — current values

> **Generated — do not edit.** These are the values the application renders
> with **today**, read from `packages/design/src/tokens/`. They are the
> starting point, not the answer: change any of them, but change them here in
> the design system rather than on a layer.
>
> The contrast column is **measured**, not asserted — computed with the WCAG
> relative-luminance formula on every build. A pair below the floor fails the
> build.

## Colour — patient persona

15 semantic roles. A component names a role and receives a value; no component
writes a hex. Two schemes.

| Role | Light | Dark | Used in code |
| --- | --- | --- | --- |
| `surface` | `#FBFAF7` | `#0F1513` | yes |
| `surfaceRaised` | `#FFFFFF` | `#182220` | yes |
| `surfaceSunken` | `#F2F1EC` | `#0A100E` | yes |
| `line` | `#DFDDD3` | `#2C3A35` | yes |
| `ink` | `#16211D` | `#F1F6F4` | yes |
| `inkMuted` | `#42524C` | `#B6C5BF` | yes |
| `inkSubtle` | `#5C6B64` | `#93A49E` | yes |
| `accent` | `#186047` | `#7BD6AC` | yes |
| `onAccent` | `#FFFFFF` | `#07130E` | yes |
| `success` | `#186047` | `#7BD6AC` | **never — see R-5** |
| `onSuccess` | `#FFFFFF` | `#07130E` | **never — see R-5** |
| `warning` | `#7A4E0A` | `#F0BE72` | yes |
| `onWarning` | `#FFFFFF` | `#1E1503` | **never — see R-5** |
| `alert` | `#8C2F1F` | `#FF9C8A` | yes |
| `onAlert` | `#FFFFFF` | `#260B06` | **never — see R-5** |

Two further personas exist in the design system and are **out of scope for this
handoff**: `pharmacy` (dense, dark, high-contrast — the emotional target is
*fast*) and `owner` (neutral, tabular — the target is *certain*). Same 15
role names, different values. Do not design them yet.

### Measured contrast — the pairs a component may actually produce

Floor: **4.5:1** body text, **3:1** large text, **3:1** UI boundaries.

| Pair | Light | Dark | |
| --- | --- | --- | --- |
| `ink on surface` | 15.85 | 16.91 | pass |
| `ink on surfaceRaised` | 16.54 | 14.92 | pass |
| `ink on surfaceSunken` | 14.63 | 17.59 | pass |
| `inkMuted on surface` | 7.91 | 10.31 | pass |
| `inkMuted on surfaceRaised` | 8.26 | 9.1 | pass |
| `inkSubtle on surface` | 5.38 | 7.08 | pass |
| `inkSubtle on surfaceRaised` | 5.61 | 6.24 | pass |
| `onAccent on accent` | 7.49 | 10.88 | pass |
| `onSuccess on success` | 7.49 | 10.88 | pass |
| `onWarning on warning` | 7.19 | 10.58 | pass |
| `onAlert on alert` | 8.26 | 9.16 | pass |
| `accent on surface` | 7.18 | 10.6 | pass |
| `alert on surface` | 7.92 | 9.12 | pass |
| `warning on surface` | 6.89 | 10.83 | pass |

Any colour you change is re-measured on the next build. A failing pair comes
back to you with its measured ratio, not an opinion.

## Typography

| Role | Size | Line height | Weight | May carry clinical content |
| --- | --- | --- | --- | --- |
| `display` | 34pt | 1.25 (= 43pt) | 700 | **no — barred by type** |
| `title` | 22pt | 1.4 (= 31pt) | 700 | yes |
| `headline` | 17pt | 1.5 (= 26pt) | 600 | yes |
| `body` | 16pt | 1.65 (= 26pt) | 400 | yes |
| `caption` | 13pt | 1.6 (= 21pt) | 500 | **no — barred by type** |

- **Letter-spacing is 0 on every role, always.** Arabic is a connected script
  and tracking breaks the joins. This is not adjustable.
- `display` and `caption` cannot carry clinical content. A dosage set in
  `caption` is a compile error, not a review comment.
- Families named in code and **not bundled**: IBM Plex Sans Arabic, IBM Plex
  Sans, IBM Plex Mono. See R-2.

## Spacing — a 4pt rhythm

| Token | Value |
| --- | --- |
| `space-0` | 0pt |
| `space-1` | 4pt |
| `space-2` | 8pt |
| `space-3` | 12pt |
| `space-4` | 16pt |
| `space-5` | 20pt |
| `space-6` | 24pt |
| `space-7` | 32pt |
| `space-8` | 40pt |
| `space-9` | 48pt |
| `space-10` | 64pt |

No value outside this scale exists in the product. A 6pt gap cannot be built
without adding a token.

## Radius

| Token | Value |
| --- | --- |
| `sm` | 8pt |
| `md` | 12pt |
| `lg` | 16pt |
| `xl` | 22pt |
| `pill` | 999pt |

## Touch targets

| Token | Value | Applies to |
| --- | --- | --- |
| `min` | 44pt | every control, everywhere — measured on every rendered state |
| `patientPrimary` | 48pt | the primary action in the patient app |
| `pharmacyPrimary` | 56pt | the pharmacy app — used one-handed at speed with a customer waiting |

## Motion — declared, none implemented

| Token | Duration | Easing (name only — **needs cubic-bézier values**) | What it teaches |
| --- | --- | --- | --- |
| `screenPush` | 350ms | standard | where you are in the hierarchy |
| `sheetPresent` | 300ms | spring | this is temporary and layered above |
| `sheetDrag` | 0ms | standard | you are in control of it — follows the finger 1:1 |
| `doseConfirmed` | 250ms | decelerate | it was recorded |
| `skeletonToReal` | 150ms | standard | the wait is over |
| `responderArrive` | 200ms | decelerate | someone answered, just now |
| `undoDwell` | 4000ms | standard | you still have time |
| `errorShake` | 200ms | standard | that input, not another |

## Elevation — declared, none specified

`flat` · `raised` · `overlay` · `sheet` · `alert`

Five levels exist as names with no visual definition, and no component reads
them. See R-3.
