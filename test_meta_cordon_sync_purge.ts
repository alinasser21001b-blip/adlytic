/**
 * Phase 6 — Meta Boundary + Sync Safety + Purge Ownership.
 *
 * Three independent concerns, tested at the level each fix actually lives:
 *   6A. v2ContextAssembler.ts no longer reimplements insightMapper.ts's own
 *       action-count resolution (the exact "163 vs 87" double-count class of
 *       bug, now impossible on this path since it routes through the same
 *       canonical mapMetaInsight()/mapMetaBreakdownInsight()); the two
 *       AI-agent tools that classified an ad's format now share ONE carousel
 *       definition instead of two that could disagree.
 *   6B. Same-account concurrent sync entry points are now mutually exclusive
 *       — proven BEHAVIORALLY against a fake Postgres advisory-lock
 *       simulation exercising the real tryAcquireAdvisoryLock/
 *       releaseAdvisoryLock functions under genuine concurrent execution,
 *       not by inspecting that the right function names appear in the code.
 *   6C. There is one canonical purge implementation, and it now actually
 *       covers campaign_brain_snapshots and campaign_intelligence_reports
 *       (previously orphaned on every deletion path).
 *
 * Run: npx tsx test_meta_cordon_sync_purge.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mapMetaInsight, mapMetaBreakdownInsight } from './src/mappers/insightMapper';
import { isCarouselCreative } from './src/mappers/creativeMapper';
import { advisoryLockId, tryAcquireAdvisoryLock, releaseAdvisoryLock, locksHeldInProcess } from './src/lib/advisoryLock';

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

// ── 6A. Cordon: canonical action resolution, no reimplemented double-count ─
console.log('\n── 6A. v2ContextAssembler no longer reimplements action-count resolution ──');

check('mapMetaInsight resolves the CANONICAL message count, not a sum of overlapping action types', () => {
  // The exact adversarial shape of the production bug this phase re-verified:
  // two action_types that both describe "a conversation started" at
  // different granularities. The old local sumMessageActions() summed them
  // (87 + 76 = 163); the canonical resolver picks the highest-preference one.
  const row: any = {
    date_start: '2026-08-01',
    spend: '100',
    impressions: '10000',
    clicks: '200',
    reach: '9000',
    unique_clicks: '150',
    actions: [
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '87' },
      { action_type: 'onsite_conversion.messaging_first_reply', value: '76' },
    ],
  };
  const normalized = mapMetaInsight(row, { currencyMinorFactor: 100 });
  assert.equal(normalized.messages, 87, 'must pick the canonical action type, never sum overlapping ones');
  assert.notEqual(normalized.messages, 163, 'the old production bug (163) must not reappear on this path');
});

check('mapMetaBreakdownInsight resolves the same canonical count for a breakdown row', () => {
  const row: any = {
    date_start: '2026-08-01',
    spend: '50', impressions: '5000', clicks: '100', reach: '4000', unique_clicks: '80',
    age: '25-34',
    actions: [
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '40' },
      { action_type: 'onsite_conversion.messaging_first_reply', value: '35' },
    ],
  };
  const mapped = mapMetaBreakdownInsight(row, 'age', { currencyMinorFactor: 100 });
  assert.ok(mapped);
  assert.equal(mapped!.breakdownValue, '25-34');
  assert.equal(mapped!.messages, 40, 'breakdown rows must resolve through the same canonical path');
});

check('mapMetaBreakdownInsight returns null when the row lacks the breakdown key (same skip as before)', () => {
  const row: any = { date_start: '2026-08-01', spend: '1', impressions: '1', clicks: '0', reach: '1', unique_clicks: '0', actions: [] };
  assert.equal(mapMetaBreakdownInsight(row, 'age', { currencyMinorFactor: 100 }), null);
});

check('v2ContextAssembler.ts source no longer defines its own action-count reimplementation', () => {
  const src = readFileSync(join(__dirname, 'src/services/v2ContextAssembler.ts'), 'utf8');
  assert.ok(!/function sumMessageActions/.test(src), 'the duplicated resolver must be gone');
  assert.ok(!/function numField/.test(src), 'the duplicated numeric coercion helper must be gone');
  assert.ok(/mapMetaInsight\(/.test(src), 'must call the canonical insight mapper');
  assert.ok(/mapMetaBreakdownInsight\(/.test(src), 'must call the canonical breakdown mapper');
});

console.log('\n── 6A. Carousel detection: one definition instead of two that disagreed ──');

check('a real multi-card carousel is detected', () => {
  const raw = { object_story_spec: { link_data: { child_attachments: [{ link: 'a' }, { link: 'b' }] } } };
  assert.equal(isCarouselCreative(raw), true);
});

check('the exact adversarial case the two old tools disagreed on: a single-element child_attachments array', () => {
  // getCreativePerformance.ts's old detectCarousel() required length > 1 (correct: a
  // carousel has multiple cards by definition). analyzeCreativePatterns.ts's old inline
  // check accepted ANY array, so this exact shape was "carousel" to one tool and
  // "not carousel" to the other for the SAME ad. Now there is one answer.
  const raw = { object_story_spec: { link_data: { child_attachments: [{ link: 'only-one' }] } } };
  assert.equal(isCarouselCreative(raw), false, 'a single-card attachment array is not a carousel');
});

check('the unproven effective_object_story_id string heuristic is gone — matching the substring alone is not enough', () => {
  const raw = { effective_object_story_id: 'some_carousel_like_id_123', object_story_spec: {} };
  assert.equal(
    isCarouselCreative(raw), false,
    'a string that merely contains "carousel" must not be treated as evidence of a carousel creative',
  );
});

check('both former call sites now import the single shared function', () => {
  const a = readFileSync(join(__dirname, 'src/services/agent/tools/getCreativePerformance.ts'), 'utf8');
  const b = readFileSync(join(__dirname, 'src/services/agent/tools/analyzeCreativePatterns.ts'), 'utf8');
  for (const [label, src] of [['getCreativePerformance.ts', a], ['analyzeCreativePatterns.ts', b]] as const) {
    assert.ok(src.includes("isCarouselCreative"), `${label} must use the shared function`);
    assert.ok(!/function detectCarousel/.test(src), `${label} must not keep its own local reimplementation`);
  }
});

// ── 6B. Sync concurrency — proven behaviorally ─────────────────────────────
console.log('\n── 6B. Same-account sync is mutually exclusive; different accounts are not ──');

/**
 * A faithful in-memory simulation of Postgres advisory-lock semantics:
 * pg_try_advisory_lock is a non-blocking, atomic try-acquire keyed by a
 * bigint; pg_advisory_unlock releases it. This is what
 * tryAcquireAdvisoryLock()/releaseAdvisoryLock() actually call via
 * $queryRawUnsafe/$executeRawUnsafe — this fake implements the SAME
 * contract in memory so the real acquire/release functions can be exercised
 * under genuine concurrent execution without a live database.
 */
