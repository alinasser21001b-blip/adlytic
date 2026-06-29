import { EntityStatus } from "@prisma/client";

/**
 * True when a campaign is actively delivering spend right now.
 * Requires reconciled ACTIVE status plus spend today (Meta account timezone
 * may lag UTC daily_stats by a few hours — callers may pass yesterday as
 * fallback only when today is unset).
 */
export function isCurrentlySpending(args: {
  status: EntityStatus | string;
  spendTodayMinor?: number | bigint | null;
  spendYesterdayMinor?: number | bigint | null;
}): boolean {
  if (args.status !== EntityStatus.ACTIVE && args.status !== "ACTIVE") {
    return false;
  }
  const today = Number(args.spendTodayMinor ?? 0);
  if (today > 0) return true;
  // No spend today — not "now spending" even if it ran yesterday.
  void args.spendYesterdayMinor;
  return false;
}

/** UTC midnight for "today" aligned with getDashboard / DailyStat.date storage. */
export function utcTodayFloor(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
