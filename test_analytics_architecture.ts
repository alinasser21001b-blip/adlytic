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

const FILES = walk(ROOT).map((p) => {
  const src = readFileSync(p, 'utf8');
  return { path: relative(__dirname, p), src, code: stripComments(src) };
});

/**
 * Remove comments so a rule counts CODE, not documentation.
 *
 * Without this, writing "// deprecated: do not read `conversions`" would trip
 * the rule-4 ratchet — punishing the very act of documenting the freeze.
 * Crude but sufficient: these rules only need occurrence counts.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments and JSDoc
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))  // line comments
    .join('\n');
}

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
  // MEASURED 2026-08-08 after the P2 migration. Down from the pre-P2 baseline
  // in the migrated engines (getDashboard 3→2, AnalyticsEngine 4→2,
  // calculateResultsTrend 3→1, insightMapper 5→4). What remains is largely
  // deprecation comments plus the legacy write kept for rollback safety.
  // These numbers only go DOWN. Raising one requires justifying why a new
  // reader of an ambiguous field is acceptable.
  // MEASURED 2026-08-08 after P2, counting CODE ONLY (comments stripped).
  //
  // ZERO of these are analytics readers. Every engine that once branched on
  // the ambiguous column now resolves results from the campaign's purpose.
  // What remains is the legacy write, deprecated field declarations, an
  // unrelated user-entered form field, and prose.
  //
  // These numbers only go DOWN. Raising one requires justifying why a new
  // reader of an ambiguous field is acceptable.
  const FROZEN_BASELINE = new Map<string, number>([
    // Legacy write path — kept populated for rollback safety until the column
    // is dropped in a later release (rule 6).
    ['src/mappers/insightMapper.ts', 3],
    ['src/repositories/dailyStatsRepo.ts', 4],
    ['src/services/mockMeta.ts', 4],
    // Deprecated field declarations, read by nothing.
    ['src/engines/analytics/aggregate.ts', 1],
    ['src/services/recommendation.service.ts', 1],
    // NOT the DailyStat column: the ad assessor takes a "results" figure the
    // user types into a form. Different concept, same word.
    ['src/adAssessor/assessService.ts', 3],
    ['src/adAssessor/assessment-prompt.ts', 2],
    ['src/adAssessor/schemas.ts', 1],
    ['src/web/pages/adAnalysisPage.ts', 5],
    // Prose inside string literals (tool descriptions, privacy copy).
    ['src/services/agent/tools/checkSuspiciousActivity.ts', 1],
    ['src/services/agent/tools/simulateBudgetShift.ts', 1],
    ['src/web/pages/privacyPage.ts', 1],
  ]);
  const problems: string[] = [];
  for (const { path, code } of FILES) {
    const n = (code.match(/\bconversions\b/g) ?? []).length;
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

check('no code reintroduces a derived first-non-zero results fallback', () => {
  // The exact anti-pattern P2 removed: `messages || purchases || leads` or
  // `messages ?? conversions`, which silently made "results" mean whichever
  // counter happened to be non-zero first. Only the frozen legacy write in the
  // mapper may keep the original expression.
  const PATTERNS = [
    /messages\s*\|\|\s*purchases/,
    /messages\s*\?\?\s*r?\.?conversions/,
    /conversions\s*\?\?\s*0\s*\)/,
  ];
  const ALLOWED = new Set(['src/mappers/insightMapper.ts']);
  const offenders: string[] = [];
  for (const { path, code } of FILES) {
    if (ALLOWED.has(path)) continue;
    if (PATTERNS.some((re) => re.test(code))) offenders.push(path);
  }
  assert.deepEqual(offenders, [],
    `a derived results fallback reappeared in: ${offenders.join(', ')}`);
});

check('result definitions never point at the ambiguous column', async () => {
  const { allResultDefinitions } = await import('./src/analytics/resultSemantics');
  for (const d of allResultDefinitions()) {
    assert.notEqual(String(d.resultKey), 'conversions', `${d.family} reads the frozen column`);
  }
});

console.log('\n── Rule 10: Meta actions resolve through the canonical resolver ──');

check('no file sums a set of Meta action types', () => {
  // The whole class of bug P3.5 removed. Meta's actions array describes one
  // business event at several granularities, so summing a filtered set
  // double-counts. Every family must PICK via analytics/actionSemantics.
  const ALLOWED = new Set(['src/analytics/actionSemantics.ts']);
  const offenders: string[] = [];
  for (const { path, code } of FILES) {
    if (ALLOWED.has(path)) continue;
    // A local action-type Set paired with a summing loop is the signature.
    const hasLocalSet = /(MESSAGE|PURCHASE|LEAD|LANDING_PAGE_VIEW|ACTION)_[A-Z_]*TYPES\s*=\s*new Set/.test(code);
    const sumsActions = /total\s*\+=|sum\s*\+=/.test(code) && /action_type/.test(code);
    if (hasLocalSet || sumsActions) offenders.push(path);
  }
  assert.deepEqual(offenders, [],
    `these files build their own action-type vocabulary or sum actions — route them through resolveActionCount:\n        ${offenders.join('\n        ')}`);
});

check('every action family picks rather than sums', async () => {
  const { allActionFamilies } = await import('./src/analytics/actionSemantics');
  for (const f of allActionFamilies()) {
    assert.equal(f.aggregationRule, 'PICK_FIRST_PRESENT', f.familyKey);
  }
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
