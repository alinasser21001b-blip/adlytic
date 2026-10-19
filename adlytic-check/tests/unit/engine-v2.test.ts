import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProviderReportV2 } from "../../shared/schemas";
import { amounts, priceAmounts } from "../../worker/engine/facts";
import { RULES, applicableRules, rankBm25, sourceById } from "../../worker/engine/kb";
import type { EngineHooks } from "../../worker/engine/types";
import { computeIndex, runV2, tidyProviderOutput } from "../../worker/engine/v2";
import type { VisionProvider, VisionRequest } from "../../worker/providers/vision";

const JPEG = new Uint8Array(readFileSync(new URL("../../eval/fixtures/img/f11.jpg", import.meta.url)));

function base(over: Partial<ProviderReportV2> = {}): ProviderReportV2 {
  return {
    evidence: [
      { id: "T1", source: "visible_text", text: "كنبة ٣ مقاعد", location: "top", confidence: "high" },
      { id: "V1", source: "visual_observation", text: "صورة كنبة بنية في الوسط", location: "middle", confidence: "high" },
    ],
    imageTextLegibility: "clear",
    summary: "الإعلان واضح في عرض المنتج.",
    perceivedMessage: "كنبة ثلاث مقاعد للبيع.",
    dimensions: [
      { dimension: "offer_clarity", status: "strong", level: 4, evidenceIds: ["T1", "V1"], ruleIds: ["R-OFFER-01"], observation: "المنتج ظاهر ومسمّى." },
      { dimension: "cta", status: "needs_improvement", level: 1, evidenceIds: ["U1"], ruleIds: ["R-CTA-01"], observation: "طريقة الطلب عامة." },
      { dimension: "opening", status: "strong", level: 3, evidenceIds: [], ruleIds: ["R-OPEN-01"], observation: "افتتاحية جيدة." },
      { dimension: "legibility", status: "strong", level: 4, evidenceIds: ["T1"], ruleIds: ["R-LEG-01", "R-FAKE-99"], observation: "النص كبير." },
    ],
    fixes: [{ dimension: "cta", change: "اكتب طريقة الطلب بوضوح.", why: "حتى يعرف المشتري ماذا يفعل.", evidenceIds: ["U1"], ruleIds: ["R-CTA-01"] }],
    actionSteps: ["أضف طريقة الطلب"],
    improvedCopy: { opening: "كنبة ٣ مقاعد مريحة.", body: "تصميم مريح لغرفة الجلوس.", headline: "كنبة ٣ مقاعد", callToAction: "راسلنا على الخاص" },
    alternateOpenings: ["تبحث عن كنبة لغرفة الجلوس؟"],
    alternateCallsToAction: ["اكتب لنا كلمة «كنبة» بالخاص"],
    missingInformation: [],
    limitations: [],
    shareableTips: ["اكتب طريقة الطلب بوضوح"],
    confidence: "high",
    ...over,
  };
}

function fakeProvider(outputs: unknown[]): VisionProvider & { calls: VisionRequest[] } {
  const calls: VisionRequest[] = [];
  return {
    model: "fake-model",
    calls,
    async review(req) {
      calls.push(req);
      const out = outputs[Math.min(calls.length - 1, outputs.length - 1)];
      return { ok: true, toolInput: out, model: "fake-model", inputTokens: 100, outputTokens: 50, stopReason: "tool_use" };
    },
  };
}

const hooks: EngineHooks = { beforeCall: async () => true };
const input = { industry: "furniture" as const, goal: "orders" as const, adCopy: "كنبة ٣ مقاعد بسعر ٢٨٠ ألف دينار. اطلب بالخاص.", audience: "", additionalContext: "" };

async function run(outputs: unknown[], over: Partial<Parameters<typeof runV2>[0]> = {}) {
  const provider = fakeProvider(outputs);
  const out = await runV2({ input, mode: "image_and_text", image: { mime: "image/jpeg", bytes: JPEG }, provider, timeoutMs: 30000, maxOutputTokens: 4000, hooks, showIndex: false, ...over });
  return { out, provider };
}

