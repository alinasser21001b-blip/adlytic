// ════════════════════════════════════════════════════════════════════════
//  src/services/metaWebhook.ts
//
//  Phase 1 (lean, zero-migration) Meta Webhooks receiver logic.
//
//  Meta pushes change notifications (campaign/adset/ad status, budget, etc.)
//  to POST /api/webhooks/meta. This module owns the two security/processing
//  concerns; the Hono route stays thin (mirrors the Stripe webhook):
//
//    • verifyMetaSignature()    — HMAC-SHA256 over the RAW body vs the
//                                 X-Hub-Signature-256 header, with a length
//                                 guard (crypto.timingSafeEqual THROWS on
//                                 unequal buffer lengths).
//    • processMetaWebhookEvent() — walk entry[].changes[], map the external
//                                 ad-account id → our AdAccount, and trigger a
//                                 DEBOUNCED campaign reconcile so a burst of
//                                 notifications for one account collapses into
//                                 a single Meta refresh.
//
//  Idempotency note: Meta gives NO per-delivery id (entry[].id is the OBJECT
//  id and repeats), and guarantees at-least-once delivery. So we coalesce
//  per-account instead of de-duping by event id. The periodic polling loop
//  remains the safety net if a notification is ever dropped.
// ════════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { Platform, type PrismaClient } from '@prisma/client';
import { MetaClient, MetaApiError } from './metaClient';
import { SyncAccountWorker } from '../workers/syncAccount';
import { resolveAccountToken } from './accountToken';
import { decryptToken, TokenDecryptError } from './tokenEncryption';
import { config } from '../config';
import { withRedis, isRedisHealthy } from '../lib/redis';

/** Webhook fields we act on; everything else is acknowledged and ignored. */
const WEBHOOK_FIELDS = new Set(['campaigns', 'adsets', 'ads']);

/** Coalesce window — multiple notifications for one account inside this window
 *  trigger a single reconcile. Long enough to absorb a status-change storm,
 *  short enough to keep the "instant" feel. */
const DEBOUNCE_MS = 5000;
/** Redis key for the cluster-wide debounce slot per ad account. */
const REDIS_DEBOUNCE_KEY_PREFIX = 'webhook:debounce:meta:';

/** Pending per-account reconcile timers (keyed by internal AdAccount id).
 *  Used only when the Redis-backed debounce is disabled or Redis is
 *  unreachable — gives single-node deployments and outage windows the same
 *  burst-absorption guarantee as the distributed path. */
const pendingReconciles = new Map<string, NodeJS.Timeout>();

/**
 * Verify Meta's X-Hub-Signature-256 over the exact raw request body.
 *
 * The header is `sha256=<hex>`. We recompute the HMAC with the app secret and
 * compare in constant time. crypto.timingSafeEqual throws when the two buffers
 * differ in length, so we MUST length-guard first (a forged/short signature
 * would otherwise crash the handler instead of being rejected).
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined | null,
  appSecret: string | undefined | null,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const received = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);
  if (received.length !== computed.length) return false;
  return crypto.timingSafeEqual(received, computed);
}

/** Account columns needed to resolve + decrypt the token for a reconcile. */
const ACCOUNT_TOKEN_SELECT = {
  id: true,
  externalAccountId: true,
  accessTokenEncrypted: true,
  tokenSource: true,
  connectionId: true,
} as const;

/**
 * Resolve an externalAccountId from a webhook to our AdAccount. Meta may send
 * the id with or without the `act_` prefix; our rows store it WITH the prefix,
 * so we look up both forms.
 */
async function findAdAccount(prisma: PrismaClient, externalIdRaw: string) {
  const digits = externalIdRaw.replace(/^act_/, '');
  const candidates = ['act_' + digits, digits];
  return prisma.adAccount.findFirst({
    where: { platform: Platform.META, externalAccountId: { in: candidates } },
    select: { id: true, externalAccountId: true },
  });
}

/**
 * Run a campaign-status reconcile for one account. Re-reads the token at fire
 * time (it may have been rotated during the debounce window). All failures are
 * logged and swallowed — this is a background accelerator, and the polling loop
 * is the durable safety net. A 190 here is left for the sync/refresh paths,
 * which own the PAUSED / NEEDS_REGRANT contract.
 */
async function runReconcile(prisma: PrismaClient, adAccountId: string): Promise<void> {
  const account = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
    select: ACCOUNT_TOKEN_SELECT,
  });
  if (!account) return;

  const resolved = await resolveAccountToken(prisma, account);
  if (!resolved.encrypted) {
    console.warn(
      `[adlytic:meta-webhook] ${account.externalAccountId} — no token available, skipping reconcile`,
    );
    return;
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(resolved.encrypted);
  } catch (e) {
    if (e instanceof TokenDecryptError) {
      console.error(
        `[adlytic:TOKEN_DECRYPT_FAILED][meta-webhook] ${account.externalAccountId} — ${e.message}`,
      );
      return;
    }
    throw e;
  }

  const meta = new MetaClient({ apiVersion: config.meta.apiVersion, accessToken });
  const worker = new SyncAccountWorker(prisma, meta);
  try {
    const r = await worker.reconcileCampaignStatuses(adAccountId, { now: new Date() });
    console.log(
      `[adlytic:meta-webhook] ${account.externalAccountId} reconciled — ` +
      `${r.campaignsUpserted} campaign(s)` + (r.frozen > 0 ? `, ${r.frozen} frozen` : ''),
    );
  } catch (e) {
    const msg = e instanceof MetaApiError
      ? `Meta ${e.status}: ${e.message}`
      : e instanceof Error ? e.message : String(e);
    console.error(`[adlytic:meta-webhook] ${account.externalAccountId} reconcile failed — ${msg}`);
  }
}

