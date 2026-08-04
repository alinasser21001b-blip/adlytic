/**
 * @blueprint §9 Identity · E6 · D26
 * @owner clinical-engine
 * @why This is the rule that stands between a phone number and an account, so
 *      the ways it can be wrong are: letting a wrong code through, spending a
 *      patient's attempts on the app's own timing, and letting attempts be
 *      spent without limit. Each has a test.
 */
import { describe, it, expect } from "vitest";
import { instant } from "../shared/instant.js";
import { isOk, isErr } from "../shared/result.js";
import {
  submit, consumeAttempt, isExpired, attemptsLeft, ChallengeMachine,
  MAX_ATTEMPTS, CODE_LIFETIME_MS, type Challenge,
} from "./verification.js";
import { transition } from "../shared/machine.js";

const sent = (over: Partial<Challenge> = {}): Challenge =>
  ({ challengeId: "ch-1", state: "sent", used: 0, issuedAt: instant(0), ...over });

describe("a code is judged once, and only while it is live", () => {
  it("the right code verifies", () => {
    const r = submit(sent(), true, instant(1_000));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.state).toBe("verified");
  });

  it("a wrong code refuses and says how many tries are left", () => {
    const r = submit(sent(), false, instant(1_000));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("WRONG_CODE");
      expect(r.error.detail?.["left"]).toBe(MAX_ATTEMPTS - 1);
    }
  });

  it("the last wrong code exhausts rather than merely refusing", () => {
    const r = submit(sent({ used: MAX_ATTEMPTS - 1 }), false, instant(1_000));
    expect(isErr(r) && r.error.code).toBe("ATTEMPTS_EXHAUSTED");
  });

  it("a challenge that is not `sent` cannot be judged at all", () => {
    for (const state of ["requested", "verified", "spent", "expired"] as const) {
      const r = submit(sent({ state }), true, instant(1_000));
      expect(isErr(r) && r.error.code, state).toBe("ILLEGAL_TRANSITION");
    }
  });
});

describe("expiry is the app's timing, never the patient's mistake", () => {
  it("expires exactly at the lifetime, not a millisecond earlier", () => {
    expect(isExpired(sent(), instant(CODE_LIFETIME_MS - 1))).toBe(false);
    expect(isExpired(sent(), instant(CODE_LIFETIME_MS))).toBe(true);
  });

  it("an expired code refuses as expired even when the code is CORRECT", () => {
    const r = submit(sent(), true, instant(CODE_LIFETIME_MS));
    expect(isErr(r) && r.error.code).toBe("CODE_EXPIRED");
  });

  it("expiry is checked BEFORE the attempt is counted", () => {
    // Spending one of five attempts because the clock moved would be the app
    // punishing a patient for its own timing.
    const c = sent();
    const r = submit(c, false, instant(CODE_LIFETIME_MS));
    expect(isErr(r) && r.error.code).toBe("CODE_EXPIRED");
    expect(consumeAttempt({ ...c, state: "expired" }).used).toBe(0);
  });
});

describe("attempts are finite, and cannot be spent twice", () => {
  it("attemptsLeft counts down from the maximum and never below zero", () => {
    expect(attemptsLeft(sent())).toBe(MAX_ATTEMPTS);
    expect(attemptsLeft(sent({ used: 2 }))).toBe(MAX_ATTEMPTS - 2);
    expect(attemptsLeft(sent({ used: MAX_ATTEMPTS + 3 }))).toBe(0);
  });

  it("a wrong code consumes exactly one attempt", () => {
    expect(consumeAttempt(sent()).used).toBe(1);
  });

  it("the counter stops at the maximum — no unlimited guessing", () => {
    expect(consumeAttempt(sent({ used: MAX_ATTEMPTS })).used).toBe(MAX_ATTEMPTS);
  });

  it("only a live challenge consumes anything", () => {
    for (const state of ["verified", "spent", "expired"] as const)
      expect(consumeAttempt(sent({ state })).used, state).toBe(0);
  });
});

describe("every move goes through the published machine (Rule 5)", () => {
  it("a sent challenge accepts exactly the events §9 declares", () => {
    for (const on of ["correctCode", "wrongCode", "attemptsExhausted", "timePassed"] as const)
      expect(isOk(transition(ChallengeMachine, "sent", on)), on).toBe(true);
  });

  it("a verified challenge cannot be judged again", () => {
    expect(isErr(transition(ChallengeMachine, "verified", "correctCode"))).toBe(true);
  });

  it("an expired challenge is terminal for judgement", () => {
    expect(isErr(transition(ChallengeMachine, "expired", "correctCode"))).toBe(true);
  });
});
