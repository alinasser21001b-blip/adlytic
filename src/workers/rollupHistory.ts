// ════════════════════════════════════════════════════════════════════════
//  src/workers/rollupHistory.ts
//
//  Low-frequency background job: upsert CampaignHistoryRollup rows per
//  (workspaceId, objective, windowKey). Never runs on user/AI request paths (H-10).
// ════════════════════════════════════════════════════════════════════════

import type { CampaignHistoryWindowKey, PrismaClient } from '@prisma/client';
import {
  HISTORY_OBJECTIVE_ALL,
  HISTORY_WINDOW_KEYS,
  type HistoryWindowKey,
} from '../types/campaignHistory';

export interface SnapshotForRollup {
  objective: string | null;
  finalRoas: number | null;
  lifetimeSpendMinor: bigint;
  revenueMinor: bigint;
  messages: bigint;
  purchases: bigint;
  currency: string;
  currencyMinorFactor: number;
  endedAt: Date | null;
}

export interface RollupAggregate {
  campaignCount: number;
  avgRoas: number | null;
  weightedRoas: number | null;
  avgCostPerMsgMinor: bigint | null;
  totalSpendMinor: bigint;
  totalRevenueMinor: bigint;
  totalMessages: bigint;
  totalPurchases: bigint;
  currency: string | null;
  currencyMinorFactor: number | null;
}

const WINDOW_DAYS: Record<Exclude<HistoryWindowKey, 'ALL_TIME'>, number> = {
  LAST_90D: 90,
  LAST_30D: 30,
};

/** Closed-set window cutoff; ALL_TIME returns null (no endedAt filter). */
export function windowCutoff(windowKey: HistoryWindowKey, now: Date): Date | null {
  if (windowKey === 'ALL_TIME') return null;
  const days = WINDOW_DAYS[windowKey];
  return new Date(now.getTime() - days * 86_400_000);
}

/** Map nullable snapshot objective to rollup storage key (§2.4 sentinel). */
export function rollupObjectiveKey(objective: string | null | undefined): string {
  return objective ?? HISTORY_OBJECTIVE_ALL;
}

export function filterSnapshotsForCohort(
  snapshots: SnapshotForRollup[],
  objective: string,
  windowKey: HistoryWindowKey,
  now: Date,
): SnapshotForRollup[] {
  const cutoff = windowCutoff(windowKey, now);
  return snapshots.filter((snapshot) => {
    if (objective !== HISTORY_OBJECTIVE_ALL && snapshot.objective !== objective) {
      return false;
    }
    if (cutoff != null) {
      if (snapshot.endedAt == null || snapshot.endedAt < cutoff) return false;
    }
    return true;
  });
}

function dominantCurrency(
  snapshots: SnapshotForRollup[],
): { currency: string; currencyMinorFactor: number } | null {
  if (snapshots.length === 0) return null;

  const spendByCurrency = new Map<string, { spend: bigint; factor: number }>();
  for (const snapshot of snapshots) {
    const existing = spendByCurrency.get(snapshot.currency);
    if (existing) {
      existing.spend += snapshot.lifetimeSpendMinor;
    } else {
      spendByCurrency.set(snapshot.currency, {
        spend: snapshot.lifetimeSpendMinor,
        factor: snapshot.currencyMinorFactor,
      });
    }
  }

  let best: { currency: string; spend: bigint; factor: number } | null = null;
  for (const [currency, { spend, factor }] of spendByCurrency) {
    if (best == null || spend > best.spend) {
      best = { currency, spend, factor };
    }
  }
  return best ? { currency: best.currency, currencyMinorFactor: best.factor } : null;
}

