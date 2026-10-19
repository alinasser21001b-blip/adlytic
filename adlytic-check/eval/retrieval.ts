// Offline retrieval evaluation: does the KB send the model the rules a reviewer
// would consider relevant? Labels: `relevantRules` on every fixture.
//   npx tsx eval/retrieval.ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GOALS, INDUSTRIES } from "../shared/constants";
import { applicableRules, rankBm25, RULES, type Media, type Rule } from "../worker/engine/kb";
import type { FixtureCase } from "./score";

const here = dirname(fileURLToPath(import.meta.url));
const cases: FixtureCase[] = JSON.parse(readFileSync(join(here, "fixtures/cases.json"), "utf8")).cases;

function dcg(rels: number[]): number {
  return rels.reduce((s, r, i) => s + r / Math.log2(i + 2), 0);
}

function metrics(ranked: string[], relevant: Set<string>, k: number) {
  const top = ranked.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  const ideal = dcg(Array.from({ length: Math.min(k, relevant.size) }, () => 1));
  return {
    precision: hits / k,
    recallAtK: hits / relevant.size,
    ndcg: ideal ? dcg(top.map((id) => (relevant.has(id) ? 1 : 0))) / ideal : 0,
    recallAll: [...relevant].filter((id) => ranked.includes(id)).length / relevant.size,
    sent: ranked.length,
  };
}

const strategies: Record<string, (c: FixtureCase) => string[]> = {
  // Baseline: no retrieval at all — every rule, in KB order.
  all_rules: () => RULES.map((r) => r.ruleId),
  // Deterministic applicability filter, KB order.
  filter: (c) => applicable(c).map((r) => r.ruleId),
  // Filter + BM25 over the owner's text (what the engine sends).
  filter_bm25: (c) => rankBm25(applicable(c), query(c)).map((x) => x.rule.ruleId),
};

function media(c: FixtureCase): Media[] {
  return c.mode === "text_only" ? ["text"] : c.mode === "image_only" ? ["image"] : ["image", "text"];
}
function applicable(c: FixtureCase): Rule[] {
  const vertical = c.image ? c.image.h / c.image.w >= 1.6 : false;
  return applicableRules({ media: media(c), vertical, objective: c.goal, industry: c.industry });
}
function query(c: FixtureCase): string {
  return [c.adCopy, c.audience, c.additionalContext, INDUSTRIES.find((i) => i.value === c.industry)?.labelAr, GOALS.find((g) => g.value === c.goal)?.labelAr].join(" ");
}

const out: Record<string, Record<string, number>> = {};
for (const [name, fn] of Object.entries(strategies)) {
  for (const k of [5, 8]) {
    const ms = cases.map((c) => metrics(fn(c), new Set(c.relevantRules), k));
    const mean = (f: (m: ReturnType<typeof metrics>) => number) => +(ms.reduce((a, m) => a + f(m), 0) / ms.length).toFixed(3);
    out[`${name}@${k}`] = { precision: mean((m) => m.precision), recallAtK: mean((m) => m.recallAtK), ndcg: mean((m) => m.ndcg), recallAll: mean((m) => m.recallAll), rulesSent: mean((m) => m.sent) };
  }
}
console.table(out);
const missed = cases.flatMap((c) => c.relevantRules.filter((id) => !strategies.filter_bm25!(c).includes(id)).map((id) => `${c.id}:${id}`));
console.log("labelled rules the filter excludes:", missed.length ? missed.join(" ") : "none");