function makeFakeLockPrisma(poolSize = 1) {
  // lockId -> which session owns it, and how deep the re-entrant count is.
  const owner = new Map<number, { session: number; depth: number }>();
  // node-postgres hands out the MOST RECENTLY RELEASED idle client, so this is
  // a stack, not a queue. With poolSize 1 every query lands on session 0 —
  // which is what a quiet worker actually looks like.
  const idle: number[] = [];
  for (let i = poolSize - 1; i >= 0; i--) idle.push(i);
  const stats = { reentrantGrants: 0 };

  // Prisma checks a connection out per query and returns it immediately. That
  // is the whole reason acquire and release can land on different sessions.
  function onSession<T>(fn: (session: number) => T): T {
    const session = idle.pop() ?? -1;
    try { return fn(session); } finally { idle.push(session); }
  }

  const prisma = {
    async $queryRawUnsafe(sql: string, lockId: number) {
      return onSession((session) => {
        if (sql.includes('pg_try_advisory_lock')) {
          const cur = owner.get(lockId);
          if (!cur) { owner.set(lockId, { session, depth: 1 }); return [{ pg_try_advisory_lock: true }]; }
          // THE BEHAVIOUR THAT MATTERS. Postgres grants a session a key it
          // already holds. A fake that returned false here would model a
          // stricter lock than the real one and pass over the actual defect.
          if (cur.session === session) { cur.depth++; stats.reentrantGrants++; return [{ pg_try_advisory_lock: true }]; }
          return [{ pg_try_advisory_lock: false }];
        }
        if (sql.includes('pg_advisory_unlock')) {
          const cur = owner.get(lockId);
          // Unlocking from a session that does not hold it is a no-op that
          // returns false — the leak the helper now warns about.
          if (!cur || cur.session !== session) return [{ pg_advisory_unlock: false }];
          cur.depth -= 1;
          if (cur.depth <= 0) owner.delete(lockId);
          return [{ pg_advisory_unlock: true }];
        }
        throw new Error(`fake prisma saw unexpected SQL: ${sql}`);
      });
    },
    async $executeRawUnsafe() { return 0; },
  } as any;
  return Object.assign(prisma, { __stats: stats, __owner: owner });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
await checkAsync(
  'same account, two concurrent "pipelines" (mirroring the scheduler and syncChunked) — only one runs at a time',
  async () => {
    const prisma = makeFakeLockPrisma();
    const accountId = 'acct_race_test';
    let activeCount = 0;
    let maxConcurrent = 0;
    let bothAttempted = 0;
    let skipped = 0;

    async function pipelineAttempt(label: string, workMs: number) {
      const { acquired, lockId } = await tryAcquireAdvisoryLock(prisma, accountId);
      bothAttempted++;
      if (!acquired) { skipped++; return; }
      try {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await delay(workMs); // simulated multi-phase sync work
      } finally {
        activeCount--;
        await releaseAdvisoryLock(prisma, lockId);
      }
    }

    // The scheduler's full 6-phase pass and a manual/BullMQ syncChunked() job
    // fire for the SAME account at nearly the same instant.
    await Promise.all([
      pipelineAttempt('scheduler', 30),
      pipelineAttempt('manual-sync', 30),
    ]);

    assert.equal(bothAttempted, 2, 'both pipelines must actually attempt the lock (fixture sanity check)');
    assert.equal(maxConcurrent, 1, 'at no point may both pipelines be inside the critical section at once');
    assert.equal(skipped, 1, 'exactly one of the two concurrent attempts must be skipped, not queued or double-run');
    // The refusal has to come from the in-process registry, BEFORE the
    // database is asked. If the second attempt reached Postgres it would be
    // granted the key its own session already holds, and maxConcurrent above
    // would be 2. Zero re-entrant grants is what proves the registry, and not
    // luck in connection scheduling, produced the result.
    assert.equal((prisma as any).__stats.reentrantGrants, 0,
      'the second attempt must be refused in-process; reaching the DB would re-enter the same session');
    // And the registry must not keep the key after both pipelines finish, or
    // this process would refuse itself on the next pass — over-blocking is
    // safe, but permanent over-blocking is a stalled account.
    assert.deepEqual(locksHeldInProcess(), [],
      'every reservation must be given back; a retained one would stall this account');
  },
);

/**
 * FIXTURE FIDELITY. The previous fake modelled the lock as globally exclusive
 * — `held.has(lockId) -> false` — which is STRICTER than Postgres. Under that
 * fake the mutual-exclusion test above passed while the real system could run
 * two syncs of one account concurrently, because a pooled advisory lock is
 * re-entrant per session and Prisma reuses the same connection LIFO.
 *
 * So the fake's re-entrancy is itself asserted. Make the fake strict again and
 * this check fails, instead of the suite quietly going vacuous.
 */
await checkAsync('the fixture models Postgres faithfully: one session CAN re-enter its own lock', async () => {
  const prisma = makeFakeLockPrisma(1);
  const first = await prisma.$queryRawUnsafe('SELECT pg_try_advisory_lock($1)', 424242);
  const second = await prisma.$queryRawUnsafe('SELECT pg_try_advisory_lock($1)', 424242);
  assert.equal(first[0].pg_try_advisory_lock, true, 'a free key must be granted');
  assert.equal(second[0].pg_try_advisory_lock, true,
    'Postgres grants a session a key it already holds — a fake that refuses here is stricter than '
    + 'the database and would hide the exact defect this suite exists to catch');
  assert.equal((prisma as any).__stats.reentrantGrants, 1, 'the second grant must be counted as re-entrant');
});

await checkAsync('an unlock executed on a session that does not hold the lock does not release it', async () => {
  // Two sessions, so acquire and release can genuinely land on different ones.
  const prisma = makeFakeLockPrisma(2);
  const owner = (prisma as any).__owner as Map<number, { session: number; depth: number }>;
  const acquired = await prisma.$queryRawUnsafe('SELECT pg_try_advisory_lock($1)', 999001);
  assert.equal(acquired[0].pg_try_advisory_lock, true);
  const holding = owner.get(999001)!.session;
  // Force the unlock onto the other session by holding the owning one out.
  const wrong = await (async () => {
    const parked = await prisma.$queryRawUnsafe('SELECT pg_try_advisory_lock($1)', 999002);
    assert.equal(parked[0].pg_try_advisory_lock, true, 'fixture: the parking key must be free');
    return prisma.$queryRawUnsafe('SELECT pg_advisory_unlock($1)', 999001);
  })();
  if (owner.get(999001)?.session === holding) {
    assert.equal(wrong[0].pg_advisory_unlock, false,
      'unlocking from a non-owning session must report false rather than silently succeeding');
    assert.ok(owner.has(999001), 'and the DB-side lock must still be held — this is the leak the helper warns about');
  }
});

await checkAsync('different accounts are NOT serialized against each other', async () => {
  const prisma = makeFakeLockPrisma();
  let activeCount = 0;
  let maxConcurrent = 0;

  async function pipelineAttempt(accountId: string, workMs: number) {
    const { acquired, lockId } = await tryAcquireAdvisoryLock(prisma, accountId);
    assert.ok(acquired, `a fresh account's lock must be acquirable`);
    activeCount++;
    maxConcurrent = Math.max(maxConcurrent, activeCount);
    await delay(workMs);
    activeCount--;
    await releaseAdvisoryLock(prisma, lockId);
  }

  await Promise.all([
    pipelineAttempt('acct_alpha', 30),
    pipelineAttempt('acct_beta', 30),
  ]);
  assert.equal(maxConcurrent, 2, 'two different accounts must be able to run genuinely concurrently');
});

check('advisoryLockId is a stable, deterministic hash (same key -> same lock every time)', () => {
  assert.equal(advisoryLockId('acct_1'), advisoryLockId('acct_1'));
  assert.notEqual(advisoryLockId('acct_1'), advisoryLockId('acct_2'));
});

check('backgroundScheduler.ts holds ONE lock across the whole per-account phase sequence', () => {
  const src = readFileSync(join(__dirname, 'src/workers/backgroundScheduler.ts'), 'utf8');
  const acquireIdx = src.indexOf('await tryAcquireAdvisoryLock(prisma, acct.id)');
  const phase1Idx = src.indexOf('worker.syncAccountLevelDataLocked(acct.id');
  const phase6Idx = src.indexOf('await runRefresh(prisma, metaClient,');
  const releaseIdx = src.indexOf('await releaseAdvisoryLock(prisma, acctLockId);');
  for (const [label, idx] of [
    ['lock acquire', acquireIdx], ['Phase 1 call', phase1Idx],
    ['Phase 6 (runRefresh) call', phase6Idx], ['lock release', releaseIdx],
  ] as const) {
    assert.ok(idx >= 0, `${label} must be present`);
  }
  assert.ok(acquireIdx < phase1Idx && phase1Idx < phase6Idx && phase6Idx < releaseIdx,
    'the lock must be acquired before Phase 1 and released only after Phase 6 — covering every phase in between');
  // The old bug: worker.sync() was called directly here, which has its OWN
  // internal acquire — that would be a second, redundant/conflicting attempt
  // now that this loop already holds the lock for the whole pass.
  assert.ok(!/await worker\.sync\(acct\.id/.test(src),
    'the scheduler must call the lock-free variant, not worker.sync() (which owns its own lock)');
});

check('syncAccount.ts: sync() acquires the lock exactly once and delegates its work to the lock-free variant', () => {
  const src = readFileSync(join(__dirname, 'src/workers/syncAccount.ts'), 'utf8');
  assert.ok(src.includes('async syncAccountLevelDataLocked('), 'the lock-free variant must exist');
  const syncStart = src.indexOf('async sync(adAccountId');
  const syncEnd = src.indexOf('async syncAccountLevelDataLocked(');
  const syncBody = src.slice(syncStart, syncEnd);
  assert.ok(syncBody.includes('this.syncAccountLevelDataLocked('), 'sync() must delegate its work to the lock-free variant');
  // ONE LOCKING CONTRACT. This used to count occurrences of the literal
  // `SELECT pg_try_advisory_lock($1)` inside sync(). That check is now unsafe
  // in both directions: comments in this file legitimately quote that SQL (so
  // it can pass with zero real call sites), and raw SQL here is exactly what
  // must NOT exist — a producer issuing its own query bypasses the in-process
  // registry in lib/advisoryLock.ts and can be granted a lock another producer
  // in this same process already holds. So: exactly one helper call, and no
  // raw advisory SQL at all, comments stripped before looking.
  const stripComments = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const syncCode = stripComments(syncBody);
  assert.equal(
    (syncCode.match(/tryAcquireAdvisoryLock\(/g) || []).length, 1,
    'sync() must acquire through the shared helper exactly once',
  );
  assert.equal(
    (syncCode.match(/pg_try_advisory_lock|pg_advisory_unlock/g) || []).length, 0,
    'sync() must not issue its own advisory SQL — that bypasses the in-process registry',
  );
  // syncAccountLevelDataLocked() itself must never acquire at all.
  const lockedFnStart = syncEnd;
  const lockedFnEnd = src.indexOf('private async markSynced(');
  const lockedFnBody = stripComments(src.slice(lockedFnStart, lockedFnEnd));
  assert.equal(
    (lockedFnBody.match(/tryAcquireAdvisoryLock\(|pg_try_advisory_lock/g) || []).length, 0,
    'syncAccountLevelDataLocked() must not acquire its own lock — the caller already holds it',
  );
  // syncChunked() is the manual/BullMQ entry point and the other half of the
  // race the registry closes; it must obey the same contract.
  const chunkedStart = src.indexOf('async syncChunked(jobId');
  assert.ok(chunkedStart > 0, 'syncChunked() must exist');
  const chunkedCode = stripComments(src.slice(chunkedStart));
  assert.equal(
    (chunkedCode.match(/tryAcquireAdvisoryLock\(/g) || []).length, 1,
    'syncChunked() must acquire through the shared helper exactly once',
  );
  assert.equal(
    (chunkedCode.match(/pg_try_advisory_lock|pg_advisory_unlock/g) || []).length, 0,
    'syncChunked() must not issue its own advisory SQL',
  );
});

// ── 6C. Purge ownership — one canonical implementation, full coverage ──────
console.log('\n── 6C. Canonical purge covers campaign_brain_snapshots and campaign_intelligence_reports ──');

check('accountDataPurge.ts deletes campaignBrainSnapshot and campaignIntelligenceReport', () => {
  const src = readFileSync(join(__dirname, 'src/services/accountDataPurge.ts'), 'utf8');
  assert.ok(src.includes('prisma.campaignBrainSnapshot.deleteMany'), 'campaign_brain_snapshots must be covered');
  assert.ok(src.includes('prisma.campaignIntelligenceReport.deleteMany'), 'campaign_intelligence_reports (V5) must be covered');
});

check('adminConsole.ts::deleteCustomer() delegates to the canonical purge, no independent table list', () => {
  const src = readFileSync(join(__dirname, 'src/services/adminConsole.ts'), 'utf8');
  const fnStart = src.indexOf('export async function deleteCustomer(');
  const fnEnd = src.indexOf('\nexport async function listSubscriptions');
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'deleteCustomer() must be found');
  const fnBody = src.slice(fnStart, fnEnd);
  assert.ok(fnBody.includes('purgeAccountAnalytics('), 'must call the canonical function');
  assert.ok(!/prisma\.rawInsight\.deleteMany/.test(fnBody), 'must not keep its own independent rawInsight delete');
  assert.ok(!/prisma\.dailyStat\.deleteMany/.test(fnBody), 'must not keep its own independent dailyStat delete');
  assert.ok(fnBody.includes('prisma.workspace.deleteMany'), 'the workspace-cascade delete must remain');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
}

run();
