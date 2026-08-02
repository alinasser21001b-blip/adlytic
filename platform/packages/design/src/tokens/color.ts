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
 * Patient — warm, calm, generous. §25: the emotional target is calm, because
 * the user is frightened and speed only matters because waiting is frightening.
 */
const patientLight: Palette = {
  surface: "#FBFAF7", surfaceRaised: "#FFFFFF", surfaceSunken: "#F2F1EC", line: "#DFDDD3",
  ink: "#16211D", inkMuted: "#42524C", inkSubtle: "#5C6B64",
  accent: "#186047", onAccent: "#FFFFFF",
  success: "#186047", onSuccess: "#FFFFFF",
  warning: "#7A4E0A", onWarning: "#FFFFFF",
  alert: "#8C2F1F", onAlert: "#FFFFFF",
};
const patientDark: Palette = {
  surface: "#0F1513", surfaceRaised: "#182220", surfaceSunken: "#0A100E", line: "#2C3A35",
  ink: "#F1F6F4", inkMuted: "#B6C5BF", inkSubtle: "#93A49E",
  accent: "#7BD6AC", onAccent: "#07130E",
  success: "#7BD6AC", onSuccess: "#07130E",
  warning: "#F0BE72", onWarning: "#1E1503",
  alert: "#FF9C8A", onAlert: "#260B06",
};

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
export const CONTRACT_PAIRS: readonly (readonly [ColorRole, ColorRole])[] = [
  ["ink", "surface"], ["ink", "surfaceRaised"], ["ink", "surfaceSunken"],
  ["inkMuted", "surface"], ["inkMuted", "surfaceRaised"],
  ["inkSubtle", "surface"], ["inkSubtle", "surfaceRaised"],
  ["onAccent", "accent"], ["onSuccess", "success"],
  ["onWarning", "warning"], ["onAlert", "alert"],
  ["accent", "surface"], ["alert", "surface"], ["warning", "surface"],
];
