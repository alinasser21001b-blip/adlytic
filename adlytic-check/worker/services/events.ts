import { clientEventSchema } from "../../shared/schemas";
import { HttpError, takeRateSlot, type Ctx } from "../lib";
import { requireVisitor } from "./session";

export type ServerEventName = "check_started" | "check_completed" | "check_failed" | "share_created" | "share_revoked" | "login_completed" | "payment_started" | "payment_completed" | "provider_blocked";

type Props = Record<string, string | number | boolean>;

/** Best-effort event write. Props are small scalars only — never ad text or image data. */
export async function recordEvent(db: D1Database, name: string, visitorId: string | null, analysisId: string | null, props: Props = {}): Promise<void> {
  try {
    await db
      .prepare("INSERT INTO product_events (name, visitor_id, analysis_id, created_at, props) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(name, visitorId, analysisId, Date.now(), Object.keys(props).length ? JSON.stringify(props) : null)
      .run();
  } catch (err) {
    console.error("[events] write failed:", err instanceof Error ? err.message : err);
  }
}

/** POST /api/events — allowlisted client events, strict shape, rate-limited per visitor. */
export async function handleClientEvent(c: Ctx): Promise<Response> {
  const visitorId = await requireVisitor(c);
  let body: unknown;
  try {
    const text = await c.req.text();
    if (text.length > 512) throw new Error("too large");
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "INVALID_INPUT");
  }
  const parsed = clientEventSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT");
  if (!(await takeRateSlot(c.env.DB, `events:${visitorId}`, 3_600_000, 60, Date.now()))) {
    throw new HttpError(429, "RATE_LIMITED", { retryAfter: 600 });
  }
  if (parsed.data.analysisId) {
    const owned = await c.env.DB.prepare("SELECT 1 AS ok FROM analyses WHERE id = ?1 AND visitor_id = ?2")
      .bind(parsed.data.analysisId, visitorId)
      .first();
    if (!owned) throw new HttpError(400, "INVALID_INPUT");
  }
  await recordEvent(c.env.DB, parsed.data.name, visitorId, parsed.data.analysisId ?? null);
  return c.body(null, 204);
}

const BLOCK_WINDOW_MS = 15 * 60_000;

/** True when the provider refused for billing reasons recently (credit or usage limit). */
export async function providerBlocked(db: D1Database, now = Date.now()): Promise<boolean> {
  try {
    const row = await db
      .prepare("SELECT MAX(created_at) AS at FROM product_events WHERE name = 'provider_blocked' AND created_at > ?1")
      .bind(now - BLOCK_WINDOW_MS)
      .first<{ at: number | null }>();
    return row?.at != null;
  } catch {
    return false;
  }
}
