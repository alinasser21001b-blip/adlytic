import { z } from "zod";
import {
  GOALS,
  INDUSTRIES,
  providerReportV2Schema,
  type AnalysisReportV2,
  type CheckedRule,
  type Citation,
  type DimensionResult,
  type EvidenceItem,
  type FixResult,
  type ProviderReportV2,
  type QualityIndex,
} from "../../shared/schemas";
import { PROMPT_VERSION_V2, SYSTEM_PROMPT_V2, TOOL_NAME_V2, buildUserTextV2 } from "../prompts/ad-review-v2";
import { leaksScaffolding } from "../services/guards";
import { aspectOf, imageDimensions } from "../validation/dimensions";
import { MEDICAL_RE, amounts, predicts, phoneNumbers, priceAmounts, stripSentences, unsupportedAmounts, unsupportedClaimTerms } from "./facts";
import {
  KNOWLEDGE_VERSION,
  RUBRIC_VERSION,
  applicableDimensions,
  retrieve,
  ruleById,
  sourceById,
  type Dimension,
  type Media,
  type Rule,
} from "./kb";
import type { EngineOutcome, EngineRequest, EngineTelemetry, RepairReason } from "./types";

// Analyzer V2: evidence → retrieved rules → anchored rubric → fixes → copy, then
// deterministic server validation. The model proposes; the server decides what is
// published (evidence links, rule ids, modality, facts, index).

const TOOL_SCHEMA = (() => {
  const s = z.toJSONSchema(providerReportV2Schema) as Record<string, unknown>;
  delete s["$schema"];
  return s;
})();
const TOOL_DESCRIPTION = "Submit the complete evidence-linked ad review. Call exactly once with every field filled.";

export type V2Core = Omit<AnalysisReportV2, "id" | "mode" | "industry" | "goal" | "createdAt" | "expiresAt">;

const NOTE_CONTENT_ONLY = "هذه مراجعة لوضوح المحتوى فقط، ولا تتنبأ بعدد الطلبات أو المبيعات أو بطريقة توزيع ميتا للإعلان.";
const NOTE_STRIPPED = "حذفنا من النص المقترح جملة تضمنت رقماً أو عرضاً لم تذكره أنت — أضفه بنفسك فقط إذا كان صحيحاً.";
const NOTE_MEDICAL = "حذفنا من النص المقترح وعداً علاجياً؛ الإعلانات لا يجب أن تعد بنتائج طبية.";
const UNKNOWN_OBS = "لم تكفِ الأدلة لتقييم هذا الجانب بثقة.";
const NA_OBS = "لا ينطبق على هذا النوع من الإعلانات.";

