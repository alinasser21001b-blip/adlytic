// ════════════════════════════════════════════════════════════════════════
//  src/services/getCampaignHistory.ts
//
//  Historical read path — queries campaign_history_snapshots by workspaceId
//  ONLY. No status filter; completely isolated from getDashboard live queries.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
import { costPerMessageFromTotals } from "../lib/campaignFreeze";

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
    return "أداء قابل للتوسع مع تكلفة رسالة منخفضة";
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
    return "الإبداع فقد جاذبيته — جرّب صوراً أو نصوصاً جديدة قبل إعادة التشغيل";
  }
  if (row.finalRoas != null && row.finalRoas < 1) {
    return "عائد الإعلان كان ضعيفاً — قلّل الإنفاق أو حسّن عرض المنتج قبل التكرار";
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
 * Recently ended under-performers within `days` of endedAt (default 60).
 * Sorted by lowest finalRoas first; prefers PAUSE verdicts from finalBrainJson.
 */
export async function getRecentFailures(
  prisma: PrismaClient,
  workspaceId: string,
  objective: string,
  limit: number,
  days = 60,
  now: Date = new Date(),
): Promise<RecentFailureEntry[]> {
  const endedAtGte = new Date(now.getTime() - days * 86400_000);

  const rows = await prisma.campaignHistorySnapshot.findMany({
    where: {
      workspaceId,
      objective,
      endedAt: { gte: endedAtGte },
    },
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
 * Assemble the closed-set history block for Claude CMO narration.
 */
export async function buildCmoHistoricalContext(
  prisma: PrismaClient,
  workspaceId: string,
  objective: string | null | undefined,
  opts?: { now?: Date },
): Promise<CmoHistoricalContext | undefined> {
  if (!objective) return undefined;

  const [topPerformers, recentFailures] = await Promise.all([
    getTopPerformers(prisma, workspaceId, objective, 3),
    getRecentFailures(prisma, workspaceId, objective, 2, 60, opts?.now),
  ]);

  if (topPerformers.length === 0 && recentFailures.length === 0) {
    return undefined;
  }

  return { topPerformers, recentFailures };
}

export { deriveKeyTrait, deriveLessonArabic };
