// ════════════════════════════════════════════════════════════════════════
//  src/repositories/dailyStatsRepo.ts
//
//  daily_stats is the engines' input contract. Writes go through ONE function
//  (`upsert`) and are keyed by (entity_type, entity_id, date). Re-running
//  yesterday's sync must produce the same row, with updated values if Meta's
//  attribution has backfilled — never a duplicate, never a partial write.
//
//  No read-modify-write here: upsert is atomic in Postgres via the unique key.
//
//  NOTE on link_clicks: the column defaults to 0 and rows written before the
//  20260808 migration carry 0 because the value was never persisted, not
//  because no link clicks occurred. Analytics must therefore treat a zero
//  link-click denominator as INSUFFICIENT_DATA rather than a real zero. Rows
//  converge to true values as each account's normal sync window re-upserts.
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
      linkClicks: BigInt(insight.linkClicks),
      landingPageViews: BigInt(insight.landingPageViews),
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
        linkClicks: BigInt(r.insight.linkClicks),
        landingPageViews: BigInt(r.insight.landingPageViews),
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
