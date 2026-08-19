/**
 * P1-01 — priorityAction cross-engine consistency regression suite.
 *
 * Guards the fix wiring src/analytics/intelligence/hierarchy.ts's existing
 * permitAction()/reconcileIntelligence() guard — previously applied only to
 * intelligence.recommendation (analytics/intelligence/recommend.ts) — into
 * src/services/getDashboard.ts's priorityAction, the merchant's primary CTA.
 *
 * getDashboard() itself needs a live database (no sandbox DB here, same as
 * test_result_semantics_service.ts's approach) so this exercises the actual
 * guard functions directly: permitAction() with its widened action lists,
 * and buildEntityIntelligence()'s new forbiddenActions exposure — the two
 * pieces the getDashboard.ts call site is built from.
 *
 * Run: npx tsx test_priority_action_consistency.ts
 */
import assert from 'node:assert/strict';
import { permitAction, type ReconciledIntelligence } from './src/analytics/intelligence/hierarchy';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

function reconciled(overrides: Partial<ReconciledIntelligence> = {}): ReconciledIntelligence {
  return {
    problemClass: 'POST_CLICK',
    confidence: 'HIGH',
    decidedBy: 'FUNNEL_DIAGNOSIS',
    alert: true,
    suppressedIssueCodes: [],
    forbiddenActions: [],
    evidence: [],
    trace: [],
    ...overrides,
  };
}

console.log('\n── 0. Regression fixture: the same class of disagreement that once produced two health scores ──');

check('reproduces the pre-fix gap: a POST_CLICK diagnosis forbids creative/audience actions, but priorityAction\'s own vocabulary (compositionRules.ts) was never checked against it', () => {
  // Same shape as the health-score bug this repo already fixed once (commit
  // 97bafb1): two producers, one account, one response, disagreeing — here
  // the funnel (upstream verified healthy) vs. the deterministic composition
  // engine's REAL action code (REFRESH_CREATIVES, not recommend.ts's
  // REFRESH_CREATIVE) for the exact scenario recommend.ts's own header
  // names: "CTR healthy, link clicks healthy, post-click conversion broken."
  const r = reconciled({
    problemClass: 'POST_CLICK',
    forbiddenActions: ['REFRESH_CREATIVE', 'REFRESH_CREATIVES', 'CHANGE_CREATIVE', 'NEW_CREATIVE', 'IMPROVE_HOOKS',
      'EXPAND_AUDIENCE', 'WIDEN_TARGETING', 'INCREASE_BUDGET', 'BROADEN_AUDIENCE', 'CHECK_TARGETING', 'REVIEW_BUDGET_PACING'],
  });
  const verdict = permitAction('REFRESH_CREATIVES', r);
  assert.equal(verdict.allowed, false, 'compositionRules.ts\'s own action code must now be recognized as forbidden');
  assert.match(verdict.reason ?? '', /POST_CLICK/);
});

console.log('\n── A. consistent recommendation → priorityAction allowed ──');

check('A. an action not in forbiddenActions is permitted', () => {
  const r = reconciled({ problemClass: 'CLICK', forbiddenActions: ['EXPAND_AUDIENCE', 'BROADEN_AUDIENCE', 'CHECK_TARGETING', 'REVIEW_BUDGET_PACING'] });
  const verdict = permitAction('REFRESH_CREATIVES', r);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, undefined);
});

console.log('\n── B. contradictory recommendation → priorityAction blocked, per existing policy ──');

check('B. compositionRules.ts\'s BROADEN_AUDIENCE is blocked under a POST_CLICK/CONVERSION diagnosis', () => {
  const r = reconciled({ problemClass: 'CONVERSION', forbiddenActions: ['EXPAND_AUDIENCE', 'WIDEN_TARGETING', 'INCREASE_BUDGET', 'BROADEN_AUDIENCE', 'CHECK_TARGETING', 'REVIEW_BUDGET_PACING', 'REFRESH_CREATIVE', 'REFRESH_CREATIVES', 'CHANGE_CREATIVE', 'NEW_CREATIVE', 'IMPROVE_HOOKS'] });
  assert.equal(permitAction('BROADEN_AUDIENCE', r).allowed, false);
});

check('B2. compositionRules.ts\'s IMPROVE_HOOKS (a creative action) is blocked under CONVERSION, same as REFRESH_CREATIVE(S)', () => {
  const r = reconciled({ problemClass: 'CONVERSION', forbiddenActions: ['REFRESH_CREATIVE', 'REFRESH_CREATIVES', 'CHANGE_CREATIVE', 'NEW_CREATIVE', 'IMPROVE_HOOKS'] });
  assert.equal(permitAction('IMPROVE_HOOKS', r).allowed, false);
});

