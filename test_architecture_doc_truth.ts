/**
 * Phase 9 — Documentation + Architecture Truth.
 *
 * Governance correction #6: the architecture doc must describe ACTUAL
 * post-remediation runtime ownership, not intended architecture, and must
 * include an explicit authority table with columns LAYER/OWNER/INPUT/OUTPUT/
 * PERSISTENCE/CONSUMERS/LEGACY-ALTERNATE PATHS. This suite checks the new
 * doc's structure and cross-references, plus that every doc named stale by
 * the plan actually carries a banner pointing to it (not deleted — banners
 * only), and that root README.md no longer makes the two claims re-verified
 * as actively wrong (a dead dashboard_wired.html reference, a stale test
 * suite count) before this phase's rewrite.
 *
 * Run: npx tsx test_architecture_doc_truth.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const docPath = join(__dirname, 'docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md');

console.log('\n── 1. The new architecture doc exists with the required structure ──');

check('docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md exists', () => {
  assert.ok(existsSync(docPath), 'the doc must exist at the Adlytic-scoped subdirectory (not the Dawai-owned docs/architecture/ root)');
});

const docSrc = existsSync(docPath) ? readFileSync(docPath, 'utf8') : '';

check('the doc carries an explicit authority table with all 7 required columns', () => {
  const tableHeaderMatch = docSrc.match(/\| Layer \| Owner \| Input \| Output \| Persistence \| Consumers \| Legacy \/ alternate paths \|/i);
  assert.ok(tableHeaderMatch, 'must have a table header with Layer/Owner/Input/Output/Persistence/Consumers/Legacy-alternate-paths columns');
});

check('the authority table covers every layer this mission established ownership for', () => {
  const requiredOwnershipTopics = [
    'Meta ingestion cordon', 'Sync write path', 'Semantic classification', 'Result semantics',
    'Anomaly — pattern/metric level', 'Anomaly — funnel-stage level',
    'Diagnosis — pattern level', 'Diagnosis — funnel/objective level',
    'Evidence contract', 'Decision / recommendation', 'Recommendation persistence',
    'Sync concurrency (lock)', 'Data purge', 'V5 (legacy, still live)', 'DTO', 'UI',
  ];
  for (const topic of requiredOwnershipTopics) {
    assert.ok(docSrc.includes(topic), `authority table must cover: ${topic}`);
  }
});

check('the doc documents V5 status from observed behavior, not terminology (governance correction #3)', () => {
  assert.ok(docSrc.includes('preferred') && docSrc.includes('/ai/chat'),
    'must state V5 is a preferred live context source for /ai/chat, not just call it a UI-slot non-issue');
  assert.ok(docSrc.includes('formatCanonicalGroundingForV5Context'),
    'must name the actual authority-boundary mechanism, not just assert the boundary exists');
});

check('the doc documents sync concurrency as behaviorally proven, not inspected (governance correction #4)', () => {
  assert.ok(/behaviorall?y/i.test(docSrc), 'must reference behavioral proof');
  assert.ok(docSrc.includes('test_meta_cordon_sync_purge.ts'), 'must cite the actual behavioral test');
});

check('the doc documents legitimate derived math as deliberately unchanged, not silently omitted (governance correction #5)', () => {
  assert.ok(docSrc.includes('buildResultsAndCostSeries'), 'must name the specific formula cost-per-result mirrors');
  assert.ok(/found NOT to be violations|not a violation|legitimate.{0,20}(display|derived)/i.test(docSrc),
    'must explicitly frame these as investigated-and-found-legitimate, not silently dropped');
});

check('the doc cross-references docs/ANALYTICS_RULES.md as a companion (not duplicated or contradicted)', () => {
  assert.ok(docSrc.includes('ANALYTICS_RULES.md'), 'must reference the locked, enforced rules doc');
});

console.log('\n── 2. Every doc the plan named stale carries a banner pointing to the new doc ──');

const supersededDocs = [
  'AUDIT_REPORT.md',
  'AUDIT-REPORT.md',
  'AUDIT_INDEX.md',
  'docs/RESULT_SEMANTICS_DESIGN.md',
  'ADLYTIC_MASTER_ARCHITECT_AUDIT_2026.md',
  'ADLYTIC_MASTER_ARCHITECT_AUDIT_2026_V2.md',
  'CMO_FEED_ARCHITECTURE.md',
];
for (const rel of supersededDocs) {
  check(`${rel} carries a SUPERSEDED banner pointing to the new doc, and is NOT deleted`, () => {
    const p = join(__dirname, rel);
    assert.ok(existsSync(p), `${rel} must still exist — banner, never delete`);
    const src = readFileSync(p, 'utf8');
    assert.ok(/SUPERSEDED/.test(src), `${rel} must carry a SUPERSEDED banner`);
    assert.ok(src.includes('ADLYTIC_INTELLIGENCE_ARCHITECTURE.md'), `${rel}'s banner must point to the new doc`);
  });
}

check('docs/ANALYTICS_ARCHITECTURE_FINAL.md points readers to the new doc for full-system scope (not banned as stale — its own content is still accurate)', () => {
  const src = readFileSync(join(__dirname, 'docs/ANALYTICS_ARCHITECTURE_FINAL.md'), 'utf8');
  assert.ok(src.includes('ADLYTIC_INTELLIGENCE_ARCHITECTURE.md'), 'must point to the new doc');
  assert.ok(!/SUPERSEDED/.test(src), 'must NOT be marked superseded — its analytics-pipeline content is still accurate, just narrower in scope');
});

console.log('\n── 3. Root README.md corrected in place (primary entry point, not just banner-marked) ──');

check('README.md no longer references the dead dashboard_wired.html as the live output', () => {
  const src = readFileSync(join(__dirname, 'README.md'), 'utf8');
  assert.ok(!src.includes('dashboard_wired.html'), 'must not describe the dead static file as the live architecture');
});

check('README.md no longer claims the stale "241 assertions across 8 suites" test count', () => {
  const src = readFileSync(join(__dirname, 'README.md'), 'utf8');
  assert.ok(!src.includes('241 assertions across 8 suites'), 'the suite count has grown far beyond this stale figure');
});

check('README.md points to the new architecture doc', () => {
  const src = readFileSync(join(__dirname, 'README.md'), 'utf8');
  assert.ok(src.includes('ADLYTIC_INTELLIGENCE_ARCHITECTURE.md'), 'must reference the current architecture doc');
});

check('README.md describes the actual current stack (Hono, no React/SPA)', () => {
  const src = readFileSync(join(__dirname, 'README.md'), 'utf8');
  assert.ok(src.includes('Hono'), 'must name the actual API framework');
  assert.ok(/no React|server-rendered/i.test(src), 'must correctly describe the server-rendered (not SPA) frontend');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
