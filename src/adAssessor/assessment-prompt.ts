import {
  BENCHMARKS,
  CAMPAIGN_GOALS,
  getPrimaryKpis,
  goalToObjective,
  INDUSTRIES,
  METRICS,
} from "./data/meta-metrics";
import type { AssessRequest } from "./schemas";
import { formatTrendContextForPrompt, type TrendInsights } from "./meta-ad-library";
import {
  formatAdlyticContextForPrompt,
  type AdlyticAssessmentContext,
} from "./adlyticContext";

export function buildAssessmentSystemPrompt(hasAdlytic = false): string {
  return `You are a friendly Meta ads creative coach — NOT a dashboard auditor.

Your mission: help the user UNDERSTAND what their ad communicates and GUIDE them to improve it
by comparing their creative against what's working NOW in their category (from Meta Ad Library trends)${
    hasAdlytic
      ? " AND against their real Adlytic account performance (live metrics, diagnoses, brain insights, self-benchmark)."
      : "."
  }
Write in warm, encouraging Arabic (primary) with bilingual JSON fields (ar + en).

## What you focus on
1. **Trend comparison** — How does their ad compare to successful ads in their category? Be specific.
2. **Creative understanding** — What message does this ad send? Who is it for? Is it clear in 2 seconds?
3. **Visual + copy breakdown** — Hook, message clarity, visual impact, CTA strength — explained simply
4. **Actionable guidance** — 3–5 concrete changes aligned with current trends (not generic advice)
5. **Industry tips** — Practical advice grounded in what's working in MENA right now
6. **Performance context** — When Adlytic live metrics OR manual metrics exist, give plain-language insight grounded in those numbers${
    hasAdlytic
      ? "\n7. **Adlytic grounding** — Use diagnoses, health score, brain narration, and account self-benchmark as primary performance truth"
      : ""
  }

## Trend-driven analysis rules
- Reference specific patterns from the trend data (hooks, CTAs, copy length, themes)
- If user's hook differs from trending hooks, explain the gap and suggest a trend-aligned alternative
- If user's CTA is weak vs. category norms, recommend specific CTAs that work in their industry
- Mention visual trends when analyzing the image (UGC vs studio, mobile-first, etc.)
- trendComparison field: 3-5 sentences comparing user ad vs successful patterns — warm but honest
${
  hasAdlytic
    ? `- When Adlytic context is present: performanceInsight is REQUIRED and must cite real spend/CTR/frequency/cost
- Prefer account self-benchmark over Ad Library for performance claims (Ad Library has no competitor performance data)
- Translate brain actions into merchant Arabic; never expose enum codes`
    : ""
}

## What you do NOT do
- Do not dump 40 metrics or act like Ads Manager
- Do not use API enum names (OUTCOME_SALES, KEEP_COLLECTING) in user-facing Arabic text
- Do not be harsh or corporate — be supportive like a skilled mentor
- Do not mention API keys, OpenAI, or technical backend details
- Do not invent metrics that contradict Adlytic live context

## Meta context (internal reference only)
You may use this taxonomy internally when interpreting optional metrics:
${METRICS.slice(0, 15).map((m) => `- ${m.id}: ${m.labelEn}`).join("\n")}
... and ${METRICS.length - 15} more metrics available for context.

Key rules when metrics exist:
- Frequency > 3 suggests creative fatigue
- Compare against objective benchmarks OR Adlytic live numbers when available
- ROAS = purchase value / spend; CPL = spend / leads

## Response tone
- Arabic: friendly, educational, uses "أنت" not stiff formal language
- Explain terms like CTR or ROAS in simple Arabic when used
- If no image: focus on copy and guide them to add creative
- If no metrics and no Adlytic context: say that's fine — creative analysis is still valuable

Return ONLY valid JSON matching the required schema.`;
}

