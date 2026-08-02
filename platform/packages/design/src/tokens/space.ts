/**
 * Spacing, radius and tap targets.
 *
 * @blueprint §25 · §26
 * @owner platform-foundation
 * @why Blueprint v3 §25 fixes a 4pt rhythm and states that no value outside it
 *      exists. A raw number in a stylesheet is a future inconsistency nobody
 *      can find, so the scale is the only way to express distance and the
 *      lint rule below has something concrete to enforce.
 * @implements design/space
 */

/** The 4pt rhythm. There is no value outside this scale. */
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64,
} as const;

export type SpaceToken = keyof typeof space;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export type RadiusToken = keyof typeof radius;

/**
 * Touch targets. §25: 44pt minimum everywhere; 48 for primary patient actions;
 * 56 for primary pharmacy actions, because that device is used one-handed at
 * speed with a customer waiting.
 */
export const tap = {
  min: 44,
  patientPrimary: 48,
  pharmacyPrimary: 56,
} as const;

/** Elevation is expressed as a role, never a shadow string, so a component
 *  cannot invent a depth that does not exist in the system. */
export const elevation = { flat: 0, raised: 1, overlay: 2, sheet: 3, alert: 4 } as const;
export type ElevationToken = keyof typeof elevation;
