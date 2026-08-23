// ════════════════════════════════════════════════════════════════════════
//  src/services/metaReadiness.ts
//
//  THE ONE Marketing API access-tier readiness calculation.
//
//  There must not be a Redis calculation and a Postgres calculation and a
//  graph calculation. Readiness is computed here, from the durable
//  telemetry in metaUsageStore, and every consumer reads the result.
//
//  ── READINESS IS NOT A BOOLEAN ────────────────────────────────────────
//
//  "false" was doing four jobs: not enough calls, too many errors, not
//  measured yet, and cannot be measured at all. Those need different
//  actions — wait, fix errors, wait longer, fix telemetry — so they get
//  different states.
//
//  ── THE POLICY IS SOURCED, NOT ASSUMED ────────────────────────────────
//
//  The thresholds below are Meta's, not ours, and Meta has changed them
//  before (the call minimum was lowered from 1,500 to 500, and the error
//  rate moved from a fixed period to a rolling last-500 window). So the
//  policy travels with its provenance and a verification date, and the
//  contract states plainly how it was checked.
//
//  IMPORTANT, and deliberately not glossed: developers.facebook.com and
//  developers.meta.com are both unreachable from the environment this code
//  was written in (the egress proxy blocks them). The thresholds were
//  corroborated against independent secondary sources on the date below and
//  they agree with each other and with the previous implementation — but
//  they are NOT primary-verified. `policySource` says exactly that, so a
//  reader can tell a corroborated figure from an official one instead of
//  taking a repository constant for current Meta policy.
// ════════════════════════════════════════════════════════════════════════

import {
  readUsageTelemetry,
  RECENT_WINDOW,
  USAGE_WINDOW_DAYS,
  type DurableUsageTelemetry,
} from './metaUsageStore';
import type { PrismaClient } from '@prisma/client';

/** Minimum successful Marketing API calls over the rolling window. */
export const CALL_THRESHOLD = 500;
/** Maximum error rate, percent, over the recent terminal window. */
export const ERROR_RATE_GATE_PCT = 15;

export const READINESS_POLICY = {
  /** Meta's current name for the feature. Renamed from "Ads Management Standard Access". */
  accessTierName: 'Marketing API Access Tier',
  callThreshold: CALL_THRESHOLD,
  callWindowDays: USAGE_WINDOW_DAYS,
  errorRateGatePct: ERROR_RATE_GATE_PCT,
  errorWindowCalls: RECENT_WINDOW,
  /**
   * How this policy was established. SECONDARY_CORROBORATED means multiple
   * independent non-Meta sources agree; PRIMARY means Meta's own docs were
   * read. Never claim PRIMARY without having actually fetched them.
   */
  policySource: 'SECONDARY_CORROBORATED' as const,
  policyVerifiedAt: '2026-08-23',
  policyNote:
    'Meta primary docs (developers.facebook.com / developers.meta.com) are '
    + 'unreachable from the build environment; thresholds corroborated against '
    + 'independent secondary sources and consistent with the prior implementation.',
} as const;

/**
 * READY           thresholds met over a fully measured window
 * NOT_READY       measured, and the thresholds are not met
 * COLLECTING      measuring, but the window is not yet fully covered
 * NOT_MEASURABLE  no durable telemetry — no numbers exist to judge
 */
export type ReadinessState = 'READY' | 'NOT_READY' | 'COLLECTING' | 'NOT_MEASURABLE';

export interface MetaReadiness {
  state: ReadinessState;
  /** Machine-readable cause. Never parse the human sentence. */
  reasonCode:
    | 'THRESHOLDS_MET'
    | 'CALLS_BELOW_THRESHOLD'
    | 'ERROR_RATE_ABOVE_GATE'
    | 'WINDOW_NOT_FULLY_COVERED'
    | 'TELEMETRY_UNAVAILABLE';
  policy: typeof READINESS_POLICY;
  telemetry: DurableUsageTelemetry;
  /** Convenience booleans. null when the input metric was not measured. */
  meetsCallThreshold: boolean | null;
  meetsErrorGate: boolean | null;
}

/**
 * Compute readiness. Pure with respect to the telemetry handed in, so the
 * adversarial suite can drive every state without a database.
 */
export function assessReadiness(t: DurableUsageTelemetry): MetaReadiness {
  if (t.measurement === 'UNAVAILABLE' || t.successfulCalls === null) {
    return {
      state: 'NOT_MEASURABLE',
      reasonCode: 'TELEMETRY_UNAVAILABLE',
      policy: READINESS_POLICY,
      telemetry: t,
      // null, not false. "We did not measure" is not "it failed".
      meetsCallThreshold: null,
      meetsErrorGate: null,
    };
  }

  const meetsCallThreshold = t.successfulCalls >= CALL_THRESHOLD;
  // An error gate needs a sample. With an empty recent window the gate is
  // unmeasured, not passed — a fresh install must not read as compliant.
  const meetsErrorGate = t.errorRatePct === null ? null : t.errorRatePct < ERROR_RATE_GATE_PCT;

  if (t.measurement === 'PARTIAL') {
    return {
      state: 'COLLECTING',
      reasonCode: 'WINDOW_NOT_FULLY_COVERED',
      policy: READINESS_POLICY,
      telemetry: t,
      meetsCallThreshold,
      meetsErrorGate,
    };
  }

  if (!meetsCallThreshold) {
    return {
      state: 'NOT_READY',
      reasonCode: 'CALLS_BELOW_THRESHOLD',
      policy: READINESS_POLICY,
      telemetry: t,
      meetsCallThreshold,
      meetsErrorGate,
    };
  }
  if (meetsErrorGate !== true) {
    return {
      state: 'NOT_READY',
      reasonCode: 'ERROR_RATE_ABOVE_GATE',
      policy: READINESS_POLICY,
      telemetry: t,
      meetsCallThreshold,
      meetsErrorGate,
    };
  }
  return {
    state: 'READY',
    reasonCode: 'THRESHOLDS_MET',
    policy: READINESS_POLICY,
    telemetry: t,
    meetsCallThreshold,
    meetsErrorGate,
  };
}

/** Read telemetry and assess in one call. */
export async function getMetaReadiness(prisma?: PrismaClient): Promise<MetaReadiness> {
  return assessReadiness(await readUsageTelemetry(prisma));
}
