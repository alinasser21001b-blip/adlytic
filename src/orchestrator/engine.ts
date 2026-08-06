// ════════════════════════════════════════════════════════════════════════
//  src/orchestrator/engine.ts — the Connection Orchestrator state machine
//
//  One `advance()` call = one step of one record. The poller (and the
//  operator's "تحقق الآن" button) call it repeatedly; nothing here loops.
//
//  ── Three decisions that define this engine ────────────────────────────
//
//  1. RE-DETECT AND RE-PLAN ON EVERY TRANSITION.
//     Capabilities move under us mid-flight: App Review lands, a client
//     grants the asset early, access gets revoked. A plan frozen at
//     creation is a plan that is wrong by the time it matters. Detection
//     is cheap (STATIC is free, PROBED is one call) — staleness is not.
//
//  2. VERIFY BEFORE EXECUTE.
//     Retry is the easy half; reconciliation is the hard half. If we
//     assign an asset on Meta and crash before the local write, a
//     retry-only engine believes the work never happened and does it
//     again. So every step is asked "is your effect already true?" first,
//     and only executed when the answer is no. This is also why steps
//     must be idempotent — verify closes the window, it does not remove
//     the requirement.
//
//  3. BLOCKED IS NOT FAILED.
//     BLOCKED means a human must do one specific thing; it stops polling
//     entirely (no backoff, no retry — nothing we do changes it) and
//     surfaces `blockedRequirement` as the single next action. FAILED
//     means we tried and it broke. Collapsing the two produces a UI that
//     tells the operator to "retry" something that will never succeed.
//
//  Concurrency: each record is advanced under a Postgres advisory lock
//  keyed on its id, so two pollers (or a poller and a manual check) can
//  never drive the same record at once. A missed tick is harmless — the
//  next pass picks it up.
// ════════════════════════════════════════════════════════════════════════

import type { ConnectionOnboarding, PrismaClient, Prisma } from '@prisma/client';
import type {
  CapabilitySet,
  OnboardingContext,
  OnboardingStateName,
  PlannedStep,
  ProviderAdapter,
  ProviderName,
} from './contracts';
import { TERMINAL_STATES } from './contracts';
import { isWaitExpired, nextCheckAt } from './polling';
import { appendEvent } from './timeline';
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from '../lib/advisoryLock';

/** Max execute() attempts for a retryable failure before giving up. */
const MAX_ATTEMPTS = 5;
/** Retry backoff base for FAILED-but-retryable: 30s * 2^attempts, capped. */
const RETRY_BASE_MS = 30_000;
const RETRY_CAP_MS = 30 * 60_000;

function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts)));
}

/** Keep provider errors single-line and short before they hit `lastError`.
 *  Never store raw provider payloads — they can carry token fragments. */
