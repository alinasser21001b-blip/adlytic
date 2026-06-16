// ════════════════════════════════════════════════════════════════════════
//  src/engines/knowledge/KnowledgeEngine.ts
//
//  KNOWLEDGE IS A DICTIONARY, NOT A BRAIN.
//
//  Input:  (issueCode, locale, industryProfileId?)
//  Output: { title, causes[], recommendations[] }
//  Reads:  knowledge_rules, industry_profiles
//  Writes: NOTHING.
//
//  This file does ONE thing: resolve a code into human text, with industry
//  override falling back to universal default. It is forbidden to know:
//    - severity     (Rules)
//    - confidence   (Rules)
//    - composition  (Recommendation)
//    - prioritization (Recommendation)
//    - health scores (HealthScore)
//    - AI / narration  (Phase 16+)
//
//  If this file ever grows past lookup, something has gone wrong.
//
//  Performance note: the lookup is two indexed reads per (code, locale,
//  industry) triple. For the dashboard's typical 2–5 issues per page, this
//  is fine without caching. If Reports/Alerts later batch many lookups,
//  add a per-request cache there — not here.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, IssueCode, Locale } from "@prisma/client";

/** The ONLY thing this engine returns. Three fields. */
export interface KnowledgeEntry {
  title: string;
  causes: string[];
  recommendations: string[];
}

export interface KnowledgeLookup {
  issueCode: IssueCode;
  locale: Locale;
  /** Null is a valid value — means "use the universal default explicitly". */
  industryProfileId: string | null;
}

export class KnowledgeEngine {
  constructor(private prisma: PrismaClient) {}

  /**
   * Resolve one (code, locale, industry) triple to a KnowledgeEntry.
   *
   * Fallback order:
   *   1. Industry-specific rule for this locale
   *   2. Universal-default rule (industryProfileId = null) for this locale
   *   3. null — no rule exists for this code in this locale
   *
   * Returning null at step 3 is intentional: callers (Recommendation, the
   * dashboard) decide how to handle a missing translation. We do not invent
   * fallback text here; that would be a brain, not a dictionary.
   */
  async lookup(args: KnowledgeLookup): Promise<KnowledgeEntry | null> {
    const { issueCode, locale, industryProfileId } = args;

    // Industry-specific first (if industryProfileId provided)
    if (industryProfileId) {
      const specific = await this.prisma.knowledgeRule.findFirst({
        where: { issueCode, locale, industryProfileId },
      });
      if (specific) return shape(specific);
    }

    // Universal default
    const universal = await this.prisma.knowledgeRule.findFirst({
      where: { issueCode, locale, industryProfileId: null },
    });
    if (universal) return shape(universal);

    return null;
  }

  /**
   * Batch variant for callers (Recommendation, getDashboard) that need
   * several lookups in one render path. Same fallback rules; one query
   * per locale-industry pair, in-memory resolution per code.
   *
   * Keeping this here — rather than in the consumer — means the fallback
   * rule lives in ONE place. Future-us only edits one file when the rule
   * changes (e.g. "fall back through region before universal").
   */
  async lookupMany(args: {
    issueCodes: IssueCode[];
    locale: Locale;
    industryProfileId: string | null;
  }): Promise<Map<IssueCode, KnowledgeEntry>> {
    const { issueCodes, locale, industryProfileId } = args;
    if (issueCodes.length === 0) return new Map();

    // One query for each tier of the fallback, then resolve per code.
    const [specific, universal] = await Promise.all([
      industryProfileId
        ? this.prisma.knowledgeRule.findMany({
            where: { issueCode: { in: issueCodes }, locale, industryProfileId },
          })
        : Promise.resolve([]),
      this.prisma.knowledgeRule.findMany({
        where: { issueCode: { in: issueCodes }, locale, industryProfileId: null },
      }),
    ]);

    const specificByCode = new Map((specific as any[]).map((r) => [r.issueCode as IssueCode, r]));
    const universalByCode = new Map((universal as any[]).map((r) => [r.issueCode as IssueCode, r]));

    const out = new Map<IssueCode, KnowledgeEntry>();
    for (const code of issueCodes) {
      const rule = specificByCode.get(code) ?? universalByCode.get(code);
      if (rule) out.set(code, shape(rule));
    }
    return out;
  }
}

/** Coerce a knowledge_rules row into the three-field DTO. JSON columns are
 *  typed as Prisma.JsonValue; we narrow to string[] here, which is the only
 *  shape the seed and any future writer produces. If a row contains
 *  malformed JSON, the engine returns the raw value safely as []. */
function shape(rule: any): KnowledgeEntry {
  return {
    title: String(rule.title ?? ""),
    causes: arrayOfStrings(rule.causesJson),
    recommendations: arrayOfStrings(rule.recommendationsJson),
  };
}

function arrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}