describe("Analyzer V2 — server validation", () => {
  it("downgrades a verdict without evidence to unknown and drops unknown rule ids", async () => {
    const { out } = await run([base()]);
    if (!out.ok) throw new Error(out.reason);
    const opening = out.report.dimensions.find((d) => d.dimension === "opening")!;
    expect(opening.status).toBe("unknown");
    expect(opening.level).toBeNull();
    expect(out.report.dimensions.find((d) => d.dimension === "legibility")!.ruleIds).toEqual(["R-LEG-01"]);
    expect(out.telemetry.repairs).toEqual(expect.arrayContaining(["evidence_link", "unknown_rule"]));
  });

  it("measures the image server-side and lists every applicable dimension in rubric order", async () => {
    const { out, provider } = await run([base()]);
    if (!out.ok) throw new Error(out.reason);
    expect(out.report.media).toMatchObject({ kind: "image", width: 1080, height: 1350, aspect: "portrait" });
    expect(out.report.evidence.find((e) => e.id === "M1")?.source).toBe("measured_metadata");
    expect(out.report.dimensions.map((d) => d.dimension)).toEqual(["offer_clarity", "cta", "opening", "legibility", "consistency", "details", "brand"]);
    expect(provider.calls[0]!.userText).toContain("R-CONS-01");
    expect(provider.calls[0]!.userText).not.toContain("R-SAFE-01"); // not vertical
  });

  it("detects a price conflict between owner text and image text and keeps both prices out of the copy", async () => {
    const r = base({
      evidence: [...base().evidence, { id: "T2", source: "visible_text", text: "٢٥٠,٠٠٠ دينار", location: "bottom", confidence: "high" }],
      dimensions: [...base().dimensions, { dimension: "consistency", status: "strong", level: 4, evidenceIds: ["T2"], ruleIds: ["R-CONS-01"], observation: "متطابق" }],
      improvedCopy: { opening: "كنبة ٣ مقاعد مريحة.", body: "السعر ٢٨٠ ألف دينار. تصميم مريح.", headline: "كنبة ٣ مقاعد", callToAction: "راسلنا على الخاص" },
    });
    const { out } = await run([r]);
    if (!out.ok) throw new Error(out.reason);
    const c = out.report.dimensions.find((d) => d.dimension === "consistency")!;
    expect(c.status).toBe("needs_improvement");
    expect(c.observation).toContain("250,000");
    expect(out.report.improvedCopy.body).not.toMatch(/٢٨٠|280/);
    expect(out.report.missingInformation[0]).toContain("أكّد السعر");
    expect(out.report.fixes[0]!.dimension).toBe("consistency");
  });

  it("repairs once on an invented offer, then strips it if the model insists", async () => {
    const bad = base({ improvedCopy: { opening: "كنبة ٣ مقاعد.", body: "توصيل مجاني لكل بغداد. تصميم مريح.", headline: "كنبة", callToAction: "اطلب الآن" }, alternateOpenings: ["خصم ٢٠٪ لفترة محدودة"] });
    const { out, provider } = await run([bad, bad]);
    if (!out.ok) throw new Error(out.reason);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]!.userText).toContain("introduced facts");
    expect(out.report.improvedCopy.body).not.toContain("مجاني");
    expect(out.report.alternateOpenings).toEqual([]);
    expect(out.telemetry.stripped).toBe(true);
    expect(out.report.limitations.some((l) => l.includes("حذفنا"))).toBe(true);
  });

  it("text-only: drops image evidence, never judges legibility, says no_image", async () => {
    const r = base({ imageTextLegibility: "clear" });
    const { out } = await run([r], { mode: "text_only", image: undefined });
    if (!out.ok) throw new Error(out.reason);
    expect(out.report.evidence.some((e) => e.source === "visible_text" || e.source === "visual_observation")).toBe(false);
    expect(out.report.dimensions.some((d) => d.dimension === "legibility")).toBe(false);
    expect(out.report.imageTextLegibility).toBe("no_image");
    expect(out.telemetry.repairs).toContain("modality");
  });

  it("redacts phone numbers in evidence, strips medical promises and prediction sentences", async () => {
    const r = base({
      evidence: [...base().evidence, { id: "T3", source: "visible_text", text: "اتصل: ٠٧٨٠ ١٢٣ ٤٥٦٧", location: "bottom", confidence: "high" }],
      summary: "الإعلان واضح. سيجلب لك طلبات كثيرة.",
      improvedCopy: { opening: "كريم يعالج حب الشباب نهائياً.", body: "كريم خفيف للبشرة.", headline: "كريم", callToAction: "اطلبي بالخاص" },
    });
    const { out } = await run([r], { input: { ...input, industry: "beauty", adCopy: "كريم يعالج حب الشباب نهائياً. اطلبي بالخاص." } });
    if (!out.ok) throw new Error(out.reason);
    expect(out.report.evidence.find((e) => e.id === "T3")!.text).toBe("اتصل: رقم هاتف");
    expect(out.report.summary).toBe("الإعلان واضح.");
    expect(out.report.improvedCopy.opening).toBe("");
    expect(out.report.limitations.some((l) => l.includes("وعداً علاجياً"))).toBe(true);
  });

  it("fails closed on two invalid outputs and never invents a fallback report", async () => {
    const { out, provider } = await run([{ nope: true }, { still: "bad" }]);
    expect(out.ok).toBe(false);
    expect(provider.calls).toHaveLength(2);
    if (!out.ok) expect(out.reason).toBe("invalid_provider_output");
  });

  it("cites only registry sources and labels secondary-only evidence", async () => {
    const { out } = await run([base()]);
    if (!out.ok) throw new Error(out.reason);
    for (const c of out.report.citations) expect(sourceById(c.sourceId)).toBeDefined();
    expect(out.report.citations.find((c) => c.sourceId === "S02")).toBeDefined(); // no-prediction guard always applies
    expect(out.report.versions).toMatchObject({ rubricVersion: "rubric-1", providerModel: "fake-model" });
  });
});

