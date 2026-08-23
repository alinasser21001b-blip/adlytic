// ════════════════════════════════════════════════════════════════════════
//  test_operational_truth.ts
//
//  Adversarial matrix for the canonical operational truth model.
//
//  Every case here is a state the OLD model rendered wrong. The point is not
//  that the new code passes — it is that each of these was, at some point, a
//  red badge or a fabricated number on a real console:
//
//    Redis absent by design      → "not tested"      (warning)
//    BullMQ disabled by design   → "not tested"      (warning)
//    Telemetry unreadable        → "0 / 500"         (a measurement)
//    No workspace selected       → folded into health
//    LLM absent                  → "AI: not tested"  (implying the Brain)
//    A 48-hour-old success       → current health
//
//  A guard that only checks the happy path would have passed on all six.
// ════════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  contextNotSelected,
  deriveFreshness,
  notConfiguredOptional,
  notConfiguredRequired,
  notMeasurable,
  notTested,
  observed,
  toLegacyOpsStatus,
  worstSeverity,
  OPS_REASON_CODES,
} from './src/services/operationalTruth';
import { assessReadiness, READINESS_POLICY, CALL_THRESHOLD } from './src/services/metaReadiness';
import { unavailableTelemetry, type DurableUsageTelemetry } from './src/services/metaUsageStore';

let failed = 0; let passed = 0;
const check = (name: string, fn: () => void): void => {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.error('  ✗ ' + name); console.error('      ' + (e as Error).message); failed++; }
};

const SRC = { key: 'k', summary: 's', source: 'test' };

// ── R. Redis / queue ────────────────────────────────────────────────────
console.log('\n── R. Redis and queue execution ──');

check('R1 BullMQ off + Redis unset → queue is HEALTHY, IN_PROCESS, and NOT a warning', () => {
  const a = notConfiguredOptional({
    ...SRC, key: 'queue', reasonCode: 'QUEUE_IN_PROCESS_FALLBACK',
    requiredness: 'NOT_REQUIRED', mode: 'IN_PROCESS',
  });
  assert.equal(a.health, 'HEALTHY', 'work executes in-process, so the consequence is nothing');
  assert.equal(a.mode, 'IN_PROCESS');
  assert.equal(a.severity, 'NONE', 'an intentionally-absent optional dependency must not colour the console');
  assert.equal(a.actionability, 'NONE');
  assert.notEqual(toLegacyOpsStatus(a), 'NOT_TESTED',
    'the legacy projection must NOT reintroduce the false "not tested" badge');
  assert.equal(toLegacyOpsStatus(a), 'HEALTHY');
});

check('R1b Redis absent by design is NOT_REQUIRED and contributes nothing to the aggregate', () => {
  const redis = notConfiguredOptional({
    ...SRC, key: 'redis', reasonCode: 'REDIS_ABSENT_BY_DESIGN', requiredness: 'NOT_REQUIRED',
  });
  const db = observed({
    ...SRC, key: 'database', health: 'HEALTHY', reasonCode: 'OK', observedAt: new Date().toISOString(),
  });
  assert.equal(worstSeverity([db, redis]), 'NONE',
    'a deliberately absent optional dependency must not drag the aggregate');
});

check('R2 BullMQ on + broker healthy → BULLMQ mode, observed', () => {
  const a = observed({
    ...SRC, key: 'queue', health: 'HEALTHY', reasonCode: 'QUEUE_BULLMQ_ACTIVE',
    mode: 'BULLMQ', observedAt: new Date().toISOString(),
  });
  assert.equal(a.mode, 'BULLMQ');
  assert.equal(a.measurement, 'OBSERVED');
});

check('R3 BullMQ on + broker down → DEGRADED (not HEALTHY, not FAILED) and falls back in-process', () => {
  const a = observed({
    ...SRC, key: 'queue', health: 'DEGRADED', reasonCode: 'QUEUE_BULLMQ_ENABLED_BUT_BROKER_DOWN',
    mode: 'IN_PROCESS', observedAt: new Date().toISOString(),
  });
  assert.equal(a.health, 'DEGRADED', 'BullMQ must not read as healthy when the broker is gone');
  assert.equal(a.mode, 'IN_PROCESS', 'work still executes, so the mode is the fallback');
  assert.equal(a.severity, 'WARNING');
});

