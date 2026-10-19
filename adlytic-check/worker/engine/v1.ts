import { z } from "zod";
import { providerReportSchema, type ProviderReport } from "../../shared/schemas";
import { buildUserText, SYSTEM_PROMPT, TOOL_NAME } from "../prompts/ad-review";
import { enforceMode, factSource, findUnsupportedClaims, improvedCopyText, leaksScaffolding, stripUnsupported } from "../services/guards";
import type { EngineOutcome, EngineRequest, EngineTelemetry } from "./types";

// V1 engine: one forced-tool call, at most one repair, fact guard as last resort.
// Extracted unchanged from services/analysis.ts so it can be benchmarked outside the Worker.

const TOOL_SCHEMA = (() => {
  const s = z.toJSONSchema(providerReportSchema) as Record<string, unknown>;
  delete s["$schema"];
  return s;
})();
const TOOL_DESCRIPTION = "Submit the complete ad clarity review. Call exactly once with every field filled.";

export const V1_PROMPT_VERSION = "v1-2026-10-19";

export async function runV1(req: EngineRequest): Promise<EngineOutcome<ProviderReport>> {
  const { input, mode, image, provider, hooks } = req;
  const deadline = Date.now() + req.timeoutMs;
  const baseText = buildUserText({ mode, industry: input.industry, goal: input.goal, adCopy: input.adCopy, audience: input.audience, additionalContext: input.additionalContext });
  const t: EngineTelemetry = { calls: 0, repairs: [], inputTokens: 0, outputTokens: 0, model: null, stripped: false };
  let repairNote = "";
  let lastValid: ProviderReport | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    // A repair needs a real slice of the budget (15 s of the default 45 s).
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
      return lastValid ? finishWithStrip(lastValid, input, t) : { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "repair_blocked_by_ceiling", telemetry: t };
    }
    t.calls++;
    const res = await provider.review({
      system: SYSTEM_PROMPT,
      userText: repairNote ? `${baseText}\n\n${repairNote}` : baseText,
      image,
      toolName: TOOL_NAME,
      toolDescription: TOOL_DESCRIPTION,
      toolSchema: TOOL_SCHEMA,
      maxTokens: req.maxOutputTokens,
      deadline,
    });
    if (!res.ok) {
      console.warn(`[engine] provider failure=${res.failure} status=${res.status ?? "-"} detail=${res.detail ?? "-"} attempt=${attempt + 1}`);
      if (lastValid) return finishWithStrip(lastValid, input, t);
      return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: `provider_${res.failure}${res.detail ? `:${res.detail}` : ""}`, telemetry: t };
    }
    t.inputTokens += res.inputTokens ?? 0;
    t.outputTokens += res.outputTokens ?? 0;
    t.model = res.model;
    await hooks.afterCall?.({ model: res.model, inputTokens: t.inputTokens, outputTokens: t.outputTokens });
    console.log(`[engine] model=${res.model} attempt=${attempt + 1} stop=${res.stopReason} in=${res.inputTokens} out=${res.outputTokens}`);

    const v = providerReportSchema.safeParse(res.toolInput);
    if (!v.success) {
      t.repairs.push("schema");
      const errs = v.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      repairNote = `A previous attempt was rejected because the report did not match the required structure (${errs}). Call ${TOOL_NAME} again with a complete, valid report and keep every field concise.`;
      continue;
    }
    const r = enforceMode(v.data, mode);
    if (leaksScaffolding(r)) {
      t.repairs.push("scaffolding_leak");
      repairNote = `A previous attempt was rejected because it echoed internal instructions or tool names. Review the ad only and call ${TOOL_NAME} again.`;
      continue;
    }
    const offenders = findUnsupportedClaims(improvedCopyText(r), factSource(input, r));
    if (offenders.length === 0) return { ok: true, report: r, telemetry: t };
    t.repairs.push("unsupported_facts");
    lastValid = r;
    repairNote = `A previous attempt was rejected because improvedCopy introduced facts the owner never supplied (${offenders.join(", ")}). Rewrite improvedCopy using only the owner's facts; put missing details in missingInformation instead.`;
  }
  return lastValid ? finishWithStrip(lastValid, input, t) : { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "invalid_provider_output", telemetry: t };
}

/** Last resort for invented facts: drop the offending sentences rather than publish them. */
function finishWithStrip(r: ProviderReport, input: EngineRequest["input"], t: EngineTelemetry): EngineOutcome<ProviderReport> {
  const source = factSource(input, r);
  const offenders = findUnsupportedClaims(improvedCopyText(r), source);
  if (offenders.length === 0) return { ok: true, report: r, telemetry: t };
  const c = r.improvedCopy;
  const cleaned = {
    opening: stripUnsupported(c.opening, offenders, source),
    body: stripUnsupported(c.body, offenders, source),
    headline: stripUnsupported(c.headline, offenders, source),
    callToAction: stripUnsupported(c.callToAction, offenders, source),
  };
  if (!cleaned.opening || !cleaned.body || !cleaned.callToAction) {
    return { ok: false, code: "ANALYSIS_UNAVAILABLE", reason: "unsupported_claims_unrecoverable", telemetry: t };
  }
  t.stripped = true;
  return { ok: true, report: { ...r, improvedCopy: { ...cleaned, headline: cleaned.headline || cleaned.opening.slice(0, 120) } }, telemetry: t };
}
