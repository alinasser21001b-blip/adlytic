// @vitest-environment node

import { describe, expect, it } from "vitest";
import { normalizeSkuKey } from "../services/sku-key";

describe("SKU key normalization (round-2 review regression)", () => {
  it("folds Arabic orthography that lowercase() cannot touch", () => {
    // Tatweel, harakat, alef variants, and Arabic-Indic digits all had to
    // collapse — Arabic is caseless, so the previous toLocaleLowerCase("ar")
    // left every one of these as a separate ledger key.
    expect(normalizeSkuKey("بنـادول ٥٠٠")).toBe(normalizeSkuKey("بنادول 500"));
    expect(normalizeSkuKey("أموكسيسيلين")).toBe(normalizeSkuKey("اموكسيسيلين"));
    expect(normalizeSkuKey("شربة")).toBe(normalizeSkuKey("شربه"));
    expect(normalizeSkuKey("مُسَكِّن")).toBe(normalizeSkuKey("مسكن"));
  });

  it("still folds Latin case and whitespace", () => {
    expect(normalizeSkuKey("  Panadol   Extra ")).toBe("panadol extra");
    expect(normalizeSkuKey("PANADOL")).toBe(normalizeSkuKey("panadol"));
  });

  it("keeps genuinely different medicines apart", () => {
    expect(normalizeSkuKey("Panadol 500")).not.toBe(normalizeSkuKey("Panadol 650"));
    expect(normalizeSkuKey("امينوفيلين")).not.toBe(normalizeSkuKey("اموكسيسيلين"));
  });

  it("is idempotent", () => {
    const once = normalizeSkuKey("بنـادول ٥٠٠");
    expect(normalizeSkuKey(once)).toBe(once);
  });
});
