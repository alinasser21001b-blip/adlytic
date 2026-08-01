// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  applyConfidenceGate,
  assertLineAcceptable,
  manualEntryProvider,
  OCR_CONFIDENCE_THRESHOLD,
  type OcrExtraction,
} from "../services/ocr";

const extraction = (
  fields: Array<[string, number]>,
): OcrExtraction => ({
  fields: fields.map(([value, confidence], index) => ({
    name: (["medicineName", "dose", "frequency", "durationDays"] as const)[index] ?? "dose",
    value,
    confidence,
  })),
  modelVersion: "test-1",
});

describe("OCR confidence gate", () => {
  it("uses the blueprint threshold", () => {
    expect(OCR_CONFIDENCE_THRESHOLD).toBe(0.85);
  });

  it("passes fields at or above threshold without review", () => {
    const gated = applyConfidenceGate(
      extraction([["Augmentin 625mg", 0.94], ["1 tab", 0.88]]),
      "test",
    );
    expect(gated.requiresReview).toBe(false);
    expect(gated.fields.every((f) => !f.needsConfirmation)).toBe(true);
  });

  it("treats exactly-threshold as acceptable and just-below as gated", () => {
    const atThreshold = applyConfidenceGate(extraction([["x", 0.85]]), "test");
    expect(atThreshold.fields[0].needsConfirmation).toBe(false);

    const below = applyConfidenceGate(extraction([["x", 0.8499]]), "test");
    expect(below.fields[0].needsConfirmation).toBe(true);
    expect(below.requiresReview).toBe(true);
  });

  it("gates the whole line when any single field is low", () => {
    const gated = applyConfidenceGate(
      extraction([["Augmentin 625mg", 0.97], ["1 tab", 0.42]]),
      "test",
    );
    expect(gated.requiresReview).toBe(true);
    expect(gated.fields[0].needsConfirmation).toBe(false);
    expect(gated.fields[1].needsConfirmation).toBe(true);
    expect(gated.minConfidence).toBeCloseTo(0.42);
  });

  it("never trusts a malformed or missing confidence", () => {
    for (const bogus of [Number.NaN, Infinity, -1, undefined as unknown as number]) {
      const gated = applyConfidenceGate(extraction([["x", bogus]]), "test");
      expect(gated.requiresReview).toBe(true);
      expect(gated.fields[0].needsConfirmation).toBe(true);
    }
  });

  it("treats an empty extraction as needing review, not as a clean pass", () => {
    const gated = applyConfidenceGate({ fields: [], modelVersion: "v" }, "test");
    expect(gated.requiresReview).toBe(true);
    expect(gated.minConfidence).toBe(0);
  });
});

describe("server-side acceptance guard", () => {
  const gated = applyConfidenceGate(
    extraction([["Augmentin 625mg", 0.97], ["1 tab", 0.42]]),
    "test",
  );

  it("blocks a line whose low-confidence field was not confirmed", () => {
    const result = assertLineAcceptable(gated, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OCR_CONFIRMATION_REQUIRED");
      expect(result.unconfirmed).toContain("dose");
    }
  });

  it("still blocks when an unrelated field was confirmed instead", () => {
    const result = assertLineAcceptable(gated, ["medicineName"]);
    expect(result.ok).toBe(false);
  });

  it("accepts once the gated field is explicitly confirmed", () => {
    expect(assertLineAcceptable(gated, ["dose"]).ok).toBe(true);
  });

  it("rejects an empty extraction regardless of confirmations", () => {
    const empty = applyConfidenceGate({ fields: [], modelVersion: "v" }, "test");
    const result = assertLineAcceptable(empty, ["dose", "medicineName"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OCR_NO_FIELDS");
  });

  it("is re-runnable on sync with the same verdict (pure)", () => {
    const first = assertLineAcceptable(gated, []);
    const second = assertLineAcceptable(gated, []);
    expect(second).toEqual(first);
  });
});

describe("provider abstraction", () => {
  it("never invents fields when no model is wired", async () => {
    const result = await manualEntryProvider.extract({ imageRef: "ref-1" });
    expect(result.fields).toHaveLength(0);
    const gated = applyConfidenceGate(result, manualEntryProvider.name);
    expect(gated.requiresReview).toBe(true);
  });
});
