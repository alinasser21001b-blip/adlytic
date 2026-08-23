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
 *   5. No Railway config-as-code file declares a preDeployCommand, and the
 *      validation config's startCommand still carries no `prisma migrate
 *      deploy`. Added after a real deployment failed in Railway's
 *      "Pre-deploy command" phase — see the section-5 comment below.
 *
 * Run: npx tsx test_validation_deployment_safety.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

check('config.ts declares the flag defaulting to false, via a reporting reader', () => {
  // The invariant is the DEFAULT, not the function name. envBooleanChecked is
  // the strengthened reader: it reports a value that was set but unrecognised
  // instead of silently treating it as false — which is how
  // SKIP_STARTUP_SYNC_CLEANUP=enabled once read as "left at the default"
  // while the startup sweep ran against the production database.
  assert.match(configSrc, /envBoolean(Checked)?\('SKIP_STARTUP_SYNC_CLEANUP',\s*false\)/,
    'the flag must default to false, matching the repo\'s existing feature-flag convention');
  assert.match(configSrc, /envBooleanChecked\('SKIP_STARTUP_SYNC_CLEANUP'/,
    'a safety-critical boolean must use the reader that reports typos, not the silent one');
});

console.log('\n── 2. serve.ts actually gates the startup write behind the flag ──');

check('cleanupOrphanedSyncJobs() is gated by BOTH the service role and the flag', () => {
  const idx = serveSrc.indexOf('await cleanupOrphanedSyncJobs(prisma)');
  assert.ok(idx >= 0, 'the call must still exist for the primary/production instance');
  const before = serveSrc.slice(Math.max(0, idx - 600), idx);

  // The flag gate was the ORIGINAL requirement and still stands.
  assert.ok(before.includes('skipStartupSyncCleanup'),
    'the call must remain gated behind SKIP_STARTUP_SYNC_CLEANUP');

  // STRENGTHENED. The flag alone was never sufficient: this sweep is an
  // updateMany that flips every stale PENDING/PROCESSING job to FAILED, and
  // it used to run in EVERY role, above the role gate. A validation reader
  // pointed at the production database therefore rewrote production sync
  // history on every boot — and because those rows became the newest per
  // account, the operations console then reported the workers subsystem as
  // broken. An outage manufactured by the reader.
  //
  // A read-only role must not depend on a second, independently-set variable
  // to stop writing. The role itself now decides.
  assert.ok(before.includes("config.role !== 'api'"),
    'SERVICE_ROLE=api must skip the sweep on its own, without needing the flag');
});

check('the role gate physically precedes the sweep (ordering, not just presence)', () => {
  const roleIdx = serveSrc.indexOf("const sweepOwner = config.role !== 'api'");
  const sweepIdx = serveSrc.indexOf('await cleanupOrphanedSyncJobs(prisma)');
  assert.ok(roleIdx >= 0, 'the sweep must resolve its role ownership explicitly');
  assert.ok(sweepIdx > roleIdx,
    'the role decision must be made BEFORE the write — the original defect was ordering, '
    + 'not absence: the role check existed fifty lines below the sweep');
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

console.log('\n── 5. No Railway config file introduces a pre-deploy command ──');

/**
 * WHY THIS SECTION EXISTS. A real validation deploy failed in Railway's
 * "Pre-deploy command" phase with config.ts's ALLOWED_ORIGINS fatal. The
 * chain is worth stating because it is not obvious:
 *
 *   reportConfig() (the ONLY process.exit(1) config path in this codebase)
 *   has exactly ONE caller — src/api/serve.ts. So emitting that error at
 *   all proves the pre-deploy command was executing the APPLICATION
 *   ENTRYPOINT. And serve.ts calls serve(), which starts a listening HTTP
 *   server that never exits — while a pre-deploy command must run to
 *   completion and exit 0. So a serve-based pre-deploy command can only
 *   ever fail or hang; fixing the env var alone would have converted a
 *   fast, legible failure into a pre-deploy timeout.
 *
 * That command lives in Railway's UI, which a repo test cannot read. What
 * CAN be asserted — and is asserted here — is that this repository never
 * introduces one through config-as-code, and that the validation start
 * command stays migration-free. Stating the boundary honestly beats a test
 * that implies coverage it does not have.
 */
const RAILWAY_CONFIGS = readdirSync(__dirname)
  .filter((f) => /^railway.*\.(json|toml)$/.test(f));

check('the repo ships the Railway configs this test expects to police', () => {
  // Guards the guard: a rename/move must not silently reduce this to a
  // vacuous pass over an empty file list.
  assert.ok(RAILWAY_CONFIGS.length >= 4,
    `expected several railway.* configs, found ${RAILWAY_CONFIGS.length}: ${RAILWAY_CONFIGS.join(', ')}`);
  assert.ok(RAILWAY_CONFIGS.includes('railway.validation.json'),
    'railway.validation.json must exist — it is the validation service\'s config');
});

check('no railway.* config declares a preDeployCommand', () => {
  const offenders = RAILWAY_CONFIGS.filter((f) => /preDeployCommand|pre-?deploy/i.test(src(f)));
  assert.deepEqual(offenders, [],
    `pre-deploy is for migrations, which the validation service must never run: ${offenders.join(', ')}`);
});

check('railway.validation.json\'s startCommand runs no migration', () => {
  const cfg = JSON.parse(src('railway.validation.json')) as {
    deploy?: { startCommand?: string; preDeployCommand?: string };
  };
  const start = cfg.deploy?.startCommand ?? '';
  assert.equal(start, 'node dist/src/api/serve.js',
    'the validation service must start the server directly, with no migrate prefix');
  assert.equal(cfg.deploy?.preDeployCommand, undefined,
    'railway.validation.json must not define a preDeployCommand');
});

check('the runbook never ASSIGNS ALLOWED_ORIGINS a cross-service reference', () => {
  // ${{adlytic.ALLOWED_ORIGINS}} was empirically shown to resolve empty on a
  // second service (a service-scoped reference cannot see a value supplied as
  // a shared/environment variable), and it would be semantically wrong even
  // if it resolved — the validation host needs its OWN origin in the CORS
  // allowlist, not production's.
  //
  // The check is deliberately assignment-scoped rather than a blanket
  // substring ban: naming the reference in a "do NOT use this" warning is
  // exactly what stops the mistake recurring, so the test must not forbid
  // the warning it depends on.
  const offenders = src('railway.setup.txt')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /^\s*ALLOWED_ORIGINS\s*=/.test(line) && line.includes('${{'))
    .map(({ n }) => `railway.setup.txt:${n}`);
  assert.deepEqual(offenders, [],
    `ALLOWED_ORIGINS must be assigned a literal host, never a \${{...}} reference: ${offenders.join(', ')}`);
});

check('the runbook documents both traps that broke a real deploy', () => {
  const runbook = src('railway.setup.txt');
  assert.ok(/Pre-deploy Command = EMPTY/i.test(runbook),
    'the runbook must state that the Pre-deploy Command field stays empty');
  assert.ok(/Do NOT use \$\{\{adlytic\.ALLOWED_ORIGINS\}\}/.test(runbook),
    'the runbook must name the falsified reference explicitly so it is not re-tried');
});

console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
if (failures.length > 0) process.exit(1);
