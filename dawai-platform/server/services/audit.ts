import { randomUUID } from "node:crypto";
import type { DbExecutor } from "../db/client";

export async function writeAudit(
  database: DbExecutor,
  input: {
    actorUserId?: string;
    actorRole?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    result?: "SUCCESS" | "DENIED" | "FAILED";
    requestId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO audit_events
      (id, actor_user_id, actor_role, action, resource_type, resource_id, result, request_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      randomUUID(),
      input.actorUserId ?? null,
      input.actorRole ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.result ?? "SUCCESS",
      input.requestId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
