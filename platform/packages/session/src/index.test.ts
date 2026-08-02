/**
 * @blueprint D26 · D28 · §3.1
 * @owner identity-service
 * @why D26 is the rule this package exists for, so it gets the sharpest test:
 *      a user who was building a request and had to sign in gets their request
 *      back, byte for byte.
 */
import { describe, it, expect } from "vitest";
import { guest, interrupt, beginVerification, abandonVerification, authenticate, takePending, signOut, switchSubject } from "./index.js";

const intent = { screen: "R1", draft: { lines: [{ itemId: "i1", packs: 2 }] }, startedAt: 1_000 };

describe("D26 — the pending action survives authentication", () => {
  it("a half-built request comes back after signing in, unchanged", () => {
    let s = guest();
    s = interrupt(s, intent);
    s = beginVerification(s, "ch-1");
    s = authenticate(s, "acct-1", "subj-1");
    const [pending] = takePending(s);
    expect(pending).toEqual(intent);
  });
  it("abandoning verification keeps the intent — the user may come back", () => {
    let s = interrupt(guest(), intent);
    s = beginVerification(s, "ch-1");
    s = abandonVerification(s);
    expect(s.pending).toEqual(intent);
  });
  it("the intent is taken exactly once, so it cannot replay in a loop", () => {
    let s = authenticate(interrupt(guest(), intent), "acct-1", "subj-1");
    const [first, afterFirst] = takePending(s);
    const [second] = takePending(afterFirst);
    expect(first).toEqual(intent);
    expect(second).toBeNull();
  });
});

describe("§3.1 — a guest is a real state, not an error", () => {
  it("starts as a guest with nothing pending", () => {
    expect(guest()).toEqual({ state: "guest", pending: null });
  });
  it("interrupting an authenticated session changes nothing", () => {
    const s = authenticate(guest(), "acct-1", "subj-1");
    expect(interrupt(s, intent)).toBe(s);
  });
});

describe("D28 — signing out leaves no residue of the previous account", () => {
  it("returns a clean guest session", () => {
    authenticate(guest(), "acct-1", "subj-1");
    expect(signOut()).toEqual({ state: "guest", pending: null });
    expect(JSON.stringify(signOut())).not.toContain("acct-1");
  });
});

describe("switching subject", () => {
  it("changes only the active subject", () => {
    const s = authenticate(guest(), "acct-1", "subj-1");
    const t = switchSubject(s, "subj-2");
    expect(t.state === "authenticated" && t.activeSubjectId).toBe("subj-2");
    expect(t.state === "authenticated" && t.accountId).toBe("acct-1");
  });
  it("does nothing to a guest", () => {
    expect(switchSubject(guest(), "subj-2")).toEqual(guest());
  });
});
