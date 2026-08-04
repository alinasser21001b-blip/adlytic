/**
 * Feature flags — every flag has an owner and a removal version.
 *
 * @blueprint §10 · D20
 * @owner platform-foundation
 * @why The release governance already in this repository refuses to ship a flag
 *      whose removal version has arrived, because a flag with no removal date
 *      is permanent complexity pretending to be temporary. The registry
 *      mirrors that rule here so a flag cannot be added without both fields.
 * @implements config/flags
 */

export type FlagDefinition = {
  readonly name: string;
  readonly owner: string;
  /** Semver at or after which this flag must be gone. Checked by the release
   *  gate, which fails the build when the version has arrived. */
  readonly removeBy: string;
  readonly defaultValue: boolean;
  /** Blueprint reference. A flag gating behaviour the Blueprint does not
   *  describe would be an invented product decision. */
  readonly blueprint: string;
};

export type FlagRegistry = readonly FlagDefinition[];

/**
 * Phase 0 ships no feature flags.
 *
 * This is not an omission. Blueprint v3 §3 lists exactly what Phase 0 contains,
 * and nothing in it is conditional. A flag added here would gate behaviour the
 * Blueprint does not describe, which Rule 3 and the forbidden list both refuse.
 */
export const PHASE_0_FLAGS: FlagRegistry = [];

export interface FlagSource {
  isEnabled(name: string): boolean;
}

export function flagResolver(registry: FlagRegistry, source: FlagSource) {
  const byName = new Map(registry.map((f) => [f.name, f]));
  return {
    isEnabled(name: string): boolean {
      const def = byName.get(name);
      // An unregistered flag is a bug, not a default. Returning false silently
      // would let a typo disable a feature with no signal.
      if (!def) throw new Error(`Feature flag "${name}" is not registered`);
      try { return source.isEnabled(name); } catch { return def.defaultValue; }
    },
    registry,
  };
}
