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

describe("D05 — a disposition list decides this guardian's subjects, exactly once each", () => {
  it("a complete, well-formed list passes", () => {
    const r = checkDispositions(["s1", "s2"], [
      { subjectId: "s1", action: "transfer" },
      { subjectId: "s2", action: "delete" },
    ]);
    expect(isOk(r)).toBe(true);
  });

  it("a subject this guardian does not manage is refused", () => {
    // It used to be ACCEPTED and returned — an instruction to delete someone
    // else's medical record, handed back to the caller as validated.
    const r = checkDispositions(["s1"], [
      { subjectId: "s1", action: "transfer" },
      { subjectId: "not-mine", action: "delete" },
    ]);
    expect(isErr(r) && r.error.code).toBe("NOT_FOUND_OR_NOT_YOURS");
  });

  it("§5 rule 3 — a subject that does not exist fails the same way as one that is not yours", () => {
    // Otherwise the refusal itself tells a caller which subject ids are real.
    const notYours = checkDispositions(["s1"], [{ subjectId: "s2-belongs-to-someone", action: "delete" }]);
    const notReal = checkDispositions(["s1"], [{ subjectId: "no-such-subject-anywhere", action: "delete" }]);
    expect(isErr(notYours) && notYours.error.code).toBe(isErr(notReal) ? notReal.error.code : null);
  });

  it("one subject decided twice is refused — two choices is not one choice", () => {
    // «transfer» and «delete» for the same person both passed, and nothing
    // said which won.
    const r = checkDispositions(["s1"], [
      { subjectId: "s1", action: "transfer" },
      { subjectId: "s1", action: "delete" },
    ]);
    expect(isErr(r)).toBe(true);
  });

  it("a subject left undecided is still refused, with how many", () => {
    const r = checkDispositions(["s1", "s2"], [{ subjectId: "s1", action: "transfer" }]);
    expect(isErr(r) && r.error.code).toBe("DEPENDENT_DISPOSITION_MISSING");
    expect(isErr(r) && r.error.detail?.["count"]).toBe(1);
  });

  it("an empty list for a guardian with no managed subjects is fine", () => {
    expect(isOk(checkDispositions([], []))).toBe(true);
  });
});
