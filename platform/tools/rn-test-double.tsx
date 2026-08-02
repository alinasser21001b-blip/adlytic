/**
 * React Native, as host elements, for the test runner only.
 *
 * React Native's own entry point is Flow-typed source that only its Metro
 * bundler parses, so a Node test runner cannot import it. This maps each
 * primitive a patient screen uses onto a host element of the same name and
 * passes every prop through untouched — so a rendered tree still shows the
 * real accessibility roles, labels, states and handlers, and a test asserting
 * on them is asserting on what the screen actually declares.
 *
 * It deliberately implements no behaviour. Anything that needed a real
 * implementation here would be logic living in a component, which is the thing
 * Rule 4 forbids and the reducer already owns.
 */
import * as React from "react";

const host = (name: string) =>
  function Host(props: Record<string, unknown>) {
    return React.createElement(name, props, props["children"] as React.ReactNode);
  };

export const View = host("View");
export const Text = host("Text");
export const Pressable = host("Pressable");
export const ScrollView = host("ScrollView");
export const TextInput = host("TextInput");
export const ActivityIndicator = host("ActivityIndicator");
export const Image = host("Image");
export const SafeAreaView = host("SafeAreaView");

/** The tests render the light scheme; the dark palette is measured for
 *  contrast in the design package's own suite. */
export const useColorScheme = () => "light" as const;

export const StyleSheet = {
  create: <T,>(s: T): T => s,
  flatten: <T,>(s: T): T => s,
  absoluteFillObject: {},
  hairlineWidth: 1,
};

export const Platform = { OS: "ios" as const, select: <T,>(o: { ios?: T; android?: T; default?: T }) => o.ios ?? o.default };

/**
 * Just enough of Animated for the RENDER-TREE tests.
 *
 * These tests assert structure, accessibility and style — not timing — so a
 * value reports its current number and a driver is a no-op that completes
 * immediately. The durations and curves themselves are proved directly against
 * the tokens in packages/design, where they belong; nothing here decides
 * motion, it only lets a motion-wrapped screen be rendered and audited.
 */
class AnimatedValue {
  constructor(public value: number) {}
  setValue(v: number) { this.value = v; }
  interpolate({ inputRange, outputRange }: { inputRange: number[]; outputRange: number[] }) {
    const i = Math.max(0, Math.min(inputRange.length - 1, inputRange.findIndex((x) => x >= this.value)));
    return new AnimatedValue(outputRange[i] ?? outputRange[outputRange.length - 1] ?? 0);
  }
}
/**
 * A driver that SETTLES rather than does nothing.
 *
 * The first version returned a no-op, so an element that starts at opacity 0
 * and animates to 1 was photographed at 0 — every offer row on R8 rendered
 * invisible while still occupying its space. A static renderer must show the
 * resting state, which is what a reader sees a moment after it lands, and
 * "resting" means the animation's end value rather than its start.
 */
const settleTo = (value: unknown, to: unknown) => ({
  start: (cb?: () => void) => {
    if (value instanceof AnimatedValue && typeof to === "number") value.setValue(to);
    cb?.();
  },
  stop: () => {},
});
const runAll = (runs: readonly { start: (cb?: () => void) => void }[]) => ({
  start: (cb?: () => void) => { for (const r of runs) r.start(); cb?.(); },
  stop: () => {},
});

export const Animated = {
  Value: AnimatedValue,
  View: host("View"),
  Text: host("Text"),
  timing: (v: unknown, c: { toValue?: unknown }) => settleTo(v, c?.toValue),
  sequence: (runs: readonly { start: (cb?: () => void) => void }[]) => runAll(runs),
  parallel: (runs: readonly { start: (cb?: () => void) => void }[]) => runAll(runs),
  loop: (r: { start: (cb?: () => void) => void }) => r,
  delay: () => ({ start: (cb?: () => void) => cb?.(), stop: () => {} }),
};

const bezier = () => (n: number) => n;
export const Easing = { bezier, linear: (n: number) => n, ease: (n: number) => n, out: bezier, inOut: bezier };

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: () => ({ remove: () => {} }),
};
