/**
 * @blueprint §6 · Rule 5
 * @owner platform-foundation
 * @why Every published machine must be structurally sound. Blueprint v3 §10
 *      checked reachability and exits by hand for each diagram; running that as
 *      a test is how it stays true after the tenth change.
 */
import { describe, it, expect } from "vitest";
import { audit, transition, can, statesOf, eventsFrom } from "./machine.js";
import { isErr, isOk } from "./result.js";
import { REFUSAL } from "./refusal.js";
import { RequestMachine, OfferMachine, ReservationMachine } from "../marketplace/machines.js";
import { SubjectMachine, GrantMachine } from "../identity/machines.js";
import { VerificationMachine, EligibilityMachine } from "../pharmacy/machines.js";

/* Lifecycle machines: every one must audit clean.
 * EligibilityMachine is deliberately excluded — a branch's eligibility is a
 * LIVE PROPERTY, not a lifecycle, so it has no terminal state by design and is
 * asserted separately below rather than given a fake one to satisfy the audit. */
const LIFECYCLES = [
  RequestMachine, OfferMachine, ReservationMachine,
  SubjectMachine, GrantMachine, VerificationMachine,
];
const ALL = [...LIFECYCLES, EligibilityMachine];

describe("published state machines — §6", () => {
  for (const m of LIFECYCLES) {
    it(`${m.name}: every state reachable, every non-terminal state has an exit, every edge traced`, () => {
      expect(audit(m as never)).toEqual([]);
    });
  }
  for (const m of ALL) {
    it(`${m.name}: no undocumented transition is representable (Rule 5)`, () => {
      const states = statesOf(m as never);
      for (const from of states) {
        const legal = new Set(eventsFrom(m as never, from));
        const allEvents = new Set(m.transitions.map((t) => t.on));
        for (const on of allEvents) {
          const r = transition(m as never, from, on);
          if (legal.has(on)) expect(isOk(r)).toBe(true);
          else {
            expect(isErr(r)).toBe(true);
            if (isErr(r)) expect(r.error.code).toBe(REFUSAL.ILLEGAL_TRANSITION);
          }
        }
      }
    });
  }
});

describe("EligibilityMachine has no terminal state, deliberately — §6", () => {
  // A branch's eligibility is a live property, not a lifecycle: it must always
  // be able to return to receiving. `audit` therefore reports the missing
  // terminal, which is why this machine declares terminal: [] and is asserted
  // separately rather than being given a fake terminal state.
  it("audit reports the absent terminal, and nothing else", () => {
    const problems = audit(EligibilityMachine as never);
    expect(problems).toEqual(["BranchEligibility: no terminal state declared"]);
  });
});

describe("the reservation clock starts at held and nowhere earlier — §6", () => {
  it("requested has no path to collected without confirm", () => {
    expect(can(ReservationMachine, "requested", "verifyCode")).toBe(false);
    expect(can(ReservationMachine, "requested", "confirm")).toBe(true);
    expect(can(ReservationMachine, "held", "verifyCode")).toBe(true);
  });
});

describe("an offer cannot be withdrawn after acceptance — D08", () => {
  it("withdraw is legal only from sent", () => {
    expect(can(OfferMachine, "sent", "withdraw")).toBe(true);
    expect(can(OfferMachine, "accepted", "withdraw")).toBe(false);
  });
});

describe("claiming ends guardianship — D01", () => {
  it("claim_pending + numberVerified lands on self, not on a weakened managed state", () => {
    const r = transition(SubjectMachine, "claim_pending", "numberVerified");
    expect(isOk(r) && r.value).toBe("self");
  });
});
