import type { AnalysisReport, PublicShareView, ShareInfo } from "../../shared/schemas";
import { HttpError, randomToken, sha256Hex, type Ctx } from "../lib";
import { recordEvent } from "./events";
import { requireVisitor } from "./session";

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
async function ownedLiveReport(c: Ctx, id: string): Promise<{ visitorId: string; row: OwnedRow }> {
  const visitorId = await requireVisitor(c);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new HttpError(404, "REPORT_NOT_FOUND");
  const row = await c.env.DB.prepare(
    `SELECT id, report_json, share_token_hash, share_created_at FROM analyses
     WHERE id = ?1 AND visitor_id = ?2 AND status = 'completed' AND deleted_at IS NULL AND expires_at > ?3`,
  )
    .bind(id, visitorId, Date.now())
    .first<OwnedRow>();
  if (!row || !row.report_json) throw new HttpError(404, "REPORT_NOT_FOUND");
  return { visitorId, row };
}

export async function getReport(c: Ctx): Promise<Response> {
  const { row } = await ownedLiveReport(c, c.req.param("id") ?? "");
  const report = JSON.parse(row.report_json!) as AnalysisReport;
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
export function toPublicView(r: AnalysisReport): PublicShareView {
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
  return toPublicView(JSON.parse(row.report_json) as AnalysisReport);
}
