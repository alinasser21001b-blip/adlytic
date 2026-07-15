// ════════════════════════════════════════════════════════════════════════
//  src/services/aiContextBuilderV5.ts
//
//  V5 AI Context Builder — reads from campaign_intelligence_reports.
//  Strangler Fig Phase 2: swap this in for aiContextBuilder.ts once shadow
//  data has been validated against V1 output.
//
//  Key differences from V1 aiContextBuilder.ts:
//    - Reads directly from DB (not from DashboardDTO)
//    - evidence[] is already human-readable strings — quoted verbatim
//    - strength (0–1 float) lets Claude calibrate hedge language
//    - signals give Claude raw metric grounding ("CTR is 0.72%") before
//      the expert diagnosis ("which is below the 1% threshold") arrives
//
//  This file has NO side-effects. It is pure: DB in, string out.
//  The caller (server.ts AI chat route) swaps the import when ready.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityStatus } from "@prisma/client";
import { sanitizeLlmUserContent, scrubString } from "../lib/dataSanitizer";
import { diagnoseRelevance } from "../knowledge/adRelevanceIntelligence";
import {
  issueTitleAr,
  sanitizePriorityActionText,
  severityLabelAr,
  simplifyMerchantText,
} from "../lib/plainArabicAdvice";

// ── types ─────────────────────────────────────────────────────────────────

export interface V5ContextOpts {
  /** Human-readable workspace name for the header. */
  workspaceName?: string;
  /** ISO 4217 currency code — used to annotate spend signal. */
  currency?: string;
  /** "EN" | "AR" — not used in prompt text yet, reserved for future locale. */
  locale?: string;
  /** Override "today" for testing. */
  asOf?: Date;
}

// ── signal display ────────────────────────────────────────────────────────

/** Format a raw signal value into something Claude can read without confusion. */
function formatSignalValue(type: string, value: number, currency = "USD"): string {
  switch (type) {
    case "CURRENT_CTR":       return `${value.toFixed(2)}%`;
    case "CURRENT_CPM":       return `${value.toFixed(0)} ${currency} (minor units/1000 imp)`;
    case "CURRENT_FREQUENCY": return value.toFixed(2);
    case "CURRENT_SPEND":     return `${Math.round(value).toLocaleString()} ${currency} (minor units)`;
    case "CURRENT_MESSAGES":  return Math.round(value).toLocaleString();
    case "CTR_TREND":
    case "CPM_TREND":
    case "FREQUENCY_TREND":
    case "RESULTS_TREND":
    case "SPEND_TREND": {
      const sign = value > 0 ? "+" : "";
      return `${sign}${(value * 100).toFixed(1)}% vs prior 7d`;
    }
    default: return String(value);
  }
}

function signalLabel(type: string): string {
  const MAP: Record<string, string> = {
    CURRENT_CTR:       "نسبة النقر (حالي)",
    CURRENT_CPM:       "تكلفة الوصول (حالي)",
    CURRENT_FREQUENCY: "مرات الظهور لنفس الشخص (حالي)",
    CURRENT_SPEND:     "الإنفاق (7 أيام)",
    CURRENT_MESSAGES:  "النتائج / الرسائل (7 أيام)",
    CTR_TREND:         "اتجاه نسبة النقر",
    CPM_TREND:         "اتجاه تكلفة الوصول",
    FREQUENCY_TREND:   "اتجاه مرات الظهور",
    RESULTS_TREND:     "اتجاه النتائج",
    SPEND_TREND:       "اتجاه الإنفاق",
  };
  return MAP[type] ?? type;
}

// ── health band ───────────────────────────────────────────────────────────

function healthBand(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Attention";
  return "Poor";
}

// ── signal ordering ───────────────────────────────────────────────────────
// Show current-level signals first, then trends. Within each group, higher
// weight signals surface first so Claude reads the most important facts early.
const SIGNAL_ORDER: Record<string, number> = {
  CURRENT_CTR: 1, CURRENT_CPM: 2, CURRENT_FREQUENCY: 3,
  CURRENT_MESSAGES: 4, CURRENT_SPEND: 5,
  CTR_TREND: 6, CPM_TREND: 7, FREQUENCY_TREND: 8,
  RESULTS_TREND: 9, SPEND_TREND: 10,
};

// ── main function ─────────────────────────────────────────────────────────

/**
 * Build an AI context string from the latest V5 intelligence report for
 * `adAccountId`. Returns a fallback string when no report exists yet
 * (shadow data hasn't accumulated for a full sync cycle).
 */
