import type { AnyAnalysisReport, AssessmentStatus, DimensionStatus, PublicShareView, ShareInfo } from "../../shared/schemas";
import { HttpError, randomToken, sha256Hex, type Ctx } from "../lib";
import { recordEvent } from "./events";
import { currentUser } from "./auth";
import { currentVisitor } from "./session";

interface OwnedRow {
  id: string;
  report_json: string | null;
  share_token_hash: string | null;
  share_created_at: number | null;
}

/**
 * Owner-only lookup. A report that is missing, someone else's, deleted, or
 * expired all produce the SAME 404 — a caller cannot learn which.
 */
// Owner = the account that holds the report, or — for a report no account holds yet —
// the guest browser that created it. ?2 = now, ?3 = user id, ?4 = visitor id.
const OWNED_LIVE = `status = 'completed' AND deleted_at IS NULL AND expires_at > ?2
       AND ((?3 IS NOT NULL AND user_id = ?3) OR (user_id IS NULL AND ?4 IS NOT NULL AND visitor_id = ?4))`;

/** The stored report JSON if this owner holds a live report with this id; null otherwise (never says why). */
export async function ownedReportJson(db: D1Database, id: string, userId: string | null, visitorId: string | null): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || (!userId && !visitorId)) return null;
  const row = await db
    .prepare(`SELECT report_json FROM analyses WHERE id = ?1 AND ${OWNED_LIVE}`)
    .bind(id, Date.now(), userId, visitorId)
    .first<{ report_json: string | null }>();
  return row?.report_json ?? null;
}

async function ownedLiveReport(c: Ctx, id: string): Promise<{ visitorId: string | null; row: OwnedRow }> {
  const [visitorId, user] = await Promise.all([currentVisitor(c), currentUser(c)]);
  if (!visitorId && !user) throw new HttpError(401, "SESSION_REQUIRED");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new HttpError(404, "REPORT_NOT_FOUND");
  // Everyone but the owner gets the same 404.
  const row = await c.env.DB.prepare(`SELECT id, report_json, share_token_hash, share_created_at FROM analyses WHERE id = ?1 AND ${OWNED_LIVE}`)
    .bind(id, Date.now(), user?.id ?? null, visitorId)
    .first<OwnedRow>();
  if (!row || !row.report_json) throw new HttpError(404, "REPORT_NOT_FOUND");
  return { visitorId, row };
}

export async function getReport(c: Ctx): Promise<Response> {
  const { row } = await ownedLiveReport(c, c.req.param("id") ?? "");
  const report = JSON.parse(row.report_json!) as AnyAnalysisReport;
  return c.json(
    { report, share: row.share_token_hash ? { active: true, createdAt: new Date(row.share_created_at!).toISOString() } : { active: false } },
    200,
    { "Cache-Control": "no-store" },
  );
}

/** Creates (or rotates) the share link. Only a hash of the token is stored. */
export async function createShare(c: Ctx): Promise<Response> {
  const { visitorId, row } = await ownedLiveReport(c, c.req.param("id") ?? "");
  const token = randomToken(24);
  const now = Date.now();
  await c.env.DB.prepare("UPDATE analyses SET share_token_hash = ?2, share_created_at = ?3 WHERE id = ?1")
    .bind(row.id, await sha256Hex(token), now)
    .run();
  c.executionCtx.waitUntil(recordEvent(c.env.DB, "share_created", visitorId, row.id, { rotated: Boolean(row.share_token_hash) }));
  const info: ShareInfo = { url: `${new URL(c.req.url).origin}/s/${token}`, createdAt: new Date(now).toISOString() };
  return c.json(info, 201, { "Cache-Control": "no-store" });
}

export async function revokeShare(c: Ctx): Promise<Response> {
  const { visitorId, row } = await ownedLiveReport(c, c.req.param("id") ?? "");
  await c.env.DB.prepare("UPDATE analyses SET share_token_hash = NULL, share_created_at = NULL WHERE id = ?1").bind(row.id).run();
  c.executionCtx.waitUntil(recordEvent(c.env.DB, "share_revoked", visitorId, row.id));
  return c.body(null, 204);
}

/** Deletes the report text and its share link. The usage row stays, so quota is not refunded. */
export async function deleteReport(c: Ctx): Promise<Response> {
  const { row } = await ownedLiveReport(c, c.req.param("id") ?? "");
  await c.env.DB.prepare(
    "UPDATE analyses SET deleted_at = ?2, report_json = NULL, share_token_hash = NULL, share_created_at = NULL WHERE id = ?1",
  )
    .bind(row.id, Date.now())
    .run();
  return c.body(null, 204);
}

/** Public view — an explicit allowlist. Nothing from the private report is copied by default. */
export function toPublicView(r: AnyAnalysisReport): PublicShareView {
  if (r.schemaVersion === "2") {
    const axis = (dim: string): AssessmentStatus => v2Axis(r.dimensions.find((d) => d.dimension === dim)?.status);
    return {
      createdAt: r.createdAt,
      mode: r.mode,
      axes: { hook: axis("opening"), messageClarity: axis("offer_clarity"), visualReadability: axis("legibility"), callToAction: axis("cta") },
      tips: r.shareableTips,
    };
  }
  return {
    createdAt: r.createdAt,
    mode: r.mode,
    axes: {
      hook: r.assessments.hook.status,
      messageClarity: r.assessments.messageClarity.status,
      visualReadability: r.assessments.visualReadability.status,
      callToAction: r.assessments.callToAction.status,
    },
    tips: r.shareableTips,
  };
}

export async function findSharedView(db: D1Database, token: string): Promise<PublicShareView | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const row = await db
    .prepare(
      `SELECT report_json FROM analyses WHERE share_token_hash = ?1 AND status = 'completed'
       AND deleted_at IS NULL AND expires_at > ?2`,
    )
    .bind(await sha256Hex(token), Date.now())
    .first<{ report_json: string | null }>();
  if (!row?.report_json) return null;
  return toPublicView(JSON.parse(row.report_json) as AnyAnalysisReport);
}

function v2Axis(s: DimensionStatus | undefined): AssessmentStatus {
  return s === "strong" || s === "needs_improvement" ? s : "not_assessed";
}

/** GET /api/reports — the caller's live reports (account, or this guest browser), newest first. */
export async function listReports(c: Ctx): Promise<Response> {
  const [visitorId, user] = await Promise.all([currentVisitor(c), currentUser(c)]);
  if (!visitorId && !user) return c.json({ reports: [] }, 200, { "Cache-Control": "no-store" });
  const rows = await c.env.DB.prepare(
    `SELECT id, mode, created_at, report_json FROM analyses
     WHERE status = 'completed' AND deleted_at IS NULL AND expires_at > ?1
       AND ((?2 IS NOT NULL AND user_id = ?2) OR (user_id IS NULL AND ?3 IS NOT NULL AND visitor_id = ?3))
     ORDER BY created_at DESC LIMIT 10`,
  )
    .bind(Date.now(), user?.id ?? null, visitorId)
    .all<{ id: string; mode: string; created_at: number; report_json: string | null }>();
  const reports = rows.results.map((r) => {
    let title = "";
    try {
      title = (JSON.parse(r.report_json ?? "{}") as { perceivedMessage?: string }).perceivedMessage ?? "";
    } catch {
      title = "";
    }
    return { id: r.id, mode: r.mode, createdAt: new Date(r.created_at).toISOString(), title: title.slice(0, 120) };
  });
  return c.json({ reports }, 200, { "Cache-Control": "no-store" });
}
