// ════════════════════════════════════════════════════════════════════════
//  src/services/weeklyReport.ts
//
//  Weekly Performance Report — generates a comprehensive Arabic summary
//  of the past 7 days across all campaigns.
//
//  Pipeline:
//    1. Gather DailyStats for last 7 days + previous 7 days (for deltas)
//    2. Gather Brain snapshots for the week
//    3. Compute deterministic metrics (spend, CTR, messages, best/worst)
//    4. If AI available: generate Arabic narrative summary + recommendations
//    5. Store report as JSON (no new Prisma model — uses PlatformSetting)
//
//  Designed to run as a weekly cron or be triggered manually via API.
// ════════════════════════════════════════════════════════════════════════

import { type PrismaClient, EntityType } from '@prisma/client';
import { generateStructured, isAIAvailable } from './ai/aiService';
import { resolveAccountResultKey } from '../analytics/accountResultKey';
import { resolveCurrencyMinorFactor } from '../lib/currency';
import {
  BRAIN_SPEND_DEPENDENT_ACTIONS, SPEND_SCALE_OVERSCALED, SPEND_SCALE_UNVERIFIED,
  addDaysIso, evaluateSpendWindow, flagFromWindow, isoDay, unreadableWindow,
  type SpendGateReason, type SpendScaleFlag,
} from '../lib/spendEvidence';

export interface WeeklyMetrics {
  spend: number;
  spendDisplay: string;
  /** ONE coherent unit only (resultSemantics.ts) — null when the account
   *  mixes purposes; there is no correct cross-unit sum to report. */
  results: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  costPerResult: number | null;
  frequency: number | null;
}

export interface WeeklyDelta {
  spendPct: number | null;
  resultsPct: number | null;
  ctrPct: number | null;
  costPerResultPct: number | null;
}

export interface WeeklyCampaignHighlight {
  campaignId: string;
  campaignName: string;
  spend: number;
  /** Same ONE-coherent-unit rule as WeeklyMetrics.results. */
  results: number | null;
  ctr: number | null;
  healthScore: number | null;
  pattern: string | null;
  action: string | null;
}

export interface WeeklyReportDTO {
  weekStart: string;
  weekEnd: string;
  thisWeek: WeeklyMetrics;
  lastWeek: WeeklyMetrics;
  delta: WeeklyDelta;
  bestCampaign: WeeklyCampaignHighlight | null;
  worstCampaign: WeeklyCampaignHighlight | null;
  activeCampaigns: number;
  pausedCampaigns: number;
  brainActions: {
    scaled: number;
    paused: number;
    refreshed: number;
    watching: number;
  };
  summaryAr: string;
  recommendationsAr: string[];
  generatedAt: string;
  source: 'ai' | 'deterministic';
  /**
   * Data-quality signal (additive; present ONLY when the 7+7 day window this report is computed from holds
   * IQD spend that is unverified or proven x100 — never for another currency or a fully verified window).
   * `flags` is the same SPEND_SCALE_* flag the data-health check uses, judged at CAMPAIGN level (the report
   * sums campaign rows). `withheld` names each part of THIS report that was left out because of it. The
   * absolute figures (spend, cpm, cost per result) are still shown as stored: the gate withholds advice and
   * comparisons, it does not rewrite money. src/lib/spendEvidence.ts · delivery/core/SPEND_EVIDENCE_GATING.md
   */
  dataQuality?: {
    flags: SpendScaleFlag[];
    withheld: Array<{ surface: 'recommendations' | 'delta' | 'summary' | 'campaignHighlights'; reason: SpendGateReason; detail?: string }>;
  };
}

