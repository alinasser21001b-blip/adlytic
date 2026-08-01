/**
 * Canonical SKU key for the passive-inventory ledger.
 *
 * The first attempt at this used `toLocaleLowerCase("ar")`, which is a no-op:
 * Arabic script is caseless. For the product's dominant language it normalized
 * nothing, so "بنـادول ٥٠٠" and "بنادول 500" still split into two ledgers with
 * two trust scores. Real normalization has to fold orthography, not case.
 */
export function normalizeSkuKey(name: string): string {
  return (
    name
      // Folds Arabic presentation forms and full-width Latin to canonical form.
      .normalize("NFKC")
      // Tatweel (kashida) is decorative elongation, never semantic.
      .replace(/ـ/g, "")
      // Harakat, superscript alef, and other combining marks.
      .replace(/[ً-ْٰٓ-ٕ]/g, "")
      // Zero-width joiners and bidi control marks.
      .replace(/[​-‏‪-‮⁦-⁩]/g, "")
      // Alef variants collapse to bare alef.
      .replace(/[أإآٱ]/g, "ا")
      // Alef maqsura -> ya; ta marbuta -> ha.
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      // Arabic-Indic and extended Arabic-Indic digits -> Western digits, which
      // the blueprint mandates for numerals.
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/\s+/g, " ")
      .trim()
      // Latin names still need case folding; harmless for Arabic.
      .toLocaleLowerCase("en-US")
  );
}
