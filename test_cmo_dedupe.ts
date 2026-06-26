// test_cmo_dedupe.ts — CMO insight dedupe helpers (no DB).
// Run: npx tsx test_cmo_dedupe.ts

import {
  LEARNING_PHASE_TITLE,
  isColdStartPayload,
  isLearningPhaseAction,
  isLearningPhaseNarration,
  isLearningPhaseSnapshot,
  learningInsightDedupeKey,
  readNarrationTitle,
  toUtcMidnight,
} from './src/lib/cmoInsightDedupe';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

console.log('\n── Learning phase detection ──');
check('KEEP_COLLECTING is learning action', isLearningPhaseAction('KEEP_COLLECTING'));
check('SCALE_BUDGET is not learning action', !isLearningPhaseAction('SCALE_BUDGET'));
check(
  'coldStart payload detected',
  isColdStartPayload({ coldStart: true, confidence: { gatingStatus: 'OK' } }),
);
check(
  'COLLECTING_DATA gating detected',
  isColdStartPayload({ confidence: { gatingStatus: 'COLLECTING_DATA' } }),
);
check(
  'learning snapshot via action',
  isLearningPhaseSnapshot({ action: 'KEEP_COLLECTING', payload: {} }),
);
check(
  'learning snapshot via cold payload',
  isLearningPhaseSnapshot({ action: 'HOLD_AND_MONITOR', payload: { coldStart: true } }),
);

console.log('\n── Narration title matching ──');
check(
  'exact learning title matches',
  isLearningPhaseNarration({ arabicTitle: LEARNING_PHASE_TITLE, arabicNarration: 'x' }),
);
check(
  'generic title does not match',
  !isLearningPhaseNarration({ arabicTitle: 'إشعار استراتيجي آلي', arabicNarration: 'x' }),
);
check(
  'readNarrationTitle trims',
  readNarrationTitle({ arabicTitle: '  hello  ', arabicNarration: 'x' }) === 'hello',
);

console.log('\n── Dedupe key ──');
const day = new Date('2026-06-27T15:30:00Z');
check(
  'dedupe key uses UTC date + action',
  learningInsightDedupeKey('camp_1', 'KEEP_COLLECTING', day) === 'camp_1:KEEP_COLLECTING:2026-06-27',
);
check(
  'toUtcMidnight normalizes',
  toUtcMidnight(day).toISOString() === '2026-06-27T00:00:00.000Z',
);

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
if (fail > 0) process.exit(1);
