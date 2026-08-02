/**
 * React Native primitives, rendered to DOM — for the visual review only.
 *
 * This is NOT a device screenshot and must never be presented as one. It is the
 * REAL component tree — the same screens, the same tokens, the same props the
 * app ships — mapped onto DOM nodes so a browser can photograph it. What it
 * proves is layout, hierarchy, typography, colour, spacing and tap-target size.
 * What it cannot prove is native gesture behaviour, platform chrome or
 * animation, and the review says so on every screenshot.
 *
 * The adapter deliberately implements no behaviour, for the same reason the
 * test double does not: anything needing behaviour here would be logic living
 * in a component.
 */
import * as React from "react";

/** React Native's flex defaults differ from CSS: column, and no shrink. */
const RN_DEFAULTS: React.CSSProperties = { display: "flex", flexDirection: "column", position: "relative", minWidth: 0 };

const NUMERIC_PX = new Set([
  "width", "height", "minHeight", "maxHeight", "minWidth", "maxWidth",
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical",
  "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "paddingHorizontal", "paddingVertical",
  "borderRadius", "borderWidth", "borderBottomWidth", "borderTopWidth",
  "fontSize", "lineHeight", "letterSpacing", "gap", "top", "bottom", "left", "right",
]);

function toCss(style: unknown): React.CSSProperties {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(toCss));
  if (!style || typeof style !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    // React Native's shorthands have no CSS equivalent; expand them rather
    // than dropping them, or the review would show padding the app does not.
    if (k === "paddingHorizontal") { out["paddingLeft"] = px(v); out["paddingRight"] = px(v); continue; }
    if (k === "paddingVertical") { out["paddingTop"] = px(v); out["paddingBottom"] = px(v); continue; }
    if (k === "marginHorizontal") { out["marginLeft"] = px(v); out["marginRight"] = px(v); continue; }
    if (k === "marginVertical") { out["marginTop"] = px(v); out["marginBottom"] = px(v); continue; }
    if (k === "writingDirection") { out["direction"] = v; continue; }
    // React Native expresses transforms as an ordered list of single-property
    // objects; CSS wants one string, applied in the same order. Without this
    // the array reaches CSS as "[object Object]" and every transform silently
    // does nothing — which is worse than failing, because the review would
    // photograph an untransformed element and call it the truth.
    if (k === "transform" && Array.isArray(v)) {
      out["transform"] = v.map((t) => {
        const [fn, arg] = Object.entries(t as Record<string, unknown>)[0];
        return `${fn}(${typeof arg === "number" && !/^rotate/.test(fn) ? `${arg}px` : arg})`;
      }).join(" ");
      continue;
    }
    if (k === "borderColor") { out["borderColor"] = v; out["borderStyle"] = "solid"; continue; }
    if (k === "borderWidth" || k === "borderTopWidth" || k === "borderBottomWidth") { out[k] = px(v); out["borderStyle"] = "solid"; continue; }
    out[k] = NUMERIC_PX.has(k) && typeof v === "number" ? px(v) : v;
  }
  return out as React.CSSProperties;
}

const px = (v: unknown) => (typeof v === "number" ? `${v}px` : v);

/** Props React Native understands and the DOM does not. Passed through as
 *  data attributes so the review can still show accessibility information. */
