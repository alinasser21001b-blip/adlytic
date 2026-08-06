// ════════════════════════════════════════════════════════════════════════
//  src/orchestrator/timeline.ts — append-only onboarding audit writer
//
//  Every meaningful thing the engine does gets one OnboardingEvent row.
//  The same table is both the debugging trail AND the live progress feed
//  rendered to the operator, so there is exactly one story about what
//  happened — not a log the operator can't see plus a UI that guesses.
//
//  Hard rule: an audit write must NEVER break the flow it is auditing.
//  appendEvent swallows and logs its own failures. A missing timeline row
//  is a degraded story; a thrown error mid-transition is a corrupted
//  state machine. The trade is not close.
// ════════════════════════════════════════════════════════════════════════

import type {
  PrismaClient,
  OnboardingEventKind,
  OnboardingState,
  Prisma,
} from '@prisma/client';

export interface AppendEventInput {
  kind: OnboardingEventKind;
  message: string;
  fromState?: OnboardingState | null;
  toState?: OnboardingState | null;
  stepId?: string | null;
  dataJson?: Prisma.InputJsonValue | null;
}

/**
 * Insert one audit row. Never throws — on failure it logs and returns.
 */
export async function appendEvent(
  prisma: PrismaClient,
  onboardingId: string,
  input: AppendEventInput,
): Promise<void> {
  try {
    await prisma.onboardingEvent.create({
      data: {
        onboardingId,
        kind: input.kind,
        message: input.message.slice(0, 2000),
        fromState: input.fromState ?? null,
        toState: input.toState ?? null,
        stepId: input.stepId ?? null,
        ...(input.dataJson != null ? { dataJson: input.dataJson } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator:timeline] failed to append ${input.kind} for ${onboardingId}: ${msg}`);
  }
}

/** Full timeline for one onboarding record, oldest first. */
export async function getTimeline(prisma: PrismaClient, onboardingId: string) {
  return prisma.onboardingEvent.findMany({
    where: { onboardingId },
    orderBy: { at: 'asc' },
  });
}
