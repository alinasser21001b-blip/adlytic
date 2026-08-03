/**
 * @blueprint R2 · R3 · D18 · D37 · §5
 * @owner patient-app
 * @why Two Blueprint rules shape this module and both are invisible in the
 *      types, so both are tested directly. D18: Phase 0 does not read the
 *      prescription, so nothing may claim to have understood the image and
 *      nothing may attach one the patient has not confirmed. D37: a failure
 *      names the fixable condition, never the person.
 */
import { describe, expect, it } from "vitest";
import {
  ready, fromPermission, capturing, captured, confirmed, retake, failed,
  whatToFix, LEGIBILITY_CHECKS, type Capture, type CameraPermission,
  attached,
  uploading,
} from "./prescription.js";

describe("§5 — refusing the camera is never a wall", () => {
  it("granted and undetermined both start ready", () => {
    // `undetermined` is not `denied`: the difference decides whether we ask or
    // explain, and treating it as a refusal would show an apology for
    // something that has not happened.
    expect(fromPermission("granted")).toEqual({ kind: "ready" });
    expect(fromPermission("undetermined")).toEqual({ kind: "ready" });
  });

  it("denied and restricted are the same screen, because neither can be fixed here", () => {
    // A settings link does not help on a managed device.
    for (const p of ["denied", "restricted"] as const)
      expect(fromPermission(p), p).toEqual({ kind: "refused", permission: p });
  });

  it("every permission the OS can report resolves to a state", () => {
    const all: readonly CameraPermission[] = ["undetermined", "granted", "denied", "restricted"];
    for (const p of all) expect(fromPermission(p).kind, p).toBeTruthy();
  });
});

describe("D18 — nothing attaches an image the patient has not confirmed", () => {
  it("a captured photo is under review, and has NO image id", () => {
    // An id is minted by POST /v1/prescriptions. Before it answers there is
    // not one, and the interface used to ask the platform to supply it.
    expect(captured("file:///a.jpg")).toEqual({ kind: "review", localUri: "file:///a.jpg" });
  });

  it("confirming is the only path to an upload", () => {
    // Skipping R3 would send a blurred photo to a pharmacist who then cannot
    // dispense, and the patient finds out at the counter.
    expect(confirmed(captured("file:///a.jpg"))).toEqual({ localUri: "file:///a.jpg" });
    for (const c of [ready(), capturing(ready()), fromPermission("denied")] as readonly Capture[])
      expect(confirmed(c), c.kind).toBeNull();
  });

  it("a failed upload can still be confirmed — the image survived, only the send did not", () => {
    const f = failed(uploading(captured("file:///a.jpg")), "upload");
    expect(confirmed(f)).toEqual({ localUri: "file:///a.jpg" });
  });

  it("only an upload that was in flight can fail", () => {
    // A photo under review has not been sent yet, so there is nothing to fail.
    const review = captured("file:///a.jpg");
    expect(failed(review, "upload")).toBe(review);
  });

  it("an image id enters at exactly one place", () => {
    expect(attached("img-9")).toEqual({ kind: "attached", imageId: "img-9" });
  });

  it("retaking discards rather than keeping both", () => {
    // Two photos of one paper is a choice the patient did not ask to make.
    expect(retake()).toEqual({ kind: "ready" });
  });
});

describe("the capture states only move when they legally can", () => {
  it("capturing starts only from ready", () => {
    expect(capturing(ready())).toEqual({ kind: "capturing" });
    const review = captured("file:///a.jpg");
    expect(capturing(review)).toBe(review);
    const refused = fromPermission("denied");
    expect(capturing(refused)).toBe(refused);
  });

  it("failing applies only to something in flight", () => {
    const r = ready();
    expect(failed(r, "upload")).toBe(r);
    expect(failed(uploading(captured("u")), "upload")).toMatchObject({ kind: "failed", localUri: "u", reason: "upload" });
  });
});

describe("D37 — the failure names the condition, not the person", () => {
  it("every reason states something about the NEXT photo and offers an action", () => {
    for (const reason of ["dark", "blurred", "cropped", "upload"] as const) {
      const { says, action } = whatToFix(reason);
      expect(says, reason).toBeTruthy();
      expect(action, reason).toBeTruthy();
    }
  });

  it("no wording evaluates the patient or the photograph as bad", () => {
    // «الصورة مو واضحة» — the condition. «صورة سيئة» — a verdict. D37 forbids
    // the second, and a blaming sentence is one nobody notices until a patient
    // reads it about a photo of their own prescription.
    const blaming = ["سيئة", "خطأك", "غلط", "فاشلة", "رديئة"];
    for (const reason of ["dark", "blurred", "cropped", "upload"] as const) {
      const { says, action } = whatToFix(reason);
      for (const word of blaming) {
        expect(says, `${reason} says "${word}"`).not.toContain(word);
        expect(action, `${reason} action says "${word}"`).not.toContain(word);
      }
    }
  });

  it("nothing claims to have read the prescription (D18)", () => {
    // No wording may imply extraction, validation or understanding.
    const claims = ["قرينا", "تحققنا", "الدواء المكتوب", "الجرعة المكتوبة"];
    for (const reason of ["dark", "blurred", "cropped", "upload"] as const)
      for (const claim of claims)
        expect(whatToFix(reason).says, `${reason}`).not.toContain(claim);
  });
});

describe("R3 tells the patient what a PHARMACIST will need to read", () => {
  it("the checklist is stated, because 'clear' otherwise means guessing", () => {
    expect(LEGIBILITY_CHECKS.length).toBeGreaterThan(0);
    for (const check of LEGIBILITY_CHECKS) expect(check.trim()).not.toBe("");
  });
});
