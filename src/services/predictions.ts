// ════════════════════════════════════════════════════════════════════════
//  src/services/predictions.ts
//
//  Deterministic predictions computed from Brain snapshots + daily stats.
//  No AI calls — pure math from existing data. Two prediction types:
//
//    1. Budget Exhaustion — burn rate × remaining budget → hours until depleted
//    2. Creative Fatigue — CTR decline trend → days until threshold breach
//
//  These compute on every dashboard load from cached Brain data (fast).
// ════════════════════════════════════════════════════════════════════════

import { type PrismaClient, EntityType } from '@prisma/client';

export interface BudgetPrediction {
  campaignId: string;
  campaignName: string;
  dailyBudgetMajor: number;
  spentTodayMajor: number;
  burnRatePerHour: number;
  hoursUntilExhaustion: number | null;
  exhaustionTime: string | null;
  severity: 'critical' | 'warning' | 'safe';
}

export interface FatiguePrediction {
  campaignId: string;
  campaignName: string;
  currentCtr: number;
  baselineCtr: number;
  ctrDeclineDays: number;
  daysUntilThreshold: number | null;
  severity: 'critical' | 'warning' | 'safe';
}

export interface PredictionsDTO {
  budgetExhaustion: BudgetPrediction[];
  creativeFatigue: FatiguePrediction[];
  generatedAt: string;
}

