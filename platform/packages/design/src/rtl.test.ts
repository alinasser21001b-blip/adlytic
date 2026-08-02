/**
 * @blueprint §25 · D29 · D36
 * @owner platform-foundation
 * @why The three RTL hazards §25 names, each pinned by a test: a physical
 *      offset that breaks centring, an unisolated Latin run that reorders a
 *      price, and two numeral systems in one comparison.
 */
import { describe, it, expect } from "vitest";
import { resolveEdge, shouldMirror, formatDigits, isolate, needsIsolation, APP_DIRECTION } from "./rtl.js";

describe("§25 — logical edges resolve, so no component names left or right", () => {
  it("start is right under RTL and left under LTR", () => {
    expect(resolveEdge("start", "rtl")).toBe("right");
    expect(resolveEdge("start", "ltr")).toBe("left");
  });
  it("vertical edges never mirror", () => {
    expect(resolveEdge("top", "rtl")).toBe("top");
    expect(resolveEdge("bottom", "rtl")).toBe("bottom");
  });
});

describe("§25 — not everything mirrors", () => {
  it("media controls and clock faces stay put — mirroring a play button is a bug", () => {
    for (const icon of ["play", "pause", "clock", "checkmark"]) expect(shouldMirror(icon)).toBe(false);
  });
  it("directional chrome does mirror", () => {
    for (const icon of ["chevron", "arrow-forward", "back"]) expect(shouldMirror(icon)).toBe(true);
  });
});

describe("§25 — one numeral system per surface", () => {
  it("converts a whole string, never part of it", () => {
    expect(formatDigits(1234, "arabic-indic")).toBe("١٢٣٤");
    expect(formatDigits(1234, "western")).toBe("1234");
  });
  it("a mixed result is impossible — every digit converts or none does", () => {
    const s = formatDigits("12,000", "arabic-indic");
    expect(/[0-9]/.test(s)).toBe(false);
  });
});

describe("§25 — a Latin run inside Arabic must be isolated or it reorders", () => {
  it("detects a mixed string", () => {
    expect(needsIsolation("سعر Panadol")).toBe(true);
    expect(needsIsolation("سعر الدواء")).toBe(false);
    expect(needsIsolation("Panadol")).toBe(false);
  });
  it("isolation carries an explicit LTR direction", () => {
    expect(isolate("Amlodipine 5mg")).toEqual({ text: "Amlodipine 5mg", isolate: true, dir: "ltr" });
  });
});

describe("D34 — Phase 0 ships Arabic only", () => {
  it("the app direction is RTL", () => expect(APP_DIRECTION).toBe("rtl"));
});
