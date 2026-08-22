/**
 * PeriodInsight rollout safety.
 *
 * Introducing period facts is a DATA migration, not just a code change: a new
 * table, a new writer in the sync, and a new read in the analytics path. Those
 * three do not deploy atomically, so every intermediate combination has to be
 * survivable — and the validation service in particular runs SERVICE_ROLE=api
 * with no migration and no background sync, so it can only ever be a reader.
 *
 * Each assertion below corresponds to one cell of the rollout matrix in
 * docs/close-code/07_SECURITY_DEPLOYMENT_CLOSURE.md.
 *
 * Run: npx tsx test_period_insight_rollout.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType } from '@prisma/client';

import { readPeriodFact, writePeriodFact, normalizePeriodRow, META_PERIOD_FACT } from './src/services/periodInsights';
import { resolveAnalysisWindows } from './src/lib/analysisWindow';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const W = resolveAnalysisWindows();
const MIGRATION_DIR = 'prisma/migrations/20260822120000_add_period_insights';

/** Postgres' error when the relation does not exist. */
const missingTable = () => { throw Object.assign(new Error('relation "period_insights" does not exist'), { code: 'P2021' }); };

async function main() {
  console.log('\n── 1. The migration is additive and backwards-safe ──');

  check('the migration only CREATEs — nothing dropped, altered or renamed', () => {
    const sql = readFileSync(join(__dirname, MIGRATION_DIR, 'migration.sql'), 'utf8');
    assert.ok(/CREATE TABLE "period_insights"/.test(sql), 'it must create the table');
    for (const destructive of ['DROP ', 'RENAME ', 'ALTER TABLE', 'DELETE FROM', 'TRUNCATE']) {
      assert.ok(!sql.toUpperCase().includes(destructive.toUpperCase()),
        `an additive migration must not contain ${destructive.trim()} — old code must survive it untouched`);
    }
  });

  check('no pre-existing module reads or writes the new table', () => {
    // OLD_CODE_WITH_NEW_SCHEMA_SAFE rests on this: a table nothing references
    // is invisible to every deployed version that predates these modules.
    const roots = ['src'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(__dirname, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.ts') && /periodInsight|period_insights/.test(readFileSync(join(__dirname, rel), 'utf8'))) {
          hits.push(rel);
        }
      }
    };
    roots.forEach(walk);
    assert.deepEqual(hits.sort(), [
      'src/services/entityIntelligence.ts',
      'src/services/periodInsights.ts',
      'src/workers/syncPeriodInsights.ts',
    ], `only the three new modules may touch period facts; found: ${hits.join(', ')}`);
  });

  console.log('\n── 2. NEW_API_WITHOUT_TABLE — the reader survives a missing table ──');

  await checkAsync('a missing relation degrades to UNKNOWN, never an exception', async () => {
    // The validation service runs no migration, so it CAN be deployed ahead of
    // the schema. That must be boring, not an outage.
    const prisma = { periodInsight: { findUnique: missingTable } } as any;
    const got = await readPeriodFact(prisma, EntityType.CAMPAIGN, 'c1', W.currentSince, W.currentUntil);
    assert.equal(got, null, 'a missing table is simply "no period fact"');
  });

  console.log('\n── 3. NEW_API_WITH_EMPTY_TABLE — migrated but not yet populated ──');

  await checkAsync('an empty table is UNKNOWN, not zero', async () => {
    // The window between migration and the first writer pass. Reach must not
    // become 0 here — 0 would read as a catastrophic delivery collapse.
    const prisma = { periodInsight: { async findUnique() { return null; } } } as any;
    const got = await readPeriodFact(prisma, EntityType.CAMPAIGN, 'c1', W.currentSince, W.currentUntil);
    assert.equal(got, null);
  });

  await checkAsync('a row present but empty of trustworthy values is UNKNOWN per field', async () => {
    const prisma = {
      periodInsight: {
        async findUnique() {
          return { reach: null, frequency: null, impressions: null, provenance: META_PERIOD_FACT, fetchedAt: new Date() };
        },
      },
    } as any;
    const got = await readPeriodFact(prisma, EntityType.CAMPAIGN, 'c1', W.currentSince, W.currentUntil);
    assert.ok(got, 'the row exists');
    assert.equal(got!.reach, null);
    assert.equal(got!.frequency, null);
  });

  console.log('\n── 4. NEW_WORKER_WITHOUT_TABLE — the writer must not wedge the sync ──');

  await checkAsync('a write against a missing table throws where the sync can catch it', async () => {
    const prisma = { periodInsight: { upsert: missingTable } } as any;
    await assert.rejects(
      () => writePeriodFact(prisma, EntityType.CAMPAIGN, 'c1', W.currentSince, W.currentUntil,
        { reach: 1, frequency: 1, impressions: 1, provenance: META_PERIOD_FACT }),
      /period_insights/,
      'the write surfaces the real cause rather than swallowing it',
    );
  });

  check('the sync isolates every period-fact failure per target', () => {
    // So one unwritable entity, or a wholly missing table, cannot abort the
    // account sync or any later phase.
    const src = readFileSync(join(__dirname, 'src/workers/syncPeriodInsights.ts'), 'utf8');
    assert.ok(/try \{[\s\S]*?\} catch/.test(src), 'each fetch/store is guarded');
    assert.ok(/failed\+\+/.test(src), 'failures are counted, not thrown');
    const sched = readFileSync(join(__dirname, 'src/workers/backgroundScheduler.ts'), 'utf8');
    // lastIndexOf, not indexOf: the first occurrence is the import statement.
    const idx = sched.lastIndexOf('await syncPeriodInsightsForAccount');
    assert.ok(idx > 0, 'the scheduler must call the period sync');
    assert.ok(/catch \(perErr\)/.test(sched.slice(idx, idx + 500)),
      'and wrap the whole phase, so a period-fact outage is non-fatal');
  });

  console.log('\n── 5. NEW_WORKER_WITH_NEW_SCHEMA — writes converge ──');

  await checkAsync('the writer is idempotent on the exact span key', async () => {
    const calls: any[] = [];
    const prisma = { periodInsight: { async upsert(a: any) { calls.push(a); return {}; } } } as any;
    const fact = { reach: 120_000, frequency: 4.6, impressions: 350_000, provenance: META_PERIOD_FACT };
    await writePeriodFact(prisma, EntityType.CAMPAIGN, 'c1', W.currentSince, W.currentUntil, fact);
    await writePeriodFact(prisma, EntityType.CAMPAIGN, 'c1', W.currentSince, W.currentUntil, fact);
    assert.equal(calls.length, 2, 'both passes wrote');
    for (const c of calls) {
      assert.deepEqual(c.where.entityType_entityId_since_until, {
        entityType: EntityType.CAMPAIGN, entityId: 'c1', since: W.currentSince, until: W.currentUntil,
      }, 'upsert is keyed on the exact tuple, so a re-sync converges instead of duplicating');
      assert.equal(c.create.reach, 120000n, 'reach is stored as an integer count');
      assert.equal(c.update.provenance, META_PERIOD_FACT);
    }
  });

  console.log('\n── 6. Backfill is bounded by construction ──');

  check('the writer requests only the two windows the intelligence layer reads', () => {
    // "Backfill" here is one ordinary sync pass — there is deliberately no
    // historical sweep, so this cannot generate unbounded Meta traffic.
    const src = readFileSync(join(__dirname, 'src/workers/syncPeriodInsights.ts'), 'utf8');
    assert.ok(/resolveAnalysisWindows\(\)/.test(src), 'it must use the canonical window helper');
    assert.ok(/\[currentSince, currentUntil\][\s\S]*?\[priorSince, priorUntil\]/.test(src),
      'exactly the current and prior windows');
    assert.ok(!/date_preset|maximum|for \(let d/.test(src),
      'no historical sweep and no date_preset — the request set is bounded by entity count');
    const meta = readFileSync(join(__dirname, 'src/services/metaClient.ts'), 'utf8');
    const idx = meta.indexOf('async getPeriodInsights');
    assert.ok(/time_range/.test(meta.slice(idx, idx + 700)), 'the exact span is sent, not a preset');
    assert.ok(!/time_increment/.test(meta.slice(idx, idx + 700)),
      'no time_increment — Meta must aggregate the span itself, which is the entire point');
  });

  check('the request set is entity-bounded: (accounts + campaigns) x 2 windows', () => {
    const src = readFileSync(join(__dirname, 'src/workers/syncPeriodInsights.ts'), 'utf8');
    assert.ok(/for \(const t of targets\)/.test(src) && /for \(const \[since, until\] of windows\)/.test(src),
      'a nested loop over targets x windows and nothing else');
    assert.ok(/requested\+\+/.test(src), 'the count is reported so growth stays observable');
  });

  console.log('\n── 7. The validation service can only ever be a reader ──');

  check('the validation config runs no migration and no background sync', () => {
    const cfg = JSON.parse(readFileSync(join(__dirname, 'railway.validation.json'), 'utf8'));
    assert.equal(cfg.deploy.startCommand, 'node dist/src/api/serve.js',
      'no `prisma migrate deploy` — the validation service must never migrate the shared DB');
    assert.equal(cfg.deploy.preDeployCommand, undefined);
    // Therefore it cannot populate period facts, and a validation deploy alone
    // can never prove period-metric behaviour. Documented, and asserted here so
    // the claim cannot quietly stop being true.
    const sched = readFileSync(join(__dirname, 'src/workers/backgroundScheduler.ts'), 'utf8');
    assert.ok(/syncPeriodInsightsForAccount/.test(sched),
      'the ONLY writer path runs inside background work, which SERVICE_ROLE=api does not start');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) process.exit(1);
}

main();
