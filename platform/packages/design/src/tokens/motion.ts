/**
 * Motion — every animation must teach the user something.
 *
 * @blueprint §27 · §26
 * @owner platform-foundation
 * @why §27's rule is that every animation must answer "what did this teach the
 *      user?", and that motion with no answer is latency in a costume. Each
 *      duration below therefore carries what it teaches; a new entry without
 *      one does not type-check.
 * @implements design/motion
 */

export type MotionToken = {
  readonly duration: number;
  readonly easing: "standard" | "decelerate" | "accelerate" | "spring";
  /** What this teaches. §27 requires an answer, so the field is required. */
  readonly teaches: string;
};

export const motion = {
  screenPush:      { duration: 350, easing: "standard",   teaches: "where you are in the hierarchy" },
  sheetPresent:    { duration: 300, easing: "spring",     teaches: "this is temporary and layered above" },
  sheetDrag:       { duration: 0,   easing: "standard",   teaches: "you are in control of it — follows the finger 1:1" },
  doseConfirmed:   { duration: 250, easing: "decelerate", teaches: "it was recorded" },
  skeletonToReal:  { duration: 150, easing: "standard",   teaches: "the wait is over" },
  responderArrive: { duration: 200, easing: "decelerate", teaches: "someone answered, just now" },
  undoDwell:       { duration: 4000, easing: "standard",  teaches: "you still have time" },
  errorShake:      { duration: 200, easing: "standard",   teaches: "that input, not another" },
} as const satisfies Readonly<Record<string, MotionToken>>;

export type MotionName = keyof typeof motion;

/** §27 rule 1: nothing over 500ms except a deliberate signature moment. The
 *  undo dwell is a dwell, not an animation, and is excluded by name. */
export const SIGNATURE_EXEMPT: readonly MotionName[] = ["undoDwell"];

/**
 * §27 rule 4 and §25: reduced motion is respected by cross-fading rather than
 * removing the feedback, because removing it leaves the user unsure anything
 * happened.
 */
export function withReducedMotion(t: MotionToken, reduced: boolean): MotionToken {
  return reduced ? { ...t, duration: Math.min(t.duration, 100), easing: "standard" } : t;
}

/** Haptics accompany state changes, never taps (§27 rule 7). */
export const HAPTIC_EVENTS = ["doseConfirmed", "reservationConfirmed", "handoverComplete", "errorShake"] as const;