/** Aggregate matching snapshots — sums already-scaled minor units; no re-scale (H-6/H-7). */
export function aggregateSnapshots(snapshots: SnapshotForRollup[]): RollupAggregate {
  let totalSpendMinor = 0n;
  let totalRevenueMinor = 0n;
  let totalMessages = 0n;
  let totalPurchases = 0n;
  const roasValues: number[] = [];

  for (const snapshot of snapshots) {
    totalSpendMinor += snapshot.lifetimeSpendMinor;
    totalRevenueMinor += snapshot.revenueMinor;
    totalMessages += snapshot.messages;
    totalPurchases += snapshot.purchases;
    if (snapshot.finalRoas != null) roasValues.push(snapshot.finalRoas);
  }

  const avgRoas =
    roasValues.length > 0
      ? roasValues.reduce((sum, value) => sum + value, 0) / roasValues.length
      : null;

  const weightedRoas =
    totalSpendMinor > 0n
      ? Number(totalRevenueMinor) / Number(totalSpendMinor)
      : null;

  const avgCostPerMsgMinor =
    totalMessages > 0n ? totalSpendMinor / totalMessages : null;

  const dominant = dominantCurrency(snapshots);

  return {
    campaignCount: snapshots.length,
    avgRoas,
    weightedRoas,
    avgCostPerMsgMinor,
    totalSpendMinor,
    totalRevenueMinor,
    totalMessages,
    totalPurchases,
    currency: dominant?.currency ?? null,
    currencyMinorFactor: dominant?.currencyMinorFactor ?? null,
  };
}

export function buildCohortObjectives(snapshots: SnapshotForRollup[]): string[] {
  const objectives = new Set<string>();
  for (const snapshot of snapshots) {
    if (snapshot.objective != null) objectives.add(snapshot.objective);
  }
  return [...objectives, HISTORY_OBJECTIVE_ALL];
}

async function upsertRollupRow(
  prisma: PrismaClient,
  workspaceId: string,
  objective: string,
  windowKey: CampaignHistoryWindowKey,
  aggregate: RollupAggregate,
  computedAt: Date,
): Promise<void> {
  const data = {
    campaignCount: aggregate.campaignCount,
    avgRoas: aggregate.avgRoas,
    weightedRoas: aggregate.weightedRoas,
    avgCostPerMsgMinor: aggregate.avgCostPerMsgMinor,
    totalSpendMinor: aggregate.totalSpendMinor,
    totalRevenueMinor: aggregate.totalRevenueMinor,
    totalMessages: aggregate.totalMessages,
    totalPurchases: aggregate.totalPurchases,
    currency: aggregate.currency,
    currencyMinorFactor: aggregate.currencyMinorFactor,
    computedAt,
  };

  await prisma.campaignHistoryRollup.upsert({
    where: {
      workspaceId_objective_windowKey: { workspaceId, objective, windowKey },
    },
    create: { workspaceId, objective, windowKey, ...data },
    update: data,
  });
}

/**
 * Refresh all materialized rollup rows from campaign_history_snapshots.
 * Intended for the 24h maintenance pass — not the 6h sync loop (H-10).
 */
export async function refreshCampaignHistoryRollups(
  prisma: PrismaClient,
  opts?: { now?: Date },
): Promise<{ workspaces: number; upserted: number }> {
  const now = opts?.now ?? new Date();

  const workspaceRows = await prisma.campaignHistorySnapshot.findMany({
    select: { workspaceId: true },
    distinct: ['workspaceId'],
  });

  let upserted = 0;

  for (const { workspaceId } of workspaceRows) {
    const snapshots = await prisma.campaignHistorySnapshot.findMany({
      where: { workspaceId },
      select: {
        objective: true,
        finalRoas: true,
        lifetimeSpendMinor: true,
        revenueMinor: true,
        messages: true,
        purchases: true,
        currency: true,
        currencyMinorFactor: true,
        endedAt: true,
      },
    });

    const cohortObjectives = buildCohortObjectives(snapshots);

    for (const windowKey of HISTORY_WINDOW_KEYS) {
      for (const objective of cohortObjectives) {
        const cohort = filterSnapshotsForCohort(snapshots, objective, windowKey, now);
        const aggregate = aggregateSnapshots(cohort);
        await upsertRollupRow(prisma, workspaceId, objective, windowKey, aggregate, now);
        upserted++;
      }
    }
  }

  return { workspaces: workspaceRows.length, upserted };
}
