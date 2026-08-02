/**
 * Route guards — the client's copy of a permission, which decides nothing.
 *
 * @blueprint §5 rule 1 · §5 rule 2 · D26 · D04
 * @owner patient-app
 * @why §5 rule 1 says hidden UI is not a permission and the client enforces
 *      nothing. A guard here exists purely so the user is not shown a door that
 *      will be slammed — the server still refuses, always. Rule 4 also applies:
 *      a guard may only ASK the domain, never compute a rule itself.
 * @implements navigation/guards
 */

export type GuardVerdict =
  | { readonly allow: true }
  /** Redirect, never a blank refusal: principle 2 says no dead ends, so a
   *  blocked route must land somewhere useful with a reason the user reads. */
  | { readonly allow: false; readonly redirectTo: string; readonly because: string };

export type SessionShape = {
  readonly authenticated: boolean;
  readonly activeSubjectMemorialised: boolean;
  /** Whether the domain granted the scope this route needs. Supplied by the
   *  caller from the domain's authority answer — never computed here. */
  readonly hasOrderScope: boolean;
};

export type Guard = {
  readonly name: string;
  readonly bp: string;
  readonly evaluate: (s: SessionShape) => GuardVerdict;
};

/**
 * D26 — the pending action must survive authentication. Losing the user's
 * request because they had to sign in is the most common version of that
 * mistake, and it is why this redirects with an intent rather than discarding.
 */
export const requireSession: Guard = {
  name: "requireSession",
  bp: "D26 · §3.2",
  evaluate: (s) => s.authenticated
    ? { allow: true }
    : { allow: false, redirectTo: "E4", because: "نحتاج رقمك حتى نخبرك عندما ترد الصيدليات" },
};

/** §5 — the client hides what the server would refuse. Convenience only. */
export const requireOrderScope: Guard = {
  name: "requireOrderScope",
  bp: "§5 clinical matrix",
  evaluate: (s) => s.hasOrderScope
    ? { allow: true }
    : { allow: false, redirectTo: "S4", because: "تحتاج صلاحية الطلب لهذا الشخص" },
};

/** D04 — a memorialised subject accepts no new activity, but stays readable. */
export const blockMemorialised: Guard = {
  name: "blockMemorialised",
  bp: "D04",
  evaluate: (s) => s.activeSubjectMemorialised
    ? { allow: false, redirectTo: "S1", because: "هذا السجل صار للقراءة فقط" }
    : { allow: true },
};

/** Guards run in order and the FIRST refusal wins, so the reason the user
 *  reads is the first thing that actually stopped them rather than the last. */
export function runGuards(guards: readonly Guard[], s: SessionShape): GuardVerdict {
  for (const g of guards) {
    const v = g.evaluate(s);
    if (!v.allow) return v;
  }
  return { allow: true };
}

/** Which guards protect which routes. Declared once, so a new screen cannot
 *  be added without deciding what protects it. */
export const ROUTE_GUARDS: Readonly<Record<string, readonly Guard[]>> = {
  R1: [requireSession, requireOrderScope, blockMemorialised],
  R6: [requireSession, requireOrderScope, blockMemorialised],
  R7: [requireSession],
  R8: [requireSession],
  V1: [requireSession],
  V2: [requireSession],
  V4: [requireSession],
  R13: [requireSession],
  S1: [requireSession],
  // F1 and F2 are deliberately unguarded — a guest browses and searches before
  // giving us anything (§3.1), and the account is asked for at the first action
  // that needs one.
  F1: [],
  F2: [],
  R11: [requireSession],
};
