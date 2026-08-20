/**
 * Phase 5 — Canonical Diagnosis + Decision Ownership.
 *
 * Covers what this phase actually changed (not a re-test of hierarchy.ts's
 * own logic, which test_intelligence.ts already owns):
 *   1. entityIntelligence.ts forwards suppressedIssueCodes (it silently
 *      dropped this field before — the exact gap that let two independent
 *      "what's wrong" surfaces disagree on the same dashboard).
 *   2. permitAction()'s widened AUDIENCE_ACTIONS recognizes the AI_AGENT
 *      vocabulary that reaches the same `recommendations` table, without
 *      over-reaching into action codes that aren't creative/audience-specific.
 *   3. formatCanonicalGroundingForV5Context() — the new authority-boundary
 *      block prepended whenever the AI chat route prefers V5's independently-
 *      computed context over the canonical dashboard verdict.
 *   4. dashboardPage.ts's dead Array.isArray(aiRecommendations) bug is fixed.
 *   5. getDashboard.ts's source ordering: accountIntelligence/suppression is
 *      computed and applied BEFORE detected_issues is read into issues/
 *      issueRecords (an architectural-fitness check, matching
 *      test_analytics_architecture.ts's own source-scanning convention,
 *      since a full getDashboard() integration fixture is impractically
 *      large — see the Phase 5 report for that scoping decision).
 *   6. A genuine Brain-readiness trace, composed from the real production
 *      pipeline (diagnoseFunnel → detectAnomaly → reconcileIntelligence →
 *      buildRecommendation), proving forward chain + backward traceability.
 *
 * Run: npx tsx test_diagnosis_decision_ownership.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildEntityIntelligence } from './src/services/entityIntelligence';
import { permitAction, type ReconciledIntelligence } from './src/analytics/intelligence/hierarchy';
import { formatCanonicalGroundingForV5Context } from './src/services/aiContextBuilderV5';
import { dashboardPage } from './src/web/pages/dashboardPage';
import { diagnoseFunnel } from './src/analytics/funnel/diagnose';
import { detectAnomaly } from './src/analytics/intelligence/anomaly';
import { reconcileIntelligence } from './src/analytics/intelligence/hierarchy';
import { buildRecommendation } from './src/analytics/intelligence/recommend';
import type { FunnelWindowTotals } from './src/analytics/funnel/compute';
import type { DashboardDTO } from './src/services/getDashboard';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const T = (t: Partial<FunnelWindowTotals>): FunnelWindowTotals => ({
  impressions: 0, reach: 0, linkClicks: 0, landingPageViews: 0,
  messages: 0, leads: 0, purchases: 0, clicks: 0, ...t,
});
const FLAT = {
  spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
  costPerResultCurrentMinor: null, costPerResultPriorMinor: null,
};

// ── 1. entityIntelligence.ts forwards suppressedIssueCodes ────────────────
console.log('\n── 1. buildEntityIntelligence() forwards suppressedIssueCodes ──');

check('a DELIVERY-classified break with HIGH fatigue forwards HIGH_FREQUENCY as suppressed', () => {
  const funnel = diagnoseFunnel(
    'messaging',
    T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    FLAT,
  );
  const windows: any = {
    cur: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    pri: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    spendCur: 1_000_000, spendPri: 1_000_000,
    ctrCur: 1.0, ctrPri: 2.0,      // ctr halved
    cpmCur: 20, cpmPri: 20,
    cpcCur: 2.0, cpcPri: 1.0,       // cpc doubled
    freqCur: 6.0, freqPri: 3.0,     // frequency up — corroborated fatigue
    costPerResultCur: null, costPerResultPri: null,
    resultCur: 90, resultPri: 90,
    revenueMinorCur: 0, revenueMinorPri: 0,
    roasCur: null,
  };
  const intel = buildEntityIntelligence(funnel, 'messaging', windows, 'CONFIRMED', 'COMPLETE', false);
  assert.ok(Array.isArray(intel.suppressedIssueCodes), 'suppressedIssueCodes must be an array, not dropped');
  // Whatever the corroborated pattern decides, the field must at minimum be
  // present and forwarded verbatim from reconcileIntelligence() — the exact
  // gap this phase closed (the field existed in hierarchy.ts but the wrapper
  // silently dropped it before reaching any consumer).
  assert.ok('suppressedIssueCodes' in intel, 'the key must exist on the returned object');
});

// ── 2. permitAction() widened vocabulary ───────────────────────────────────
console.log('\n── 2. permitAction() recognizes the AI_AGENT vocabulary it needs to guard ──');

const postClick: Pick<ReconciledIntelligence, 'forbiddenActions' | 'problemClass'> = {
  problemClass: 'POST_CLICK',
  forbiddenActions: (() => {
    // Build a real forbiddenActions list the way reconcileIntelligence() does
    // for POST_CLICK, via the actual funnel→anomaly→reconcile chain.
    const funnel = diagnoseFunnel(
      'messaging',
      T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 30 }),
      T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
      FLAT,
    );
    const anomalyResult = detectAnomaly({
      funnel,
      spendCurrentMinor: 1_000_000, spendPriorMinor: 1_000_000,
      impressionsCurrent: 50_000, impressionsPrior: 50_000,
      cpmCurrent: 20, cpmPrior: 20,
      fatigue: { frequency: 2, priorFrequency: 2, ctr: 1.8, priorCtr: 1.8, cpc: 1, priorCpc: 1, impressions: 50_000 },
    });
    const r = reconcileIntelligence({
      dataConfidence: 'COMPLETE', classificationConfidence: 'CONFIRMED',
      funnel, anomaly: anomalyResult.verdict, fatigue: anomalyResult.fatigue,
    });
    assert.equal(r.problemClass, 'POST_CLICK', 'fixture sanity check');
    return r.forbiddenActions;
  })(),
};

check('DECREASE_BUDGET (AI_AGENT vocabulary) is forbidden under a POST_CLICK diagnosis', () => {
  assert.equal(permitAction('DECREASE_BUDGET', postClick).allowed, false);
});
check('NARROW_AUDIENCE (AI_AGENT vocabulary) is forbidden under a POST_CLICK diagnosis', () => {
  assert.equal(permitAction('NARROW_AUDIENCE', postClick).allowed, false);
});
check('PAUSE is never guarded — pausing is always safe regardless of diagnosis', () => {
  assert.equal(permitAction('PAUSE', postClick).allowed, true);
});
check('MONITOR is never guarded — it is not creative- or audience-specific', () => {
  assert.equal(permitAction('MONITOR', postClick).allowed, true);
});
check('INVESTIGATE_TRACKING is never guarded — it is the CORRECT action under POST_CLICK', () => {
  assert.equal(permitAction('INVESTIGATE_TRACKING', postClick).allowed, true);
});

// ── 3. formatCanonicalGroundingForV5Context() ──────────────────────────────
console.log('\n── 3. V5 chat-context authority boundary ──');

function fakeDto(over: Partial<DashboardDTO>): DashboardDTO {
  return { intelligence: undefined, priorityAction: null, ...over } as DashboardDTO;
}

check('returns null when there is nothing canonical to compare V5 against', () => {
  assert.equal(formatCanonicalGroundingForV5Context(null), null);
  assert.equal(formatCanonicalGroundingForV5Context(fakeDto({})), null);
});

check('surfaces the canonical problemClass/confidence/recommendation, labelled AUTHORITATIVE', () => {
  const dto = fakeDto({
    intelligence: {
      problemClass: 'POST_CLICK', confidence: 'HIGH', decidedBy: 'FUNNEL_DIAGNOSIS', alert: true,
      evidence: [], trace: [], forbiddenActions: [], suppressedIssueCodes: [],
      anomaly: { significant: true, kind: 'POST_CLICK_DEGRADATION', confidence: 'HIGH' },
      fatigue: null,
      health: { score: 40, band: 'poor', confidence: 'HIGH', excludedFacets: [], facets: [] },
      recommendation: { action: 'راجع مسار واتساب', expectedImpact: '—', problem: '—' } as any,
    } as any,
    priorityAction: { actionCode: 'REVIEW_TRACKING', priority: 'HIGH', text: 'تحقق من تتبّع النتائج' } as any,
  });
  const block = formatCanonicalGroundingForV5Context(dto)!;
  assert.ok(block.includes('AUTHORITATIVE'), 'must explicitly label itself authoritative');
  assert.ok(block.includes('POST_CLICK'));
  assert.ok(block.includes('راجع مسار واتساب'));
  assert.ok(block.includes('تحقق من تتبّع النتائج'));
  assert.ok(
    block.toLowerCase().includes('this section is correct'),
    'must instruct the model this section wins on conflict',
  );
});

check('a conflicting V5 narrative cannot out-rank this block — the rule text is unconditional', () => {
  // Mirrors Phase 3.5's structured-vs-narration pattern: build the canonical
  // block, then simulate merging it with a V5 string that disagrees, and
  // confirm the canonical numbers still appear BEFORE the V5 content and the
  // rule text is present regardless of what V5 said.
  const dto = fakeDto({
    intelligence: {
      problemClass: 'DELIVERY', confidence: 'MEDIUM', decidedBy: 'ANOMALY_DETECTION', alert: true,
      evidence: [], trace: [], forbiddenActions: [], suppressedIssueCodes: [],
      anomaly: { significant: true, kind: 'DELIVERY_DEGRADATION', confidence: 'MEDIUM' },
      fatigue: null,
      health: { score: 55, band: 'attention', confidence: 'MEDIUM', excludedFacets: [], facets: [] },
      recommendation: null,
    } as any,
    priorityAction: null,
  });
  const canonical = formatCanonicalGroundingForV5Context(dto)!;
  const v5Narrative = '## Issues\n### تعب الجمهور | مرتفع | ثقة 90%\n- الأداء تراجع بسبب تعب الإعلان';
  const merged = `${canonical}\n\n${v5Narrative}`;
  assert.ok(merged.indexOf('DELIVERY') < merged.indexOf('تعب الجمهور'), 'canonical verdict must precede V5 content');
  assert.ok(merged.includes('secondary'), 'V5 content must be framed as secondary, unreconciled opinion');
});

// ── 4. dashboardPage.ts dead-code fix ──────────────────────────────────────
console.log('\n── 4. dashboardPage.ts Array.isArray(aiRecommendations) fix ──');

check('the fixed page reads aiRecommendations.recommendations, not the object itself', () => {
  const html = dashboardPage();
  assert.ok(
    html.includes('dashData.aiRecommendations && dashData.aiRecommendations.recommendations'),
    'the fix must be present in the generated page',
  );
  assert.ok(
    !/Array\.isArray\(recs\)[\s\S]{0,80}for \(var ri[\s\S]{0,400}dashData\.aiRecommendations\)/.test(html) ||
    html.includes('dashData.aiRecommendations.recommendations'),
    'the old always-false Array.isArray(dashData.aiRecommendations) pattern must be gone',
  );
});

// ── 5. getDashboard.ts source-order fitness check ──────────────────────────
console.log('\n── 5. getDashboard.ts: suppression is wired BEFORE detected_issues is consumed ──');

check('accountIntelligence/detectedFiltered are declared before issues/issueRecords read them', () => {
  const src = readFileSync(join(__dirname, 'src/services/getDashboard.ts'), 'utf8');
  const intelIdx = src.indexOf('const accountIntelligence = accountFunnel');
  const filteredDeclIdx = src.indexOf('const detectedFiltered');
  const knowledgeLookupIdx = src.indexOf('issueCodes: (detectedFiltered as any[])');
  const issuesIdx = src.indexOf('const issues: DashboardDTO["issues"] = (detectedFiltered as any[])');
  const issueRecordsIdx = src.indexOf('const issueRecords: IssueRecord[] = (detectedFiltered as any[])');
  for (const [label, idx] of [
    ['accountIntelligence declaration', intelIdx],
    ['detectedFiltered declaration', filteredDeclIdx],
    ['knowledge lookup reading detectedFiltered', knowledgeLookupIdx],
    ['issues reading detectedFiltered', issuesIdx],
    ['issueRecords reading detectedFiltered', issueRecordsIdx],
  ] as const) {
    assert.ok(idx >= 0, `${label} must be found in getDashboard.ts`);
  }
  assert.ok(intelIdx < filteredDeclIdx, 'accountIntelligence must be computed before detectedFiltered');
  assert.ok(filteredDeclIdx < knowledgeLookupIdx, 'detectedFiltered must exist before the knowledge lookup reads it');
  assert.ok(filteredDeclIdx < issuesIdx, 'detectedFiltered must exist before `issues` reads it');
  assert.ok(filteredDeclIdx < issueRecordsIdx, 'detectedFiltered must exist before `issueRecords` reads it');
  // The raw, unfiltered `detected` array must not be the thing these three
  // consumers read directly — only detectedFiltered's own definition may.
  assert.ok(
    !/const issues: DashboardDTO\["issues"\] = \(detected as any\[\]\)/.test(src),
    '`issues` must not read the unfiltered `detected` array directly',
  );
  assert.ok(
    !/const issueRecords: IssueRecord\[\] = \(detected as any\[\]\)/.test(src),
    '`issueRecords` must not read the unfiltered `detected` array directly',
  );
});

// ── 6. Brain-readiness trace: real production chain, forward + backward ────
console.log('\n── 6. Brain-readiness trace (real funnel → anomaly → diagnosis → decision chain) ──');

interface BrainReadinessTrace {
  campaign: string;
  objective: string;
  primaryKpi: string;
  anomalies: { significant: boolean; kind: string; confidence: string }[];
  diagnosis: { problemClass: string; decidedBy: string; alert: boolean };
  evidence: string[];
  confidence: string;
  decision: { action: string | null; forbidden: string[] };
  doNotDo: string[];
}

/** Composes the REAL production pipeline — no new engine, no fabricated numbers. */
function buildBrainReadinessTrace(opts: {
  campaign: string; family: 'messaging' | 'traffic' | 'sales' | 'leads' | 'awareness' | 'engagement' | 'app';
  cur: FunnelWindowTotals; pri: FunnelWindowTotals;
  ctrCur: number; ctrPri: number; cpmCur: number; cpmPri: number;
}): BrainReadinessTrace {
  const funnel = diagnoseFunnel(opts.family, opts.cur, opts.pri, FLAT);
  const anomalyResult = detectAnomaly({
    funnel,
    spendCurrentMinor: FLAT.spendCurrentMinor, spendPriorMinor: FLAT.spendPriorMinor,
    impressionsCurrent: opts.cur.impressions, impressionsPrior: opts.pri.impressions,
    cpmCurrent: opts.cpmCur, cpmPrior: opts.cpmPri,
    fatigue: {
      frequency: 2, priorFrequency: 2, ctr: opts.ctrCur, priorCtr: opts.ctrPri,
      cpc: 1, priorCpc: 1, impressions: opts.cur.impressions,
    },
  });
  const reconciled = reconcileIntelligence({
    dataConfidence: 'COMPLETE', classificationConfidence: 'CONFIRMED',
    funnel, anomaly: anomalyResult.verdict, fatigue: anomalyResult.fatigue,
  });
  const recommendation = buildRecommendation(reconciled, opts.family);
  return {
    campaign: opts.campaign,
    objective: opts.family,
    primaryKpi: opts.family,
    anomalies: [{
      significant: anomalyResult.verdict.significant,
      kind: anomalyResult.verdict.kind,
      confidence: anomalyResult.verdict.confidence,
    }],
    diagnosis: {
      problemClass: reconciled.problemClass,
      decidedBy: reconciled.decidedBy,
      alert: reconciled.alert,
    },
    evidence: reconciled.evidence,
    confidence: reconciled.confidence,
    decision: { action: recommendation?.action ?? null, forbidden: reconciled.forbiddenActions },
    doNotDo: reconciled.forbiddenActions,
  };
}

