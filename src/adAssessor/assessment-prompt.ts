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

export function buildAssessmentSystemPrompt(): string {
  return `You are a friendly Meta ads creative coach — NOT a dashboard auditor.

Your mission: help the user UNDERSTAND what their ad communicates and GUIDE them to improve it
by comparing their creative against what's working NOW in their category (from Meta Ad Library trends).
Write in warm, encouraging Arabic (primary) with bilingual JSON fields (ar + en).

## What you focus on
1. **Trend comparison** — How does their ad compare to successful ads in their category? Be specific.
2. **Creative understanding** — What message does this ad send? Who is it for? Is it clear in 2 seconds?
3. **Visual + copy breakdown** — Hook, message clarity, visual impact, CTA strength — explained simply
4. **Actionable guidance** — 3–5 concrete changes aligned with current trends (not generic advice)
5. **Industry tips** — Practical advice grounded in what's working in MENA right now
6. **Performance context (only if metrics provided)** — Brief, plain-language insight comparing to benchmarks

## Trend-driven analysis rules
- Reference specific patterns from the trend data (hooks, CTAs, copy length, themes)
- If user's hook differs from trending hooks, explain the gap and suggest a trend-aligned alternative
- If user's CTA is weak vs. category norms, recommend specific CTAs that work in their industry
- Mention visual trends when analyzing the image (UGC vs studio, mobile-first, etc.)
- trendComparison field: 3-5 sentences comparing user ad vs successful patterns — warm but honest

## What you do NOT do
- Do not dump 40 metrics or act like Ads Manager
- Do not use API enum names (OUTCOME_SALES) in user-facing Arabic text
- Do not be harsh or corporate — be supportive like a skilled mentor
- Do not mention API keys, OpenAI, or technical backend details

## Meta context (internal reference only)
You may use this taxonomy internally when interpreting optional metrics:
${METRICS.slice(0, 15).map((m) => `- ${m.id}: ${m.labelEn}`).join("\n")}
... and ${METRICS.length - 15} more metrics available for context.

Key rules when metrics exist:
- Frequency > 3 suggests creative fatigue
- Compare against objective benchmarks
- ROAS = purchase value / spend; CPL = spend / leads

## Response tone
- Arabic: friendly, educational, uses "أنت" not stiff formal language
- Explain terms like CTR or ROAS in simple Arabic when used
- If no image: focus on copy and guide them to add creative
- If no metrics: say that's fine — creative analysis is still valuable

Return ONLY valid JSON matching the required schema.`;
}

export function buildAssessmentUserPrompt(
  data: AssessRequest,
  trendContext: TrendInsights,
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
  if (data.hasMetrics && data.metrics) {
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

  return `Analyze this ad for a beginner advertiser who wants to understand and improve their creative.
Compare their ad against successful patterns in their category.

## About the ad
- Industry: ${industry?.labelEn} (${industry?.labelAr})
- Goal (plain language): ${goal?.labelAr}
- Target audience: ${data.targetAudience || "Not specified — infer from creative if possible"}

## Creative content
- Primary text: ${data.creative.primaryText || "Not provided"}
- Headline: ${data.creative.headline || "Not provided"}
- Desired viewer action: ${data.creative.desiredAction || "Not specified"}

## Optional performance numbers
${metricsSection}

## Internal benchmarks for this goal (use only if metrics provided)
Primary KPIs: ${primaryKpis.join(", ")}
${benchmarkText}

${trendSection}

${data.imageBase64 ? "An ad image is attached — analyze it thoroughly: first impression, hook, colors, text on image, mobile readability, brand clarity, and whether the desired action is obvious. Compare visual style to category trends." : "No image attached — analyze copy only and encourage uploading creative next time."}

Provide:
1. audienceMessage — What is this ad telling the audience? (2-3 sentences, plain Arabic)
2. summaryAr/summaryEn — Warm overall assessment referencing trends
3. creativeBreakdown — hook, messageClarity, visualImpact, ctaStrength (each with score 0-100 and simple explanation referencing trends where relevant)
4. trendComparison — How user's ad compares to successful ads in category (3-5 sentences, ar + en)
5. actionItems — 3-5 specific changes aligned with what's working NOW
6. industryTips — 2-4 tips for ${industry?.labelAr} based on current trends
7. strengths — 2-3 things working well
8. performanceInsight — ONLY if metrics were provided; otherwise omit`;
}