export async function runV2(req: EngineRequest & { showIndex?: boolean }): Promise<EngineOutcome<V2Core>> {
  const { input, mode, image, provider, hooks } = req;
  const deadline = Date.now() + req.timeoutMs;
  const t: EngineTelemetry = { calls: 0, repairs: [], inputTokens: 0, outputTokens: 0, model: null, stripped: false };

  const video = req.video;
  const visual: Media = video ? "video" : "image";
  const media: Media[] = mode === "text_only" ? ["text"] : mode === "image_only" ? [visual] : [visual, "text"];
  const dims = video ? { width: video.width, height: video.height } : image ? imageDimensions(image.bytes) : null;
  const aspect = dims ? aspectOf(dims) : undefined;
  const vertical = aspect === "vertical";
  const appDims = applicableDimensions(media, vertical);
  const industryLabel = INDUSTRIES.find((i) => i.value === input.industry)?.labelAr ?? "";
  const goalLabel = GOALS.find((g) => g.value === input.goal)?.labelAr ?? "";
  const rules = retrieve({ media, vertical, objective: input.goal, industry: input.industry, query: [input.adCopy, input.audience, input.additionalContext, industryLabel, goalLabel].join(" ") });

  const serverEvidence: EvidenceItem[] = [];
  if (input.adCopy) serverEvidence.push({ id: "U1", source: "user_supplied", text: clip(input.adCopy), confidence: "high" });
  if (input.audience) serverEvidence.push({ id: "U2", source: "user_supplied", text: clip(input.audience), confidence: "high" });
  if (input.additionalContext) serverEvidence.push({ id: "U3", source: "user_supplied", text: clip(input.additionalContext), confidence: "high" });
  if (video && aspect) {
    serverEvidence.push({ id: "M1", source: "measured_metadata", text: `فيديو مدته ${video.durationSec} ثانية، ${video.width}×${video.height} (${ASPECT_AR[aspect]})`, confidence: "high" });
    serverEvidence.push({ id: "M3", source: "measured_metadata", text: `حُللت ${video.frames.length} لقطات عند: ${video.frames.map((f) => f.timeSec).join("، ")} ث`, confidence: "high" });
    serverEvidence.push({ id: "M4", source: "measured_metadata", text: AUDIO_AR[video.transcript.status], confidence: "high" });
    video.transcript.segments.forEach((seg, n) =>
      serverEvidence.push({ id: `A${n + 1}`, source: "audio_transcript", text: clip(seg.text), timeSec: seg.start, confidence: "medium" }),
    );
  } else if (dims && aspect) serverEvidence.push({ id: "M1", source: "measured_metadata", text: `أبعاد الصورة ${dims.width}×${dims.height} (${ASPECT_AR[aspect]})`, confidence: "high" });
  if (!image && !video) serverEvidence.push({ id: "M2", source: "measured_metadata", text: "لم تُرفق صورة؛ التقييم للنص فقط.", confidence: "high" });

  const baseText = (repairNote?: string) =>
    buildUserTextV2({
      mode, industry: input.industry, goal: input.goal, adCopy: input.adCopy, audience: input.audience, additionalContext: input.additionalContext,
      measured: serverEvidence
        .filter((e) => e.source === "measured_metadata" || e.source === "audio_transcript")
        .map((e) => `${e.id}${e.timeSec != null ? ` [${e.timeSec}s]` : ""}: ${e.source === "audio_transcript" ? fence(e.text) : e.text}`),
      dimensions: appDims, rules, repairNote, video: video ? { frames: video.frames.length } : undefined,
    });

  let repairNote = "";
  let lastValid: V2Core | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && deadline - Date.now() < req.timeoutMs / 3) break;
    let slot: boolean;
    try {
      slot = await hooks.beforeCall(attempt);
    } catch (err) {
      console.error("[engine] cannot verify daily ceiling — failing closed:", err instanceof Error ? err.message : err);
      return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "ceiling_unverifiable", telemetry: t };
    }
    if (!slot) {
      if (attempt === 0) return { ok: false, code: "SERVICE_DAILY_LIMIT", reason: "service_daily_limit", telemetry: t };
      break;
    }
    t.calls++;
    const res = await provider.review({
      system: SYSTEM_PROMPT_V2,
      userText: baseText(repairNote || undefined),
      image,
      images: video?.frames.map((f) => ({ mime: f.mime, bytes: f.bytes, label: `لقطة عند ${f.timeSec} ث (frame at ${f.timeSec}s)` })),
      toolName: TOOL_NAME_V2,
      toolDescription: TOOL_DESCRIPTION,
      toolSchema: TOOL_SCHEMA,
      maxTokens: req.maxOutputTokens,
      deadline,
    });
    if (!res.ok) {
      console.warn(`[engine] provider failure=${res.failure} status=${res.status ?? "-"} detail=${res.detail ?? "-"} attempt=${attempt + 1}`);
      if (lastValid) break;
      return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: `provider_${res.failure}${res.detail ? `:${res.detail}` : ""}`, telemetry: t };
    }
    t.inputTokens += res.inputTokens ?? 0;
    t.outputTokens += res.outputTokens ?? 0;
    t.model = res.model;
    await hooks.afterCall?.({ model: res.model, inputTokens: t.inputTokens, outputTokens: t.outputTokens });
    console.log(`[engine] v2 model=${res.model} attempt=${attempt + 1} stop=${res.stopReason} in=${res.inputTokens} out=${res.outputTokens}`);

    const tidy = tidyProviderOutput(res.toolInput);
    if (tidy.changed) t.tidied = (t.tidied ?? 0) + tidy.changed;
    const v = providerReportV2Schema.safeParse(tidy.value);
    if (!v.success) {
      t.repairs.push("schema");
      t.schemaPaths = [...(t.schemaPaths ?? []), ...v.error.issues.slice(0, 3).map((i) => schemaPath(i.path, tidy.value))];
      const errs = v.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      repairNote = `A previous attempt was rejected because the report did not match the required structure (${errs}). Call ${TOOL_NAME_V2} again with a complete, valid report and keep every field short.`;
      continue;
    }
    if (leaksScaffolding(v.data) || /submit_ad_review_v2|ad_submission/i.test(JSON.stringify(v.data))) {
      t.repairs.push("scaffolding_leak");
      repairNote = `A previous attempt was rejected because it echoed internal instructions or tool names. Review the ad only and call ${TOOL_NAME_V2} again.`;
      continue;
    }
    const built = assemble(v.data, { mode, industry: input.industry, input, serverEvidence, appDims, rules, image: !!image || !!video, dims, aspect, showIndex: !!req.showIndex, model: res.model, video }, t.repairs);
    const offenders = copyOffenders(built.core, built.factSources);
    if (offenders.length === 0) return { ok: true, report: built.core, telemetry: t };
    t.repairs.push("unsupported_facts");
    lastValid = built.core;
    repairNote = `A previous attempt was rejected because the improved copy or alternates introduced facts the owner never supplied (${offenders.join(", ")}). Use only facts from U1–U3 or high-confidence visible_text; put missing details in missingInformation.`;
    // keep the sources of this attempt for the final strip
    (lastValid as V2Core & { __sources?: string[] }).__sources = built.factSources;
  }
  if (!lastValid) return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "invalid_provider_output", telemetry: t };
  const sources = (lastValid as V2Core & { __sources?: string[] }).__sources ?? [];
  delete (lastValid as V2Core & { __sources?: string[] }).__sources;
  const stripped = stripCopy(lastValid, sources);
  if (!stripped) return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "unsupported_claims_unrecoverable", telemetry: t };
  t.stripped = true;
  stripped.limitations = [...stripped.limitations, NOTE_STRIPPED].slice(0, 5);
  return { ok: true, report: stripped, telemetry: t };
}

