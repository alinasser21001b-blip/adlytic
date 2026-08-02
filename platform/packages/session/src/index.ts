/**
 * @dawai/session — session lifecycle and the pending intent.
 *
 * @blueprint §6 Session · D26 · D28 · §3.1 · §3.2
 * @owner identity-service
 * @why The single rule that matters here is D26: the pending action must
 *      survive authentication. Losing a user's request because they had to
 *      sign in is the most common version of that mistake, and for a
 *      frightened patient it is the moment they close the app. Modelling the
 *      intent as part of the session makes discarding it impossible rather
 *      than merely discouraged.
 * @implements session/session
 */

export type SessionState = "guest" | "authenticating" | "authenticated";

/**
 * What the user was trying to do when we interrupted them. Carried through
 * authentication and replayed on the other side.
 */
export type PendingIntent = {
  readonly screen: string;
  /** Opaque draft the screen needs to resume exactly where it was — a
   *  half-built request, a chosen subject. Never interpreted here. */
  readonly draft: Readonly<Record<string, unknown>>;
  readonly startedAt: number;
};

export type Session =
  | { readonly state: "guest"; readonly pending: PendingIntent | null }
  | { readonly state: "authenticating"; readonly pending: PendingIntent | null; readonly challengeId: string }
  | {
      readonly state: "authenticated";
      readonly accountId: string;
      readonly activeSubjectId: string;
      /** Present only until the app has replayed it. */
      readonly pending: PendingIntent | null;
    };

export const guest = (): Session => ({ state: "guest", pending: null });

/**
 * The user hit something that needs an account. Remember what they were doing.
 * §3.1: the account is requested at the first action that requires one, with
 * the reason stated — never as a wall on launch.
 */
export function interrupt(s: Session, intent: PendingIntent): Session {
  if (s.state === "authenticated") return s;
  return { state: "guest", pending: intent };
}

export function beginVerification(s: Session, challengeId: string): Session {
  return { state: "authenticating", pending: s.pending, challengeId };
}

/** Abandoning verification keeps the intent. The user may come back. */
export function abandonVerification(s: Session): Session {
  return { state: "guest", pending: s.state === "guest" ? s.pending : s.pending };
}

export function authenticate(s: Session, accountId: string, activeSubjectId: string): Session {
  return { state: "authenticated", accountId, activeSubjectId, pending: s.pending };
}

/**
 * Take the intent exactly once. Returning it and clearing it in one call is
 * what stops a replay loop, and makes "replayed" a fact rather than a flag
 * someone must remember to set.
 */
export function takePending(s: Session): readonly [PendingIntent | null, Session] {
  if (s.pending === null) return [null, s];
  const intent = s.pending;
  const next: Session = s.state === "authenticated"
    ? { ...s, pending: null }
    : { ...s, pending: null };
  return [intent, next];
}

/** D28 — sign-out destroys the encrypted cache key, and therefore the cache.
 *  The caller performs the destruction; this returns the session that must
 *  accompany it, with no residue of the previous account. */
export function signOut(): Session {
  return guest();
}

export function switchSubject(s: Session, subjectId: string): Session {
  return s.state === "authenticated" ? { ...s, activeSubjectId: subjectId } : s;
}
