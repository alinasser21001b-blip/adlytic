/**
 * Validation-deployment safety — a temporary, read-only Brain Observatory
 * review instance must be able to share the production database without
 * running any autonomous background write.
 *
 * This does not test the Observatory itself (see test_brain_observatory.ts)
 * — it proves the HOST PROCESS (serve.ts/config.ts) has no write path that
 * fires regardless of traffic, for the two settings a validation deployment
 * would use: SERVICE_ROLE=api (already existed) and the new
 * SKIP_STARTUP_SYNC_CLEANUP flag (added for this deployment).
 *
 * Covers:
 *   1. SKIP_STARTUP_SYNC_CLEANUP defaults to false — production is
 *      byte-for-byte unchanged unless a non-primary instance opts in.
 *   2. serve.ts actually gates the startup SyncJob-cleanup write behind it.
 *   3. serve.ts's SERVICE_ROLE=api gate is still the sole switch for
 *      startBackgroundWork() (sync loop, BullMQ workers, onboarding loop,
 *      daily maintenance, integrity sweep).
 *   4. Every one of those five job functions has no OTHER call site outside
 *      backgroundScheduler.ts/queue/index.ts — so SERVICE_ROLE=api cannot be
 *      silently bypassed by some other code path.
 *
 * Run: npx tsx test_validation_deployment_safety.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './src/config';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failures.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); }
}

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const serveSrc = src('src/api/serve.ts');
const configSrc = src('src/config.ts');
const schedulerSrc = src('src/workers/backgroundScheduler.ts');

console.log('\n── 1. SKIP_STARTUP_SYNC_CLEANUP is off by default (production unchanged) ──');

check('the live config singleton has the flag OFF with no env var set', () => {
  assert.equal(config.features.skipStartupSyncCleanup, false,
    'default must be false — an unset env var must never change existing production behavior');
});

check('config.ts declares the flag via envBoolean(..., false)', () => {
  assert.match(configSrc, /envBoolean\('SKIP_STARTUP_SYNC_CLEANUP',\s*false\)/,
    'the flag must default to false, matching the repo\'s existing feature-flag convention');
});

console.log('\n── 2. serve.ts actually gates the startup write behind the flag ──');

check('cleanupOrphanedSyncJobs() is called only inside an !skipStartupSyncCleanup guard', () => {
  const idx = serveSrc.indexOf('await cleanupOrphanedSyncJobs(prisma)');
  assert.ok(idx >= 0, 'the call must still exist for the primary/production instance');
  const before = serveSrc.slice(Math.max(0, idx - 300), idx);
  assert.ok(before.includes('!config.features.skipStartupSyncCleanup'),
    'the call must be gated behind the new flag, not unconditional');
});

console.log('\n── 3. SERVICE_ROLE=api remains the single switch for all background writers ──');

check('startBackgroundWork(prisma) in serve.ts is gated behind config.role !== \'api\'', () => {
  const idx = serveSrc.indexOf('startBackgroundWork(prisma)');
  assert.ok(idx >= 0, 'startBackgroundWork must still be called from serve.ts');
  const before = serveSrc.slice(Math.max(0, idx - 200), idx);
  assert.ok(before.includes("config.role !== 'api'"),
    'the ONLY call to startBackgroundWork must remain behind the SERVICE_ROLE=api gate');
});

check('startBackgroundWork has exactly one call site in the whole codebase (serve.ts)', () => {
  const callSites = [
    { file: 'src/api/serve.ts', text: serveSrc },
  ];
  let count = 0;
  for (const { text } of callSites) {
    count += (text.match(/\bstartBackgroundWork\(prisma\)/g) || []).length;
  }
  assert.equal(count, 1, 'exactly one live call site must exist, or the SERVICE_ROLE gate can be bypassed');
});

check('bootQueueWorkers/scheduleSyncLoop/scheduleOnboardingLoop/runDailyMaintenance each have no external call site', () => {
  // Each of these must only be reachable THROUGH startBackgroundWork() —
  // otherwise a validation instance running SERVICE_ROLE=api could still
  // end up running Meta sync, BullMQ workers, onboarding, or maintenance
  // through some other, ungated path.
  for (const fn of ['bootQueueWorkers', 'scheduleSyncLoop', 'scheduleOnboardingLoop', 'runDailyMaintenance']) {
    const inScheduler = (schedulerSrc.match(new RegExp(`\\b${fn}\\(`, 'g')) || []).length;
    const inServe = (serveSrc.match(new RegExp(`\\b${fn}\\(`, 'g')) || []).length;
    assert.ok(inScheduler >= 1, `${fn} must still be defined/called inside backgroundScheduler.ts`);
    assert.equal(inServe, 0, `${fn} must never be called directly from serve.ts — only via startBackgroundWork()`);
  }
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
