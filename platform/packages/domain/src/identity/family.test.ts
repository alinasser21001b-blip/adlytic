/**
 * @blueprint §9 · D01 · D02 · D04 · D05
 * @owner identity-service
 */
import { describe, it, expect } from "vitest";
import {
  canAddManagedSubject, inviteStillValid, canReverseMemorialisation, claim,
  checkDispositions, MANAGED_SUBJECT_LIMIT, INVITE_TTL_MS, MEMORIAL_REVERSAL_MS,
} from "./family.js";
import { instant } from "../shared/instant.js";
import { isOk, isErr } from "../shared/result.js";
import { REFUSAL } from "../shared/refusal.js";

describe("§4 S3 — a guardian holds at most six managed subjects", () => {
  it("allows the sixth", () => expect(isOk(canAddManagedSubject(MANAGED_SUBJECT_LIMIT - 1))).toBe(true));
  it("refuses the seventh", () => {
    const r = canAddManagedSubject(MANAGED_SUBJECT_LIMIT);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.MANAGED_SUBJECT_LIMIT);
  });
});

describe("D02 — an invitation expires after seven days", () => {
  const t0 = instant(0);
  it("valid one second before", () => expect(isOk(inviteStillValid(t0, instant(INVITE_TTL_MS - 1000)))).toBe(true));
  it("expired one second after", () => expect(isErr(inviteStillValid(t0, instant(INVITE_TTL_MS + 1000)))).toBe(true));
});

describe("D04 — memorialisation reverses within thirty days and not after", () => {
  const t0 = instant(0);
  it("reversible at 29 days", () => {
    expect(isOk(canReverseMemorialisation(t0, instant(MEMORIAL_REVERSAL_MS - 1000)))).toBe(true);
  });
  it("not reversible at 30 days plus one second", () => {
    const r = canReverseMemorialisation(t0, instant(MEMORIAL_REVERSAL_MS + 1000));
    expect(isErr(r) && r.error.code).toBe(REFUSAL.REVERSAL_WINDOW_PASSED);
  });
});

describe("D01 — claiming ends guardianship rather than weakening it", () => {
  it("returns an ended guardianship and a revocable view grant", () => {
    const r = claim(false);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.guardianshipEnded).toBe(true);
      expect(r.value.formerGuardianGrantScope).toBe("view");
      expect(r.value.revocableByNewAccountHolder).toBe(true);
    }
  });
  it("refuses to claim a subject that already has its own account", () => {
    expect(isErr(claim(true))).toBe(true);
  });
});

describe("D05 — deleting a guardian forces an explicit choice per dependent", () => {
  it("refuses when one dependent has no decision — there is no default", () => {
    const r = checkDispositions(["s1", "s2"], [{ subjectId: "s1", action: "delete" }]);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.DEPENDENT_DISPOSITION_MISSING);
  });
  it("accepts when every dependent is decided", () => {
    const r = checkDispositions(["s1", "s2"], [
      { subjectId: "s1", action: "delete" },
      { subjectId: "s2", action: "transfer" },
    ]);
    expect(isOk(r)).toBe(true);
  });
});
