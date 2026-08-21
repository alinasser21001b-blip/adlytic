// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/detectAudienceFatigue.ts
//
//  AUDIENCE_FATIGUE is the canonical multi-signal diagnosis. No single
//  metric proves it; the pattern is what proves it. We look for the
//  three-way agreement:
//
//      frequency UP   +   CTR DOWN   +   results DOWN
//
//  Any two of those is suggestive. All three is what it looks like.
//
//  This is the rule most likely to be wrong in interesting ways, so it
//  carries an explicit confidence number on its evidence.
// ════════════════════════════════════════════════════════════════════════

import { IssueCode } from "@prisma/client";
import type { Detector } from "./types";
import type { Evidence } from "../../analytics/evidence";
import { severityFromMagnitude, confidenceFromCorroboration } from "./severity";

/**
 * Signal thresholds. Each is "is this metric moving in a fatigue-shaped way?"
 *
 * because:
 *   Frequency rise of 15%+ → meaningful pressure increase (Meta's own
 *     attribution-window guidance treats 10% as noise).
 *   CTR drop of 15%+ → above the typical creative-variance band.
 *   Results drop of 20%+ → above weekly noise for a small account.
 *
 *   The thresholds are deliberately LOWER than the severity buckets in
 *   severity.ts, because here we are asking "is this a signal at all?"
 *   not "how bad is the signal?" Severity comes from magnitude *after*
 *   we decide we're seeing fatigue.
 */
const FREQ_UP_SIGNAL = 0.15;
const CTR_DOWN_SIGNAL = 0.15;
const RESULTS_DOWN_SIGNAL = 0.20;

export const detectAudienceFatigue: Detector = (s) => {
  const freqUp = s.frequencyTrend != null && s.frequencyTrend >= FREQ_UP_SIGNAL;
  const ctrDown = s.ctrTrend != null && s.ctrTrend <= -CTR_DOWN_SIGNAL;
  const resultsDown = s.resultsTrend != null && s.resultsTrend <= -RESULTS_DOWN_SIGNAL;

  const signals = [freqUp, ctrDown, resultsDown];
  const present = signals.filter(Boolean).length;

  // Single-signal moves don't fire AUDIENCE_FATIGUE — they may fire other
  // rules (HIGH_FREQUENCY, DECLINING_RESULTS) instead. Fatigue requires
  // at least two corroborating signals.
  if (present < 2) return null;

  // Severity from the MOST SEVERE component movement. We are diagnosing
  // a pattern; magnitude comes from the strongest of its three signals.
  const magnitudes = [
    s.frequencyTrend != null ? Math.abs(s.frequencyTrend) : 0,
    s.ctrTrend != null ? Math.abs(s.ctrTrend) : 0,
    s.resultsTrend != null ? Math.abs(s.resultsTrend) : 0,
  ];
  const peakMagnitude = Math.max(...magnitudes);
  const severity = severityFromMagnitude(peakMagnitude);
  const confidence = confidenceFromCorroboration(signals);

  // Fatigue can fire on any two of the three signals — the third is
  // legitimately absent, not a real zero. Only push an Evidence item for a
  // metric that actually has a value; absence from this array IS
  // "unavailable," matching this repo's missing-vs-zero discipline
  // elsewhere (resultSemantics.ts, objectiveKpis.ts).
  const evidence: Evidence[] = [];
  if (s.frequencyTrend != null) {
    evidence.push({
      metricKey: 'frequencyTrend', valueKind: 'trend', unit: 'percent',
      value: s.frequencyTrend, threshold: FREQ_UP_SIGNAL, relativeToThreshold: null,
    });
  }
  if (s.ctrTrend != null) {
    evidence.push({
      metricKey: 'ctrTrend', valueKind: 'trend', unit: 'percent',
      value: s.ctrTrend, threshold: -CTR_DOWN_SIGNAL, relativeToThreshold: null,
    });
  }
  if (s.resultsTrend != null) {
    evidence.push({
      metricKey: 'resultsTrend', valueKind: 'trend', unit: 'percent',
      value: s.resultsTrend, threshold: -RESULTS_DOWN_SIGNAL, relativeToThreshold: null,
    });
  }
  if (s.currentFrequency != null) {
    evidence.push({
      metricKey: 'frequency', valueKind: 'level', unit: 'ratio',
      value: s.currentFrequency, threshold: null, relativeToThreshold: null,
    });
  }

  return {
    issueCode: IssueCode.AUDIENCE_FATIGUE,
    severity,
    confidence: { value: confidence, basis: 'measured_corroboration' },
    window: null,
    evidence,
  };
};
