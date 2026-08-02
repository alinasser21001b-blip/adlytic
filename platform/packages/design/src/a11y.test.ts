/**
 * @blueprint §25 · §26
 * @owner platform-foundation
 * @why §25 says contrast is measured, never eyeballed — amber on cream failed
 *      at 4.08:1 in the prototype and looked fine. This measures every pair
 *      that can actually appear, in all three personas, in both schemes.
 */
import { describe, it, expect } from "vitest";
import { palettes, CONTRACT_PAIRS, EXTRA_PAIRS, COLOR_ROLES, type Persona, type Scheme } from "./tokens/color.js";
import { contrastRatio, reportRatio, CONTRAST } from "./a11y.js";
import { type as typeScale, TYPE_ROLES } from "./tokens/type.js";
import { tap, space } from "./tokens/space.js";
import { motion, tokenOf, SIGNATURE_EXEMPT, withReducedMotion, type MotionToken, type MotionName } from "./tokens/motion.js";

const personas: Persona[] = ["patient", "pharmacy", "owner"];
const schemes: Scheme[] = ["light", "dark"];

/** The tokens as their DECLARED shape rather than as their literals: `as const`
 *  narrows each entry, so an optional field is absent from the union members
 *  that do not set it and there is no common `loop` to read. */
const entries = (): readonly (readonly [string, MotionToken])[] =>
  (Object.keys(motion) as MotionName[]).map((n) => [n, tokenOf(n)] as const);

describe("§25 — every renderable colour pair is measured", () => {
  for (const persona of personas)
    for (const scheme of schemes) {
      const pal = palettes[persona][scheme];
      for (const [fg, bg] of CONTRACT_PAIRS) {
        // inkSubtle and the accent-on-surface pairs are used for large text and
        // UI boundaries, which §25 permits at 3:1. Everything else is body text.
        const large = fg === "inkSubtle" || fg === "accent" || fg === "warning" || fg === "alert";
        const min = large ? CONTRAST.largeText : CONTRAST.bodyText;
        it(`${persona}/${scheme}: ${fg} on ${bg} ≥ ${min}:1`, () => {
          const ratio = reportRatio(pal[fg], pal[bg]);
          expect(ratio, `${pal[fg]} on ${pal[bg]} measured ${ratio}:1`).toBeGreaterThanOrEqual(min);
        });
      }
    }
});

describe("§25 — every palette defines every role", () => {
  for (const persona of personas)
    for (const scheme of schemes)
      it(`${persona}/${scheme} is complete`, () => {
        const pal = palettes[persona][scheme];
        for (const role of COLOR_ROLES) expect(pal[role], `missing ${role}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
});

describe("§25 — the three personas are distinct, never merged", () => {
  it("no two personas share an accent in the same scheme", () => {
    for (const scheme of schemes) {
      const accents = personas.map((p) => palettes[p][scheme].accent);
      expect(new Set(accents).size).toBe(personas.length);
    }
  });
});

describe("§25 — typography rules are correctness, not taste", () => {
  it("letter spacing is zero on every role, because Arabic is connected", () => {
    for (const role of TYPE_ROLES) expect(typeScale[role].letterSpacing).toBe(0);
  });
  it("nothing clinical sits below 16pt", () => {
    for (const role of TYPE_ROLES)
      if (typeScale[role].clinicalAllowed) expect(typeScale[role].size).toBeGreaterThanOrEqual(16);
  });
  it("Arabic line heights leave room for ascenders and descenders", () => {
    expect(typeScale.body.lineHeight).toBeGreaterThanOrEqual(1.6);
    expect(typeScale.title.lineHeight).toBeGreaterThanOrEqual(1.4);
  });
});

describe("§25 — touch targets", () => {
  it("the floor is 44pt", () => expect(tap.min).toBe(44));
  it("a pharmacy primary is larger, because that device is used at speed", () => {
    expect(tap.pharmacyPrimary).toBeGreaterThan(tap.patientPrimary);
    expect(tap.patientPrimary).toBeGreaterThanOrEqual(tap.min);
  });
  it("the spacing scale is a 4pt rhythm with no value outside it", () => {
    for (const v of Object.values(space)) expect(v % 4).toBe(0);
  });
});

describe("§27 — motion teaches something or it is latency", () => {
  it("every token states what it teaches", () => {
    for (const [name, t] of Object.entries(motion))
      expect(t.teaches.trim(), `${name} teaches nothing`).not.toBe("");
  });
  it("no TRANSITION exceeds 500ms except a declared exemption", () => {
    // §27 rule 1 governs transitions: a change that takes longer than half a
    // second stops reading as a change and starts reading as lag. A loop is
    // not a transition — it reports that something is still happening, and a
    // 1.8s heartbeat clamped to 500ms would read as agitation. Loops are held
    // to a different rule below rather than let through unchecked.
    for (const [name, t] of entries()) {
      if (t.loop) continue;
      if (!(SIGNATURE_EXEMPT as readonly string[]).includes(name))
        expect(t.duration, `${name} is ${t.duration}ms`).toBeLessThanOrEqual(500);
    }
  });
  it("every loop is slow enough to read as a heartbeat and stops under reduced motion", () => {
    for (const [name, t] of entries()) {
      if (!t.loop) continue;
      // Below about a second a loop reads as flicker rather than as breathing,
      // and flicker on a screen a frightened person is watching is the worst
      // possible version of "something is happening".
      expect(t.duration, `${name} loops every ${t.duration}ms`).toBeGreaterThanOrEqual(1000);
      // Clamping a loop short would make it worse, so reduced motion stops it.
      expect(withReducedMotion(t, true).duration, `${name} under reduced motion`).toBe(0);
      expect(withReducedMotion(t, true).loop, `${name} still loops under reduced motion`).toBe(false);
    }
  });

  it("reduced motion cross-fades rather than removing the feedback", () => {
    const reduced = withReducedMotion(motion.doseConfirmed, true);
    expect(reduced.duration).toBeGreaterThan(0);
    expect(reduced.duration).toBeLessThanOrEqual(100);
  });
});

describe("contrast maths is correct", () => {
  it("black on white is 21:1", () => expect(Math.round(contrastRatio("#000000", "#FFFFFF"))).toBe(21));
  it("a colour against itself is 1:1", () => expect(contrastRatio("#186047", "#186047")).toBeCloseTo(1));
  it("order does not matter", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#000000"));
  });
});

describe("pairs that live outside a single palette", () => {
  // A light card on a dark ground cannot be expressed as two roles from one
  // palette, so the gate could not see the V2 code panel until Design
  // delivered it. Measured explicitly rather than not at all.
  for (const [fg, bg, label] of EXTRA_PAIRS) {
    it(`${label} clears the body floor`, () => {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `${label} measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(CONTRAST.bodyText);
    });
  }
});
