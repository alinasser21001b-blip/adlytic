/**
 * @blueprint §5 · §7 · S1 · V2 · R2
 * @owner patient-app
 * @why The generic graph tests live in the navigation package; this asserts the
 *      PATIENT app's real contracts form a sound graph. It caught R2: the
 *      request flow declared a prescription-capture step the app could not
 *      render, which would have stranded every patient with a
 *      prescription-required line.
 */
import { describe, it, expect } from "vitest";
import { buildGraph, unreachable, traps, flowGaps, stackFor, resolveBack, PATIENT_FLOWS, type NavScreen } from "@dawai/navigation";
import { CORE_LOOP } from "./core-loop.contract.js";

const g = buildGraph(CORE_LOOP.map((c): NavScreen => ({
  id: c.id, exits: c.exits, back: c.back, destination: c.location.destination,
})));

describe("the patient app's real graph", () => {
  it("has no unreachable screen", () => expect(unreachable(g)).toEqual([]));
  it("has no trap", () => expect(traps(g)).toEqual([]));
  it("renders every screen its flows declare", () => expect(flowGaps(g, PATIENT_FLOWS)).toEqual([]));
});

describe("arriving by notification never leaves the user with no way back", () => {
  it("a reservation carries Today beneath it", () => expect(stackFor(g, "V2")).toEqual(["S1", "V2"]));
  it("a pop with no history lands on the destination root", () => {
    const r = resolveBack(g, "F2", []);
    expect(r.kind).toBe("replace");
  });
});
