/**
 * The product rules, applied to every screen state that exists.
 *
 * @blueprint §22 · §23 · §25 · §26 · design/screen-contract
 * @owner patient-app
 * @why These rules were previously asserted screen by screen, in two files,
 *      with the helpers copied between them — which meant a rule only held for
 *      the screens somebody remembered to list, and the one time that mattered
 *      the fixture chosen could not have shown the bug.
 *
 *      Now the rules run over the SAME registry the review gallery
 *      photographs. A new screen state is audited the moment it is added, and
 *      it cannot appear in the review without being audited. That is the
 *      difference between a convention and an architecture: nobody has to
 *      remember, because forgetting is not representable.
 */
import { describe, expect, it } from "vitest";
import * as React from "react";
import TestRenderer, { type ReactTestInstance } from "react-test-renderer";
import { themeFor } from "../ui/theme.js";
import { SHOTS } from "./gallery.jsx";
import { CORE_LOOP } from "./core-loop.contract.js";

const t = themeFor("light");

const render = (el: React.ReactElement) => TestRenderer.create(el).root;

/** Host elements only: a component and the host it renders carry the same
 *  props, so counting both reports two primary actions on a screen with one. */
const controls = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.type === "string"
    && (n.props["accessibilityRole"] === "button" || n.props["accessibilityRole"] === "radio"), { deep: true });

const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : (style as Record<string, unknown>) ?? {};

/**
 * Readable text, minus anything the screen explicitly set left-to-right.
 *
 * An LTR run is a token read in another direction — a dialling prefix, a
 * reservation code, a Latin drug name — and §25's "one system per surface"
 * is about a surface, which is a reading direction. A screen has to opt in by
 * marking the run, so this narrows the exemption rather than widening it.
 */
function rightToLeftText(root: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (child: unknown): void => {
    if (typeof child === "string" || typeof child === "number") out.push(String(child));
    else if (Array.isArray(child)) child.forEach(walk);
    else if (child && typeof child === "object" && "props" in (child as { props?: unknown }))
      walk((child as { props: { children?: unknown } }).props.children);
  };
  for (const n of root.findAll((n) => typeof n.type === "string" && String(n.type) === "Text")) {
    if (flatten(n.props["style"])["writingDirection"] === "ltr") continue;
    walk(n.props["children"]);
  }
  return out.join(" ");
}

function readableText(root: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (child: unknown): void => {
    if (typeof child === "string" || typeof child === "number") out.push(String(child));
    else if (Array.isArray(child)) child.forEach(walk);
    else if (child && typeof child === "object" && "props" in (child as { props?: unknown }))
      walk((child as { props: { children?: unknown } }).props.children);
  };
  for (const n of root.findAll((n) => typeof n.type === "string" && String(n.type) === "Text")) walk(n.props["children"]);
  return out.join(" ");
}

/** Actions that repeat once per row by design. Their labels name the subject,
 *  so a screen reader can still tell them apart. */
const isRowAction = (label: string) =>
  ["أضف", "شيل", "زيادة", "تقليل", "افتح عرض"].some((p) => label.startsWith(p));

