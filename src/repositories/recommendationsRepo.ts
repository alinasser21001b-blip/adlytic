// ════════════════════════════════════════════════════════════════════════
//  src/repositories/recommendationsRepo.ts
//
//  The ONLY file allowed to write recommendations.
//
//  Same atomic-replace contract as detectedIssuesRepo: a rerun for the same
//  (entity, date) replaces wholesale. At most one row written per call —
//  the Recommendation Engine emits one recommendation per (entity, date)
//  by design.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType, RecommendationPriority, IssueCode, Prisma } from "@prisma/client";

export interface RecommendationRecord {
  actionCode: string;
  priority: RecommendationPriority;
  sourceIssues: IssueCode[];
  details: Record<string, unknown> | null;
}

export class RecommendationsRepo {
  constructor(private prisma: PrismaClient) {}

  /**
   * Replace any prior recommendation for (entityType, entityId, date) with
   * the given one. If `recommendation` is null, prior rows are cleared and
   * nothing is written — Step 12's dashboard reads this as "no priority
   * action right now" and presents accordingly.
   */
  async replaceForDate(args: {
    entityType: EntityType;
    entityId: string;
    date: Date;
    recommendation: RecommendationRecord | null;
  }): Promise<void> {
    const date = dateOnly(args.date);
    const { entityType, entityId, recommendation } = args;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.recommendation.deleteMany({
        where: { entityType, entityId, date },
      }),
    ];
    if (recommendation) {
      ops.push(this.prisma.recommendation.create({
        data: {
          entityType, entityId, date,
          priority: recommendation.priority,
          actionCode: recommendation.actionCode,
          sourceIssuesJson: recommendation.sourceIssues as unknown as object,
          detailsJson: recommendation.details !== null
            ? recommendation.details as Prisma.InputJsonValue
            : Prisma.JsonNull,
        },
      }));
    }

    await this.prisma.$transaction(ops);
  }
}

function dateOnly(d: Date): Date {
  return new Date(d.toISOString().slice(0, 10));
}
