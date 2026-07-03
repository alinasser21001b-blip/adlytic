// ════════════════════════════════════════════════════════════════════════
//  src/engines/intelligence/AdlyticIntelligenceSystem.ts
//
//  V5 Signal-Driven Expert Engine — Strangler Fig Phase 1 (shadow write only).
//
//  Nothing reads from campaign_intelligence_reports yet. This runs silently
//  after the existing four engines and writes to V5 tables. If it throws,
//  the sync result is unaffected — the try/catch lives in runEngines.ts.
//
//  Architecture:
//    Phase 1 — Signal extraction
//      Load 14 days of daily_stats (7 current + 7 prior, lagged 2 days for
//      Meta attribution backfill). Produce 10 typed signals with weights.
//
//    Phase 2 — Expert rules
//      Each rule receives typed signals and returns CampaignIssue rows with:
//        strength  ∈ [0, 1]   — mathematical certainty of the pattern
//        evidence  string[]   — human-readable strings, quoted directly in AI prompts
//
//    Phase 3 — Atomic upsert
//      Upsert the report row, delete stale children, bulk-insert fresh ones.
//      All inside a Prisma $transaction.
//
//  Design constraints:
//    - No new DB queries beyond what AnalyticsEngine already does.
//    - Reuses existing calculators (calculateCtrTrend et al.) — same math.
//    - evidence is string[], not JSON. Enables `evidence.join('\n')` in AI prompts.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { DailyPoint } from "../analytics/aggregate";
import { avgRate, sumCount } from "../analytics/aggregate";
import { calculateCtrTrend } from "../analytics/calculateCtrTrend";
import { calculateCpmTrend } from "../analytics/calculateCpmTrend";
import { calculateFrequencyTrend } from "../analytics/calculateFrequencyTrend";
import { calculateResultsTrend } from "../analytics/calculateResultsTrend";
import { calculateSpendTrend } from "../analytics/calculateSpendTrend";
import { confidenceFromCorroboration, severityFromMagnitude } from "../rules/severity";
import { metaKnowledgeInsightEngine } from "../../knowledge/MetaKnowledgeInsightEngine";
import type { CampaignMetrics } from "../../knowledge/types";

// ── types ────────────────────────────────────────────────────────────────

interface Signal {
  signalType: string;
  signalValue: number;
  signalWeight: number;
}

interface IssueRow {
  entityId: string;
  issueCode: string;
  severity: string;
  strength: number;
  evidence: string[];
}

interface RecommendationRow {
  entityId: string;
  actionCode: string;
  priority: string;
  strength: number;
  text: string;
}

// ── severity helpers ──────────────────────────────────────────────────────

// Delegates to the single severity ladder in rules/severity.ts so tuning the
// buckets there propagates to V5 too (no duplicate ladder to drift). The
// Severity enum values ARE the string labels ("LOW"|"MEDIUM"|"HIGH"|"CRITICAL").
function severityLabel(absMovement: number): string {
  return severityFromMagnitude(absMovement);
}

function priorityLabel(strength: number): string {
  if (strength < 0.35) return "LOW";
  if (strength < 0.60) return "MEDIUM";
  if (strength < 0.80) return "HIGH";
  return "CRITICAL";
}

// ── date helpers ──────────────────────────────────────────────────────────

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86_400_000); }
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }

// ── expert rules ──────────────────────────────────────────────────────────

function ruleAudienceFatigue(
  cur: DailyPoint[],
  prior: DailyPoint[],
  entityId: string
): IssueRow | null {
  const freqTrend = calculateFrequencyTrend(cur, prior);
  const ctrTrend = calculateCtrTrend(cur, prior);
  const resultsTrend = calculateResultsTrend(cur, prior);

  const freqUp      = freqTrend != null && freqTrend >= 0.15;
  const ctrDown     = ctrTrend != null  && ctrTrend <= -0.15;
  const resultsDown = resultsTrend != null && resultsTrend <= -0.20;

  const signals = [freqUp, ctrDown, resultsDown];
  const present = signals.filter(Boolean).length;
  if (present < 2) return null;

  const magnitudes = [
    freqTrend     != null ? Math.abs(freqTrend)     : 0,
    ctrTrend      != null ? Math.abs(ctrTrend)      : 0,
    resultsTrend  != null ? Math.abs(resultsTrend)  : 0,
  ];
  const peak = Math.max(...magnitudes);
  const strength = confidenceFromCorroboration(signals);
  const severity = severityLabel(peak);

  const evidence: string[] = [];
  if (freqUp && freqTrend != null)
    evidence.push(`Frequency rose ${pct(freqTrend)} vs prior 7 days (audience is seeing ads repeatedly)`);
  if (ctrDown && ctrTrend != null)
    evidence.push(`CTR fell ${pct(Math.abs(ctrTrend))} vs prior 7 days (audience engagement dropping)`);
  if (resultsDown && resultsTrend != null)
    evidence.push(`Results fell ${pct(Math.abs(resultsTrend))} vs prior 7 days (campaign efficiency declining)`);
  evidence.push(`${present}/3 fatigue signals present (strength ${strength.toFixed(2)})`);

  return { entityId, issueCode: "AUDIENCE_FATIGUE", severity, strength, evidence };
}

