import { createHash } from "node:crypto";
import type { DbExecutor } from "../db/client";
import { ApiError } from "../errors";

function keyHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function enforceRateLimit(
  database: DbExecutor,
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const key = `${scope}:${keyHash(subject)}`;
  const result = await database.query<{ count: number; blocked: boolean }>(
    `INSERT INTO rate_limits (key, count, window_started_at, expires_at)
     VALUES ($1, 1, now(), now() + ($3 * interval '1 second'))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE
         WHEN rate_limits.expires_at <= now() THEN 1
         ELSE rate_limits.count + 1
       END,
       window_started_at = CASE
         WHEN rate_limits.expires_at <= now() THEN now()
         ELSE rate_limits.window_started_at
       END,
       expires_at = CASE
         WHEN rate_limits.expires_at <= now()
           THEN now() + ($3 * interval '1 second')
         ELSE rate_limits.expires_at
       END
     RETURNING count, count > $2 AS blocked`,
    [key, limit, windowSeconds],
  );

  if (result.rows[0]?.blocked) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
      { retryAfterSeconds: windowSeconds },
    );
  }
}
