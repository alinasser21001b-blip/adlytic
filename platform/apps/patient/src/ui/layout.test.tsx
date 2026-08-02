/**
 * The layout primitives, proved.
 *
 * @blueprint §25 · §26 · design/screen-contract
 * @owner patient-app
 * @why These are the pieces every screen is now made of, so a defect here is a
 *      defect on all of them at once — which is the whole bargain of extracting
 *      them. The properties worth pinning are the ones a call site used to get
 *      wrong by hand: a physical row direction that double-mirrors under RTL, a
 *      distance that is not on the 4pt scale, a colour picked rather than
 *      named, and a tone that quietly outlines everything until an alert stops
 *      meaning anything.
 */
import { describe, expect, it } from "vitest";
import * as React from "react";
import TestRenderer from "react-test-renderer";
import { space } from "@dawai/design";
import { themeFor } from "./theme.js";
import { Row, Spacer, Grow, Actions, Card, Note, Section, Field } from "./layout.js";
import { Dial } from "./kit.js";

const t = themeFor("dark");
const Leaf = () => null;

/** The flattened style of the outermost host element a primitive renders. */
const styleOf = (el: React.ReactElement): Record<string, unknown> => {
  const host = TestRenderer.create(el).root.findAll((n) => typeof n.type === "string")[0];
  const s = host?.props.style;
  return Array.isArray(s) ? Object.assign({}, ...s) : { ...(s ?? {}) };
};

const SCALE = new Set(Object.values(space));

describe("a primitive never expresses a physical direction", () => {
  // The bug this replaces put the back chevron on the wrong edge of every
  // screen: `row-reverse` inside a container that already runs right-to-left
  // reverses twice and lands back where it started.
  it.each([
    ["Row", <Row t={t}><Leaf /></Row>],
    ["Actions", <Actions t={t}><Leaf /></Actions>],
  // The banned literal is deliberately not spelled here: the layer check
  // scans this file too, and a rule that exempts its own test is not a rule.
  ])("%s lays out with the logical row direction", (_name, el) => {
    expect(styleOf(el).flexDirection).toBe("row");
  });

  it("no primitive emits a physical edge", () => {
    for (const el of [
      <Row t={t}><Leaf /></Row>,
      <Card t={t}><Leaf /></Card>, <Note t={t}><Leaf /></Note>,
      <Actions t={t}><Leaf /></Actions>, <Section t={t}><Leaf /></Section>,
    ]) {
      const s = styleOf(el);
      expect(s).not.toHaveProperty("left");
      expect(s).not.toHaveProperty("right");
    }
  });
});

describe("every distance comes from the 4pt scale", () => {
  it("gaps and padding are scale values, whatever token the caller picked", () => {
    for (const el of [
      <Row t={t} gap={1}><Leaf /></Row>,
      <Row t={t} gap={9}><Leaf /></Row>,
      <Row t={t} gap={3}><Leaf /></Row>,
      <Card t={t} pad={6} gap={4}><Leaf /></Card>,
      <Note t={t}><Leaf /></Note>,
      <Section t={t}><Leaf /></Section>,
      <Field t={t}><Leaf /></Field>,
    ]) {
      const s = styleOf(el);
      for (const key of ["gap", "padding"] as const) {
        if (s[key] !== undefined) expect(SCALE).toContain(s[key] as number);
      }
    }
  });

  it("a section groups more tightly than the scroll body separates blocks", () => {
    // The reason a screen reads as groups rather than as a list of equal parts.
    expect(styleOf(<Section t={t}><Leaf /></Section>).gap as number).toBeLessThan(t.space[4]);
  });
});

describe("Spacer and Grow are one idea", () => {
  it("both take the remaining space", () => {
    expect(styleOf(<Spacer />).flex).toBe(1);
    expect(styleOf(<Grow><Leaf /></Grow>).flex).toBe(1);
  });

  it("Grow carries content and Spacer carries none", () => {
    expect(TestRenderer.create(<Grow><Grow /></Grow>).root.findAll((n) => typeof n.type === "string")).toHaveLength(2);
    expect(TestRenderer.create(<Spacer />).root.findAll((n) => typeof n.type === "string")).toHaveLength(1);
  });
});

