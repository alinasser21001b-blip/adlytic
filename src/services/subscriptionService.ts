// ════════════════════════════════════════════════════════════════════════
//  src/services/subscriptionService.ts
//
//  All subscription mutations funnel through this module — both Stripe
//  webhook-driven changes and admin-driven manual activations.
//
//  Two design rules:
//
//    1. Every mutation is wrapped in a Prisma transaction that ALSO writes
//       a row to `payment_events` (the ledger). State + audit move together
//       or not at all.
//
//    2. The Stripe webhook entry point inserts `ProcessedStripeEvent`
//       inside the same transaction as the state mutation. The PK is the
//       Stripe event.id, so duplicate deliveries collide on the unique
//       constraint — atomic dedupe with zero locking gymnastics.
// ════════════════════════════════════════════════════════════════════════

import {
  Prisma,
  type PrismaClient,
  type PaymentEventType,
  type PaymentEventSource,
  type PaymentMethod,
  type SubscriptionTier,
  type SubscriptionStatus,
} from '@prisma/client';
import type Stripe from 'stripe';

// ── Shared types ────────────────────────────────────────────────────────

export interface LedgerInput {
  workspaceId: string;
  eventType: PaymentEventType;
  source: PaymentEventSource;
  tierAfter?: SubscriptionTier | null;
  note?: string | null;
  externalRef?: string | null;
  amountMinor?: bigint | null;
  currency?: string | null;
  triggeredBy?: string | null;
}

export interface ApplyResult {
  ok: true;
  workspaceId: string;
  status: SubscriptionStatus;
  tier: SubscriptionTier;
}

export type WebhookOutcome =
  | { ok: true; processed: true;  reason: string }
  | { ok: true; processed: false; reason: string }   // unhandled event type — 200 with no-op
  | { ok: false; reason: string };                   // invalid payload, missing metadata, etc.

// ── Manual activation (WhatsApp / cash path) ────────────────────────────

export interface ManualActivateInput {
  workspaceId: string;
  tier: SubscriptionTier;
  /** ISO date string for the new expiry. */
  expiresAt: Date;
  /** Free-form note from the support agent (e.g. "Paid via Zain Cash"). */
  note?: string;
  /** Transfer reference (Zain Cash / Asia Cell / bank wire). */
  externalRef?: string;
  /** Optional payment amount, in minor units of `currency`. */
  amountMinor?: bigint;
  currency?: string;
  /** User.id of the admin who pressed the button. */
  triggeredBy: string;
}

export async function activateManual(
  prisma: PrismaClient,
  input: ManualActivateInput,
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.update({
      where: { id: input.workspaceId },
      data: {
        tier: input.tier,
        subscriptionStatus: 'ACTIVE',
        paymentMethod: 'WHATSAPP_MANUAL',
        subscriptionExpiresAt: input.expiresAt,
      },
      select: { id: true, tier: true, subscriptionStatus: true },
    });
    await tx.paymentEvent.create({
      data: {
        workspaceId: ws.id,
        eventType: 'ACTIVATED',
        source: 'WHATSAPP_MANUAL',
        tierAfter: ws.tier,
        note: input.note ?? null,
        externalRef: input.externalRef ?? null,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        triggeredBy: input.triggeredBy,
      },
    });
    return { ok: true, workspaceId: ws.id, status: ws.subscriptionStatus, tier: ws.tier };
  });
}

// ── Manual cancel / downgrade (owner admin console) ─────────────────────

export interface ManualCancelInput {
  workspaceId: string;
  /** Free-form note from the platform owner. */
  note?: string;
  /** User.id of the admin who pressed cancel. */
  triggeredBy: string;
}

/**
 * Downgrade a workspace to FREE + CANCELED and append a ledger row.
 * Does not call Stripe — for WhatsApp/cash customers, or when the owner
 * wants to revoke access immediately regardless of Stripe state.
 */
export async function cancelManual(
  prisma: PrismaClient,
  input: ManualCancelInput,
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.update({
      where: { id: input.workspaceId },
      data: {
        tier: 'FREE',
        subscriptionStatus: 'CANCELED',
        subscriptionExpiresAt: new Date(),
      },
      select: { id: true, tier: true, subscriptionStatus: true },
    });
    await tx.paymentEvent.create({
      data: {
        workspaceId: ws.id,
        eventType: 'CANCELED',
        source: 'WHATSAPP_MANUAL',
        tierAfter: 'FREE',
        note: input.note ?? 'Canceled by platform admin',
        triggeredBy: input.triggeredBy,
      },
    });
    return { ok: true, workspaceId: ws.id, status: ws.subscriptionStatus, tier: ws.tier };
  });
}

