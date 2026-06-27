/**
 * Historical data types — Part 1 schema contract (§1.3, §2.4).
 *
 * Closed-set window keys for rollup cohorts; mirrors CampaignHistoryWindowKey enum.
 */

import type { CampaignHistoryWindowKey } from '@prisma/client';

/** Named rollup windows — advisor never passes free-form date ranges (§2.4). */
export const HISTORY_WINDOW_KEYS = ['ALL_TIME', 'LAST_90D', 'LAST_30D'] as const satisfies readonly CampaignHistoryWindowKey[];

export type HistoryWindowKey = (typeof HISTORY_WINDOW_KEYS)[number];

/** Rollup row shape for read paths (Part 2+). */
export interface CampaignHistoryRollupRow {
  workspaceId: string;
  objective: string | null;
  windowKey: HistoryWindowKey;
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
  computedAt: Date;
}