function ruleLowCtr(
  cur: DailyPoint[],
  entityId: string
): IssueRow | null {
  const currentCtr = avgRate(cur, "ctr");
  const THRESHOLD = 1.0;
  if (currentCtr == null || currentCtr >= THRESHOLD) return null;

  const gap = (THRESHOLD - currentCtr) / THRESHOLD;
  const strength = Math.min(0.95, gap + 0.20);
  const severity = severityLabel(gap);

  const evidence: string[] = [
    `Current CTR is ${currentCtr.toFixed(2)}% — below the ${THRESHOLD}% engagement threshold`,
    `${pct(gap)} below threshold; audience is scrolling past ads without clicking`,
  ];

  return { entityId, issueCode: "LOW_CTR", severity, strength, evidence };
}

function ruleHighFrequency(
  cur: DailyPoint[],
  entityId: string
): IssueRow | null {
  const currentFreq = avgRate(cur, "frequency");
  const THRESHOLD = 5.0;
  if (currentFreq == null || currentFreq <= THRESHOLD) return null;

  const overshoot = (currentFreq - THRESHOLD) / THRESHOLD;
  const strength = confidenceFromCorroboration([true, overshoot >= 0.10, overshoot >= 0.30]);
  const severity = severityLabel(overshoot);

  const evidence: string[] = [
    `Average frequency is ${currentFreq.toFixed(1)} — above the ${THRESHOLD} fatigue threshold`,
    `Each person in the audience has seen ads ${currentFreq.toFixed(1)} times on average`,
  ];
  if (overshoot >= 0.30)
    evidence.push("Frequency is significantly elevated — creative refresh is overdue");

  return { entityId, issueCode: "HIGH_FREQUENCY", severity, strength, evidence };
}

function ruleDecliningResults(
  cur: DailyPoint[],
  prior: DailyPoint[],
  entityId: string
): IssueRow | null {
  const resultsTrend = calculateResultsTrend(cur, prior);
  if (resultsTrend == null || resultsTrend > -0.20) return null;

  const magnitude = Math.abs(resultsTrend);
  const strength = Math.min(0.95, magnitude * 1.2);
  const severity = severityLabel(magnitude);

  const curResults = sumCount(cur, "messages") + sumCount(cur, "conversions");
  const prvResults = sumCount(prior, "messages") + sumCount(prior, "conversions");

  const evidence: string[] = [
    `Results fell ${pct(magnitude)} vs prior 7 days (${prvResults} → ${curResults})`,
    "Declining results signal reduced audience responsiveness or creative wear-out",
  ];
  if (magnitude >= 0.50)
    evidence.push("Drop exceeds 50% — campaign may have entered a performance trough");

  return { entityId, issueCode: "DECLINING_RESULTS", severity, strength, evidence };
}

function ruleRisingCostPerResult(
  cur: DailyPoint[],
  prior: DailyPoint[],
  entityId: string
): IssueRow | null {
  const cpmTrend = calculateCpmTrend(cur, prior);
  const resultsTrend = calculateResultsTrend(cur, prior);

  // Rising CPM alone or CPM up with results flat/down
  const cpmUp = cpmTrend != null && cpmTrend >= 0.20;
  const resultsFlat = resultsTrend == null || resultsTrend <= 0.05;
  if (!cpmUp || !resultsFlat) return null;

  const magnitude = cpmTrend != null ? Math.abs(cpmTrend) : 0;
  const strength = confidenceFromCorroboration([cpmUp, resultsFlat && resultsTrend != null && resultsTrend < -0.05]);
  const severity = severityLabel(magnitude);

  const curCpm = avgRate(cur, "cpm");
  const prvCpm = avgRate(prior, "cpm");

  const evidence: string[] = [
    `CPM rose ${pct(magnitude)} vs prior 7 days${curCpm != null && prvCpm != null ? ` (${prvCpm.toFixed(0)} → ${curCpm.toFixed(0)})` : ""}`,
    "Auction competition increased while results held flat — each result is costing more",
  ];
  if (resultsTrend != null && resultsTrend < -0.10)
    evidence.push(`Results also fell ${pct(Math.abs(resultsTrend))} — cost-per-result rising on both sides`);

  return { entityId, issueCode: "RISING_COST_PER_RESULT", severity, strength, evidence };
}

// ── recommendation derivation ─────────────────────────────────────────────

