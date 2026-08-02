/**
 * Colour — three palettes, one system, never merged at runtime.
 *
 * @blueprint §25 · §2
 * @owner platform-foundation
 * @why §25 gives the three experiences opposite emotional targets: the patient
 *      app must feel calm, the pharmacy app fast, the owner console certain.
 *      Semantic roles are identical across all three so a component never
 *      knows which persona it is in — a component that branches on persona is
 *      where role isolation starts to rot.
 * @implements design/color
 */

/** Every colour a component may name. Roles, never hues. */
export const COLOR_ROLES = [
  "surface", "surfaceRaised", "surfaceSunken", "line",
  "ink", "inkMuted", "inkSubtle",
  "accent", "onAccent",
  "success", "onSuccess",
  "warning", "onWarning",
  "alert", "onAlert",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export type Palette = Readonly<Record<ColorRole, string>>;
export type Persona = "patient" | "pharmacy" | "owner";
export type Scheme = "light" | "dark";

/**
 * Patient — "Night Mint" (ليل النعناع), as delivered by Design, turn 4.
 *
 * The delivery is dark-first: a deep green ground with mint as the ONLY signal
 * colour, so a single accent carries every "this is the action" moment and
 * nothing else competes. The light sibling palette is not yet designed and is
 * registered as an open item — see TD-10.
 *
 * §25's emotional target is unchanged: calm, because the user is frightened and
 * speed only matters because waiting is frightening.
 */
const patientDark: Palette = {
  surface: "#0D1A15",        // ground
  surfaceRaised: "#142720",  // card
  surfaceSunken: "#1B2B22",  // the cached/offline strip
  line: "#1E3A2D",           // borders, dividers, chip fills
  ink: "#F3F7F2",
  inkMuted: "#9FC6B6",       // "muted-strong" — body-level secondary
  inkSubtle: "#8FA89C",      // "muted" — captions and meta
  accent: "#2ECF9A",
  onAccent: "#0B241B",
  // Design did not distinguish success from accent — R-5 remains unanswered,
  // and the delivery uses the mint for "replied — offer arrived". Held equal
  // rather than invented.
  success: "#2ECF9A", onSuccess: "#0B241B",
  warning: "#E8B34B", onWarning: "#2A2314",
  // Design's alert is a GROUND for the safety world (#7A150F), not a text
  // colour. The roles here are text-on-surface, so the ground becomes onAlert
  // and the readable red becomes alert. Flagged — see the handoff notes.
  alert: "#FF9C8A", onAlert: "#7A150F",
};

/**
 * The light panel that carries the reservation code on V2 — a deliberately
 * light card on the dark ground, so the code reads like something printed.
 * It is the one surface in the patient app that inverts, which is why its
 * pairs are measured separately below.
 */
export const patientCodePanel = {
  surface: "#F7F4EE",
  ink: "#16211D",
  // DEVIATION, pending confirmation. Design specified #6B7A74, which measures
  // 4.10:1 on #F7F4EE — below the 4.5 body floor, on the screen Blueprint v3
  // says must never fail, for the line that tells the patient what to do with
  // the code. Darkened to the nearest value in the same hue family that clears
  // the floor: 4.61:1. Revert the moment Design confirms a replacement.
  inkMuted: "#63726B",
} as const;

/** Light is NOT YET DESIGNED. The delivery is dark-first and its daylight
 *  sibling is a known open item, so the patient app renders dark until one
 *  arrives — showing an undesigned light scheme would ship something nobody
 *  drew. Kept identical to dark so nothing silently renders half-designed. */
const patientLight: Palette = patientDark;

/** Pharmacy — dense, dark, high contrast. The emotional target is fast. */
const pharmacyDark: Palette = {
  surface: "#0B1512", surfaceRaised: "#132320", surfaceSunken: "#060D0B", line: "#22403A",
  ink: "#F2F8F6", inkMuted: "#AFC4BD", inkSubtle: "#8DA49D",
  accent: "#A8E85C", onAccent: "#0A1703",
  success: "#7BD6AC", onSuccess: "#07130E",
  warning: "#F0BE72", onWarning: "#1E1503",
  alert: "#FF9C8A", onAlert: "#260B06",
};
const pharmacyLight: Palette = {
  surface: "#F7F9F7", surfaceRaised: "#FFFFFF", surfaceSunken: "#ECF0EC", line: "#D2DCD6",
  ink: "#0E1A16", inkMuted: "#3B4B45", inkSubtle: "#556760",
  accent: "#2F5E12", onAccent: "#FFFFFF",
  success: "#186047", onSuccess: "#FFFFFF",
  warning: "#7A4E0A", onWarning: "#FFFFFF",
  alert: "#8C2F1F", onAlert: "#FFFFFF",
};

/** Owner — neutral, tabular. The emotional target is certain. */
const ownerLight: Palette = {
  surface: "#FAFAFA", surfaceRaised: "#FFFFFF", surfaceSunken: "#F0F0F0", line: "#DCDCDC",
  ink: "#151719", inkMuted: "#41474B", inkSubtle: "#5A6166",
  accent: "#14497D", onAccent: "#FFFFFF",
  success: "#186047", onSuccess: "#FFFFFF",
  warning: "#7A4E0A", onWarning: "#FFFFFF",
  alert: "#8C2F1F", onAlert: "#FFFFFF",
};
const ownerDark: Palette = {
  surface: "#111315", surfaceRaised: "#1A1D20", surfaceSunken: "#0B0D0E", line: "#2F3438",
  ink: "#F3F5F7", inkMuted: "#BAC3C9", inkSubtle: "#98A3AA",
  accent: "#8CC2F5", onAccent: "#04121F",
  success: "#7BD6AC", onSuccess: "#07130E",
  warning: "#F0BE72", onWarning: "#1E1503",
  alert: "#FF9C8A", onAlert: "#260B06",
};

/**
 * Palettes are looked up, never merged. Each app imports exactly one persona;
 * the function exists so the accessibility tests can iterate all six.
 */
export const palettes: Readonly<Record<Persona, Readonly<Record<Scheme, Palette>>>> = {
  patient: { light: patientLight, dark: patientDark },
  pharmacy: { light: pharmacyLight, dark: pharmacyDark },
  owner: { light: ownerLight, dark: ownerDark },
};

/**
 * The pairs a component is allowed to place together. Listing them is what
 * lets the accessibility test measure EVERY combination that can actually
 * appear — an untested pair is a pair that fails in production.
 */
/**
 * Pairs that live outside the persona palettes and must still be measured.
 * The V2 code panel was invisible to the gate until Design delivered it — a
 * light card on a dark ground is not expressible as two roles from one palette,
 * so it is measured explicitly rather than not at all.
 */
/**
 * The one raised information strip in the entry flow — E4's «طلبك محفوظ» band.
 *
 * A delivered colour with no semantic role: it is not a card, not a warning and
 * not the sunken plane. It says "the thing you were doing is still here", which
 * is a category the role system does not have and should not grow one for on
 * the strength of a single use. Its pairs are measured like any other.
 */
export const patientInfoStrip = {
  surface: "#0F2A1E",
  ink: "#F3F7F2",
  inkMuted: "#9FC6B6",
} as const;

export const EXTRA_PAIRS: readonly (readonly [string, string, string])[] = [
  [patientCodePanel.ink, patientCodePanel.surface, "V2 code panel: ink on light panel"],
  [patientCodePanel.inkMuted, patientCodePanel.surface, "V2 code panel: caption on light panel"],
  [patientInfoStrip.ink, patientInfoStrip.surface, "E4 info strip: the preserved request"],
  [patientInfoStrip.inkMuted, patientInfoStrip.surface, "E4 info strip: surrounding sentence"],
];

export const CONTRACT_PAIRS: readonly (readonly [ColorRole, ColorRole])[] = [
  ["ink", "surface"], ["ink", "surfaceRaised"], ["ink", "surfaceSunken"],
  ["inkMuted", "surface"], ["inkMuted", "surfaceRaised"],
  ["inkSubtle", "surface"], ["inkSubtle", "surfaceRaised"],
  ["onAccent", "accent"], ["onSuccess", "success"],
  ["onWarning", "warning"], ["onAlert", "alert"],
  ["accent", "surface"], ["alert", "surface"], ["warning", "surface"],
  // `line` became a background the moment R8 got tags. It was a border-only
  // role, so text on it was going unmeasured and the accessibility gate was
  // passing without looking at two pairs the product actually renders.
  ["inkMuted", "line"], ["warning", "line"], ["ink", "line"],
];
