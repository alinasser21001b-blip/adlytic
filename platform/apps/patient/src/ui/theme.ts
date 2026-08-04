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
import { palettes, patientCodePanel, patientInfoStrip, space, frame, radius, tap, type as typeScale, fontStack, APP_DIRECTION, type Palette, type Scheme } from "@dawai/design";

export type Theme = {
  readonly scheme: Scheme;
  readonly color: Palette;
  readonly space: typeof space;
  readonly radius: typeof radius;
  /** Gutter and safe-area allowances, named so a screen never measures them. */
  readonly frame: typeof frame;
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
  /** E4's preserved-request strip. A delivered colour with no role. */
  readonly infoStrip: typeof patientInfoStrip;
};

const build = (scheme: Scheme): Theme => ({
  scheme,
  color: palettes.patient[scheme],
  space, frame, radius, tap, type: typeScale,
  direction: APP_DIRECTION,
  fontFamily: fontStack.arabic[0]!,
  tabularFamily: fontStack.tabular[0]!,
  codePanel: patientCodePanel,
  infoStrip: patientInfoStrip,
});

/**
 * There are two themes and they are constants, so there are two objects.
 *
 * Building a fresh one per call gave every render a theme with a new identity.
 * `t` is threaded through every component in the app, so that identity is a
 * prop on all of them: nothing downstream can ever be skipped by React.memo or
 * held stable by a dependency array, however carefully it is written. The
 * theme is derived from frozen tokens and cannot change at runtime — a new
 * object per render was never describing a new value.
 */
const BUILT: Readonly<Record<Scheme, Theme>> = { light: build("light"), dark: build("dark") };

export const themeFor = (scheme: Scheme): Theme => BUILT[scheme];

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
