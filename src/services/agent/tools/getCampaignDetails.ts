// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/getCampaignDetails.ts   —  T2
//
//  Deep dive into ONE campaign. Returns:
//    • current-window metrics + prior-window comparison + delta%
//    • HISTORICAL BASELINE (60-180 days) — the "normal for this campaign"
//    • vs-baseline delta — the killer signal for "unusual today?"
//    • topIssues + topRecommendations from campaignIntelligenceReport
//    • latestBrainAction from campaignBrainSnapshot
//    • spendPacing — today's spend as % of daily budget + burn rate
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.3 T2
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';

interface GetCampaignDetailsArgs {
  campaignId: string;
  windowDays: number;
  baselineDays: number;
}

interface MetricPair {
  current: number | null;
  prior: number | null;
  deltaPct: number | null;
}

interface CampaignDetailsResult {
  campaign: {
    id: string;
    name: string;
    status: string;
    objective: string;
    startedAt: string | null;
    dailyBudget: number | null;
  };
  windowMetrics: {
    spend: MetricPair;
    messages: MetricPair;
    ctr: MetricPair;
    cpm: MetricPair;
    cost_per_message: MetricPair;
    roas: MetricPair;
  };
  historicalBaseline: {
    days: number;
    ctrMean: number | null;
    cpmMean: number | null;
    dailySpendMean: number;
    dailyMessagesMean: number;
    costPerMessageMean: number | null;
  };
  /** Delta of current-window metrics vs the historical baseline. */
  vsBaseline: {
    ctrPct: number | null;
    cpmPct: number | null;
    spendPct: number | null;
    messagesPct: number | null;
    costPerMessagePct: number | null;
  };
  topIssues: Array<{ code: string; severity: string; evidence: string[]; strength: number }>;
  topRecommendations: Array<{ text: string; priority: string; strength: number }>;
  latestBrainAction: { action: string; priority: string; date: string } | null;
  spendPacing: {
    todaySpend: number;
    dailyBudget: number | null;
    pctOfBudget: number | null;
    burnRatePerHour: number | null;
  };
}

