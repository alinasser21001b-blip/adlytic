import { describe, expect, it } from "vitest";
import * as Draft from "./draft.js";
import type { CatalogueHit } from "../ports.js";

const hit = (id: string, over: Partial<CatalogueHit> = {}): CatalogueHit => ({
  itemId: id, name: `دواء ${id}`, latinName: `Drug ${id}`,
  form: "أقراص", strength: "500 ملغم",
  requestable: true, requiresPrescription: false, isControlled: false, ...over,
});

const base = () => Draft.newDraft("subject-1", "district-1");

describe("assembling the lines", () => {
  it("starts at the middle urgency window, so no request is over- or understated", () => {
    expect(base().urgency).toBe("today");
  });

  it("refuses a controlled item at the moment it is added (D42)", () => {
    const { draft, refusal } = Draft.add(base(), hit("a", { isControlled: true }));
    expect(refusal?.code).toBe("CONTROLLED_NOT_SUPPORTED");
    expect(draft.lines).toHaveLength(0);
  });

  it("stops at eight lines and says which limit was hit", () => {
    let d = base();
    for (let i = 0; i < 8; i += 1) d = Draft.add(d, hit(`i${i}`)).draft;
    expect(d.lines).toHaveLength(8);
    const { draft, refusal } = Draft.add(d, hit("i9"));
    expect(refusal).toMatchObject({ code: "TOO_MANY_LINES", detail: { max: 8, got: 9 } });
    expect(draft.lines).toHaveLength(8);
  });

  it("the same medicine twice is one line with more packs, not two lines", () => {
    const once = Draft.add(base(), hit("a")).draft;
    const twice = Draft.add(once, hit("a")).draft;
    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0]!.packs).toBe(2);
  });

  it("a quantity below one removes the line rather than trapping a mis-tap", () => {
    const d = Draft.add(base(), hit("a")).draft;
    expect(Draft.setPacks(d, "a", 0).draft.lines).toHaveLength(0);
  });

  it("changing the subject keeps the lines — realising it is for your mother is not a restart", () => {
    const d = Draft.add(base(), hit("a")).draft;
    expect(Draft.setSubject(d, "subject-2").lines).toHaveLength(1);
  });

  it("reports how many lines are left, so the limit is visible before it is hit", () => {
    expect(Draft.remainingLines(base())).toBe(8);
    expect(Draft.remainingLines(Draft.add(base(), hit("a")).draft)).toBe(7);
  });
});

describe("the prescription gate (D18)", () => {
  const withRx = () => Draft.add(base(), hit("rx", { requiresPrescription: true })).draft;

  it("lets the line be drafted — the photo comes at R2, not at the tap", () => {
    expect(withRx().lines).toHaveLength(1);
    expect(Draft.linesNeedingPrescription(withRx())).toHaveLength(1);
  });

  it("refuses to send until the paper is attached", () => {
    expect(Draft.validate(withRx())?.code).toBe("PRESCRIPTION_REQUIRED");
    expect(Draft.submission(withRx()).value).toBeNull();
  });

  it("one photo covers every line that needs one — the sheet is photographed once", () => {
    let d = withRx();
    d = Draft.add(d, hit("rx2", { requiresPrescription: true })).draft;
    d = Draft.add(d, hit("plain")).draft;
    const attached = Draft.attachPrescription(d, "img-1");
    expect(Draft.linesNeedingPrescription(attached)).toHaveLength(0);
    expect(attached.lines.find((l) => l.itemId === "plain")!.prescriptionImageId).toBeNull();
    expect(Draft.validate(attached)).toBeNull();
  });
});

describe("the payload for POST /v1/requests", () => {
  it("refuses an empty draft rather than emitting a body with no lines", () => {
    const { value, refusal } = Draft.submission(base());
    expect(value).toBeNull();
    expect(refusal?.code).toBe("NO_LINES");
  });

  it("carries exactly what the request needs and nothing the screen knows", () => {
    const d = Draft.setUrgency(Draft.add(base(), hit("a"), 3).draft, "now");
    const { value } = Draft.submission(d);
    expect(value).toEqual({
      subjectId: "subject-1", districtId: "district-1", urgency: "now",
      lines: [{ itemId: "a", packs: 3, prescriptionImageId: null }],
    });
  });

  it("an empty draft is not worth restoring after an interruption", () => {
    expect(Draft.worthPreserving(base())).toBe(false);
    expect(Draft.worthPreserving(Draft.add(base(), hit("a")).draft)).toBe(true);
  });
});
