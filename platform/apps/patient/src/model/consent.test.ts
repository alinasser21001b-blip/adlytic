import { describe, expect, it } from "vitest";
import * as Consent from "./consent.js";
import * as Prescription from "./prescription.js";

const sub = (id: string, over: Partial<Consent.Substitution> = {}): Consent.Substitution => ({
  requestLineId: id,
  requestedName: "بانادول",
  offeredName: "سيتامول",
  offeredItemId: "x1",
  priceMinor: 2_500,
  pharmacistNote: "نفس المادة الفعالة، إنتاج شركة ثانية",
  ...over,
});

describe("consent is never assumed (§4 R10)", () => {
  it("starts undecided — there is no way to construct an agreed state", () => {
    const s = Consent.begin("o1", [sub("l1"), sub("l2")]);
    expect(Consent.decisionFor(s, "l1")).toBe("undecided");
    expect(Consent.decisionFor(s, "l2")).toBe("undecided");
    expect(Consent.allDecided(s)).toBe(false);
  });

  it("refuses acceptance while anything is undecided", () => {
    const s = Consent.begin("o1", [sub("l1")]);
    expect(Consent.gate(s)?.code).toBe("SUBSTITUTION_NOT_ACKNOWLEDGED");
  });

  it("treats undecided as NOT agreed when computing what gets reserved", () => {
    // This is the exact failure the rule exists to prevent: a line whose
    // substitution was never answered must not quietly be dispensed.
    const s = Consent.begin("o1", [sub("l1")]);
    expect(Consent.linesToReserve(s, ["l1", "l2"])).toEqual(["l2"]);
  });

  it("is per line — agreeing to one substitution is not agreeing to another", () => {
    let s = Consent.begin("o1", [sub("l1"), sub("l2")]);
    s = Consent.decide(s, "l1", "agreed");
    expect(Consent.allDecided(s)).toBe(false);
    expect(Consent.outstanding(s)).toBe(1);
    expect(Consent.linesToReserve(s, ["l1", "l2"])).toEqual(["l1"]);
  });

  it("can be changed until the offer is accepted", () => {
    let s = Consent.begin("o1", [sub("l1")]);
    s = Consent.decide(s, "l1", "agreed");
    s = Consent.decide(s, "l1", "refused");
    expect(Consent.decisionFor(s, "l1")).toBe("refused");
  });

  it("ignores a decision for a line that has no proposal", () => {
    const s = Consent.begin("o1", [sub("l1")]);
    expect(Consent.decide(s, "nope", "agreed")).toBe(s);
  });
});

describe("refusing costs the patient nothing (D06)", () => {
  it("a refused substitution drops that line and keeps the rest", () => {
    let s = Consent.begin("o1", [sub("l1")]);
    s = Consent.decide(s, "l1", "refused");
    expect(Consent.gate(s)).toBeNull();
    expect(Consent.refusedLines(s)).toEqual(["l1"]);
    // The refused line follows the same path as an out-of-stock line: it joins
    // the child request rather than forcing a choice between a brand the
    // patient did not want and starting again.
    expect(Consent.linesToReserve(s, ["l1", "l2"])).toEqual(["l2"]);
  });

  it("agreeing to all of them lets the whole offer proceed", () => {
    let s = Consent.begin("o1", [sub("l1"), sub("l2")]);
    s = Consent.decide(s, "l1", "agreed");
    s = Consent.decide(s, "l2", "agreed");
    expect(Consent.gate(s)).toBeNull();
    expect([...Consent.agreedLines(s)].sort()).toEqual(["l1", "l2"]);
  });

  it("an offer with no substitution needs no consent at all", () => {
    const s = Consent.begin("o1", []);
    expect(Consent.gate(s)).toBeNull();
    expect(Consent.linesToReserve(s, ["l1"])).toEqual(["l1"]);
  });
});

describe("what the patient is shown to decide on", () => {
  it("puts what they asked for beside what is offered, with the pharmacist's own words", () => {
    const s = Consent.begin("o1", [sub("l1")]);
    expect(Consent.comparison(s, "l1")).toEqual({
      asked: "بانادول",
      offered: "سيتامول",
      note: "نفس المادة الفعالة، إنتاج شركة ثانية",
      priceMinor: 2_500,
      decision: "undecided",
    });
  });
});

describe("R2 and R3 — photographing the paper", () => {
  it("a camera refusal is never a wall", () => {
    expect(Prescription.fromPermission("denied")).toEqual({ kind: "refused", permission: "denied" });
    // A managed device is the same screen: the patient cannot grant it here,
    // so a settings link would not help them.
    expect(Prescription.fromPermission("restricted")).toEqual({ kind: "refused", permission: "restricted" });
  });

  it("an unasked permission is not a refusal", () => {
    expect(Prescription.fromPermission("undetermined").kind).toBe("ready");
    expect(Prescription.fromPermission("granted").kind).toBe("ready");
  });

  it("a captured image is NOT attached until the patient says it is readable (D18)", () => {
    const captured = Prescription.captured("img-1", "file://a.jpg");
    expect(captured.kind).toBe("review");
    // Nothing reads the prescription, so the patient is the only judge.
    expect(Prescription.confirmed(captured)).toEqual({ imageId: "img-1" });
    expect(Prescription.confirmed(Prescription.ready())).toBeNull();
  });

  it("a failed upload keeps the image — only the send failed", () => {
    const failed = Prescription.failed(Prescription.captured("img-1", "file://a.jpg"), "timeout");
    expect(failed).toMatchObject({ kind: "failed", imageId: "img-1", localUri: "file://a.jpg" });
    expect(Prescription.confirmed(failed)).toEqual({ imageId: "img-1" });
  });

  it("retaking discards rather than keeping two photos of one paper", () => {
    expect(Prescription.retake().kind).toBe("ready");
  });

  it("every failure names a condition the patient can change, never the patient (D37)", () => {
    for (const reason of ["dark", "blurred", "cropped", "upload"] as const) {
      const { says, action } = Prescription.whatToFix(reason);
      expect(says.length).toBeGreaterThan(5);
      expect(action.length).toBeGreaterThan(5);
      // No wording may evaluate the person or claim we read the prescription.
      expect(says).not.toMatch(/سيئة|غلط|خطأك|قرأنا/);
    }
  });

  it("tells the patient what 'clear' means rather than making them guess", () => {
    expect(Prescription.LEGIBILITY_CHECKS.length).toBeGreaterThanOrEqual(3);
  });
});
