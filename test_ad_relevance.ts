// tsx test_ad_relevance.ts — pure unit test for adRelevanceIntelligence.
// No DB, no network. Asserts the ranking triple → diagnosis mapping.

import {
  diagnoseRelevance,
  normalizeRanking,
  relevanceOneLiner,
  type AdRelevanceTriple,
  type RelevanceCauseCode,
} from "./src/knowledge/adRelevanceIntelligence";

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (got === want) {
    pass++;
  } else {
    fail++;
    console.error(`  ❌ ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
}
function code(t: AdRelevanceTriple): RelevanceCauseCode {
  return diagnoseRelevance(t).code;
}

// ── normalize ────────────────────────────────────────────────────────────
eq("normalize above", normalizeRanking("above_average"), "above_average");
eq("normalize below_average → 35", normalizeRanking("below_average"), "below_average_35");
eq("normalize null", normalizeRanking(null), "unknown");
eq("normalize garbage", normalizeRanking("BOGUS"), "unknown");
eq("normalize casing", normalizeRanking("ABOVE_AVERAGE"), "above_average");

// ── unknown (ungraded) ─────────────────────────────────────────────────────
eq(
  "all unknown → RELEVANCE_UNKNOWN",
  code({ quality: "unknown", engagement: "unknown", conversion: "unknown" }),
  "RELEVANCE_UNKNOWN",
);

// ── healthy ────────────────────────────────────────────────────────────────
eq(
  "all average → HEALTHY",
  code({ quality: "average", engagement: "average", conversion: "average" }),
  "RELEVANCE_HEALTHY",
);
eq(
  "two above → HEALTHY high-conf",
  diagnoseRelevance({ quality: "above_average", engagement: "above_average", conversion: "average" }).confidence >= 0.9,
  true,
);

// ── landing/offer weakness (only conversion below) ─────────────────────────
eq(
  "conversion below only → LANDING_OR_OFFER_WEAKNESS",
  code({ quality: "average", engagement: "above_average", conversion: "below_average_20" }),
  "LANDING_OR_OFFER_WEAKNESS",
);

// ── clickbait perception (quality below, engagement fine) ──────────────────
eq(
  "quality below, engagement ok → CLICKBAIT_PERCEPTION",
  code({ quality: "below_average_20", engagement: "average", conversion: "average" }),
  "CLICKBAIT_PERCEPTION",
);

// ── weak creative relevance (engagement below, quality ok) ─────────────────
eq(
  "engagement below only → WEAK_CREATIVE_RELEVANCE",
  code({ quality: "average", engagement: "below_average_35", conversion: "average" }),
  "WEAK_CREATIVE_RELEVANCE",
);

// ── broad underperformance (two+ below) ────────────────────────────────────
eq(
  "quality+engagement below → BROAD_UNDERPERFORMANCE",
  code({ quality: "below_average_35", engagement: "below_average_20", conversion: "average" }),
  "BROAD_UNDERPERFORMANCE",
);
eq(
  "all three below → BROAD_UNDERPERFORMANCE",
  code({ quality: "below_average_20", engagement: "below_average_20", conversion: "below_average_20" }),
  "BROAD_UNDERPERFORMANCE",
);

// ── advisor copy never leaks raw enums ─────────────────────────────────────
const sample = diagnoseRelevance({ quality: "below_average_20", engagement: "average", conversion: "average" });
eq("body has no raw enum", /below_average|above_average/.test(sample.bodyAr + sample.bodyEn), false);
eq("oneLiner non-empty AR", relevanceOneLiner({ quality: "average", engagement: "average", conversion: "below_average_20" }, "AR").length > 0, true);

// ── severity monotonicity: bottom-20 ≥ bottom-35 ───────────────────────────
const b20 = diagnoseRelevance({ quality: "average", engagement: "average", conversion: "below_average_20" });
const b35 = diagnoseRelevance({ quality: "average", engagement: "average", conversion: "below_average_35" });
eq("bottom20 conf ≥ bottom35", b20.confidence >= b35.confidence, true);

console.log(`\nad-relevance intelligence: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
