import {
  analysisInputSchema,
  LIMITS,
  type AnalysisInput,
  type AnalysisMode,
  type AnalysisReport,
  type AnalysisReportV2,
  type AnyAnalysisReport,
  type ProviderReport,
} from "../../shared/schemas";
import { config, HttpError, QUOTA_WINDOW_MS, randomToken, readBodyLimited, sha256Hex, utcDay, type Config, type Ctx } from "../lib";
import type { EngineHooks, EngineOutcome, EngineTelemetry } from "../engine/types";
import { runV1 } from "../engine/v1";
import { runV2, type V2Core } from "../engine/v2";
import { anthropicProvider } from "../providers/vision";
import { validateImage, type ImageMime } from "../validation/image";
import { parseVideo, VIDEO_LIMITS, type VideoInput } from "../validation/video";
import { transcribe } from "./asr";
import { recordEvent } from "./events";
import { sanitizeShareTips } from "./guards";
import { PRICE_VERSION } from "../../shared/credits";
import { currentUser, requireUser, type CurrentUser } from "./auth";
import { balanceOf, consume, release, reserve } from "./credits";
import { requireVisitor } from "./session";
import { verifyTurnstile } from "./turnstile";

const STRIP_NOTE = "حذفنا من النص المقترح جملة تضمنت رقماً أو عرضاً لم تذكره أنت — أضفه بنفسك فقط إذا كان صحيحاً.";
const CONTENT_ONLY_NOTE = "هذه مراجعة لوضوح المحتوى فقط، ولا تتنبأ بعدد الطلبات أو المبيعات.";

interface AnalysisRow {
  id: string;
  input_hash: string;
  status: "pending" | "completed" | "failed";
  reservation_expires_at: number;
  expires_at: number;
  report_json: string | null;
  error_code: string | null;
  deleted_at: number | null;
  user_id: string | null;
  credit_bucket: string | null;
}

type Outcome = EngineOutcome<ProviderReport> | EngineOutcome<V2Core>;
const EMPTY_TELEMETRY: EngineTelemetry = { calls: 0, repairs: [], inputTokens: 0, outputTokens: 0, model: null, stripped: false };

/** Every real provider call is counted against the service-wide daily ceiling and on the row. */
function providerHooks(db: D1Database, id: string, cfg: Config): EngineHooks {
  return {
    async beforeCall() {
      const slot = await takeProviderSlot(db, cfg.maxProviderCallsPerDay);
      if (slot) await db.prepare("UPDATE analyses SET provider_calls = provider_calls + 1, model = ?2 WHERE id = ?1").bind(id, cfg.model).run();
      return slot;
    },
    async afterCall(u) {
      await db
        .prepare("UPDATE analyses SET model = ?2, input_tokens = ?3, output_tokens = ?4, cache_write_tokens = ?5, cache_read_tokens = ?6 WHERE id = ?1")
        .bind(id, u.model, u.inputTokens, u.outputTokens, u.cacheWriteTokens ?? null, u.cacheReadTokens ?? null)
        .run();
    },
  };
}

