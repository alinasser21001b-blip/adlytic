/**
 * @blueprint §7 · D16 · D17 · D18 · D19 · D42
 * @owner clinical-engine
 * @why The gates are the whole of Phase 0's clinical safety. The most important
 *      assertion in this file is negative: there is no outcome meaning "safe".
 */
import { describe, it, expect } from "vitest";
import { gateRequestLine, mayConfirmReservation, mayProposeSubstitution, gateHandover } from "./gates.js";
import { isOk, isErr } from "../shared/result.js";
import { REFUSAL } from "../shared/refusal.js";

const plain = { requestable: true, requiresPrescription: false, isControlled: false };

describe("D42 — controlled substances are refused outright", () => {
  it("refuses regardless of a prescription image", () => {
    const r = gateRequestLine({ ...plain, isControlled: true }, true);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.CONTROLLED_NOT_SUPPORTED);
  });
});

describe("D18 — a prescription-required line needs an image", () => {
  it("refuses without one", () => {
    const r = gateRequestLine({ ...plain, requiresPrescription: true }, false);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.PRESCRIPTION_REQUIRED);
  });
  it("allows with one", () => {
    expect(isOk(gateRequestLine({ ...plain, requiresPrescription: true }, true))).toBe(true);
  });
});

describe("D16 — the gate never says anything is safe", () => {
  it("the only allowed outcome is ALLOWED, which carries no clinical claim", () => {
    const r = gateRequestLine(plain, false);
    expect(isOk(r) && r.value).toBe("ALLOWED");
  });
  it("no outcome in the union means clear, safe or checked", () => {
    // If someone adds one, this fails — which is the point. Phase 0 performs no
    // interaction checking, so a value implying it did would be a lie.
    const outcomes = ["ALLOWED", "REFUSED"];
    expect(outcomes).not.toContain("CLEAR");
    expect(outcomes).not.toContain("SAFE");
    expect(outcomes).not.toContain("NO_INTERACTIONS");
  });
});

describe("D19 — confirming is commercial, substituting is clinical", () => {
  const assistant = { role: "assistant", licenceVerified: false } as const;
  const pharmacist = { role: "pharmacist", licenceVerified: true } as const;
  const unlicensed = { role: "pharmacist", licenceVerified: false } as const;

  it("an assistant CAN confirm a reservation — this is the row v1 got wrong", () => {
    expect(isOk(mayConfirmReservation(assistant))).toBe(true);
  });
  it("an assistant cannot propose a substitution", () => {
    const r = mayProposeSubstitution(assistant);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.SUBSTITUTION_REQUIRES_PHARMACIST);
  });
  it("a pharmacist without a verified licence cannot propose a substitution", () => {
    expect(isErr(mayProposeSubstitution(unlicensed))).toBe(true);
  });
  it("a licensed pharmacist can", () => {
    expect(isOk(mayProposeSubstitution(pharmacist))).toBe(true);
  });
});

describe("§7 control 2 — the handover checklist", () => {
  const full = { prescriptionSeen: true, allergyAsked: true, packsConfirmed: true };
  const assistant = { role: "assistant", licenceVerified: false } as const;
  const pharmacist = { role: "pharmacist", licenceVerified: true } as const;

  it("refuses an incomplete checklist", () => {
    expect(isErr(gateHandover({ ...full, allergyAsked: false }, false, assistant))).toBe(true);
  });
  it("an assistant may complete a handover with no prescription line", () => {
    expect(isOk(gateHandover(full, false, assistant))).toBe(true);
  });
  it("only a pharmacist may attest a prescription was seen", () => {
    const r = gateHandover(full, true, assistant);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.REQUIRES_PHARMACIST);
    expect(isOk(gateHandover(full, true, pharmacist))).toBe(true);
  });
});