const ASPECT_AR = { vertical: "عمودية 9:16 تقريباً", portrait: "طولية", square: "مربعة", landscape: "عرضية" } as const;
const AUDIO_AR = {
  no_audio: "الفيديو بلا مسار صوت.",
  silence: "لا يوجد كلام مسموع في الصوت (صمت أو موسيقى فقط).",
  speech_transcribed: "نُسخ الكلام المسموع في الفيديو.",
  unavailable: "تعذّر تحليل الصوت؛ قيّمنا الصورة والنص فقط.",
} as const;

const MODEL_EVIDENCE_ID = /^[TVA]\d{1,2}$/;
const SERVER_EVIDENCE_ID = /^[UM]\d{1,2}$/i;
const ID_PREFIX: Record<string, string> = { visible_text: "T", visual_observation: "V", audio_transcript: "A" };
const SIZES = new Set(["large", "medium", "small", "tiny"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

/**
 * Deterministic tidy-up before validation, so a cosmetic slip does not cost a
 * repair call. Server-owned evidence the model echoes back (U#, M#) is dropped —
 * the server already holds it; other off-pattern evidence ids are renumbered by
 * kind and every reference follows; an unknown optional `size` is removed; an
 * unknown evidence confidence becomes "low" (low-confidence text never feeds
 * the copy). No text is changed.
 */
export function tidyProviderOutput(raw: unknown): { value: unknown; changed: number } {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { evidence?: unknown }).evidence)) return { value: raw, changed: 0 };
  const r = structuredClone(raw) as { evidence: unknown[]; dimensions?: unknown; fixes?: unknown };
  let changed = 0;
  const rename = new Map<string, string>();
  const used = new Set<string>();
  const kept: Array<Record<string, unknown>> = [];
  const renumber: Array<Record<string, unknown>> = [];
  for (const item of r.evidence) {
    if (!item || typeof item !== "object") {
      kept.push(item as Record<string, unknown>);
      continue;
    }
    const e = item as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.trim() : "";
    if (SERVER_EVIDENCE_ID.test(id)) {
      changed++;
      continue;
    }
    const upper = id.toUpperCase();
    if (MODEL_EVIDENCE_ID.test(upper) && !used.has(upper)) {
      if (upper !== e.id) rename.set(String(e.id), upper), (e.id = upper), changed++;
      used.add(upper);
    } else if (typeof e.source === "string" && ID_PREFIX[e.source]) {
      renumber.push(e);
    }
    if (e.size !== undefined && !SIZES.has(e.size as string)) delete e.size, changed++;
    if (!CONFIDENCES.has(e.confidence as string)) (e.confidence = "low"), changed++;
    kept.push(e);
  }
  for (const e of renumber) {
    const prefix = ID_PREFIX[e.source as string]!;
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    const next = `${prefix}${n}`;
    // A duplicate id keeps pointing at its first holder; only a unique bad id is followed.
    if (typeof e.id === "string" && !rename.has(e.id) && !used.has(e.id.trim().toUpperCase())) rename.set(e.id, next);
    e.id = next;
    used.add(next);
    changed++;
  }
  r.evidence = kept;
  const follow = (ids: unknown) =>
    Array.isArray(ids)
      ? ids.map((x) => {
          if (typeof x !== "string") return x;
          const to = rename.get(x) ?? (/^[umtva]\d{1,2}$/i.test(x.trim()) ? x.trim().toUpperCase() : x);
          if (to !== x) changed++;
          return to;
        })
      : ids;
  for (const list of [r.dimensions, r.fixes]) {
    if (!Array.isArray(list)) continue;
    for (const d of list) if (d && typeof d === "object" && "evidenceIds" in d) (d as { evidenceIds: unknown }).evidenceIds = follow((d as { evidenceIds: unknown }).evidenceIds);
  }
  return { value: r, changed };
}