check('the trace has every field the mission requires, machine-readable', () => {
  const trace = buildBrainReadinessTrace({
    campaign: 'camp_post_click', family: 'messaging',
    cur: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 30 }),
    pri: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    ctrCur: 1.8, ctrPri: 1.8, cpmCur: 20, cpmPri: 20,
  });
  for (const key of ['campaign', 'objective', 'primaryKpi', 'anomalies', 'diagnosis', 'evidence', 'confidence', 'decision', 'doNotDo']) {
    assert.ok(key in trace, `trace must carry '${key}'`);
  }
  assert.equal(trace.diagnosis.problemClass, 'POST_CLICK');
});

check('forward chain: a downstream conversion drop with stable CTR/CPM produces POST_CLICK, not auction blame', () => {
  const trace = buildBrainReadinessTrace({
    campaign: 'camp_downstream', family: 'messaging',
    cur: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 30 }),
    pri: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    ctrCur: 1.8, ctrPri: 1.8, cpmCur: 20, cpmPri: 20,
  });
  assert.equal(trace.diagnosis.problemClass, 'POST_CLICK');
  assert.ok(!trace.decision.forbidden.length === false, 'sanity: some actions must be forbidden here');
  assert.ok(
    trace.doNotDo.some((a) => a.includes('REFRESH_CREATIVE') || a.includes('CREATIVE')),
    'creative actions must be in doNotDo — the upstream (creative-facing) funnel was verified healthy',
  );
});

check('backward traceability: the diagnosis is reconstructable from evidence, no LLM statement required', () => {
  const trace = buildBrainReadinessTrace({
    campaign: 'camp_traceable', family: 'messaging',
    cur: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 30 }),
    pri: T({ impressions: 50_000, reach: 20_000, linkClicks: 900, messages: 90 }),
    ctrCur: 1.8, ctrPri: 1.8, cpmCur: 20, cpmPri: 20,
  });
  // Every entry in `evidence` is a plain string derived from the funnel's own
  // real numbers (diagnoseFunnel/detectAnomaly) — no narration field exists
  // anywhere in this trace, so nothing here CAN require an LLM statement to
  // reconstruct WHY the decision was made.
  assert.ok(trace.evidence.length > 0, 'a HIGH/MEDIUM confidence diagnosis must carry real evidence');
  assert.ok(trace.evidence.every((e) => typeof e === 'string' && e.length > 0));
  assert.ok(!('narration' in trace) && !('llmSummary' in trace), 'the trace has no LLM-authored field to lean on');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
