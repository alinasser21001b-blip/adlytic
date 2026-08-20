/**
 * Phase 7 — V5 / Shadow / Legacy Resolution.
 *
 * V5's authority question (can it influence a merchant-facing diagnosis/
 * recommendation?) was investigated and fixed in Phase 5
 * (formatCanonicalGroundingForV5Context, test_diagnosis_decision_ownership.ts)
 * — not re-tested here. This phase's own scope: two smaller, previously-
 * unaddressed findings from the same investigation.
 *   1. reasoningChainJson (AI_AGENT provenance on the Recommendation table)
 *      was leaking verbatim over GET /api/workspaces/:workspaceId/recommendations
 *      even though nothing in src/web ever reads it — now omitted at that
 *      one route.
 *   2. ai_anomaly_states (AiAnomalyState model) is genuinely dead — a real
 *      migration created the table, but zero application code references
 *      it. Classified DEAD_SCHEMA_CANDIDATE, not dropped (no migration this
 *      phase — schema removal is deferred to a dedicated cleanup pass per
 *      this program's standing "no migration unless unavoidable" discipline).
 *      This is a regression guard: if code later starts referencing it, the
 *      classification needs revisiting, and this test will correctly fail.
 *   3. ai_signals (AiSignal model) — found in the final independent audit,
 *      same disposition as ai_anomaly_states: a real migration from the same
 *      "ai_agent_v2_foundation" batch, zero application-code references,
 *      classified DEAD_SCHEMA_CANDIDATE, not dropped.
 *
 * Run: npx tsx test_v5_legacy_disposition.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

console.log('\n── 1. reasoningChainJson no longer leaks over the flat recommendations route ──');

check('the /recommendations route omits reasoningChainJson from its findMany', () => {
  const src = readFileSync(join(__dirname, 'src/api/server.ts'), 'utf8');
  const routeStart = src.indexOf("app.get('/api/workspaces/:workspaceId/recommendations'");
  assert.ok(routeStart >= 0, 'the route must be found');
  const routeEnd = src.indexOf('\n  });', routeStart);
  const routeBody = src.slice(routeStart, routeEnd);
  assert.ok(routeBody.includes('prisma.recommendation.findMany'), 'sanity check: the right findMany call');
  assert.ok(
    routeBody.includes('omit: { reasoningChainJson: true }'),
    'reasoningChainJson must be omitted from the rows this route returns',
  );
  assert.ok(routeBody.includes('return c.json(safeJson(recs))'), 'sanity check: recs is what actually goes over the wire');
});

check('reasoningChainJson is still write-only — no page or DTO in src/web reads it (classification still holds)', () => {
  const srcFiles = walk(join(__dirname, 'src'));
  const readers = srcFiles.filter((p) => {
    if (p.includes('/web/')) {
      const content = readFileSync(p, 'utf8');
      return content.includes('reasoningChainJson');
    }
    return false;
  });
  assert.equal(
    readers.length, 0,
    `reasoningChainJson is now read by src/web code (${readers.join(', ')}) — the write-only ` +
    `classification behind omitting it at the API layer no longer holds; re-verify before trusting the omit alone`,
  );
});

console.log('\n── 2. ai_anomaly_states remains genuinely dead (schema-only) ──');

check('AiAnomalyState / ai_anomaly_states has zero references anywhere in src/', () => {
  const srcFiles = walk(join(__dirname, 'src'));
  const referencingFiles = srcFiles.filter((p) => {
    const content = readFileSync(p, 'utf8');
    return content.includes('AiAnomalyState') || content.includes('ai_anomaly_states');
  });
  assert.equal(
    referencingFiles.length, 0,
    `AiAnomalyState is now referenced in application code (${referencingFiles.join(', ')}) — it is no ` +
    `longer a DEAD_SCHEMA_CANDIDATE and the classification must be revisited before any cleanup migration`,
  );
});

check('the model + migration still exist in the schema (nothing dropped this phase — no migration executed)', () => {
  const schema = readFileSync(join(__dirname, 'prisma/schema.prisma'), 'utf8');
  assert.ok(schema.includes('model AiAnomalyState'), 'the model must still be present — this phase classifies, it does not drop');
});

console.log('\n── 3. ai_signals is a second dead schema candidate from the same migration batch ──');

check('AiSignal / ai_signals has zero references anywhere in src/ (found in the final audit)', () => {
  const srcFiles = walk(join(__dirname, 'src'));
  const referencingFiles = srcFiles.filter((p) => {
    const content = readFileSync(p, 'utf8');
    return content.includes('AiSignal') || content.includes('ai_signals');
  });
  assert.equal(
    referencingFiles.length, 0,
    `AiSignal is now referenced in application code (${referencingFiles.join(', ')}) — it is no ` +
    `longer a DEAD_SCHEMA_CANDIDATE and the classification must be revisited before any cleanup migration`,
  );
});

check('the AiSignal model still exists in the schema (nothing dropped — no migration executed)', () => {
  const schema = readFileSync(join(__dirname, 'prisma/schema.prisma'), 'utf8');
  assert.ok(schema.includes('model AiSignal'), 'the model must still be present — classification, not a drop');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
