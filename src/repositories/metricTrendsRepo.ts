// ════════════════════════════════════════════════════════════════════════
//  src/repositories/metricTrendsRepo.ts
//
//  The ONLY file allowed to write metric_trends. Single upsert path keyed
//  by (entity_type, entity_id, date), mirroring daily_stats' contract.
//  Re-running analytics for the same as-of date converges, never duplicates.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";

export interface TrendValues {
  ctrTrend: number | null;
  cpmTrend: number | null;
  frequencyTrend: number | null;
  resultsTrend: number | null;
  spendTrend: number | null;
  windowDays: number;
}

export class MetricTrendsRepo {
  constructor(private prisma: PrismaClient) {}

  async upsert(args: {
    entityType: EntityType;
    entityId: string;
    date: Date;        // the "as of" date this trend was computed for
    values: TrendValues;
  }): Promise<void> {
    const { entityType, entityId, values } = args;
    const date = dateOnly(args.date);
    await this.prisma.metricTrend.upsert({
      where: {
        entityType_entityId_date: { entityType, entityId, date },
      },
      create: { entityType, entityId, date, ...values },
      update: values,
    });
  }
}

function dateOnly(d: Date): Date {
  return new Date(d.toISOString().slice(0, 10));
}
