// ════════════════════════════════════════════════════════════════════════
//  src/repositories/detectedIssuesRepo.ts
//
//  The ONLY file allowed to write detected_issues.
//
//  Idempotency design: a rerun for the same (entity, date) should not
//  duplicate issues. The schema doesn't define a composite unique across
//  (entityType, entityId, date, issueCode) — adding one in a migration
//  would be ideal, but Phase 1 handles it by deleting prior issues for the
//  same (entity, date) before inserting new ones. Atomic within a
//  transaction. The rule of "one writer" means this is the only place that
//  decision lives.
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, EntityType, IssueCode, Severity } from "@prisma/client";

export interface IssueRecord {
  issueCode: IssueCode;
  severity: Severity;
  evidence: Record<string, unknown>;
}

export class DetectedIssuesRepo {
  constructor(private prisma: PrismaClient) {}

  /**
   * Replace all issues for (entityType, entityId, date) with the new set.
   * Atomic — partial writes are impossible, so the dashboard never sees
   * a half-detected state.
   */
  async replaceForDate(args: {
    entityType: EntityType;
    entityId: string;
    date: Date;
    issues: IssueRecord[];
  }): Promise<void> {
    const date = dateOnly(args.date);
    const { entityType, entityId, issues } = args;

    await this.prisma.$transaction([
      this.prisma.detectedIssue.deleteMany({
        where: { entityType, entityId, date },
      }),
      ...(issues.length
        ? [this.prisma.detectedIssue.createMany({
            data: issues.map(i => ({
              entityType, entityId, date,
              issueCode: i.issueCode,
              severity: i.severity,
              evidenceJson: i.evidence as object,
            })),
          })]
        : []),
    ]);
  }
}

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
