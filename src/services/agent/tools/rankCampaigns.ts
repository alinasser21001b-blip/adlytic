// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/rankCampaigns.ts   —  T4
//
//  Focused best-N / worst-N ranking by one metric. Distinct from
//  list_campaigns: this excludes tiny-spend campaigns (< minSpendPctOfTotal)
//  so a 5-cent test campaign doesn't dominate the ranking.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.3 T4
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';
import { HEALTH_ALGORITHM_VERSION } from '../../../engines/health/HealthScoreEngine';

type Metric = 'roas' | 'ctr' | 'cpm' | 'cost_per_message' | 'spend' | 'messages' | 'health';

interface RankCampaignsArgs {
  metric: Metric;
  direction: 'best' | 'worst';
  windowDays: number;
  limit: number;
  minSpendPctOfTotal: number;
}

interface RankedItem {
  rank: number;
  campaignId: string;
  campaignName: string;
  value: number | null;
  valueDisplay: string;
  reasonToRank: string;
}

interface RankCampaignsResult {
  metric: Metric;
  direction: 'best' | 'worst';
  windowDays: number;
  ranked: RankedItem[];
  excluded: number;
}

/** Metrics where higher is better vs where lower is better. Drives the
 *  interpretation of "best" and the Arabic reasonToRank phrasing. */
const HIGHER_IS_BETTER: Record<Metric, boolean> = {
  roas: true,
  ctr: true,
  messages: true,
  health: true,
  cpm: false,
  cost_per_message: false,
  spend: false,   // context-dependent; framed as "highest / lowest spender"
};

