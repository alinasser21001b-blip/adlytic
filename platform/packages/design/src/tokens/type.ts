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

export const TYPE_ROLES = ["code", "display", "poster", "title", "headline", "body", "caption"] as const;
export type TypeRole = (typeof TYPE_ROLES)[number];

export type TypeStyle = {
  readonly size: number;
  readonly lineHeight: number;
  /** Always 0. Arabic is connected; tracking it damages the letterforms. */
  readonly letterSpacing: 0;
  readonly weight: 400 | 500 | 600 | 700 | 800;
  /** Whether this role may carry clinical content. §25: nothing clinical
   *  below 16pt, so `caption` is barred from it by type. */
  readonly clinicalAllowed: boolean;
};

export const type: Readonly<Record<TypeRole, TypeStyle>> = {
  /** The reservation code on V2, at the size the Night Mint delivery draws it.
   *  It is the largest thing in the product because it is what a patient holds
   *  up at a counter. Clinical: it identifies a specific dispense. */
  code:     { size: 76, lineHeight: 1.15, letterSpacing: 0, weight: 600, clinicalAllowed: true },
  display:  { size: 34, lineHeight: 1.25, letterSpacing: 0, weight: 700, clinicalAllowed: false },
  /** Poster lines — E4's promise copy. Delivered at 28/800. */
  poster:   { size: 28, lineHeight: 1.45, letterSpacing: 0, weight: 800, clinicalAllowed: false },
  // Delivered at 24/800 across R7, R8 and R9 — raised from 22/700 to match.
  title:    { size: 24, lineHeight: 1.40, letterSpacing: 0, weight: 800, clinicalAllowed: true },
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
