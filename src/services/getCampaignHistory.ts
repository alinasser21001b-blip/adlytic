// ════════════════════════════════════════════════════════════════════════
//  src/services/getCampaignHistory.ts
//
//  Historical read path — queries campaign_history_snapshots by workspaceId
//  ONLY. No status filter; completely isolated from getDashboard live queries.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
import { costPerMessageFromTotals } from "../lib/campaignFreeze";
import {
  HISTORY_OBJECTIVE_ALL,
  type CampaignHistoryRollupRow,
  type HistoryWindowKey,
} from "../types/campaignHistory";
import { sanitizeCmoHistoricalContext } from "../lib/dataSanitizer";
import { windowCutoff } from "../workers/rollupHistory";

export interface HistorySnapshotRow {
  id: string;
  campaignId: string;
  name: string;
  objective: string | null;
  finalStatus: string;
  endedAt: Date | null;
  finalRoas: number | null;
  lifetimeSpendMinor: bigint;
  messages: bigint;
  finalBrainJson: unknown;
  breakdownJson: unknown;
  creativeJson: unknown;
}

export interface TopPerformerEntry {
  name: string;
  objective: string;
  finalRoas: number | null;
  costPerMessage: number | null;
  keyTrait: string;
}

export interface RecentFailureEntry {
  name: string;
  finalRoas: number | null;
  lessonArabic: string;
}

export interface CmoHistoricalContext {
  topPerformers: TopPerformerEntry[];
  recentFailures: RecentFailureEntry[];
}

const PAUSE_ACTIONS = new Set(["PAUSE_CAMPAIGN", "EMERGENCY_PAUSE"]);

function deriveKeyTrait(row: HistorySnapshotRow): string {
  const brain = row.finalBrainJson as { patternSignature?: string; action?: string } | null;
  if (brain?.patternSignature === "SCALABLE_BEAST") {
    return "أداء ممتاز قابل للتوسع بتكلفة منخفضة";
  }
  if (brain?.patternSignature === "STABLE_PERFORMER") {
    return "استقرار في الأداء على مدى الحملة";
  }

  const breakdown = row.breakdownJson as Array<{ breakdownKey?: string; messages?: number }> | null;
  if (Array.isArray(breakdown) && breakdown.length > 0) {
    const top = breakdown.reduce((best, cur) =>
      (cur.messages ?? 0) > (best.messages ?? 0) ? cur : best,
    breakdown[0]!);
    if (top.breakdownKey === "publisher_platform") {
      return "تفوق على منصة محددة في عدد الرسائل";
    }
    if (top.breakdownKey === "age") {
      return "استهداف فئة عمرية حققت أكثر الرسائل";
    }
  }

  const creatives = row.creativeJson as Array<{ name?: string | null }> | null;
  if (Array.isArray(creatives) && creatives[0]?.name) {
    return `إبداع «${creatives[0].name}» حصد أعلى إنفاق`;
  }

  return "توازن جيد بين الإنفاق والنتائج";
}

function deriveLessonArabic(row: HistorySnapshotRow): string {
  const brain = row.finalBrainJson as { action?: string; patternSignature?: string } | null;
  if (brain?.action && PAUSE_ACTIONS.has(brain.action)) {
    return "توقفت الحملة لأن الإنفاق لم يُترجم إلى رسائل كافية — راجع الإبداع والاستهداف";
  }
  if (brain?.patternSignature === "DYING_CREATIVE") {
    return "الإبداع لم يعد يجذب الجمهور — جرّب صوراً أو نصوصاً جديدة قبل إعادة التشغيل";
  }
  if (row.finalRoas != null && row.finalRoas < 1) {
    return "الحملة لم تحقق أرباحاً كافية — قلّل الإنفاق أو حسّن عرض المنتج قبل التكرار";
  }
  return "الأداء كان دون المتوقع — قارن الاستهداف مع حملاتك الناجحة";
}

