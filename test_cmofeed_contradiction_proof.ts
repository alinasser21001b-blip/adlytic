/**
 * EXECUTABLE PROOF OF A KNOWN, CURRENTLY-OPEN DEFECT.
 *
 * ⚠ This file does NOT assert correct behaviour. It asserts that a specific
 * contradiction is REACHABLE on today's code, so the claim in
 * ADLYTIC_BRAIN_READINESS_REPORT.md §12 item 1 rests on runnable evidence
 * rather than on prose. Nothing here is a fix, and nothing here endorses the
 * behaviour it demonstrates.
 *
 * ── THE CONTRADICTION ─────────────────────────────────────────────────
 *
 * For ONE campaign, two merchant-visible surfaces can disagree about whether
 * the creative is the problem:
 *
 *   Surface A — canonical (guarded):
 *     analytics/funnel/diagnose.ts → analytics/intelligence/anomaly.ts →
 *     hierarchy.ts::reconcileIntelligence() puts REFRESH_CREATIVE in
 *     forbiddenActions whenever the diagnosis is POST_CLICK/CONVERSION,
 *     because the funnel MEASURED the creative-facing stages as healthy.
 *     #command-center honours this via permitAction().
 *
 *   Surface B — Brain feed (unguarded):
 *     engine/DecisionEngine.ts emits action 'REFRESH_CREATIVE' from its own
 *     physics model → BrainPersistence writes campaign_brain_snapshots.action
 *     → getDashboard.ts::mapSnapshotToFeedCandidate() sets insightType =
 *     s.action and builds action-aware Arabic prose via
 *     insightQualityGate.ts::buildDeterministicNarration() → that prose lands
 *     on dashData.brain.cmoFeedV2 → dashboardPage.ts::buildAllMoveItems()
 *     renders it as a merchant task card.
 *     permitAction() is never called anywhere on this path.
 *
 * Net effect: the merchant can be told "جدّد الصورة أو الفيديو" (refresh the
 * image or video) by the feed while the canonical engine has concluded the
 * creative is fine and the break is post-click — the exact class of
 * contradiction the whole consolidation programme exists to prevent.
 *
 * WHEN THIS DEFECT IS FIXED, THIS FILE MUST FAIL — that is the point. Its
 * failure is the signal to delete it (or invert it into a regression guard).
 *
 * Run: npx tsx test_cmofeed_contradiction_proof.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { diagnoseFunnel } from './src/analytics/funnel/diagnose';
import { detectAnomaly } from './src/analytics/intelligence/anomaly';
import { reconcileIntelligence, permitAction } from './src/analytics/intelligence/hierarchy';
import { buildDeterministicNarration } from './src/lib/insightQualityGate';
import type { FunnelWindowTotals } from './src/analytics/funnel/compute';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const T = (t: Partial<FunnelWindowTotals>): FunnelWindowTotals => ({
  impressions: 0, reach: 0, linkClicks: 0, landingPageViews: 0,
  messages: 0, leads: 0, purchases: 0, clicks: 0, ...t,
});

// ── The one campaign, run through the canonical chain ────────────────────
// Upstream stages held flat; the downstream conversion collapsed 90 → 30.
const FLAT = {
  spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
  costPerResultCurrentMinor: null, costPerResultPriorMinor: null,
};
const cur = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 30 });
const pri = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });

const funnel = diagnoseFunnel('messaging', cur, pri, FLAT);
const anomalyResult = detectAnomaly({
  funnel,
  spendCurrentMinor: FLAT.spendCurrentMinor, spendPriorMinor: FLAT.spendPriorMinor,
  impressionsCurrent: cur.impressions, impressionsPrior: pri.impressions,
  cpmCurrent: 20, cpmPrior: 20,
  fatigue: { frequency: 2, priorFrequency: 2, ctr: 1.8, priorCtr: 1.8, cpc: 1, priorCpc: 1, impressions: cur.impressions },
});
const reconciled = reconcileIntelligence({
  dataConfidence: 'COMPLETE', classificationConfidence: 'CONFIRMED',
  funnel, anomaly: anomalyResult.verdict, fatigue: anomalyResult.fatigue,
});

console.log('\n── Surface A: the canonical engine FORBIDS refreshing the creative ──');

check('the canonical chain diagnoses POST_CLICK for this campaign', () => {
  assert.equal(reconciled.problemClass, 'POST_CLICK',
    'the fixture must reach POST_CLICK or the proof below is vacuous');
});

check('permitAction() BLOCKS REFRESH_CREATIVE for this exact diagnosis', () => {
  const permit = permitAction('REFRESH_CREATIVE', reconciled);
  assert.equal(permit.allowed, false, 'REFRESH_CREATIVE must be forbidden under POST_CLICK');
  assert.ok(permit.reason && permit.reason.length > 0, 'the guard must state why');
});

console.log('\n── Surface B: the Brain feed still TELLS the merchant to refresh it ──');

check('Brain\'s REFRESH_CREATIVE action produces merchant-facing "refresh your creative" Arabic prose', () => {
  // Exactly the call getDashboard.ts::mapSnapshotToFeedCandidate() makes when
  // a snapshot carries no usable narration — same function, same arguments.
  const narration = buildDeterministicNarration({}, {
    campaignName: 'حملة الاختبار',
    action: 'REFRESH_CREATIVE',
  });
  assert.ok(narration.arabicNarration.includes('جدّد'),
    'the generated prose must actually instruct a creative refresh — otherwise there is no contradiction to report');
  assert.ok(
    narration.arabicTitle.includes('تجديد') || narration.arabicTitle.includes('يحتاج'),
    'the card title must present it as a needed change',
  );
});

check('that prose reaches the merchant through cmoFeedV2 with NO permitAction() call on the path', () => {
  const dash = src('src/services/getDashboard.ts');

  // The feed carries Brain's raw action as insightType…
  assert.ok(dash.includes('const insightType = s.action;'),
    'mapSnapshotToFeedCandidate must still be forwarding Brain\'s raw action');

  // …and buildBrainSection/buildCmoFeedV2 never consult the guard.
  const sectionStart = dash.indexOf('function buildBrainSection(');
  const sectionEnd = dash.indexOf('/** Defensive read of payload.v2.velocity.burnRate', sectionStart);
  const brainSection = dash.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : sectionStart + 8000);
  assert.ok(!brainSection.includes('permitAction'),
    'DEFECT RESOLVED? buildBrainSection now references permitAction — if the cmoFeedV2 guard has landed, delete this proof file.');
  assert.ok(!brainSection.includes('forbiddenActions'),
    'DEFECT RESOLVED? buildBrainSection now consults forbiddenActions — update or delete this proof file.');
});

check('the dashboard renders those feed items as merchant task cards', () => {
  const page = src('src/web/pages/dashboardPage.ts');
  assert.ok(page.includes('dashData.brain.cmoFeedV2'), 'the feed must still be read by the page');
  assert.ok(page.includes("kind: 'feed'"), 'feed items must still be pushed as merchant-facing move items');
});

console.log('\n── Scope: the same contradiction is ALREADY closed on the inspector surface ──');

check('the campaign-inspector timeline DOES annotate the same Brain action (so the gap is feed-only)', () => {
  const server = src('src/api/server.ts');
  const idx = server.indexOf('timeline: snapshots.map((s) => {');
  assert.ok(idx >= 0, 'the inspector timeline builder must exist');
  const block = server.slice(idx, idx + 900);
  assert.ok(block.includes('permitAction(s.action, campaignIntelligence)'),
    'the inspector already checks Brain\'s action — this is what cmoFeedV2 still lacks');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
console.log('NOTE: these passes document an OPEN defect, not correct behaviour. See §12 of the readiness report.');
if (failures.length > 0) process.exit(1);
