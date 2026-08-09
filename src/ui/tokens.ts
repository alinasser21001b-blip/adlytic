// ════════════════════════════════════════════════════════════════════════
//  src/ui/tokens.ts — ADLYTIC DAYLIGHT, the design contract in code.
//
//  Source: Claude Design handoff, tokens/adlytic-daylight.css v1.0.0-draft.
//  These values are TRANSCRIBED, not authored — every one is copied from the
//  designer's machine-readable token files. Where a value here disagrees
//  with those files, those files are right and this is a bug.
//
//  ── This REPLACES the dark system ────────────────────────────────────
//  The previous version of this file documented a warm dark ramp (#100E0D
//  ground, #D9A759 gold) and argued for it as a deliberate single-theme
//  commitment. Daylight is light, and it replaces dark rather than joining
//  it. The designer's reasoning, kept because it is the load-bearing part:
//  dual-theme doubles the surface every semantic contrast must be verified
//  against, and what this product sells is the legibility of a judgement.
//  One ramp verified once beats two ramps verified loosely.
//
//  The door is left open deliberately. Every name below is SEMANTIC
//  (`ground`, not `white`), so a dark ramp can be added later by overriding
//  one block under [data-theme="dark"] with zero markup change.
//
//  ── Contrast is measured, not assumed ────────────────────────────────
//  Ratios in the comments are against `ground` (#F2F7F4) and come from the
//  designer, who caught two of their own failures doing it: #7C8F87 was
//  used for caption text at 3.2:1 and is now non-text only, and #1D8A63 at
//  4.0:1 is now fills-only with #17714F carrying green text at 5.6:1.
//  Preserve that split — the two greens and the two greys are NOT
//  interchangeable, and swapping them silently fails accessibility.
// ════════════════════════════════════════════════════════════════════════

// ── Surface ─────────────────────────────────────────────────────────────
//
// Three surfaces, and only three. There are NO shadow tokens in this system
// by design: elevation is surface tint plus a 1px border. The dark theme's
// 1px white inset highlight has no light-ground equivalent and was removed
// rather than approximated. If a component reaches for a shadow, the layout
// is wrong.

export const surface = {
  ground: '#F2F7F4',
  surface: '#FFFFFF',
  raised: '#E8F0EA',
  hover: '#E8F0EA',
  border: '#D8E4DC',
  borderStrong: '#C7D8CE',
} as const;

// ── Text ────────────────────────────────────────────────────────────────

export const text = {
  /** 15.8:1 */
  primary: '#0B1F19',
  /** 6.4:1 */
  muted: '#4A5F57',
  /** 4.8:1 — the smallest legal text colour. Nothing fainter carries words. */
  faint: '#5F7268',
  /**
   * 3.2:1 — FAILS as text. Hatching, gridlines and icon strokes ONLY.
   * Named so the violation is visible at the call site: if you find yourself
   * writing `color: nonText`, that is the bug this name exists to catch.
   */
  nonText: '#7C8F87',
} as const;

// ── Brand ───────────────────────────────────────────────────────────────

export const brand = {
  /** 9.9:1 — also the focus ring colour. */
  base: '#0E4034',
  hover: '#0B1F19',
  active: '#082A22',
  /**
   * The lime signal. Legible ONLY on the brand ground, and used at most
   * once per screen — it is the single loudest thing in the system and its
   * value comes entirely from scarcity.
   */
  signal: '#C8F26B',
} as const;

/**
 * SEMANTIC — what the data MEANS. Never decoration, never identity.
 *
 * `info` is the one to protect. It carries INSUFFICIENT_DATA, and it is a
 * calm blue that appears nowhere in the severity ramp: attention is rust,
 * bad and critical are red, info is blue. A merchant cannot confuse "we are
 * still counting" with "something is wrong" because the two never share a
 * hue. That separation is the whole point — do not "harmonise" it.
 */
export const semantic = {
  /** 5.6:1 — green TEXT. */
  good: '#17714F',
  /** 4.0:1 — fails as text. Bars and fills ONLY. */
  goodFill: '#1D8A63',
  /** 4.5:1 */
  attention: '#B4552F',
  /** 6.7:1 */
  bad: '#A32B1E',
  critical: '#A32B1E',
  /** 5.2:1 — INSUFFICIENT_DATA. NEVER a warning. */
  info: '#3E6C8A',
} as const;

/**
 * DATA-VIZ SERIES — which campaign, never how healthy.
 *
 * No colour appears in both this set and `semantic`. A plum line is never
 * "a bad line", it is campaign three.
 */