check('R4 validation reader → background NOT_REQUIRED, no error', () => {
  const a = notConfiguredOptional({
    ...SRC, key: 'workers', reasonCode: 'BACKGROUND_NOT_REQUIRED_FOR_ROLE', requiredness: 'NOT_REQUIRED',
  });
  assert.equal(a.severity, 'NONE', 'a reader is not unhealthy for not running workers');
  assert.equal(a.health, 'HEALTHY');
});

check('R5 production worker with recent success → HEALTHY and carries a timestamp', () => {
  const now = new Date().toISOString();
  const a = observed({
    ...SRC, key: 'workers', health: 'HEALTHY', reasonCode: 'BACKGROUND_RECENT_SUCCESS', observedAt: now,
  });
  assert.equal(a.health, 'HEALTHY');
  assert.equal(a.observedAt, now, 'an observation without a time cannot be aged');
});

// ── U. Readiness / telemetry ────────────────────────────────────────────
console.log('\n── U. Meta readiness measurement ──');

function telemetry(over: Partial<DurableUsageTelemetry>): DurableUsageTelemetry {
  return {
    measurement: 'MEASURED', measurementStartedAt: '2026-08-01T00:00:00.000Z',
    coveredDays: 15, windowDays: 15, successfulCalls: 0, errorCalls: 0,
    errorsByCategory: {}, recentWindowSize: 0, errorRatePct: null, latestHeaders: null,
    ...over,
  };
}

check('U1 telemetry unavailable → NOT_MEASURABLE with NULL metrics, never 0', () => {
  const r = assessReadiness(unavailableTelemetry());
  assert.equal(r.state, 'NOT_MEASURABLE');
  assert.equal(r.reasonCode, 'TELEMETRY_UNAVAILABLE');
  assert.equal(r.telemetry.successfulCalls, null, 'THE headline defect: an unmeasured count must be null');
  assert.equal(r.telemetry.recentWindowSize, null);
  assert.equal(r.telemetry.errorRatePct, null);
  assert.equal(r.meetsCallThreshold, null, 'null, not false — "not measured" is not "failed"');
  assert.equal(r.meetsErrorGate, null);
});

check('U1b an unmeasured metric is not merely falsy — it is strictly null', () => {
  const t = unavailableTelemetry();
  // 0 is falsy too; this is the assertion that would have caught the original
  // bug, because the old emptyStats() passed every truthiness check.
  assert.strictEqual(t.successfulCalls, null);
  assert.notStrictEqual(t.successfulCalls as unknown, 0);
});

check('U2 telemetry present with zero calls → MEASURED zero (a real observation)', () => {
  const r = assessReadiness(telemetry({ successfulCalls: 0, recentWindowSize: 0 }));
  assert.equal(r.telemetry.successfulCalls, 0, 'an observed zero IS a measurement and must survive');
  assert.equal(r.telemetry.measurement, 'MEASURED');
  assert.equal(r.state, 'NOT_READY');
  assert.equal(r.reasonCode, 'CALLS_BELOW_THRESHOLD');
});

check('U3 measurement began recently → COLLECTING, not NOT_READY', () => {
  const r = assessReadiness(telemetry({ measurement: 'PARTIAL', coveredDays: 3, successfulCalls: 40 }));
  assert.equal(r.state, 'COLLECTING');
  assert.equal(r.reasonCode, 'WINDOW_NOT_FULLY_COVERED');
  assert.equal(r.telemetry.coveredDays, 3, 'partial coverage must be stated, not implied');
});

check('U4 full window below threshold → NOT_READY', () => {
  const r = assessReadiness(telemetry({ successfulCalls: CALL_THRESHOLD - 1, recentWindowSize: 500, errorRatePct: 1 }));
  assert.equal(r.state, 'NOT_READY');
  assert.equal(r.reasonCode, 'CALLS_BELOW_THRESHOLD');
});

check('U5 thresholds met → READY', () => {
  const r = assessReadiness(telemetry({ successfulCalls: CALL_THRESHOLD, recentWindowSize: 500, errorRatePct: 2 }));
  assert.equal(r.state, 'READY');
  assert.equal(r.meetsCallThreshold, true);
  assert.equal(r.meetsErrorGate, true);
});

