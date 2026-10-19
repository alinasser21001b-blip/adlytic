import type { AnalysisReportV2, DimensionResult, RecheckComparison, RecheckDimension, RecheckFix } from "../../shared/schemas";
import { normalizeDigits } from "../services/guards";
import type { V2Core } from "./v2";

// Re-check: compare a new report with the same owner's earlier one. Deterministic and
// server-side — no extra provider call. "Applied" is inferred from the dimension the
// earlier fix targeted, never claimed by the model.

const judged = (d: DimensionResult | undefined): d is DimensionResult & { level: number } =>
  !!d && (d.status === "strong" || d.status === "needs_improvement") && typeof d.level === "number";

function dimensionChange(before: DimensionResult | undefined, after: DimensionResult | undefined): RecheckDimension["change"] {
  if (!judged(before) || !judged(after)) return "not_comparable";
  return after.level > before.level ? "improved" : after.level < before.level ? "worse" : "same";
}

function fixOutcome(before: DimensionResult | undefined, after: DimensionResult | undefined): RecheckFix["outcome"] {
  if (!judged(after)) return "unclear";
  const rose = judged(before) && after.level > before.level;
  if (after.status === "strong" && (rose || before?.status !== "strong")) return "applied";
  if (after.status === "needs_improvement") return rose ? "partly" : "not_yet";
  return "unclear";
}

function words(s: string): Set<string> {
  return new Set(
    normalizeDigits(s)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

/** Share of the new text's words that come from the suggested copy (0–1). */
export function overlap(text: string, suggested: string): number {
  const a = words(text);
  if (!a.size) return 0;
  const b = words(suggested);
  return [...a].filter((w) => b.has(w)).length / a.size;
}

const n = (k: number) => String(k).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!);

export function compareReports(parent: AnalysisReportV2, child: V2Core, newCopy: string): RecheckComparison {
  const before = new Map(parent.dimensions.map((d) => [d.dimension, d]));
  const after = new Map(child.dimensions.map((d) => [d.dimension, d]));
  const fixes: RecheckFix[] = parent.fixes.map((f) => ({
    dimension: f.dimension,
    labelAr: after.get(f.dimension)?.labelAr ?? before.get(f.dimension)?.labelAr ?? f.dimension,
    change: f.change,
    outcome: fixOutcome(before.get(f.dimension), after.get(f.dimension)),
  }));
  const dimensions: RecheckDimension[] = child.dimensions
    .filter((d) => before.has(d.dimension))
    .map((d) => ({ dimension: d.dimension, labelAr: d.labelAr, before: before.get(d.dimension)!.status, after: d.status, change: dimensionChange(before.get(d.dimension), d) }));
  const suggested = [parent.improvedCopy.opening, parent.improvedCopy.body, parent.improvedCopy.callToAction].join(" ");
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const copyChanged = clean(newCopy) !== clean(parent.originalCopy ?? "");
  const usedSuggestedCopy = copyChanged && overlap(newCopy, suggested) >= 0.6;

  const applied = fixes.filter((f) => f.outcome === "applied").length;
  const improved = dimensions.filter((d) => d.change === "improved").length;
  const worse = dimensions.filter((d) => d.change === "worse").length;
  const parts = [
    fixes.length ? `الإصلاحات المطبّقة: ${n(applied)} من ${n(fixes.length)}` : "لم تكن في الفحص السابق إصلاحات مقترحة",
    `المحاور التي تحسّنت: ${n(improved)}`,
    ...(worse ? [`المحاور التي تراجعت: ${n(worse)}`] : []),
  ];
  return {
    parentId: parent.id,
    parentCreatedAt: parent.createdAt,
    summaryAr: `${parts.join(" · ")}.`,
    fixes,
    dimensions,
    copyChanged,
    usedSuggestedCopy,
    ...(parent.index.shown && child.index.shown && parent.index.value !== null && child.index.value !== null
      ? { index: { before: parent.index.value, after: child.index.value } }
      : {}),
  };
}