/** Failing field path with array indexes folded; for label-like fields also the offending value (never free text). */
function schemaPath(path: PropertyKey[], value: unknown): string {
  const folded = path.join(".").replace(/\.\d+(\.|$)/g, ".#$1");
  const last = String(path.at(-1));
  if (!["id", "source", "confidence", "size", "location", "status", "dimension", "imageTextLegibility"].includes(last)) return folded;
  let at: unknown = value;
  for (const k of path) at = at && typeof at === "object" ? (at as Record<PropertyKey, unknown>)[k] : undefined;
  const shown = typeof at === "string" ? at.slice(0, 16) : at === undefined ? "missing" : typeof at;
  return `${folded}=${shown}`;
}

/** Neutralise anything in a transcript that could close or forge our delimiters. */
function fence(s: string): string {
  return s.replace(/</g, "‹").replace(/>/g, "›");
}

function clip(s: string, n = 220): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface Ctx {
  mode: string;
  industry: string;
  input: EngineRequest["input"];
  serverEvidence: EvidenceItem[];
  appDims: Dimension[];
  rules: Rule[];
  image: boolean;
  dims: { width: number; height: number } | null;
  aspect?: "vertical" | "portrait" | "square" | "landscape";
  showIndex: boolean;
  model: string;
  video?: EngineRequest["video"];
}

