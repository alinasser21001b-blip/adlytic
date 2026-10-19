import { describe, expect, it } from "vitest";
import type { AnalysisReportV2, DimensionResult } from "../../shared/schemas";
import { compareReports, overlap } from "../../worker/engine/recheck";
import type { V2Core } from "../../worker/engine/v2";

const dim = (dimension: DimensionResult["dimension"], status: DimensionResult["status"], level: number | null): DimensionResult => ({
  dimension, labelAr: dimension, weight: 1, status, level, evidenceIds: [], ruleIds: [], observation: "",
});
const index = (value: number | null, shown = false) => ({ value, coverage: 1, measured: 3, applicable: 3, shown });

function parent(over: Partial<AnalysisReportV2> = {}): AnalysisReportV2 {
  return {
    id: "parent000001", createdAt: "2026-10-19T10:00:00.000Z", originalCopy: "كنبة مخمل",
    dimensions: [dim("cta", "needs_improvement", 1), dim("legibility", "needs_improvement", 1), dim("offer_clarity", "strong", 4), dim("brand", "unknown", null)],
    fixes: [
      { dimension: "cta", change: "أضف طريقة الطلب", why: "", evidenceIds: [], ruleIds: [] },
      { dimension: "legibility", change: "كبّر السعر", why: "", evidenceIds: [], ruleIds: [] },
      { dimension: "brand", change: "أظهر اسم المتجر", why: "", evidenceIds: [], ruleIds: [] },
    ],
    improvedCopy: { opening: "كنبة مخمل مريحة لصالتك", body: "متوفرة بأكثر من لون", headline: "", callToAction: "راسلنا على الخاص" },
    index: index(50),
    ...over,
  } as AnalysisReportV2;
}
const child = (dimensions: DimensionResult[], idx = index(70)): V2Core => ({ dimensions, index: idx } as unknown as V2Core);

describe("re-check comparison", () => {
  it("classifies each earlier fix from the dimension it targeted", () => {
    const c = compareReports(parent(), child([dim("cta", "strong", 3), dim("legibility", "needs_improvement", 2), dim("offer_clarity", "strong", 3), dim("brand", "unknown", null)]), "كنبة مخمل. راسلنا على الخاص");
    expect(c.fixes.map((f) => f.outcome)).toEqual(["applied", "partly", "unclear"]);
    expect(Object.fromEntries(c.dimensions.map((d) => [d.dimension, d.change]))).toEqual({ cta: "improved", legibility: "improved", offer_clarity: "worse", brand: "not_comparable" });
    expect(c.summaryAr).toBe("الإصلاحات المطبّقة: ١ من ٣ · المحاور التي تحسّنت: ٢ · المحاور التي تراجعت: ١.");
    expect(c.copyChanged).toBe(true);
  });

  it("an unchanged dimension is not yet applied; unchanged text is reported", () => {
    const c = compareReports(parent(), child([dim("cta", "needs_improvement", 1), dim("legibility", "needs_improvement", 1)]), "كنبة  مخمل ");
    expect(c.fixes[0]!.outcome).toBe("not_yet");
    expect(c.copyChanged).toBe(false);
    expect(c.usedSuggestedCopy).toBe(false);
  });

  it("recognises the suggested copy taken over", () => {
    const c = compareReports(parent(), child([dim("cta", "strong", 3)]), "كنبة مخمل مريحة لصالتك. متوفرة بأكثر من لون. راسلنا على الخاص");
    expect(c.usedSuggestedCopy).toBe(true);
    expect(overlap("شيء مختلف تماماً", "كنبة مخمل")).toBe(0);
  });

  it("compares the index only when both reports showed it", () => {
    expect(compareReports(parent(), child([dim("cta", "strong", 3)]), "x").index).toBeUndefined();
    const c = compareReports(parent({ index: index(50, true) }), child([dim("cta", "strong", 3)], index(70, true)), "x");
    expect(c.index).toEqual({ before: 50, after: 70 });
  });
});
