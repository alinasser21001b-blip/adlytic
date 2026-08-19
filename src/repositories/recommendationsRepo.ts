// ════════════════════════════════════════════════════════════════════════
//  src/repositories/recommendationsRepo.ts
//
//  The canonical writer for DETERMINISTIC (source=V1_RULES) recommendations.
//
//  A second, independent writer exists BY DESIGN: src/services/agent/tools/
//  saveRecommendation.ts persists source=AI_AGENT rows directly (that file
//  carries the reciprocal ownership guard). Both sources share the same
//  table and the same (entityType, entityId, date, actionCode) uniqueness
//  constraint, but reconcile independently — replaceForDate below only ever
//  deletes/replaces the rows THIS engine owns. A producer may reconcile or
//  delete only recommendations it owns; there is no cross-source policy
//  authorizing otherwise (P0-02).
//
//  Same atomic-replace contract as detectedIssuesRepo: a rerun for the same
//  (entity, date) replaces wholesale. At most one row written per call —
//  the Recommendation Engine emits one recommendation per (entity, date)
//  by design.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType, RecommendationPriority, RecommendationSource, IssueCode, Prisma } from "@prisma/client";

export interface RecommendationRecord {
  actionCode: string;
  priority: RecommendationPriority;
  sourceIssues: IssueCode[];
  details: Record<string, unknown> | null;
}

export class RecommendationsRepo {
  constructor(private prisma: PrismaClient) {}

  /**
   * Replace any prior DETERMINISTIC (source=V1_RULES) recommendation for
   * (entityType, entityId, date) with the given one. If `recommendation` is
   * null, prior V1_RULES rows are cleared and nothing is written — Step 12's
   * dashboard reads this as "no priority action right now" and presents
   * accordingly.
   *
   * OWNERSHIP INVARIANT (P0-02): the delete below is scoped to
   * source=V1_RULES. An AI-agent-authored (source=AI_AGENT) row for the same
   * entity and date belongs to a different producer and must survive this
   * call — this repo may reconcile only what it wrote.
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
        // Ownership-scoped: never deletes an AI_AGENT or V5_INTELLIGENCE row.
        where: { entityType, entityId, date, source: RecommendationSource.V1_RULES },
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
          // source omitted — schema default V1_RULES, matching this delete's scope.
        },
      }));
    }

    try {
      await this.prisma.$transaction(ops);
    } catch (err) {
      // The (entityType, entityId, date, actionCode) slot this cycle wants to
      // write is already occupied by a row from a different source — almost
      // always AI_AGENT (see saveRecommendation.ts's reciprocal guard). This
      // producer may only reconcile what it owns, so it defers rather than
      // colliding: the delete above rolled back atomically with this failed
      // create (Prisma's array $transaction is all-or-nothing), so the prior
      // V1_RULES row, if any, is untouched — this cycle simply does not
      // publish a new one for this entity/date.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        console.warn(
          `[recommendationsRepo] replaceForDate deferred for ${entityType}:${entityId}:` +
          `${date.toISOString().slice(0, 10)} — actionCode "${recommendation?.actionCode}" ` +
          `is already owned by a non-V1_RULES recommendation`,
        );
        return;
      }
      throw err;
    }
  }
}

function dateOnly(d: Date): Date {
  return new Date(d.toISOString().slice(0, 10));
}
