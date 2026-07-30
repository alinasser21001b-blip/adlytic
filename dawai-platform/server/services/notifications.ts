import { randomUUID } from "node:crypto";
import type { DbExecutor } from "../db/client";

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
  await database.query(
    `INSERT INTO notification_outbox
      (id, notification_id, safe_payload, channel)
     VALUES ($1, $2, $3::jsonb, 'IN_APP')`,
    [
      randomUUID(),
      id,
      JSON.stringify({
        eventType: input.eventType,
        resourceId: input.resourceId ?? id,
      }),
    ],
  );
  return id;
}
