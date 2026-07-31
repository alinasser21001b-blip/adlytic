import { createHash } from "node:crypto";
import type { DbExecutor } from "../db/client";
import { ApiError } from "../errors";

export function requestFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function getIdempotentResource(
  database: DbExecutor,
  input: {
    principalId: string;
    operation: string;
    key: string | undefined;
    requestHash: string;
  },
): Promise<string | null> {
  if (!input.key || input.key.length < 8 || input.key.length > 200) {
    throw new ApiError(
      422,
      "IDEMPOTENCY_KEY_REQUIRED",
      "يلزم مفتاح آمن لإعادة المحاولة.",
    );
  }
  const result = await database.query<{
    resource_id: string;
    request_hash: string;
  }>(
    `SELECT resource_id, request_hash FROM idempotency_keys
     WHERE principal_id = $1 AND operation = $2 AND key = $3
       AND expires_at > now()`,
    [input.principalId, input.operation, input.key],
  );
  const existing = result.rows[0];
  if (!existing) return null;
  if (existing.request_hash !== input.requestHash) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "استُخدم مفتاح إعادة المحاولة لطلب مختلف.",
    );
  }
  return existing.resource_id;
}

export async function recordIdempotency(
  database: DbExecutor,
  input: {
    principalId: string;
    operation: string;
    key: string;
    resourceId: string;
    requestHash: string;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO idempotency_keys
      (principal_id, operation, key, resource_id, request_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '24 hours')`,
    [
      input.principalId,
      input.operation,
      input.key,
      input.resourceId,
      input.requestHash,
    ],
  );
}
