/**
 * Accessibility — measured, never judged by eye.
 *
 * @blueprint §25 · §26
 * @owner platform-foundation
 * @why §25 requires every text-on-background pair to carry a measured contrast
 *      ratio, and says plainly that contrast is measured rather than eyeballed
 *      — amber on cream failed at 4.08:1 in the prototype and looked fine. It
 *      also states that the target user is frequently elderly, low-vision or
 *      has a tremor, and that this is the median user rather than an edge case.
 * @implements design/a11y
 */

/** WCAG 2.1 minimums. §25 fixes these as product requirements. */
export const CONTRAST = {
  bodyText: 4.5,
  largeText: 3.0,
  uiBoundary: 3.0,
} as const;

const channel = (v: number): number =>
  v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

/** Relative luminance, WCAG 2.1 §1.4.3. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: "${hex}"`);
  const n = parseInt(m[1]!, 16);
  const r = channel(((n >> 16) & 255) / 255);
  const g = channel(((n >> 8) & 255) / 255);
  const b = channel((n & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function meets(a: string, b: string, minimum: number): boolean {
  return contrastRatio(a, b) >= minimum;
}

/** Rounded down, so a reported figure never flatters a pair that is borderline. */
export const reportRatio = (a: string, b: string): number =>
  Math.floor(contrastRatio(a, b) * 100) / 100;
