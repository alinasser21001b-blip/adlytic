import { describe, expect, it } from "vitest";
import { MEDICINES } from "../data/medicines";
import {
  normalizeMedicineQuery,
  searchMedicines,
  selectPresentation,
} from "./search";

describe("medicine search and disambiguation", () => {
  it("normalizes Arabic variants, Kurdish letters, and localized digits", () => {
    expect(normalizeMedicineQuery("  بُرُوفِين ٤٠٠!! ")).toBe("بروفين 400");
    expect(normalizeMedicineQuery("کوردی ۵")).toBe("كوردي 5");
    expect(normalizeMedicineQuery("أموكسيل")).toBe("اموكسيل");
  });

  it("never silently selects an ambiguous Arabic alias (AC-01)", () => {
    const result = searchMedicines("بنادول", MEDICINES);

    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.length).toBeGreaterThan(1);
      expect(new Set(result.candidates.map((item) => item.strength)).size).toBeGreaterThan(1);
    }
  });

  it("requires an explicit candidate from the offered presentations", () => {
    const result = searchMedicines("بنادول", MEDICINES);
    expect(result.kind).toBe("ambiguous");

    if (result.kind === "ambiguous") {
      expect(() => selectPresentation(result.candidates, "not-offered")).toThrow(
        "PRESENTATION_SELECTION_REQUIRED",
      );
      expect(
        selectPresentation(result.candidates, result.candidates[0].canonicalId),
      ).toBe(result.candidates[0]);
    }
  });

  it("rejects empty or punctuation-only input and does not use unsafe fuzzy matching", () => {
    expect(searchMedicines(" ... !!! ", MEDICINES).kind).toBe("invalid");
    expect(searchMedicines("بروفان", MEDICINES).kind).toBe("none");
  });

  it("supports exact barcode and English aliases", () => {
    expect(searchMedicines("6291100040002", MEDICINES).kind).toBe("unique");
    expect(searchMedicines("Brufen 400", MEDICINES).kind).toBe("unique");
  });
});