export function getCampaignDetailsHandler(): ToolHandler<GetCampaignDetailsArgs, CampaignDetailsResult> {
  return {
    name: 'get_campaign_details',
    description:
      "Deep dive into ONE campaign. Returns current-window metrics with prior comparison, plus a HISTORICAL BASELINE (60+ days) and vs-baseline delta so you can say 'CTR اليوم أقل بـ 33% من خط الأساس التاريخي للحملة نفسها'. Also returns detected issues, top recommendations from the intelligence engine, latest brain-decided action, and today's spend pacing. Use when the merchant asks about ONE campaign by name (not the workspace overall). If you don't know the campaignId, call list_campaigns first.",
    schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', minLength: 1 },
        windowDays: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
        baselineDays: { type: 'integer', minimum: 30, maximum: 180, default: 90 },
      },
      required: ['campaignId'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 60,
    timeoutMs: 5000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      // Scope check: campaign must belong to this workspace via ad_accounts.
      const campaign = await prisma.campaign.findFirst({
        where: { id: args.campaignId, adAccount: { workspaceId } },
        include: { adAccount: true },
      });
      if (!campaign) {
        return fail('NOT_FOUND', `Campaign "${args.campaignId}" not found in this workspace`, {
          field: 'campaignId',
          retryable: false,
          suggestion: 'Call list_campaigns to see valid campaign ids in this workspace.',
        });
      }

      const account = campaign.adAccount;
      const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);
      const now = new Date();
      const sinceCurrent = utcMidnight(now.getTime() - args.windowDays * 864e5);
      const sincePrior = utcMidnight(now.getTime() - args.windowDays * 2 * 864e5);
      const sinceBaseline = utcMidnight(now.getTime() - args.baselineDays * 864e5);

      // Bulk fetch all needed rows in parallel.
      const [dailyRows, latestReport, latestSnapshot, todayStat] = await Promise.all([
        prisma.dailyStat.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: campaign.id,
            date: { gte: sinceBaseline },
          },
          orderBy: { date: 'asc' },
        }),
        // Reports are scoped by adAccountId (one per (account, date)); issues
        // and recommendations for THIS campaign are children keyed on entityId.
        prisma.campaignIntelligenceReport.findFirst({
          where: { adAccountId: account.id },
          orderBy: { date: 'desc' },
        }),
        prisma.campaignBrainSnapshot.findFirst({
          where: { campaignId: campaign.id },
          orderBy: { tickDate: 'desc' },
        }),
        prisma.dailyStat.findFirst({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: campaign.id,
            date: utcMidnight(now.getTime()),
          },
        }),
      ]);

      const [issueRows, recRows] = latestReport
        ? await Promise.all([
            prisma.campaignIssue.findMany({
              where: { reportId: latestReport.id, entityId: campaign.id },
              orderBy: { strength: 'desc' },
              take: 3,
            }),
            prisma.campaignRecommendation.findMany({
              where: { reportId: latestReport.id, entityId: campaign.id },
              orderBy: { strength: 'desc' },
              take: 3,
            }),
          ])
        : [[], []];

      // Bucket daily rows into three ranges.
      const current: typeof dailyRows = [];
      const prior: typeof dailyRows = [];
      const baseline: typeof dailyRows = [];
      const priorEnd = sinceCurrent.getTime();
      for (const d of dailyRows) {
        const t = d.date.getTime();
        if (t >= sinceCurrent.getTime()) current.push(d);
        else if (t >= sincePrior.getTime()) prior.push(d);
        if (t < sinceCurrent.getTime()) baseline.push(d);
        void priorEnd;
      }

      const windowMetrics = {
        spend: pair(current, prior, (r) => Number(r.spend)),
        messages: pair(current, prior, (r) => Number(r.messages)),
        ctr: ratioPair(current, prior, 'clicks', 'impressions', 100),
        cpm: ratioPair(current, prior, 'spend', 'impressions', 1000, factor),
        cost_per_message: ratioPair(current, prior, 'spend', 'messages', 1, factor),
        roas: avgPair(current, prior, 'roas'),
      };

      // Baseline aggregates
      const baselineDays = Math.max(1, baseline.length);
      const baselineSpend = baseline.reduce((a, r) => a + Number(r.spend), 0);
      const baselineMessages = baseline.reduce((a, r) => a + Number(r.messages), 0);
      const baselineImpressions = baseline.reduce((a, r) => a + Number(r.impressions), 0);
      const baselineClicks = baseline.reduce((a, r) => a + Number(r.clicks), 0);
      const baselineSpendMajor = factor === 1 ? baselineSpend : baselineSpend / factor;

      const historicalBaseline = {
        days: baselineDays,
        ctrMean: baselineImpressions > 0 ? +(baselineClicks / baselineImpressions * 100).toFixed(4) : null,
        cpmMean: baselineImpressions > 0 ? +(baselineSpendMajor / baselineImpressions * 1000).toFixed(4) : null,
        dailySpendMean: +(baselineSpend / baselineDays).toFixed(2),
        dailyMessagesMean: +(baselineMessages / baselineDays).toFixed(2),
        costPerMessageMean: baselineMessages > 0 ? +(baselineSpendMajor / baselineMessages).toFixed(4) : null,
      };

      const currentDays = Math.max(1, current.length);
      const currentDailySpend = (windowMetrics.spend.current ?? 0) / currentDays;
      const currentDailyMessages = (windowMetrics.messages.current ?? 0) / currentDays;

      const vsBaseline = {
        ctrPct: pctChange(windowMetrics.ctr.current, historicalBaseline.ctrMean),
        cpmPct: pctChange(windowMetrics.cpm.current, historicalBaseline.cpmMean),
        spendPct: pctChange(currentDailySpend, historicalBaseline.dailySpendMean),
        messagesPct: pctChange(currentDailyMessages, historicalBaseline.dailyMessagesMean),
        costPerMessagePct: pctChange(windowMetrics.cost_per_message.current, historicalBaseline.costPerMessageMean),
      };

      // Issues + recommendations from V5 report
      const topIssues = issueRows.map((i) => ({
        code: i.issueCode,
        severity: i.severity,
        evidence: i.evidence,
        strength: i.strength,
      }));
      const topRecommendations = recRows.map((r) => ({
        text: r.text,
        priority: r.priority,
        strength: r.strength,
      }));

      const latestBrainAction = latestSnapshot
        ? {
            action: latestSnapshot.action,
            priority: latestSnapshot.priority,
            date: latestSnapshot.tickDate.toISOString().slice(0, 10),
          }
        : null;

      // Spend pacing
      const todaySpend = Number(todayStat?.spend ?? 0);
      const dailyBudget = campaign.dailyBudget != null ? Number(campaign.dailyBudget) : null;
      const pctOfBudget = dailyBudget && dailyBudget > 0 ? +(todaySpend / dailyBudget * 100).toFixed(1) : null;
      // Burn rate: today's spend so far divided by hours elapsed today (approx).
      const hoursSinceMidnight = Math.max(0.1, (Date.now() - utcMidnight(now.getTime()).getTime()) / 3.6e6);
      const burnRatePerHour = +(todaySpend / hoursSinceMidnight).toFixed(2);

      const spendPacing = {
        todaySpend,
        dailyBudget,
        pctOfBudget,
        burnRatePerHour,
      };

      const latestRowDate = dailyRows.length > 0 ? dailyRows[dailyRows.length - 1]!.date.toISOString().slice(0, 10) : null;

      return ok<CampaignDetailsResult>(
        {
          campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective ?? '',
            // Campaign model has no explicit start_time; use createdAt as a proxy.
            startedAt: campaign.createdAt.toISOString(),
            dailyBudget,
          },
          windowMetrics,
          historicalBaseline,
          vsBaseline,
          topIssues,
          topRecommendations,
          latestBrainAction,
          spendPacing,
        },
        {
          sourceTable: 'daily_stats',
          latestRowDate,
          stalenessMinutes: account.lastSyncedAt
            ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<GetCampaignDetailsArgs, CampaignDetailsResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return +(((cur - prev) / prev) * 100).toFixed(2);
}

