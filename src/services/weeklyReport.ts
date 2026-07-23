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

export interface WeeklyMetrics {
  spend: number;
  spendDisplay: string;
  results: number;
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
  results: number;
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

  const factor = account.currencyMinorFactor;
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

  const thisWeek = aggregateMetrics(thisWeekStats, factor, currency);
  const lastWeek = aggregateMetrics(lastWeekStats, factor, currency);
  const delta = computeDeltas(thisWeek, lastWeek);

  const campaignPerformance = buildCampaignPerformance(thisWeekStats, snapshots, factor, nameMap);
  const sorted = [...campaignPerformance].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));
  const bestCampaign = sorted[0] ?? null;
  const worstCampaign = sorted.length > 1 ? sorted[sorted.length - 1]! : null;

  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'PAUSED').length;

  const brainActions = countBrainActions(snapshots);

  let summaryAr: string;
  let recommendationsAr: string[];
  let source: 'ai' | 'deterministic' = 'deterministic';

  if (isAIAvailable()) {
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
    });
    summaryAr = det.summaryAr;
    recommendationsAr = det.recommendationsAr;
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

function aggregateMetrics(stats: DailyStatRow[], factor: number, currency: string): WeeklyMetrics {
  let spend = 0, impressions = 0, clicks = 0, results = 0, freqSum = 0, freqCount = 0;

  for (const s of stats) {
    spend += Number(s.spend);
    impressions += Number(s.impressions);
    clicks += Number(s.clicks);
    results += Number(s.messages) + Number(s.purchases) + Number(s.leads);
    if (s.frequency != null) { freqSum += s.frequency; freqCount++; }
  }

  const spendMajor = spend / factor;
  const ctr = impressions > 0 ? +(clicks / impressions * 100).toFixed(2) : null;
  const cpm = impressions > 0 ? +(spendMajor / impressions * 1000).toFixed(2) : null;
  const costPerResult = results > 0 ? +(spendMajor / results).toFixed(2) : null;
  const frequency = freqCount > 0 ? +(freqSum / freqCount).toFixed(2) : null;

  const display = currency === 'IQD'
    ? `${Math.round(spendMajor).toLocaleString()} ${currency}`
    : `${spendMajor.toFixed(2)} ${currency}`;

  return { spend: +spendMajor.toFixed(2), spendDisplay: display, results, impressions, clicks, ctr, cpm, costPerResult, frequency };
}

function computeDeltas(thisWeek: WeeklyMetrics, lastWeek: WeeklyMetrics): WeeklyDelta {
  return {
    spendPct: pctChange(thisWeek.spend, lastWeek.spend),
    resultsPct: pctChange(thisWeek.results, lastWeek.results),
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
): WeeklyCampaignHighlight[] {
  const byCampaign = new Map<string, { spend: number; results: number; impressions: number; clicks: number }>();
  for (const s of stats) {
    const existing = byCampaign.get(s.entityId) ?? { spend: 0, results: 0, impressions: 0, clicks: 0 };
    existing.spend += Number(s.spend);
    existing.results += Number(s.messages) + Number(s.purchases) + Number(s.leads);
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

interface SummaryInput {
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

function buildDeterministicSummary(input: SummaryInput): { summaryAr: string; recommendationsAr: string[] } {
  const { thisWeek, delta, bestCampaign, worstCampaign, activeCampaigns, brainActions } = input;

  const parts: string[] = [];
  parts.push(`خلال الأسبوع الماضي أنفقت ${thisWeek.spendDisplay} على ${activeCampaigns} حملة نشطة`);
  parts.push(`وحققت ${thisWeek.results} نتيجة`);

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
  if (bestCampaign) {
    recs.push(`حملة «${bestCampaign.campaignName}» هي الأفضل أداءً — فكّر بزيادة ميزانيتها.`);
  }
  if (worstCampaign && worstCampaign.campaignId !== bestCampaign?.campaignId) {
    recs.push(`حملة «${worstCampaign.campaignName}» تحتاج مراجعة — جدّد إبداعها أو أوقفها مؤقتاً.`);
  }
  if (brainActions.paused > 0) {
    recs.push(`تم إيقاف ${brainActions.paused} حملة تلقائياً هذا الأسبوع لحماية الميزانية.`);
  }
  if (delta.resultsPct != null && delta.resultsPct < -10) {
    recs.push(`انخفضت النتائج مقارنة بالأسبوع الماضي — راجع استهداف الجمهور وجودة الإبداعات.`);
  }
  if (recs.length === 0) {
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
