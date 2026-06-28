// test_cmo_dedupe.ts — CMO insight dedupe helpers (no DB).
// Run: npx tsx test_cmo_dedupe.ts

import {
  LEARNING_PHASE_TITLE,
  isColdStartPayload,
  isLearningPhaseAction,
  isLearningPhaseNarration,
  isLearningPhaseSnapshot,
  isSameLearningPhaseTransition,
  learningInsightDedupeKey,
  readNarrationTitle,
  shouldBlockLearningGeneration,
  toUtcMidnight,
} from './src/lib/cmoInsightDedupe';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

const learningNarration = {
  arabicTitle: LEARNING_PHASE_TITLE,
  arabicNarration: 'جاري جمع البيانات',
};

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
  'legacy passive cold-start title still matches (backward compat)',
  isLearningPhaseNarration({
    arabicTitle: 'حملة جديدة: جاري جمع البيانات الأولية',
    arabicNarration: 'x',
  }),
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
check(
  'dedupe key is campaign-scoped (no date)',
  learningInsightDedupeKey('camp_1', 'KEEP_COLLECTING') === 'camp_1:KEEP_COLLECTING:learning',
);
check(
  'toUtcMidnight normalizes',
  toUtcMidnight(new Date('2026-06-27T15:30:00Z')).toISOString() === '2026-06-27T00:00:00.000Z',
);

console.log('\n── Learning phase transition ──');
check(
  'KEEP_COLLECTING → coldStart payload stays learning',
  isSameLearningPhaseTransition(
    { action: 'KEEP_COLLECTING', payload: {} },
    { action: 'HOLD_AND_MONITOR', payload: { coldStart: true } },
  ),
);
check(
  'KEEP_COLLECTING → SCALE_BUDGET exits learning',
  !isSameLearningPhaseTransition(
    { action: 'KEEP_COLLECTING', payload: {} },
    { action: 'SCALE_BUDGET', payload: {} },
  ),
);

console.log('\n── Generation guard ──');
check(
  'blocks when learning row + existing narration',
  shouldBlockLearningGeneration(
    { action: 'KEEP_COLLECTING', payload: {} },
    { narrationJson: learningNarration, narrationGeneratedAt: new Date('2026-06-20T11:36:00Z') },
  ),
);
check(
  'allows when no existing narration',
  !shouldBlockLearningGeneration(
    { action: 'KEEP_COLLECTING', payload: {} },
    null,
  ),
);
check(
  'allows non-learning row even with existing narration',
  !shouldBlockLearningGeneration(
    { action: 'SCALE_BUDGET', payload: {} },
    { narrationJson: learningNarration, narrationGeneratedAt: new Date() },
  ),
);
check(
  'blocks cross-day learning (5-min cron scenario)',
  shouldBlockLearningGeneration(
    { action: 'KEEP_COLLECTING', payload: { confidence: { gatingStatus: 'COLLECTING_DATA' } } },
    { narrationJson: learningNarration, narrationGeneratedAt: new Date('2026-06-26T11:41:00Z') },
  ),
);

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
if (fail > 0) process.exit(1);