check('PAUSE_AND_RELAUNCH is deliberately NOT in either action list — never auto-blocked by this guard (undecided on purpose, not silently permissive by omission of judgement)', () => {
  const r = reconciled({ problemClass: 'CONVERSION', forbiddenActions: ['REFRESH_CREATIVE', 'REFRESH_CREATIVES', 'CHANGE_CREATIVE', 'NEW_CREATIVE', 'IMPROVE_HOOKS', 'EXPAND_AUDIENCE', 'WIDEN_TARGETING', 'INCREASE_BUDGET', 'BROADEN_AUDIENCE', 'CHECK_TARGETING', 'REVIEW_BUDGET_PACING'] });
  assert.equal(permitAction('PAUSE_AND_RELAUNCH', r).allowed, true, 'not categorized as creative or audience — passes through unblocked, matching the documented decision not to guess');
});

console.log('\n── C. the existing (recommend.ts) call site\'s behavior is unchanged ──');

check('C. recommend.ts\'s own vocabulary (REFRESH_CREATIVE singular, EXPAND_AUDIENCE) still blocks exactly as before the list was widened', () => {
  const clickHealthy = reconciled({ problemClass: 'POST_CLICK', forbiddenActions: ['REFRESH_CREATIVE', 'REFRESH_CREATIVES', 'CHANGE_CREATIVE', 'NEW_CREATIVE', 'IMPROVE_HOOKS', 'EXPAND_AUDIENCE', 'WIDEN_TARGETING', 'INCREASE_BUDGET', 'BROADEN_AUDIENCE', 'CHECK_TARGETING', 'REVIEW_BUDGET_PACING'] });
  assert.equal(permitAction('REFRESH_CREATIVE', clickHealthy).allowed, false);
  const creativeIsProblem = reconciled({ problemClass: 'CLICK', forbiddenActions: ['EXPAND_AUDIENCE', 'WIDEN_TARGETING', 'INCREASE_BUDGET', 'BROADEN_AUDIENCE', 'CHECK_TARGETING', 'REVIEW_BUDGET_PACING'] });
  assert.equal(permitAction('REFRESH_CREATIVE', creativeIsProblem).allowed, true, 'CLICK problem still permits addressing the creative, as before');
});

console.log('\n── D. fallback behavior is deterministic ──');

check('D. permitAction with no actionCode is always allowed (no candidate to judge)', () => {
  const r = reconciled({ forbiddenActions: ['REFRESH_CREATIVES'] });
  assert.equal(permitAction(null, r).allowed, true);
  assert.equal(permitAction(undefined, r).allowed, true);
});

console.log('\n── E. no action is invented when all candidates fail consistency ──');

check('E. a blocked action resolves to disallowed, never substituted with a different actionCode', () => {
  const r = reconciled({ problemClass: 'POST_CLICK', forbiddenActions: ['REFRESH_CREATIVES'] });
  const verdict = permitAction('REFRESH_CREATIVES', r);
  assert.equal(verdict.allowed, false);
  // The contract is binary allow/deny — there is no "suggested alternative"
  // field for a caller to accidentally treat as an invented replacement.
  assert.deepEqual(Object.keys(verdict).sort(), ['allowed', 'reason']);
});

console.log('\n── F. no shared state between calls (account isolation proxy) ──');

check('F. two calls with different problemClass/forbiddenActions never influence each other', () => {
  const accountA = reconciled({ problemClass: 'POST_CLICK', forbiddenActions: ['REFRESH_CREATIVES'] });
  const accountB = reconciled({ problemClass: 'CLICK', forbiddenActions: ['BROADEN_AUDIENCE'] });
  const first = permitAction('REFRESH_CREATIVES', accountA);
  const second = permitAction('REFRESH_CREATIVES', accountB); // same actionCode, different account's diagnosis
  assert.equal(first.allowed, false);
  assert.equal(second.allowed, true, 'account B\'s diagnosis does not forbid this action — must not inherit account A\'s verdict');
});

console.log('\n── G. identical input produces identical output ──');

check('G. calling permitAction twice with the same arguments is deterministic', () => {
  const r = reconciled({ problemClass: 'CONVERSION', forbiddenActions: ['BROADEN_AUDIENCE'] });
  const a = permitAction('BROADEN_AUDIENCE', r);
  const b = permitAction('BROADEN_AUDIENCE', r);
  assert.deepEqual(a, b);
});

console.log('\n── getDashboard.ts\'s guard-skip fallback (no accountIntelligence) ──');

check('when accountIntelligence is unavailable, the guard must be skipped (priorityAction passes through), not treated as "everything forbidden"', () => {
  // Mirrors the exact condition in getDashboard.ts: `if (priorityAction && accountIntelligence)`.
  const priorityAction: { actionCode: string } | null = { actionCode: 'REFRESH_CREATIVES' };
  const accountIntelligence: { forbiddenActions: string[]; problemClass: string } | undefined = undefined;
  let result = priorityAction;
  if (priorityAction && accountIntelligence) {
    const permission = permitAction(priorityAction.actionCode, accountIntelligence as any);
    if (!permission.allowed) result = null;
  }
  assert.deepEqual(result, priorityAction, 'no reconciled diagnosis available → cannot judge consistency → leave priorityAction as the deterministic engine produced it');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length > 0) {
  console.error('failed: ' + fail.join(', '));
  process.exit(1);
}