function buildCampaignMetrics(cur: DailyPoint[]): CampaignMetrics {
  const curCtr = avgRate(cur, "ctr");
  const curCpm = avgRate(cur, "cpm");
  const curFreq = avgRate(cur, "frequency");
  const curSpend = sumCount(cur, "spend");
  const curMessages = sumCount(cur, "messages");
  const costPerMessage =
    curMessages > 0 ? +(curSpend / curMessages).toFixed(4) : null;

  return {
    ctr: curCtr,
    cpm: curCpm,
    frequency: curFreq,
    cost_per_message: costPerMessage,
  };
}

function deriveRecommendations(issues: IssueRow[], entityId: string): RecommendationRow[] {
  const recs: RecommendationRow[] = [];

  for (const issue of issues.slice().sort((a, b) => b.strength - a.strength).slice(0, 3)) {
    let actionCode: string;
    let text: string;

    switch (issue.issueCode) {
      case "AUDIENCE_FATIGUE":
        actionCode = "REFRESH_CREATIVE";
        text = "Refresh your ad creatives — the audience has seen them too many times and engagement is dropping.";
        break;
      case "LOW_CTR":
        actionCode = "IMPROVE_AD_COPY";
        text = "Your click-through rate is below the 1% benchmark. Test new headlines and visuals to improve ad appeal.";
        break;
      case "HIGH_FREQUENCY":
        actionCode = "EXPAND_AUDIENCE";
        text = "Your audience is seeing ads too frequently. Expand targeting or add new audience segments to reduce overlap.";
        break;
      case "DECLINING_RESULTS":
        actionCode = "REVIEW_OBJECTIVE";
        text = "Results are declining week-over-week. Review your campaign objective and bid strategy for alignment with current goals.";
        break;
      case "RISING_COST_PER_RESULT":
        actionCode = "ADJUST_BID";
        text = "Your cost-per-result is rising. Review bid caps and budget allocation across ad sets to improve efficiency.";
        break;
      default:
        actionCode = "REVIEW_CAMPAIGN";
        text = "Review campaign performance — an issue has been detected that may require attention.";
    }

    recs.push({
      entityId,
      actionCode,
      priority: priorityLabel(issue.strength),
      strength: issue.strength,
      text,
    });
  }

  return recs;
}

// ── health score derivation ───────────────────────────────────────────────

const SEVERITY_PENALTY: Record<string, number> = {
  LOW: 5,
  MEDIUM: 12,
  HIGH: 22,
  CRITICAL: 35,
};

