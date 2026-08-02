/**
 * Verifying a phone number — the challenge, its attempts and its expiry.
 *
 * @blueprint E5 · E6 · §6 Session · §9 Identity
 * @owner identity-service
 * @why Blueprint v3 declares four distinct ways E6 can fail — a wrong code with
 *      attempts left, exhausted attempts, an expired code, and an SMS that
 *      never arrived — and they are not variations of one error. Each leads
 *      somewhere different: try again, start over, request a new code, or use
 *      another route entirely. Modelling them as one "invalid" would collapse
 *      four recoveries into a shrug.
 *
 *      Attempts and expiry live here rather than on a screen because they are
 *      the security property, not a presentation detail. A client that could
 *      decide it had one more attempt would be a client that could decide it
 *      had a hundred; the server is the authority and this is the shape of the
 *      answer it gives, so the screen can render a refusal it did not compute.
 */
import { defineMachine, transition } from "../shared/machine.js";
import { REFUSAL, refuse, type Refusal } from "../shared/refusal.js";
import { ok, err, type Result } from "../shared/result.js";
import type { Instant } from "../shared/instant.js";

/* ── The challenge lifecycle ──────────────────────────────────────────── */

export type ChallengeState = "requested" | "sent" | "verified" | "spent" | "expired";

export type ChallengeEvent =
  | "delivered" | "correctCode" | "wrongCode" | "attemptsExhausted" | "timePassed" | "resend";

export const ChallengeMachine = defineMachine<ChallengeState, ChallengeEvent>({
  name: "Challenge",
  bp: "§9 Identity · E6",
  initial: ["requested"],
  terminal: ["verified", "spent", "expired"],
  transitions: [
    { from: "requested", on: "delivered", to: "sent", bp: "E6" },
    { from: "sent", on: "correctCode", to: "verified", bp: "E6" },
    // A wrong code with attempts left leaves the challenge usable. That is the
    // whole point of counting attempts rather than burning the challenge.
    { from: "sent", on: "wrongCode", to: "sent", bp: "E6 f: wrong code, attempts left" },
    { from: "sent", on: "attemptsExhausted", to: "spent", bp: "E6 f: exhausted attempts" },
    { from: "sent", on: "timePassed", to: "expired", bp: "E6 f: expired code" },
    { from: "requested", on: "timePassed", to: "expired", bp: "E6" },
    // Resending starts a new challenge; it does not revive a dead one.
    { from: "expired", on: "resend", to: "requested", bp: "E6 f: SMS never arrived" },
    { from: "spent", on: "resend", to: "requested", bp: "E6 f: exhausted attempts" },
  ],
});

/** How many wrong codes before the challenge is spent. */
export const MAX_ATTEMPTS = 5;

/** How long a code is worth typing. */
export const CODE_LIFETIME_MS = 10 * 60_000;

export type Challenge = {
  readonly challengeId: string;
  readonly state: ChallengeState;
  /** Wrong codes so far. Never negative, never above the maximum. */
  readonly used: number;
  readonly issuedAt: Instant;
};

export const attemptsLeft = (c: Challenge): number => Math.max(0, MAX_ATTEMPTS - c.used);

export const isExpired = (c: Challenge, now: Instant): boolean =>
  now - c.issuedAt >= CODE_LIFETIME_MS;

/**
 * Judge one submitted code.
 *
 * Expiry is checked BEFORE the attempt is counted: a code that has run out of
 * time is not a wrong answer, and spending one of a patient's five attempts on
 * the clock having moved would be the app punishing them for its own timing.
 */
export function submit(
  c: Challenge,
  correct: boolean,
  now: Instant,
): Result<Challenge, Refusal> {
  if (c.state !== "sent") return err(refuse(REFUSAL.ILLEGAL_TRANSITION, { from: c.state, on: "submit" }));

  if (isExpired(c, now)) {
    const moved = transition(ChallengeMachine, c.state, "timePassed");
    if (moved.ok === false) return moved;
    return err(refuse(REFUSAL.CODE_EXPIRED, { challengeId: c.challengeId }));
  }

  if (correct) {
    const moved = transition(ChallengeMachine, c.state, "correctCode");
    return moved.ok ? ok({ ...c, state: moved.value }) : moved;
  }

  const used = c.used + 1;
  if (used >= MAX_ATTEMPTS) {
    const moved = transition(ChallengeMachine, c.state, "attemptsExhausted");
    if (moved.ok === false) return moved;
    return err(refuse(REFUSAL.ATTEMPTS_EXHAUSTED, { challengeId: c.challengeId, used }));
  }

  return err(refuse(REFUSAL.WRONG_CODE, { challengeId: c.challengeId, left: MAX_ATTEMPTS - used }));
}

/**
 * The attempt that a wrong code consumed, applied.
 *
 * `submit` returns a refusal for a wrong code because the caller must not treat
 * it as progress, but the count still moved — and losing that would give a
 * patient unlimited guesses. Kept separate so neither can be done by accident.
 */
export function consumeAttempt(c: Challenge): Challenge {
  return c.state === "sent" && c.used < MAX_ATTEMPTS ? { ...c, used: c.used + 1 } : c;
}
