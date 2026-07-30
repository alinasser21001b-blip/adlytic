# The measured baseline every exploration is compared against

Captured from `trusted-baseline-cc4ca1a` at 320 / 390 / 430 px, Arabic RTL, dark
theme, on the six surfaces §10 names. Raw numbers in `baseline-fingerprint.json`;
18 full-page screenshots held outside the repo.

This is a MEASUREMENT, not a design brief. It exists so "did the product think
differently?" is answered with evidence instead of impression.

## What the current build measures

| surface | scroll height 320 / 390 / 430 | what the eye lands on first (heaviest text in viewport 1) |
|---|---|---|
| home | 2677 / 2609 / 2556 | wordmark · HbA1c · haemoglobin |
| record | 2747 / 2628 / 2628 | patient name · the diabetes problem · screen title |
| episode | 1217 / 1190 / 1190 | problem name (twice) · HbA1c |
| results | 880 / 880 / 880 | screen title · metric name · metric name |
| timeline | 1658 / 1658 / 1658 | screen title · `01` · `01` |
| navigation | 2449 / 2214 / 2055 | three doctor names |

## Three weaknesses this exposes, with numbers

1. **430px is not used, only filled.** `record`, `episode`, `results` and
   `timeline` have byte-identical scroll heights at 390 and 430. The layout
   reflows; it does not re-compose. Any exploration claiming to use the extra
   width has to change these numbers.

2. **The timeline's heaviest elements are the screen title and two bare day
   numbers** (`01`, `01`). On a longitudinal record's own chronology, nothing
   about the trajectory reaches the top of the visual hierarchy.

3. **Results is one viewport (880px at every width) and the VALUE is not in its
   top three.** The title and two metric names outweigh the numbers, on the one
   screen whose entire purpose is the numbers.

## How this will be used

An exploration is not stronger merely because its screenshots look better. It is
stronger if it moves these measurements in a defensible direction AND survives
`tools/core-integrity.mjs`, `npm test`, `tools/journeys.mjs` and
`tools/audit-ui.mjs`. A green suite proves nothing about the first question.

## A caveat that applies to ALL visual evidence in this environment

`document.fonts` reports **zero loaded face rules**. The stylesheet link to
Google Fonts resolves to nothing here — no request even fails, it simply never
produces a face — so `--disp: 'Readex Pro'` falls through to `system-ui`.

Every screenshot taken in this container, including the eighteen baseline
captures above and every visual review performed earlier in this project, has
rendered Arabic in a **system fallback face, not the product's typeface.**

What this does and does not invalidate:

- **Still valid:** structure, hierarchy ratios, layout, spacing, wrapping,
  bidi order, contrast, touch targets, overflow. All are relative or
  computed and hold under a substituted face.
- **NOT evidenced here:** any claim about the typeface itself — its Arabic
  rhythm, optical size, leading suitability, or the feel of a chosen face.
  A concept resting on a specific typographic voice cannot be proven in this
  container, and must be flagged as an untested assumption rather than
  presented as a validated result.

Separately: 12 Arabic-capable faces ARE installed (`fc-list :lang=ar`), among
them a serif with Arabic coverage. So a two-face typographic argument can be
mocked here with substitutes even though the product's own face cannot. "No
Arabic font is available" is not a valid reason to skip visual evidence.