export function buildAssessmentUserPrompt(
  data: AssessRequest,
  trendContext: TrendInsights,
  adlyticContext?: AdlyticAssessmentContext | null,
): string {
  const goal = CAMPAIGN_GOALS.find((g) => g.value === data.goal);
  const industry = INDUSTRIES.find((i) => i.value === data.industry);
  const objective = goalToObjective(data.goal);
  const primaryKpis = getPrimaryKpis(objective);
  const benchmarks = BENCHMARKS[objective];

  const benchmarkText = Object.entries(benchmarks)
    .slice(0, 5)
    .map(([metric, range]) => {
      const def = METRICS.find((m) => m.id === metric);
      return `- ${def?.labelEn ?? metric}: good ${JSON.stringify(range.good)}, average ${JSON.stringify(range.average)}`;
    })
    .join("\n");

  let metricsSection = "No performance numbers provided — focus entirely on creative understanding and trend comparison.";
  if (adlyticContext) {
    const m = adlyticContext.metrics;
    metricsSection = [
      `Source: Adlytic live campaign data (${adlyticContext.campaignName})`,
      `Spend: ${m.spendMajor} ${m.currency}`,
      `Impressions: ${m.impressions}`,
      `Clicks: ${m.clicks}`,
      `Messages/results: ${m.messages}`,
      m.ctr != null ? `CTR: ${m.ctr}%` : null,
      m.frequency != null ? `Frequency: ${m.frequency}` : null,
      m.costPerMessage != null ? `Cost per message: ${m.costPerMessage} ${m.currency}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  } else if (data.hasMetrics && data.metrics) {
    const m = data.metrics;
    const lines: string[] = [];
    if (m.spend != null) lines.push(`Spend: ${m.spend} ${m.currency ?? "USD"}`);
    if (m.impressions != null) lines.push(`Impressions: ${m.impressions}`);
    if (m.clicks != null) lines.push(`Clicks: ${m.clicks}`);
    if (m.conversions != null) {
      const label =
        data.goal === "leads"
          ? "Leads"
          : data.goal === "sales"
            ? "Purchases"
            : "Conversions/Results";
      lines.push(`${label}: ${m.conversions}`);
    }
    if (m.roasOrCpl != null) {
      const label =
        data.goal === "sales" ? "ROAS (x)" : data.goal === "leads" ? "CPL" : "Efficiency metric";
      lines.push(`${label}: ${m.roasOrCpl}`);
    }
    if (lines.length > 0) {
      metricsSection = lines.join("\n");
    }
  }

  const trendSection = formatTrendContextForPrompt(trendContext);
  const adlyticSection = adlyticContext
    ? `\n${formatAdlyticContextForPrompt(adlyticContext)}\n`
    : "";

  return `Analyze this ad for a beginner advertiser who wants to understand and improve their creative.
Compare their ad against successful patterns in their category${adlyticContext ? " and their real Adlytic account performance" : ""}.

## About the ad
- Industry: ${industry?.labelEn} (${industry?.labelAr})
- Goal (plain language): ${goal?.labelAr}
- Target audience: ${data.targetAudience || "Not specified — infer from creative if possible"}

## Creative content
- Primary text: ${data.creative.primaryText || "Not provided"}
- Headline: ${data.creative.headline || "Not provided"}
- Desired viewer action: ${data.creative.desiredAction || "Not specified"}

## Performance numbers
${metricsSection}
${adlyticSection}
## Internal benchmarks for this goal (secondary — Adlytic live numbers win when present)
Primary KPIs: ${primaryKpis.join(", ")}
${benchmarkText}

${trendSection}

${data.imageBase64 ? "An ad image is attached — analyze it thoroughly: first impression, hook, colors, text on image, mobile readability, brand clarity, and whether the desired action is obvious. Compare visual style to category trends." : "No image attached — analyze copy only and encourage uploading creative next time."}

Provide:
1. audienceMessage — What is this ad telling the audience? (2-3 sentences, plain Arabic)
2. summaryAr/summaryEn — Warm overall assessment referencing trends${adlyticContext ? " and Adlytic performance" : ""}
3. creativeBreakdown — hook, messageClarity, visualImpact, ctaStrength (each with score 0-100 and simple explanation referencing trends where relevant)
4. trendComparison — How user's ad compares to successful ads in category (3-5 sentences, ar + en)
5. actionItems — 3-5 specific changes aligned with what's working NOW${adlyticContext ? " and Adlytic diagnoses/brain insight" : ""}
6. industryTips — 2-4 tips for ${industry?.labelAr} based on current trends
7. strengths — 2-3 things working well
8. performanceInsight — ${adlyticContext || (data.hasMetrics && data.metrics) ? "REQUIRED; cite real numbers" : "ONLY if metrics were provided; otherwise omit"}`;
}