export function rankCampaignsHandler(): ToolHandler<RankCampaignsArgs, RankCampaignsResult> {
  return {
    name: 'rank_campaigns',
    description:
      "Rank the workspace's campaigns best-to-worst or worst-to-best by ONE metric. Use for 'أفضل 3 حملات' / 'أسوأ حملات' questions. Automatically excludes campaigns whose spend is below minSpendPctOfTotal of workspace total (default 1%), so a 5-cent test campaign doesn't dominate the ranking. Direction 'best' means top performers for that metric (highest for ctr/roas/messages/health, lowest for cpm/cost_per_message). Direction 'worst' inverts.",
    schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['roas', 'ctr', 'cpm', 'cost_per_message', 'spend', 'messages', 'health'],
        },
        direction: { type: 'string', enum: ['best', 'worst'], default: 'best' },
        windowDays: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        minSpendPctOfTotal: { type: 'number', minimum: 0, maximum: 100, default: 1 },
      },
      required: ['metric'],
      additionalProperties: false,
    },
    cacheTtlSeconds: 60,
    timeoutMs: 5000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      if (!ws) return fail('NOT_FOUND', 'Workspace not found', { retryable: false });
      const account = ws.adAccounts[0];
      if (!account) {
        return ok<RankCampaignsResult>(
          { metric: args.metric, direction: args.direction, windowDays: args.windowDays, ranked: [], excluded: 0 },
          { sourceTable: 'ad_accounts', latestRowDate: null, stalenessMinutes: null },
        );
      }

      const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);

      const campaigns = await prisma.campaign.findMany({
        where: { adAccountId: account.id, status: 'ACTIVE' },
        select: { id: true, name: true },
      });
      if (campaigns.length === 0) {
        return ok<RankCampaignsResult>(
          { metric: args.metric, direction: args.direction, windowDays: args.windowDays, ranked: [], excluded: 0 },
          {
            sourceTable: 'campaigns',
            latestRowDate: null,
            stalenessMinutes: account.lastSyncedAt
              ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
              : null,
          },
        );
      }

      const campaignIds = campaigns.map((c) => c.id);
      const sinceDate = new Date(new Date(Date.now() - args.windowDays * 864e5).toISOString().slice(0, 10));

      const [dailyRows, healthRows] = await Promise.all([
        prisma.dailyStat.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: campaignIds },
            date: { gte: sinceDate },
          },
        }),
        args.metric === 'health'
          ? prisma.healthScore.findMany({
              where: {
                entityType: EntityType.CAMPAIGN,
                entityId: { in: campaignIds },
                algorithmVersion: HEALTH_ALGORITHM_VERSION,
              },
              orderBy: { date: 'desc' },
            })
          : Promise.resolve([]),
      ]);

      const dailyByCampaign = new Map<string, typeof dailyRows>();
      for (const d of dailyRows) {
        const arr = dailyByCampaign.get(d.entityId) ?? [];
        arr.push(d);
        dailyByCampaign.set(d.entityId, arr);
      }

      const healthByCampaign = new Map<string, number>();
      for (const h of healthRows) if (!healthByCampaign.has(h.entityId)) healthByCampaign.set(h.entityId, h.score);

      // Compute total spend for the min-spend filter
      const totalSpend = dailyRows.reduce((a, r) => a + Number(r.spend), 0);
      const minSpendThreshold = (args.minSpendPctOfTotal / 100) * totalSpend;

      let excluded = 0;
      const scored: Array<{ id: string; name: string; value: number | null; spend: number }> = [];
      for (const camp of campaigns) {
        const rows = dailyByCampaign.get(camp.id) ?? [];
        const spend = rows.reduce((a, r) => a + Number(r.spend), 0);
        if (spend < minSpendThreshold && args.metric !== 'health') {
          excluded++;
          continue;
        }
        const value = computeMetric(rows, args.metric, healthByCampaign.get(camp.id) ?? 0, factor);
        // Exclude campaigns where the metric is undefined (null) — can't rank them.
        if (value == null) {
          excluded++;
          continue;
        }
        scored.push({ id: camp.id, name: camp.name, value, spend });
      }

      // Sort: for `best` order by desirability (higher-is-better metrics
      // descending; lower-is-better ascending). For `worst` invert.
      const higherBetter = HIGHER_IS_BETTER[args.metric];
      const bestFirst = higherBetter ? (a: number, b: number) => b - a : (a: number, b: number) => a - b;
      const cmp = args.direction === 'best'
        ? (a: typeof scored[0], b: typeof scored[0]) => bestFirst(a.value ?? 0, b.value ?? 0)
        : (a: typeof scored[0], b: typeof scored[0]) => -bestFirst(a.value ?? 0, b.value ?? 0);
      scored.sort(cmp);
      const limited = scored.slice(0, args.limit);

      const ranked: RankedItem[] = limited.map((s, i) => ({
        rank: i + 1,
        campaignId: s.id,
        campaignName: s.name,
        value: s.value,
        valueDisplay: formatMetric(args.metric, s.value, account.currency, factor),
        reasonToRank: buildReason(args.metric, args.direction, s.value, higherBetter),
      }));

      return ok<RankCampaignsResult>(
        { metric: args.metric, direction: args.direction, windowDays: args.windowDays, ranked, excluded },
        {
          sourceTable: 'daily_stats',
          latestRowDate: dailyRows[dailyRows.length - 1]?.date.toISOString().slice(0, 10) ?? null,
          stalenessMinutes: account.lastSyncedAt
            ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<RankCampaignsArgs, RankCampaignsResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function computeMetric(rows: any[], metric: Metric, health: number, factor: number): number | null {
  if (metric === 'health') return health;
  const spend = rows.reduce((a, r) => a + Number(r.spend), 0);
  const impressions = rows.reduce((a, r) => a + Number(r.impressions), 0);
  const clicks = rows.reduce((a, r) => a + Number(r.clicks), 0);
  const messages = rows.reduce((a, r) => a + Number(r.messages), 0);
  const spendMajor = factor === 1 ? spend : spend / factor;
  switch (metric) {
    case 'spend':
      return spend;
    case 'messages':
      return messages;
    case 'ctr':
      return impressions > 0 ? +(clicks / impressions * 100).toFixed(4) : null;
    case 'cpm':
      return impressions > 0 ? +(spendMajor / impressions * 1000).toFixed(4) : null;
    case 'cost_per_message':
      return messages > 0 ? +(spendMajor / messages).toFixed(4) : null;
    case 'roas': {
      const vals = rows.map((r) => r.roas).filter((v) => v != null) as number[];
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4) : null;
    }
    default:
      return null;
  }
}

function formatMetric(metric: Metric, value: number | null, currency: string, factor: number): string {
  if (value == null) return '—';
  switch (metric) {
    case 'roas':
      return `${value.toFixed(2)}x`;
    case 'ctr':
      return `${value.toFixed(2)}%`;
    case 'health':
      return `${Math.round(value)}/100`;
    case 'messages':
      return Math.round(value).toLocaleString();
    case 'spend': {
      const major = factor === 1 ? value : value / factor;
      return factor === 1 ? `${Math.round(major).toLocaleString()} ${currency}` : `${major.toFixed(2)} ${currency}`;
    }
    case 'cpm':
    case 'cost_per_message':
      return factor === 1 ? `${Math.round(value).toLocaleString()} ${currency}` : `${value.toFixed(2)} ${currency}`;
  }
}

function buildReason(metric: Metric, direction: 'best' | 'worst', value: number | null, higherBetter: boolean): string {
  if (value == null) return '';
  const isBest = direction === 'best';
  const isGoodDirection = isBest === higherBetter;
  const metricArabic: Record<Metric, string> = {
    roas: 'العائد على الإنفاق',
    ctr: 'نسبة النقر',
    cpm: 'تكلفة الوصول لألف شخص',
    cost_per_message: 'تكلفة الرسالة',
    spend: 'الإنفاق',
    messages: 'الرسائل',
    health: 'نقاط الصحة',
  };
  const qual = isGoodDirection ? 'أعلى' : 'الأقل';
  return `${metricArabic[metric]} ${qual} في الحساب`;
}

export type { RankCampaignsArgs, RankCampaignsResult };
void (undefined as unknown as PrismaClient | undefined);
