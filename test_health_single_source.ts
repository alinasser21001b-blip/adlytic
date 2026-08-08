// ════════════════════════════════════════════════════════════════════════
//  test_health_single_source.ts — ONE health number, from the better engine.
//
//  The DTO used to ship two account health scores computed by different
//  engines, and they disagreed: `health` said 51 "attention" while
//  `intelligence.health` said 38 "critical" for the SAME account in the SAME
//  response. Both were rendered to the merchant.
//
//  They were never equally good. objectiveHealth.ts documents why the legacy
//  HealthScoreEngine is wrong: it scores one fixed facet set (trend, CTR,
//  frequency, CPM) for every campaign, so a messaging campaign is penalised
//  for a ROAS it can never earn, and a sales campaign scores well on healthy
//  CTR while its purchases collapse — its actual result never enters.
// ════════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMPTY_DASHBOARD_DTO } from './src/services/getDashboard';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e: any) { fail.push(name); console.error('  ✗ ' + name + ' — ' + e.message); }
}

const SRC = readFileSync(join(import.meta.dirname, 'src/services/getDashboard.ts'), 'utf8');

console.log('\n── the headline score defers to the objective-aware engine ──');

check('health is not built from the legacy score unconditionally', () => {
  // The shipped form was `health: { score, band: band(score) }`, where `score`
  // came straight off the stored health row. That line is the bug.
  assert.doesNotMatch(SRC, /health:\s*\{\s*score,\s*band:\s*band\(score\)\s*\}/,
    'the headline health must not be the legacy score with no objective check');
});

check('the objective-aware score is preferred when it exists', () => {
  assert.match(SRC, /accountIntelligence\?\.health\?\.score/,
    'the objective-aware score must be consulted');
  assert.match(SRC, /source:\s*'objective'/,
    'and the DTO must disclose which engine spoke');
});

check('the legacy score survives only as a declared fallback', () => {
  assert.match(SRC, /source:\s*'legacy'/,
    'legacy output must be labelled as such, not passed off as the same thing');
});

console.log('\n── absent is not zero ──');

check('an unconnected workspace has NO health, not health 0', () => {
  // Zero, NOT_APPLICABLE and INSUFFICIENT_DATA are three different states.
  // A workspace with no ad account has not scored badly — it has not scored.
  assert.equal(EMPTY_DASHBOARD_DTO.health.score, null,
    'score 0 claims a connected account performing terribly');
  assert.equal(EMPTY_DASHBOARD_DTO.health.source, 'none',
    'no engine ran, and that is distinct from an engine that ran and scored low');
});

check('the empty DTO exists once, not once per caller', () => {
  const server = readFileSync(join(import.meta.dirname, 'src/api/server.ts'), 'utf8');
  assert.doesNotMatch(server, /empty:\s*true,\s*health:\s*\{\s*score:\s*0/,
    'a second hand-written empty DTO drifts — this one still carried score: 0');
});

console.log('\n── the headline number carries its own reliability ──');

check('health exposes a confidence field', () => {
  assert.match(SRC, /confidence:\s*accountIntelligence!\.health\.confidence/,
    'the objective engine has a confidence model and it must reach the DTO');
  assert.equal(EMPTY_DASHBOARD_DTO.health.confidence, null,
    'the legacy engine has no confidence model, so null is the honest value');
});

console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
if (fail.length) { console.error('failed: ' + fail.join(', ')); process.exit(1); }