describe("index and retrieval", () => {
  it("computes a weighted index over measured dimensions only, with coverage", () => {
    const idx = computeIndex(
      [
        { dimension: "offer_clarity", labelAr: "", weight: 3, status: "strong", level: 4, evidenceIds: ["T1"], ruleIds: [], observation: "" },
        { dimension: "cta", labelAr: "", weight: 3, status: "needs_improvement", level: 1, evidenceIds: ["U1"], ruleIds: [], observation: "" },
        { dimension: "opening", labelAr: "", weight: 2, status: "unknown", level: null, evidenceIds: [], ruleIds: [], observation: "" },
        { dimension: "safe_zone", labelAr: "", weight: 1, status: "not_applicable", level: null, evidenceIds: [], ruleIds: [], observation: "" },
      ],
      false,
    );
    expect(idx).toEqual({ value: 63, coverage: 0.75, measured: 2, applicable: 3, shown: false });
  });

  it("filters rules by media, placement and industry", () => {
    const ids = (m: Parameters<typeof applicableRules>[0]) => applicableRules(m).map((r) => r.ruleId);
    expect(ids({ media: ["text"], vertical: false, objective: "orders", industry: "clothing" })).not.toContain("R-LEG-01");
    expect(ids({ media: ["image"], vertical: true, objective: "orders", industry: "clothing" })).toContain("R-SAFE-01");
    expect(ids({ media: ["image"], vertical: false, objective: "orders", industry: "clothing" })).not.toContain("R-SAFE-01");
    expect(ids({ media: ["image"], vertical: false, objective: "orders", industry: "beauty" })).toContain("G-HEALTH-01");
    expect(ids({ media: ["image"], vertical: false, objective: "orders", industry: "furniture" })).not.toContain("G-HEALTH-01");
  });

  it("ranks the price-consistency rule first for a price query", () => {
    expect(rankBm25(RULES, "تعارض السعر")[0]!.rule.ruleId).toBe("R-CONS-01");
  });

  it("normalises amounts across scripts, separators and thousand words", () => {
    expect([...amounts("٤٥٠ ألف")]).toContain("450000");
    expect([...amounts("450,000")]).toEqual(["450000"]);
    expect([...amounts("١٢٬٥٠٠")]).toEqual(["12500"]);
    expect([...priceAmounts("اتصل ٠٧٨٠١٢٣٤٥٦٧ السعر ٣٥ الف")]).toEqual(["35000"]);
  });
});

