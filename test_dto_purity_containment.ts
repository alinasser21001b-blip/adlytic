/**
 * Phase 8 — DTO Purity + Frontend Intelligence Containment.
 *
 * Governance correction #5 applies throughout: the line is authority (canonical
 * metric identity / objective semantics / anomaly / diagnosis / recommendation /
 * KPI calculation), not the mere presence of arithmetic in a page file. Legitimate
 * derived display math (cost-per-result — no canonical per-day field exists for
 * an arbitrary result unit; window/aggregate CPM in AI-agent tools — no canonical
 * field exists for a custom date-range sum) is deliberately left untouched and is
 * NOT covered by a "must not recompute" assertion here.
 *
 * What actually changed, re-verified against current HEAD before editing (the
 * plan's own line numbers had already drifted from Phases 4-7's edits):
 *   1. CPM per-day trend series in FOUR places recomputed spend÷impressions×1000
 *      instead of reading the canonical, Meta-sourced daily_stats.cpm column
 *      already on the same row — getDashboard.ts, server.ts's campaign-inspector
 *      route, campaignsPage.ts, dashboardPage.ts's fallback branch. A fifth,
 *      detectAnomaly.ts's z-score baseline extractor, had the same bug for BOTH
 *      cpm and ctr, found via the same sweep (Phase 4 touched this file's issue-
 *      suppression logic; this is the separate metric-extraction layer).
 *   2. resultInfoId/efficiencyInfoId (objectiveKpis.ts's glossary-id fields)
 *      never reached the DTO at 3 server.ts sites; campaignsPage.ts's client-side
 *      re-derivation ternary had no linkClicks branch and silently defaulted to
 *      the wrong glossary entry. layout.ts's METRIC_GLOSSARY had no link_clicks
 *      entry at all.
 *   3. The confidence-band threshold (0.75/0.5, normalize-then-clamp) was
 *      reimplemented three times (dashboardPage.ts, beginnerDashboardPage.ts,
 *      diagnoses.ts) — one copy (diagnoses.ts) skipped the normalize step,
 *      a latent scale bug. Consolidated into dashboard/lib/confidence.ts.
 *   4. The dashboardPage.ts:2790-era "asymmetric confidence-scale" line was
 *      re-investigated by tracing both producers (buildAllMoveItems() and the
 *      task-derived assignments above it) and found to be CORRECT, not a bug —
 *      confBadge's own normalization plus primary.confidence's guaranteed 0-100
 *      construction make the asymmetric-looking division safe. Documented with
 *      a comment, not "fixed" (there was nothing to fix).
 *   5. evidence.knowledgeBase was opaque Json; now typed as MetricBreach.
 *
 * Run: npx tsx test_dto_purity_containment.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const getDashboardSrc = readFileSync(join(__dirname, 'src/services/getDashboard.ts'), 'utf8');
const serverSrc = readFileSync(join(__dirname, 'src/api/server.ts'), 'utf8');
const campaignsPageSrc = readFileSync(join(__dirname, 'src/web/pages/campaignsPage.ts'), 'utf8');
const dashboardPageSrc = readFileSync(join(__dirname, 'src/web/pages/dashboardPage.ts'), 'utf8');
const beginnerPageSrc = readFileSync(join(__dirname, 'src/web/pages/beginnerDashboardPage.ts'), 'utf8');
const diagnosesSrc = readFileSync(join(__dirname, 'src/web/pages/dashboard/sections/diagnoses.ts'), 'utf8');
const layoutSrc = readFileSync(join(__dirname, 'src/web/layout.ts'), 'utf8');
const detectAnomalySrc = readFileSync(join(__dirname, 'src/services/agent/tools/detectAnomaly.ts'), 'utf8');

console.log('\n── 1. CPM per-day series reads the canonical field, not a recompute ──');

check('getDashboard.ts trendSeries.cpm reads d.cpm, not a spend÷impressions recompute', () => {
  assert.ok(/cpm: daily\.map\(\(d: any\) => \{[\s\S]{0,200}?d\.cpm/.test(getDashboardSrc),
    'must read d.cpm inside the cpm trend-series builder');
  const cpmBlockMatch = getDashboardSrc.match(/cpm: daily\.map\(\(d: any\) => \{[\s\S]*?\}\),\n\s*costPerResult/);
  assert.ok(cpmBlockMatch, 'the cpm block must be found');
  assert.ok(!cpmBlockMatch![0].includes('* 1000'), 'must not recompute CPM via spend/impressions*1000 anymore');
});

check('server.ts campaign-inspector trendSeries.cpm reads d.cpm, not a recompute', () => {
  const idx = serverSrc.indexOf("trendSeries: (() => {");
  assert.ok(idx >= 0, 'the inspector trendSeries IIFE must be found');
  const block = serverSrc.slice(idx, idx + 4000);
  const cpmBlock = block.match(/cpm: asc\.map\(\(d\) => \{[\s\S]*?\}\),/);
  assert.ok(cpmBlock, 'the cpm block must be found');
  assert.ok(cpmBlock![0].includes('d.cpm'), 'must read d.cpm');
  assert.ok(!cpmBlock![0].includes('* 1000'), 'must not recompute CPM via spend/impressions*1000 anymore');
});

check('campaignsPage.ts per-day chart reads d.cpm, not a spend÷impressions recompute', () => {
  const cpmBlock = campaignsPageSrc.match(/var cpmData = rows\.map\(function \(d\) \{[\s\S]*?\}\);/);
  assert.ok(cpmBlock, 'cpmData block must be found');
  assert.ok(cpmBlock![0].includes('d.cpm'), 'must read d.cpm');
  assert.ok(!cpmBlock![0].includes('* 1000'), 'must not recompute CPM via spend/impressions*1000 anymore');
});

check('dashboardPage.ts fallback branch reads row.cpm, not a spend÷impressions recompute', () => {
  const block = dashboardPageSrc.match(/var ctrV = Number\(row\.ctr\);[\s\S]*?cprSeries\.push/);
  assert.ok(block, 'the fallback per-day block must be found');
  assert.ok(block![0].includes('row.cpm'), 'must read row.cpm');
  assert.ok(!block![0].includes('* 1000'), 'must not recompute CPM via spend/impressions*1000 anymore');
});

check('dashboardPage.ts trendSeries branch (already-correct prior fix) is untouched', () => {
  assert.ok(dashboardPageSrc.includes('trendSeries.cpm is already MAJOR after getDashboard fix'),
    'the pre-existing correct branch and its comment must still be present');
});

check('detectAnomaly.ts extractMetric prefers stored row.cpm/row.ctr over a recompute', () => {
  const block = detectAnomalySrc.match(/function extractMetric\([\s\S]*?\n\}/);
  assert.ok(block, 'extractMetric must be found');
  assert.ok(/case 'ctr': return row\.ctr \?\?/.test(block![0]), 'ctr must prefer row.ctr');
  assert.ok(/case 'cpm': return row\.cpm \?\?/.test(block![0]), 'cpm must prefer row.cpm');
});

console.log('\n── 2. Legitimate window/aggregate CPM math is left untouched (not a violation) ──');

check('cost-per-result client derivation in campaignsPage.ts is untouched (no canonical per-day field exists)', () => {
  assert.ok(campaignsPageSrc.includes('Cost per result across DIFFERENT units has no defined value'),
    'the existing mixed-unit-withholding comment/logic must still be present, unmodified by this phase');
});

check("getDashboard.ts's window-total CPM (avgCpm-style aggregate) is untouched", () => {
  assert.ok(getDashboardSrc.includes('Window-total CPM = (Σspend_major / Σimpressions) × 1000'),
    'the window-aggregate CPM helper must still exist — no canonical field exists for a custom-range sum');
});

console.log('\n── 3. resultInfoId/efficiencyInfoId reach the DTO; linkClicks glossary entry exists ──');

check('objectiveKpis.ts already defines resultInfoId/efficiencyInfoId per family (unchanged, just re-verified)', () => {
  const objKpiSrc = readFileSync(join(__dirname, 'src/lib/objectiveKpis.ts'), 'utf8');
  assert.ok(objKpiSrc.includes("resultInfoId: 'link_clicks'"), 'traffic/app families must map to link_clicks');
});

check('server.ts forwards resultInfoId/efficiencyInfoId at all 3 kpiSpec sites', () => {
  const count = (serverSrc.match(/resultInfoId: kpiSpec\.resultInfoId/g) || []).length;
  assert.equal(count, 3, `expected 3 forwarding sites, found ${count}`);
  const effCount = (serverSrc.match(/efficiencyInfoId: kpiSpec\.efficiencyInfoId/g) || []).length;
  assert.equal(effCount, 3, `expected 3 forwarding sites, found ${effCount}`);
});

check('campaignsPage.ts inspector no longer re-derives resultInfoId with a linkClicks-less ternary', () => {
  assert.ok(!campaignsPageSrc.includes("s.resultKey === 'impressions' ? 'impressions'"),
    'the old re-derivation ternary must be gone');
  assert.ok(campaignsPageSrc.includes("var resultInfoId = s.resultInfoId || 'messages';"),
    'must trust the server-provided resultInfoId, matching the resultLabelAr fallback convention');
  assert.ok(campaignsPageSrc.includes("var efficiencyInfoId = s.efficiencyInfoId || 'cost_per_result';"),
    'must trust the server-provided efficiencyInfoId');
});

check("layout.ts METRIC_GLOSSARY has a link_clicks entry", () => {
  assert.ok(/link_clicks:\s*\{/.test(layoutSrc), 'link_clicks glossary entry must exist');
});

console.log('\n── 4. Confidence-band threshold consolidated into one shared helper ──');

check('dashboard/lib/confidence.ts defines confBadge exactly once, with normalize+clamp', () => {
  const confSrc = readFileSync(join(__dirname, 'src/web/pages/dashboard/lib/confidence.ts'), 'utf8');
  assert.ok(confSrc.includes('function confBadge(confidence)'), 'confBadge must be defined');
  assert.ok(confSrc.includes('if (c > 1) c = c / 100;'), 'must normalize a 0-100 input to a fraction');
  assert.ok(confSrc.includes('Math.max(0, Math.min(1, c))'), 'must clamp to [0,1]');
});

check('dashboardPage.ts no longer defines its own confBadge — imports the shared one', () => {
  assert.equal((dashboardPageSrc.match(/function confBadge\(/g) || []).length, 0,
    'dashboardPage.ts must not define confBadge locally anymore');
  assert.ok(dashboardPageSrc.includes("import { confidenceHelpersJs } from './dashboard/lib/confidence';"));
  assert.ok(dashboardPageSrc.includes('${confidenceHelpersJs}'), 'must interpolate the shared helper into the script');
});

check('beginnerDashboardPage.ts uses the shared confBadge instead of its own inline threshold logic', () => {
  assert.equal((beginnerPageSrc.match(/c >= 0\.75 \? 'high'/g) || []).length, 0,
    'the inline duplicate threshold ternary must be gone');
  assert.ok(beginnerPageSrc.includes("import { confidenceHelpersJs } from './dashboard/lib/confidence';"));
  assert.ok(beginnerPageSrc.includes('confBadge(task.confidence)'), 'must call the shared confBadge');
});

check('diagnoses.ts uses the shared confBadge instead of its own inline (unnormalized) threshold logic', () => {
  assert.equal((diagnosesSrc.match(/d\.confidence >= 0\.75/g) || []).length, 0,
    'the old unnormalized inline ternary (a latent scale bug) must be gone');
  assert.ok(diagnosesSrc.includes('confBadge(d.confidence)'), 'must call the shared confBadge');
});

console.log('\n── 5. evidence.knowledgeBase has a narrow type instead of opaque Json ──');

check("DashboardDTO issues[].evidence types knowledgeBase as MetricBreach", () => {
  assert.ok(getDashboardSrc.includes('evidence: Record<string, unknown> & { knowledgeBase?: MetricBreach };'),
    'the evidence field must carry a typed, optional knowledgeBase sub-shape');
  assert.ok(/import \{[\s\S]*?type MetricBreach[\s\S]*?\} from "\.\.\/knowledge";/.test(getDashboardSrc),
    'MetricBreach must be imported from the knowledge barrel');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
