/**
 * @blueprint §4 · §22 · §23 · §26
 * @owner platform-foundation
 * @why The UX rules are only real if the checker rejects a screen that breaks
 *      them. Each test here is a screen a reviewer might well have approved.
 */
import { describe, it, expect } from "vitest";
import { auditContract, type ScreenContract } from "./contract.js";

const base: ScreenContract = {
  id: "S1",
  location: { title: "اليوم", destination: "today" },
  purpose: "What is happening right now",
  back: { kind: "pop" },
  primary: { label: "اطلب دواء", leadsTo: "R1", tapsToOutcome: 1 },
  secondary: [],
  states: [],
  exits: ["R1", "V2"],
  telemetry: [],
  persona: "patient",
};

describe("the three questions a user must never have to ask", () => {
  it("accepts a screen that answers all three", () => {
    expect(auditContract(base)).toEqual([]);
  });
  it("rejects a screen with no title — 'where am I?' unanswerable", () => {
    const p = auditContract({ ...base, location: { ...base.location, title: "  " } });
    expect(p.some((x) => /where am I/.test(x))).toBe(true);
  });
  it("rejects a screen with no primary and no stated reason", () => {
    const p = auditContract({ ...base, primary: null });
    expect(p.some((x) => /what do I do next/.test(x))).toBe(true);
  });
  it("accepts no primary when the reason is stated", () => {
    expect(auditContract({ ...base, primary: null, noPrimaryBecause: "a reference view with no action" })).toEqual([]);
  });
});

describe("navigation traps", () => {
  it("rejects a screen with no exits and no back", () => {
    const p = auditContract({ ...base, exits: [], back: { kind: "none", why: "root" } });
    expect(p.some((x) => /navigation trap/.test(x))).toBe(true);
  });
  it("rejects back:none with no reason", () => {
    const p = auditContract({ ...base, back: { kind: "none", why: "" } });
    expect(p.some((x) => /no stated reason/.test(x))).toBe(true);
  });
});

describe("§22 — empty states", () => {
  it("rejects an empty state with nothing to do", () => {
    const p = auditContract({
      ...base,
      states: [{ kind: "empty", explains: "ما عندك حجوزات", action: null, isSuccess: false }],
    });
    expect(p.some((x) => /requires one thing to do/.test(x))).toBe(true);
  });
  it("allows a success-shaped empty state to have no action", () => {
    // «كل شي تمام» is reassurance, not absence — §22 names two of these.
    expect(auditContract({
      ...base,
      states: [{ kind: "empty", explains: "كل شي تمام", action: null, isSuccess: true }],
    })).toEqual([]);
  });
  it("rejects an empty state that explains nothing", () => {
    const p = auditContract({
      ...base,
      states: [{ kind: "empty", explains: "", action: { label: "ابحث", leadsTo: "F2" }, isSuccess: false }],
    });
    expect(p.some((x) => /explains nothing/.test(x))).toBe(true);
  });
});

describe("§23 — error states answer three questions", () => {
  it("rejects 'something went wrong'", () => {
    const p = auditContract({
      ...base,
      states: [{ kind: "error", whatFailed: "Something went wrong", workPreserved: true, action: { label: "أعد", leadsTo: "S1" } }],
    });
    expect(p.some((x) => /does not name what failed/.test(x))).toBe(true);
  });
  it("accepts an error that names the failure and one action", () => {
    expect(auditContract({
      ...base,
      states: [{ kind: "error", whatFailed: "ما وصل الطلب", workPreserved: true, action: { label: "أعد المحاولة", leadsTo: "R6" } }],
    })).toEqual([]);
  });
});

describe("§21 — an offline state must show the age of what it displays", () => {
  it("rejects a stale view with no age", () => {
    const p = auditContract({ ...base, states: [{ kind: "offline", readOnly: true, showsAge: false }] });
    expect(p.some((x) => /age of what it displays/.test(x))).toBe(true);
  });
});

describe("the primary action must be obvious", () => {
  it("rejects four competing secondary actions", () => {
    const p = auditContract({
      ...base,
      secondary: [1, 2, 3, 4].map((n) => ({ label: `x${n}`, leadsTo: "S1" })),
    });
    expect(p.some((x) => /compete with the primary/.test(x))).toBe(true);
  });
  it("rejects a purpose that is really two purposes", () => {
    const p = auditContract({ ...base, purpose: "Show the day. Also let the user search." });
    expect(p.some((x) => /does too much/.test(x))).toBe(true);
  });
});
