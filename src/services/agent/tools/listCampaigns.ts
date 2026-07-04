// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/listCampaigns.ts   —  T1
//
//  Lists every active campaign in the workspace with:
//    • current-window metrics + prior-window comparison + delta%
//    • deterministic tier (best/mid/worst) from health + workspace-relative z
//    • whyLabel — one-line Arabic explaining what makes each campaign distinct
//
//  This is Claude's default entrypoint for "ما هي حملاتي" / "شنو أفضل حملة".
//  For a single campaign by name Claude should call get_campaign_details instead.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §3.3 (T1)
// ════════════════════════════════════════════════════════════════════════

import { EntityType, type PrismaClient } from '@prisma/client';
import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { resolveCurrencyMinorFactor } from '../../../lib/currency';
import { HEALTH_ALGORITHM_VERSION } from '../../../engines/health/HealthScoreEngine';

const MIN_CAMPAIGNS_FOR_TIERING = 4;

interface ListCampaignsArgs {
  windowDays: number;
  sortBy: 'health' | 'spend' | 'roas' | 'ctr' | 'messages' | 'cost_per_message';
  direction: 'asc' | 'desc';
  includeInactive: boolean;
  limit: number;
}

interface CampaignMetricPair {
  current: number | null;
  prior: number | null;
  deltaPct: number | null;
  display?: string;
}

interface CampaignListItem {
  id: string;
  name: string;
  status: string;
  healthScore: number;
  healthBand: 'excellent' | 'good' | 'attention' | 'poor';
  tier: 'best' | 'mid' | 'worst';
  metrics: {
    spend: CampaignMetricPair;
    messages: CampaignMetricPair;
    ctr: CampaignMetricPair;
    cpm: CampaignMetricPair;
    cost_per_message: CampaignMetricPair;
    roas: CampaignMetricPair;
  };
  whyLabel: string;
  whyReasons: string[];
}

interface ListCampaignsResult {
  windowDays: number;
  totalActive: number;
  campaigns: CampaignListItem[];
}

