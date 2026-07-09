// test_evidence_consistency.ts
// Architectural consistency: absolute signals + issue filtering + shared pipeline.
// Run: npx tsx test_evidence_consistency.ts

import { IssueCode, Severity } from '@prisma/client';
import {
  absoluteLevelSignals,
  issuesCompatibleWithSignals,
  signalsFromCampaignRaw,
} from './src/engines/rules/campaignSignals';
import { runDetectorPipeline } from './src/engines/rules/runDetectorPipeline';
import { buildRuleGrounding } from './src/engines/rules/ruleGrounding';
import { diagnose } from './src/engines/rules/diagnose';
import type { AccountBaseline, CampaignRawData } from './src/engine/BaselineCalculator';
import type { IssueRecord } from './src/repositories/detectedIssuesRepo';

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

const baseline: AccountBaseline = {
  avgCostPerMessage: 5,
  avgCTR: 2,
  avgFrequency: 2,
  avgCPM: 10,
  avgCPC: 0.5,
  metadata: {
    campaignCount: 5,
    totalSpend: 500,
    totalMessages: 100,
    totalImpressions: 50000,
    totalClicks: 1000,
  },
  confidence: { score: 80, level: 'high' },
};

console.log('\nevidence consistency');

{
  const levels = absoluteLevelSignals({
    currentCtr: 0.5,
    currentFrequency: 2,
    currentCpm: 8,
    currentResults: 10,
    currentSpend: 50,
  });
  check('absoluteLevelSignals nulls all trends',
    levels.ctrTrend === null && levels.resultsTrend === null && levels.spendTrend === null);

  const raw: CampaignRawData = {
    campaignId: 'c1',
    campaignName: 't',
    spend: 50,
    impressions: 10000,
    clicks: 50,
    ctr: 0.5,
    frequency: 2,
    messages: 10,
    cpm: 5,
    cpc: 1,
  };
  const fromRaw = signalsFromCampaignRaw(raw, baseline);
  const pipe = runDetectorPipeline(fromRaw);
  const grounding = buildRuleGrounding(raw, baseline);
  check('pipeline and grounding agree on issue codes',
    JSON.stringify(pipe.issues.map((i) => i.issueCode).sort()) ===
      JSON.stringify(grounding.issues.map((i) => i.code).sort()),
    { pipe: pipe.issues, grounding: grounding.issues });
  check('pipeline and grounding agree on diagnosis codes',
    JSON.stringify(pipe.diagnoses.map((d) => d.code).sort()) ===
      JSON.stringify(grounding.diagnoses.map((d) => d.code).sort()),
    { pipe: pipe.diagnoses.map((d) => d.code), grounding: grounding.diagnoses.map((d) => d.code) });
}

{
  const abs = absoluteLevelSignals({
    currentCtr: 2,
    currentFrequency: 2,
    currentCpm: 10,
    currentResults: 5,
    currentSpend: 100,
  });
  const mixed: IssueRecord[] = [
    { issueCode: IssueCode.LOW_CTR, severity: Severity.MEDIUM, evidence: {} },
    { issueCode: IssueCode.DECLINING_RESULTS, severity: Severity.HIGH, evidence: {} },
    { issueCode: IssueCode.AUDIENCE_FATIGUE, severity: Severity.HIGH, evidence: { confidence: 0.9 } },
    { issueCode: IssueCode.HIGH_FREQUENCY, severity: Severity.MEDIUM, evidence: {} },
  ];
  const filtered = issuesCompatibleWithSignals(mixed, abs);
  check('filters trend-dependent issues when no trends',
    filtered.every((i) => i.issueCode === IssueCode.LOW_CTR || i.issueCode === IssueCode.HIGH_FREQUENCY),
    filtered.map((i) => i.issueCode));
  const d = diagnose(filtered, { ...abs, currentCtr: 0.5 });
  check('no DECLINING_OUTCOMES / POST_CLICK without trends',
    !d.some((x) => x.code === 'DECLINING_OUTCOMES' || x.code === 'POST_CLICK_PROBLEM'),
    d.map((x) => x.code));
}

{
  const withTrends = absoluteLevelSignals({
    currentCtr: 1.5,
    currentFrequency: 2,
    currentCpm: 10,
    currentResults: 20,
    currentSpend: 100,
  });
  withTrends.resultsTrend = -0.4;
  withTrends.ctrTrend = 0.05;
  const mixed: IssueRecord[] = [
    { issueCode: IssueCode.DECLINING_RESULTS, severity: Severity.HIGH, evidence: {} },
  ];
  const kept = issuesCompatibleWithSignals(mixed, withTrends);
  check('keeps trend issues when trends present', kept.length === 1);
}

console.log(`\nevidence consistency: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
