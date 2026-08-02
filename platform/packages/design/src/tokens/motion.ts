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
  /** A loop reports ongoing activity rather than a completed change, so §27's
   *  500ms ceiling does not apply to it — a 1.8s pulse is not a slow
   *  transition, it is a heartbeat. */
  readonly loop?: boolean;
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

  /* Delivered by the Night Mint handoff. The first four are LOOPS — they do
     not report progress, they report that something is still happening while
     nobody has answered, which is the one thing R7 exists to say. */
  dwPulse:         { duration: 1800, easing: "decelerate", teaches: "we are still asking", loop: true },
  dwTick:          { duration: 1600, easing: "standard",   teaches: "this pharmacy is still deciding", loop: true },
  dwSweep:         { duration: 4500, easing: "standard",   teaches: "the search is live", loop: true },
  dwFloat:         { duration: 3000, easing: "standard",   teaches: "this is waiting, not stuck", loop: true },
  /** Per-row stagger as offers arrive. Not a loop — each row plays once. */
  offerArrival:    { duration: 200, easing: "decelerate",  teaches: "this one just came in" },
} as const satisfies Readonly<Record<string, MotionToken>>;

export type MotionName = keyof typeof motion;

/**
 * A token by name, as its DECLARED shape.
 *
 * `as const satisfies` is what makes `MotionName` a closed set, but it also
 * narrows every entry to its own literal — so an optional field like `loop` is
 * absent from the members that do not set it, and the union has none in common.
 * Reading through here gives callers the type they actually want.
 */
export const tokenOf = (name: MotionName): MotionToken => motion[name];

/** §27 rule 1: nothing over 500ms except a deliberate signature moment. The
 *  undo dwell is a dwell, not an animation, and is excluded by name. */
export const SIGNATURE_EXEMPT: readonly MotionName[] = ["undoDwell"];

/** The CSS timing functions the four named easings mean, in one place so a
 *  component never writes a curve. */
export const EASING: Readonly<Record<MotionToken["easing"], string>> = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  decelerate: "cubic-bezier(0, 0, 0, 1)",
  accelerate: "cubic-bezier(0.3, 0, 1, 1)",
  spring: "cubic-bezier(0.2, 0.9, 0.2, 1.1)",
};

/**
 * §27 rule 4 and §25: reduced motion is respected by cross-fading rather than
 * removing the feedback, because removing it leaves the user unsure anything
 * happened.
 */
export function withReducedMotion(t: MotionToken, reduced: boolean): MotionToken {
  if (!reduced) return t;
  // A LOOP under reduced motion stops entirely rather than cross-fading fast:
  // a pulse clamped to 100ms is not a gentler pulse, it is a flicker, and
  // flicker is the specific thing the setting exists to prevent.
  if (t.loop) return { ...t, duration: 0, easing: "standard", loop: false };
  return { ...t, duration: Math.min(t.duration, 100), easing: "standard" };
}

/** Haptics accompany state changes, never taps (§27 rule 7). */
export const HAPTIC_EVENTS = ["doseConfirmed", "reservationConfirmed", "handoverComplete", "errorShake"] as const;
