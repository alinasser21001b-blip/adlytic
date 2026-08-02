/**
 * R2 and R3 — photographing the paper.
 *
 * @blueprint R2 · R3 · D18 · D37 · POST /v1/prescriptions · PrescriptionImage
 * @owner patient-app
 * @why Two rules from Blueprint v3 shape everything here. D18: Phase 0 does
 *      NOT read the prescription — no OCR, no extraction, no validation of
 *      content — so nothing in this module may claim to have understood the
 *      image, and the patient is the one who judges whether it is legible.
 *      D37: a failure names the fixable condition, never the person, so
 *      "الصورة مو واضحة" is the wording and "صورة سيئة" is not.
 *
 *      The camera permission is the other half. §5 and the R2 contract both
 *      require that a refusal is never a wall: the patient types the name
 *      instead, and the alternative is offered in the same breath as the
 *      refusal rather than left for them to find.
 */

/** What the OS told us about the camera. `undetermined` is not `denied` — the
 *  difference decides whether we ask or explain. */
export type CameraPermission = "undetermined" | "granted" | "denied" | "restricted";

export type Capture =
  /** R2 before anything has been taken. */
  | { readonly kind: "ready" }
  /** The OS refused. Never a wall — R2's contract declares the alternative. */
  | { readonly kind: "refused"; readonly permission: Exclude<CameraPermission, "granted" | "undetermined"> }
  | { readonly kind: "capturing" }
  /** R3 — the patient judges legibility, because nothing here reads it. */
  | { readonly kind: "review"; readonly imageId: string; readonly localUri: string }
  /** The upload failed. The image survives; only the send did not. */
  | { readonly kind: "failed"; readonly imageId: string; readonly localUri: string; readonly reason: string }
  | { readonly kind: "attached"; readonly imageId: string };

export const ready = (): Capture => ({ kind: "ready" });

/**
 * The permission answer, turned into a screen state.
 *
 * `restricted` (a managed device, parental controls) and `denied` are the same
 * screen: the patient cannot grant it here, so both offer the alternative
 * rather than a settings link that will not help.
 */
export function fromPermission(p: CameraPermission): Capture {
  return p === "granted" || p === "undetermined" ? { kind: "ready" } : { kind: "refused", permission: p };
}

export const capturing = (c: Capture): Capture => (c.kind === "ready" ? { kind: "capturing" } : c);

/** An image exists on the device. It is NOT attached to the draft yet — R3
 *  exists precisely so the patient confirms it is readable first. */
export function captured(imageId: string, localUri: string): Capture {
  return { kind: "review", imageId, localUri };
}

/**
 * The patient said it is readable. This is the only thing that attaches it.
 *
 * There is deliberately no automatic path from `captured` to `attached`:
 * skipping R3 would mean a blurred photo travels to a pharmacist who then
 * cannot dispense, and the patient discovers it at the counter.
 */
export function confirmed(c: Capture): { readonly imageId: string } | null {
  return c.kind === "review" || c.kind === "failed" ? { imageId: c.imageId } : null;
}

/** Retaking discards the image rather than keeping both — two photos of one
 *  paper is a choice the patient did not ask to make. */
export const retake = (): Capture => ({ kind: "ready" });

export function failed(c: Capture, reason: string): Capture {
  return c.kind === "review" ? { kind: "failed", imageId: c.imageId, localUri: c.localUri, reason } : c;
}

/**
 * D37 — the failure names the condition, not the person.
 *
 * Every string here describes something the patient can change about the next
 * photo. None of them evaluates the patient, and none claims we read the
 * prescription, because Phase 0 does not (D18).
 */
export function whatToFix(reason: "dark" | "blurred" | "cropped" | "upload"): { readonly says: string; readonly action: string } {
  switch (reason) {
    case "dark": return { says: "الإضاءة قليلة بالصورة", action: "صوّر مرة ثانية بضوء أكثر" };
    case "blurred": return { says: "الصورة مو واضحة", action: "ثبّت الكاميرا وصوّر مرة ثانية" };
    case "cropped": return { says: "الورقة مو كاملة بالصورة", action: "صوّر الورقة كاملة" };
    case "upload": return { says: "ما وصلت الصورة", action: "أعد المحاولة" };
  }
}

/** What R3 tells the patient to check. Phase 0 reads nothing, so the checklist
 *  is what a PHARMACIST will need to read — stated so the patient knows what
 *  "clear" means rather than guessing. */
export const LEGIBILITY_CHECKS: readonly string[] = [
  "اسم الدواء واضح",
  "الجرعة واضحة",
  "ختم أو توقيع الطبيب ظاهر",
];