export async function generateWeeklyReport(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<WeeklyReportDTO | null> {
  const account = await prisma.adAccount.findFirst({
    where: { workspaceId },
    select: {
      id: true,
      currency: true,
      currencyMinorFactor: true,
    },
  });
  if (!account) return null;

  // Resolve, never trust the stored column: an IQD account still carrying the
  // schema default (100) must read as 1. This used to be masked because the
  // dashboard's GET healed the column first; reads no longer write.
  const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);
  const currency = account.currency;

  const now = new Date();
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = daysAgo(7);
  const prevWeekStart = daysAgo(14);

  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId: account.id },
    select: { id: true, name: true, status: true },
  });
  const campaignIds = campaigns.map(c => c.id);
  const nameMap = new Map(campaigns.map(c => [c.id, c.name]));

  const [thisWeekStats, lastWeekStats, snapshots] = await Promise.all([
    prisma.dailyStat.findMany({
      where: {
        entityType: EntityType.CAMPAIGN,
        entityId: { in: campaignIds },
        date: { gte: weekStart, lt: weekEnd },
      },
      select: dailyStatSelect,
    }),

    prisma.dailyStat.findMany({
      where: {
        entityType: EntityType.CAMPAIGN,
        entityId: { in: campaignIds },
        date: { gte: prevWeekStart, lt: weekStart },
      },
      select: dailyStatSelect,
    }),

    prisma.campaignBrainSnapshot.findMany({
      where: {
        workspaceId,
        tickDate: { gte: weekStart },
      },
      select: {
        campaignId: true,
        action: true,
        priority: true,
        patternSignature: true,
        finalScore: true,
        payload: true,
      },
    }),
  ]);

  if (thisWeekStats.length === 0) return null;

  // Spend evidence for EXACTLY the rows below: the 7 + 7 days, CAMPAIGN level (the report sums campaign rows).
  // `date >= prevWeekStart && date < weekEnd` as the queries above read it, so the inclusive end is the day before
  // weekEnd. IQD only; an unreadable read is treated as unverified (the report is still served, its advice is not).
  const evidenceFrom = isoDay(prevWeekStart);
  const evidenceTo = addDaysIso(isoDay(weekEnd), -1);
  const evidence = await evaluateSpendWindow(prisma, account, evidenceFrom, evidenceTo, 'CAMPAIGN').catch((err) => {
    console.warn('[weekly-report] spend evidence unreadable, treating the window as unverified:', err instanceof Error ? err.message : err);
    return unreadableWindow(currency, 'CAMPAIGN', evidenceFrom, evidenceTo);
  });
  const spendGated = evidence.applies && !evidence.clean;
  const spendReason: SpendGateReason = evidence.reason ?? SPEND_SCALE_UNVERIFIED;
  const withheld: NonNullable<WeeklyReportDTO['dataQuality']>['withheld'] = [];

  // The account's single result column, or null when purposes mix — resolved
  // once, over the full two-week comparison window, and reused for both
  // weeks' aggregates so "this week" and "last week" are never accidentally
  // resolved to different units.
  const { resultKey } = await resolveAccountResultKey(prisma, account.id, prevWeekStart, weekEnd);

  const thisWeek = aggregateMetrics(thisWeekStats, factor, currency, resultKey);
  const lastWeek = aggregateMetrics(lastWeekStats, factor, currency, resultKey);
  const delta = computeDeltas(thisWeek, lastWeek);
  // Spend and cost-per-result CHANGES compare two windows of unverified spend (across a x100 boundary they read
  // as a 99 % swing): withheld. The results / CTR comparisons do not rest on spend and stay.
  const spendPctBefore = delta.spendPct;
  if (spendGated && (delta.spendPct != null || delta.costPerResultPct != null)) {
    withheld.push({ surface: 'delta', reason: spendReason, detail: 'spendPct,costPerResultPct' });
    delta.spendPct = null;
    delta.costPerResultPct = null;
  }

  const campaignPerformance = buildCampaignPerformance(thisWeekStats, snapshots, factor, nameMap, resultKey);
  const sorted = [...campaignPerformance].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));
  // Best / worst are ranked by CTR (no spend in the ranking). What they carry from the Brain is another matter:
  // the pattern and the health score are the physics score, which blends cost per message, and no gate touched
  // them at their tick — withheld; a spend-dependent verdict left over from before the gate is withheld too.
  const bestCampaign = gateHighlight(sorted[0] ?? null, spendGated);
  const worstCampaign = gateHighlight(sorted.length > 1 ? sorted[sorted.length - 1]! : null, spendGated);
  if (spendGated && (bestCampaign || worstCampaign)) {
    withheld.push({ surface: 'campaignHighlights', reason: spendReason, detail: 'pattern,healthScore,action' });
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'PAUSED').length;

  const brainActions = countBrainActions(snapshots);

  let summaryAr: string;
  let recommendationsAr: string[];
  let source: 'ai' | 'deterministic' = 'deterministic';

  // The AI narrative is handed the spend figures and may answer with a budget or pause move; it cannot be
  // post-checked, so an unverified window uses the deterministic builder, which knows what to leave out.
  if (isAIAvailable() && !spendGated) {
    try {
      const aiResult = await generateAISummary({
        thisWeek, lastWeek, delta,
        bestCampaign, worstCampaign,
        activeCampaigns, brainActions, currency,
      });
      summaryAr = aiResult.summaryAr;
      recommendationsAr = aiResult.recommendationsAr;
      source = 'ai';
    } catch (err) {
      console.warn('[weekly-report] AI summary failed, using deterministic:', err);
      const det = buildDeterministicSummary({
        thisWeek, lastWeek, delta,
        bestCampaign, worstCampaign,
        activeCampaigns, brainActions, currency,
      });
      summaryAr = det.summaryAr;
      recommendationsAr = det.recommendationsAr;
    }
  } else {
    const det = buildDeterministicSummary({
      thisWeek, lastWeek, delta,
      bestCampaign, worstCampaign,
      activeCampaigns, brainActions, currency,
    }, spendGated ? spendReason : null);
    summaryAr = det.summaryAr;
    recommendationsAr = det.recommendationsAr;
    if (spendGated) {
      withheld.push({ surface: 'recommendations', reason: spendReason, detail: 'budget increase, pause, cost-per-result' });
      if (spendPctBefore != null) withheld.push({ surface: 'summary', reason: spendReason, detail: 'spend trend sentence' });
    }
  }

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    thisWeek,
    lastWeek,
    delta,
    bestCampaign,
    worstCampaign,
    activeCampaigns,
    pausedCampaigns,
    brainActions,
    summaryAr,
    recommendationsAr,
    generatedAt: now.toISOString(),
    source,
    ...(spendGated && { dataQuality: { flags: [flagFromWindow(evidence)].filter((f): f is SpendScaleFlag => f !== null), withheld } }),
  };
}

