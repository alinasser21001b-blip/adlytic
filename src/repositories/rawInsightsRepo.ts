// ════════════════════════════════════════════════════════════════════════
//  src/repositories/rawInsightsRepo.ts
//
//  raw_insights is APPEND-ONLY. This file exposes only an insert path.
//  No update, no delete, no recompute. Once Meta has spoken, the record of
//  what they said is preserved verbatim — that is the entire point of the
//  raw layer. If analytics formulas change later, we recompute from here.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";
import type { MetaInsightRow } from "../services/metaClient";

export class RawInsightsRepo {
  constructor(private prisma: PrismaClient) {}

  /**
   * Persist one raw Meta row as-is, scoped to an internal entity.
   * `entityId` is OUR id (cuid), not Meta's external id — translation is
   * the caller's job, by design.
   */
  async append(args: {
    entityType: EntityType;
    entityId: string;
    date: Date;
    rawJson: MetaInsightRow;
  }): Promise<void> {
    await this.prisma.rawInsight.create({
      data: {
        entityType: args.entityType,
        entityId: args.entityId,
        date: dateOnly(args.date),
        rawJson: args.rawJson as object,
      },
    });
  }

  /** Bulk append — one transaction so we never half-write a page. */
  async appendMany(rows: Array<{
    entityType: EntityType;
    entityId: string;
    date: Date;
    rawJson: MetaInsightRow;
  }>): Promise<void> {
    if (!rows.length) return;
    await this.prisma.rawInsight.createMany({
      data: rows.map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        date: dateOnly(r.date),
        rawJson: r.rawJson as object,
      })),
    });
  }
}

function dateOnly(d: Date): Date {
  return new Date(d.toISOString().slice(0, 10));
}
