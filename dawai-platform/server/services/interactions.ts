/**
 * Drug-interaction safety checks with severity tiering.
 *
 * The blueprint is specific about why tiering exists: published DDI alert
 * override rates run 46–96% (≈90% for drug–drug alerts) *because* systems fire
 * on everything. An alert that is always ignored is worse than no alert, so:
 *
 *   - Only CONTRAINDICATED / SEVERE interrupt the pharmacist.
 *   - MODERATE and MINOR are returned as passive inline context, never a modal.
 *   - Overriding an interrupting alert requires a typed reason, which is logged.
 *
 * The fourth outcome is the one most systems get wrong. When the interaction
 * dataset cannot answer — no coverage for a SKU, dataset stale, lookup failed —
 * the result is UNAVAILABLE, never CLEAR. A false all-clear is the failure mode
 * that ends the brand; "safety check unavailable, pharmacist review required"
 * is honest and keeps the pharmacist as the decider.
 */

export type InteractionSeverity =
  | "CONTRAINDICATED"
  | "SEVERE"
  | "MODERATE"
  | "MINOR";

/** Severities that are allowed to interrupt the pharmacist's flow. */
export const INTERRUPTING_SEVERITIES: readonly InteractionSeverity[] = [
  "CONTRAINDICATED",
  "SEVERE",
];

export function interrupts(severity: InteractionSeverity): boolean {
  return INTERRUPTING_SEVERITIES.includes(severity);
}

export interface InteractionPair {
  /** Normalized ingredient names (RxNorm-mapped upstream). */
  a: string;
  b: string;
  severity: InteractionSeverity;
  summaryAr: string;
  /** Named source so every claim is receipted, Perplexity-style. */
  source: string;
}

export type InteractionOutcome =
  | { kind: "CLEAR"; checked: number }
  | { kind: "INFO"; checked: number; passive: InteractionPair[] }
  | {
      kind: "INTERRUPT";
      checked: number;
      interrupting: InteractionPair[];
      passive: InteractionPair[];
      /** Top-tier alerts require a typed reason before dispensing proceeds. */
      requiresOverrideReason: true;
    }
  | {
      kind: "UNAVAILABLE";
      reason: "NO_COVERAGE" | "DATASET_STALE" | "LOOKUP_FAILED";
      /** Ingredients we could not evaluate — shown so the gap is explicit. */
      uncovered: string[];
    };

/** A dataset older than this cannot be trusted to answer safely. */
export const DATASET_MAX_AGE_DAYS = 180;

export interface CheckInput {
  /** Ingredients already in the patient's active regimen, plus the new one. */
  ingredients: string[];
  /** Pairs known to the dataset for these ingredients. */
  knownPairs: InteractionPair[];
  /** Ingredients the dataset has any coverage for at all. */
  coveredIngredients: string[];
  datasetUpdatedAt: Date | null;
  lookupFailed?: boolean;
  now?: Date;
}

/**
 * Evaluates a regimen. Pure and total: every input path returns exactly one
 * outcome, and the UNAVAILABLE paths are checked *before* any CLEAR can be
 * produced so partial coverage can never masquerade as a safe result.
 */
export function evaluateInteractions(input: CheckInput): InteractionOutcome {
  const now = input.now ?? new Date();
  const ingredients = input.ingredients
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (input.lookupFailed) {
    return { kind: "UNAVAILABLE", reason: "LOOKUP_FAILED", uncovered: ingredients };
  }

  if (
    !input.datasetUpdatedAt ||
    now.getTime() - input.datasetUpdatedAt.getTime() >
      DATASET_MAX_AGE_DAYS * 86_400_000
  ) {
    return { kind: "UNAVAILABLE", reason: "DATASET_STALE", uncovered: ingredients };
  }

  const covered = new Set(
    input.coveredIngredients.map((value) => value.trim().toLowerCase()),
  );
  const uncovered = ingredients.filter((value) => !covered.has(value));

  // Partial coverage is not a clear result. If we cannot evaluate every
  // ingredient in the regimen, we say so rather than reporting on the subset.
  if (uncovered.length > 0) {
    return { kind: "UNAVAILABLE", reason: "NO_COVERAGE", uncovered };
  }

  // Only pairs where BOTH ingredients are in this regimen are relevant.
  const present = new Set(ingredients);
  const relevant = input.knownPairs.filter(
    (pair) =>
      present.has(pair.a.trim().toLowerCase()) &&
      present.has(pair.b.trim().toLowerCase()),
  );

  const interrupting = relevant.filter((pair) => interrupts(pair.severity));
  const passive = relevant.filter((pair) => !interrupts(pair.severity));

  if (interrupting.length > 0) {
    return {
      kind: "INTERRUPT",
      checked: ingredients.length,
      interrupting,
      passive,
      requiresOverrideReason: true,
    };
  }
  if (passive.length > 0) {
    return { kind: "INFO", checked: ingredients.length, passive };
  }
  return { kind: "CLEAR", checked: ingredients.length };
}

/** Patient-safe Arabic phrasing. Never implies a diagnosis or a decision. */
export function outcomeMessageAr(outcome: InteractionOutcome): string {
  switch (outcome.kind) {
    case "CLEAR":
      return "لم يُعثر على تعارض معروف بين هذه الأدوية في قاعدة البيانات.";
    case "INFO":
      return "توجد ملاحظات تفاعل غير حرجة — يراجعها الصيدلي عند الصرف.";
    case "INTERRUPT":
      return "تعارض دوائي مهم — لا يُصرف قبل مراجعة الصيدلي وتسجيل السبب.";
    case "UNAVAILABLE":
      // The critical string: an honest gap, never a false all-clear.
      return "تعذّر إجراء فحص التعارض — مراجعة الصيدلي مطلوبة.";
  }
}

/**
 * An override is only meaningful on an interrupting alert, and only with a
 * substantive reason. Silence or a keystroke is not a clinical justification.
 */
export const MIN_OVERRIDE_REASON_LENGTH = 10;

export function validateOverride(input: {
  outcome: InteractionOutcome;
  reason: string | null | undefined;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.outcome.kind !== "INTERRUPT") {
    return {
      ok: false,
      code: "OVERRIDE_NOT_APPLICABLE",
      message: "لا يوجد تنبيه يستدعي تجاوزًا.",
    };
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < MIN_OVERRIDE_REASON_LENGTH) {
    return {
      ok: false,
      code: "OVERRIDE_REASON_REQUIRED",
      message: "اكتب سبب التجاوز السريري (١٠ أحرف على الأقل).",
    };
  }
  return { ok: true };
}
