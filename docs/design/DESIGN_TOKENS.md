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
| `surface` | `#0D1A15` | `#0D1A15` | yes |
| `surfaceRaised` | `#142720` | `#142720` | yes |
| `surfaceSunken` | `#1B2B22` | `#1B2B22` | yes |
| `line` | `#1E3A2D` | `#1E3A2D` | yes |
| `ink` | `#F3F7F2` | `#F3F7F2` | yes |
| `inkMuted` | `#9FC6B6` | `#9FC6B6` | yes |
| `inkSubtle` | `#8FA89C` | `#8FA89C` | yes |
| `accent` | `#2ECF9A` | `#2ECF9A` | yes |
| `onAccent` | `#0B241B` | `#0B241B` | yes |
| `success` | `#2ECF9A` | `#2ECF9A` | **never — see R-5** |
| `onSuccess` | `#0B241B` | `#0B241B` | **never — see R-5** |
| `warning` | `#E8B34B` | `#E8B34B` | yes |
| `onWarning` | `#2A2314` | `#2A2314` | **never — see R-5** |
| `alert` | `#FF9C8A` | `#FF9C8A` | yes |
| `onAlert` | `#7A150F` | `#7A150F` | **never — see R-5** |

Two further personas exist in the design system and are **out of scope for this
handoff**: `pharmacy` (dense, dark, high-contrast — the emotional target is
*fast*) and `owner` (neutral, tabular — the target is *certain*). Same 15
role names, different values. Do not design them yet.

### Measured contrast — the pairs a component may actually produce

Floor: **4.5:1** body text, **3:1** large text, **3:1** UI boundaries.

| Pair | Light | Dark | |
| --- | --- | --- | --- |
| `ink on surface` | 16.5 | 16.5 | pass |
| `ink on surfaceRaised` | 14.47 | 14.47 | pass |
| `ink on surfaceSunken` | 13.71 | 13.71 | pass |
| `inkMuted on surface` | 9.55 | 9.55 | pass |
| `inkMuted on surfaceRaised` | 8.37 | 8.37 | pass |
| `inkSubtle on surface` | 7.02 | 7.02 | pass |
| `inkSubtle on surfaceRaised` | 6.15 | 6.15 | pass |
| `onAccent on accent` | 8.19 | 8.19 | pass |
| `onSuccess on success` | 8.19 | 8.19 | pass |
| `onWarning on warning` | 8.14 | 8.14 | pass |
| `onAlert on alert` | 5.34 | 5.34 | pass |
| `accent on surface` | 8.94 | 8.94 | pass |
| `alert on surface` | 8.82 | 8.82 | pass |
| `warning on surface` | 9.34 | 9.34 | pass |

Any colour you change is re-measured on the next build. A failing pair comes
back to you with its measured ratio, not an opinion.

## Typography

| Role | Size | Line height | Weight | May carry clinical content |
| --- | --- | --- | --- | --- |
| `code` | 76pt | 1.15 (= 87pt) | 600 | yes |
| `display` | 34pt | 1.25 (= 43pt) | 700 | **no — barred by type** |
| `poster` | 28pt | 1.45 (= 41pt) | 800 | **no — barred by type** |
| `title` | 24pt | 1.4 (= 34pt) | 800 | yes |
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
