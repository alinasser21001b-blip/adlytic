// test_orchestrator.ts — pure-logic assertions for the Connection Orchestrator.
//
// Scope on purpose: NO database, NO network. Everything covered here is a
// pure function — the adaptive backoff curve and the Meta adapter's planner.
// `planSteps` being pure is what makes plan behavior testable at all; if a
// future change makes it do I/O, this file stops compiling and that is the
// intended alarm.
import { nextCheckDelayMs, nextCheckAt, isWaitExpired, WAIT_EXPIRY_MS } from './src/orchestrator/polling';
import { MetaAdapter } from './src/orchestrator/adapters/metaAdapter';
import type { CapabilitySet, OnboardingContext } from './src/orchestrator/contracts';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, actual?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — got:`, actual); }
}

const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ── nextCheckDelayMs: dense early, decaying, null past expiry ──
check('delay at t=0 is 30s (dense bucket)', nextCheckDelayMs(0) === 30 * SEC, nextCheckDelayMs(0));
check('negative elapsed clamps to dense bucket', nextCheckDelayMs(-5 * MIN) === 30 * SEC);
check('just under 5m still dense', nextCheckDelayMs(5 * MIN - 1) === 30 * SEC);
check('at 5m boundary decays to 2m', nextCheckDelayMs(5 * MIN) === 2 * MIN, nextCheckDelayMs(5 * MIN));
check('at 30m decays to 5m', nextCheckDelayMs(30 * MIN) === 5 * MIN);
check('at 2h decays to 15m', nextCheckDelayMs(2 * HOUR) === 15 * MIN);
check('at 24h decays to 1h (long tail)', nextCheckDelayMs(24 * HOUR) === HOUR);
check('just under 7d still polling', nextCheckDelayMs(7 * DAY - 1) === HOUR);
check('at 7d returns null (abandoned)', nextCheckDelayMs(7 * DAY) === null, nextCheckDelayMs(7 * DAY));
check('well past 7d returns null', nextCheckDelayMs(30 * DAY) === null);
// The curve must be monotonically non-decreasing — a backoff that speeds up
// over time would be a quota bug, not a feature.
{
  const samples = [0, 4 * MIN, 20 * MIN, HOUR, 12 * HOUR, 3 * DAY];
  const delays = samples.map((s) => nextCheckDelayMs(s) as number);
  check('curve never speeds up', delays.every((d, i) => i === 0 || d >= delays[i - 1]!), delays);
}

// ── nextCheckAt / isWaitExpired boundaries ──
{
  const now = new Date('2026-08-06T12:00:00.000Z');
  const justStarted = new Date(now.getTime() - 1 * MIN);
  const at = nextCheckAt(justStarted, now);
  check('nextCheckAt = now + dense delay', at?.getTime() === now.getTime() + 30 * SEC, at);

  const oldWait = new Date(now.getTime() - 3 * HOUR);
  check('nextCheckAt uses the decayed bucket', nextCheckAt(oldWait, now)?.getTime() === now.getTime() + 15 * MIN);

  const expired = new Date(now.getTime() - WAIT_EXPIRY_MS);
  check('nextCheckAt null exactly at expiry', nextCheckAt(expired, now) === null);
  check('isWaitExpired true exactly at expiry', isWaitExpired(expired, now) === true);

  const almost = new Date(now.getTime() - (WAIT_EXPIRY_MS - 1));
  check('isWaitExpired false 1ms before expiry', isWaitExpired(almost, now) === false);
  check('nextCheckAt non-null 1ms before expiry', nextCheckAt(almost, now) !== null);
  check('isWaitExpired false for a fresh wait', isWaitExpired(now, now) === false);
}

// ── Meta adapter planSteps — pure, capability-driven ──
const adapter = new MetaAdapter();
const ctx = {
  onboardingId: 'ob_1',
  workspaceId: 'ws_1',
  provider: 'META',
  externalAccountId: 'act_123',
  attempts: 0,
  linkedAdAccountId: null,
  prisma: null as never,
} as unknown as OnboardingContext;

function caps(probed: Partial<CapabilitySet['probed']>): CapabilitySet {
  return {
    static: { hasSystemUserToken: true, hasAppCredentials: true, canLoginForBusiness: true },
    probed: { assetVisible: false, requestPending: false, alreadyLinked: false, ...probed },
    detectedAt: new Date().toISOString(),
  };
}

{
  const plan = adapter.planSteps(caps({ alreadyLinked: true }), ctx);
  check('alreadyLinked → sync only', plan.map((s) => s.id).join(',') === 'META_START_SYNC', plan);
  check('alreadyLinked sync targets READY', plan[0]?.targetState === 'READY');
}
{
  const plan = adapter.planSteps(caps({ assetVisible: true }), ctx);
  check(
    'assetVisible → connect then sync',
    plan.map((s) => s.id).join(',') === 'META_CREATE_CONNECTION,META_START_SYNC',
    plan.map((s) => s.id),
  );
  check('connect targets CONNECTING', plan[0]?.targetState === 'CONNECTING');
  check('sync targets READY', plan[1]?.targetState === 'READY');
}
{
  const plan = adapter.planSteps(caps({}), ctx);
  check(
    'nothing visible → await, connect, sync',
    plan.map((s) => s.id).join(',') === 'META_AWAIT_GRANT,META_CREATE_CONNECTION,META_START_SYNC',
    plan.map((s) => s.id),
  );
  check('await targets VERIFYING', plan[0]?.targetState === 'VERIFYING');
  check('await step kind is AWAIT_EXTERNAL_GRANT', plan[0]?.kind === 'AWAIT_EXTERNAL_GRANT');
  check('labels are Arabic', plan.every((s) => /[؀-ۿ]/.test(s.label)));
  check('step ids are unique within a plan', new Set(plan.map((s) => s.id)).size === plan.length);
}
{
  // alreadyLinked dominates: a linked account must never be re-created,
  // regardless of what the visibility probe said.
  const plan = adapter.planSteps(caps({ alreadyLinked: true, assetVisible: true }), ctx);
  check('alreadyLinked wins over assetVisible', plan.length === 1 && plan[0]?.id === 'META_START_SYNC', plan);
}
{
  // Purity guard: same input twice → structurally identical output.
  const c = caps({ assetVisible: true });
  check('planSteps is deterministic', JSON.stringify(adapter.planSteps(c, ctx)) === JSON.stringify(adapter.planSteps(c, ctx)));
  // STATIC capabilities do not reorder the plan — only PROBED truth does.
  const poorStatic: CapabilitySet = { ...c, static: { hasSystemUserToken: false, hasAppCredentials: false, canLoginForBusiness: false } };
  check('plan depends on PROBED, not STATIC', JSON.stringify(adapter.planSteps(poorStatic, ctx)) === JSON.stringify(adapter.planSteps(c, ctx)));
}

console.log(`\n════ ${passed} passed, ${failed} failed ════`);
if (failed > 0) process.exit(1);
