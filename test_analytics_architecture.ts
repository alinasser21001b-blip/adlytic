/**
 * Architectural fitness tests for the analytics layer.
 *
 * These assert RULES, not behaviour. They read the source tree and fail when a
 * change violates an agreed architectural constraint — the kind of erosion that
 * unit tests never catch, because each individual violation still "works".
 *
 * The seven rules are recorded in docs/ANALYTICS_RULES.md. Every rule below
 * cites its number. Do not weaken one without changing that document first.
 *
 * Run: npx tsx test_analytics_architecture.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, 'src');

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const FILES = walk(ROOT).map((p) => ({ path: relative(__dirname, p), src: readFileSync(p, 'utf8') }));

console.log('\n── Rule 1: resolved purpose is the canonical classification ──');

check('no consumer outside the semantic core re-derives family from a raw objective', () => {
  // `objectiveKpiFamily` / `getObjectiveKpiSpec` take a RAW Meta objective and
  // are the exact API that produced the split brain. Only the semantic core may
  // call them; everyone else must go through resolveCampaignPurpose (or accept
  // an already-resolved family).
  const ALLOWED = new Set([
    'src/lib/objectiveKpis.ts',          // defines them
    'src/lib/campaignPurpose.ts',        // the canonical resolver
    'src/knowledge/metaObjectiveStandards.ts', // accepts a resolved family first
    'src/knowledge/index.ts',            // re-export barrel
  ]);
  const offenders = FILES.filter(({ path, src }) =>
    !ALLOWED.has(path) && /\b(objectiveKpiFamily|getObjectiveKpiSpec)\s*\(/.test(src),
  ).map((f) => f.path);
  assert.deepEqual(offenders, [],
    `these files re-derive campaign family from a raw objective — route them through resolveCampaignPurpose instead:\n        ${offenders.join('\n        ')}`);
});

console.log('\n── Rule 2: the raw objective is preserved for traceability ──');

check('nothing writes an inferred family back over Campaign.objective', () => {
  // The raw objective is the audit trail: it is what Meta told us. Overwriting
  // it with our inference would destroy the ability to ever re-derive or
  // disagree, and would make a classification bug unfixable after the fact.
  const offenders = FILES.filter(({ src }) =>
    /objective:\s*(purpose\.family|resolveCampaignPurpose|effectiveFamily)/.test(src),
  ).map((f) => f.path);
  assert.deepEqual(offenders, [], `inferred family written into an objective field: ${offenders.join(', ')}`);
});

check('the campaign sync derives objective only from the Meta payload', () => {
  const sync = FILES.find((f) => f.path === 'src/workers/syncAccount.ts');
  assert.ok(sync, 'syncAccount.ts not found');
  // The local `objective` binding must come straight off the Meta campaign
  // object, with no purpose resolution anywhere near the write.
  assert.match(sync!.src, /const objective = mc\["objective"\]/,
    "campaign sync must read Meta's own objective verbatim");
  assert.doesNotMatch(sync!.src, /resolveCampaignPurpose/,
    'the sync write path must never persist an inferred family into the raw objective column');
});

console.log('\n── Rule 3: UNKNOWN is a first-class state ──');

check('resolveObjectiveFamily can return null', () => {
  const src = readFileSync(join(ROOT, 'lib/objectiveKpis.ts'), 'utf8');
  assert.match(src, /export function resolveObjectiveFamily\([\s\S]{0,200}ObjectiveKpiFamily \| null/,
    'resolveObjectiveFamily must be able to say "I do not know"');
});

check("the standards layer models 'unknown' as a real family", () => {
  const src = readFileSync(join(ROOT, 'knowledge/metaObjectiveStandards.ts'), 'utf8');
  assert.match(src, /family:\s*ObjectiveKpiFamily \| 'unknown'/);
  assert.match(src, /UNKNOWN_STANDARD/, 'a neutral standard must exist for the unknown case');
});

console.log('\n── Rule 4: the ambiguous `conversions` field is frozen ──');

check('no NEW consumer reads DailyStat.conversions', () => {
  // `conversions` is a first-non-zero fallback of messages/purchases/leads —
  // one column with a different meaning per row. It is frozen at its current
  // call sites until the P2 ResultDefinition work replaces it. This ratchet
  // fails when the count grows, so the ambiguity cannot spread further.
  // MEASURED on 2026-08-08, not guessed. The ratchet only has to hold the
  // line; P2 will drive these numbers down and this map shrinks with them.
  const FROZEN_BASELINE = new Map<string, number>([
    ['src/adAssessor/assessService.ts', 3],
    ['src/adAssessor/assessment-prompt.ts', 2],
    ['src/adAssessor/schemas.ts', 1],
    ['src/api/server.ts', 4],
    ['src/engines/analytics/AnalyticsEngine.ts', 4],
    ['src/engines/analytics/aggregate.ts', 1],
    ['src/engines/analytics/calculateResultsTrend.ts', 3],
    ['src/engines/analytics/trend.ts', 2],
    ['src/engines/intelligence/AdlyticIntelligenceSystem.ts', 4],
    ['src/engines/recommendation/RecommendationEngine.ts', 1],
    ['src/engines/rules/RulesEngine.ts', 1],
    ['src/engines/rules/loadCampaignSignals.ts', 3],
    ['src/mappers/insightMapper.ts', 5],
    ['src/repositories/dailyStatsRepo.ts', 4],
    ['src/services/agent/tools/checkSuspiciousActivity.ts', 2],
    ['src/services/agent/tools/simulateBudgetShift.ts', 1],
    ['src/services/getDashboard.ts', 3],
    ['src/services/mockMeta.ts', 4],
    ['src/services/recommendation.service.ts', 2],
    ['src/services/v2ContextAssembler.ts', 2],
    ['src/web/pages/adAnalysisPage.ts', 5],
    ['src/web/pages/privacyPage.ts', 1],
  ]);
  const problems: string[] = [];
  for (const { path, src } of FILES) {
    const n = (src.match(/\bconversions\b/g) ?? []).length;
    if (n === 0) continue;
    const allowed = FROZEN_BASELINE.get(path);
    if (allowed === undefined) {
      problems.push(`${path}: NEW usage of the ambiguous \`conversions\` field (${n}×). Use an objective-aware result instead — see P2 ResultDefinition.`);
    } else if (n > allowed) {
      problems.push(`${path}: \`conversions\` usage grew ${allowed} → ${n}. The field is frozen pending P2.`);
    }
  }
  assert.deepEqual(problems, [], '\n        ' + problems.join('\n        '));
});

console.log('\n── Rule 5: three confidences stay separate ──');

check('classification, data and benchmark confidence are distinct types', () => {
  const src = readFileSync(join(ROOT, 'analytics/confidence.ts'), 'utf8');
  for (const t of ['ClassificationConfidence', 'DataConfidence', 'BenchmarkStatus']) {
    assert.match(src, new RegExp(`export type ${t}\\b`), `${t} must be its own type`);
  }
});

check('no type conflates them into one union', () => {
  const src = readFileSync(join(ROOT, 'analytics/confidence.ts'), 'utf8');
  assert.doesNotMatch(src, /export type Confidence\s*=/,
    'a single blanket `Confidence` type is exactly the conflation rule 5 forbids');
});

console.log('\n── Rule 6: applicability is enforced in the analytics layer ──');

check('computeMetric refuses an inapplicable metric', () => {
  const src = readFileSync(join(ROOT, 'analytics/metricDictionary.ts'), 'utf8');
  assert.match(src, /isMetricApplicable[\s\S]{0,200}NOT_APPLICABLE/,
    'computeMetric must gate on applicability, not trust the caller');
});

check('benchmark helpers require a sample — the gate cannot be skipped', () => {
  const src = readFileSync(join(ROOT, 'lib/smartInsights.ts'), 'utf8');
  // A required (non-optional) parameter is what makes bypass impossible.
  assert.match(src, /sample: BenchmarkSample,\n\): KpiBenchmark \| null/,
    'sample must be a REQUIRED parameter on every benchmark helper');
  assert.doesNotMatch(src, /sample\?: BenchmarkSample/,
    'an optional sample would let a caller silently skip the confidence gate');
});

console.log('\n── Rule 7: NOT_APPLICABLE / INSUFFICIENT_DATA / zero are distinct ──');

check('the unavailable reasons are separate members, not booleans', () => {
  const src = readFileSync(join(ROOT, 'analytics/metricDictionary.ts'), 'utf8');
  assert.match(src, /'NOT_APPLICABLE'/);
  assert.match(src, /'INSUFFICIENT_DATA'/);
  assert.match(src, /'UNKNOWN'/);
});

check('a zero denominator yields INSUFFICIENT_DATA, never 0', async () => {
  const { computeMetric } = await import('./src/analytics/metricDictionary');
  const r = computeMetric('cost_per_conversation', 'messaging', 5000, 0);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal((r as any).reason, 'INSUFFICIENT_DATA');
});

check('an inapplicable metric yields NOT_APPLICABLE, never 0', async () => {
  const { computeMetric } = await import('./src/analytics/metricDictionary');
  const r = computeMetric('roas', 'messaging', 100, 10);
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal((r as any).reason, 'NOT_APPLICABLE');
});

console.log('\n── Phase scope: no out-of-scope providers ──');

check('no Google Ads / TikTok adapter was added during this phase', () => {
  const offenders = FILES.filter(({ path }) =>
    /adapters\/(google|tiktok)/i.test(path),
  ).map((f) => f.path);
  assert.deepEqual(offenders, [], `out-of-scope provider work: ${offenders.join(', ')}`);
});

// computeMetric checks are async; flush before reporting.
setTimeout(() => {
  console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
  if (fail.length > 0) {
    console.error('failed: ' + fail.join(', '));
    process.exit(1);
  }
}, 100);