/** Deterministic validation of everything the model proposed. */
export function assemble(raw: ProviderReportV2, ctx: Ctx, repairs: RepairReason[]): { core: V2Core; factSources: string[] } {
  // 1. Evidence: modality, ids, personal data.
  const seen = new Set(ctx.serverEvidence.map((e) => e.id));
  const modelEvidence: EvidenceItem[] = [];
  for (const e of raw.evidence) {
    if (seen.has(e.id)) continue;
    if (!ctx.image && (e.source === "visible_text" || e.source === "visual_observation")) {
      if (!repairs.includes("modality")) repairs.push("modality");
      continue;
    }
    if (e.source === "audio_transcript") continue; // no audio in image checks
    seen.add(e.id);
    modelEvidence.push({ ...e, text: redactPhones(e.text), location: e.location ?? "unknown", timeSec: e.timeSec ?? null });
  }
  const evidence = [...ctx.serverEvidence, ...modelEvidence];
  const evIds = new Set(evidence.map((e) => e.id));
  // Text-only: anything the model "saw" can only have come from the owner's text.
  const droppedToOwner = !ctx.image && evIds.has("U1");
  const linkIds = (ids: string[]) => [...new Set(ids.map((id) => (!evIds.has(id) && droppedToOwner && /^[TV]/.test(id) ? "U1" : id)).filter((id) => evIds.has(id)))];
  const ruleIds = new Set(ctx.rules.map((r) => r.ruleId));

  // 2. Dimensions: fixed order, every applicable dimension present, links verified.
  const byDim = new Map(raw.dimensions.map((d) => [d.dimension, d]));
  const dimensions: DimensionResult[] = ctx.appDims.map((d) => {
    const m = byDim.get(d.id);
    if (!m) return { dimension: d.id, labelAr: d.labelAr, weight: d.weight, status: "unknown", level: null, evidenceIds: [], ruleIds: [], observation: UNKNOWN_OBS };
    const ev = linkIds(m.evidenceIds);
    const rl = m.ruleIds.filter((id) => ruleIds.has(id) && (ruleById(id)?.dimension === d.id || ruleById(id)?.dimension === "guard"));
    if (m.ruleIds.length !== rl.length && !repairs.includes("unknown_rule")) repairs.push("unknown_rule");
    let status = m.status;
    let level = m.level;
    if ((status === "strong" || status === "needs_improvement") && ev.length === 0) {
      if (!repairs.includes("evidence_link")) repairs.push("evidence_link");
      status = "unknown";
      level = null;
    }
    if (status === "unknown" || status === "not_applicable") level = null;
    if (status === "strong") level = level === null ? 3 : Math.max(3, level);
    if (status === "needs_improvement") level = level === null ? 2 : Math.min(2, level);
    return { dimension: d.id, labelAr: d.labelAr, weight: d.weight, status, level, evidenceIds: ev, ruleIds: rl, observation: status === "unknown" && !ev.length ? UNKNOWN_OBS : status === "not_applicable" && !m.observation ? NA_OBS : m.observation };
  });

  // 3. Server-detected price conflict between owner text and high-confidence image text.
  const ownerText = [ctx.input.adCopy, ctx.input.audience, ctx.input.additionalContext].join("\n");
  const imageText = modelEvidence.filter((e) => e.source === "visible_text" && e.confidence === "high").map((e) => e.text).join("\n");
  const ownerPrices = priceAmounts(ownerText);
  const imagePrices = priceAmounts(imageText);
  const conflict = ownerPrices.size > 0 && imagePrices.size > 0 && ![...ownerPrices].some((p) => imagePrices.has(p));
  const missing = [...raw.missingInformation];
  if (conflict) {
    const consistency = dimensions.find((d) => d.dimension === "consistency");
    const textIds = modelEvidence.filter((e) => e.source === "visible_text" && [...priceAmounts(e.text)].length).map((e) => e.id);
    const note = `السعر في الصورة (${[...imagePrices].map(fmt).join("، ")}) يختلف عن السعر في النص (${[...ownerPrices].map(fmt).join("، ")}).`;
    if (consistency && consistency.status !== "needs_improvement") {
      consistency.status = "needs_improvement";
      consistency.level = 1;
      consistency.evidenceIds = [...new Set(["U1", ...textIds])].filter((id) => evIds.has(id));
      consistency.ruleIds = ruleIds.has("R-CONS-01") ? ["R-CONS-01"] : [];
      consistency.observation = note;
    }
    missing.unshift(`أكّد السعر الصحيح قبل النشر: ${note}`);
  }

  // 4. Fixes: real problems only, linked to evidence, ordered by rubric weight.
  const weight = new Map(ctx.appDims.map((d) => [d.id, d.weight]));
  const fixes: FixResult[] = raw.fixes
    .map((f) => ({ ...f, evidenceIds: linkIds(f.evidenceIds), ruleIds: f.ruleIds.filter((id) => ruleIds.has(id)) }))
    .filter((f) => weight.has(f.dimension) && f.evidenceIds.length > 0)
    .map((f) => ({ dimension: f.dimension, labelAr: ctx.appDims.find((d) => d.id === f.dimension)!.labelAr, change: f.change, why: f.why, evidenceIds: f.evidenceIds, ruleIds: f.ruleIds }));
  if (conflict && !fixes.some((f) => f.dimension === "consistency")) {
    fixes.unshift({ dimension: "consistency", labelAr: ctx.appDims.find((d) => d.id === "consistency")?.labelAr ?? "تطابق الصورة والنص", change: "وحّد السعر بين الصورة والنص قبل النشر.", why: "سعران مختلفان يربكان المشتري ويدفعانه للسؤال بدل الطلب.", evidenceIds: ["U1"].filter((id) => evIds.has(id)), ruleIds: ruleIds.has("R-CONS-01") ? ["R-CONS-01"] : [] });
  }
  // A factual contradiction outranks every style issue; otherwise rubric weight decides.
  const rank = (f: FixResult) => (conflict && f.dimension === "consistency" ? 100 : weight.get(f.dimension) ?? 0);
  fixes.sort((a, b) => rank(b) - rank(a));

  // 5. Copy: never publish a price the sources disagree on; no medical promises.
  let improvedCopy = { ...raw.improvedCopy };
  let alternateOpenings = [...raw.alternateOpenings];
  let alternateCallsToAction = [...raw.alternateCallsToAction];
  const limitations = [NOTE_CONTENT_ONLY, ...raw.limitations.filter((l) => !predicts(l))];
  if (conflict) {
    const disputed = new Set([...ownerPrices, ...imagePrices]);
    const hit = (s: string) => [...amounts(s)].some((a) => disputed.has(a));
    improvedCopy = mapCopy(improvedCopy, (s) => stripSentences(s, hit));
    alternateOpenings = alternateOpenings.filter((s) => !hit(s));
    alternateCallsToAction = alternateCallsToAction.filter((s) => !hit(s));
  }
  if (ctx.industry === "beauty" && [improvedCopy.opening, improvedCopy.body, improvedCopy.headline, improvedCopy.callToAction, ...alternateOpenings].some((s) => MEDICAL_RE.test(s))) {
    improvedCopy = mapCopy(improvedCopy, (s) => stripSentences(s, (x) => MEDICAL_RE.test(x)));
    alternateOpenings = alternateOpenings.filter((s) => !MEDICAL_RE.test(s));
    limitations.push(NOTE_MEDICAL);
  }
  if (!improvedCopy.headline) improvedCopy.headline = improvedCopy.opening.slice(0, 120);

  // 6. Index: computed here from anchored levels, over measured dimensions only.
  const index = computeIndex(dimensions, ctx.showIndex);

  // 7. What we checked, and the sources behind it — resolved from the registry only.
  const usedRuleIds = new Set([...dimensions.flatMap((d) => d.ruleIds), ...fixes.flatMap((f) => f.ruleIds)]);
  for (const r of ctx.rules) if (r.dimension === "guard") usedRuleIds.add(r.ruleId);
  const checkedRules: CheckedRule[] = ctx.rules.map((r) => ({ ruleId: r.ruleId, dimension: r.dimension, principleAr: r.principleAr, judgeability: r.judgeability, evidenceStrength: r.evidenceStrength, sourceIds: r.sources.map((s) => s.sourceId) }));
  const citations: Citation[] = [];
  const citedIds = new Set<string>();
  for (const id of usedRuleIds) for (const s of ruleById(id)?.sources ?? []) citedIds.add(s.sourceId);
  for (const id of citedIds) {
    const s = sourceById(id);
    if (!s) continue;
    citations.push({ sourceId: s.sourceId, title: s.title, publisher: s.publisher, url: s.url, evidenceType: s.evidenceType, access: s.access, publishedAt: s.publishedAt, secondaryOnly: s.verification === "unverified_secondary" });
  }

  const noPrediction = (s: string) => (predicts(s) ? stripSentences(s, predicts) : s);
  const core: V2Core = {
    schemaVersion: "2",
    versions: { rubricVersion: RUBRIC_VERSION, knowledgeVersion: KNOWLEDGE_VERSION, promptVersion: PROMPT_VERSION_V2, providerModel: ctx.model },
    summary: noPrediction(raw.summary),
    perceivedMessage: noPrediction(raw.perceivedMessage),
    imageTextLegibility: ctx.image ? (raw.imageTextLegibility === "no_image" ? "no_text_in_image" : raw.imageTextLegibility) : "no_image",
    media: ctx.video && ctx.aspect
      ? { kind: "video", width: ctx.video.width, height: ctx.video.height, aspect: ctx.aspect, durationSec: ctx.video.durationSec, frameTimes: ctx.video.frames.map((f) => f.timeSec), audio: ctx.video.transcript.status }
      : ctx.dims && ctx.aspect
        ? { kind: "image", width: ctx.dims.width, height: ctx.dims.height, aspect: ctx.aspect }
        : { kind: "none" },
    ...(ctx.video
      ? {
          coverageAr: `حللنا ${ctx.video.frames.length} لقطات من فيديو مدته ${ctx.video.durationSec} ثانية (من ${ctx.video.frames[0]?.timeSec ?? 0} إلى ${ctx.video.frames.at(-1)?.timeSec ?? 0} ث)، وليس كل إطار. ${AUDIO_AR[ctx.video.transcript.status]}`,
          timeline: evidence
            .filter((e) => typeof e.timeSec === "number" && (e.source === "visible_text" || e.source === "visual_observation" || e.source === "audio_transcript"))
            .map((e) => ({ timeSec: e.timeSec as number, source: e.source, text: e.text }))
            .sort((a, b) => a.timeSec - b.timeSec)
            .slice(0, 30),
        }
      : {}),
    evidence,
    dimensions: dimensions.map((d) => ({ ...d, observation: noPrediction(d.observation) })),
    index,
    fixes: fixes.slice(0, 3).map((f) => ({ ...f, change: noPrediction(f.change), why: noPrediction(f.why) })),
    actionSteps: raw.actionSteps.map(noPrediction).filter(Boolean).slice(0, 3),
    originalCopy: ctx.input.adCopy,
    improvedCopy,
    alternateOpenings,
    alternateCallsToAction,
    missingInformation: missing.slice(0, 5),
    limitations: limitations.slice(0, 5),
    checkedRules,
    citations,
    shareableTips: raw.shareableTips,
    confidence: raw.confidence,
  };
  // Spoken words in the owner's video are the owner's facts too.
  const spoken = ctx.serverEvidence.filter((e) => e.source === "audio_transcript").map((e) => e.text);
  const factSources = [ownerText, ...spoken, ...modelEvidence.filter((e) => e.source === "visible_text" && e.confidence !== "low").map((e) => e.text)];
  return { core, factSources };
}