// ── Extend / renew subscription (admin console) ───────────────────────

export interface ExtendSubscriptionInput {
  workspaceId: string;
  newExpiresAt: Date;
  note?: string;
  amountMinor?: bigint;
  currency?: string;
  triggeredBy: string;
}

export async function extendSubscription(
  prisma: PrismaClient,
  input: ExtendSubscriptionInput,
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.update({
      where: { id: input.workspaceId },
      data: {
        tier: 'PREMIUM',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: input.newExpiresAt,
      },
      select: { id: true, tier: true, subscriptionStatus: true },
    });
    await tx.paymentEvent.create({
      data: {
        workspaceId: ws.id,
        eventType: 'RENEWED',
        source: 'WHATSAPP_MANUAL',
        tierAfter: 'PREMIUM',
        note: input.note ?? 'Extended by platform admin',
        externalRef: null,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        triggeredBy: input.triggeredBy,
      },
    });
    return { ok: true, workspaceId: ws.id, status: ws.subscriptionStatus, tier: ws.tier };
  });
}

// ── Stripe webhook router ───────────────────────────────────────────────

/**
 * Entry point called by the `/api/webhooks/stripe` route AFTER the signature
 * has been verified. Handles the four event families we care about (signed
 * off in Phase 5.2 sec. 2B). Unhandled types are acknowledged with a 200
 * (Stripe stops retrying) but recorded as "no-op" for observability.
 */
export async function handleStripeWebhookEvent(
  prisma: PrismaClient,
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  // Idempotency check — has Stripe retried this event.id already?
  // We do the dedupe insert inside each handler's transaction so it commits
  // atomically with the state change. A pre-check here would race.

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(prisma, event);

    case 'invoice.paid':
      return handleInvoicePaid(prisma, event);

    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(prisma, event);

    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(prisma, event);

    default:
      return { ok: true, processed: false, reason: `unhandled event type: ${event.type}` };
  }
}

// ── Event handlers (one per signed-off event type) ──────────────────────

async function handleCheckoutCompleted(
  prisma: PrismaClient,
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  const session = event.data.object as Stripe.Checkout.Session;
  const workspaceId = session.metadata?.['workspaceId'];
  const tier = (session.metadata?.['tier'] as SubscriptionTier | undefined) ?? 'PREMIUM';

  if (!workspaceId) {
    // Defensive: the checkout route always injects this, but a hand-rolled
    // session from the Stripe dashboard wouldn't. Acknowledge to stop retries.
    return { ok: true, processed: false, reason: 'missing workspaceId in session.metadata' };
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;

  try {
    await runDedupedTx(prisma, event, async (tx) => {
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          tier,
          subscriptionStatus: 'ACTIVE',
          paymentMethod: 'STRIPE_CARD',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          // expiresAt is filled in by the first invoice.paid event,
          // which carries `period_end`. checkout.session.completed
          // doesn't carry it reliably across modes.
        },
      });
      await tx.paymentEvent.create({
        data: {
          workspaceId,
          eventType: 'ACTIVATED',
          source: 'STRIPE',
          tierAfter: tier,
          externalRef: event.id,
          amountMinor: session.amount_total != null ? BigInt(session.amount_total) : null,
          currency: session.currency ?? null,
          note: 'Checkout session completed',
        },
      });
    });
    return { ok: true, processed: true, reason: 'workspace activated via checkout' };
  } catch (e) {
    if (isDuplicateEventError(e)) {
      return { ok: true, processed: false, reason: 'duplicate event — already processed' };
    }
    throw e;
  }
}