export async function computePredictions(
  prisma: PrismaClient,
  workspaceId: string,
  adAccountId: string,
  currency: string,
  currencyMinorFactor: number,
): Promise<PredictionsDTO> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId, status: 'ACTIVE' },
    select: { id: true, name: true },
  });
  if (campaigns.length === 0) {
    return { budgetExhaustion: [], creativeFatigue: [], generatedAt: now.toISOString() };
  }

  const campaignIds = campaigns.map(c => c.id);
  const nameMap = new Map(campaigns.map(c => [c.id, c.name]));

  const [snapshots, todayStats, recentStats] = await Promise.all([
    prisma.campaignBrainSnapshot.findMany({
      where: { workspaceId, tickDate: today },
      select: { campaignId: true, payload: true },
    }),

    prisma.dailyStat.findMany({
      where: {
        entityType: EntityType.CAMPAIGN,
        entityId: { in: campaignIds },
        date: today,
      },
      select: { entityId: true, spend: true },
    }),

    prisma.dailyStat.findMany({
      where: {
        entityType: EntityType.CAMPAIGN,
        entityId: { in: campaignIds },
        date: { gte: daysAgo(7) },
      },
      select: { entityId: true, date: true, impressions: true, clicks: true, spend: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const budgetExhaustion = computeBudgetExhaustion(
    snapshots, todayStats, now, currencyMinorFactor, nameMap,
  );

  const creativeFatigue = computeCreativeFatigue(
    snapshots, recentStats, nameMap,
  );

  return {
    budgetExhaustion: budgetExhaustion.slice(0, 5),
    creativeFatigue: creativeFatigue.slice(0, 5),
    generatedAt: now.toISOString(),
  };
}

function computeBudgetExhaustion(
  snapshots: Array<{ campaignId: string; payload: unknown }>,
  todayStats: Array<{ entityId: string; spend: bigint }>,
  now: Date,
  factor: number,
  nameMap: Map<string, string>,
): BudgetPrediction[] {
  const predictions: BudgetPrediction[] = [];
  const spendMap = new Map<string, number>();
  for (const s of todayStats) {
    spendMap.set(s.entityId, Number(s.spend) / factor);
  }

  for (const snap of snapshots) {
    const payload = snap.payload as Record<string, unknown>;
    const campaignName = nameMap.get(snap.campaignId) ?? String(payload['campaignName'] ?? '');

    const v2 = payload['v2'] as { velocity?: { burnRate?: number } } | undefined;
    const burnRatePerHour = v2?.velocity?.burnRate ?? 0;
    if (burnRatePerHour <= 0) continue;

    const dailyBudgetEstimate = burnRatePerHour * 24;
    const spentToday = spendMap.get(snap.campaignId) ?? 0;
    const remaining = Math.max(0, dailyBudgetEstimate - spentToday);

    const hoursUntilExhaustion = remaining > 0 ? remaining / burnRatePerHour : 0;
    const exhaustionTime = hoursUntilExhaustion > 0
      ? new Date(now.getTime() + hoursUntilExhaustion * 3600_000).toISOString()
      : null;

    const severity: BudgetPrediction['severity'] =
      hoursUntilExhaustion <= 2 ? 'critical' :
      hoursUntilExhaustion <= 6 ? 'warning' : 'safe';

    if (severity === 'safe') continue;

    predictions.push({
      campaignId: snap.campaignId,
      campaignName,
      dailyBudgetMajor: +dailyBudgetEstimate.toFixed(2),
      spentTodayMajor: +spentToday.toFixed(2),
      burnRatePerHour: +burnRatePerHour.toFixed(2),
      hoursUntilExhaustion: +hoursUntilExhaustion.toFixed(1),
      exhaustionTime,
      severity,
    });
  }

  return predictions.sort((a, b) => (a.hoursUntilExhaustion ?? 99) - (b.hoursUntilExhaustion ?? 99));
}

function computeCreativeFatigue(
  snapshots: Array<{ campaignId: string; payload: unknown }>,
  recentStats: Array<{ entityId: string; date: Date; impressions: bigint; clicks: bigint; spend: bigint }>,
  nameMap: Map<string, string>,
): FatiguePrediction[] {
  const predictions: FatiguePrediction[] = [];

  const byCampaign = new Map<string, Array<{ date: Date; ctr: number }>>();
  for (const s of recentStats) {
    const impressions = Number(s.impressions);
    if (impressions < 100) continue;
    const ctr = (Number(s.clicks) / impressions) * 100;
    const arr = byCampaign.get(s.entityId) ?? [];
    arr.push({ date: s.date, ctr });
    byCampaign.set(s.entityId, arr);
  }

  for (const snap of snapshots) {
    const payload = snap.payload as Record<string, unknown>;
    const campaignName = nameMap.get(snap.campaignId) ?? String(payload['campaignName'] ?? '');
    const physics = payload['physics'] as { ctr?: { value?: number; baseline?: number } } | undefined;
    if (!physics?.ctr) continue;

    const currentCtr = physics.ctr.value ?? 0;
    const baselineCtr = physics.ctr.baseline ?? 0;
    if (baselineCtr <= 0 || currentCtr <= 0) continue;

    const history = byCampaign.get(snap.campaignId);
    if (!history || history.length < 3) continue;

    const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
    const declineDays = countConsecutiveDecline(sorted.map(s => s.ctr));

    if (declineDays < 2) continue;

    const avgDailyDecline = (sorted[0]!.ctr - sorted[sorted.length - 1]!.ctr) / sorted.length;
    const threshold = baselineCtr * 0.5;
    const daysUntilThreshold = avgDailyDecline > 0
      ? Math.ceil((currentCtr - threshold) / avgDailyDecline)
      : null;

    const severity: FatiguePrediction['severity'] =
      declineDays >= 5 || (daysUntilThreshold != null && daysUntilThreshold <= 2) ? 'critical' :
      declineDays >= 3 || (daysUntilThreshold != null && daysUntilThreshold <= 5) ? 'warning' : 'safe';

    if (severity === 'safe') continue;

    predictions.push({
      campaignId: snap.campaignId,
      campaignName,
      currentCtr: +currentCtr.toFixed(2),
      baselineCtr: +baselineCtr.toFixed(2),
      ctrDeclineDays: declineDays,
      daysUntilThreshold,
      severity,
    });
  }

  return predictions.sort((a, b) => (a.daysUntilThreshold ?? 99) - (b.daysUntilThreshold ?? 99));
}

function countConsecutiveDecline(values: number[]): number {
  let count = 0;
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i]! < values[i - 1]!) count++;
    else break;
  }
  return count;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
