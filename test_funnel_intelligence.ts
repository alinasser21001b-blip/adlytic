/**
 * P3 — Funnel intelligence golden scenarios.
 *
 * Twelve locked scenarios (A–L). For each: correct funnel shape, correct
 * ratios, correct EARLIEST break, correct problem class, correct confidence,
 * and no fabricated diagnosis.
 *
 * Run: npx tsx test_funnel_intelligence.ts
 */
import assert from 'node:assert/strict';
import { FUNNEL_SHAPES, funnelShapeFor } from './src/analytics/funnel/definitions';
import { computeFunnel, type FunnelWindowTotals } from './src/analytics/funnel/compute';
import {
  diagnoseFunnel,
  judgeMateriality,
  BASE_MATERIAL_DROP,
  type SupportingSignals,
} from './src/analytics/funnel/diagnose';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

/** Convenience: totals with zero defaults. */
function T(t: Partial<FunnelWindowTotals>): FunnelWindowTotals {
  return {
    impressions: 0, reach: 0, linkClicks: 0, landingPageViews: 0,
    messages: 0, leads: 0, purchases: 0, clicks: 0, ...t,
  };
}
const FLAT_SPEND: SupportingSignals = {
  spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
  costPerResultCurrentMinor: null, costPerResultPriorMinor: null,
};

console.log('\n── 0. Funnel shapes are objective-specific, never padded ──');

check('every family has its approved shape', () => {
  const shapes = Object.fromEntries(
    Object.entries(FUNNEL_SHAPES).map(([f, s]) => [f, s.map((x) => x.stageKey)]),
  );
  assert.deepEqual(shapes, {
    messaging:  ['impressions', 'reach', 'link_clicks', 'conversations'],
    traffic:    ['impressions', 'reach', 'link_clicks', 'landing_page_views'],
    leads:      ['impressions', 'reach', 'link_clicks', 'leads'],
    sales:      ['impressions', 'reach', 'link_clicks', 'purchases'],
    awareness:  ['impressions', 'reach'],
    engagement: ['impressions', 'reach', 'interactions'],
    app:        ['impressions', 'reach', 'link_clicks', 'installs'],
  });
});

check('awareness terminates at reach — no padded click stage', () => {
  assert.equal(funnelShapeFor('awareness').length, 2);
});

check('approximate terminals are flagged in the definition', () => {
  const eng = funnelShapeFor('engagement').at(-1)!;
  const app = funnelShapeFor('app').at(-1)!;
  assert.equal(eng.approximate, true);
  assert.equal(app.approximate, true);
  assert.equal(funnelShapeFor('messaging').at(-1)!.approximate, false);
});

check('unknown purpose computes NO funnel — no shape is guessed', () => {
  assert.equal(computeFunnel(null, T({ impressions: 50_000 })), null);
  assert.equal(computeFunnel(undefined, T({ impressions: 50_000 })), null);
});

console.log('\n── A. Healthy messaging funnel ──');
{
  // 50k impressions → 20k reach → 900 link clicks → 90 conversations,
  // identical both windows.
  const w = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const d = diagnoseFunnel('messaging', w, w, FLAT_SPEND)!;

  check('A: correct ratios computed', () => {
    const funnel = computeFunnel('messaging', w)!;
    const [imp, reach, lc, conv] = funnel.stages as any[];
    assert.equal(imp.ratioFromPrevious, null);
    assert.ok(Math.abs(reach.ratioFromPrevious - 0.4) < 1e-9);
    assert.ok(Math.abs(lc.ratioFromPrevious - 0.045) < 1e-9);
    assert.ok(Math.abs(conv.ratioFromPrevious - 0.1) < 1e-9);
  });
  check('A: NO_MATERIAL_BREAK — silence is valid', () => {
    assert.equal(d.status, 'NO_MATERIAL_BREAK');
    assert.equal(d.degradedStage, null);
    assert.equal(d.problemClass, 'NO_MATERIAL_BREAK');
    assert.equal(d.confidence, null);
    assert.deepEqual(d.evidence, [], 'no evidence may be fabricated for a healthy funnel');
  });
}

