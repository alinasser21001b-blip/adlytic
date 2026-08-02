/**
 * RTL and bidirectional text.
 *
 * @blueprint §25 · D29 · D36 · §9 naming rules
 * @owner platform-foundation
 * @why RTL is where ports quietly fail. §25 names three specific hazards this
 *      module removes: a physical offset paired with a physical transform,
 *      which broke centring twice in the prototype; an unisolated Latin run,
 *      which reorders a price beside Arabic so the user reads the wrong number;
 *      and two numeral systems inside one comparison.
 * @implements design/rtl
 */

export type Direction = "rtl" | "ltr";

/** Phase 0 is Arabic only (D34), so the app direction is a constant rather
 *  than a setting. It is a named export so the day Kurdish arrives there is
 *  one place to change. */
export const APP_DIRECTION: Direction = "rtl";

/**
 * Logical edges. A component never names left or right — that is the bug that
 * broke centring twice. `start` and `end` resolve at render time.
 */
export type LogicalEdge = "start" | "end" | "top" | "bottom";

export function resolveEdge(edge: LogicalEdge, dir: Direction): "left" | "right" | "top" | "bottom" {
  if (edge === "top" || edge === "bottom") return edge;
  if (edge === "start") return dir === "rtl" ? "right" : "left";
  return dir === "rtl" ? "left" : "right";
}

/**
 * Things that must NOT mirror under RTL. Mirroring a play button is a bug, not
 * localisation — anything representing physical direction of travel or a
 * clock face stays as it is.
 */
export const NEVER_MIRROR = [
  "play", "pause", "media-controls", "clock", "timer-face",
  "map-north", "route-direction", "checkmark", "logo",
] as const;

export function shouldMirror(iconName: string): boolean {
  return !(NEVER_MIRROR as readonly string[]).includes(iconName);
}

/** One numeral system per surface, chosen once and applied everywhere.
 *  Mixing them inside a single comparison is a defect, not a style. */
export type NumeralSystem = "arabic-indic" | "western";

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

export function formatDigits(value: number | string, system: NumeralSystem): string {
  const s = String(value);
  if (system === "western") return s;
  return s.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]!);
}

/**
 * A run of Latin script or digits inside Arabic text must be isolated, or it
 * reorders. Every drug name, price, phone number and reservation code goes
 * through here.
 */
export type IsolatedRun = { readonly text: string; readonly isolate: true; readonly dir: "ltr" };

export function isolate(text: string): IsolatedRun {
  return { text, isolate: true, dir: "ltr" };
}

/** True when a string contains a run that will misorder if left unisolated. */
export function needsIsolation(text: string): boolean {
  return /[A-Za-z0-9]/.test(text) && /[؀-ۿ]/.test(text);
}
