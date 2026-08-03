/**
 * @blueprint §25 · design/color
 * @owner patient-app
 * @why The theme is threaded through every component as a prop, so its
 *      identity is part of every component's props. If it changes on every
 *      render nothing downstream can be skipped, no matter how carefully the
 *      memoisation is written — so identity is a property worth a test.
 */
import { describe, expect, it } from "vitest";
import { themeFor, textStyle } from "./theme.js";

describe("the theme is a constant, and has a constant's identity", () => {
  it("the same scheme returns the same object", () => {
    expect(themeFor("dark")).toBe(themeFor("dark"));
    expect(themeFor("light")).toBe(themeFor("light"));
  });

  it("the two schemes are distinct objects, even where Night Mint gives them the same palette", () => {
    // The patient palette is dark-only by delivery — `patientLight` is an alias
    // of `patientDark` — so the schemes agree on colour and must still not be
    // the same theme: `scheme` is read, and one shared object would make the
    // light theme claim to be dark.
    expect(themeFor("dark")).not.toBe(themeFor("light"));
    expect(themeFor("light").scheme).toBe("light");
    expect(themeFor("light").color).toBe(themeFor("dark").color);
  });

  it("carries the scheme it was asked for", () => {
    expect(themeFor("dark").scheme).toBe("dark");
  });
});

describe("textStyle — the one role-to-style conversion", () => {
  const t = themeFor("dark");

  it("converts the line-height multiplier to the absolute React Native wants", () => {
    const s = textStyle(t, "body");
    expect(s.fontSize).toBe(t.type.body.size);
    expect(s.lineHeight).toBe(Math.round(t.type.body.size * t.type.body.lineHeight));
    expect(s.lineHeight).not.toBe(t.type.body.lineHeight);
  });

  it("never tracks — Arabic is connected (§25)", () => {
    for (const role of ["code", "display", "poster", "title", "headline", "body", "caption"] as const)
      expect(textStyle(t, role).letterSpacing).toBe(0);
  });

  it("reads right and writes RTL by default", () => {
    expect(textStyle(t, "body").textAlign).toBe("right");
    expect(textStyle(t, "body").writingDirection).toBe("rtl");
  });

  it("names a colour role rather than a colour", () => {
    expect(textStyle(t, "body", "alert").color).toBe(t.color.alert);
  });
});
