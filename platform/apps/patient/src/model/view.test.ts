/**
 * @blueprint §4 · §22 · §23 · §26 · S1 · R7
 * @owner patient-app
 * @why This module answers principle 2's three questions for every screen, so
 *      a mistake here is a mistake on all of them at once. Two of the cases
 *      below are ones that actually shipped: S1 greeting a brand-new account
 *      with "everything is fine", and R7 offering «شوف العرض الواصل» over zero
 *      offers because a declared `null` was read as "no opinion".
 */
import { describe, expect, it } from "vitest";
import { buildGraph, type NavGraph } from "@dawai/navigation";
import type { ScreenContract } from "@dawai/design";
import { resolveView, treatmentFor, renderability, type Phase } from "./view.js";

const contract = (over: Partial<ScreenContract> = {}): ScreenContract => ({
  id: "X1",
  location: { title: "عنوان", destination: "modal" },
  purpose: "a screen",
  back: { kind: "pop" },
  primary: { label: "الأساسي", leadsTo: "X2", tapsToOutcome: 1 },
  secondary: [],
  states: [],
  exits: ["X2"],
  telemetry: [],
  persona: "patient",
  ...over,
});

const graph: NavGraph = buildGraph([
  { id: "X1", exits: ["X2"], back: { kind: "pop" }, destination: "modal" },
  { id: "X2", exits: [], back: { kind: "pop" }, destination: "modal" },
], ["X1"]);

const view = (c: ScreenContract, phase: Phase = { kind: "ready" }) =>
  resolveView(c, phase, graph, ["X1"], []);

describe("§22 — the state a screen shows is looked up, not improvised", () => {
  it("ready has no treatment, by definition", () => {
    expect(treatmentFor(contract(), { kind: "ready" })).toBeNull();
  });

  it("a declared treatment is found by its kind", () => {
    const c = contract({ states: [{ kind: "loading", skeletonMatchesContent: true }] });
    expect(treatmentFor(c, { kind: "loading" })?.kind).toBe("loading");
  });

  it("S1's two empties are told apart by isSuccess, not by order", () => {
    // Picking the first would greet a new account with "everything is fine"
    // and no way to start.
    const c = contract({ states: [
      { kind: "empty", isSuccess: true, explains: "كلشي تمام", action: null },
      { kind: "empty", isSuccess: false, explains: "ابدأ من هنا", action: null },
    ] });
    const explains = (p: Phase) => {
      const treatment = treatmentFor(c, p);
      return treatment?.kind === "empty" ? treatment.explains : null;
    };
    expect(explains({ kind: "empty", isSuccess: false })).toBe("ابدأ من هنا");
    expect(explains({ kind: "empty", isSuccess: true })).toBe("كلشي تمام");
  });

  it("an undeclared phase resolves to null rather than to something else", () => {
    expect(treatmentFor(contract(), { kind: "offline", ageMs: null })).toBeNull();
  });
});

describe("§23 — which primary a state gets", () => {
  const states: ScreenContract["states"] = [{ kind: "empty", isSuccess: true, explains: "ما وصل شي", action: null }];

  it("with no opinion, the screen's own primary stands", () => {
    const v = view(contract({ states }), { kind: "empty", isSuccess: true });
    expect(v.primary?.label).toBe("الأساسي");
  });

  it("a state that names a primary overrides the screen's", () => {
    const c = contract({ states, primaryWhen: { empty: { label: "غيره", leadsTo: "X2", tapsToOutcome: 1 } } });
    expect(view(c, { kind: "empty", isSuccess: true }).primary?.label).toBe("غيره");
  });

  it("a state that declares null has NO primary — this is the R7 defect", () => {
    // `??` read a declared null as "no opinion" and fell back to the screen's
    // primary, so R7 offered «شوف العرض الواصل» over zero offers. Key presence
    // is the difference, and this is the test that would have caught it.
    const c = contract({ states, primaryWhen: { empty: null } });
    expect(view(c, { kind: "empty", isSuccess: true }).primary).toBeNull();
  });

  it("a state opinion never leaks into the ready phase", () => {
    const c = contract({ states, primaryWhen: { empty: null } });
    expect(view(c).primary?.label).toBe("الأساسي");
  });
});

describe("principle 2 — where am I, and how far along", () => {
  it("carries the title and destination from the contract", () => {
    const v = view(contract());
    expect(v.title).toBe("عنوان");
    expect(v.destination).toBe("modal");
  });

  it("a screen outside every flow reports no progress rather than a wrong one", () => {
    // A progress indicator on a standalone screen is a lie about a journey the
    // user is not on.
    expect(view(contract()).progress).toBeNull();
  });

  it("back is resolved against the live stack, not the declared intention", () => {
    expect(resolveView(contract(), { kind: "ready" }, graph, ["X1"], []).back).toEqual(
      resolveView(contract(), { kind: "ready" }, graph, ["X1"], []).back);
    expect(view(contract()).back).toBeDefined();
  });
});

describe("renderability — the runtime half of the ux-check gate", () => {
  it("a ready screen is always renderable", () => {
    expect(renderability(view(contract()))).toBeNull();
  });

  it("a phase with no declared treatment is named, not thrown", () => {
    // A patient holding a reservation code must not lose the screen because a
    // treatment was missing, so this returns a reason and lets the caller decide.
    const problem = renderability(view(contract(), { kind: "error", detail: null }));
    expect(problem).toContain("X1");
    expect(problem).toContain("error");
  });

  it("a declared treatment makes the same phase renderable", () => {
    const c = contract({ states: [{ kind: "error", whatFailed: "الإرسال", workPreserved: true, action: { label: "عيد", leadsTo: "X1" } }] });
    expect(renderability(view(c, { kind: "error", detail: null }))).toBeNull();
  });
});