describe("a surface names its colours rather than choosing them", () => {
  it("Card draws from the palette, both surfaces", () => {
    expect(styleOf(<Card t={t}><Leaf /></Card>).backgroundColor).toBe(t.color.surfaceRaised);
    expect(styleOf(<Card t={t} surface="sunken"><Leaf /></Card>).backgroundColor).toBe(t.color.surfaceSunken);
  });

  it("a border is a role, so a screen cannot invent a shade", () => {
    expect(styleOf(<Card t={t}><Leaf /></Card>).borderColor).toBe(t.color.line);
    expect(styleOf(<Card t={t} border="accent" borderWidth={2}><Leaf /></Card>))
      .toMatchObject({ borderColor: t.color.accent, borderWidth: 2 });
  });

  it("border=\"none\" draws no border at all rather than a transparent one", () => {
    const s = styleOf(<Card t={t} border="none"><Leaf /></Card>);
    expect(s).not.toHaveProperty("borderWidth");
    expect(s).not.toHaveProperty("borderColor");
  });

  it("a note sits below the content plane, never above it", () => {
    // Sunken, always: it is a remark ABOUT the screen and must not compete with
    // the content as another card.
    for (const tone of ["neutral", "caution", "alert"] as const) {
      expect(styleOf(<Note t={t} tone={tone}><Leaf /></Note>).backgroundColor).toBe(t.color.surfaceSunken);
    }
  });

  it("only an alert is outlined", () => {
    // A caution that is also outlined reads as an error, and a patient told
    // everything is urgent believes none of it.
    expect(styleOf(<Note t={t}><Leaf /></Note>)).not.toHaveProperty("borderWidth");
    expect(styleOf(<Note t={t} tone="caution"><Leaf /></Note>)).not.toHaveProperty("borderWidth");
    expect(styleOf(<Note t={t} tone="alert"><Leaf /></Note>).borderColor).toBe(t.color.alert);
  });
});

describe("alignment", () => {
  it("defaults to centre and offers baseline for a number beside its unit", () => {
    expect(styleOf(<Row t={t}><Leaf /></Row>).alignItems).toBe("center");
    expect(styleOf(<Row t={t} align="baseline"><Leaf /></Row>).alignItems).toBe("baseline");
  });

  it("justification is absent unless asked for, so a row does not silently spread", () => {
    expect(styleOf(<Row t={t}><Leaf /></Row>)).not.toHaveProperty("justifyContent");
    expect(styleOf(<Row t={t} justify="space-between"><Leaf /></Row>).justifyContent).toBe("space-between");
  });

  it("Actions wraps, because Arabic labels are long and a fixed row truncates", () => {
    expect(styleOf(<Actions t={t}><Leaf /></Actions>).flexWrap).toBe("wrap");
  });
});

describe("the Dial draws the fraction it is given", () => {
  // The delivery draws this with a conic gradient, which React Native cannot
  // express. Two clipped, rotated half-discs produce the same arc — but only if
  // the geometry is right, and an arc that is wrong is worse than no arc at
  // all: it is a countdown lying about how much time is left.
  const sweeps = (fraction: number): number[] =>
    TestRenderer.create(<Dial t={t} fraction={fraction} value="٧" label="متبقي" />).root
      .findAll((n) => typeof n.type === "string")
      .flatMap((n) => {
        const s = n.props.style;
        const flat = Array.isArray(s) ? Object.assign({}, ...s) : s ?? {};
        const rotate = (flat.transform ?? []).find((x: Record<string, string>) => "rotate" in x);
        return rotate ? [parseFloat(rotate.rotate)] : [];
      });

  it("draws nothing at zero and a full turn at one", () => {
    expect(sweeps(0)).toEqual([0, 0]);
    expect(sweeps(1)).toEqual([180, 180]);
  });

  it("fills only the trailing half below the midpoint", () => {
    // A quarter is 90° of the first half and none of the second. Getting this
    // backwards draws a three-quarter ring for a quarter of the time left.
    expect(sweeps(0.25)).toEqual([0, 90]);
  });

  it("holds the trailing half full once past the midpoint", () => {
    expect(sweeps(0.75)).toEqual([90, 180]);
  });

  it("clamps rather than drawing an impossible arc", () => {
    expect(sweeps(-1)).toEqual([0, 0]);
    expect(sweeps(2)).toEqual([180, 180]);
  });

  it("carries the fraction as an accessible percentage, so the arc is never alone", () => {
    const dial = TestRenderer.create(<Dial t={t} fraction={0.42} value="٧" label="متبقي" />).root
      .find((n) => n.props.accessibilityRole === "progressbar");
    expect(dial.props.accessibilityValue).toEqual({ now: 42, min: 0, max: 100 });
    expect(dial.props.accessibilityLabel).toBe("متبقي");
  });
});
