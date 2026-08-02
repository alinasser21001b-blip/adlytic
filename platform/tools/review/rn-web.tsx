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

export const useColorScheme = () => "light" as const;
export const StyleSheet = { create: <T,>(s: T): T => s, flatten: <T,>(s: T): T => s, absoluteFillObject: {}, hairlineWidth: 1 };
export const Platform = { OS: "ios" as const, select: <T,>(o: { ios?: T; default?: T }) => o.ios ?? o.default };
