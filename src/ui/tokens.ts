// ════════════════════════════════════════════════════════════════════════
//  src/ui/tokens.ts — THE DESIGN CONTRACT, in code.
//
//  Every visual value in Adlytic resolves from this file. A page that wants
//  a colour, a size, a radius or a duration reads a token; it does not type
//  a number. That rule is what makes the system a system.
//
//  ── Why this exists ───────────────────────────────────────────────────
//  Measured on the codebase before this file:
//    · radii in use:  2, 3, 4, 9, 11, 12, 16, 999px  (8 values, no scale)
//    · font sizes:    10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 16px
//                     (half-pixel sizes, which no type scale produces)
//    · shadows:       hand-written per component
//  The palette was NOT the problem — it is warm, distinctive and on-brand.
//  The absence of scales was. This file keeps the brand and imposes the
//  scales.
//
//  ── Arabic first ──────────────────────────────────────────────────────
//  The product is RTL and Arabic-default. Two consequences run through
//  every token below:
//    1. Type floors are higher than a Latin-first system would set them.
//       Arabic diacritics and Eastern digits become genuinely unreadable
//       below 12px on a phone; there is no 10px tier, at all.
//    2. Spacing and layout use LOGICAL properties (inline-start/end), never
//       left/right. A physical margin-left silently inverts in RTL.
// ════════════════════════════════════════════════════════════════════════

// ── Colour ──────────────────────────────────────────────────────────────
//
// A warm near-black ground with a gold accent. Deliberately not the cold
// blue-grey of enterprise dashboards: this product speaks to a shop owner
// in Baghdad, not a CFO. The neutrals carry a brown bias (hue ~25°) rather
// than pure grey, which is what makes the surface read as warm rather than
// as unstyled dark mode.

export const palette = {
  /** Ground → raised surface. Each step is a real elevation, not decoration. */
  ground:      '#100E0D',
  surface:     '#1A1613',
  surfaceRaised: '#221D19',
  surfaceHover:  '#2A2420',

  border:      '#322B25',
  borderStrong: '#3D352D',

  /** Text ramp. `muted` is the floor for body copy — `faint` is for chrome
   *  only and must never carry a number the merchant needs to read. */
  text:        '#F3EFE7',
  textMuted:   '#B8AC9C',
  textFaint:   '#746A5C',

  /** Gold. The single accent — spend boldness here and nowhere else. */
  accent:      '#D9A759',
  accentBright: '#E6BD7A',
  accentSoft:  '#F0D4A3',
} as const;

/**
 * SEMANTIC colour. Separate from the accent by contract.
 *
 * The accent says "this is Adlytic". These say "this is good / this needs
 * attention / this is broken". A chart series must never borrow a semantic
 * colour to mean "series 2", and a healthy state must never be gold just
 * because gold is the brand — that would make brand and meaning
 * indistinguishable, which is how dashboards start lying.
 */
export const semantic = {
  good:        '#34A871',
  goodSoft:    'rgba(52,168,113,0.12)',
  attention:   '#C77A1F',
  attentionSoft: 'rgba(199,122,31,0.12)',
  bad:         '#E2604F',
  badSoft:     'rgba(226,96,79,0.12)',
  critical:    '#C7382A',
  criticalSoft: 'rgba(199,56,42,0.14)',
  /**
   * NEUTRAL INFORMATION — used for INSUFFICIENT_DATA and NOT_APPLICABLE.
   * Deliberately NOT a warning colour. "Still collecting" is not a problem
   * and must not be painted like one; the analytics layer distinguishes
   * these states and the UI must too.
   */
  info:        '#7BAEC2',
  infoSoft:    'rgba(123,174,194,0.12)',
} as const;

/**
 * DATA VISUALISATION series. A separate ramp on purpose.
 *
 * Chart colour encodes IDENTITY (which campaign, which unit), never health.
 * Ordered by perceptual distinctness at small size on a dark ground, and
 * distinguishable in the common red-green deficiencies — a merchant reading
 * two lines on a phone must be able to tell them apart.
 */
export const dataViz = [
  '#4FB3A6',  // teal
  '#D9A759',  // gold
  '#8B9DD9',  // periwinkle
  '#E08A5C',  // clay
  '#A88BC9',  // mauve
  '#6FA8DC',  // sky
] as const;

// ── Typography ──────────────────────────────────────────────────────────
//
// Tajawal throughout: it carries Arabic and Latin in one family with
// matching colour and weight, so a mixed string ("USD 187.50 المبلغ المنفق")
// does not visibly change typeface mid-line.

export const font = {
  family: "'Tajawal', system-ui, -apple-system, 'Segoe UI', sans-serif",
  /** Digits align in columns. Non-negotiable anywhere numbers stack. */
  numeric: "'Tajawal', ui-monospace, monospace",
} as const;

/**
 * Type scale. Integer sizes only — the half-pixel values that existed
 * before (10.5, 11.5, 12.5, 13.5) came from nudging individual components,
 * which is the absence of a scale rather than a fine-grained one.
 *
 * `xs: 12` is the FLOOR and it is enforced by the mobile gate. There is no
 * tier below it; Arabic at 10px on a phone is not small, it is unreadable.
 */