function deriveHealthScore(issues: IssueRow[]): number {
  let score = 100;
  for (const issue of issues) {
    const basePenalty = SEVERITY_PENALTY[issue.severity] ?? 10;
    score -= basePenalty * issue.strength;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── main system class ─────────────────────────────────────────────────────

export class AdlyticIntelligenceSystem {
  constructor(private prisma: PrismaClient) {}

  async run(adAccountId: string, asOf?: Date): Promise<void> {
    const now = asOf ?? new Date();

    // Same window math as AnalyticsEngine: 7 current + 7 prior, lagged 2 days.
    const lag = 2;
    const windowDays = 7;
    const currentUntil = addDays(now, -lag);
    const currentSince = addDays(currentUntil, -(windowDays - 1));
    const priorUntil = addDays(currentSince, -1);
    const priorSince = addDays(priorUntil, -(windowDays - 1));

    const allPoints = await this.loadPoints(adAccountId, priorSince, currentUntil);
    const cur = allPoints.filter(p => p.date >= ymd(currentSince) && p.date <= ymd(currentUntil));
    const prior = allPoints.filter(p => p.date >= ymd(priorSince) && p.date <= ymd(priorUntil));

    // ── Phase 1: signals ────────────────────────────────────────────────
    const signals = this.extractSignals(cur, prior, adAccountId);

    // ── Phase 2: expert rules ───────────────────────────────────────────
    const issues: IssueRow[] = [
      ruleAudienceFatigue(cur, prior, adAccountId),
      ruleLowCtr(cur, adAccountId),
      ruleHighFrequency(cur, adAccountId),
      ruleDecliningResults(cur, prior, adAccountId),
      ruleRisingCostPerResult(cur, prior, adAccountId),
    ].filter((r): r is IssueRow => r !== null);

    const healthScore = deriveHealthScore(issues);

    // KB FIRST — verbatim recommended_optimization_actions when thresholds breach.
    const metrics = buildCampaignMetrics(cur);
    const kbRecs = metaKnowledgeInsightEngine.deriveRecommendations(metrics, adAccountId);
    const recs: RecommendationRow[] = kbRecs.length > 0
      ? kbRecs.map(r => ({
          entityId: r.entityId,
          actionCode: r.actionCode,
          priority: r.priority,
          strength: r.strength,
          text: r.text,
        }))
      : deriveRecommendations(issues, adAccountId);

    // ── Phase 3: atomic upsert ──────────────────────────────────────────
    await this.upsert(adAccountId, now, healthScore, signals, issues, recs);
  }

  private extractSignals(cur: DailyPoint[], prior: DailyPoint[], entityId: string): Signal[] {
    const ctrTrend = calculateCtrTrend(cur, prior);
    const cpmTrend = calculateCpmTrend(cur, prior);
    const freqTrend = calculateFrequencyTrend(cur, prior);
    const resultsTrend = calculateResultsTrend(cur, prior);
    const spendTrend = calculateSpendTrend(cur, prior);

    const curCtr = avgRate(cur, "ctr");
    const curCpm = avgRate(cur, "cpm");
    const curFreq = avgRate(cur, "frequency");
    const curSpend = sumCount(cur, "spend");
    const curMessages = sumCount(cur, "messages");

    const signals: Signal[] = [];

    const push = (type: string, value: number | null, weight: number) => {
      if (value != null && Number.isFinite(value))
        signals.push({ signalType: type, signalValue: +value.toFixed(4), signalWeight: weight });
    };

    push("CURRENT_CTR",       curCtr,       0.9);
    push("CURRENT_CPM",       curCpm,       0.7);
    push("CURRENT_FREQUENCY", curFreq,      0.8);
    push("CURRENT_SPEND",     curSpend,     0.5);
    push("CURRENT_MESSAGES",  curMessages,  0.6);
    push("CTR_TREND",         ctrTrend,     1.0);
    push("CPM_TREND",         cpmTrend,     0.8);
    push("FREQUENCY_TREND",   freqTrend,    0.9);
    push("RESULTS_TREND",     resultsTrend, 1.0);
    push("SPEND_TREND",       spendTrend,   0.6);

    return signals;
  }

  private async loadPoints(adAccountId: string, since: Date, until: Date): Promise<DailyPoint[]> {
    const rows = await this.prisma.dailyStat.findMany({
      where: {
        entityType: "ACCOUNT",
        entityId: adAccountId,
        date: { gte: dateOnly(since), lte: dateOnly(until) },
      },
      orderBy: { date: "asc" },
    });
    return rows.map((r: any) => ({
      date: r.date.toISOString().slice(0, 10),
      spend: Number(r.spend),
      messages: Number(r.messages),
      impressions: Number(r.impressions),
      reach: Number(r.reach),
      clicks: Number(r.clicks),
      ctr: r.ctr,
      cpm: r.cpm,
      frequency: r.frequency,
      conversions: Number(r.conversions),
    }));
  }

  private async upsert(
    adAccountId: string,
    asOf: Date,
    healthScore: number,
    signals: Signal[],
    issues: IssueRow[],
    recs: RecommendationRow[]
  ): Promise<void> {
    const reportId = randomUUID();
    const dateVal = dateOnly(asOf);

    await this.prisma.$transaction(async (tx) => {
      // Upsert the report (unique on adAccountId + date)
      const existing = await tx.campaignIntelligenceReport.findUnique({
        where: { adAccountId_date: { adAccountId, date: dateVal } },
        select: { id: true },
      });

      const id = existing?.id ?? reportId;

      if (existing) {
        await tx.campaignIntelligenceReport.update({
          where: { id },
          data: { healthScore },
        });
        // Delete stale children
        await tx.campaignSignal.deleteMany({ where: { reportId: id } });
        await tx.campaignIssue.deleteMany({ where: { reportId: id } });
        await tx.campaignRecommendation.deleteMany({ where: { reportId: id } });
      } else {
        await tx.campaignIntelligenceReport.create({
          data: { id, adAccountId, date: dateVal, healthScore },
        });
      }

      // Bulk-insert fresh children
      if (signals.length > 0) {
        await tx.campaignSignal.createMany({
          data: signals.map(s => ({
            id: randomUUID(),
            reportId: id,
            entityId: adAccountId,
            signalType: s.signalType,
            signalValue: s.signalValue,
            signalWeight: s.signalWeight,
          })),
        });
      }

      if (issues.length > 0) {
        await tx.campaignIssue.createMany({
          data: issues.map(i => ({
            id: randomUUID(),
            reportId: id,
            entityId: i.entityId,
            issueCode: i.issueCode,
            severity: i.severity,
            strength: i.strength,
            evidence: i.evidence,
          })),
        });
      }

      if (recs.length > 0) {
        await tx.campaignRecommendation.createMany({
          data: recs.map(r => ({
            id: randomUUID(),
            reportId: id,
            entityId: r.entityId,
            actionCode: r.actionCode,
            priority: r.priority,
            strength: r.strength,
            text: r.text,
          })),
        });
      }
    });
  }
}
