// ════════════════════════════════════════════════════════════════════════
//  MIRROR of src/ui/tokens.ts — Adlytic Daylight.
//
//  Not a second design system. The web product's tokens live in
//  `src/ui/tokens.ts` at the repository root; this file restates the subset
//  the iOS client renders, because a React Native bundle cannot import
//  across the package boundary without metro configuration that would break
//  the moment someone moved a folder.
//
//  A restated constant is a constant that can drift, so it is not left to
//  discipline: `test_mobile_contract.ts` asserts every value below against
//  `src/ui/tokens.ts` and fails the build when the two disagree. Change the
//  web token and this file fails until it follows.
//
//  Two rules from that file are load-bearing and are repeated here because
//  breaking them silently fails accessibility:
//    · `text.faint` (#5F7268) is the faintest colour allowed to carry words.
//      `text.nonText` (#7C8F87) is 3.2:1 — hatching and icon strokes ONLY.
//    · `semantic.good` (#17714F) is green TEXT; `semantic.goodFill`
//      (#1D8A63) is 4.0:1 and is for fills only, never type.
// ════════════════════════════════════════════════════════════════════════

export const surface = {
  ground: '#F2F7F4',
  surface: '#FFFFFF',
  raised: '#E8F0EA',
  hover: '#E8F0EA',
  border: '#D8E4DC',
  borderStrong: '#C7D8CE',
} as const;

export const text = {
  primary: '#0B1F19',
  muted: '#4A5F57',
  faint: '#5F7268',
  /** NON-TEXT ONLY: 3.2:1. Dividers, icon strokes, hatching. Never words. */
  nonText: '#7C8F87',
  /** On the brand ground. */
  onBrand: '#FFFFFF',
} as const;

export const brand = {
  base: '#0E4034',
  hover: '#0B1F19',
  active: '#082A22',
  /** At most ONE per screen, and only on brand-dark ground. */
  signal: '#C8F26B',
} as const;

export const semantic = {
  good: '#17714F',
  goodFill: '#1D8A63',
  attention: '#B4552F',
  bad: '#A32B1E',
  critical: '#A32B1E',
  /** INSUFFICIENT_DATA. A calm blue that appears nowhere in the severity
   *  ramp, so "still counting" can never read as "something is wrong". */
  info: '#3E6C8A',
} as const;

export const fontSize = {
  h1: 36,
  h2: 28,
  h3: 22,
  h4: 18,
  bodyLg: 16,
  body: 14,
  bodySm: 13,
  caption: 12,
  metric: 30,
  metricSm: 20,
  input: 16,
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 20,
  5: 32,
  6: 52,
} as const;

export const radius = {
  unit: 12,
  pill: 999,
} as const;

export const a11y = {
  /** Apple HIG / WCAG 2.5.5. Every tappable thing clears this. */
  touchMin: 44,
  /** Below this is unreadable on a phone. */
  fontSizeMin: 12,
} as const;
