// ════════════════════════════════════════════════════════════════════════
//  src/repositories/dailyStatsRepo.ts
//
//  daily_stats is the engines' input contract. Writes go through ONE function
//  (`upsert`) and are keyed by (entity_type, entity_id, date). Re-running
//  yesterday's sync must produce the same row, with updated values if Meta's
//  attribution has backfilled — never a duplicate, never a partial write.
//
//  No read-modify-write here: upsert is atomic in Postgres via the unique key.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";
import type { NormalizedInsight } from "../mappers/insightMapper";

export class DailyStatsRepo {
  constructor(private prisma: PrismaClient) {}

  /**
   * Insert or update one daily row. The unique key (entityType, entityId, date)
   * is what makes the worker idempotent — re-syncing the same window converges
   * instead of duplicating.
   */
  async upsert(args: {
    entityType: EntityType;
    entityId: string;
    insight: NormalizedInsight;
  }): Promise<void> {
    const { entityType, entityId, insight } = args;
    const date = new Date(insight.date);

    const data = {
      spend: BigInt(insight.spendMinor),
      impressions: BigInt(insight.impressions),
      reach: BigInt(insight.reach),
      clicks: BigInt(insight.clicks),
      uniqueClicks: BigInt(insight.uniqueClicks),
      messages: BigInt(insight.messages),
      purchases: BigInt(insight.purchases),
      leads: BigInt(insight.leads),
      conversions: BigInt(insight.conversions),
      revenueMinor: BigInt(insight.revenueMinor),
      ctr: insight.ctr,
      uniqueCtr: insight.uniqueCtr,
      cpc: insight.cpc,
      cpm: insight.cpm,
      costPerMessage: insight.costPerMessage,
      frequency: insight.frequency,
      roas: insight.roas,
    };

    await this.prisma.dailyStat.upsert({
      where: {
        // Composite unique: see schema's @@unique([entityType, entityId, date])
        entityType_entityId_date: { entityType, entityId, date },
      },
      create: { entityType, entityId, date, ...data },
      update: data,
    });
  }

  /** Bulk upsert — wraps individual upserts in a single transaction. */
  async upsertMany(rows: Array<{
    entityType: EntityType;
    entityId: string;
    insight: NormalizedInsight;
  }>): Promise<void> {
    if (!rows.length) return;
    await this.prisma.$transaction(rows.map((r) => {
      const date = new Date(r.insight.date);
      const data = {
        spend: BigInt(r.insight.spendMinor),
        impressions: BigInt(r.insight.impressions),
        reach: BigInt(r.insight.reach),
        clicks: BigInt(r.insight.clicks),
        uniqueClicks: BigInt(r.insight.uniqueClicks),
        messages: BigInt(r.insight.messages),
        purchases: BigInt(r.insight.purchases),
        leads: BigInt(r.insight.leads),
        conversions: BigInt(r.insight.conversions),
        revenueMinor: BigInt(r.insight.revenueMinor),
        ctr: r.insight.ctr,
        uniqueCtr: r.insight.uniqueCtr,
        cpc: r.insight.cpc,
        cpm: r.insight.cpm,
        costPerMessage: r.insight.costPerMessage,
        frequency: r.insight.frequency,
        roas: r.insight.roas,
      };
      return this.prisma.dailyStat.upsert({
        where: { entityType_entityId_date: { entityType: r.entityType, entityId: r.entityId, date } },
        create: { entityType: r.entityType, entityId: r.entityId, date, ...data },
        update: data,
      });
    }));
  }
}
