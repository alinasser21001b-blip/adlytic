/**
 * @blueprint §5 · §7 · S1 · V2
 * @owner patient-app
 * @why Principle 2: no dead ends, no orphans, predictable back. Each is a
 *      graph property here rather than a claim, tested against the real
 *      contracts the patient app declares.
 */
import { describe, it, expect } from "vitest";
import { buildGraph, unreachable, traps, danglingExits, resolveBack, stackFor, flowGaps, type NavScreen } from "./graph.js";
import { PATIENT_FLOWS, auditFlow, progressAt } from "./flow.js";

/** A fixture, not the app's contracts — a package must never import an app. */
const screens: NavScreen[] = [
  { id: "S1", exits: ["R1", "V2"], back: { kind: "none", why: "tab root" }, destination: "today" },
  { id: "F1", exits: ["F2"], back: { kind: "none", why: "tab root" }, destination: "find" },
  { id: "F2", exits: ["R1"], back: { kind: "pop" }, destination: "find" },
  { id: "R1", exits: ["R2", "R6"], back: { kind: "dismiss", returnsTo: "S1" }, destination: "modal" },
  { id: "R6", exits: ["R7"], back: { kind: "pop" }, destination: "modal" },
  { id: "R7", exits: ["R8"], back: { kind: "dismiss", returnsTo: "S1" }, destination: "modal" },
  { id: "R8", exits: ["V1"], back: { kind: "pop" }, destination: "modal" },
  { id: "V1", exits: ["V2", "R8"], back: { kind: "none", why: "a hold request is in flight" }, destination: "modal" },
  { id: "V2", exits: ["S1"], back: { kind: "replace", with: "S1", why: "lives on Today" }, destination: "today" },
  { id: "R2", exits: ["R1"], back: { kind: "pop" }, destination: "modal" },
];
const g = buildGraph(screens);


describe("the graph has no structural defects", () => {
  it("no screen is unreachable from an entry point", () => {
    expect(unreachable(g)).toEqual([]);
  });
  it("no screen is a trap", () => {
    expect(traps(g)).toEqual([]);
  });
  it("no exit dangles", () => {
    expect(danglingExits(g)).toEqual([]);
  });
});

describe("back is predictable, including at the edges", () => {
  it("a pop with history pops", () => {
    expect(resolveBack(g, "F2", ["F1"])).toEqual({ kind: "pop", to: "F1" });
  });
  it("a pop with NO history lands on the destination root, never nowhere", () => {
    // This is the deep-link case: a notification opened a detail with no stack.
    const r = resolveBack(g, "F2", []);
    expect(r.kind).toBe("replace");
    if (r.kind === "replace") expect(r.to).toBe("F1");
  });
  it("a modal dismiss returns to its opener", () => {
    expect(resolveBack(g, "R1", ["S1"])).toEqual({ kind: "replace", to: "S1" });
  });
  it("a tab root with no history exits the app", () => {
    expect(resolveBack(g, "S1", [])).toEqual({ kind: "exitApp" });
  });
  it("a screen that must not be popped stays, and says why", () => {
    const r = resolveBack(g, "V1", ["R8"]);
    expect(r.kind).toBe("stay");
    if (r.kind === "stay") expect(r.why).toMatch(/in flight/);
  });
});

describe("a deep link resolves to a full stack, never a bare screen", () => {
  it("a reservation arriving by notification has Today beneath it", () => {
    expect(stackFor(g, "V2")).toEqual(["S1", "V2"]);
  });
  it("a modal deep link carries its opener", () => {
    expect(stackFor(g, "R1")).toEqual(["S1", "R1"]);
  });
  it("a tab root is its own stack", () => {
    expect(stackFor(g, "S1")).toEqual(["S1"]);
  });
});

describe("flows complete inside the graph", () => {
  it("every flow audits clean", () => {
    for (const f of PATIENT_FLOWS) expect(auditFlow(f)).toEqual([]);
  });
  it("no flow references a screen the graph does not have", () => {
    expect(flowGaps(g, PATIENT_FLOWS)).toEqual([]);
  });
});

describe("progress answers all four questions principle 2 asks", () => {
  const flow = PATIENT_FLOWS[0]!;
  it("mid-flow: where, before, next, how far", () => {
    const p = progressAt(flow, "R7", ["R2"]);
    expect(p).not.toBeNull();
    expect(p!.stepIndex).toBe(3);
    expect(p!.totalSteps).toBe(5);
    expect(p!.previous?.screen).toBe("R6");
    expect(p!.next?.screen).toBe("R8");
    expect(p!.goal).toMatch(/تحجزه/);
  });
  it("a skipped optional step is not counted — the denominator is honest", () => {
    const withPhoto = progressAt(flow, "R6", [])!;
    const withoutPhoto = progressAt(flow, "R6", ["R2"])!;
    expect(withPhoto.totalSteps).toBe(6);
    expect(withoutPhoto.totalSteps).toBe(5);
    expect(withoutPhoto.stepIndex).toBe(2);
  });
  it("the last step has no next", () => {
    expect(progressAt(flow, "V1", ["R2"])!.next).toBeNull();
  });
  it("a screen outside the flow reports no progress rather than a wrong one", () => {
    expect(progressAt(flow, "S1")).toBeNull();
  });
});
