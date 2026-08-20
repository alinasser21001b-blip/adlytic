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
import { advisoryLockId, tryAcquireAdvisoryLock, releaseAdvisoryLock } from './src/lib/advisoryLock';

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
function makeFakeLockPrisma() {
  const held = new Set<number>();
  return {
    async $queryRawUnsafe(_sql: string, lockId: number) {
      if (held.has(lockId)) return [{ pg_try_advisory_lock: false }];
      held.add(lockId);
      return [{ pg_try_advisory_lock: true }];
    },
    async $executeRawUnsafe(_sql: string, lockId: number) {
      held.delete(lockId);
      return 0;
    },
  } as any;
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
  },
);

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
  // Match the literal SQL call site (type annotation + result-field access
  // both also contain the string "pg_try_advisory_lock", so counting THAT
  // substring would overcount a single genuine acquire 3x) — this occurs
  // exactly once per real pg_try_advisory_lock call, comments aside.
  const acquireCallSites = (syncBody.match(/SELECT pg_try_advisory_lock\(\$1\)/g) || []).length;
  assert.equal(
    acquireCallSites, 1,
    'sync() must issue exactly one pg_try_advisory_lock call, not once for itself and again inside the delegated call',
  );
  // syncAccountLevelDataLocked() itself must never issue its own acquire call.
  const lockedFnStart = syncEnd;
  const lockedFnEnd = src.indexOf('private async markSynced(');
  const lockedFnBody = src.slice(lockedFnStart, lockedFnEnd);
  assert.equal(
    (lockedFnBody.match(/SELECT pg_try_advisory_lock\(\$1\)/g) || []).length, 0,
    'syncAccountLevelDataLocked() must not acquire its own lock — the caller already holds it',
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
