// ════════════════════════════════════════════════════════════════════════
//  src/repositories/healthScoresRepo.ts
//
//  The ONLY file allowed to write health_scores.
//
//  Versioning contract: the schema's unique key is
//      (entityType, entityId, date, algorithmVersion)
//  which means v1 and v2 scores for the same day COEXIST. Upserts within
//  one version converge; bumping the version creates a NEW row, never
//  overwrites v1. That is intentional. v1 must remain queryable after v2
//  ships so users can ask "what did the dashboard say last month?"
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType } from "@prisma/client";

export interface HealthScoreRecord {
  score: number;                    // 0–100
  algorithmVersion: number;
  breakdown: Record<string, unknown>;
}

export class HealthScoresRepo {
  constructor(private prisma: PrismaClient) {}

  async upsert(args: {
    entityType: EntityType;
    entityId: string;
    date: Date;
    record: HealthScoreRecord;
  }): Promise<void> {
    const { entityType, entityId, record } = args;
    const date = dateOnly(args.date);
    await this.prisma.healthScore.upsert({
      where: {
        entityType_entityId_date_algorithmVersion: {
          entityType, entityId, date, algorithmVersion: record.algorithmVersion,
        },
      },
      create: {
        entityType, entityId, date,
        score: record.score,
        algorithmVersion: record.algorithmVersion,
        breakdownJson: record.breakdown as object,
      },
      update: {
        score: record.score,
        breakdownJson: record.breakdown as object,
      },
    });
  }
}

function dateOnly(d: Date): Date {
  return new Date(d.toISOString().slice(0, 10));
}
