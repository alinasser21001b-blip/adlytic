import { z } from "zod";
import {
  analysisInputSchema,
  LIMITS,
  providerReportSchema,
  type AnalysisInput,
  type AnalysisMode,
  type AnalysisReport,
  type ErrorCode,
  type ProviderReport,
} from "../../shared/schemas";
import { config, HttpError, QUOTA_WINDOW_MS, randomToken, readBodyLimited, sha256Hex, utcDay, type Config, type Ctx } from "../lib";
import { buildUserText, SYSTEM_PROMPT, TOOL_NAME } from "../prompts/ad-review";
import { anthropicProvider, type VisionProvider } from "../providers/vision";
import { validateImage, type ImageMime } from "../validation/image";
import { recordEvent } from "./events";
import { enforceMode, factSource, findUnsupportedClaims, improvedCopyText, leaksScaffolding, sanitizeShareTips, stripUnsupported } from "./guards";
import { requireVisitor } from "./session";
import { verifyTurnstile } from "./turnstile";

const TOOL_SCHEMA = (() => {
  const s = z.toJSONSchema(providerReportSchema) as Record<string, unknown>;
  delete s["$schema"];
  return s;
})();
const TOOL_DESCRIPTION = "Submit the complete ad clarity review. Call exactly once with every field filled.";
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
}

type Outcome = { ok: true; report: ProviderReport; stripped: boolean } | { ok: false; code: ErrorCode; reason: string };

export async function handleCheck(c: Ctx): Promise<Response> {
  const cfg = config(c.env);
  if (!cfg.analysisEnabled) throw new HttpError(503, "ANALYSIS_DISABLED", { retryable: false });
  const visitorId = await requireVisitor(c);
  const db = c.env.DB;

  // 1. Bounded body read + strict field validation, before anything costs money.
  const ct = c.req.header("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("multipart/form-data")) throw new HttpError(400, "INVALID_INPUT");
  const raw = await readBodyLimited(c.req.raw, LIMITS.requestBytes);
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

  let image: { mime: ImageMime; bytes: Uint8Array } | undefined;
  const file = form.get("image");
  if (file && typeof file !== "string" && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    image = { mime: validateImage(bytes), bytes };
  }
  if (!image && !input.adCopy) throw new HttpError(400, "INVALID_INPUT");
  const mode: AnalysisMode = image ? (input.adCopy ? "image_and_text" : "image_only") : "text_only";

  const inputHash = await sha256Hex(
    JSON.stringify([input.industry, input.goal, input.adCopy, input.audience, input.additionalContext, image ? await sha256Hex(image.bytes) : null]),
  );

  // 2. Idempotent replay: same key never creates a second result or cost.
  const existing = await findByKey(db, visitorId, input.idempotencyKey);
  if (existing) return replay(c, existing, inputHash);

  // 3. Bot protection for a NEW operation only (a replay's token was already spent).
  await verifyTurnstile(c, input.turnstileToken, input.idempotencyKey);

  // 4. Atomic quota reservation: one conditional INSERT, evaluated serially by D1.
  const now = Date.now();
  const id = randomToken(12);
  const reserve = await db
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
  if (reserve.meta.changes !== 1) {
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
  c.executionCtx.waitUntil(recordEvent(db, "check_started", visitorId, id, { mode, industry: input.industry, goal: input.goal }));

  // 5. Provider call(s) — no open transaction is held while waiting.
  const started = Date.now();
  const apiKey = c.env.ANTHROPIC_API_KEY;
  const outcome: Outcome = apiKey
    ? await analyse(c, cfg, anthropicProvider({ apiKey, model: cfg.model, baseURL: cfg.providerBaseUrl }), id, input, mode, image)
    : { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "provider_not_configured" };
  const latency = Date.now() - started;

  if (!outcome.ok) {
    // Releasing the reservation returns the visitor's quota; provider calls stay counted in daily_usage.
    await db
      .prepare(`UPDATE analyses SET status = 'failed', error_code = ?2, latency_ms = ?3 WHERE id = ?1 AND status = 'pending'`)
      .bind(id, outcome.reason, latency)
      .run();
    c.executionCtx.waitUntil(recordEvent(db, "check_failed", visitorId, id, { reason: outcome.reason, latencyMs: latency }));
    throw new HttpError(outcome.code === "SERVICE_DAILY_LIMIT" ? 429 : 503, outcome.code, {
      retryable: outcome.code === "ANALYSIS_UNAVAILABLE",
      ...(outcome.code === "SERVICE_DAILY_LIMIT" ? { retryAfter: secondsToNextUtcDay() } : {}),
    });
  }

  const report = buildReport(id, mode, input, now, now + cfg.retentionMs, outcome.report, outcome.stripped);
  // 6. Publish only if THIS request still owns a live reservation.
  const done = await db
    .prepare(
      `UPDATE analyses SET status = 'completed', report_json = ?2, completed_at = ?3, latency_ms = ?4
       WHERE id = ?1 AND status = 'pending' AND reservation_expires_at > ?3`,
    )
    .bind(id, JSON.stringify(report), Date.now(), latency)
    .run();
  if (done.meta.changes !== 1) {
    await db.prepare(`UPDATE analyses SET status = 'failed', error_code = 'reservation_expired' WHERE id = ?1 AND status = 'pending'`).bind(id).run();
    c.executionCtx.waitUntil(recordEvent(db, "check_failed", visitorId, id, { reason: "reservation_expired", latencyMs: latency }));
    throw new HttpError(503, "ANALYSIS_UNAVAILABLE", { retryable: true });
  }
  c.executionCtx.waitUntil(recordEvent(db, "check_completed", visitorId, id, { mode, latencyMs: latency }));
  return c.json(report, 200, { "Cache-Control": "no-store" });
}

async function analyse(
  c: Ctx,
  cfg: Config,
  provider: VisionProvider,
  id: string,
  input: AnalysisInput,
  mode: AnalysisMode,
  image: { mime: ImageMime; bytes: Uint8Array } | undefined,
): Promise<Outcome> {
  const db = c.env.DB;
  const deadline = Date.now() + cfg.providerTimeoutMs;
  const baseText = buildUserText({ mode, industry: input.industry, goal: input.goal, adCopy: input.adCopy, audience: input.audience, additionalContext: input.additionalContext });
  let repairNote = "";
  let lastValid: ProviderReport | null = null;
  let inTok = 0;
  let outTok = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    // A repair needs a real slice of the budget (15 s of the default 45 s).
    if (attempt > 0 && deadline - Date.now() < cfg.providerTimeoutMs / 3) break;
    let slot: boolean;
    try {
      slot = await takeProviderSlot(db, cfg.maxProviderCallsPerDay);
    } catch (err) {
      console.error("[check] cannot verify daily ceiling — failing closed:", err instanceof Error ? err.message : err);
      return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "ceiling_unverifiable" };
    }
    if (!slot) {
      return attempt === 0
        ? { ok: false, code: "SERVICE_DAILY_LIMIT", reason: "service_daily_limit" }
        : lastValid
          ? finishWithStrip(lastValid, input)
          : { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "repair_blocked_by_ceiling" };
    }
    await db.prepare("UPDATE analyses SET provider_calls = provider_calls + 1, model = ?2 WHERE id = ?1").bind(id, provider.model).run();

    const res = await provider.review({
      system: SYSTEM_PROMPT,
      userText: repairNote ? `${baseText}\n\n${repairNote}` : baseText,
      image,
      toolName: TOOL_NAME,
      toolDescription: TOOL_DESCRIPTION,
      toolSchema: TOOL_SCHEMA,
      maxTokens: cfg.maxOutputTokens,
      deadline,
    });
    if (!res.ok) {
      console.warn(`[check] provider failure=${res.failure} status=${res.status ?? "-"} attempt=${attempt + 1}`);
      if (lastValid) return finishWithStrip(lastValid, input);
      return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: `provider_${res.failure}` };
    }
    inTok += res.inputTokens ?? 0;
    outTok += res.outputTokens ?? 0;
    await db
      .prepare("UPDATE analyses SET model = ?2, input_tokens = ?3, output_tokens = ?4 WHERE id = ?1")
      .bind(id, res.model, inTok, outTok)
      .run();
    console.log(`[check] model=${res.model} attempt=${attempt + 1} stop=${res.stopReason} in=${res.inputTokens} out=${res.outputTokens}`);

    const v = providerReportSchema.safeParse(res.toolInput);
    if (!v.success) {
      const errs = v.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      repairNote = `A previous attempt was rejected because the report did not match the required structure (${errs}). Call ${TOOL_NAME} again with a complete, valid report and keep every field concise.`;
      continue;
    }
    const r = enforceMode(v.data, mode);
    if (leaksScaffolding(r)) {
      repairNote = `A previous attempt was rejected because it echoed internal instructions or tool names. Review the ad only and call ${TOOL_NAME} again.`;
      continue;
    }
    const offenders = findUnsupportedClaims(improvedCopyText(r), factSource(input, r));
    if (offenders.length === 0) return { ok: true, report: r, stripped: false };
    lastValid = r;
    repairNote = `A previous attempt was rejected because improvedCopy introduced facts the owner never supplied (${offenders.join(", ")}). Rewrite improvedCopy using only the owner's facts; put missing details in missingInformation instead.`;
  }
  return lastValid ? finishWithStrip(lastValid, input) : { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "invalid_provider_output" };
}

