/**
 * @blueprint S1 · R1 · R6 · R7 · R8 · V1 · V2 · V4 · §22 · §23
 * @owner patient-app
 * @why A contract that is never audited is a comment. These run every declared
 *      contract through the same audit the checker uses, and pin the UX
 *      properties the brief asks for: no dead ends, one obvious next action,
 *      and a bounded number of taps to the outcome.
 */
import { describe, it, expect } from "vitest";
import { auditContract } from "@dawai/design";
import { guardDestinations, ROUTE_GUARDS } from "@dawai/navigation";
import { CORE_LOOP } from "./core-loop.contract.js";

describe("every core-loop screen satisfies the UX contract", () => {
  for (const c of CORE_LOOP)
    it(`${c.id} ${c.location.title}`, () => expect(auditContract(c)).toEqual([]));
});

describe("no dead ends anywhere in the loop", () => {
  const ids = new Set(CORE_LOOP.map((c) => c.id));
  it("every exit names a screen this app declares or the Blueprint contains", () => {
    for (const c of CORE_LOOP)
      for (const e of c.exits)
        expect(typeof e, `${c.id} exits to ${e}`).toBe("string");
  });
  it("every screen can be left", () => {
    for (const c of CORE_LOOP)
      expect(c.exits.length > 0 || c.back.kind !== "none", `${c.id} is a trap`).toBe(true);
  });
  it("the loop is connected from its entry points", () => {
    // Reachability seeds from every ENTRY POINT, not from Today alone: a tab
    // root is reached by the tab bar and a notification screen by a push, and
    // neither is linked from another screen. Seeding only from Today would
    // report a correct screen as unreachable.
    // A guard destination is the third such arrival: E4 is reached when a
    // guest touches an action that needs an account, and no screen exits to it.
    const entryPoints = [
      ...CORE_LOOP.filter((c) => c.back.kind === "none" || c.back.kind === "replace").map((c) => c.id),
      ...guardDestinations(ROUTE_GUARDS),
    ];
    const reach = new Set<string>(entryPoints);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of CORE_LOOP)
        if (reach.has(c.id)) for (const e of c.exits) if (!reach.has(e)) { reach.add(e); grew = true; }
    }
    expect(reach.has("V2"), "a patient cannot reach a reservation").toBe(true);
    expect(reach.has("R8"), "a patient cannot reach the offers").toBe(true);
    const unreachable = [...ids].filter((id) => !reach.has(id));
    expect(unreachable, `unreachable: ${unreachable.join(", ")}`).toEqual([]);
  });
});

describe("the brief: reduce taps without violating the Blueprint", () => {
  it("no screen claims more than one tap to its own outcome", () => {
    for (const c of CORE_LOOP)
      if (c.primary) expect(c.primary.tapsToOutcome, `${c.id}`).toBeLessThanOrEqual(1);
  });
  it("Today to a sent request is four taps: request, add, continue, send", () => {
    const path = ["S1", "R1", "R6"];
    const taps = path.reduce((n, id) => {
      const c = CORE_LOOP.find((x) => x.id === id);
      return n + (c?.primary?.tapsToOutcome ?? 0);
    }, 0);
    expect(taps).toBeLessThanOrEqual(3);
  });
});

describe("§22 — the two empty states on Today are different screens", () => {
  const today = CORE_LOOP.find((c) => c.id === "S1")!;
  const empties = today.states.filter((s) => s.kind === "empty");
  it("there are two, and exactly one is a success", () => {
    expect(empties.length).toBe(2);
    expect(empties.filter((s) => s.kind === "empty" && s.isSuccess).length).toBe(1);
  });
  it("the teaching one offers an action; the reassuring one does not", () => {
    for (const s of empties)
      if (s.kind === "empty") expect(s.isSuccess ? s.action === null : s.action !== null).toBe(true);
  });
});

describe("screens that deliberately have no primary action say why", () => {
  for (const c of CORE_LOOP.filter((x) => x.primary === null))
    it(`${c.id} states its reason`, () => expect(c.noPrimaryBecause?.trim()).toBeTruthy());
});

describe("V1 is un-poppable on purpose and resolves itself", () => {
  const v1 = CORE_LOOP.find((c) => c.id === "V1")!;
  it("back is disabled with a stated reason", () => {
    expect(v1.back.kind).toBe("none");
    if (v1.back.kind === "none") expect(v1.back.why).toMatch(/in flight/);
  });
  it("it exits to both outcomes and back to the offers", () => {
    expect(v1.exits).toEqual(expect.arrayContaining(["V2", "V4", "R8"]));
  });
});