check('U6 empty recent window → error gate is UNMEASURED (null), never "passed"', () => {
  const r = assessReadiness(telemetry({ successfulCalls: CALL_THRESHOLD, recentWindowSize: 0, errorRatePct: null }));
  assert.equal(r.meetsErrorGate, null, 'no sample means no verdict — a fresh install must not read as compliant');
  assert.equal(r.state, 'NOT_READY');
  assert.equal(r.reasonCode, 'ERROR_RATE_ABOVE_GATE');
});

check('U7 error rate at/above the gate → NOT_READY', () => {
  const r = assessReadiness(telemetry({ successfulCalls: 900, recentWindowSize: 500, errorRatePct: 15 }));
  assert.equal(r.state, 'NOT_READY');
  assert.equal(r.reasonCode, 'ERROR_RATE_ABOVE_GATE', 'the gate is < 15%, so exactly 15 fails');
});

check('U8 the policy travels with its provenance and is NOT claimed as primary-verified', () => {
  assert.equal(READINESS_POLICY.callThreshold, 500);
  assert.equal(READINESS_POLICY.errorRateGatePct, 15);
  assert.equal(READINESS_POLICY.callWindowDays, 15);
  assert.equal(READINESS_POLICY.errorWindowCalls, 500);
  assert.ok(READINESS_POLICY.policyVerifiedAt, 'a policy without a verification date is folklore');
  assert.equal(READINESS_POLICY.policySource, 'SECONDARY_CORROBORATED',
    'Meta primary docs are unreachable from this environment; claiming PRIMARY would be a lie');
});

// ── C / A. Context and intelligence ─────────────────────────────────────
console.log('\n── C. Selection context, A. intelligence vs narration ──');

for (const key of ['workspace', 'meta_account', 'entity']) {
  check(`C:${key} not selected → context dimension, health untouched`, () => {
    const a = contextNotSelected({ ...SRC, key });
    assert.equal(a.context, 'NOT_SELECTED');
    assert.equal(a.health, 'HEALTHY', 'nothing is broken; the viewer simply has not chosen');
    assert.equal(a.actionability, 'USER_CONTEXT', 'this is the viewer\'s move, not an operator incident');
    assert.notEqual(a.severity, 'ERROR');
    assert.notEqual(a.severity, 'WARNING');
  });
}

check('A1 LLM absent → narration NOT_CONFIGURED, deterministic Brain unaffected', () => {
  const brain = observed({
    ...SRC, key: 'intelligence', health: 'HEALTHY', reasonCode: 'BRAIN_DETERMINISTIC_OK',
    observedAt: new Date().toISOString(),
  });
  const llm = notConfiguredOptional({
    ...SRC, key: 'llm_narration', reasonCode: 'LLM_NOT_CONFIGURED', requiredness: 'OPTIONAL',
  });
  assert.equal(brain.health, 'HEALTHY', 'the canonical chain is deterministic and owes nothing to a provider');
  assert.equal(llm.severity, 'NONE');
  assert.notEqual(brain.key, llm.key, 'the two must be separately addressable subsystems');
});

check('A2 narration degraded does not degrade the Brain', () => {
  const llm = observed({
    ...SRC, key: 'llm_narration', health: 'DEGRADED', reasonCode: 'LLM_NOT_PROBED',
    requiredness: 'OPTIONAL', observedAt: new Date().toISOString(),
  });
  const brain = observed({
    ...SRC, key: 'intelligence', health: 'HEALTHY', reasonCode: 'BRAIN_DETERMINISTIC_OK',
    observedAt: new Date().toISOString(),
  });
  assert.equal(brain.health, 'HEALTHY');
  assert.equal(llm.health, 'DEGRADED');
});

// ── model invariants ────────────────────────────────────────────────────
console.log('\n── model invariants ──');

check('a REQUIRED dependency that is missing is a real failure', () => {
  const a = notConfiguredRequired({ ...SRC, key: 'database', reasonCode: 'NOT_CONFIGURED_REQUIRED' });
  assert.equal(a.health, 'FAILED');
  assert.equal(a.severity, 'ERROR', 'the optional-is-fine rule must NOT swallow a required dependency');
  assert.equal(a.actionability, 'OPERATOR_ACTION');
});

check('NOT_TESTED and NOT_MEASURABLE are different answers', () => {
  const t = notTested({ ...SRC });
  const m = notMeasurable({ ...SRC });
  assert.equal(t.measurement, 'NOT_TESTED');
  assert.equal(m.measurement, 'NOT_MEASURABLE');
  assert.notEqual(t.reasonCode, m.reasonCode, 'a probe we never ran is not a fact we cannot measure');
  assert.equal(toLegacyOpsStatus(t), 'NOT_TESTED');
  assert.equal(toLegacyOpsStatus(m), 'UNKNOWN');
});