function pair<R extends Record<string, unknown>>(
  current: R[],
  prior: R[],
  extract: (r: R) => number,
): MetricPair {
  const cur = current.reduce((a, r) => a + extract(r), 0);
  const prv = prior.reduce((a, r) => a + extract(r), 0);
  return { current: cur, prior: prv, deltaPct: pctChange(cur, prv) };
}

function ratioPair<R extends { [k: string]: any }>(
  current: R[],
  prior: R[],
  numField: string,
  denField: string,
  multiplier: number,
  factor = 1,
): MetricPair {
  const num = (rows: R[]) => {
    const n = rows.reduce((a, r) => a + Number(r[numField] ?? 0), 0);
    const d = rows.reduce((a, r) => a + Number(r[denField] ?? 0), 0);
    if (d <= 0) return null;
    const majorN = factor === 1 ? n : n / factor;
    return (majorN / d) * multiplier;
  };
  const cur = num(current);
  const prv = num(prior);
  return {
    current: cur == null ? null : +cur.toFixed(4),
    prior: prv == null ? null : +prv.toFixed(4),
    deltaPct: pctChange(cur, prv),
  };
}

function avgPair<R extends { [k: string]: any }>(
  current: R[],
  prior: R[],
  field: string,
): MetricPair {
  const avg = (rows: R[]) => {
    const vals = rows.map((r) => r[field]).filter((v) => v != null) as number[];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const cur = avg(current);
  const prv = avg(prior);
  return {
    current: cur == null ? null : +cur.toFixed(4),
    prior: prv == null ? null : +prv.toFixed(4),
    deltaPct: pctChange(cur, prv),
  };
}

export type { GetCampaignDetailsArgs, CampaignDetailsResult };
void (undefined as unknown as PrismaClient | undefined);
