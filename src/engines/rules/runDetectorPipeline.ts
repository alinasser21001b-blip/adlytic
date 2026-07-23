// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/runDetectorPipeline.ts
//
//  Single pure step shared by RulesEngine (account persistence) and
//  ruleGrounding (campaign brain). Keeps detector → diagnose in one place
//  so the two consumers cannot drift.
// ════════════════════════════════════════════════════════════════════════

import type { IssueRecord } from '../../repositories/detectedIssuesRepo';
import { diagnose, type Diagnosis } from './diagnose';
import { ALL_DETECTORS } from './detectors';
import type { Detector, Signals } from './types';

export interface DetectorPipelineResult {
  issues: IssueRecord[];
  diagnoses: Diagnosis[];
}

/** Run detectors then diagnose. Pure. No DB. */
export function runDetectorPipeline(
  signals: Signals,
  detectors: Detector[] = ALL_DETECTORS,
): DetectorPipelineResult {
  const issues: IssueRecord[] = [];
  for (const detect of detectors) {
    const issue = detect(signals);
    if (issue) issues.push(issue);
  }
  return {
    issues,
    diagnoses: diagnose(issues, signals),
  };
}
