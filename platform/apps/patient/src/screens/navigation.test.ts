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
import { buildGraph, unreachable, traps, flowGaps, stackFor, resolveBack, guardDestinations, auditFlow, ROUTE_GUARDS, type NavScreen } from "@dawai/navigation";
import { CORE_LOOP } from "./core-loop.contract.js";
import { PATIENT_FLOWS } from "./flows.js";
import { TABS, viewOf } from "./graph.js";

const g = buildGraph(CORE_LOOP.map((c): NavScreen => ({
  id: c.id, exits: c.exits, back: c.back, destination: c.location.destination,
})), guardDestinations(ROUTE_GUARDS));

describe("the patient app's real graph", () => {
  it("has no unreachable screen", () => expect(unreachable(g)).toEqual([]));
  it("has no trap", () => expect(traps(g)).toEqual([]));
  it("renders every screen its flows declare", () => expect(flowGaps(g, PATIENT_FLOWS)).toEqual([]));
  // The real journeys, audited where they now live. Navigation's own tests use
  // a fixture; these are the ones a patient walks.
  it("every patient flow audits clean", () => {
    for (const f of PATIENT_FLOWS) expect(auditFlow(f), f.id).toEqual([]);
  });
});

describe("arriving by notification never leaves the user with no way back", () => {
  it("a reservation carries Today beneath it", () => expect(stackFor(g, "V2")).toEqual(["S1", "V2"]));
  it("a pop with no history lands on the destination root", () => {
    const r = resolveBack(g, "F2", []);
    expect(r.kind).toBe("replace");
  });
});

describe("the tabs are the roots the contracts already declare", () => {
  it("is exactly the built screens that declare themselves the root of a destination", () => {
    // Named here as well as derived, because "which tabs does this app have" is
    // a product fact and deriving it is only safe if something checks the
    // answer. S1 and F1 are the two screens whose contracts give "root of the
    // … tab" as the reason they have no back control.
    expect(TABS.map((t) => t.id)).toEqual(["S1", "F1"]);
    expect(TABS.map((t) => t.title)).toEqual(["اليوم", "ابحث"]);
  });

  it("does not offer a screen that declares no back for some other reason", () => {
    // V1 also declares `back: none` — because a hold request is in flight and
    // going back would leave the patient unsure whether it happened. Deriving
    // the tabs from the missing back alone put «نحجز لك» in the tab bar,
    // offered as somewhere to go while a pharmacy was deciding.
    expect(TABS.some((t) => t.id === "V1")).toBe(false);
  });

  it("a modal and the sign-in chain cover the tabs rather than sitting in one", () => {
    for (const id of ["R1", "R6", "R8", "E4", "E5"] as const)
      expect(viewOf(id, { kind: "ready" }, []).tabs, id).toEqual([]);
  });

  it("a screen arrived at by notification carries no tabs, and still has a way back", () => {
    // V2 belongs to `today`, so destination alone would give it the tab bar —
    // and at 320pt the 78pt that costs pushed «اتصال بالصيدلية» off the screen
    // Blueprint v3 says must never fail. Its own contract says why it is
    // different: «there is no stack behind a notification».
    for (const id of ["V2", "V4"] as const) {
      expect(viewOf(id, { kind: "ready" }, []).tabs, id).toEqual([]);
      expect(viewOf(id, { kind: "ready" }, []).back.kind, `${id} must still offer a way back`).toBe("replace");
    }
  });

  it("a tab root carries them", () => {
    for (const id of ["S1", "F1", "F2"] as const)
      expect(viewOf(id, { kind: "ready" }, []).tabs.length, id).toBe(2);
  });
});