export async function buildAiContextV5(
  prisma: PrismaClient,
  adAccountId: string,
  message: string,
  opts: V5ContextOpts = {}
): Promise<string> {
  const currency = opts.currency ?? "USD";
  const wsName = scrubString(opts.workspaceName ?? "—");
  const safeMessage = scrubString(message);
  const today = opts.asOf ?? new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // ── Load latest report + all children in two queries ──────────────────
  const report = await prisma.campaignIntelligenceReport.findFirst({
    where: { adAccountId },
    orderBy: { date: "desc" },
    include: {
      signals:         { orderBy: { signalWeight: "desc" } },
      issues:          { orderBy: { strength: "desc" } },
      recommendations: { orderBy: { strength: "desc" } },
    },
  });

  if (!report) {
    return [
      `## Workspace: ${wsName}`,
      `## Status: Intelligence data not yet available for this account.`,
      `## Note: The V5 engine runs after each sync. If the account was just connected, wait for the next sync cycle (~15 min).`,
      "",
      `## Question: ${safeMessage}`,
    ].join("\n");
  }

  const reportDate = report.date.toISOString().slice(0, 10);
  const score = Math.round(report.healthScore);
  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────
  lines.push(
    `## Workspace: ${wsName} | Currency: ${currency}`,
    `## Health Score: ${score}/100 (${healthBand(score)}) | Report date: ${reportDate} | As of: ${todayStr}`,
  );

  // ── Signals — metric grounding ─────────────────────────────────────────
  // Signals give Claude the raw numbers before any diagnosis. This lets it
  // answer "what is my CTR?" correctly even when no issue was triggered.
  const sortedSignals = [...report.signals].sort(
    (a, b) => (SIGNAL_ORDER[a.signalType] ?? 99) - (SIGNAL_ORDER[b.signalType] ?? 99)
  );

  if (sortedSignals.length > 0) {
    lines.push("## Metrics", "| Metric | Value | Weight |", "|--------|-------|--------|");
    for (const s of sortedSignals) {
      lines.push(
        `| ${signalLabel(s.signalType)} | ${formatSignalValue(s.signalType, s.signalValue, currency)} | ${s.signalWeight.toFixed(1)} |`
      );
    }
  } else {
    lines.push("## Metrics: insufficient data (< 7 days of stats)");
  }

  // ── Issues — expert diagnosis with evidence ───────────────────────────
  // evidence[] is already human-readable text — quoted directly, no JSON.
  if (report.issues.length > 0) {
    lines.push(
      `## Issues (${report.issues.length}) — Arabic titles for merchant; never echo internal codes`,
    );
    for (const iss of report.issues) {
      const strengthPct = Math.round(iss.strength * 100);
      const title = issueTitleAr(iss.issueCode);
      const sev = severityLabelAr(iss.severity);
      lines.push(`### ${title} | ${sev} | ثقة ${strengthPct}%`);
      for (const ev of iss.evidence) {
        const cleaned = simplifyMerchantText(ev) || String(ev);
        lines.push(`- ${cleaned}`);
      }
    }
  } else {
    lines.push("## Issues: none — all signals within normal ranges");
  }

  // ── Recommendations — top 3 ────────────────────────────────────────────
  const topRecs = report.recommendations.slice(0, 3);
  if (topRecs.length > 0) {
    lines.push(
      "## Recommended Actions (merchant Arabic tasks)",
      "| Priority | Action | Strength |",
      "|----------|--------|----------|",
    );
    for (const r of topRecs) {
      const text = sanitizePriorityActionText(
        (r as { actionCode?: string }).actionCode,
        r.text,
      );
      lines.push(
        `| ${severityLabelAr(r.priority)} | ${text} | ${Math.round(r.strength * 100)}% |`,
      );
    }
  } else {
    lines.push("## Recommended Actions: none at this time");
  }

  // ── Creative relevance — Meta's OWN grades (highest-signal, zero inference).
  // Lets Claude cite the platform's verdict on specific ads, e.g. "Meta ranks
  // this ad's post-click conversion in the bottom 20%". Bounded, best-effort.
  try {
    const gradedAds = await prisma.ad.findMany({
      where: {
        rankingsSyncedAt: { not: null },
        status: EntityStatus.ACTIVE,
        adSet: { campaign: { adAccountId } },
      },
      select: {
        name: true,
        qualityRanking: true,
        engagementRanking: true,
        conversionRanking: true,
      },
      take: 200,
    });
    const flagged = gradedAds
      .map((a) => ({
        name: a.name,
        d: diagnoseRelevance({
          quality: (a.qualityRanking ?? "unknown") as never,
          engagement: (a.engagementRanking ?? "unknown") as never,
          conversion: (a.conversionRanking ?? "unknown") as never,
        }),
      }))
      .filter((x) => x.d.severity === "high" || x.d.severity === "medium")
      .sort((a, b) => (a.d.severity === "high" ? 0 : 1) - (b.d.severity === "high" ? 0 : 1))
      .slice(0, 5);
    if (flagged.length > 0) {
      lines.push(
        `## Creative relevance — Meta's own grades (${flagged.length} ad(s) flagged; cite as Meta's verdict, use the Arabic title)`,
      );
      for (const f of flagged) {
        lines.push(`### ${scrubString(f.name)} | ${f.d.titleAr} | ثقة ${Math.round(f.d.confidence * 100)}%`);
        lines.push(`- ${f.d.bodyAr}`);
        lines.push(`- ماذا تفعل: ${f.d.actionAr}`);
      }
    }
  } catch (e) {
    // Enrichment only — never fail the context on a relevance query error.
    console.warn("[aiContextV5] relevance section skipped:", e instanceof Error ? e.message : String(e));
  }

  lines.push("", `## Question: ${safeMessage}`);
  return sanitizeLlmUserContent(lines.join("\n"));
}
