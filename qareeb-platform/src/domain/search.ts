import type { MedicinePresentation } from "./contracts";

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const NON_WORD = /[^\p{L}\p{N}]+/gu;
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeMedicineQuery(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[کڪ]/g, "ك")
    .replace(/[یێ]/g, "ي")
    .replace(/ە/g, "ه")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(NON_WORD, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type MedicineSearchResult =
  | { kind: "invalid"; reason: "EMPTY_QUERY" }
  | { kind: "none"; normalizedQuery: string }
  | { kind: "unique"; normalizedQuery: string; medicine: MedicinePresentation }
  | {
      kind: "ambiguous";
      normalizedQuery: string;
      candidates: readonly MedicinePresentation[];
    };

export function searchMedicines(
  query: string,
  catalog: readonly MedicinePresentation[],
): MedicineSearchResult {
  const normalizedQuery = normalizeMedicineQuery(query);

  if (!normalizedQuery) {
    return { kind: "invalid", reason: "EMPTY_QUERY" };
  }

  const matches = catalog.filter((medicine) => {
    if (medicine.barcode && normalizeMedicineQuery(medicine.barcode) === normalizedQuery) {
      return true;
    }

    return medicine.aliases.some(
      (alias) => normalizeMedicineQuery(alias) === normalizedQuery,
    );
  });

  if (matches.length === 0) {
    return { kind: "none", normalizedQuery };
  }

  if (matches.length === 1) {
    return { kind: "unique", normalizedQuery, medicine: matches[0] };
  }

  return {
    kind: "ambiguous",
    normalizedQuery,
    candidates: matches,
  };
}

export function selectPresentation(
  candidates: readonly MedicinePresentation[],
  canonicalId: string,
): MedicinePresentation {
  const selected = candidates.find(
    (candidate) => candidate.canonicalId === canonicalId,
  );

  if (!selected) {
    throw new Error("PRESENTATION_SELECTION_REQUIRED");
  }

  return selected;
}