describe("video frame sampling", () => {
  it("samples the opening densely and keeps the last frame inside the video", async () => {
    const { frameTimes } = await import("../../src/features/check/video");
    expect(frameTimes(8)).toEqual([0, 0.5, 1, 2, 3, 4, 5, 6, 7, 7.9]);
    const long = frameTimes(40);
    expect(long).toHaveLength(10);
    expect(long.at(-1)).toBeLessThanOrEqual(39.95);
    expect(long.slice(0, 4)).toEqual([0, 0.5, 1, 2]);
    expect(frameTimes(1.5)).toEqual([0, 0.5, 1, 1.4]);
  });
});

describe("pre-validation tidy-up", () => {
  it("drops echoed server evidence, renumbers bad ids and follows every reference", () => {
    const raw = base({
      evidence: [
        { id: "U1", source: "visible_text", text: "echo of the owner text", confidence: "high" },
        { id: "t1", source: "visible_text", text: "كنبة ٣ مقاعد", location: "top", confidence: "high" },
        { id: "E2", source: "visual_observation", text: "كنبة بنية", location: "middle", confidence: "high" },
        { id: "M3", source: "visual_observation", text: "echo of a measurement", confidence: "high" },
      ] as never,
      dimensions: [
        { dimension: "offer_clarity", status: "strong", level: 4, evidenceIds: ["t1", "E2", "U1"], ruleIds: ["R-OFFER-01"], observation: "واضح." },
      ],
      fixes: [{ dimension: "cta", change: "اكتب طريقة الطلب.", why: "للوضوح.", evidenceIds: ["E2"], ruleIds: ["R-CTA-01"] }],
    });
    const { value, changed } = tidyProviderOutput(raw);
    const v = value as ProviderReportV2;
    expect(v.evidence.map((e) => e.id)).toEqual(["T1", "V1"]);
    expect(v.dimensions[0]!.evidenceIds).toEqual(["T1", "V1", "U1"]);
    expect(v.fixes[0]!.evidenceIds).toEqual(["V1"]);
    expect(changed).toBeGreaterThanOrEqual(5);
    expect(v.evidence[1]!.text).toBe("كنبة بنية"); // text untouched
  });

  it("makes unknown labels safe instead of failing: size removed, confidence low", () => {
    const raw = base({ evidence: [{ id: "T1", source: "visible_text", text: "٢٥٠ ألف", size: "huge", confidence: "certain" }] as never });
    const v = tidyProviderOutput(raw).value as ProviderReportV2;
    expect(v.evidence[0]).not.toHaveProperty("size");
    expect(v.evidence[0]!.confidence).toBe("low");
  });

  it("leaves a valid report unchanged", () => {
    const raw = base();
    const { value, changed } = tidyProviderOutput(raw);
    expect(changed).toBe(0);
    expect(value).toEqual(raw);
  });

  it("a report that only had cosmetic id slips now passes without a repair call", async () => {
    const slipped = base({ evidence: [{ id: "T01x", source: "visible_text", text: "كنبة ٣ مقاعد", location: "top", confidence: "high" }] as never, dimensions: [{ dimension: "offer_clarity", status: "strong", level: 4, evidenceIds: ["T01x"], ruleIds: ["R-OFFER-01"], observation: "واضح." }] });
    const { out, provider } = await run([slipped]);
    expect(provider.calls).toHaveLength(1);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.telemetry.tidied).toBeGreaterThan(0);
  });
});