console.log('\n── B. CTR collapse (click break) ──');
{
  const prior = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const cur   = T({ impressions: 50_000, reach: 20_000, linkClicks: 450, messages: 45 });
  const d = diagnoseFunnel('messaging', cur, prior, FLAT_SPEND)!;

  check('B: earliest break is link_clicks, class CLICK', () => {
    assert.equal(d.status, 'BREAK_FOUND');
    assert.equal(d.degradedStage, 'link_clicks');
    assert.equal(d.problemClass, 'CLICK');
  });
  check('B: conversations fell too, but are NOT blamed (earliest-break rule)', () => {
    // conversations ÷ link clicks is 10% in both windows — the ratio held;
    // only the absolute count fell, mechanically, because clicks halved.
    const conv = d.ratios.find((r) => r.stageKey === 'conversations')!;
    assert.equal(conv.material, false);
    assert.notEqual(d.degradedStage, 'conversations');
  });
  check('B: high confidence — clean break, exact stages, big margin', () => {
    assert.equal(d.confidence, 'HIGH');
    assert.equal(d.approximateInvolved, false);
  });
}

console.log('\n── C. Post-click conversation collapse ──');
{
  // The signature scenario: upstream perfectly healthy, conversations fall.
  const prior = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const cur   = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 30 });
  const d = diagnoseFunnel('messaging', cur, prior, FLAT_SPEND)!;

  check('C: break is conversations, class POST_CLICK', () => {
    // POST_CLICK rather than CONVERSION: the gap between a click and a started
    // conversation is an ARRIVAL gap (chat never opened, welcome message never
    // landed, nobody answered), and its remedies are destination-side. Leads
    // and sales keep CONVERSION — there the visitor demonstrably arrived.
    assert.equal(d.status, 'BREAK_FOUND');
    assert.equal(d.degradedStage, 'conversations');
    assert.equal(d.problemClass, 'POST_CLICK');
  });
  check('C: upstream ratios are explicitly NOT material', () => {
    assert.equal(d.ratios.find((r) => r.stageKey === 'reach')!.material, false);
    assert.equal(d.ratios.find((r) => r.stageKey === 'link_clicks')!.material, false);
  });
  check('C: high confidence — exact terminal, big drop', () => {
    assert.equal(d.confidence, 'HIGH');
  });
}

console.log('\n── D. Traffic LPV collapse (landing-page problem) ──');
{
  const prior = T({ impressions: 40_000, reach: 16_000, linkClicks: 800, landingPageViews: 640 });
  const cur   = T({ impressions: 40_000, reach: 16_000, linkClicks: 800, landingPageViews: 240 });
  const d = diagnoseFunnel('traffic', cur, prior, FLAT_SPEND)!;

  check('D: break is landing_page_views, class POST_CLICK', () => {
    assert.equal(d.degradedStage, 'landing_page_views');
    assert.equal(d.problemClass, 'POST_CLICK');
  });
  check('D: link clicks healthy — the ad is NOT blamed', () => {
    assert.equal(d.ratios.find((r) => r.stageKey === 'link_clicks')!.material, false);
  });
}

console.log('\n── E. Lead conversion collapse ──');
{
  const prior = T({ impressions: 30_000, reach: 12_000, linkClicks: 600, leads: 60 });
  const cur   = T({ impressions: 30_000, reach: 12_000, linkClicks: 600, leads: 18 });
  const d = diagnoseFunnel('leads', cur, prior, FLAT_SPEND)!;
  check('E: break is leads, class CONVERSION', () => {
    assert.equal(d.degradedStage, 'leads');
    assert.equal(d.problemClass, 'CONVERSION');
  });
}

console.log('\n── F. Purchase conversion collapse ──');
{
  const prior = T({ impressions: 60_000, reach: 24_000, linkClicks: 1_200, purchases: 48 });
  const cur   = T({ impressions: 60_000, reach: 24_000, linkClicks: 1_200, purchases: 12 });
  const d = diagnoseFunnel('sales', cur, prior, FLAT_SPEND)!;
  check('F: break is purchases, class CONVERSION', () => {
    assert.equal(d.degradedStage, 'purchases');
    assert.equal(d.problemClass, 'CONVERSION');
  });
}