describe.each(SHOTS.map((s) => [s.id, s] as const))("%s", (_id, shot) => {
  const root = () => render(shot.element);

  it("has exactly one primary action, at most", () => {
    // §25: the primary must be visually dominant and secondaries must never
    // compete. Counted from the rendered tree, because the rule is about what
    // the eye sees rather than about what a contract declares.
    const filled = controls(root()).filter((c) => flatten(c.props["style"])["backgroundColor"] === t.color.accent);
    expect(filled.length, `${filled.length} filled accent controls`).toBeLessThanOrEqual(1);
  });

  it("puts every control within reach and above the 44pt floor", () => {
    for (const c of controls(root())) {
      const s = flatten(c.props["style"]);
      const h = (s["minHeight"] ?? s["height"]) as number | undefined;
      expect(h, `"${c.props["accessibilityLabel"]}" has no height`).toBeTypeOf("number");
      expect(h!, `"${c.props["accessibilityLabel"]}" is ${h}pt`).toBeGreaterThanOrEqual(44);
    }
  });

  it("gives every control a label a screen reader can read", () => {
    for (const c of controls(root()))
      expect(c.props["accessibilityLabel"], "a control with no accessible label").toBeTruthy();
  });

  it("offers no action twice", () => {
    const labels = controls(root())
      .map((c) => String(c.props["accessibilityLabel"]))
      .filter((l) => l !== "رجوع" && !isRowAction(l));
    const seen = new Set<string>();
    const repeated = labels.filter((l) => (seen.has(l) ? true : (seen.add(l), false)));
    expect(repeated, `repeats: ${repeated.join(", ")}`).toEqual([]);
  });

  it("explains every disabled control rather than leaving a dead button", () => {
    const disabled = controls(root()).filter((c) => c.props["accessibilityState"]?.disabled === true);
    if (disabled.length === 0) return;
    // A disabled control with nothing on screen explaining it is the single
    // most common way an app feels broken rather than careful.
    expect(readableText(root()).trim().length, "a disabled control with no visible explanation").toBeGreaterThan(20);
  });

  it("uses one numeral system in its Arabic text", () => {
    // §25 — mixing Arabic-Indic and Western digits in one glance is a defect,
    // not a style, and server-supplied strings carry either.
    //
    // Isolated Latin runs are exempt, and deliberately so: a drug name printed
    // on the box is "Augmentin 625" and a reservation code is one alphabet
    // whichever alphabet it is. The delivered design puts «أوجمنتين ٦٢٥» and
    // "Augmentin 625" on adjacent lines for exactly this reason. What the rule
    // forbids is two systems inside ARABIC text.
    // An isolated run is one the screen MARKED as left-to-right — that is the
    // exact, checkable version of the idea. Token-wise Latin letters were an
    // approximation of it and missed «+964», a dialling prefix that is
    // deliberately LTR and contains no letter at all.
    const arabicOnly = rightToLeftText(root())
      .split(/\s+/).filter((tok) => !/[A-Za-z]/.test(tok)).join(" ");
    const arabicIndic = /[٠-٩۰-۹]/.test(arabicOnly);
    const western = /[0-9]/.test(arabicOnly);
    expect(arabicIndic && western, `both numeral systems in Arabic text: ${arabicOnly.slice(0, 120)}`).toBe(false);
  });

  it("says something — a screen that renders nothing readable is a blank screen", () => {
    expect(readableText(root()).trim().length).toBeGreaterThan(0);
  });
});

/**
 * A success empty — "we asked and nobody has answered yet" — is content rather
 * than an interruption, so the frame does not draw it and the SCREEN must, in
 * the place the delivery puts it.
 *
 * Without this rule those words could simply vanish: the contract would still
 * declare the state, the dashboard gate that counts declared treatments would
 * still pass, and the screen would say nothing at all. That is exactly the
 * failure mode the gallery exists to make impossible.
 */
describe("a screen-owned success empty is actually said", () => {
  // Screens with no photographed state are unbuilt — R13 today, since S1 was
  // built — and are tracked as documented gaps rather than failed here. This
  // rule is about words disappearing from a screen that EXISTS, which is what
  // it caught the moment S1 arrived: `StateBlock` renders nothing for a
  // success empty by design, so Today's «كل شي تمام» existed in the contract
  // and appeared on no screen until the screen said it itself.
  const successEmpties = CORE_LOOP
    .flatMap((c) => c.states
      .filter((st) => st.kind === "empty" && st.isSuccess)
      .map((st) => [c.id, (st as { explains: string }).explains] as const))
    .filter(([id]) => SHOTS.some((s) => s.id === id || s.id.startsWith(`${id}-`)));

  it("covers at least one built screen, or this rule is guarding nothing", () => {
    expect(successEmpties.length).toBeGreaterThan(0);
  });

  it.each(successEmpties)("%s says «%s» in some photographed state", (id, explains) => {
    const shots = SHOTS.filter((s) => s.id === id || s.id.startsWith(`${id}-`));
    expect(shots.some((s) => readableText(render(s.element)).includes(explains)),
      `no photographed state of ${id} says «${explains}»`).toBe(true);
  });
});

describe("the registry itself", () => {
  it("gives every state a unique id, so a screenshot cannot overwrite another", () => {
    const ids = SHOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("explains why every state exists", () => {
    for (const s of SHOTS) expect(s.note.length, `${s.id} has no note`).toBeGreaterThan(20);
  });
});