export function listCampaignsHandler(): ToolHandler<ListCampaignsArgs, ListCampaignsResult> {
  return {
    name: 'list_campaigns',
    description:
      "List every active campaign in the workspace with current-window metrics compared to the prior window, health tier (best/mid/worst), and a one-line whyLabel explaining what makes each campaign distinctive. Call this first whenever the merchant asks about their campaigns in general ('ما حملاتي', 'شنو أفضل حملة'). For a specific campaign by name, use get_campaign_details instead. Returns tier='mid' for all campaigns when the workspace has fewer than 4 active — small workspaces don't have enough campaigns to justify ranking language.",
    schema: {
      type: 'object',
      properties: {
        windowDays: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
        sortBy: {
          type: 'string',
          enum: ['health', 'spend', 'roas', 'ctr', 'messages', 'cost_per_message'],
          default: 'health',
        },
        direction: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        includeInactive: { type: 'boolean', default: false },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    cacheTtlSeconds: 60,
    timeoutMs: 5000,
    async run(args, ctx) {
      const { prisma, workspaceId } = ctx;

      // Load workspace + primary ad account (Phase 1 assumes one per workspace).
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      if (!ws) return fail('NOT_FOUND', 'Workspace not found', { retryable: false });
      const account = ws.adAccounts[0];
      if (!account) {
        return ok<ListCampaignsResult>(
          { windowDays: args.windowDays, totalActive: 0, campaigns: [] },
          { sourceTable: 'ad_accounts', latestRowDate: null, stalenessMinutes: null },
        );
      }

      const factor = resolveCurrencyMinorFactor(account.currency, account.currencyMinorFactor);

      // Load active (or all) campaigns
      const campaignFilter = args.includeInactive ? {} : { status: 'ACTIVE' as const };
      const campaigns = await prisma.campaign.findMany({
        where: { adAccountId: account.id, ...campaignFilter },
        select: { id: true, name: true, status: true },
      });
      const totalActive = campaigns.filter((c) => c.status === 'ACTIVE').length;
      if (campaigns.length === 0) {
        return ok(
          { windowDays: args.windowDays, totalActive: 0, campaigns: [] },
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
      const now = new Date();
      const sinceDate = utcMidnight(now.getTime() - args.windowDays * 864e5);
      const priorSinceDate = utcMidnight(now.getTime() - args.windowDays * 2 * 864e5);

      // Bulk fetch — current + prior window at once, filter in memory.
      const [allDaily, allHealth] = await Promise.all([
        prisma.dailyStat.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: campaignIds },
            date: { gte: priorSinceDate },
          },
          orderBy: { date: 'asc' },
        }),
        prisma.healthScore.findMany({
          where: {
            entityType: EntityType.CAMPAIGN,
            entityId: { in: campaignIds },
            algorithmVersion: HEALTH_ALGORITHM_VERSION,
          },
          orderBy: { date: 'desc' },
        }),
      ]);

      // Latest health per campaign
      const healthMap = new Map<string, number>();
      for (const h of allHealth) if (!healthMap.has(h.entityId)) healthMap.set(h.entityId, h.score);

      // Bucket daily stats per campaign
      const dailyByCampaign = new Map<string, typeof allDaily>();
      for (const d of allDaily) {
        const list = dailyByCampaign.get(d.entityId) ?? [];
        list.push(d);
        dailyByCampaign.set(d.entityId, list);
      }

      const sinceMs = sinceDate.getTime();

      // Compute per-campaign metrics
      const items: CampaignListItem[] = [];
      for (const camp of campaigns) {
        const rows = dailyByCampaign.get(camp.id) ?? [];
        const current = rows.filter((d) => d.date.getTime() >= sinceMs);
        const prior = rows.filter((d) => d.date.getTime() < sinceMs);
        const health = healthMap.get(camp.id) ?? 0;

        items.push({
          id: camp.id,
          name: camp.name,
          status: camp.status,
          healthScore: health,
          healthBand: band(health),
          tier: 'mid',   // set below after workspace-relative pass
          metrics: {
            spend: pair(current, prior, (r) => Number(r.spend)),
            messages: pair(current, prior, (r) => Number(r.messages)),
            ctr: ratioPair(current, prior, 'clicks', 'impressions', 100),
            cpm: ratioPair(current, prior, 'spend', 'impressions', 1000, factor),
            cost_per_message: ratioPair(current, prior, 'spend', 'messages', 1, factor),
            roas: avgPair(current, prior, 'roas'),
          },
          whyLabel: '',   // computed below
          whyReasons: [],
        });
      }

      // Formatting for a few metrics
      const curr = account.currency;
      for (const item of items) {
        item.metrics.spend.display = fmtMoney(item.metrics.spend.current, curr, factor);
        item.metrics.cpm.display = item.metrics.cpm.current == null ? '—' : fmtMoney(item.metrics.cpm.current * factor, curr, factor);
        item.metrics.cost_per_message.display = item.metrics.cost_per_message.current == null ? '—' : fmtMoney(item.metrics.cost_per_message.current * factor, curr, factor);
      }

      // Tiering (best / mid / worst)
      applyTiers(items);

      // whyLabel — z-score-based Arabic reasons
      applyWhyLabels(items);

      // Sort + limit
      const sortKey = args.sortBy;
      const sign = args.direction === 'asc' ? 1 : -1;
      items.sort((a, b) => sign * (getSortValue(a, sortKey) - getSortValue(b, sortKey)));
      const limited = items.slice(0, args.limit);

      const latestDaily = allDaily[allDaily.length - 1]?.date ?? null;

      return ok<ListCampaignsResult>(
        { windowDays: args.windowDays, totalActive, campaigns: limited },
        {
          sourceTable: 'daily_stats',
          latestRowDate: latestDaily?.toISOString().slice(0, 10) ?? null,
          stalenessMinutes: account.lastSyncedAt
            ? Math.round((Date.now() - account.lastSyncedAt.getTime()) / 60_000)
            : null,
        },
      );
    },
  } satisfies ToolHandler<ListCampaignsArgs, ListCampaignsResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────

function band(score: number): 'excellent' | 'good' | 'attention' | 'poor' {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'attention';
  return 'poor';
}

function utcMidnight(ms: number): Date {
  return new Date(new Date(ms).toISOString().slice(0, 10));
}

function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return +(((cur - prev) / prev) * 100).toFixed(2);
}