/**
 * Pure. A best / worst campaign with what the Brain stored about it made safe for an unverified window: the
 * pattern and the health score (the cost-blended physics score) are dropped, and so is a spend-dependent
 * verdict. Not gated: returned untouched, the very same object.
 */
function gateHighlight(h: WeeklyCampaignHighlight | null, gated: boolean): WeeklyCampaignHighlight | null {
  if (!h || !gated) return h;
  return {
    ...h,
    healthScore: null,
    pattern: null,
    action: h.action != null && BRAIN_SPEND_DEPENDENT_ACTIONS.has(h.action) ? null : h.action,
  };
}

const dailyStatSelect = {
  entityId: true,
  spend: true,
  impressions: true,
  clicks: true,
  messages: true,
  purchases: true,
  leads: true,
  frequency: true,
} as const;

type DailyStatRow = {
  entityId: string;
  spend: bigint;
  impressions: bigint;
  clicks: bigint;
  messages: bigint;
  purchases: bigint;
  leads: bigint;
  frequency: number | null;
};

function aggregateMetrics(
  stats: DailyStatRow[],
  factor: number,
  currency: string,
  resultsColumn: string | null,
): WeeklyMetrics {
  let spend = 0, impressions = 0, clicks = 0, freqSum = 0, freqCount = 0;
  // ONE coherent unit only (resultSemantics.ts) — null stays null (mixed
  // account); otherwise sum just the resolved column, never messages+
  // purchases+leads as though they were one quantity.
  let results: number | null = resultsColumn ? 0 : null;

  for (const s of stats) {
    spend += Number(s.spend);
    impressions += Number(s.impressions);
    clicks += Number(s.clicks);
    if (resultsColumn) {
      results = (results ?? 0) + Number((s as unknown as Record<string, bigint | number>)[resultsColumn] ?? 0);
    }
    if (s.frequency != null) { freqSum += s.frequency; freqCount++; }
  }

  const spendMajor = spend / factor;
  const ctr = impressions > 0 ? +(clicks / impressions * 100).toFixed(2) : null;
  const cpm = impressions > 0 ? +(spendMajor / impressions * 1000).toFixed(2) : null;
  const costPerResult = results != null && results > 0 ? +(spendMajor / results).toFixed(2) : null;
  const frequency = freqCount > 0 ? +(freqSum / freqCount).toFixed(2) : null;

  const display = currency === 'IQD'
    ? `${Math.round(spendMajor).toLocaleString()} ${currency}`
    : `${spendMajor.toFixed(2)} ${currency}`;

  return { spend: +spendMajor.toFixed(2), spendDisplay: display, results, impressions, clicks, ctr, cpm, costPerResult, frequency };
}