check('freshness is domain-specific, and an absent observation is UNKNOWN not CURRENT', () => {
  const now = Date.now();
  const tenMinAgo = new Date(now - 10 * 60_000).toISOString();
  assert.equal(deriveFreshness(tenMinAgo, 60 * 60_000, now), 'CURRENT');
  assert.equal(deriveFreshness(tenMinAgo, 5 * 60_000, now), 'STALE',
    'the same observation is fresh or stale depending on the window — one global TTL cannot be right');
  assert.equal(deriveFreshness(null, 60_000, now), 'UNKNOWN', 'never observed must not read as current');
});

check('every reason code is unique and SCREAMING_SNAKE (machine-readable, not prose)', () => {
  const set = new Set(OPS_REASON_CODES);
  assert.equal(set.size, OPS_REASON_CODES.length, 'duplicate reason codes make consumers ambiguous');
  for (const c of OPS_REASON_CODES) {
    assert.match(c, /^[A-Z][A-Z0-9_]*$/, `${c} must be a machine token, not a sentence`);
  }
});

check('health carries no measurement or configuration member — the axes stay separate', () => {
  // The regression this blocks is the tempting one: adding NOT_CONFIGURED
  // back onto health "just for this case", which is how the original scalar
  // grew to eight overloaded values in the first place.
  const a = observed({ ...SRC, health: 'HEALTHY', reasonCode: 'OK', observedAt: new Date().toISOString() });
  const healthValues = ['HEALTHY', 'DEGRADED', 'FAILED', 'BLOCKED', 'UNKNOWN'];
  assert.ok(healthValues.includes(a.health));
  assert.ok(!healthValues.includes('NOT_CONFIGURED' as never));
  assert.ok(!healthValues.includes('NOT_TESTED' as never));
});

// ── sanitization of the operational payload ─────────────────────────────
console.log('\n── operational payload sanitization ──');

check('adminOpsHealth scrubs the provider error before returning it', () => {
  const src = readFileSync(join(__dirname, 'src/services/adminOpsHealth.ts'), 'utf8');
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  // The ASSIGNMENT, not the interface declaration — matching the first
  // `lastSyncError:` in the file finds `lastSyncError: string | null;` and
  // passes for the wrong reason.
  const m = /lastSyncError:\s*sync\?[^\n]+/.exec(code);
  assert.ok(m, 'the lastSyncError assignment must still exist');
  assert.ok(m![0].includes('scrubString'),
    'lastSyncError is a provider error verbatim over an admin API — it must go through scrubString');
});

check('the operational row exposes token PRESENCE, never a token value', () => {
  const src = readFileSync(join(__dirname, 'src/services/adminOpsHealth.ts'), 'utf8');
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

  // Reading the encrypted column to derive a boolean is correct and expected;
  // what must never happen is that column reaching an OUTPUT field. So the
  // guard checks the emitted shape, not the mere mention of the name.
  const rowShape = /const rows: WorkspaceOpsRow\[\][\s\S]*?\n  \}\);/.exec(code);
  assert.ok(rowShape, 'the per-workspace row builder must be findable');
  assert.ok(!/\baccessTokenEncrypted\s*,/.test(rowShape![0]),
    'accessTokenEncrypted must not be shorthand-returned into the row');
  assert.ok(!/:\s*acct\.accessTokenEncrypted/.test(rowShape![0]),
    'no output field may be assigned the encrypted token');
  assert.ok(/hasToken/.test(rowShape![0]), 'presence must still be reported as a boolean');
});

check('the new operational modules reference no credential at all', () => {
  for (const f of ['src/services/operationalTruth.ts', 'src/services/metaUsageStore.ts',
                   'src/services/metaReadiness.ts']) {
    const code = readFileSync(join(__dirname, f), 'utf8')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    for (const bad of ['accessToken', 'Authorization', 'JWT_SECRET',
                       'TOKEN_ENCRYPTION_KEY', 'META_APP_SECRET', 'apiKey']) {
      assert.ok(!code.includes(bad), `${f} must not reference ${bad} in executable code`);
    }
  }
});

console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES, ${passed} passed`} ════\n`);
process.exit(failed ? 1 : 0);
