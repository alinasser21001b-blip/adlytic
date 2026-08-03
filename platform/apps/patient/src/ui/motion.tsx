/**
 * The motion system — every animation in the patient app, driven from a token.
 *
 * @blueprint §25 · §27 · design/motion
 * @owner patient-app
 * @why §27's first question about any animation is "what does this teach the
 *      user?", and motion with no answer is latency in a costume. The token set
 *      already carried that answer for every named movement; what did not exist
 *      was any way to USE one, so the product had eight declared motions and
 *      nothing moving. A screen could only animate by writing a duration, which
 *      is how a design system acquires a ninth motion nobody approved.
 *
 *      So there is exactly one way to move: name a token. Duration, curve and
 *      the reduced-motion policy all come from it, which makes «respects
 *      reduced motion» a property of the system rather than a thing each screen
 *      remembers. The layer check forbids a raw duration in a screen, and the
 *      tests below prove the clamp.
 *
 *      Reduced motion is honoured by SHORTENING a transition and by STOPPING a
 *      loop. Those are different because the settings mean different things: a
 *      transition still has to report that something changed, while a loop
 *      reports only that time is passing, and a 100ms pulse is not a gentler
 *      pulse — it is a flicker, which is the specific thing the setting exists
 *      to prevent.
 */
import * as React from "react";
import { Animated, Easing, AccessibilityInfo } from "react-native";
import { motion, withReducedMotion, CURVE as DesignCurve, type MotionName } from "@dawai/design";

/**
 * The device's reduced-motion setting, read once and kept current.
 *
 * A context rather than a hook call per component, so a screen cannot render
 * half of itself with animation and half without — and so the tests can drive
 * it without touching a global.
 */
export const ReducedMotion = React.createContext(false);

export function useReducedMotion(): boolean {
  const fromContext = React.useContext(ReducedMotion);
  const [system, setSystem] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((on: boolean) => { if (alive) setSystem(on); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setSystem);
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return fromContext || system;
}

/** The token a name resolves to right now, reduced-motion applied. */
export function useMotionToken(name: MotionName) {
  const reduced = useReducedMotion();
  return withReducedMotion(motion[name], reduced);
}

/** The design curves, in the form React Native animates with. The numbers come
 *  from @dawai/design — this file chooses no shape, it only spends one. */
const CURVE = {
  standard: Easing.bezier(...DesignCurve.standard),
  decelerate: Easing.bezier(...DesignCurve.decelerate),
  accelerate: Easing.bezier(...DesignCurve.accelerate),
  spring: Easing.bezier(...DesignCurve.spring),
} as const;

/**
 * Something appearing, once.
 *
 * `delay` is what makes a list stagger — R8's offers arrive one after another
 * rather than as a block, because they genuinely arrived one after another and
 * a list that materialises whole hides that.
 */
export function Enter(
  { name, delay = 0, children }:
  { name: MotionName; delay?: number; children: React.ReactNode },
) {
  const token = useMotionToken(name);
  // Starts VISIBLE, and the effect takes it away before bringing it back.
  //
  // The first version started at zero and animated up, which meant anything
  // wrapped in it was invisible whenever the effect did not run — and effects
  // do not run in a static render, so every offer row on R8 was photographed as
  // blank space. That is not a harness quirk: an element whose visibility
  // depends on an animation is an element that disappears the moment the
  // animation does. Motion may add emphasis; it may never be the reason
  // content is on screen.
  const progress = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (token.duration === 0) { progress.setValue(1); return; }
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: token.duration,
      delay,
      easing: CURVE[token.easing],
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [progress, token.duration, token.easing, delay]);

  return (
    <Animated.View style={{
      opacity: progress,
      // Eight points, not thirty: this says "this one is new", not "this one
      // flew in from somewhere". §27 rule 2 — movement is the smallest that
      // still reads.
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

/**
 * Something still happening, repeatedly.
 *
 * Used only where the loop IS the information — a request nobody has answered
 * yet. A loop anywhere else is decoration, and decoration that never stops is
 * the kind a user learns to ignore and then cannot see when it matters.
 */
export function Pulse(
  { name, children }: { name: MotionName; children: React.ReactNode },
) {
  const token = useMotionToken(name);
  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (token.duration === 0) { progress.setValue(0); return; }
    const run = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: token.duration / 2, easing: CURVE[token.easing], useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: token.duration / 2, easing: CURVE[token.easing], useNativeDriver: true }),
      ]),
    );
    run.start();
    return () => run.stop();
  }, [progress, token.duration, token.easing]);

  return (
    <Animated.View style={{
      opacity: token.duration === 0
        ? 1
        : progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
    }}>
      {children}
    </Animated.View>
  );
}

/**
 * An input that was rejected, named by the movement.
 *
 * §27 rule 5: the shake is on the FIELD, so it says "that input, not another".
 * A screen-level shake would tell a patient something is wrong and leave them
 * to find out what.
 */
export function Shake(
  { active, children }: { active: boolean; children: React.ReactNode },
) {
  const token = useMotionToken("errorShake");
  const offset = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!active || token.duration === 0) { offset.setValue(0); return; }
    const leg = token.duration / 4;
    const run = Animated.sequence([
      Animated.timing(offset, { toValue: 1, duration: leg, easing: CURVE.standard, useNativeDriver: true }),
      Animated.timing(offset, { toValue: -1, duration: leg, easing: CURVE.standard, useNativeDriver: true }),
      Animated.timing(offset, { toValue: 1, duration: leg, easing: CURVE.standard, useNativeDriver: true }),
      Animated.timing(offset, { toValue: 0, duration: leg, easing: CURVE.standard, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [active, offset, token.duration]);

  return (
    <Animated.View style={{
      transform: [{ translateX: offset.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }],
    }}>
      {children}
    </Animated.View>
  );
}