export function computeIndex(dimensions: DimensionResult[], shown: boolean): QualityIndex {
  const applicable = dimensions.filter((d) => d.status !== "not_applicable");
  const measured = applicable.filter((d) => d.level !== null && (d.status === "strong" || d.status === "needs_improvement"));
  const wApp = applicable.reduce((a, d) => a + d.weight, 0);
  const wMeas = measured.reduce((a, d) => a + d.weight, 0);
  const value = wMeas > 0 ? Math.round((100 * measured.reduce((a, d) => a + d.weight * (d.level! / 4), 0)) / wMeas) : null;
  return { value, coverage: wApp ? +(wMeas / wApp).toFixed(2) : 0, measured: measured.length, applicable: applicable.length, shown };
}

function copyTexts(c: V2Core): string[] {
  return [c.improvedCopy.opening, c.improvedCopy.body, c.improvedCopy.headline, c.improvedCopy.callToAction, ...c.alternateOpenings, ...c.alternateCallsToAction];
}

export function copyOffenders(c: V2Core, sources: string[]): string[] {
  const text = copyTexts(c).join("\n");
  return [...unsupportedAmounts(text, sources), ...unsupportedClaimTerms(text, sources)];
}

function stripCopy(c: V2Core, sources: string[]): V2Core | null {
  const bad = (s: string) => unsupportedAmounts(s, sources).length > 0 || unsupportedClaimTerms(s, sources).length > 0;
  const improvedCopy = mapCopy(c.improvedCopy, (s) => stripSentences(s, bad));
  if (!improvedCopy.opening || !improvedCopy.body || !improvedCopy.callToAction) return null;
  if (!improvedCopy.headline) improvedCopy.headline = improvedCopy.opening.slice(0, 120);
  return { ...c, improvedCopy, alternateOpenings: c.alternateOpenings.filter((s) => !bad(s)), alternateCallsToAction: c.alternateCallsToAction.filter((s) => !bad(s)) };
}

function mapCopy<T extends Record<string, string>>(c: T, f: (s: string) => string): T {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, f(v)])) as T;
}

function redactPhones(s: string): string {
  let out = s;
  for (const p of phoneNumbers(s)) {
    // Replace each digit run that forms the number, tolerant to separators.
    const pattern = p.split("").map((d) => `[${d}${"٠١٢٣٤٥٦٧٨٩"[Number(d)]}]`).join("[\\s-]?");
    out = out.replace(new RegExp(pattern, "g"), "رقم هاتف");
  }
  return out.replace(/\+?\s?964[\s-]?رقم هاتف/g, "رقم هاتف");
}

function fmt(a: string): string {
  return Number(a).toLocaleString("en-US");
}