console.log('\n── G. Frequency / fatigue pattern (reach break) ──');
{
  // Same impressions, reach collapsing = frequency rising: saturation.
  const prior = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const cur   = T({ impressions: 50_000, reach: 10_000, linkClicks: 450, messages: 45 });
  const d = diagnoseFunnel('messaging', cur, prior, FLAT_SPEND)!;

  check('G: earliest break is reach, class DELIVERY (saturation)', () => {
    assert.equal(d.degradedStage, 'reach');
    assert.equal(d.problemClass, 'DELIVERY');
  });
  check('G: confidence capped at MEDIUM — reach is an estimated lower bound', () => {
    assert.equal(d.confidence, 'MEDIUM');
  });
  check('G: downstream declines attributed to the upstream break in evidence', () => {
    assert.ok(d.evidence.some((e) => e.includes('متوقعة')), d.evidence.join(' | '));
  });
}

console.log('\n── H. Insufficient sample ──');
{
  // 300 impressions: below every upstream floor.
  const prior = T({ impressions: 300, reach: 150, linkClicks: 20, messages: 4 });
  const cur   = T({ impressions: 280, reach: 120, linkClicks: 6, messages: 1 });
  const d = diagnoseFunnel('messaging', cur, prior, FLAT_SPEND)!;

  check('H: status INSUFFICIENT_DATA — no confident diagnosis from 300 impressions', () => {
    assert.equal(d.status, 'INSUFFICIENT_DATA');
    assert.equal(d.degradedStage, null);
    assert.equal(d.confidence, null);
    assert.deepEqual(d.evidence, []);
  });
  check('H: every ratio is marked unjudgeable, not silently zero', () => {
    for (const r of d.ratios) assert.equal(r.judgeable, false, r.stageKey);
  });
}

console.log('\n── I. Approximate terminal (app installs) ──');
{
  const prior = T({ impressions: 40_000, reach: 16_000, linkClicks: 800, clicks: 2_000 });
  const cur   = T({ impressions: 40_000, reach: 16_000, linkClicks: 800, clicks: 600 });
  const d = diagnoseFunnel('app', cur, prior, FLAT_SPEND)!;

  check('I: the break is found on the approximate installs stage', () => {
    assert.equal(d.status, 'BREAK_FOUND');
    assert.equal(d.degradedStage, 'installs');
  });
  check('I: confidence is capped at LOW — clicks are not installs', () => {
    assert.equal(d.confidence, 'LOW');
    assert.equal(d.approximateInvolved, true);
  });
  check('I: the approximation is disclosed in evidence', () => {
    assert.ok(d.evidence.some((e) => e.includes('تقريبي')), d.evidence.join(' | '));
  });
}

console.log('\n── J. Mixed / unknown purpose ──');
{
  check('J: unknown purpose yields NO diagnosis at all', () => {
    const w = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
    assert.equal(diagnoseFunnel(null, w, w, FLAT_SPEND), null);
    assert.equal(diagnoseFunnel(undefined, w, w, FLAT_SPEND), null);
  });
}

console.log('\n── K. No material break (small wobble stays silent) ──');
{
  // Ratios wobble ~5% — well below materiality. Must stay silent.
  const prior = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const cur   = T({ impressions: 49_000, reach: 19_400, linkClicks: 860, messages: 84 });
  const d = diagnoseFunnel('messaging', cur, prior, FLAT_SPEND)!;

  check('K: NO_MATERIAL_BREAK — a 5% wobble is not a diagnosis', () => {
    assert.equal(d.status, 'NO_MATERIAL_BREAK');
    assert.equal(d.degradedStage, null);
    assert.deepEqual(d.evidence, []);
  });
}

console.log('\n── L. Downstream collapse CAUSED by upstream break ──');
{
  // Reach halves; conversations collapse proportionally HARDER downstream.
  // The largest decline is at conversations — the diagnosis must still name
  // reach, because earliest wins over largest.
  const prior = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const cur   = T({ impressions: 50_000, reach: 9_000, linkClicks: 250, messages: 15 });
  const d = diagnoseFunnel('messaging', cur, prior, FLAT_SPEND)!;

  check('L: earliest (reach) is named, not the largest downstream drop', () => {
    assert.equal(d.status, 'BREAK_FOUND');
    assert.equal(d.degradedStage, 'reach');
    assert.equal(d.problemClass, 'DELIVERY');
  });
  check('L: the downstream stages ARE materially down — and still not blamed', () => {
    const lc = d.ratios.find((r) => r.stageKey === 'link_clicks')!;
    assert.equal(lc.material, true, 'link-click ratio did degrade');
    assert.notEqual(d.degradedStage, 'link_clicks');
    assert.notEqual(d.degradedStage, 'conversations');
  });
}