function toHistoryRow(
  row: Awaited<ReturnType<typeof querySnapshots>>[number],
): HistorySnapshotRow {
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    objective: row.objective,
    finalStatus: row.finalStatus,
    endedAt: row.endedAt,
    finalRoas: row.finalRoas,
    lifetimeSpendMinor: row.lifetimeSpendMinor,
    messages: row.messages,
    finalBrainJson: row.finalBrainJson,
    breakdownJson: row.breakdownJson,
    creativeJson: row.creativeJson,
  };
}

async function querySnapshots(
  prisma: PrismaClient,
  workspaceId: string,
  whereExtra?: {
    objective?: string | null;
    endedAtGte?: Date;
  },
) {
  return prisma.campaignHistorySnapshot.findMany({
    where: {
      workspaceId,
      ...(whereExtra?.objective != null ? { objective: whereExtra.objective } : {}),
      ...(whereExtra?.endedAtGte != null ? { endedAt: { gte: whereExtra.endedAtGte } } : {}),
    },
    select: {
      id: true,
      campaignId: true,
      name: true,
      objective: true,
      finalStatus: true,
      endedAt: true,
      finalRoas: true,
      lifetimeSpendMinor: true,
      messages: true,
      finalBrainJson: true,
      breakdownJson: true,
      creativeJson: true,
    },
  });
}

/**
 * All-time top performers for a workspace + objective, ordered by finalRoas desc.
 * Uses the (workspaceId, objective, finalRoas) index — no daily_stats scan.
 */
export async function getTopPerformers(
  prisma: PrismaClient,
  workspaceId: string,
  objective: string,
  limit: number,
): Promise<TopPerformerEntry[]> {
  const rows = await prisma.campaignHistorySnapshot.findMany({
    where: {
      workspaceId,
      objective,
      finalRoas: { not: null },
    },
    orderBy: { finalRoas: "desc" },
    take: limit,
    select: {
      name: true,
      objective: true,
      finalRoas: true,
      lifetimeSpendMinor: true,
      messages: true,
      finalBrainJson: true,
      breakdownJson: true,
      creativeJson: true,
      id: true,
      campaignId: true,
      finalStatus: true,
      endedAt: true,
    },
  });

  return rows.map((row) => {
    const historyRow = toHistoryRow(row);
    return {
      name: row.name,
      objective: row.objective ?? objective,
      finalRoas: row.finalRoas,
      costPerMessage: costPerMessageFromTotals(row.lifetimeSpendMinor, row.messages),
      keyTrait: deriveKeyTrait(historyRow),
    };
  });
}

/**
 * Recently ended under-performers within `days` of endedAt (default 90, Q4).
 * Sorted by lowest finalRoas first; prefers PAUSE verdicts from finalBrainJson.
 */
export async function getRecentFailures(
  prisma: PrismaClient,
  workspaceId: string,
  objective: string,
  limit: number,
  now: Date = new Date(),
): Promise<RecentFailureEntry[]> {
  const endedAtGte = windowCutoff("LAST_90D", now);
  if (endedAtGte == null) return [];

  const rows = await prisma.campaignHistorySnapshot.findMany({
    where: {
      workspaceId,
      objective,
      endedAt: { gte: endedAtGte },
    },
    orderBy: { finalRoas: "asc" },
    take: Math.max(limit * 5, 10),
    select: {
      name: true,
      finalRoas: true,
      finalBrainJson: true,
      breakdownJson: true,
      creativeJson: true,
      id: true,
      campaignId: true,
      objective: true,
      finalStatus: true,
      endedAt: true,
      lifetimeSpendMinor: true,
      messages: true,
    },
  });

  const scored = rows
    .map((row) => {
      const brain = row.finalBrainJson as { action?: string } | null;
      const isPause = brain?.action != null && PAUSE_ACTIONS.has(brain.action);
      const roas = row.finalRoas ?? 0;
      const failureScore = (isPause ? 0 : 1000) + roas;
      return { row, failureScore };
    })
    .sort((a, b) => a.failureScore - b.failureScore)
    .slice(0, limit);

  return scored.map(({ row }) => ({
    name: row.name,
    finalRoas: row.finalRoas,
    lessonArabic: deriveLessonArabic(toHistoryRow(row)),
  }));
}