export const series = [
  '#0E4034',
  '#4A6FA5',
  '#7B4B7E',
  '#B8873B',
  '#5F8A7D',
  '#8C6A5D',
] as const;

export const chart = {
  gridline: '#D8E4DC',
  benchmark: '#0B1F19',
  /** INSUFFICIENT_DATA fill. A pattern, not a colour — it survives greyscale. */
  hatch: 'repeating-linear-gradient(135deg, #F2F7F4 0 7px, #E8F0EA 7px 14px)',
} as const;

// ── Type ────────────────────────────────────────────────────────────────
//
// Two faces, each carrying Arabic AND Latin, chosen precisely so a mixed
// string ("USD 187.50 المبلغ المنفق") never switches typeface mid-line.
//
// NOTE FOR IMPLEMENTATION: these are NOT the fonts currently self-hosted in
// public/fonts (Tajawal, El Messiri). The design loads them from Google
// Fonts; this codebase self-hosts by policy. Both are OFL and can be
// self-hosted — until they are, the fallbacks below take over and the
// product will not look like the design.

export const font = {
  /** Headings, metrics, every number. Metrically matched to IBM Plex Sans. */
  display: "'IBM Plex Sans Arabic', system-ui, sans-serif",
  /** Body. Single face, both scripts. */
  text: "'Readex Pro', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
} as const;

/**
 * Nine tiers, integers only.
 *
 * `caption: 12` is the FLOOR and nothing smaller exists. The designer's own
 * first pass broke this — nav labels at 10px, chips at 10.5–11.5px — and
 * corrected it. The half-pixel sizes that used to be in this codebase came
 * from the same place: nudging one component at a time is not a scale.
 */
export const fontSize = {
  display: 46,
  h1: 36,
  h2: 28,
  h3: 22,
  h4: 18,
  bodyLg: 16,
  body: 14,
  bodySm: 13,
  /** FLOOR. Arabic diacritics and Eastern digits are unreadable below this. */
  caption: 12,
  /** The hero number on a command surface. */
  metric: 30,
  metricSm: 20,
  /** MINIMUM for inputs — below this iOS zooms the viewport on focus. */
  input: 16,
} as const;

// ── Spacing / radius ────────────────────────────────────────────────────
//
// Six steps, non-linear on purpose: the jump from 20 to 32 to 52 is what
// separates "inside a card" from "between sections" without a scale so fine
// that every gap becomes a judgement call.

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 20,
  5: 32,
  6: 52,
} as const;

/**
 * `block: 0` is not an oversight. Structural blocks are square-cornered;
 * only interactive units round. That contrast is what makes a control read
 * as pressable in a system with no shadows to signal it.
 */
export const radius = {
  block: 0,
  unit: 12,
  pill: 999,
} as const;

// ── Motion ──────────────────────────────────────────────────────────────

export const motion = {
  ease: 'cubic-bezier(.2, .8, .2, 1)',
  /** Press feedback. */
  touch: '120ms',
  /** Sheets, drawers, disclosure. */
  panel: '200ms',
  /** A number counting to its new value. The only slow thing in the system. */
  value: '420ms',
} as const;

// ── Accessibility ───────────────────────────────────────────────────────

export const a11y = {
  /** 9.9:1 against ground — well past the 3:1 requirement. */
  focusRing: `2px solid ${brand.base}`,
  focusOffset: 2,
  /** WCAG 2.5.5 AA / Apple HIG. Enforced by the mobile gate. */
  touchMin: 44,
  /** Enforced by the mobile gate. */
  fontSizeMin: 12,
} as const;

// ── Breakpoints ─────────────────────────────────────────────────────────
//
// Unchanged by Daylight — already consolidated from 19 ad-hoc values, and
// guarded by a drift test that fails the build on anything off-scale.

export const breakpoint = {
  xs: 380,
  sm: 560,
  md: 640,
  /** The chrome boundary: sidebar ⇄ bottom nav. */
  lg: 768,
  xl: 900,
  '2xl': 1024,
} as const;

/** Real hardware widths the mobile gate measures. Not breakpoints. */
export const testWidths = [320, 360, 375, 390, 414, 430] as const;

// ── z-index ─────────────────────────────────────────────────────────────

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

export type FontSize = keyof typeof fontSize;
export type Space = keyof typeof space;
export type Radius = keyof typeof radius;
export type Breakpoint = keyof typeof breakpoint;
