import type { AnalysisMode, ProviderReport } from "../../shared/schemas";

// ── Fact guard: the improved copy may not introduce facts the owner never gave ──

const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d);
}

/** Digit runs with thousands separators removed: "25,000" / "٢٥٬٠٠٠" / "25.000" → "25000". */
export function extractNumbers(s: string): string[] {
  const norm = normalizeDigits(s);
  return (norm.match(/\d[\d,٬.\s]*\d|\d/g) ?? []).map((n) => n.replace(/[,٬.\s]/g, "")).filter(Boolean);
}

export const CLAIM_TERMS: Array<{ key: string; re: RegExp }> = [
  { key: "discount", re: /خصم|خصومات|تخفيض|تخفيضات|تنزيلات/ },
  { key: "free", re: /مجان|ببلاش|بلاش/ },
  { key: "guarantee", re: /ضمان|كفالة|مضمون/ },
  { key: "percent", re: /%|٪|بالمئة|بالمائة/ },
  { key: "deadline", re: /لفترة محدودة|آخر فرصة|ينتهي العرض|اليوم فقط|لمدة محدودة/ },
  { key: "gift", re: /هدية|هدايا/ },
  { key: "superlative", re: /الأفضل|الأرخص|رقم ?(1|١|واحد)|الأول في/ },
];

export function findUnsupportedClaims(copy: string, source: string): string[] {
  const out = new Set<string>();
  const known = new Set(extractNumbers(source));
  for (const n of extractNumbers(copy)) if (!known.has(n)) out.add(n);
  for (const t of CLAIM_TERMS) if (t.re.test(copy) && !t.re.test(source)) out.add(t.key);
  return [...out];
}

function sentenceOffends(sentence: string, offenders: string[], source: string): boolean {
  const nums = new Set(extractNumbers(sentence));
  return offenders.some((o) => {
    const term = CLAIM_TERMS.find((t) => t.key === o);
    return term ? term.re.test(sentence) && !term.re.test(source) : nums.has(o);
  });
}

/** Remove whole sentences carrying an unsupported claim. Returns null when nothing usable remains. */
export function stripUnsupported(text: string, offenders: string[], source: string): string {
  const parts = text.split(/(?<=[.!؟?\n])/);
  return parts.filter((p) => !sentenceOffends(p, offenders, source)).join("").trim();
}

export function improvedCopyText(r: ProviderReport): string {
  const c = r.improvedCopy;
  return [c.opening, c.body, c.headline, c.callToAction].join("\n");
}

/** The facts the copy may legitimately use: owner text + verbatim facts read from the image. */
export function factSource(input: { adCopy: string; audience: string; additionalContext: string }, r: ProviderReport): string {
  return [input.adCopy, input.audience, input.additionalContext, ...r.factsReadFromImage].join("\n");
}

// ── Mode guard: a text-only check never carries a visual verdict ──

export function enforceMode(r: ProviderReport, mode: AnalysisMode): ProviderReport {
  if (mode !== "text_only") return r;
  return {
    ...r,
    imageTextLegibility: "no_image",
    factsReadFromImage: [],
    assessments: {
      ...r.assessments,
      visualReadability: {
        status: "not_assessed",
        evidenceSource: "ad_copy",
        observation: "لم تُرفق صورة، لذلك لم نقيّم وضوح الصورة وقراءة النص عليها.",
      },
    },
    issues: r.issues.filter((i) => i.evidenceSource !== "image"),
  };
}

// ── Leak guard: the report must not echo our scaffolding or credentials ──

const LEAK_MARKERS = [/submit_ad_review/i, /ad_submission/i, /sk-ant-/i, /hard rules/i, /system prompt/i];

export function leaksScaffolding(r: unknown): boolean {
  const s = JSON.stringify(r);
  return LEAK_MARKERS.some((re) => re.test(s));
}

// ── Share guard: tips that may appear on a public page ──

export function sanitizeShareTips(tips: string[]): string[] {
  return tips
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 200)
    .filter((t) => !/[0-9٠-٩۰-۹]/.test(t))
    .filter((t) => !/https?:|www\.|@|«|»|"|“|”/.test(t))
    .filter((t) => !CLAIM_TERMS.some((c) => c.re.test(t)))
    .slice(0, 3);
}