export const fontSize = {
  xs:   12,   // captions, chrome labels, tags — the floor
  sm:   13,   // secondary body, table cells
  base: 14,   // body
  md:   16,   // emphasised body; also the iOS no-zoom input floor
  lg:   18,   // card titles
  xl:   21,   // section headings
  '2xl': 26,  // page headings
  '3xl': 32,  // the single hero number on a command surface
} as const;

export const fontWeight = {
  regular: 400,
  medium:  500,
  semibold: 600,
  bold:    700,
} as const;

export const lineHeight = {
  /** Numbers and single-line labels — no extra leading. */
  tight: 1.2,
  /** UI text. */
  snug: 1.4,
  /** Running Arabic prose. Arabic needs more leading than Latin at the same
   *  size because of ascender/descender density and diacritics. */
  relaxed: 1.7,
} as const;

// ── Spacing ─────────────────────────────────────────────────────────────
//
// 4px base. Every gap, pad and inset resolves here. Values are unitless
// numbers so a consumer can compute (e.g. `space[4] * 2`) without parsing.

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ── Radius ──────────────────────────────────────────────────────────────
//
// Soft, not rounded-to-pill. The brief asks for friendly-but-professional:
// pills are reserved for status and filter chips, where the shape itself
// carries "this is a tag, not a button".

export const radius = {
  sm:  6,
  md:  10,
  lg:  14,
  xl:  20,
  pill: 999,
} as const;

// ── Elevation ───────────────────────────────────────────────────────────
//
// Five steps, each pairing a hairline top highlight with a soft drop. On a
// dark warm ground a pure drop shadow reads as a smudge; the 1px inset
// highlight is what makes a card look lifted rather than dirty.

export const shadow = {
  none: 'none',
  sm:  'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.20)',
  md:  'inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 18px rgba(0,0,0,0.18)',
  lg:  'inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 32px rgba(0,0,0,0.28)',
  /** Sheets and drawers — the layer above everything. */
  overlay: '0 -8px 40px rgba(0,0,0,0.45)',
  /** The accent glow. ONE use: the single primary action on a surface. */
  accentGlow: '0 4px 14px rgba(217,167,89,0.28)',
} as const;

export const border = {
  hairline: `1px solid ${palette.border}`,
  strong:   `1px solid ${palette.borderStrong}`,
  accent:   `1px solid ${palette.accent}`,
  /** Marks the ONE thing on screen that needs action. */
  focusRing: `2px solid ${palette.accentBright}`,
} as const;

// ── Motion ──────────────────────────────────────────────────────────────
//
// Light and quick. Every duration below is under 300ms: this is a tool
// someone opens to answer a question, and animation that makes them wait
// is animation that makes the product feel slower than it is.
//
// EVERY consumer must honour prefers-reduced-motion. `instant` exists so
// that reduction is a token swap rather than a per-component conditional.

export const motion = {
  instant: '0ms',
  fast:    '120ms',
  base:    '200ms',
  slow:    '280ms',
  /** Decelerate — things arrive and settle, never overshoot. */
  ease:    'cubic-bezier(0.22, 0.61, 0.36, 1)',
  /** For elements leaving; slightly faster out than in. */
  easeOut: 'cubic-bezier(0.4, 0.0, 1, 1)',
} as const;

// ── Breakpoints ─────────────────────────────────────────────────────────
//
// The consolidated scale. Before this, 19 distinct breakpoints were in use
// including 700/720/760/768/800 — four near-identical reflows nobody could
// reason about. A drift guard in test_page_scripts.mjs fails the build if a
// value outside this set appears in a media query.

export const breakpoint = {
  /** Smallest real phones (iPhone SE, older Androids). */
  xs: 380,
  /** Large phones. */
  sm: 560,
  /** Phablet / small tablet portrait. */
  md: 640,
  /** THE phone/desktop boundary — chrome changes here. */
  lg: 768,
  /** Small laptop. */
  xl: 900,
  /** Desktop. */
  '2xl': 1024,
} as const;

/** Device widths the mobile gate measures. Not breakpoints — real hardware. */
export const testWidths = [320, 360, 375, 390, 414, 430] as const;

// ── Accessibility floors ────────────────────────────────────────────────

export const a11y = {
  /** WCAG 2.5.5 AA / Apple HIG. Enforced by the mobile gate. */
  touchTargetMin: 44,
  /** Below this, Arabic is unreadable on a phone. Enforced by the gate. */
  fontSizeMin: 12,
  /** iOS zooms the viewport on focus below this. */
  inputFontMin: 16,
  /** WCAG AA for body text. */
  contrastBodyMin: 4.5,
  /** WCAG AA for large text and UI components. */
  contrastLargeMin: 3.0,
} as const;

// ── z-index ─────────────────────────────────────────────────────────────
//
// Named layers. An arbitrary z-index is how a modal ends up behind a
// sticky header at 2am.

export const layer = {
  base: 0,
  raised: 10,
  stickyHeader: 100,
  bottomNav: 200,
  drawer: 300,
  sheet: 400,
  dialog: 500,
  toast: 600,
} as const;

export type Palette = typeof palette;
export type Semantic = typeof semantic;
export type FontSize = keyof typeof fontSize;
export type Space = keyof typeof space;
export type Radius = keyof typeof radius;
export type Breakpoint = keyof typeof breakpoint;
