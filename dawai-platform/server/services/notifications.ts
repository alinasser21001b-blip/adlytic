import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { DbExecutor } from "../db/client";

/**
 * Safe outbox payload — never include medicine names, patient identity,
 * prescription content, or exact coordinates.
 */
export async function createNotification(
  database: DbExecutor,
  input: {
    userId: string;
    eventType: string;
    title: string;
    body: string;
    resourceType?: string;
    resourceId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `INSERT INTO notifications
      (id, user_id, event_type, title, body, resource_type, resource_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.userId,
      input.eventType,
      input.title,
      input.body,
      input.resourceType ?? null,
      input.resourceId ?? null,
    ],
  );

  const safePayload = JSON.stringify({
    eventType: input.eventType,
    resourceId: input.resourceId ?? id,
  });

  await database.query(
    `INSERT INTO notification_outbox
      (id, notification_id, safe_payload, channel, idempotency_key)
     VALUES ($1, $2, $3::jsonb, 'IN_APP', $4)`,
    [randomUUID(), id, safePayload, `inapp:${id}`],
  );

  const prefs = await database.query<{
    notification_preferences: { inApp?: boolean; push?: boolean };
  }>(
    `SELECT notification_preferences FROM patient_profiles WHERE user_id = $1`,
    [input.userId],
  );
  const pushEnabled = prefs.rows[0]?.notification_preferences?.push === true;

  if (pushEnabled) {
    const channels: Array<"FCM" | "APNS" | "WEB_PUSH"> = [];
    if (config.fcm.projectId) channels.push("FCM");
    if (config.apns.keyId) channels.push("APNS");
    channels.push("WEB_PUSH");
    for (const channel of channels) {
      await database.query(
        `INSERT INTO notification_outbox
          (id, notification_id, safe_payload, channel, status, idempotency_key)
         VALUES ($1, $2, $3::jsonb, $4, 'PENDING', $5)`,
        [
          randomUUID(),
          id,
          safePayload,
          channel,
          `${channel.toLowerCase()}:${id}`,
        ],
      );
    }
  }

  // Critical SMS boundary — enqueued only when SMS provider is configured.
  if (
    config.sms.provider !== "none" &&
    ["RESERVATION_ACTIVE", "READY_FOR_PICKUP", "RESERVATION_EXPIRED"].includes(
      input.eventType,
    )
  ) {
    await database.query(
      `INSERT INTO notification_outbox
        (id, notification_id, safe_payload, channel, status, idempotency_key)
       VALUES ($1, $2, $3::jsonb, 'SMS', 'PENDING', $4)`,
      [randomUUID(), id, safePayload, `sms:${id}`],
    );
  }

  return id;
}

/**
 * Processes pending outbox rows with optimistic claim (attempts bump).
 * Unconfigured providers stay PENDING with backoff — never fake DELIVERED.
 */
export async function processNotificationOutbox(
  database: DbExecutor,
  limit = 50,
): Promise<{ delivered: number; skipped: number; failed: number }> {
  const pending = await database.query<{
    id: string;
    channel: string;
    safe_payload: { eventType?: string; resourceId?: string };
    attempts: number;
  }>(
    `SELECT id, channel, safe_payload, attempts
     FROM notification_outbox
     WHERE status = 'PENDING' AND next_attempt_at <= now()
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  );

  let delivered = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of pending.rows) {
    const claimed = await database.query(
      `UPDATE notification_outbox
       SET attempts = attempts + 1,
           next_attempt_at = now() + interval '30 seconds'
       WHERE id = $1 AND status = 'PENDING'
       RETURNING id`,
      [row.id],
    );
    if (!claimed.rows[0]) continue;

    if (row.channel === "IN_APP") {
      await database.query(
        `UPDATE notification_outbox
         SET status = 'DELIVERED', delivered_at = now()
         WHERE id = $1`,
        [row.id],
      );
      await database.query(
        `INSERT INTO notification_delivery_logs
          (id, outbox_id, channel, status, provider_response)
         VALUES ($1, $2, $3, 'SENT', 'local-in-app')`,
        [randomUUID(), row.id, row.channel],
      );
      delivered += 1;
      continue;
    }

    const configured =
      (row.channel === "FCM" && Boolean(config.fcm.projectId)) ||
      (row.channel === "APNS" && Boolean(config.apns.keyId)) ||
      (row.channel === "SMS" && config.sms.provider !== "none");

    if (!configured || row.channel === "WEB_PUSH") {
      // Keep PENDING so operator credential wiring can resume delivery later.
      const giveUp = row.attempts >= 48;
      await database.query(
        `UPDATE notification_outbox
         SET status = CASE WHEN $2 THEN 'FAILED' ELSE 'PENDING' END,
             last_error = 'PROVIDER_NOT_CONFIGURED',
             next_attempt_at = now() + interval '6 hours'
         WHERE id = $1`,
        [row.id, giveUp],
      );
      await database.query(
        `INSERT INTO notification_delivery_logs
          (id, outbox_id, channel, status, provider_response)
         VALUES ($1, $2, $3, 'SKIPPED', 'provider-not-configured')`,
        [randomUUID(), row.id, row.channel],
      );
      skipped += 1;
      continue;
    }

    // Integration boundary: credentials present but adapter not live-wired.
    // Never report success. Retry with backoff until operator completes wiring.
    const giveUp = row.attempts >= 20;
    await database.query(
      `UPDATE notification_outbox
       SET status = CASE WHEN $2 THEN 'FAILED' ELSE 'PENDING' END,
           last_error = 'PROVIDER_ADAPTER_PENDING_CREDENTIALS',
           next_attempt_at = now() + interval '15 minutes'
       WHERE id = $1`,
      [row.id, giveUp],
    );
    await database.query(
      `INSERT INTO notification_delivery_logs
        (id, outbox_id, channel, status, provider_response)
       VALUES ($1, $2, $3, 'FAILED', 'adapter-awaiting-credentials')`,
      [randomUUID(), row.id, row.channel],
    );
    failed += 1;
  }

  return { delivered, skipped, failed };
}
