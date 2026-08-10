// ════════════════════════════════════════════════════════════════════════
//  test_ui_state_integrity.mjs
//
//  Two rules, both about the UI telling the truth about itself.
//
//  D-5 — MUTUALLY EXCLUSIVE REGIONS NEED AN OWNER.
//  The dashboard's skeleton, backfill overlay, hard-error block and content
//  are four answers to one question ("what is happening right now"). They
//  used to be toggled by nine scattered .style.display writes, each turning
//  one region on and guessing which others to turn off — so production
//  showed a loading overlay, a token-decryption error, a stale banner and a
//  generic retry block simultaneously. setDashPhase() is now the single
//  owner; this test fails if anything writes .style.display to one of those
//  four ids behind its back.
//
//  D-13 — A MONITOR MAY NOT REPORT "ALL CLEAR" WITHOUT HAVING CHECKED.
//  runDataObserver used to print «البيانات متسقة — لا توجد مشاكل» whenever
//  it had assembled zero findings, which is also what an empty payload, a
//  404 and a rejected request produce. Absence of findings was rendered as
//  proof of health on the one surface whose job is to say whether the
//  numbers can be trusted. It must now prove the check ran, and it must have
//  a third outcome for "could not check".
//
//  Prereq: none — reads source directly.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

let bad = 0;
const fail = (m) => { console.error('  ✗ ' + m); bad++; };

// ── D-5 ───────────────────────────────────────────────────────────────
const dash = readFileSync('src/web/pages/dashboardPage.ts', 'utf8');
const EXCLUSIVE = ['loading-state', 'onboarding-overlay', 'error-state', 'dashboard-content'];

console.log('\n── D-5: dashboard phase ownership ──');

if (!/function setDashPhase\(/.test(dash)) {
  fail('setDashPhase() is gone — the four exclusive regions have no owner again');
} else {
  // Every region must appear in every phase row, or a phase silently leaves
  // one of them in whatever state the previous phase left it.
  const table = dash.match(/var DASH_PHASES = \{[\s\S]*?\n  \};/);
  if (!table) fail('DASH_PHASES table not found');
  else {
    const rows = table[0].match(/^\s{4}\w+:\s*\{[^}]*\},$/gm) || [];
    if (rows.length < 4) fail(`DASH_PHASES has ${rows.length} phases — expected at least loading/onboarding/error/ready`);
    for (const row of rows) {
      const name = row.trim().split(':')[0];
      for (const id of EXCLUSIVE) {
        if (!row.includes(`'${id}'`)) {
          fail(`phase "${name}" does not specify '${id}' — that region keeps whatever the previous phase left it as`);
        }
      }
    }
    if (rows.length && !bad) console.log(`  ✓ ${rows.length} phases, each specifying all ${EXCLUSIVE.length} exclusive regions`);
  }
}

// No direct display writes to an owned region outside the owner.
for (const id of EXCLUSIVE) {
  const re = new RegExp(`getElementById\\('${id}'\\)[\\s\\S]{0,120}?\\.style\\.display\\s*=`, 'g');
  const hits = [...dash.matchAll(re)];
  for (const h of hits) {
    const line = dash.slice(0, h.index).split('\n').length;
    fail(`dashboardPage.ts:${line} writes .style.display on '${id}' directly — call setDashPhase() instead`);
  }
}
// The same check, for the pattern where the element is held in a variable.
for (const m of dash.matchAll(/var (\w+) = document\.getElementById\('(loading-state|onboarding-overlay|error-state|dashboard-content)'\);/g)) {
  const [, varName, id] = m;
  const after = dash.slice(m.index, m.index + 600);
  if (new RegExp(`${varName}\\.style\\.display\\s*=`).test(after)) {
    const line = dash.slice(0, m.index).split('\n').length;
    fail(`dashboardPage.ts:${line} assigns '${id}' to \`${varName}\` and sets its display — call setDashPhase() instead`);
  }
}
if (!bad) console.log('  ✓ no region is toggled behind the phase owner');

// ── D-13 ──────────────────────────────────────────────────────────────
console.log('\n── D-13: the observer may not claim health it did not verify ──');
const camp = readFileSync('src/web/pages/campaignsPage.ts', 'utf8');
const observer = camp.match(/function runDataObserver\([\s\S]*?\n  \}\n/);

if (!observer) {
  fail('runDataObserver not found');
} else {
  const body = observer[0];

  if (!/typeof health\.checkedAt !== 'string'/.test(body)) {
    fail('runDataObserver does not verify that the check actually RAN (checkedAt) before reporting on it');
  }
  if (/\.catch\(function\(\)\s*\{\s*\/\*[^*]*\*\/\s*\}\)/.test(body)) {
    fail('runDataObserver still swallows its failure silently — silence is indistinguishable from a clean bill of health');
  }
  if (!/renderObserver\('unknown'/.test(body)) {
    fail("runDataObserver has no 'unknown' outcome — it can only say fine or broken, and 'could not check' is neither");
  }
  // The green outcome must be reachable ONLY after the checkedAt guard.
  const okAt = body.indexOf("renderObserver('ok'");
  const guardAt = body.indexOf("typeof health.checkedAt !== 'string'");
  if (okAt >= 0 && guardAt >= 0 && okAt < guardAt) {
    fail('the clean-bill-of-health branch precedes the did-this-check-run guard');
  }
  if (!bad) console.log("  ✓ proves the check ran, reports 'unknown' when it did not, and never stays silent");
}

// 'unknown' must not be styled like 'ok'.
if (!/\.data-observer-banner\.unknown\s*\{/.test(camp)) {
  fail("the 'unknown' outcome has no styling of its own — it will render like whichever class it inherits");
}

console.log(`\n════ ${bad === 0 ? 'UI state integrity OK' : bad + ' FAILURES'} ════\n`);
process.exit(bad ? 1 : 0);
