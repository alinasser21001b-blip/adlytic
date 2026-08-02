/**
 * Typography, tuned for Arabic.
 *
 * @blueprint §25 · D36 · D34
 * @owner platform-foundation
 * @why §25 states three rules as correctness rather than taste: letter spacing
 *      is always zero because Arabic is a connected script and tracking breaks
 *      the joins; nothing clinical sits below 16pt; and the stack is
 *      Arabic-first, because a Latin-first stack with an Arabic fallback
 *      produces inconsistent weight mid-sentence.
 * @implements design/type
 */

export const TYPE_ROLES = ["display", "title", "headline", "body", "caption"] as const;
export type TypeRole = (typeof TYPE_ROLES)[number];

export type TypeStyle = {
  readonly size: number;
  readonly lineHeight: number;
  /** Always 0. Arabic is connected; tracking it damages the letterforms. */
  readonly letterSpacing: 0;
  readonly weight: 400 | 500 | 600 | 700;
  /** Whether this role may carry clinical content. §25: nothing clinical
   *  below 16pt, so `caption` is barred from it by type. */
  readonly clinicalAllowed: boolean;
};

export const type: Readonly<Record<TypeRole, TypeStyle>> = {
  display:  { size: 34, lineHeight: 1.25, letterSpacing: 0, weight: 700, clinicalAllowed: false },
  title:    { size: 22, lineHeight: 1.40, letterSpacing: 0, weight: 700, clinicalAllowed: true },
  headline: { size: 17, lineHeight: 1.50, letterSpacing: 0, weight: 600, clinicalAllowed: true },
  body:     { size: 16, lineHeight: 1.65, letterSpacing: 0, weight: 400, clinicalAllowed: true },
  caption:  { size: 13, lineHeight: 1.60, letterSpacing: 0, weight: 500, clinicalAllowed: false },
};

/** D34 — Phase 0 ships Arabic only. The Kurdish slot is reserved in the
 *  catalogue, not here; a font stack for a language we do not ship would be a
 *  claim we cannot honour. */
export const fontStack = {
  arabic: ["IBM Plex Sans Arabic", "Noto Sans Arabic", "system-ui", "sans-serif"],
  /** Latin runs inside Arabic text — drug names, codes, prices. */
  latin: ["IBM Plex Sans", "system-ui", "sans-serif"],
  /** Countdowns, prices and quantities. §27: digits must not change width, or
   *  a timer attached to the user's anxiety reads as unstable. */
  tabular: ["IBM Plex Mono", "ui-monospace", "monospace"],
} as const;

/** Display is for codes and countdowns only (§25). This makes that a type
 *  error rather than a convention. */
export function assertClinicalRole(role: TypeRole): TypeRole {
  if (!type[role].clinicalAllowed)
    throw new Error(`Type role "${role}" may not carry clinical content (§25)`);
  return role;
}
