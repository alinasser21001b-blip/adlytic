/**
 * PHASE 3 — Canonical Evidence contract adversarial suite.
 *
 * Guards src/analytics/evidence.ts and its first production migration:
 * the five rule detectors (src/engines/rules/detect*.ts) producing
 * Evidence[] instead of an ad hoc Record<string, unknown>, persisted
 * through detected_issues.evidence_json (no schema change), read back via
 * parseIssueEvidenceJson()/issueEvidenceFieldsFromJson(), and referenced —
 * not duplicated — by diagnose.ts.
 *
 * Run: npx tsx test_evidence_contract.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IssueCode, Severity, EntityType } from '@prisma/client';
import { detectLowCtr } from './src/engines/rules/detectLowCtr';
import { detectHighFrequency } from './src/engines/rules/detectHighFrequency';
import { detectAudienceFatigue } from './src/engines/rules/detectAudienceFatigue';
import { detectDecliningResults } from './src/engines/rules/detectDecliningResults';
import { detectRisingCostPerResult } from './src/engines/rules/detectRisingCostPerResult';
import { diagnose } from './src/engines/rules/diagnose';
import type { Signals } from './src/engines/rules/types';
import type { IssueRecord } from './src/repositories/detectedIssuesRepo';
import { DetectedIssuesRepo } from './src/repositories/detectedIssuesRepo';
import { RulesEngine } from './src/engines/rules/RulesEngine';
import { parseIssueEvidenceJson, issueEvidenceFieldsFromJson, type Evidence } from './src/analytics/evidence';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve().then(fn).then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (e: any) => { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); },
  );
}

function emptySignals(): Signals {
  return {
    ctrTrend: null, cpmTrend: null, frequencyTrend: null, resultsTrend: null, spendTrend: null,
    currentCtr: null, currentFrequency: null, currentCpm: null,
    currentResults: 0, currentSpend: 0,
  };
}

function makeFakeDetectedIssuePrisma(writes: any[]) {
  return {
    detectedIssue: {
      deleteMany: async (args: any) => { writes.push({ op: 'deleteMany', args }); return { count: 0 }; },
      createMany: async (args: any) => { writes.push({ op: 'createMany', data: args.data }); return { count: args.data.length }; },
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  } as any;
}

function makeFakeRulesEnginePrisma(writes: any[], fixture: { trend: any; dailyRows: any[] }) {
  return {
    metricTrend: { findFirst: async () => fixture.trend },
    dailyStat: { findMany: async () => fixture.dailyRows },
    campaign: { findUnique: async () => null },
    detectedIssue: {
      deleteMany: async (args: any) => { writes.push({ op: 'deleteMany', args }); return { count: 0 }; },
      createMany: async (args: any) => { writes.push({ op: 'createMany', data: args.data }); return { count: args.data.length }; },
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  } as any;
}

async function run() {
  console.log('\n── 1. Deterministic canonical representation ──');

  await check('same Signals input produces identical Evidence output across repeated calls', () => {
    const s: Signals = { ...emptySignals(), currentCtr: 0.6, objective: 'MESSAGES' };
    const a = detectLowCtr(s);
    const b = detectLowCtr(s);
    assert.deepEqual(a, b);
  });

  console.log('\n── 2/3. Zero vs missing ──');

  await check('numeric zero remains zero: currentResults=0 is a real, present Evidence value', () => {
    const s: Signals = { ...emptySignals(), resultsTrend: -0.5, currentResults: 0 };
    const i = detectDecliningResults(s)!;
    const resultsEv = i.evidence.find((e) => e.metricKey === 'results')!;
    assert.ok(resultsEv, 'a "results" evidence item must exist');
    assert.equal(resultsEv.value, 0);
  });

  await check('missing value is never converted to zero: a null trend is ABSENT from evidence, not {value:0}', () => {
    // Two of three fatigue signals present (frequency+ctr); resultsTrend genuinely null.
    const s: Signals = { ...emptySignals(), frequencyTrend: 0.3, ctrTrend: -0.25, currentFrequency: 4 };
    const i = detectAudienceFatigue(s);
    assert.ok(i, 'must fire on 2/3 signals');
    assert.equal(i!.evidence.find((e) => e.metricKey === 'resultsTrend'), undefined,
      'resultsTrend was null in Signals — must be ABSENT, not a fabricated 0');
    assert.equal(i!.evidence.length, 3, 'exactly frequencyTrend, ctrTrend, frequency — no padded 4th zero entry');
  });

  console.log('\n── 4. Percent / ratio / count units are not conflated ──');

  await check('ctr (level) is percent, frequency (level) is ratio, results (level) is count', () => {
    const ctrEv = detectLowCtr({ ...emptySignals(), currentCtr: 0.5 })!.evidence[0]!;
    const freqEv = detectHighFrequency({ ...emptySignals(), currentFrequency: 6 })!.evidence[0]!;
    const resultsEv = detectDecliningResults({ ...emptySignals(), resultsTrend: -0.5, currentResults: 40 })!
      .evidence.find((e) => e.metricKey === 'results')!;
    assert.equal(ctrEv.unit, 'percent');
    assert.equal(freqEv.unit, 'ratio');
    assert.equal(resultsEv.unit, 'count');
    assert.equal(new Set([ctrEv.unit, freqEv.unit, resultsEv.unit]).size, 3,
      'three genuinely different units, never merged into one generic "number"');
  });

  console.log('\n── 5. Values cannot silently swap meaning ──');

  await check('resultsTrend and spendTrend evidence cannot be transposed: divergence sign/magnitude reflects which is which', () => {
    const s: Signals = { ...emptySignals(), resultsTrend: -0.30, spendTrend: 0.10 };
    const i = detectRisingCostPerResult(s)!;
    const rEv = i.evidence.find((e) => e.metricKey === 'resultsTrend')!;
    const sEv = i.evidence.find((e) => e.metricKey === 'spendTrend')!;
    assert.equal(rEv.value, -0.30);
    assert.equal(sEv.value, 0.10);
    assert.notEqual(rEv.value, sEv.value, 'precondition: the two values must differ for this test to mean anything');
    const d = diagnose([i], s);
    const eff = d.find((x) => x.code === 'RISING_COST_PER_RESULT');
    assert.ok(eff, 'RISING_COST_PER_RESULT diagnosis must fire');
    assert.ok(eff!.narrative.includes('40%'),
      `divergence magnitude (|-0.30 - 0.10| = 0.40) must appear correctly, got: ${eff!.narrative}`);
  });

  console.log('\n── 6. Entity identity is preserved ──');

  await check('replaceForDate persists exactly the entityType/entityId it was given, unaltered', async () => {
    const writes: any[] = [];
    const repo = new DetectedIssuesRepo(makeFakeDetectedIssuePrisma(writes));
    const issue = detectLowCtr({ ...emptySignals(), currentCtr: 0.5 })!;
    await repo.replaceForDate({
      entityType: EntityType.CAMPAIGN, entityId: 'camp_evidence_test',
      date: new Date('2026-07-01T00:00:00.000Z'), issues: [issue],
    });
    const created = writes.find((w) => w.op === 'createMany');
    assert.equal(created.data[0].entityType, EntityType.CAMPAIGN);
    assert.equal(created.data[0].entityId, 'camp_evidence_test');
  });

  console.log('\n── 7. Time window is preserved where present ──');

  await check('RulesEngine.run() attaches its real windowDays to every persisted issue', async () => {
    const writes: any[] = [];
    const fakePrisma = makeFakeRulesEnginePrisma(writes, {
      trend: { ctrTrend: null, cpmTrend: null, frequencyTrend: null, resultsTrend: null, spendTrend: null, date: new Date('2026-07-01') },
      dailyRows: [{
        date: new Date('2026-07-01'), impressions: 10000n, clicks: 50n, ctr: 0.5, cpm: 5, frequency: 1,
        messages: 0n, purchases: 0n, leads: 0n, spend: 1000n, linkClicks: 0n,
      }],
    });
    const engine = new RulesEngine(fakePrisma);
    const result = await engine.run(EntityType.ACCOUNT, 'acct_window_test', {
      asOf: new Date('2026-07-08T00:00:00.000Z'), windowDays: 10, attributionLagDays: 2,
    });
    assert.ok(result.issues.length > 0, 'must have detected LOW_CTR for this fixture (ctr 0.5% < 1.0% default floor)');
    for (const i of result.issues) assert.deepEqual(i.window, { days: 10 });
    const created = writes.find((w) => w.op === 'createMany');
    assert.deepEqual(created.data[0].evidenceJson.window, { days: 10 },
      'window must survive persistence, not just stay in memory');
  });

  console.log('\n── 8. Evidence provenance survives producer → DTO ──');

  await check('detector output round-trips through persistence and issueEvidenceFieldsFromJson unchanged', async () => {
    const writes: any[] = [];
    const repo = new DetectedIssuesRepo(makeFakeDetectedIssuePrisma(writes));
    const original = detectAudienceFatigue({
      ...emptySignals(), frequencyTrend: 0.46, ctrTrend: -0.28, resultsTrend: -0.33, currentFrequency: 5.4,
    })!;
    await repo.replaceForDate({
      entityType: EntityType.ACCOUNT, entityId: 'acct_roundtrip', date: new Date('2026-07-01'), issues: [original],
    });
    const persistedJson = writes.find((w) => w.op === 'createMany').data[0].evidenceJson;
    const fields = issueEvidenceFieldsFromJson(persistedJson);
    assert.deepEqual(fields.evidence, original.evidence, 'evidence must survive the round trip exactly');
    assert.deepEqual(fields.confidence, original.confidence);
  });

  console.log('\n── 9. Diagnosis references the intended evidence, not an independent re-derivation ──');

  await check('diagnoseEfficiencyDrop reads divergence FROM the evidence array, not by recomputing from Signals', () => {
    // IssueRecord's evidence deliberately DISAGREES with the Signals passed
    // alongside it, simulating stale/cached evidence. If diagnose() were
    // independently recomputing from Signals it would report the SIGNALS'
    // divergence (5%); referencing the evidence correctly, it reports the
    // EVIDENCE's divergence (40%).
    const staleEvidence: Evidence[] = [
      { metricKey: 'resultsTrend', valueKind: 'trend', unit: 'percent', value: -0.30, threshold: null, relativeToThreshold: null },
      { metricKey: 'spendTrend', valueKind: 'trend', unit: 'percent', value: 0.10, threshold: null, relativeToThreshold: null },
    ];
    const staleIssue: IssueRecord = {
      issueCode: IssueCode.RISING_COST_PER_RESULT, severity: Severity.HIGH,
      evidence: staleEvidence, confidence: { value: 0.75, basis: 'heuristic_constant' }, window: null,
    };
    const freshSignals: Signals = { ...emptySignals(), resultsTrend: -0.10, spendTrend: -0.05 };
    const d = diagnose([staleIssue], freshSignals);
    const eff = d.find((x) => x.code === 'RISING_COST_PER_RESULT')!;
    assert.ok(eff, 'diagnosis must fire from the issue alone, independent of Signals agreeing');
    assert.ok(eff.narrative.includes('40%'),
      `must reflect the EVIDENCE's divergence (40%), not the Signals' (5%) — got: ${eff.narrative}`);
    assert.ok(!eff.narrative.includes('5%'), `must NOT reflect a re-derived Signals divergence — got: ${eff.narrative}`);
  });

  console.log('\n── 10. Recommendation does not become Evidence ──');

  await check('Evidence objects carry no recommendation-shaped fields (no action/actionCode/text)', () => {
    const allIssues = [
      detectLowCtr({ ...emptySignals(), currentCtr: 0.5 }),
      detectHighFrequency({ ...emptySignals(), currentFrequency: 6 }),
      detectDecliningResults({ ...emptySignals(), resultsTrend: -0.5, currentResults: 10 }),
      detectRisingCostPerResult({ ...emptySignals(), resultsTrend: -0.3, spendTrend: 0.1 }),
      detectAudienceFatigue({ ...emptySignals(), frequencyTrend: 0.5, ctrTrend: -0.3, resultsTrend: -0.4, currentFrequency: 6 }),
    ].filter((i): i is NonNullable<typeof i> => i != null);
    assert.equal(allIssues.length, 5, 'precondition: all five detectors must fire for this fixture');
    const EXPECTED_KEYS = ['metricKey', 'relativeToThreshold', 'threshold', 'unit', 'value', 'valueKind'].sort();
    for (const issue of allIssues) {
      for (const ev of issue.evidence) {
        assert.deepEqual(Object.keys(ev).sort(), EXPECTED_KEYS);
        assert.ok(!('action' in ev) && !('actionCode' in ev) && !('text' in ev) && !('recommendation' in ev));
      }
    }
  });

  console.log('\n── 11. Free-text LLM rationale cannot masquerade as evidence ──');

  await check('none of the migrated producer files reference an LLM/AI provider', () => {
    const files = [
      'src/engines/rules/detectLowCtr.ts',
      'src/engines/rules/detectHighFrequency.ts',
      'src/engines/rules/detectAudienceFatigue.ts',
      'src/engines/rules/detectDecliningResults.ts',
      'src/engines/rules/detectRisingCostPerResult.ts',
      'src/engines/rules/severity.ts',
      'src/repositories/detectedIssuesRepo.ts',
      'src/analytics/evidence.ts',
    ];
    const LLM_MARKERS = /anthropic|openai|claude|gpt|generateStructured|generateText|\bllm\b/i;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      assert.doesNotMatch(src, LLM_MARKERS, `${f} must not reference an LLM/AI provider`);
    }
  });

  await check('Evidence.value is structurally always a finite number across an adversarial battery of Signals', () => {
    const battery: Signals[] = [
      { ...emptySignals(), currentCtr: 0.1 },
      { ...emptySignals(), currentFrequency: 20 },
      { ...emptySignals(), resultsTrend: -0.9, currentResults: 999999 },
      { ...emptySignals(), resultsTrend: -0.99, spendTrend: 0.99 },
      { ...emptySignals(), frequencyTrend: 5, ctrTrend: -5, resultsTrend: -5, currentFrequency: 50 },
    ];
    const detectors = [detectLowCtr, detectHighFrequency, detectDecliningResults, detectRisingCostPerResult, detectAudienceFatigue];
    let checked = 0;
    for (const s of battery) {
      for (const det of detectors) {
        const issue = det(s);
        if (!issue) continue;
        for (const ev of issue.evidence) {
          assert.equal(typeof ev.value, 'number');
          assert.ok(Number.isFinite(ev.value), 'never NaN/Infinity either');
          checked++;
        }
      }
    }
    assert.ok(checked > 0, 'precondition: at least one detector must have fired somewhere in the battery');
  });

  console.log('\n── 12. Unknown/legacy evidence fails safely, never guessed ──');

  await check('parseIssueEvidenceJson never crashes and never claims CANONICAL for malformed input', () => {
    const malformed: unknown[] = [
      null, undefined, 'a string', 42, [1, 2, 3],
      {}, { currentCtr: 0.8, threshold: 1.0, confidence: 0.8 }, // the OLD flat shape
      { metrics: 'not an array', confidence: {} },
      { metrics: [], confidence: 'not an object' },
    ];
    for (const raw of malformed) {
      const parsed = parseIssueEvidenceJson(raw);
      assert.equal(parsed.status, 'LEGACY', `must be LEGACY, not guessed as CANONICAL: ${JSON.stringify(raw)}`);
    }
  });

  await check('a genuinely canonical shape is correctly recognized, including a real zero confidence', () => {
    const canonical = { metrics: [], confidence: { value: 0, basis: 'heuristic_constant' }, window: null };
    const parsed = parseIssueEvidenceJson(canonical);
    assert.equal(parsed.status, 'CANONICAL');
    assert.equal(parsed.status === 'CANONICAL' && parsed.confidence.value, 0,
      'a real zero confidence must not be treated as "missing"');
  });

  await check('issueEvidenceFieldsFromJson degrades a legacy row honestly: empty evidence, confidence read from the old key if present, never a crash', () => {
    const legacyWithConfidence = issueEvidenceFieldsFromJson({ currentCtr: 0.5, threshold: 1.0, confidence: 0.8 });
    assert.deepEqual(legacyWithConfidence.evidence, []);
    assert.equal(legacyWithConfidence.confidence.value, 0.8);
    assert.equal(legacyWithConfidence.window, null);

    const legacyWithoutConfidence = issueEvidenceFieldsFromJson({ someOtherShape: true });
    assert.deepEqual(legacyWithoutConfidence.evidence, []);
    assert.equal(typeof legacyWithoutConfidence.confidence.value, 'number', 'must not crash even with zero recognizable fields');
  });

  console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
  if (fail.length > 0) {
    console.error('failed: ' + fail.join(', '));
    process.exit(1);
  }
}

run();