/**
 * Rollup-gated fetch plan — pure helper for tests (H-4/H-10).
 * topPerformers ↔ ALL_TIME rollup; recentFailures ↔ LAST_90D rollup (Q4).
 */
export function historyFetchPlanFromRollups(
  allTimeRollup: CampaignHistoryRollupRow | null,
  last90dRollup: CampaignHistoryRollupRow | null,
): { fetchTopPerformers: boolean; fetchRecentFailures: boolean } | undefined {
  const fetchTopPerformers =
    allTimeRollup != null && allTimeRollup.campaignCount > 0;
  const fetchRecentFailures =
    last90dRollup != null && last90dRollup.campaignCount > 0;
  if (!fetchTopPerformers && !fetchRecentFailures) return undefined;
  return { fetchTopPerformers, fetchRecentFailures };
}

/**
 * Assemble the closed-set history block for Claude CMO narration.
 * Gates on pre-aggregated rollup rows (H-10); snapshot reads are indexed top-N only.
 */
export async function buildCmoHistoricalContext(
  prisma: PrismaClient,
  workspaceId: string,
  objective: string | null | undefined,
  opts?: { now?: Date },
): Promise<CmoHistoricalContext | undefined> {
  if (!objective) return undefined;

  const now = opts?.now ?? new Date();

  const [allTimeRollup, last90dRollup] = await Promise.all([
    getHistoryRollup(prisma, workspaceId, objective, "ALL_TIME"),
    getHistoryRollup(prisma, workspaceId, objective, "LAST_90D"),
  ]);

  const plan = historyFetchPlanFromRollups(allTimeRollup, last90dRollup);
  if (plan == null) return undefined;

  const [topPerformers, recentFailures] = await Promise.all([
    plan.fetchTopPerformers
      ? getTopPerformers(prisma, workspaceId, objective, 3)
      : Promise.resolve([]),
    plan.fetchRecentFailures
      ? getRecentFailures(prisma, workspaceId, objective, 2, now)
      : Promise.resolve([]),
  ]);

  if (topPerformers.length === 0 && recentFailures.length === 0) {
    return undefined;
  }

  return sanitizeCmoHistoricalContext({ topPerformers, recentFailures });
}

/**
 * Read one pre-aggregated rollup row — indexed lookup, no snapshot scan (H-4/H-10).
 */
export async function getHistoryRollup(
  prisma: PrismaClient,
  workspaceId: string,
  objective: string,
  windowKey: HistoryWindowKey,
): Promise<CampaignHistoryRollupRow | null> {
  const row = await prisma.campaignHistoryRollup.findUnique({
    where: {
      workspaceId_objective_windowKey: {
        workspaceId,
        objective,
        windowKey,
      },
    },
  });
  if (row == null) return null;

  return {
    workspaceId: row.workspaceId,
    objective: row.objective,
    windowKey: row.windowKey,
    campaignCount: row.campaignCount,
    avgRoas: row.avgRoas,
    weightedRoas: row.weightedRoas,
    avgCostPerMsgMinor: row.avgCostPerMsgMinor,
    totalSpendMinor: row.totalSpendMinor,
    totalRevenueMinor: row.totalRevenueMinor,
    totalMessages: row.totalMessages,
    totalPurchases: row.totalPurchases,
    currency: row.currency,
    currencyMinorFactor: row.currencyMinorFactor,
    computedAt: row.computedAt,
  };
}

export { deriveKeyTrait, deriveLessonArabic, HISTORY_OBJECTIVE_ALL };