function domProps(props: Record<string, unknown>): Record<string, unknown> {
  const { style, children, onPress, onChangeText, numberOfLines, accessibilityRole,
    accessibilityLabel, accessibilityState, accessibilityValue, disabled, placeholderTextColor,
    defaultValue, placeholder, ...rest } = props;
  const out: Record<string, unknown> = { ...rest, style: { ...RN_DEFAULTS, ...toCss(style) } };
  if (accessibilityRole) out["role"] = accessibilityRole === "progressbar" ? "progressbar" : String(accessibilityRole);
  if (accessibilityLabel) out["aria-label"] = accessibilityLabel;
  if (accessibilityState && typeof accessibilityState === "object") {
    const s = accessibilityState as Record<string, unknown>;
    if (s["disabled"]) out["aria-disabled"] = "true";
    if (s["selected"] !== undefined) out["aria-selected"] = String(Boolean(s["selected"]));
    if (s["busy"]) out["aria-busy"] = "true";
  }
  if (accessibilityValue && typeof accessibilityValue === "object")
    out["aria-valuenow"] = String((accessibilityValue as Record<string, unknown>)["now"] ?? "");
  if (numberOfLines === 1) {
    out["style"] = { ...(out["style"] as object), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  }
  void onPress; void onChangeText; void disabled; void placeholderTextColor; void defaultValue; void placeholder;
  return out;
}

const box = (tag: string) =>
  function Box(props: Record<string, unknown>) {
    return React.createElement(tag, domProps(props), props["children"] as React.ReactNode);
  };

export const View = box("div");

/** A ScrollView is two boxes in React Native: the scrolling viewport and the
 *  content inside it. Collapsing them onto one div loses the content padding,
 *  which is most of a screen's breathing room. */
export function ScrollView(props: Record<string, unknown>) {
  const { contentContainerStyle, children, ...rest } = props;
  const outer = domProps(rest);
  outer["style"] = { ...(outer["style"] as object), flex: 1, overflow: "hidden" };
  return React.createElement("div", outer,
    React.createElement("div", { style: { ...RN_DEFAULTS, ...toCss(contentContainerStyle) } }, children as React.ReactNode));
}
export const SafeAreaView = box("div");
export const Image = box("div");
export const Pressable = box("div");

/** Text is the one primitive whose CSS defaults must NOT be flex — a flex
 *  span breaks inline wrapping and the review would show line breaks the app
 *  does not have. */
export function Text(props: Record<string, unknown>) {
  const p = domProps(props);
  p["style"] = { ...(p["style"] as object), display: "block", flexDirection: undefined };
  return React.createElement("span", p, props["children"] as React.ReactNode);
}

export function TextInput(props: Record<string, unknown>) {
  const p = domProps(props);
  return React.createElement("input", {
    ...p,
    defaultValue: props["defaultValue"] as string,
    placeholder: props["placeholder"] as string,
    readOnly: true,
  });
}

export function ActivityIndicator(props: Record<string, unknown>) {
  return React.createElement("div", {
    style: { width: "20px", height: "20px", borderRadius: "999px", border: `2px solid ${String(props["color"] ?? "#fff")}`, borderTopColor: "transparent" },
  });
}

/**
 * Just enough of Animated for a STATIC review.
 *
 * The gallery photographs frames, so an animation cannot be verified by
 * screenshot — what the review must prove is that an animated element renders
 * its content and its resting style, which is what a reader sees a moment after
 * it settles. `Value` therefore reports its current number and interpolation is
 * evaluated once, at that number, rather than driven over time.
 *
 * The real curves and durations come from the tokens and are proved by the unit
 * tests; nothing here decides motion, it only lets a motion-wrapped screen be
 * photographed.
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

function AnimatedBox(props: Record<string, unknown>) {
  const style = toCss(props.style);
  for (const [k, v] of Object.entries(style as Record<string, unknown>)) {
    if (v instanceof AnimatedValue) (style as Record<string, unknown>)[k] = v.value;
  }
  // A settled transform is the resting one: the review shows where an element
  // ENDS, never a frame mid-flight, because a mid-flight screenshot would be a
  // visual regression every run.
  if (Array.isArray((style as { transform?: unknown }).transform)) delete (style as { transform?: unknown }).transform;
  return React.createElement("div", { ...domProps({ ...props, style: {} }), style: { ...RN_DEFAULTS, ...style } }, props.children as React.ReactNode);
}

export const Animated = {
  Value: AnimatedValue,
  View: AnimatedBox,
  Text: AnimatedBox,
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

export const useColorScheme = () => "light" as const;
export const StyleSheet = { create: <T,>(s: T): T => s, flatten: <T,>(s: T): T => s, absoluteFillObject: {}, hairlineWidth: 1 };
export const Platform = { OS: "ios" as const, select: <T,>(o: { ios?: T; default?: T }) => o.ios ?? o.default };