/** Last resort for invented facts: drop the offending sentences rather than publish them. */
function finishWithStrip(r: ProviderReport, input: AnalysisInput): Outcome {
  const source = factSource(input, r);
  const offenders = findUnsupportedClaims(improvedCopyText(r), source);
  if (offenders.length === 0) return { ok: true, report: r, stripped: false };
  const c = r.improvedCopy;
  const cleaned = {
    opening: stripUnsupported(c.opening, offenders, source),
    body: stripUnsupported(c.body, offenders, source),
    headline: stripUnsupported(c.headline, offenders, source),
    callToAction: stripUnsupported(c.callToAction, offenders, source),
  };
  if (!cleaned.opening || !cleaned.body || !cleaned.callToAction) {
    return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "unsupported_claims_unrecoverable" };
  }
  return { ok: true, report: { ...r, improvedCopy: { ...cleaned, headline: cleaned.headline || cleaned.opening.slice(0, 120) } }, stripped: true };
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
      `SELECT id, input_hash, status, reservation_expires_at, expires_at, report_json, error_code, deleted_at
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
    return c.json(JSON.parse(row.report_json) as AnalysisReport, 200, { "Cache-Control": "no-store" });
  }
  if (row.status === "pending") {
    if (row.reservation_expires_at > now) throw new HttpError(409, "REQUEST_IN_PROGRESS", { retryAfter: 5, retryable: true });
    // Stale reservation: settle it so the old in-flight request can no longer publish.
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