console.log('\n── M. Delivery: impressions shrink at held spend (supporting signal) ──');
{
  const prior = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const cur   = T({ impressions: 30_000, reach: 12_500, linkClicks: 560, messages: 56 });
  const d = diagnoseFunnel('messaging', cur, prior, {
    spendCurrentMinor: 1_050_000, spendPriorMinor: 1_000_000,
    costPerResultCurrentMinor: null, costPerResultPriorMinor: null,
  })!;

  check('M: DELIVERY break at the impressions entry', () => {
    assert.equal(d.status, 'BREAK_FOUND');
    assert.equal(d.degradedStage, 'impressions');
    assert.equal(d.problemClass, 'DELIVERY');
  });
  check('M: evidence names the spend context — signal, not a funnel ratio', () => {
    assert.ok(d.evidence.some((e) => e.includes('الإنفاق')), d.evidence.join(' | '));
  });
}

console.log('\n── N. Efficiency: ratios hold, cost per result rises ──');
{
  const w = T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 });
  const d = diagnoseFunnel('messaging', w, w, {
    spendCurrentMinor: 1_300_000, spendPriorMinor: 1_000_000,
    costPerResultCurrentMinor: 14_400, costPerResultPriorMinor: 11_100,
  })!;

  check('N: EFFICIENCY — no stage is blamed', () => {
    assert.equal(d.status, 'BREAK_FOUND');
    assert.equal(d.problemClass, 'EFFICIENCY');
    assert.equal(d.degradedStage, null, 'efficiency is not a stage break');
    assert.equal(d.confidence, 'MEDIUM');
  });
}

console.log('\n── Materiality unit checks (locked condition 6) ──');

check('a 10% drop is below the base floor — not material', () => {
  const v = judgeMateriality({
    currentRatio: 0.045, priorRatio: 0.05,
    currentDenominator: 20_000, priorDenominator: 20_000, minDenominator: 1_000,
  });
  assert.equal(v.judgeable, true);
  assert.equal(v.material, false);
  assert.equal(v.reason, 'BELOW_RELATIVE_FLOOR');
});

check('the required drop GROWS as samples shrink', () => {
  const big = judgeMateriality({
    currentRatio: 0.04, priorRatio: 0.05,
    currentDenominator: 100_000, priorDenominator: 100_000, minDenominator: 1_000,
  });
  const small = judgeMateriality({
    currentRatio: 0.04, priorRatio: 0.05,
    currentDenominator: 1_000, priorDenominator: 1_000, minDenominator: 1_000,
  });
  // 20% relative drop: material at n=100k (floor 0.15), NOT at n=1,000
  // (floor 4/√1000 ≈ 0.126 → max with base = 0.15... both 0.15) —
  // use n=400-ish via minDenominator 100 to see scaling:
  const tiny = judgeMateriality({
    currentRatio: 0.04, priorRatio: 0.05,
    currentDenominator: 100, priorDenominator: 100, minDenominator: 50,
  });
  assert.equal(big.material, true);
  assert.equal(tiny.material, false, `at n=100 the floor is 4/10 = 40%, a 20% drop is noise (got ${tiny.requiredDrop})`);
  assert.ok((tiny.requiredDrop ?? 0) > (small.requiredDrop ?? 0));
});

check('no baseline → unjudgeable, never material', () => {
  const v = judgeMateriality({
    currentRatio: 0.02, priorRatio: null,
    currentDenominator: 50_000, priorDenominator: 0, minDenominator: 1_000,
  });
  assert.equal(v.judgeable, false);
  assert.equal(v.reason, 'NO_BASELINE');
});

check('microscopic absolute drops never trigger, whatever the relative change', () => {
  const v = judgeMateriality({
    currentRatio: 0.0004, priorRatio: 0.001,
    currentDenominator: 50_000, priorDenominator: 50_000, minDenominator: 1_000,
  });
  assert.equal(v.material, false);
  assert.equal(v.reason, 'BELOW_ABSOLUTE_FLOOR');
});

check('BASE_MATERIAL_DROP is 15% — the documented policy', () => {
  assert.equal(BASE_MATERIAL_DROP, 0.15);
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