function computeDeltas(thisWeek: WeeklyMetrics, lastWeek: WeeklyMetrics): WeeklyDelta {
  return {
    spendPct: pctChange(thisWeek.spend, lastWeek.spend),
    resultsPct: thisWeek.results != null && lastWeek.results != null
      ? pctChange(thisWeek.results, lastWeek.results)
      : null,
    ctrPct: thisWeek.ctr != null && lastWeek.ctr != null && lastWeek.ctr > 0
      ? +((thisWeek.ctr - lastWeek.ctr) / lastWeek.ctr * 100).toFixed(1)
      : null,
    costPerResultPct: pctChange(thisWeek.costPerResult ?? 0, lastWeek.costPerResult ?? 0),
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return +((current - previous) / previous * 100).toFixed(1);
}

function buildCampaignPerformance(
  stats: DailyStatRow[],
  snapshots: Array<{ campaignId: string; finalScore: number; patternSignature: string; action: string }>,
  factor: number,
  nameMap: Map<string, string>,
  resultsColumn: string | null,
): WeeklyCampaignHighlight[] {
  const byCampaign = new Map<string, { spend: number; results: number | null; impressions: number; clicks: number }>();
  for (const s of stats) {
    const existing = byCampaign.get(s.entityId) ?? { spend: 0, results: resultsColumn ? 0 : null, impressions: 0, clicks: 0 };
    existing.spend += Number(s.spend);
    // ONE coherent unit only (resultSemantics.ts) — see aggregateMetrics.
    if (resultsColumn) {
      existing.results = (existing.results ?? 0) + Number((s as unknown as Record<string, bigint | number>)[resultsColumn] ?? 0);
    }
    existing.impressions += Number(s.impressions);
    existing.clicks += Number(s.clicks);
    byCampaign.set(s.entityId, existing);
  }

  const snapMap = new Map<string, { score: number; pattern: string; action: string }>();
  for (const s of snapshots) {
    snapMap.set(s.campaignId, { score: s.finalScore, pattern: s.patternSignature, action: s.action });
  }

  const highlights: WeeklyCampaignHighlight[] = [];
  for (const [id, data] of byCampaign) {
    const snap = snapMap.get(id);
    highlights.push({
      campaignId: id,
      campaignName: nameMap.get(id) ?? '',
      spend: +(data.spend / factor).toFixed(2),
      results: data.results,
      ctr: data.impressions > 0 ? +(data.clicks / data.impressions * 100).toFixed(2) : null,
      healthScore: snap?.score ?? null,
      pattern: snap?.pattern ?? null,
      action: snap?.action ?? null,
    });
  }
  return highlights;
}

function countBrainActions(snapshots: Array<{ action: string }>): WeeklyReportDTO['brainActions'] {
  const counts = { scaled: 0, paused: 0, refreshed: 0, watching: 0 };
  const seen = new Set<string>();
  for (const s of snapshots) {
    const key = `${s.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (s.action === 'SCALE_BUDGET') counts.scaled++;
    else if (s.action === 'PAUSE_CAMPAIGN' || s.action === 'EMERGENCY_PAUSE') counts.paused++;
    else if (s.action === 'REFRESH_CREATIVE') counts.refreshed++;
    else if (s.action === 'RESCUE_WATCH' || s.action === 'HOLD_AND_MONITOR') counts.watching++;
  }
  return counts;
}

export interface SummaryInput {
  thisWeek: WeeklyMetrics;
  lastWeek: WeeklyMetrics;
  delta: WeeklyDelta;
  bestCampaign: WeeklyCampaignHighlight | null;
  worstCampaign: WeeklyCampaignHighlight | null;
  activeCampaigns: number;
  brainActions: WeeklyReportDTO['brainActions'];
  currency: string;
}

async function generateAISummary(input: SummaryInput): Promise<{ summaryAr: string; recommendationsAr: string[] }> {
  const system = [
    'You are an Arabic marketing advisor writing a weekly performance summary for a Meta Ads merchant.',
    'Based on the data below, write:',
    '1. summaryAr: 3-4 sentences summarizing this week vs last week in clear Arabic',
    '2. recommendationsAr: 3-4 actionable Arabic recommendations based on the data',
    'RULES:',
    '- Write in Modern Standard Arabic with Iraqi/Gulf tone',
    '- Name specific campaigns when relevant',
    '- Use qualitative comparisons (increased, decreased, stable) not exact percentages',
    '- Focus on what the merchant should DO next week',
    '- Never invent data not in the input',
    'Output JSON: { "summaryAr": string, "recommendationsAr": string[] }',
  ].join('\n');

  const result = await generateStructured<{ summaryAr: string; recommendationsAr: string[] }>({
    task: 'report',
    system,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
    parse: (raw) => {
      const obj = JSON.parse(raw);
      if (typeof obj.summaryAr !== 'string') throw new Error('missing summaryAr');
      if (!Array.isArray(obj.recommendationsAr)) throw new Error('missing recommendationsAr');
      return obj;
    },
    maxTokens: 800,
    timeoutMs: 20_000,
    jsonMode: true,
  });

  return result.data;
}

/**
 * Pure. `spendWithheld` set = the window's spend is not verified: no budget-increase / pause advice, no sentence
 * about the spend trend (the spend / cost comparisons are already null in `delta`), and a line that says so. The
 * advice that does not rest on spend — refresh the creative of the weakest CTR, a drop in results — stays.
 */
export function buildDeterministicSummary(
  input: SummaryInput,
  spendWithheld: SpendGateReason | null = null,
): { summaryAr: string; recommendationsAr: string[] } {
  const { thisWeek, delta, bestCampaign, worstCampaign, activeCampaigns, brainActions } = input;

  const parts: string[] = [];
  parts.push(`خلال الأسبوع الماضي أنفقت ${thisWeek.spendDisplay} على ${activeCampaigns} حملة نشطة`);
  // Withheld, not "null نتيجة", when the account mixes purposes and has no
  // single result unit to report (resultSemantics.ts).
  if (thisWeek.results != null) {
    parts.push(`وحققت ${thisWeek.results} نتيجة`);
  }

  if (delta.spendPct != null) {
    if (delta.spendPct > 5) parts.push(`بزيادة في الإنفاق مقارنة بالأسبوع السابق`);
    else if (delta.spendPct < -5) parts.push(`بانخفاض في الإنفاق مقارنة بالأسبوع السابق`);
    else parts.push(`بمستوى إنفاق مشابه للأسبوع السابق`);
  }

  if (thisWeek.ctr != null) {
    parts.push(`تفاعل الإعلانات ${thisWeek.ctr}%`);
  }

  const summaryAr = parts.join('، ') + '.';

  const recs: string[] = [];
  if (bestCampaign && !spendWithheld) {
    recs.push(`حملة «${bestCampaign.campaignName}» هي الأفضل أداءً — فكّر بزيادة ميزانيتها.`);
  }
  if (worstCampaign && worstCampaign.campaignId !== bestCampaign?.campaignId) {
    recs.push(spendWithheld
      ? `حملة «${worstCampaign.campaignName}» تحتاج مراجعة — جدّد إبداعها.`
      : `حملة «${worstCampaign.campaignName}» تحتاج مراجعة — جدّد إبداعها أو أوقفها مؤقتاً.`);
  }
  if (brainActions.paused > 0 && !spendWithheld) {
    recs.push(`تم إيقاف ${brainActions.paused} حملة تلقائياً هذا الأسبوع لحماية الميزانية.`);
  }
  if (delta.resultsPct != null && delta.resultsPct < -10) {
    recs.push(`انخفضت النتائج مقارنة بالأسبوع الماضي — راجع استهداف الجمهور وجودة الإبداعات.`);
  }
  if (spendWithheld) {
    recs.push(spendWithheld === SPEND_SCALE_OVERSCALED
      ? `التوصيات المبنية على الإنفاق (زيادة الميزانية أو الإيقاف أو تكلفة النتيجة) محجوبة لهذا الأسبوع لأن الإنفاق في هذه الفترة مضخّم ×100 عن بيانات Meta الخام.`
      : `التوصيات المبنية على الإنفاق (زيادة الميزانية أو الإيقاف أو تكلفة النتيجة) محجوبة لهذا الأسبوع لأن الإنفاق في هذه الفترة لم يُتحقق منه ببيانات Meta الخام.`);
  } else if (recs.length === 0) {
    recs.push(`أداء حسابك مستقر — استمر في المراقبة وجرّب إبداعات جديدة لتحسين النتائج.`);
  }

  return { summaryAr, recommendationsAr: recs };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
