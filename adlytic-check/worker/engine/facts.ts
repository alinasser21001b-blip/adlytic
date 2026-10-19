import { normalizeDigits } from "../services/guards";

// Fact ledger helpers shared by the V2 engine and the benchmark scorer.
// Amounts are compared by value: "٤٥٠ ألف", "450,000" and "٤٥٠٬٠٠٠" are the same fact.

const MULTIPLIERS: Array<[RegExp, number]> = [
  [/^\s*(?:ألف|الف|آلاف|الاف|ألاف|االف)/, 1000],
  [/^\s*(?:مليون|ملايين)/, 1_000_000],
];

/** Every amount in the text, as digit strings. Thousand-words add the multiplied value too. */
export function amounts(text: string): Set<string> {
  const s = normalizeDigits(text);
  const out = new Set<string>();
  const re = /\d(?:[\d,٬]|[.\s](?=\d{3}(?!\d)))*\d|\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const raw = m[0].replace(/[,٬.\s]/g, "");
    if (!raw) continue;
    out.add(stripZeros(raw));
    const rest = s.slice(m.index + m[0].length, m.index + m[0].length + 8);
    for (const [word, k] of MULTIPLIERS) {
      if (word.test(rest)) out.add(String(Number(raw) * k));
    }
  }
  return out;
}

/** Leading zeros matter for phone numbers only; keep them when the run is long. */
function stripZeros(d: string): string {
  return d.length >= 7 ? d : String(Number(d));
}

/** Amounts in `copy` that no fact source supports. */
export function unsupportedAmounts(copy: string, sources: string[]): string[] {
  const known = new Set<string>();
  for (const src of sources) for (const a of amounts(src)) known.add(a);
  return [...amounts(copy)].filter((a) => !known.has(a) && !isBareMultiplierPart(a, copy, known));
}

// "٤٥٠ ألف" yields both 450 and 450000; when 450000 is supported, the bare 450 is not a new fact.
function isBareMultiplierPart(a: string, copy: string, known: Set<string>): boolean {
  return known.has(String(Number(a) * 1000)) || known.has(String(Number(a) * 1_000_000));
}

/** Iraqi mobile numbers (07XX XXX XXXX or +964 7XX…) as bare digits starting with 07. */
export function phoneNumbers(text: string): string[] {
  const s = normalizeDigits(text);
  const out = new Set<string>();
  for (const m of s.matchAll(/(?:\+?\s?964[\s-]?|0)7\d(?:[\s-]?\d){8}/g)) {
    const d = m[0].replace(/\D/g, "");
    out.add(d.startsWith("964") ? `0${d.slice(3)}` : d);
  }
  return [...out];
}
