// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  DATASET_MAX_AGE_DAYS,
  evaluateInteractions,
  interrupts,
  outcomeMessageAr,
  validateOverride,
  type InteractionPair,
} from "../services/interactions";

const DAY = 86_400_000;
const now = new Date("2026-08-01T09:00:00.000Z");
const fresh = new Date(now.getTime() - 10 * DAY);

const pair = (
  a: string,
  b: string,
  severity: InteractionPair["severity"],
): InteractionPair => ({
  a,
  b,
  severity,
  summaryAr: `تفاعل بين ${a} و${b}`,
  source: "DDInter 2.0",
});

describe("severity tiering — only clinically significant alerts interrupt", () => {
  it("interrupts on contraindicated and severe only", () => {
    expect(interrupts("CONTRAINDICATED")).toBe(true);
    expect(interrupts("SEVERE")).toBe(true);
    expect(interrupts("MODERATE")).toBe(false);
    expect(interrupts("MINOR")).toBe(false);
  });

  it("returns moderate findings as passive info, never an interrupt", () => {
    const outcome = evaluateInteractions({
      ingredients: ["warfarin", "paracetamol"],
      coveredIngredients: ["warfarin", "paracetamol"],
      knownPairs: [pair("warfarin", "paracetamol", "MODERATE")],
      datasetUpdatedAt: fresh,
      now,
    });
    expect(outcome.kind).toBe("INFO");
    if (outcome.kind === "INFO") expect(outcome.passive).toHaveLength(1);
  });

  it("interrupts on a severe pair and still carries the passive ones", () => {
    const outcome = evaluateInteractions({
      ingredients: ["warfarin", "aspirin", "paracetamol"],
      coveredIngredients: ["warfarin", "aspirin", "paracetamol"],
      knownPairs: [
        pair("warfarin", "aspirin", "SEVERE"),
        pair("warfarin", "paracetamol", "MODERATE"),
      ],
      datasetUpdatedAt: fresh,
      now,
    });
    expect(outcome.kind).toBe("INTERRUPT");
    if (outcome.kind === "INTERRUPT") {
      expect(outcome.interrupting).toHaveLength(1);
      expect(outcome.passive).toHaveLength(1);
      expect(outcome.requiresOverrideReason).toBe(true);
    }
  });

  it("ignores dataset pairs whose partner is not in this regimen", () => {
    const outcome = evaluateInteractions({
      ingredients: ["warfarin"],
      coveredIngredients: ["warfarin"],
      knownPairs: [pair("warfarin", "aspirin", "SEVERE")],
      datasetUpdatedAt: fresh,
      now,
    });
    expect(outcome.kind).toBe("CLEAR");
  });
});

describe("degraded state never becomes a false all-clear", () => {
  it("reports UNAVAILABLE when the lookup fails", () => {
    const outcome = evaluateInteractions({
      ingredients: ["warfarin", "aspirin"],
      coveredIngredients: ["warfarin", "aspirin"],
      knownPairs: [],
      datasetUpdatedAt: fresh,
      lookupFailed: true,
      now,
    });
    expect(outcome.kind).toBe("UNAVAILABLE");
    if (outcome.kind === "UNAVAILABLE") expect(outcome.reason).toBe("LOOKUP_FAILED");
  });

  it("reports UNAVAILABLE when the dataset is missing or stale", () => {
    expect(
      evaluateInteractions({
        ingredients: ["warfarin"],
        coveredIngredients: ["warfarin"],
        knownPairs: [],
        datasetUpdatedAt: null,
        now,
      }).kind,
    ).toBe("UNAVAILABLE");

    const stale = evaluateInteractions({
      ingredients: ["warfarin"],
      coveredIngredients: ["warfarin"],
      knownPairs: [],
      datasetUpdatedAt: new Date(now.getTime() - (DATASET_MAX_AGE_DAYS + 1) * DAY),
      now,
    });
    expect(stale.kind).toBe("UNAVAILABLE");
    if (stale.kind === "UNAVAILABLE") expect(stale.reason).toBe("DATASET_STALE");
  });

  it("refuses to clear a regimen when ANY ingredient is uncovered", () => {
    const outcome = evaluateInteractions({
      // A local Iraqi SKU the open dataset has no entry for.
      ingredients: ["warfarin", "local-brand-x"],
      coveredIngredients: ["warfarin"],
      knownPairs: [],
      datasetUpdatedAt: fresh,
      now,
    });
    expect(outcome.kind).toBe("UNAVAILABLE");
    if (outcome.kind === "UNAVAILABLE") {
      expect(outcome.reason).toBe("NO_COVERAGE");
      expect(outcome.uncovered).toContain("local-brand-x");
    }
  });

  it("says review-required rather than no-conflict when unavailable", () => {
    const unavailable = outcomeMessageAr({
      kind: "UNAVAILABLE",
      reason: "NO_COVERAGE",
      uncovered: ["x"],
    });
    expect(unavailable).toContain("تعذّر");
    expect(unavailable).toContain("مراجعة الصيدلي");
    // Must not read like a clean result.
    expect(unavailable).not.toContain("لم يُعثر على تعارض");
  });

  it("only reports CLEAR when the whole regimen was actually evaluated", () => {
    const outcome = evaluateInteractions({
      ingredients: ["metformin", "amlodipine"],
      coveredIngredients: ["metformin", "amlodipine"],
      knownPairs: [],
      datasetUpdatedAt: fresh,
      now,
    });
    expect(outcome.kind).toBe("CLEAR");
    if (outcome.kind === "CLEAR") expect(outcome.checked).toBe(2);
  });
});

describe("override discipline — reason required, top tier only", () => {
  const interruptOutcome = evaluateInteractions({
    ingredients: ["warfarin", "aspirin"],
    coveredIngredients: ["warfarin", "aspirin"],
    knownPairs: [pair("warfarin", "aspirin", "SEVERE")],
    datasetUpdatedAt: fresh,
    now,
  });

  it("rejects an override with no reason", () => {
    const result = validateOverride({ outcome: interruptOutcome, reason: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OVERRIDE_REASON_REQUIRED");
  });

  it("rejects a token reason that is not a clinical justification", () => {
    const result = validateOverride({ outcome: interruptOutcome, reason: "ok" });
    expect(result.ok).toBe(false);
  });

  it("accepts a substantive reason", () => {
    const result = validateOverride({
      outcome: interruptOutcome,
      reason: "الطبيب المعالج يتابع INR أسبوعيًا ووافق على الجمع.",
    });
    expect(result.ok).toBe(true);
  });

  it("does not offer an override where nothing interrupted", () => {
    const result = validateOverride({
      outcome: { kind: "CLEAR", checked: 1 },
      reason: "سبب طويل بما يكفي للتجاوز",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OVERRIDE_NOT_APPLICABLE");
  });
});
