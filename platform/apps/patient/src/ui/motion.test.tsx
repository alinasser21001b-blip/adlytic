/**
 * The motion system, proved.
 *
 * @blueprint §27 · design/motion
 * @owner patient-app
 * @why One of these exists because of a defect this file's subject caused. The
 *      first `Enter` started at zero opacity and animated up, so anything it
 *      wrapped was invisible whenever its effect did not run — and R8's entire
 *      offer list was photographed as blank space. Motion may add emphasis; it
 *      may never be the reason content is on screen, and that is now a test
 *      rather than a lesson.
 */
import { describe, expect, it } from "vitest";
import * as React from "react";
import TestRenderer from "react-test-renderer";
import { motion, tokenOf, withReducedMotion, type MotionName } from "@dawai/design";
import { Enter, Pulse, Shake, ReducedMotion } from "./motion.jsx";
import { Label } from "./kit.js";
import { themeFor } from "./theme.js";

const t = themeFor("dark");
const Content = () => <Label t={t} role="body">محتوى</Label>;

const renderWith = (reduced: boolean, node: React.ReactElement) =>
  TestRenderer.create(<ReducedMotion.Provider value={reduced}>{node}</ReducedMotion.Provider>).root;

/** Every string the tree renders, so "is the content there" is answerable. */
const text = (root: TestRenderer.ReactTestInstance): string => {
  const out: string[] = [];
  const walk = (c: unknown): void => {
    if (typeof c === "string") out.push(c);
    else if (Array.isArray(c)) c.forEach(walk);
    else if (c && typeof c === "object" && "props" in (c as { props?: unknown }))
      walk((c as { props: { children?: unknown } }).props.children);
  };
  for (const n of root.findAll((n) => typeof n.type === "string")) walk(n.props["children"]);
  return out.join(" ");
};

describe("motion is never the reason content is visible", () => {
  it.each([
    ["Enter", <Enter name="offerArrival"><Content /></Enter>],
    ["Pulse", <Pulse name="dwTick"><Content /></Pulse>],
    ["Shake, resting", <Shake active={false}><Content /></Shake>],
    ["Shake, firing", <Shake active><Content /></Shake>],
  ])("%s renders its children", (_name, node) => {
    expect(text(renderWith(false, node))).toContain("محتوى");
  });

  it.each([
    ["Enter", <Enter name="offerArrival"><Content /></Enter>],
    ["Pulse", <Pulse name="dwTick"><Content /></Pulse>],
  ])("%s renders its children with reduced motion on, where nothing animates at all", (_name, node) => {
    expect(text(renderWith(true, node))).toContain("محتوى");
  });
});

describe("reduced motion", () => {
  const names = Object.keys(motion) as readonly MotionName[];

  it("clamps every transition to something that cannot read as a slide", () => {
    for (const n of names) {
      const token = tokenOf(n);
      if (token.loop) continue;
      const reduced = withReducedMotion(token, true);
      expect(reduced.duration, `${n}`).toBeLessThanOrEqual(100);
      // Never faster than it was: the point is to shorten, not to invent.
      expect(reduced.duration, `${n}`).toBeLessThanOrEqual(token.duration);
    }
  });

  it("stops every loop rather than speeding it up into a flicker", () => {
    for (const n of names) {
      if (!tokenOf(n).loop) continue;
      expect(withReducedMotion(tokenOf(n), true).duration, `${n}`).toBe(0);
    }
  });

  it("changes nothing when it is off", () => {
    for (const n of names) expect(withReducedMotion(tokenOf(n), false)).toEqual(tokenOf(n));
  });
});

describe("every motion answers §27's question", () => {
  it("teaches something, in words, for every token", () => {
    for (const [name, token] of Object.entries(motion))
      expect(token.teaches.trim().length, `${name} teaches nothing`).toBeGreaterThan(10);
  });
});
