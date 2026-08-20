// test_evidence_authority_boundary.ts — Phase 3.5: adAssessor evidence-authority boundary.
//
// Proves LLM-generated brain narration can never be treated as primary
// performance truth by the ad-assessor's reasoning layer: structured facts
// (metrics, canonical Evidence, deterministic diagnoses/brain decision)
// stay in an AUTHORITATIVE section; brain narration is confined to a
// separately-labeled NON-AUTHORITATIVE section that cannot leak numbers
// into, or overwrite, the authoritative one.
//
// Run: npx tsx test_evidence_authority_boundary.ts

import {
  formatAdlyticContextForPrompt,
  type AdlyticAssessmentContext,
  type AdlyticMetricSnapshot,
} from './src/adAssessor/adlyticContext';
import { buildAssessmentSystemPrompt, buildAssessmentUserPrompt } from './src/adAssessor/assessment-prompt';
import { assessmentResultSchema, type AssessRequest } from './src/adAssessor/schemas';
import type { TrendInsights } from './src/adAssessor/meta-ad-library';
import type { Evidence } from './src/analytics/evidence';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

// ── Fixtures ─────────────────────────────────────────────────────────────

function baseMetrics(overrides: Partial<AdlyticMetricSnapshot> = {}): AdlyticMetricSnapshot {
  return {
    windowDays: 30,
    spendMajor: 500,
    impressions: 10000,
    clicks: 310,
    messages: 20,
    purchases: 0,
    leads: 0,
    ctr: 3.1,
    cpm: 50,
    frequency: 2.1,
    costPerMessage: 25,
    currency: 'USD',
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AdlyticAssessmentContext> = {}): AdlyticAssessmentContext {
  return {
    workspaceId: 'ws_1',
    campaignId: 'camp_1',
    campaignName: 'Test Campaign',
    objective: 'OUTCOME_TRAFFIC',
    status: 'ACTIVE',
    industryHint: null,
    goalHint: null,
    currency: 'USD',
    currencyMinorFactor: 100,
    metrics: baseMetrics(),
    healthScore: 72,
    healthBand: 'good',
    diagnoses: [],
    evidence: [],
    brain: null,
    creative: null,
    selfBenchmark: null,
    source: 'adlytic',
    ...overrides,
  };
}

function makeEvidence(over: Partial<Evidence>): Evidence {
  return {
    metricKey: 'ctr',
    valueKind: 'level',
    unit: 'percent',
    value: 0,
    threshold: null,
    relativeToThreshold: null,
    ...over,
  };
}

// ── 1. Structured numeric fact beats conflicting narration ────────────────
// Mission's adversarial example: structured CTR=3.1%, narration claims 2.4%.
console.log('\n── 1. Structured numeric fact beats conflicting narration ──');
{
  const ctx = makeCtx({
    metrics: baseMetrics({ ctr: 3.1 }),
    brain: {
      action: 'HOLD_AND_MONITOR',
      priority: 'MEDIUM',
      tickDate: '2026-08-01',
      arabicTitle: 'تنبيه أداء',
      arabicNarration: 'انخفض معدل النقر إلى حوالي 2.4%',
    },
  });
  const prompt = formatAdlyticContextForPrompt(ctx);
  const structuredIdx = prompt.indexOf('- CTR: 3.1%');
  const narrationHeaderIdx = prompt.indexOf('## Adlytic brain narration');
  const narrationTextIdx = prompt.indexOf('انخفض معدل النقر');
  check('structured CTR (3.1%) present', structuredIdx >= 0, prompt);
  check(
    'structured CTR appears before the narration section',
    structuredIdx >= 0 && narrationHeaderIdx > structuredIdx,
  );
  check('narration text only appears after the narration header', narrationTextIdx > narrationHeaderIdx);
  check(
    'rules explicitly forbid treating a conflicting narration number as fact',
    prompt.includes('the structured data above is correct'),
  );
}

// ── 2. Narration cannot invent a numeric fact absent from structured inputs ──
// Mission's example: no CPM available, narration claims "CPM increased 32%".
console.log('\n── 2. Narration cannot invent a missing numeric fact ──');
{
  const ctx = makeCtx({
    metrics: baseMetrics({ cpm: null }),
    brain: {
      action: 'HOLD_AND_MONITOR',
      priority: 'MEDIUM',
      tickDate: '2026-08-01',
      arabicTitle: null,
      arabicNarration: 'ارتفعت تكلفة الألف ظهور بنسبة 32%',
    },
  });
  const prompt = formatAdlyticContextForPrompt(ctx);
  check('structured CPM stays n/a', prompt.includes('- CPM: n/a'), prompt);
  check(
    'rules forbid inventing/inferring an absent metric',
    prompt.includes('Never invent or infer a metric value that is absent above'),
  );
  check('narration text remains present as context, not fact', prompt.includes('ارتفعت تكلفة الألف ظهور'));
}

// ── 3. Canonical Evidence beats narration for the same metric ─────────────
console.log('\n── 3. Canonical Evidence beats narration for the same metric ──');
{
  const ctx = makeCtx({
    evidence: [makeEvidence({ metricKey: 'frequency', valueKind: 'level', unit: 'ratio', value: 2.1 })],
    brain: {
      action: 'HOLD_AND_MONITOR',
      priority: 'MEDIUM',
      tickDate: '2026-08-01',
      arabicTitle: null,
      arabicNarration: 'التكرار وصل إلى 5 مرات تقريباً',
    },
  });
  const prompt = formatAdlyticContextForPrompt(ctx);
  const evidenceIdx = prompt.indexOf('frequency (level): 2.1');
  const narrationHeaderIdx = prompt.indexOf('## Adlytic brain narration');
  check('canonical evidence value (2.1) present', evidenceIdx >= 0, prompt);
  check(
    'canonical evidence appears before the narration section',
    evidenceIdx >= 0 && narrationHeaderIdx > evidenceIdx,
  );
}

// ── 4. Explicit zero in structured input remains zero ─────────────────────
console.log('\n── 4. Explicit zero remains zero ──');
{
  const ctx = makeCtx({ metrics: baseMetrics({ ctr: 0, purchases: 0, leads: 0 }) });
  const prompt = formatAdlyticContextForPrompt(ctx);
  check('CTR 0 renders as 0%, not n/a', prompt.includes('- CTR: 0%'), prompt);
  check('Purchases 0 renders literally', prompt.includes('- Purchases: 0'));
  check('Leads 0 renders literally', prompt.includes('- Leads: 0'));
}

// ── 5. Missing structured value stays unavailable, not inferred from prose ──
console.log('\n── 5. Missing value stays unavailable ──');
{
  const ctx = makeCtx({
    metrics: baseMetrics({ frequency: null }),
    brain: {
      action: 'HOLD_AND_MONITOR',
      priority: 'MEDIUM',
      tickDate: '2026-08-01',
      arabicTitle: null,
      arabicNarration: 'التكرار الحالي هو 4.7 تقريباً',
    },
  });
  const prompt = formatAdlyticContextForPrompt(ctx);
  const narrationHeaderIdx = prompt.indexOf('## Adlytic brain narration');
  const authoritativeSection = prompt.slice(0, narrationHeaderIdx);
  check('structured Frequency stays n/a', prompt.includes('- Frequency: n/a'), prompt);
  check(
    'the narration-only figure (4.7) does not leak into the authoritative section',
    !authoritativeSection.includes('4.7'),
  );
}

// ── 6. Deterministic diagnosis remains distinguishable from raw Evidence ──
console.log('\n── 6. Diagnosis distinguishable from raw Evidence ──');
{
  const ctx = makeCtx({
    diagnoses: [{ title: 'انخفاض عدد النتائج', explanation: 'شرح تفصيلي', action: 'إجراء مقترح', severity: 'HIGH' }],
    evidence: [makeEvidence({ metricKey: 'resultsTrend', valueKind: 'trend', unit: 'ratio', value: -0.3 })],
  });
  const prompt = formatAdlyticContextForPrompt(ctx);
  const evidenceHeaderIdx = prompt.indexOf('- Canonical evidence');
  const diagnosesHeaderIdx = prompt.indexOf('- Active diagnoses');
  check('evidence has its own section header', evidenceHeaderIdx >= 0, prompt);
  check(
    'diagnoses has its own, distinct section header',
    diagnosesHeaderIdx >= 0 && diagnosesHeaderIdx !== evidenceHeaderIdx,
  );
  check('raw evidence section precedes the diagnosis (interpretation) section', evidenceHeaderIdx < diagnosesHeaderIdx);
}

// ── 7. LLM narration remains available for explanation/context ────────────
console.log('\n── 7. Narration remains available as context ──');
{
  const ctx = makeCtx({
    brain: {
      action: 'SCALE_BUDGET',
      priority: 'HIGH',
      tickDate: '2026-08-10',
      arabicTitle: 'أداء ممتاز',
      arabicNarration: 'نص توضيحي يشرح السياق للتاجر',
    },
  });
  const prompt = formatAdlyticContextForPrompt(ctx);
  check('narration title still surfaces', prompt.includes('أداء ممتاز'));
  check('narration body still surfaces', prompt.includes('نص توضيحي يشرح السياق للتاجر'));
  check('narration is explicitly labeled non-authoritative', prompt.includes('NON-AUTHORITATIVE'));
}

// ── 8. Narration is not dropped completely unless product behavior requires it ──
console.log('\n── 8. Narration section is conditional, not force-stripped ──');
{
  const withoutNarration = makeCtx({
    brain: { action: 'SCALE_BUDGET', priority: 'HIGH', tickDate: '2026-08-10', arabicTitle: null, arabicNarration: null },
  });
  const promptNoNarr = formatAdlyticContextForPrompt(withoutNarration);
  check(
    'deterministic brain decision still renders when narration is absent',
    promptNoNarr.includes('Latest Adlytic brain decision'),
  );
  check(
    'no empty narration section is forced in when the brain has no narration yet',
    !promptNoNarr.includes('## Adlytic brain narration'),
  );

  const withNarration = makeCtx({
    brain: { action: 'SCALE_BUDGET', priority: 'HIGH', tickDate: '2026-08-10', arabicTitle: 'ok', arabicNarration: 'نص' },
  });
  const promptWithNarr = formatAdlyticContextForPrompt(withNarration);
  check('narration section renders when narration is actually present', promptWithNarr.includes('## Adlytic brain narration'));
}

// ── 9. Assessor OUTPUT schema remains stable ───────────────────────────────
console.log('\n── 9. Assessor output schema unchanged ──');
{
  const fixture = {
    audienceMessage: { ar: 'رسالة', en: 'message' },
    summaryAr: 'ملخص',
    summaryEn: 'summary',
    creativeBreakdown: {
      hook: { score: 80, labelAr: 'الافتتاحية', labelEn: 'Hook', explanationAr: 'ok', explanationEn: 'ok' },
      messageClarity: { score: 80, labelAr: 'وضوح', labelEn: 'Clarity', explanationAr: 'ok', explanationEn: 'ok' },
      visualImpact: { score: 80, labelAr: 'تأثير', labelEn: 'Impact', explanationAr: 'ok', explanationEn: 'ok' },
      ctaStrength: { score: 80, labelAr: 'قوة', labelEn: 'CTA', explanationAr: 'ok', explanationEn: 'ok' },
    },
    trendComparison: { ar: 'مقارنة', en: 'comparison' },
    actionItems: [{ ar: '1', en: '1' }, { ar: '2', en: '2' }, { ar: '3', en: '3' }],
    industryTips: [{ ar: '1', en: '1' }, { ar: '2', en: '2' }],
    strengths: [{ ar: '1', en: '1' }, { ar: '2', en: '2' }],
    performanceInsight: { ar: 'أداء', en: 'perf' },
  };
  const result = assessmentResultSchema.safeParse(fixture);
  check(
    'known-good assessment payload still validates against assessmentResultSchema',
    result.success,
    result.success ? undefined : result.error.flatten(),
  );
}

// ── 10/11. Existing regression suites (Phase 3 evidence contract, P0/P1,
// result-semantics) are verified by running them directly, not duplicated
// here — see the Phase 3.5 session report for the full run.

// ── 12. Contradictory narration cannot change the authoritative section ───
console.log('\n── 12. Contradictory narration never mutates the authoritative section ──');
{
  const sharedMetrics = baseMetrics({ ctr: 3.1, frequency: 2.1, cpm: 50 });
  const sharedEvidence = [makeEvidence({ metricKey: 'ctr', valueKind: 'level', unit: 'percent', value: 3.1 })];
  const sharedDiagnoses = [{ title: 'د', explanation: 'شرح', action: 'فعل', severity: 'MEDIUM' }];

  const ctxA = makeCtx({
    metrics: sharedMetrics,
    evidence: sharedEvidence,
    diagnoses: sharedDiagnoses,
    brain: {
      action: 'HOLD_AND_MONITOR',
      priority: 'MEDIUM',
      tickDate: '2026-08-01',
      arabicTitle: null,
      arabicNarration: 'كل شيء ممتاز والنتائج تتحسن بسرعة',
    },
  });
  const ctxB = makeCtx({
    metrics: sharedMetrics,
    evidence: sharedEvidence,
    diagnoses: sharedDiagnoses,
    brain: {
      action: 'HOLD_AND_MONITOR',
      priority: 'MEDIUM',
      tickDate: '2026-08-01',
      arabicTitle: null,
      arabicNarration: 'كل شيء سيء والنتائج تتراجع بسرعة',
    },
  });

  const promptA = formatAdlyticContextForPrompt(ctxA);
  const promptB = formatAdlyticContextForPrompt(ctxB);
  const cutA = promptA.slice(0, promptA.indexOf('## Adlytic brain narration'));
  const cutB = promptB.slice(0, promptB.indexOf('## Adlytic brain narration'));
  check('authoritative section is byte-identical despite contradictory narration', cutA === cutB, { cutA, cutB });
  check('fixture sanity check: the two narrations are indeed different', promptA !== promptB);
}

// ── A. Defect string is gone; new grounding-rule text is present ──────────
console.log('\n── A. System prompt: defect line replaced ──');
{
  const sysPrompt = buildAssessmentSystemPrompt(true);
  check('the old "primary performance truth" phrasing is gone', !sysPrompt.includes('primary performance truth'));
  check('narration is explicitly declared not a source of numbers', sysPrompt.includes('never a source of numbers'));
  check(
    'the do-not-do list forbids using narration as a numeric source',
    sysPrompt.includes('narration explains, structured data proves'),
  );

  const sysPromptNoAdlytic = buildAssessmentSystemPrompt(false);
  check(
    'system prompt without Adlytic context carries no Adlytic-grounding block',
    !sysPromptNoAdlytic.includes('Adlytic grounding'),
  );
}

// ── B. User prompt actually threads the restructured context ──────────────
console.log('\n── B. User prompt threads the authoritative/narration split ──');
{
  const data: AssessRequest = {
    industry: 'ecommerce',
    goal: 'traffic',
    creative: { primaryText: 'نص', headline: 'عنوان' },
    hasMetrics: false,
  };
  const trendContext: TrendInsights = {
    source: 'curated_fallback',
    summaryAr: 'ملخص',
    summaryEn: 'summary',
    hooks: [],
    ctaPatterns: [],
    themes: [],
    copyLengthInsight: '',
    exampleAds: [],
    totalAdsAnalyzed: 0,
  };
  const ctx = makeCtx({
    brain: {
      action: 'HOLD_AND_MONITOR',
      priority: 'MEDIUM',
      tickDate: '2026-08-01',
      arabicTitle: null,
      arabicNarration: 'نص سردي',
    },
  });
  const userPrompt = buildAssessmentUserPrompt(data, trendContext, ctx);
  check('user prompt embeds the AUTHORITATIVE structured header', userPrompt.includes('AUTHORITATIVE'));
  check('user prompt embeds the NON-AUTHORITATIVE narration header', userPrompt.includes('NON-AUTHORITATIVE'));

  const userPromptNoCtx = buildAssessmentUserPrompt(data, trendContext, null);
  check('without Adlytic context, no authority-boundary section leaks in', !userPromptNoCtx.includes('AUTHORITATIVE'));
}

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
if (fail > 0) process.exit(1);
