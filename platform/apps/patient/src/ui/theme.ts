/**
 * The patient palette, resolved once for the whole app.
 *
 * @blueprint §25 · D34 · design/color
 * @owner patient-app
 * @why A component never picks a colour, a size or a distance — it names a
 *      role and receives a value. That is what makes the accessibility test
 *      meaningful: it measures the pairs this file can produce, and a raw hex
 *      in a stylesheet would be a pair nobody measured.
 */
import { palettes, patientCodePanel, space, radius, tap, type as typeScale, fontStack, APP_DIRECTION, type Palette, type Scheme } from "@dawai/design";

export type Theme = {
  readonly scheme: Scheme;
  readonly color: Palette;
  readonly space: typeof space;
  readonly radius: typeof radius;
  readonly tap: typeof tap;
  readonly type: typeof typeScale;
  readonly direction: typeof APP_DIRECTION;
  /** The one font family used for Arabic text. Chosen here so no component
   *  reaches for a system default mid-sentence. */
  readonly fontFamily: string;
  /** Digits that do not change width. §27: a countdown attached to a patient's
   *  anxiety must not visibly jitter. */
  readonly tabularFamily: string;
  /** The light panel that carries the reservation code — the one surface in the
   *  patient app that inverts. Its pairs are measured separately by the gate. */
  readonly codePanel: typeof patientCodePanel;
};

export const themeFor = (scheme: Scheme): Theme => ({
  scheme,
  color: palettes.patient[scheme],
  space, radius, tap, type: typeScale,
  direction: APP_DIRECTION,
  fontFamily: fontStack.arabic[0]!,
  tabularFamily: fontStack.tabular[0]!,
  codePanel: patientCodePanel,
});

/** A text style from a role. Line height is a multiplier in the token and an
 *  absolute value in React Native, so the conversion happens once, here. */
export function textStyle(t: Theme, role: keyof typeof typeScale, color: keyof Palette = "ink") {
  const s = t.type[role];
  return {
    fontFamily: t.fontFamily,
    fontSize: s.size,
    lineHeight: Math.round(s.size * s.lineHeight),
    // Always zero: Arabic is a connected script and tracking breaks the joins.
    letterSpacing: s.letterSpacing,
    fontWeight: String(s.weight) as "400" | "500" | "600" | "700",
    color: t.color[color],
    writingDirection: t.direction,
    textAlign: "right" as const,
  };
}
