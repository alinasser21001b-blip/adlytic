// test_diagnose.ts — diagnosis coverage including single-signal patterns.
// Run: npx tsx test_diagnose.ts

import { diagnose } from './src/engines/rules/diagnose';
import type { IssueRecord } from './src/repositories/detectedIssuesRepo';
import type { Signals } from './src/engines/rules/types';
import { IssueCode, Severity } from '@prisma/client';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`);
  }
}

function issue(code: IssueCode, evidence: Record<string, unknown> = {}): IssueRecord {
  return { issueCode: code, severity: Severity.MEDIUM, evidence: { confidence: 0.8, ...evidence } };
}

const baseSignals: Signals = {
  ctrTrend: null,
  cpmTrend: null,
  frequencyTrend: null,
  resultsTrend: null,
  spendTrend: null,
  currentCtr: 1.5,
  currentFrequency: 2.0,
  currentCpm: 10,
  currentResults: 20,
  currentSpend: 100,
};

console.log('\ndiagnose coverage');

{
  const d = diagnose(
    [issue(IssueCode.AUDIENCE_FATIGUE, { confidence: 0.9 })],
    {
      ...baseSignals,
      frequencyTrend: 0.3,
      ctrTrend: -0.25,
      currentFrequency: 4.2,
    },
  );
  check('creative fatigue fires', d.some((x) => x.code === 'CREATIVE_FATIGUE'), d.map((x) => x.code));
}

{
  const d = diagnose(
    [issue(IssueCode.LOW_CTR)],
    { ...baseSignals, currentCtr: 0.6 },
  );
  check('weak creative from LOW_CTR alone', d.some((x) => x.code === 'WEAK_CREATIVE'), d.map((x) => x.code));
  check('weak creative has action', Boolean(d[0]?.action), d[0]);
}

{
  const d = diagnose(
    [issue(IssueCode.HIGH_FREQUENCY)],
    { ...baseSignals, currentFrequency: 6.2 },
  );
  check('high frequency alone', d.some((x) => x.code === 'HIGH_FREQUENCY_PRESSURE'), d.map((x) => x.code));
}

{
  const d = diagnose(
    [issue(IssueCode.DECLINING_RESULTS)],
    { ...baseSignals, resultsTrend: -0.35, currentCtr: 0.8 },
  );
  check('declining outcomes alone', d.some((x) => x.code === 'DECLINING_OUTCOMES'), d.map((x) => x.code));
}

{
  // Richer pattern should suppress single-signal fallbacks.
  const d = diagnose(
    [issue(IssueCode.AUDIENCE_FATIGUE), issue(IssueCode.LOW_CTR)],
    {
      ...baseSignals,
      frequencyTrend: 0.4,
      ctrTrend: -0.3,
      currentFrequency: 5,
      currentCtr: 0.5,
    },
  );
  check('fatigue wins over weak creative', d.some((x) => x.code === 'CREATIVE_FATIGUE'));
  check('no weak creative when fatigue present', !d.some((x) => x.code === 'WEAK_CREATIVE'), d.map((x) => x.code));
}

{
  const d = diagnose(
    [issue(IssueCode.DECLINING_RESULTS)],
    { ...baseSignals, resultsTrend: -0.4, currentCtr: 1.8, ctrTrend: 0.05 },
  );
  check('post-click when CTR healthy', d.some((x) => x.code === 'POST_CLICK_PROBLEM'), d.map((x) => x.code));
}

console.log(`\ndiagnose: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
