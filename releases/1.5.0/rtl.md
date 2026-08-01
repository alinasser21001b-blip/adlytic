# RTL / Bidirectional Verification — Dawai Platform 1.5.0

Manifest: `release-manifest.yaml` · Policy: 1.0.0
Verified by: `ci:ui-kit-verify@workflow-v1`
Tool: playwright-chromium build 1194
Scope: `dawai-site/dawai-ui-kit.html`, 23 screens, Arabic UI with Latin drug
names and Arabic-Indic numerals.

## Method

Rendered every screen under `dir="rtl"` at 390px and 320px and asserted no
element escaped the viewport on either edge, checking `left < -1` as well as
`right > vw + 1`. An RTL layout fails to the left, which a right-edge-only
check does not see.

## Result: PASS

## Standing rules confirmed in the artifact

- `letter-spacing: 0` is set globally and not overridden anywhere. Arabic is a
  connected script; tracking it damages the glyph joins.
- Body line-height 1.7, heading line-height 1.5.
- Latin drug names, dosages, prices, phone numbers, and reservation codes are
  `<bdi>`-isolated. Without isolation these reorder when adjacent to Arabic.
- `font-variant-numeric: tabular-nums` on countdowns, prices, and quantities so
  digits do not change width as they tick.

## Known-fragile pattern, checked explicitly

Centring an absolutely-positioned element in an RTL document has broken twice
in this codebase. `inset-inline-start` paired with a physical `translate` does
not centre — the logical offset and the physical transform disagree under RTL.
The rule is a physical `left: 50%` with `translate(-50%, -50%)`. Confirmed no
occurrence of the broken pairing in this artifact.
