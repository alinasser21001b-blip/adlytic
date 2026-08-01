/**
 * Prescription OCR pipeline (blueprint MM-X1).
 *
 * Two non-negotiables from the spec:
 *
 *  1. **Provider abstraction.** Google Vision / Azure / Tesseract / a local
 *     model must be swappable without touching call sites. No vendor lock-in,
 *     and no provider SDK types leaking into the domain.
 *
 *  2. **The confidence gate is server-side.** Any field below the threshold is
 *     marked needs_confirmation and cannot enter a prescription line until a
 *     pharmacist confirms it. The blueprint says "enforced server-side (not
 *     just UI) and re-checked on sync" — a UI-only gate is bypassed by any
 *     replayed offline mutation, which is exactly how a wrong drug gets
 *     auto-accepted.
 *
 * The pharmacist is always the decider. Nothing here decides anything.
 */

/** Blueprint threshold: fields at or above this render calm, below flag amber. */
export const OCR_CONFIDENCE_THRESHOLD = 0.85;

export type OcrFieldName = "medicineName" | "dose" | "frequency" | "durationDays";

export interface OcrField {
  name: OcrFieldName;
  value: string;
  confidence: number;
}

export interface OcrExtraction {
  fields: OcrField[];
  /** Provider-reported overall confidence, if any. */
  overallConfidence?: number;
  modelVersion: string;
}

/**
 * The seam every provider implements. Deliberately narrow: an image reference
 * in, structured fields out. Providers never see patient identity.
 */
export interface OcrProvider {
  readonly name: string;
  extract(input: {
    imageRef: string;
    /** Hints improve accuracy on the top-100 SKU lexicon without deciding. */
    lexicon?: readonly string[];
  }): Promise<OcrExtraction>;
}

export interface GatedField extends OcrField {
  /** True when the pharmacist must confirm before this value may be used. */
  needsConfirmation: boolean;
}

export interface GatedExtraction {
  fields: GatedField[];
  /** True when any field is gated — the line cannot be auto-accepted. */
  requiresReview: boolean;
  /** Lowest field confidence; the honest summary number. */
  minConfidence: number;
  modelVersion: string;
  provider: string;
}

/**
 * Applies the confidence gate. Pure, so it can be re-applied on sync without
 * re-running the provider — which is what makes the "re-checked on sync"
 * requirement cheap enough to actually do.
 */
export function applyConfidenceGate(
  extraction: OcrExtraction,
  provider: string,
  threshold = OCR_CONFIDENCE_THRESHOLD,
): GatedExtraction {
  const fields: GatedField[] = extraction.fields.map((field) => ({
    ...field,
    // A malformed or missing confidence is treated as zero, not as trusted.
    needsConfirmation: !(
      Number.isFinite(field.confidence) && field.confidence >= threshold
    ),
  }));

  const minConfidence = fields.length
    ? Math.min(
        ...fields.map((field) =>
          Number.isFinite(field.confidence) ? field.confidence : 0,
        ),
      )
    : 0;

  return {
    fields,
    // An empty extraction is not a clean pass: nothing was read, so everything
    // needs a human.
    requiresReview: fields.length === 0 || fields.some((f) => f.needsConfirmation),
    minConfidence,
    modelVersion: extraction.modelVersion,
    provider,
  };
}

/**
 * Guards the transition from extraction to a real prescription line.
 * Called server-side on both the initial submit and any offline replay.
 */
export function assertLineAcceptable(
  gated: GatedExtraction,
  confirmedFields: readonly OcrFieldName[],
): { ok: true } | { ok: false; code: string; unconfirmed: OcrFieldName[] } {
  const confirmed = new Set(confirmedFields);
  const unconfirmed = gated.fields
    .filter((field) => field.needsConfirmation && !confirmed.has(field.name))
    .map((field) => field.name);

  if (gated.fields.length === 0) {
    return { ok: false, code: "OCR_NO_FIELDS", unconfirmed: [] };
  }
  if (unconfirmed.length > 0) {
    return { ok: false, code: "OCR_CONFIRMATION_REQUIRED", unconfirmed };
  }
  return { ok: true };
}

/**
 * A deterministic stub provider so the pipeline is exercisable end-to-end
 * before a paid provider is wired. It never invents a drug name: it returns
 * whatever the caller transcribed, with a confidence that forces review.
 */
export const manualEntryProvider: OcrProvider = {
  name: "manual-entry",
  async extract({ imageRef }) {
    return {
      fields: [],
      overallConfidence: 0,
      modelVersion: `manual:${imageRef ? "with-image" : "no-image"}`,
    };
  },
};