async function handleInvoicePaid(
  prisma: PrismaClient,
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id ?? null;
  if (!customerId) {
    return { ok: true, processed: false, reason: 'invoice missing customer' };
  }

  // Find the workspace via the Stripe customer mapping written on activation.
  const ws = await prisma.workspace.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, tier: true },
  });
  if (!ws) {
    return { ok: true, processed: false, reason: `no workspace mapped to customer ${customerId}` };
  }

  // Stripe sends period_end as a UNIX timestamp (seconds).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodEnd = (invoice as any).period_end as number | undefined;
  const newExpiresAt = periodEnd ? new Date(periodEnd * 1000) : null;

  try {
    await runDedupedTx(prisma, event, async (tx) => {
      await tx.workspace.update({
        where: { id: ws.id },
        data: {
          subscriptionStatus: 'ACTIVE',
          ...(newExpiresAt ? { subscriptionExpiresAt: newExpiresAt } : {}),
        },
      });
      await tx.paymentEvent.create({
        data: {
          workspaceId: ws.id,
          eventType: 'RENEWED',
          source: 'STRIPE',
          tierAfter: ws.tier,
          externalRef: event.id,
          amountMinor: invoice.amount_paid != null ? BigInt(invoice.amount_paid) : null,
          currency: invoice.currency ?? null,
          note: 'Invoice paid (renewal)',
        },
      });
    });
    return { ok: true, processed: true, reason: 'subscription renewed' };
  } catch (e) {
    if (isDuplicateEventError(e)) {
      return { ok: true, processed: false, reason: 'duplicate event — already processed' };
    }
    throw e;
  }
}

async function handleSubscriptionDeleted(
  prisma: PrismaClient,
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  const sub = event.data.object as Stripe.Subscription;
  const ws = await prisma.workspace.findUnique({
    where: { stripeSubscriptionId: sub.id },
    select: { id: true, tier: true },
  });
  if (!ws) {
    return { ok: true, processed: false, reason: `no workspace mapped to subscription ${sub.id}` };
  }

  try {
    await runDedupedTx(prisma, event, async (tx) => {
      await tx.workspace.update({
        where: { id: ws.id },
        data: {
          subscriptionStatus: 'CANCELED',
          tier: 'FREE',
        },
      });
      await tx.paymentEvent.create({
        data: {
          workspaceId: ws.id,
          eventType: 'CANCELED',
          source: 'STRIPE',
          tierAfter: 'FREE',
          externalRef: event.id,
          note: 'Subscription deleted in Stripe',
        },
      });
    });
    return { ok: true, processed: true, reason: 'subscription canceled' };
  } catch (e) {
    if (isDuplicateEventError(e)) {
      return { ok: true, processed: false, reason: 'duplicate event — already processed' };
    }
    throw e;
  }
}

async function handleSubscriptionUpdated(
  prisma: PrismaClient,
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  const sub = event.data.object as Stripe.Subscription;
  const ws = await prisma.workspace.findUnique({
    where: { stripeSubscriptionId: sub.id },
    select: { id: true, tier: true },
  });
  if (!ws) {
    return { ok: true, processed: false, reason: `no workspace mapped to subscription ${sub.id}` };
  }

  // Translate Stripe's status into our SubscriptionStatus enum.
  const nextStatus: SubscriptionStatus = mapStripeStatusToOurs(sub.status);

  try {
    await runDedupedTx(prisma, event, async (tx) => {
      const tierUpdate = nextStatus === 'CANCELED' ? 'FREE' as const : undefined;
      await tx.workspace.update({
        where: { id: ws.id },
        data: {
          subscriptionStatus: nextStatus,
          ...(tierUpdate ? { tier: tierUpdate } : {}),
        },
      });
      await tx.paymentEvent.create({
        data: {
          workspaceId: ws.id,
          eventType: nextStatus === 'PAST_DUE' ? 'EXPIRED' : 'RENEWED',
          source: 'STRIPE',
          tierAfter: tierUpdate ?? ws.tier,
          externalRef: event.id,
          note: `Subscription updated → ${sub.status}`,
        },
      });
    });
    return { ok: true, processed: true, reason: `status set to ${nextStatus}` };
  } catch (e) {
    if (isDuplicateEventError(e)) {
      return { ok: true, processed: false, reason: 'duplicate event — already processed' };
    }
    throw e;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Atomic dedupe-then-mutate: inserts the Stripe event into
 * `processed_stripe_events` (PK collision = already done) inside the same
 * transaction as the state change. Caller passes a callback that performs
 * the mutation.
 */
async function runDedupedTx(
  prisma: PrismaClient,
  event: Stripe.Event,
  apply: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.processedStripeEvent.create({
      data: { id: event.id, type: event.type },
    });
    await apply(tx);
  });
}

/** True when an exception comes from the dedupe PK collision (P2002). */
function isDuplicateEventError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002'
  );
}

function mapStripeStatusToOurs(stripeStatus: Stripe.Subscription['status']): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED';
    case 'incomplete':
    case 'paused':
    default:
      return 'INACTIVE';
  }
}

// Re-export for callers that build their own ledger rows directly.
export type { PaymentEventType, PaymentEventSource, PaymentMethod, SubscriptionTier, SubscriptionStatus };
