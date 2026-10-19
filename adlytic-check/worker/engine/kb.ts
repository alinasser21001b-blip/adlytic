import rulesFile from "../../research/rules.json";
import sourcesFile from "../../research/sources.json";
import { normalizeDigits } from "../services/guards";

// The rule knowledge base and source registry, bundled with the Worker.
// Sources are only ever cited by id through this registry — never from model text.

export type Media = "image" | "video" | "text";
export type DimensionId = "offer_clarity" | "cta" | "opening" | "legibility" | "consistency" | "sound_off" | "details" | "safe_zone" | "brand";
export type Judgeability = "detectable" | "inference" | "not_judgeable";
export type Strength = "strong" | "moderate" | "weak" | "hypothesis";

export interface Rule {
  ruleId: string;
  version: number;
  dimension: DimensionId | "guard";
  principleAr: string;
  sources: Array<{ sourceId: string; section: string }>;
  applicability: { media: Media[]; placement: Array<"any" | "vertical">; objectives: string[]; industries: string[] };
  judgeability: Judgeability;
  evidenceStrength: Strength;
  unknownWhen: string | null;
  notApplicableWhen: string | null;
  checkHint: string | null;
  tags: string[];
}

export interface Dimension {
  id: DimensionId;
  labelAr: string;
  weight: number;
  media: Media[];
}

export interface Source {
  sourceId: string;
  title: string;
  publisher: string;
  url: string | null;
  evidenceType: string;
  access: "full_text" | "search_excerpt";
  publishedAt: string | null;
  verification?: string;
}

export const KNOWLEDGE_VERSION: string = rulesFile.knowledgeVersion;
export const RUBRIC_VERSION: string = rulesFile.rubricVersion;
export const REGISTRY_VERSION: string = sourcesFile.registryVersion;
export const RULES = rulesFile.rules as unknown as Rule[];
export const DIMENSIONS = rulesFile.dimensions as unknown as Dimension[];
export const LEVEL_ANCHORS = rulesFile.levels as Record<string, string>;
const SOURCES = new Map((sourcesFile.sources as unknown as Source[]).map((s) => [s.sourceId, s]));
const RULE_BY_ID = new Map(RULES.map((r) => [r.ruleId, r]));

export function ruleById(id: string): Rule | undefined {
  return RULE_BY_ID.get(id);
}

export function sourceById(id: string): Source | undefined {
  return SOURCES.get(id);
}

export interface RetrievalContext {
  media: Media[]; // e.g. ["image", "text"] for an image with ad text
  vertical: boolean;
  objective: string;
  industry: string;
  query: string;
}

/** Deterministic applicability filter: media, placement, objective, industry. */
export function applicableRules(ctx: Omit<RetrievalContext, "query">): Rule[] {
  return RULES.filter((r) => {
    const a = r.applicability;
    if (!a.media.some((m) => ctx.media.includes(m))) return false;
    if (!a.placement.includes("any") && !(a.placement.includes("vertical") && ctx.vertical)) return false;
    if (!a.objectives.includes(ctx.objective)) return false;
    if (!a.industries.includes("any") && !a.industries.includes(ctx.industry)) return false;
    return true;
  });
}

export function applicableDimensions(media: Media[], vertical: boolean): Dimension[] {
  return DIMENSIONS.filter((d) => d.media.some((m) => media.includes(m)) && (d.id !== "safe_zone" || vertical));
}

// ── Lexical ranking (BM25) over rule text, used to order rules when a cap applies ──

function tokens(s: string): string[] {
  return normalizeDigits(s.toLowerCase())
    .replace(/[ً-ْـ]/g, "") // harakat + tatweel
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .split(/[^\p{L}\p{N}%]+/u)
    .filter((t) => t.length > 1)
    .map((t) => (t.startsWith("ال") && t.length > 4 ? t.slice(2) : t));
}

export function rankBm25(rules: Rule[], query: string, k1 = 1.2, b = 0.75): Array<{ rule: Rule; score: number }> {
  const docs = rules.map((r) => tokens([r.principleAr, ...r.tags, r.dimension].join(" ")));
  const avg = docs.reduce((a, d) => a + d.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const q = [...new Set(tokens(query))];
  return rules
    .map((rule, i) => {
      const d = docs[i]!;
      let score = 0;
      for (const t of q) {
        const f = d.filter((x) => x === t).length;
        if (!f) continue;
        const idf = Math.log(1 + (rules.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
      }
      return { rule, score };
    })
    .sort((x, y) => y.score - x.score);
}

/** Rules sent to the model: every applicable rule, BM25-ordered, capped. */
export function retrieve(ctx: RetrievalContext, cap = 16): Rule[] {
  return rankBm25(applicableRules(ctx), ctx.query).slice(0, cap).map((x) => x.rule);
}