/**
 * Schedule a debounced reconcile for an account.
 *
 * Two strategies, selected at call time:
 *
 *   Redis path (config.features.webhookRedisDebounceEnabled && Redis healthy):
 *     Atomically `SET webhook:debounce:meta:{id} 1 EX 5 NX`. The first webhook
 *     for an account inside any 5-second window wins the slot cluster-wide
 *     and schedules the actual reconcile in this process; every other webhook
 *     across every instance sees the key and drops. First-event-wins
 *     semantics — cleaner under multi-instance than the old "rolling 5s
 *     after last event" reset, and atomically deduplicated by Redis.
 *
 *   In-process path (flag off or Redis unhealthy):
 *     Original last-event-wins Map debounce. Single-node correct; safe under
 *     multi-instance too (we get at most one reconcile per instance per
 *     burst, and the polling loop is the durable safety net).
 *
 *  Known limitation of the Redis path until Phase 3: the winner schedules
 *  the actual fire via setTimeout in its own process. If that process is
 *  killed (deploy, OOM) between winning and firing, the reconcile is lost
 *  for this burst. Phase 3 replaces the setTimeout with a BullMQ delayed
 *  job so a crashed winner is recovered by another worker. Until then,
 *  the periodic poll is the safety net.
 */
async function scheduleReconcile(prisma: PrismaClient, adAccountId: string): Promise<void> {
  if (config.features.webhookRedisDebounceEnabled && isRedisHealthy()) {
    const ttlSeconds = Math.ceil(DEBOUNCE_MS / 1000);
    type Outcome = 'won' | 'lost' | 'fallback';
    const outcome: Outcome = await withRedis<Outcome>(
      async (r) => {
        const res = await r.set(
          `${REDIS_DEBOUNCE_KEY_PREFIX}${adAccountId}`,
          '1',
          'EX', ttlSeconds,
          'NX',
        );
        return res === 'OK' ? 'won' : 'lost';
      },
      'fallback',
    );

    if (outcome === 'won') {
      const timer = setTimeout(() => { void runReconcile(prisma, adAccountId); }, DEBOUNCE_MS);
      if (typeof timer.unref === 'function') timer.unref();
      return;
    }
    if (outcome === 'lost') {
      // Another instance owns this 5s window — drop redundant execution.
      return;
    }
    // outcome === 'fallback' → withRedis caught a runtime failure during the
    // SET. Fall through to the in-process Map path so we don't silently drop
    // a webhook on a transient Redis hiccup.
  }

  // In-process fallback path (last-event-wins).
  const existing = pendingReconciles.get(adAccountId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingReconciles.delete(adAccountId);
    void runReconcile(prisma, adAccountId);
  }, DEBOUNCE_MS);
  if (typeof timer.unref === 'function') timer.unref();
  pendingReconciles.set(adAccountId, timer);
}

/**
 * Parse a verified Meta webhook payload and kick off debounced reconciles for
 * every distinct ad account referenced by a relevant change. Safe to call
 * fire-and-forget after the 200 ack.
 */
export async function processMetaWebhookEvent(
  prisma: PrismaClient,
  payload: unknown,
): Promise<void> {
  const root = (payload ?? {}) as { entry?: unknown };
  const entries = Array.isArray(root.entry) ? root.entry : [];

  const externalIds = new Set<string>();
  for (const entryRaw of entries) {
    const entry = (entryRaw ?? {}) as { id?: unknown; changes?: unknown };
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const changeRaw of changes) {
      const change = (changeRaw ?? {}) as { field?: unknown; value?: unknown };
      if (typeof change.field !== 'string' || !WEBHOOK_FIELDS.has(change.field)) continue;
      const value = (change.value ?? {}) as { account_id?: unknown };
      // Ad-account-level subscriptions carry the account id in value.account_id;
      // fall back to entry.id (which is the account id for these objects).
      const accountId = value.account_id ?? entry.id;
      if (accountId != null) externalIds.add(String(accountId));
    }
  }

  if (externalIds.size === 0) return;

  for (const ext of externalIds) {
    const account = await findAdAccount(prisma, ext);
    if (!account) {
      console.warn(
        `[adlytic:meta-webhook] no AdAccount for externalAccountId=${ext} — ignoring`,
      );
      continue;
    }
    await scheduleReconcile(prisma, account.id);
  }
}
