/**
 * @blueprint §5 rule 1 · D26 · D04
 * @owner patient-app
 */
import { describe, it, expect } from "vitest";
import { runGuards, ROUTE_GUARDS, requireSession, blockMemorialised } from "./guards.js";

const guestSession = { authenticated: false, activeSubjectMemorialised: false, hasOrderScope: false };
const full = { authenticated: true, activeSubjectMemorialised: false, hasOrderScope: true };

describe("D26 — a guard redirects with a reason, never a blank refusal", () => {
  it("a guest reaching a session route is sent to the explanation, not an error", () => {
    const v = requireSession.evaluate(guestSession);
    expect(v.allow).toBe(false);
    if (!v.allow) {
      expect(v.redirectTo).toBe("E4");
      expect(v.because.trim()).not.toBe("");
    }
  });
});

describe("§3.1 — a guest may browse and search before giving us anything", () => {
  it("Find and Search are unguarded", () => {
    expect(runGuards(ROUTE_GUARDS.F1!, guestSession)).toEqual({ allow: true });
    expect(runGuards(ROUTE_GUARDS.F2!, guestSession)).toEqual({ allow: true });
  });
  it("building a request is guarded", () => {
    expect(runGuards(ROUTE_GUARDS.R1!, guestSession).allow).toBe(false);
  });
});

describe("the first refusal wins, so the reason shown is the real one", () => {
  it("an unauthenticated guest is told about the account, not about scope", () => {
    const v = runGuards(ROUTE_GUARDS.R1!, guestSession);
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.redirectTo).toBe("E4");
  });
});

describe("D04 — a memorialised subject blocks new activity only", () => {
  it("blocks building a request", () => {
    const v = runGuards(ROUTE_GUARDS.R1!, { ...full, activeSubjectMemorialised: true });
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.redirectTo).toBe("S1");
  });
  it("allows reading Today", () => {
    expect(blockMemorialised.evaluate({ ...full, activeSubjectMemorialised: false })).toEqual({ allow: true });
  });
});

describe("§5 rule 1 — every route declares what protects it", () => {
  it("no route is left undeclared", () => {
    for (const [route, guards] of Object.entries(ROUTE_GUARDS))
      expect(Array.isArray(guards), `${route} has no guard declaration`).toBe(true);
  });
});