export async function handleCheck(c: Ctx): Promise<Response> {
  const cfg = config(c.env);
  if (!cfg.analysisEnabled) throw new HttpError(503, "ANALYSIS_DISABLED", { retryable: false });
  const visitorId = await requireVisitor(c);
  // With accounts on, checks run on the account's credits; guests keep the V1 weekly quota otherwise.
  const user: CurrentUser | null = cfg.accountsEnabled ? await requireUser(c) : null;
  const db = c.env.DB;

  // 1. Bounded body read + strict field validation, before anything costs money.
  const ct = c.req.header("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("multipart/form-data")) throw new HttpError(400, "INVALID_INPUT");
  const raw = await readBodyLimited(c.req.raw, c.req.query("media") === "video" ? VIDEO_LIMITS.requestBytes : LIMITS.requestBytes);
  let form: FormData;
  try {
    form = await new Response(raw as Uint8Array<ArrayBuffer>, { headers: { "content-type": ct } }).formData();
  } catch {
    throw new HttpError(400, "INVALID_INPUT");
  }
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = analysisInputSchema.safeParse({
    industry: field("industry"),
    goal: field("goal"),
    adCopy: field("adCopy"),
    audience: field("audience"),
    additionalContext: field("additionalContext"),
    idempotencyKey: field("idempotencyKey"),
    turnstileToken: field("turnstileToken"),
  });
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT");
  const input = parsed.data;
  const creditField = field("credit") ?? "free";
  if (creditField !== "free" && creditField !== "paid") throw new HttpError(400, "INVALID_INPUT");
  const priceVersion = field("priceVersion") ?? null;

  let image: { mime: ImageMime; bytes: Uint8Array } | undefined;
  let video: VideoInput | undefined;
  if (form.has("video_meta")) {
    if (!cfg.videoEnabled) throw new HttpError(503, "VIDEO_UNAVAILABLE", { retryable: false });
    video = await parseVideo(form);
  } else {
    const file = form.get("image");
    if (file && typeof file !== "string" && file.size > 0) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      image = { mime: validateImage(bytes), bytes };
    }
  }
  if (!image && !video && !input.adCopy) throw new HttpError(400, "INVALID_INPUT");
  const mode: AnalysisMode = image || video ? (input.adCopy ? "image_and_text" : "image_only") : "text_only";
  const mediaHash = video
    ? await sha256Hex(JSON.stringify([video.durationSec, ...(await Promise.all(video.frames.map((f) => sha256Hex(f.bytes)))), video.audio ? await sha256Hex(new Uint8Array(video.audio.pcm.buffer)) : null]))
    : image
      ? await sha256Hex(image.bytes)
      : null;

  const inputHash = await sha256Hex(JSON.stringify([input.industry, input.goal, input.adCopy, input.audience, input.additionalContext, mediaHash]));

  // 2. Idempotent replay: same key never creates a second result or cost.
  const existing = await findByKey(db, visitorId, input.idempotencyKey);
  if (existing) return replay(c, existing, inputHash);

  // 3. Bot protection for a NEW operation only (a replay's token was already spent).
  await verifyTurnstile(c, input.turnstileToken, input.idempotencyKey);

  // 4. Atomic reservation. Accounts: one D1 batch settles expired leases, applies
  //    refills and takes a unit from the chosen bucket. Guests: one conditional INSERT.
  const now = Date.now();
  const id = randomToken(12);
  if (user) {
    if (creditField === "paid" && priceVersion !== PRICE_VERSION) throw new HttpError(409, "PRICE_CHANGED", { retryable: false });
    const r = await reserve(
      db,
      { id, visitorId, userId: user.id, idempotencyKey: input.idempotencyKey, inputHash, mode, industry: input.industry, goal: input.goal, now, leaseUntil: now + cfg.reservationTtlMs, expiresAt: now + cfg.retentionMs },
      creditField,
      cfg.freeRefillMs,
      creditField === "paid" ? PRICE_VERSION : null,
    );
    if (!r.ok) {
      if (r.reason === "duplicate") {
        const raced = await findByKey(db, visitorId, input.idempotencyKey);
        if (raced) return replay(c, raced, inputHash);
        throw new HttpError(409, "REQUEST_IN_PROGRESS", { retryAfter: 5, retryable: true });
      }
      if (r.reason === "no_paid_units") throw new HttpError(402, "INSUFFICIENT_CREDITS", { retryable: false });
      const b = await balanceOf(db, user.id, now, cfg.freeRefillMs);
      // Never spend a paid unit silently: ask for consent when one exists.
      if (b.paidAvailable > 0) throw new HttpError(409, "PAID_CONSENT_REQUIRED", { retryable: false });
      const retryAfter = b.nextRefillAt ? Math.max(60, Math.ceil((Date.parse(b.nextRefillAt) - now) / 1000)) : 3600;
      throw new HttpError(429, "FREE_QUOTA_EXHAUSTED", { retryAfter, retryable: false });
    }
  } else {
  const reserveRes = await db
    .prepare(
      `INSERT OR IGNORE INTO analyses
         (id, visitor_id, idempotency_key, input_hash, status, mode, industry, goal, created_at, reservation_expires_at, expires_at)
       SELECT ?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7, ?8, ?9, ?10
       WHERE (SELECT COUNT(*) FROM analyses
              WHERE visitor_id = ?2 AND created_at > ?11
                AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > ?8))) < ?12`,
    )
    .bind(id, visitorId, input.idempotencyKey, inputHash, mode, input.industry, input.goal, now, now + cfg.reservationTtlMs, now + cfg.retentionMs, now - QUOTA_WINDOW_MS, cfg.weeklyLimit)
    .run();
  if (reserveRes.meta.changes !== 1) {
    const raced = await findByKey(db, visitorId, input.idempotencyKey);
    if (raced) return replay(c, raced, inputHash);
    const oldest = await db
      .prepare(
        `SELECT MIN(created_at) AS oldest FROM analyses WHERE visitor_id = ?1 AND created_at > ?2
           AND (status = 'completed' OR (status = 'pending' AND reservation_expires_at > ?3))`,
      )
      .bind(visitorId, now - QUOTA_WINDOW_MS, now)
      .first<{ oldest: number | null }>();
    const retryAfter = oldest?.oldest ? Math.max(60, Math.ceil((oldest.oldest + QUOTA_WINDOW_MS - now) / 1000)) : 3600;
    throw new HttpError(429, "QUOTA_EXCEEDED", { retryAfter, retryable: false });
  }
  }
  c.executionCtx.waitUntil(
    db.prepare("UPDATE analyses SET media_kind = ?2 WHERE id = ?1").bind(id, video ? "video" : image ? "image" : "text").run().then(() => recordEvent(db, "check_started", visitorId, id, { mode, media: video ? "video" : image ? "image" : "text", industry: input.industry, goal: input.goal })),
  );

  // 5. Provider call(s) — no open transaction is held while waiting.
  const started = Date.now();
  const apiKey = c.env.ANTHROPIC_API_KEY;
  const engineReq = apiKey
    ? {
        input,
        mode,
        image,
        provider: anthropicProvider({ apiKey, model: cfg.model, baseURL: cfg.providerBaseUrl }),
        timeoutMs: cfg.providerTimeoutMs,
        maxOutputTokens: cfg.maxOutputTokens,
        hooks: providerHooks(db, id, cfg),
      }
    : null;
  // Video: transcribe only now that a unit is reserved; the audio is never stored.
  const engineVideo = video && engineReq
    ? {
        durationSec: video.durationSec,
        width: video.width,
        height: video.height,
        frames: video.frames.map((f) => ({ mime: f.mime, bytes: f.bytes, timeSec: f.timeSec })),
        transcript: await transcribe(c.env, video.audio, video.audioPresence),
      }
    : undefined;
  const outcome: Outcome = !engineReq
    ? { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "provider_not_configured", telemetry: EMPTY_TELEMETRY }
    : cfg.analyzer === "v2" || engineVideo
      ? await runV2({ ...engineReq, video: engineVideo, showIndex: cfg.showQualityIndex, promptCache: cfg.promptCache, secondOpinion: cfg.indexSecondOpinion })
      : await runV1(engineReq);
  const latency = Date.now() - started;
  if (outcome.telemetry.repairs.length) console.log(`[check] repairs=${outcome.telemetry.repairs.join(",")} calls=${outcome.telemetry.calls}`);

  if (!outcome.ok) {
    // Releasing the reservation returns the unit; provider calls stay counted in daily_usage.
    if (user) await release(db, user.id, id, outcome.reason.slice(0, 120), latency, Date.now(), cfg.freeRefillMs);
    else
      await db
        .prepare(`UPDATE analyses SET status = 'failed', error_code = ?2, latency_ms = ?3 WHERE id = ?1 AND status = 'pending'`)
        .bind(id, outcome.reason.slice(0, 120), latency)
        .run();
    c.executionCtx.waitUntil(recordEvent(db, "check_failed", visitorId, id, { reason: outcome.reason.slice(0, 120), latencyMs: latency }));
    // Billing refusals will not clear by retrying: pause analysis honestly and flag health.
    if (/credit_balance_too_low|usage_limit_reached/.test(outcome.reason)) {
      c.executionCtx.waitUntil(recordEvent(db, "provider_blocked", null, id, { reason: outcome.reason.slice(0, 120) }));
      throw new HttpError(503, "ANALYSIS_DISABLED", { retryable: false });
    }
    throw new HttpError(outcome.code === "SERVICE_DAILY_LIMIT" ? 429 : 503, outcome.code, {
      retryable: outcome.code === "ANALYSIS_UNAVAILABLE",
      ...(outcome.code === "SERVICE_DAILY_LIMIT" ? { retryAfter: secondsToNextUtcDay() } : {}),
    });
  }

  const report: AnyAnalysisReport =
    "schemaVersion" in outcome.report
      ? buildReportV2(id, mode, input, now, now + cfg.retentionMs, outcome.report as V2Core)
      : buildReport(id, mode, input, now, now + cfg.retentionMs, outcome.report as ProviderReport, outcome.telemetry.stripped);
  // 6. Publish only if THIS request still owns a live reservation (that is when the unit is spent).
  const published = user
    ? await consume(db, user.id, id, JSON.stringify(report), latency, Date.now(), cfg.freeRefillMs)
    : (
        await db
          .prepare(
            `UPDATE analyses SET status = 'completed', report_json = ?2, completed_at = ?3, latency_ms = ?4
             WHERE id = ?1 AND status = 'pending' AND reservation_expires_at > ?3`,
          )
          .bind(id, JSON.stringify(report), Date.now(), latency)
          .run()
      ).meta.changes === 1;
  if (!published) {
    if (user) await release(db, user.id, id, "reservation_expired", latency, Date.now(), cfg.freeRefillMs);
    else await db.prepare(`UPDATE analyses SET status = 'failed', error_code = 'reservation_expired' WHERE id = ?1 AND status = 'pending'`).bind(id).run();
    c.executionCtx.waitUntil(recordEvent(db, "check_failed", visitorId, id, { reason: "reservation_expired", latencyMs: latency }));
    throw new HttpError(503, "ANALYSIS_UNAVAILABLE", { retryable: true });
  }
  c.executionCtx.waitUntil(recordEvent(db, "check_completed", visitorId, id, { mode, latencyMs: latency }));
  return c.json(report, 200, { "Cache-Control": "no-store" });
}