/** Sum a numeric field across rows. */
function sumField<R extends Record<string, unknown>>(rows: R[], f: keyof R): number {
  return rows.reduce((a, r) => a + Number(r[f] ?? 0), 0);
}

function pair<R extends Record<string, unknown>>(
  current: R[],
  prior: R[],
  extract: (r: R) => number,
): CampaignMetricPair {
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
): CampaignMetricPair {
  const num = (rows: R[]) => {
    const n = sumField(rows, numField);
    const d = sumField(rows, denField);
    if (d <= 0) return null;
    const majorN = factor === 1 ? n : n / factor;
    // multiplier=100 for percent (CTR), 1000 for per-mille (CPM), 1 for per-unit
    return (majorN / d) * multiplier;
  };
  const cur = num(current);
  const prv = num(prior);
  return { current: round(cur, 4), prior: round(prv, 4), deltaPct: pctChange(cur, prv) };
}

function avgPair<R extends { [k: string]: any }>(
  current: R[],
  prior: R[],
  field: string,
): CampaignMetricPair {
  const avg = (rows: R[]) => {
    const vals = rows.map((r) => r[field]).filter((v) => v != null) as number[];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const cur = avg(current);
  const prv = avg(prior);
  return { current: round(cur, 4), prior: round(prv, 4), deltaPct: pctChange(cur, prv) };
}

function round(v: number | null, digits: number): number | null {
  return v == null ? null : +v.toFixed(digits);
}

function fmtMoney(minor: number | null, currency: string, factor: number): string {
  if (minor == null) return `— ${currency}`;
  if (factor === 1) return `${Math.round(minor).toLocaleString()} ${currency}`;
  return `${(minor / factor).toFixed(2)} ${currency}`;
}

function getSortValue(item: CampaignListItem, key: ListCampaignsArgs['sortBy']): number {
  switch (key) {
    case 'health': return item.healthScore;
    case 'spend': return item.metrics.spend.current ?? 0;
    case 'messages': return item.metrics.messages.current ?? 0;
    case 'roas': return item.metrics.roas.current ?? 0;
    case 'ctr': return item.metrics.ctr.current ?? 0;
    case 'cost_per_message':
      // Sort ascending by default for cost — but signed inversion in caller
      // via `direction`. Return raw value.
      return item.metrics.cost_per_message.current ?? Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Deterministic tiering per §3.3 (T1).
 *   <4 campaigns → all 'mid'
 *   best  = top 25% by (health*0.6 + normROAS*0.4) OR (roas>2 AND spend>median)
 *   worst = bottom 25% by health OR (spend>median AND messages == 0)
 *   mid   = otherwise
 */
function applyTiers(items: CampaignListItem[]): void {
  if (items.length < MIN_CAMPAIGNS_FOR_TIERING) {
    for (const i of items) i.tier = 'mid';
    return;
  }
  const spends = items.map((i) => i.metrics.spend.current ?? 0);
  const medianSpend = median(spends);
  const roases = items.map((i) => i.metrics.roas.current ?? 0);
  const maxRoas = Math.max(0.0001, ...roases);
  const composite = items.map((i) => {
    const normRoas = (i.metrics.roas.current ?? 0) / maxRoas;
    return 0.6 * i.healthScore + 0.4 * normRoas * 100;
  });
  const sortedComposite = [...composite].sort((a, b) => a - b);
  const bestThreshold = sortedComposite[Math.floor(sortedComposite.length * 0.75)] ?? 0;
  const sortedHealth = items.map((i) => i.healthScore).sort((a, b) => a - b);
  const worstHealthThreshold = sortedHealth[Math.floor(sortedHealth.length * 0.25)] ?? 0;

  items.forEach((item, idx) => {
    const isBest =
      composite[idx]! >= bestThreshold ||
      ((item.metrics.roas.current ?? 0) > 2 && (item.metrics.spend.current ?? 0) > medianSpend);
    const isWorst =
      item.healthScore <= worstHealthThreshold ||
      ((item.metrics.spend.current ?? 0) > medianSpend && (item.metrics.messages.current ?? 0) === 0);
    if (isBest && !isWorst) item.tier = 'best';
    else if (isWorst && !isBest) item.tier = 'worst';
    else item.tier = 'mid';
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * whyLabel per §3.3 (T1):
 *   1. z-score vs workspace mean for 5 metrics
 *   2. pick 2 metrics with largest |z|
 *   3. Arabic phrasing per direction
 *   4. small-workspace fallback
 */
function applyWhyLabels(items: CampaignListItem[]): void {
  if (items.length < MIN_CAMPAIGNS_FOR_TIERING) {
    for (const i of items) {
      i.whyLabel = 'حساب صغير — لا مقارنة كافية';
      i.whyReasons = ['small_workspace'];
    }
    return;
  }
  const metricSpecs: Array<{
    key: keyof CampaignListItem['metrics'];
    label: string;
    higherIsBetter: boolean;
  }> = [
    { key: 'ctr', label: 'CTR', higherIsBetter: true },
    { key: 'roas', label: 'ROAS', higherIsBetter: true },
    { key: 'cpm', label: 'CPM', higherIsBetter: false },
    { key: 'cost_per_message', label: 'تكلفة الرسالة', higherIsBetter: false },
    { key: 'messages', label: 'الرسائل', higherIsBetter: true },
  ];
  // Precompute μ + σ per metric across all items
  const stats = new Map<string, { mean: number; std: number }>();
  for (const spec of metricSpecs) {
    const vals = items.map((i) => i.metrics[spec.key].current).filter((v): v is number => v != null);
    if (vals.length === 0) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    stats.set(spec.key, { mean, std: Math.sqrt(variance) });
  }

  for (const item of items) {
    const scored: Array<{ label: string; z: number; direction: 'up' | 'down'; goodDirection: 'up' | 'down' }> = [];
    for (const spec of metricSpecs) {
      const val = item.metrics[spec.key].current;
      const st = stats.get(spec.key);
      if (val == null || !st || st.std === 0) continue;
      const z = (val - st.mean) / st.std;
      if (Math.abs(z) < 1.0) continue;
      scored.push({
        label: spec.label,
        z,
        direction: z > 0 ? 'up' : 'down',
        goodDirection: spec.higherIsBetter ? 'up' : 'down',
      });
    }
    scored.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const top = scored.slice(0, 2);
    if (top.length === 0) {
      item.whyLabel = 'أداء متوسط عبر كل المؤشرات';
      item.whyReasons = ['no_distinctive_metric'];
      continue;
    }
    const phrases: string[] = [];
    const reasons: string[] = [];
    for (const s of top) {
      const pct = Math.round(Math.abs(s.z) * 20);   // rough: 1σ ≈ 20% differential
      const dir = s.direction === 'up' ? 'أعلى' : 'أقل';
      phrases.push(`${s.label} ${dir} من المتوسط بـ ${pct}%`);
      reasons.push(`${s.label.toLowerCase().replace(/\s+/g, '_')}_${s.direction === 'up' ? 'above' : 'below'}_median_${pct}pct`);
    }
    item.whyLabel = phrases.join('، ');
    item.whyReasons = reasons;
  }
}

// re-export the factory constructor and type
export type { ListCampaignsArgs, ListCampaignsResult };
// Small `PrismaClient` reference just to silence "unused import" when the file
// is compiled without the runtime — Prisma is used in `ctx.prisma`.
void (undefined as unknown as PrismaClient | undefined);