function sanitizeError(reason: string): string {
  return reason.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function toCtx(record: ConnectionOnboarding, prisma: PrismaClient): OnboardingContext {
  return {
    onboardingId: record.id,
    workspaceId: record.workspaceId,
    provider: record.provider as ProviderName,
    externalAccountId: record.externalAccountId,
    attempts: record.attempts,
    linkedAdAccountId: record.linkedAdAccountId,
    prisma,
  };
}

function isTerminal(state: string): boolean {
  return TERMINAL_STATES.has(state as OnboardingStateName);
}

/** Material comparison — `detectedAt` always changes and must not count. */
function capabilitiesChanged(stored: unknown, fresh: CapabilitySet): boolean {
  if (!stored || typeof stored !== 'object') return false; // first detection isn't a "change"
  const prev = stored as Partial<CapabilitySet>;
  return (
    JSON.stringify(prev.static ?? null) !== JSON.stringify(fresh.static) ||
    JSON.stringify(prev.probed ?? null) !== JSON.stringify(fresh.probed)
  );
}

/**
 * Pick the step the engine should work now. The plan is ordered and
 * `currentStepId` is the cursor: everything before it is complete. A
 * cursor that no longer exists in a freshly-planned list (the plan
 * changed under us) rewinds to the start — verify() then skips whatever
 * is already true, so rewinding is cheap and safe.
 */
function pickStep(plan: PlannedStep[], currentStepId: string | null): PlannedStep | null {
  if (plan.length === 0) return null;
  if (!currentStepId) return plan[0] ?? null;
  const idx = plan.findIndex((s) => s.id === currentStepId);
  if (idx === -1) return plan[0] ?? null;
  return plan[idx] ?? null;
}

function nextStepId(plan: PlannedStep[], stepId: string): string | null {
  const idx = plan.findIndex((s) => s.id === stepId);
  if (idx === -1) return null;
  return plan[idx + 1]?.id ?? null;
}

// ── Creation ────────────────────────────────────────────────────────────

export interface CreateOnboardingInput {
  workspaceId: string;
  provider?: ProviderName;
  externalAccountId: string;
}

/**
 * Idempotent creation. Clicking "add client" twice must not produce two
 * records, and must not restart an in-flight one. A terminal record is
 * reopened (a FAILED wait can legitimately be retried once the client
 * finally approves).
 */
export async function createOnboarding(
  prisma: PrismaClient,
  input: CreateOnboardingInput,
): Promise<ConnectionOnboarding> {
  const provider = (input.provider ?? 'META') as ConnectionOnboarding['provider'];
  const existing = await prisma.connectionOnboarding.findUnique({
    where: {
      workspaceId_provider_externalAccountId: {
        workspaceId: input.workspaceId,
        provider,
        externalAccountId: input.externalAccountId,
      },
    },
  });

  if (existing && !isTerminal(existing.state)) return existing;

  if (existing) {
    const reopened = await prisma.connectionOnboarding.update({
      where: { id: existing.id },
      data: {
        state: 'REQUEST_CREATED',
        attempts: 0,
        lastError: null,
        blockedRequirement: null,
        currentStepId: null,
        waitingSince: null,
        completedAt: null,
        nextCheckAt: new Date(),
      },
    });
    await appendEvent(prisma, reopened.id, {
      kind: 'NOTE',
      message: 'إعادة فتح طلب الربط بعد حالة نهائية سابقة.',
      toState: 'REQUEST_CREATED',
    });
    return reopened;
  }

  const created = await prisma.connectionOnboarding.create({
    data: {
      workspaceId: input.workspaceId,
      provider,
      externalAccountId: input.externalAccountId,
      state: 'REQUEST_CREATED',
      nextCheckAt: new Date(),
    },
  });
  await appendEvent(prisma, created.id, {
    kind: 'NOTE',
    message: `تم إنشاء طلب ربط الحساب ${input.externalAccountId}.`,
    toState: 'REQUEST_CREATED',
  });
  return created;
}

/** Records the poller should look at now: non-terminal and due. */
export async function listDue(prisma: PrismaClient, limit: number): Promise<ConnectionOnboarding[]> {
  return prisma.connectionOnboarding.findMany({
    where: {
      state: { notIn: ['READY', 'FAILED'] },
      nextCheckAt: { not: null, lte: new Date() },
    },
    orderBy: { nextCheckAt: 'asc' },
    take: limit,
  });
}

// ── Reconciliation ──────────────────────────────────────────────────────

/**
 * Re-derive the true state from the provider and correct the stored one.
 * Run on boot and before any manual check — the cheap insurance against
 * a crash between "did the thing" and "wrote that we did the thing".
 */
export async function reconcile(
  prisma: PrismaClient,
  onboardingId: string,
  adapter: ProviderAdapter,
): Promise<ConnectionOnboarding | null> {
  const record = await prisma.connectionOnboarding.findUnique({ where: { id: onboardingId } });
  if (!record) return null;

  let result;
  try {
    result = await adapter.reconcile(toCtx(record, prisma));
  } catch (err) {
    const msg = sanitizeError(err instanceof Error ? err.message : String(err));
    await appendEvent(prisma, record.id, { kind: 'ERROR', message: `تعذر التحقق من الحالة الفعلية: ${msg}` });
    return record;
  }

  if (!result.corrected || !result.actualState || result.actualState === record.state) {
    return record;
  }

  const updated = await prisma.connectionOnboarding.update({
    where: { id: record.id },
    data: {
      state: result.actualState as ConnectionOnboarding['state'],
      lastCheckedAt: new Date(),
      ...(result.actualState === 'READY' ? { completedAt: record.completedAt ?? new Date() } : {}),
    },
  });
  await appendEvent(prisma, record.id, {
    kind: 'RECONCILED',
    message: result.note ?? `تمت مطابقة الحالة مع المزوّد: ${record.state} → ${result.actualState}`,
    fromState: record.state,
    toState: result.actualState as ConnectionOnboarding['state'],
  });
  return updated;
}

// ── The single transition ───────────────────────────────────────────────

/**
 * Advance one record by at most one step. Returns the record as stored
 * after the attempt (unchanged when terminal, or when another worker
 * holds the lock).
 */
export async function advance(
  prisma: PrismaClient,
  onboardingId: string,
  adapter: ProviderAdapter,
): Promise<ConnectionOnboarding | null> {
  const record = await prisma.connectionOnboarding.findUnique({ where: { id: onboardingId } });
  if (!record) return null;
  if (isTerminal(record.state)) return record;

  const { acquired, lockId } = await tryAcquireAdvisoryLock(prisma, `adlytic:onboarding:${record.id}`);
  if (!acquired) {
    console.log(`[orchestrator] ${record.id} is being advanced elsewhere — skipping`);
    return record;
  }
  try {
    return await advanceLocked(prisma, record, adapter);
  } finally {
    await releaseAdvisoryLock(prisma, lockId);
  }
}

async function advanceLocked(
  prisma: PrismaClient,
  record: ConnectionOnboarding,
  adapter: ProviderAdapter,
): Promise<ConnectionOnboarding> {
  const ctx = toCtx(record, prisma);
  const fromState = record.state;

  // ── 1. Re-detect + re-plan, every single time ────────────────────────
  let caps: CapabilitySet;
  let plan: PlannedStep[];
  try {
    caps = await adapter.detectCapabilities(ctx);
    plan = adapter.planSteps(caps, ctx);
  } catch (err) {
    const msg = sanitizeError(err instanceof Error ? err.message : String(err));
    await appendEvent(prisma, record.id, { kind: 'ERROR', message: `فشل استكشاف القدرات: ${msg}` });
    return prisma.connectionOnboarding.update({
      where: { id: record.id },
      data: {
        lastError: msg,
        lastCheckedAt: new Date(),
        nextCheckAt: new Date(Date.now() + retryDelayMs(record.attempts)),
      },
    });
  }

  if (capabilitiesChanged(record.capabilitiesJson, caps)) {
    await appendEvent(prisma, record.id, {
      kind: 'CAPABILITY_CHANGE',
      message: 'تغيّرت قدرات المزوّد — تمت إعادة بناء الخطة.',
      dataJson: caps as unknown as Prisma.InputJsonValue,
    });
  }

  await prisma.connectionOnboarding.update({
    where: { id: record.id },
    data: {
      capabilitiesJson: caps as unknown as Prisma.InputJsonValue,
      planJson: plan as unknown as Prisma.InputJsonValue,
      lastCheckedAt: new Date(),
    },
  });

  // ── 2. Which step now? ───────────────────────────────────────────────
  const step = pickStep(plan, record.currentStepId);
  if (!step) {
    // Nothing left to do — the plan is fully consumed.
    return transition(prisma, record, 'READY', {
      currentStepId: null,
      lastError: null,
      nextCheckAt: null,
      blockedRequirement: null,
    }, 'اكتملت جميع الخطوات.');
  }

  // ── 3. Verify BEFORE execute (the reconciliation guard) ──────────────
  let verified = false;
  try {
    const v = await adapter.verify(step, ctx);
    if (v.status === 'DONE') {
      verified = true;
      await appendEvent(prisma, record.id, {
        kind: 'STEP_VERIFIED',
        message: v.note ?? `الخطوة "${step.label}" منفّذة مسبقًا لدى المزوّد — لن تُعاد.`,
        stepId: step.id,
      });
    }
  } catch (err) {
    // A failed verify is not fatal: fall through to execute (idempotent).
    const msg = sanitizeError(err instanceof Error ? err.message : String(err));
    console.warn(`[orchestrator] verify(${step.id}) failed for ${record.id}: ${msg}`);
  }

  if (verified) {
    return applyDone(prisma, record, plan, step, undefined);
  }

  // ── 4. Execute ───────────────────────────────────────────────────────
  let outcome;
  try {
    outcome = await adapter.execute(step, ctx);
  } catch (err) {
    outcome = {
      status: 'FAILED' as const,
      retryable: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  switch (outcome.status) {
    case 'DONE':
      await appendEvent(prisma, record.id, {
        kind: 'STEP_EXECUTED',
        message: outcome.note ?? `تم تنفيذ الخطوة: ${step.label}`,
        stepId: step.id,
        ...(outcome.data ? { dataJson: outcome.data as Prisma.InputJsonValue } : {}),
      });
      return applyDone(prisma, record, plan, step, outcome.data);

    case 'WAITING_EXTERNAL': {
      const waitingSince = record.waitingSince ?? new Date();
      if (isWaitExpired(waitingSince)) {
        return transition(prisma, record, 'FAILED', {
          nextCheckAt: null,
          lastError:
            'انتهت مهلة الانتظار: لم يوافق العميل على منح الوصول خلال 7 أيام. يمكن إعادة المحاولة في أي وقت بعد موافقته.',
        }, 'انتهت مهلة انتظار موافقة العميل.', step.id);
      }
      const next = nextCheckAt(waitingSince);
      return transition(prisma, record, 'WAITING_EXTERNAL_ACTION', {
        waitingSince,
        nextCheckAt: next,
        lastError: null,
        blockedRequirement: null,
      }, outcome.note ?? `بانتظار إجراء خارجي: ${step.label}`, step.id);
    }

    case 'BLOCKED':
      // Not an error — a missing prerequisite. Stop polling; a human acts.
      return transition(prisma, record, 'BLOCKED', {
        blockedRequirement: outcome.requirement,
        nextCheckAt: null,
      }, outcome.requirement, step.id);

    case 'FAILED': {
      const attempts = record.attempts + 1;
      const reason = sanitizeError(outcome.reason);
      await appendEvent(prisma, record.id, {
        kind: 'ERROR',
        message: `فشلت الخطوة "${step.label}" (محاولة ${attempts}): ${reason}`,
        stepId: step.id,
      });
      if (outcome.retryable && attempts < MAX_ATTEMPTS) {
        return prisma.connectionOnboarding.update({
          where: { id: record.id },
          data: {
            attempts,
            lastError: reason,
            nextCheckAt: new Date(Date.now() + retryDelayMs(attempts)),
          },
        });
      }
      return transition(prisma, record, 'FAILED', {
        attempts,
        lastError: reason,
        nextCheckAt: null,
      }, `توقفت المحاولات بعد ${attempts} محاولة.`, step.id);
    }
  }
}

/** DONE bookkeeping shared by the verified and the executed paths. */
async function applyDone(
  prisma: PrismaClient,
  record: ConnectionOnboarding,
  plan: PlannedStep[],
  step: PlannedStep,
  data: Record<string, unknown> | undefined,
): Promise<ConnectionOnboarding> {
  const linkedAdAccountId =
    typeof data?.['adAccountId'] === 'string' ? (data['adAccountId'] as string) : undefined;
  const following = nextStepId(plan, step.id);
  return transition(prisma, record, step.targetState, {
    currentStepId: following,
    lastError: null,
    attempts: 0,
    blockedRequirement: null,
    waitingSince: null,
    // A finished step means work remains only if another step follows.
    nextCheckAt: following ? new Date() : null,
    ...(linkedAdAccountId ? { linkedAdAccountId } : {}),
  }, `اكتملت الخطوة: ${step.label}`, step.id);
}

/**
 * Single writer for state changes — so a STATE_CHANGE event can never be
 * forgotten at a call site.
 */
async function transition(
  prisma: PrismaClient,
  record: ConnectionOnboarding,
  toState: OnboardingStateName,
  data: Prisma.ConnectionOnboardingUpdateInput,
  message: string,
  stepId?: string,
): Promise<ConnectionOnboarding> {
  const updated = await prisma.connectionOnboarding.update({
    where: { id: record.id },
    data: {
      ...data,
      state: toState as ConnectionOnboarding['state'],
      lastCheckedAt: new Date(),
      ...(toState === 'READY' ? { completedAt: record.completedAt ?? new Date(), nextCheckAt: null } : {}),
    },
  });
  if (record.state !== toState) {
    await appendEvent(prisma, record.id, {
      kind: 'STATE_CHANGE',
      message,
      fromState: record.state,
      toState: toState as ConnectionOnboarding['state'],
      stepId: stepId ?? null,
    });
  }
  return updated;
}