function buildReport(id: string, mode: AnalysisMode, input: AnalysisInput, createdAt: number, expiresAt: number, r: ProviderReport, stripped: boolean): AnalysisReport {
  const limitations = [...r.limitations];
  if (!limitations.some((l) => l.includes("لا تتنبأ") || l.includes("لا يمكن التنبؤ"))) limitations.unshift(CONTENT_ONLY_NOTE);
  if (stripped) limitations.push(STRIP_NOTE);
  if (mode === "text_only") limitations.push("هذا التقرير يغطي النص فقط؛ لم تُرسل صورة للتحليل.");
  return {
    schemaVersion: "1",
    id,
    mode,
    industry: input.industry,
    goal: input.goal,
    createdAt: new Date(createdAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    ...r,
    limitations: limitations.slice(0, 5),
    shareableTips: sanitizeShareTips(r.shareableTips),
  };
}

function buildReportV2(id: string, mode: AnalysisMode, input: AnalysisInput, createdAt: number, expiresAt: number, core: V2Core): AnalysisReportV2 {
  return {
    ...core,
    id,
    mode,
    industry: input.industry,
    goal: input.goal,
    createdAt: new Date(createdAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    shareableTips: sanitizeShareTips(core.shareableTips),
  };
}

async function takeProviderSlot(db: D1Database, max: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO daily_usage (day, provider_calls) VALUES (?1, 1)
       ON CONFLICT (day) DO UPDATE SET provider_calls = provider_calls + 1 WHERE provider_calls < ?2
       RETURNING provider_calls`,
    )
    .bind(utcDay(Date.now()), max)
    .first<{ provider_calls: number }>();
  return row != null;
}

async function findByKey(db: D1Database, visitorId: string, key: string): Promise<AnalysisRow | null> {
  return db
    .prepare(
      `SELECT id, input_hash, status, reservation_expires_at, expires_at, report_json, error_code, deleted_at, user_id, credit_bucket
       FROM analyses WHERE visitor_id = ?1 AND idempotency_key = ?2`,
    )
    .bind(visitorId, key)
    .first<AnalysisRow>();
}

async function replay(c: Ctx, row: AnalysisRow, inputHash: string): Promise<Response> {
  const now = Date.now();
  if (row.input_hash !== inputHash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", { retryable: false });
  if (row.status === "completed") {
    if (row.deleted_at || row.expires_at <= now || !row.report_json) throw new HttpError(404, "REPORT_NOT_FOUND");
    return c.json(JSON.parse(row.report_json) as AnyAnalysisReport, 200, { "Cache-Control": "no-store" });
  }
  if (row.status === "pending") {
    if (row.reservation_expires_at > now) throw new HttpError(409, "REQUEST_IN_PROGRESS", { retryAfter: 5, retryable: true });
    // Stale reservation: settle it so the old in-flight request can no longer publish.
    if (row.user_id && row.credit_bucket) {
      await release(c.env.DB, row.user_id, row.id, "reservation_expired", null, now, config(c.env).freeRefillMs);
      throw new HttpError(503, "ANALYSIS_UNAVAILABLE", { retryable: true });
    }
    await c.env.DB.prepare(
      `UPDATE analyses SET status = 'failed', error_code = 'reservation_expired' WHERE id = ?1 AND status = 'pending' AND reservation_expires_at <= ?2`,
    )
      .bind(row.id, now)
      .run();
    throw new HttpError(503, "ANALYSIS_UNAVAILABLE", { retryable: true });
  }
  if (row.error_code === "service_daily_limit") throw new HttpError(429, "SERVICE_DAILY_LIMIT", { retryAfter: secondsToNextUtcDay() });
  throw new HttpError(503, "ANALYSIS_UNAVAILABLE", { retryable: true });
}

function secondsToNextUtcDay(): number {
  const now = Date.now();
  return Math.max(60, Math.ceil((Math.ceil(now / 86_400_000) * 86_400_000 - now) / 1000));
}
