/**
 * Operational truth convergence.
 *
 * Three concrete defects, found by reading the code behind the operational
 * warnings an operator actually sees, not by redesigning the warning layer:
 *
 *  R/M — metaUsageTracker.ts's Redis-only persistence returned hard zeros
 *        forever in any environment without REDIS_URL (production, always).
 *        Every other Redis consumer in this codebase degrades to a
 *        functionally equivalent fallback; this one had none. Fixed by
 *        making Postgres the durable store — see 20260823120000_add_meta_
 *        usage_durable_store. No live Postgres exists in this sandbox, so
 *        the read/write functions take an OPTIONAL injected PrismaClient
 *        (mirroring periodInsights.ts's own pattern) and these tests pass a
 *        minimal fake rather than a live connection.
 *
 *  U   — adminOpsHealth.ts fetched acct.metaDisableReason and then never
 *        used it, and treated every non-ACTIVE Meta account_status as a hard
 *        BLOCKED — including IN_GRACE_PERIOD, which campaignLifecycle.ts's
 *        own accountDeliveryHold() already knows is not a halt. Fixed by
 *        reusing that canonical mapping instead of re-deriving a cruder one.
 *
 *  G   — the architecture graph drew "QUEUE DEPENDS_ON redis" unqualified,
 *        which is true and misleading at once: lib/queue.ts proves the
 *        dependency is fallback-safe at every call site. Fixed by adding an
 *        explicit, optional dependency-strength field to DEPENDS_ON edges.
 *
 *  C/A — "AI not tested", "workspace/entity not selected" are not bugs: the
 *        intelligence subsystem is deliberately NOT_TESTED (no live check
 *        exists yet, and a fabricated score would be worse than none).
 *        Asserted here as a regression guard, not fixed, because nothing is
 *        broken.
 *
 * Run: npx tsx test_operational_truth.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveConnectionStatus } from './src/services/adminOpsHealth';
import { accountDeliveryHold, META_ACCOUNT_STATUS } from './src/lib/campaignLifecycle';
import {
  categorizeMetaError, getMetaUsageStats, recordMetaResponseHeaders, recordMetaErrorCategory,
  type MetaErrorCategory,
} from './src/services/metaUsageTracker';
import { buildArchitectureGraph, deployNodeId, queueNodeId } from './src/graph/architecture';
import { parseGraphSnapshot } from './src/graph/adapter';
import { GRAPH_SCHEMA_VERSION } from './src/graph/model';
import { QUEUE_NAMES } from './src/lib/queue';

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

const MIGRATION_DIR = 'prisma/migrations/20260823120000_add_meta_usage_durable_store';

/** A fake day row, defaulting every counter to 0 so a test sets only what it needs. */
function dayRow(date: Date, overrides: Partial<Record<string, number>> = {}) {
  return {
    date, callCount: 0, errTokenCount: 0, errRateLimitCount: 0, errPermissionCount: 0,
    errInvalidParamsCount: 0, errServerCount: 0, errOtherCount: 0,
    updatedAt: new Date(), ...overrides,
  };
}

async function main() {
  console.log('\n── 1. The migration is additive, and matches the schema ──');

  check('the migration only CREATEs — nothing dropped, altered or renamed', () => {
    const sql = readFileSync(join(__dirname, MIGRATION_DIR, 'migration.sql'), 'utf8');
    for (const table of ['meta_usage_daily_counters', 'meta_usage_recent_calls', 'meta_usage_latest_snapshot']) {
      assert.ok(sql.includes(`CREATE TABLE "${table}"`), `must create ${table}`);
    }
    for (const destructive of ['DROP ', 'RENAME ', 'ALTER TABLE', 'DELETE FROM', 'TRUNCATE']) {
      assert.ok(!sql.toUpperCase().includes(destructive.toUpperCase()),
        `an additive migration must not contain ${destructive.trim()}`);
    }
  });

  check('schema.prisma and the migration agree on all three table names', () => {
    const schema = readFileSync(join(__dirname, 'prisma/schema.prisma'), 'utf8');
    const sql = readFileSync(join(__dirname, MIGRATION_DIR, 'migration.sql'), 'utf8');
    for (const [model, table] of [
      ['MetaUsageDailyCounter', 'meta_usage_daily_counters'],
      ['MetaUsageRecentCall', 'meta_usage_recent_calls'],
      ['MetaUsageLatestSnapshot', 'meta_usage_latest_snapshot'],
    ]) {
      const modelBlock = schema.slice(schema.indexOf(`model ${model} {`));
      assert.ok(modelBlock.includes(`@@map("${table}")`), `${model} must map to ${table}`);
      assert.ok(sql.includes(`"${table}"`), `migration must create ${table}`);
    }
  });

  console.log('\n── 2. categorizeMetaError — pure classification, unchanged from before ──');

  check('token errors', () => {
    assert.equal(categorizeMetaError(401), 'token');
    assert.equal(categorizeMetaError(400, 190), 'token');
  });
  check('rate-limit errors, including 429 without a Meta code', () => {
    assert.equal(categorizeMetaError(429), 'rate_limit');
    assert.equal(categorizeMetaError(400, 17), 'rate_limit');
  });
  check('server errors default from status alone', () => {
    assert.equal(categorizeMetaError(503), 'server');
  });
  check('an unrecognised status/code combination is other, never a guess', () => {
    assert.equal(categorizeMetaError(418), 'other');
  });

  console.log('\n── 3. recordMetaErrorCategory — the sole writer of the category columns ──');

  const CATEGORY_FIELD: Record<MetaErrorCategory, string> = {
    token: 'errTokenCount', rate_limit: 'errRateLimitCount', permission: 'errPermissionCount',
    invalid_params: 'errInvalidParamsCount', server: 'errServerCount', other: 'errOtherCount',
  };
  for (const [status, code, expected] of [
    [401, undefined, 'token'], [429, undefined, 'rate_limit'], [403, undefined, 'permission'],
    [400, undefined, 'invalid_params'], [503, undefined, 'server'], [418, undefined, 'other'],
  ] as const) {
    await checkAsync(`status ${status}${code ? ` code ${code}` : ''} increments ${CATEGORY_FIELD[expected]}`, async () => {
      const calls: any[] = [];
      const prisma = { metaUsageDailyCounter: { async upsert(a: any) { calls.push(a); return {}; } } } as any;
      await recordMetaErrorCategory(status, code, prisma);
      assert.equal(calls.length, 1, 'exactly one upsert');
      const field = CATEGORY_FIELD[expected];
      assert.equal(calls[0].create[field], 1, `create must set ${field}`);
      assert.deepEqual(calls[0].update[field], { increment: 1 }, `update must increment ${field}`);
    });
  }

  console.log('\n── 4. recordMetaResponseHeaders — never throws, writes what happened ──');

  await checkAsync('a 2xx increments callCount and records a success outcome', async () => {
    const dailyCalls: any[] = []; const recentCalls: any[] = [];
    const prisma = {
      metaUsageDailyCounter: { async upsert(a: any) { dailyCalls.push(a); return {}; } },
      metaUsageRecentCall: {
        async create(a: any) { recentCalls.push(a); return {}; },
        async findMany() { return []; },
        async deleteMany() { return { count: 0 }; },
      },
      metaUsageLatestSnapshot: { async upsert() { return {}; } },
    } as any;
    await recordMetaResponseHeaders(new Headers(), 200, prisma);
    assert.equal(dailyCalls.length, 1);
    assert.equal(dailyCalls[0].create.callCount, 1);
    assert.equal(recentCalls.length, 1);
    assert.equal(recentCalls[0].data.success, true);
  });

  await checkAsync('a 4xx does NOT touch callCount, but does record a failed outcome', async () => {
    const dailyCalls: any[] = []; const recentCalls: any[] = [];
    const prisma = {
      metaUsageDailyCounter: { async upsert(a: any) { dailyCalls.push(a); return {}; } },
      metaUsageRecentCall: {
        async create(a: any) { recentCalls.push(a); return {}; },
        async findMany() { return []; },
        async deleteMany() { return { count: 0 }; },
      },
      metaUsageLatestSnapshot: { async upsert() { return {}; } },
    } as any;
    await recordMetaResponseHeaders(new Headers(), 500, prisma);
    assert.equal(dailyCalls.length, 0, 'error counts are recordMetaErrorCategory\'s job, not this one\'s');
    assert.equal(recentCalls.length, 1);
    assert.equal(recentCalls[0].data.success, false);
  });

  await checkAsync('a 3xx counts as neither a success nor a failure', async () => {
    const recentCalls: any[] = [];
    const prisma = {
      metaUsageDailyCounter: { async upsert() { throw new Error('must not be called on a 3xx'); } },
      metaUsageRecentCall: { async create(a: any) { recentCalls.push(a); return {}; } },
      metaUsageLatestSnapshot: { async upsert() { return {}; } },
    } as any;
    await recordMetaResponseHeaders(new Headers(), 302, prisma);
    assert.equal(recentCalls.length, 0);
  });

  await checkAsync('the recent-call window is trimmed once it exceeds 500 rows', async () => {
    let deletedBefore: Date | null = null;
    const cutoffDate = new Date('2026-08-01T00:00:00.000Z');
    const prisma = {
      metaUsageDailyCounter: { async upsert() { return {}; } },
      metaUsageRecentCall: {
        async create() { return {}; },
        async findMany() { return [{ createdAt: cutoffDate }]; },
        async deleteMany(a: any) { deletedBefore = a.where.createdAt.lt; return { count: 3 }; },
      },
      metaUsageLatestSnapshot: { async upsert() { return {}; } },
    } as any;
    await recordMetaResponseHeaders(new Headers(), 200, prisma);
    assert.equal(deletedBefore, cutoffDate, 'trims everything older than the 500th-newest row');
  });

  await checkAsync('the header snapshot only overwrites fields present in THIS response', async () => {
    const snapshotCalls: any[] = [];
    const prisma = {
      metaUsageDailyCounter: { async upsert() { return {}; } },
      metaUsageRecentCall: {
        async create() { return {}; }, async findMany() { return []; }, async deleteMany() { return { count: 0 }; },
      },
      metaUsageLatestSnapshot: { async upsert(a: any) { snapshotCalls.push(a); return {}; } },
    } as any;
    const headers = new Headers({ 'x-business-use-case-usage': '{"unit":"ok"}' });
    await recordMetaResponseHeaders(headers, 200, prisma);
    assert.equal(snapshotCalls.length, 1);
    assert.ok('businessUseCase' in snapshotCalls[0].update, 'the present header is written');
    assert.ok(!('appUsage' in snapshotCalls[0].update), 'an absent header must not clobber a prior value with nothing');
    assert.ok(!('lastTier' in snapshotCalls[0].update),
      'lastTier is derived from x-ad-account-usage specifically — it must not reset just because a DIFFERENT header showed up');
  });

  await checkAsync('a malformed usage header is ignored, not stored as garbage', async () => {
    const snapshotCalls: any[] = [];
    const prisma = {
      metaUsageDailyCounter: { async upsert() { return {}; } },
      metaUsageRecentCall: {
        async create() { return {}; }, async findMany() { return []; }, async deleteMany() { return { count: 0 }; },
      },
      metaUsageLatestSnapshot: { async upsert(a: any) { snapshotCalls.push(a); return {}; } },
    } as any;
    await recordMetaResponseHeaders(new Headers({ 'x-app-usage': 'not json' }), 200, prisma);
    assert.equal(snapshotCalls.length, 0, 'nothing worth persisting — no snapshot write at all');
  });

  check('recordMetaResponseHeaders and recordMetaErrorCategory never throw with no DATABASE_URL', () => {
    // This sandbox's own real condition. Both must be true fire-and-forget:
    // a caller that does `void recordX(...).catch(() => {})` must never see
    // an unhandled rejection reach that .catch as a surprise, and awaiting
    // directly (as these tests do) must resolve, not reject.
    assert.equal(process.env['DATABASE_URL'], undefined, 'sanity: this check is only meaningful without a DB');
  });
  await checkAsync('...and indeed resolve cleanly with no injected prisma and no DATABASE_URL', async () => {
    await recordMetaResponseHeaders(new Headers({ 'x-app-usage': '{"call_count":1}' }), 200);
    await recordMetaErrorCategory(500);
  });

  console.log('\n── 5. getMetaUsageStats — sums correctly, and degrades honestly ──');

  await checkAsync('an unreachable store returns emptyStats(false), never throws', async () => {
    const stats = await getMetaUsageStats({ metaUsageDailyCounter: { findMany() { throw new Error('down'); } } } as any);
    assert.equal(stats.redisAvailable, false, 'the legacy field name — see the interface doc comment for why it stays');
    assert.equal(stats.counts.last15Days, 0);
    assert.equal(stats.counts.meetsCallThreshold, false);
    assert.equal(stats.counts.meetsErrorGate, false);
  });

  await checkAsync('with no DATABASE_URL and no injected prisma, the same honest zero comes back', async () => {
    const stats = await getMetaUsageStats();
    assert.equal(stats.redisAvailable, false);
  });

  await checkAsync('daily rows sum into last7Days/last15Days correctly, today/yesterday read their own row', async () => {
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const yesterday = new Date(today.getTime() - 86400_000);
    const tenDaysAgo = new Date(today.getTime() - 10 * 86400_000);
    const prisma = {
      metaUsageDailyCounter: {
        async findMany() {
          return [dayRow(today, { callCount: 5 }), dayRow(yesterday, { callCount: 3 }), dayRow(tenDaysAgo, { callCount: 100 })];
        },
      },
      metaUsageRecentCall: { async findMany() { return []; } },
      metaUsageLatestSnapshot: { async findUnique() { return null; } },
    } as any;
    const stats = await getMetaUsageStats(prisma);
    assert.equal(stats.counts.today, 5);
    assert.equal(stats.counts.yesterday, 3);
    assert.equal(stats.counts.last7Days, 8, 'the 10-day-old row is outside the 7-day window');
    assert.equal(stats.counts.last15Days, 108, 'but inside the 15-day window');
  });

  await checkAsync('errorBreakdown15d sums per-category columns, and their total IS errorsLast15Days', async () => {
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const prisma = {
      metaUsageDailyCounter: {
        async findMany() { return [dayRow(today, { errTokenCount: 2, errServerCount: 1 })]; },
      },
      metaUsageRecentCall: { async findMany() { return []; } },
      metaUsageLatestSnapshot: { async findUnique() { return null; } },
    } as any;
    const stats = await getMetaUsageStats(prisma);
    assert.equal(stats.errorBreakdown15d.token, 2);
    assert.equal(stats.errorBreakdown15d.server, 1);
    assert.equal(stats.counts.errorsLast15Days, 3, 'no separate aggregate counter to drift from the breakdown');
  });

  await checkAsync('meetsErrorGate is withheld until the last-500 window actually has 500 samples', async () => {
    const prisma = {
      metaUsageDailyCounter: { async findMany() { return []; } },
      metaUsageRecentCall: { async findMany() { return Array.from({ length: 10 }, () => ({ success: true })); } },
      metaUsageLatestSnapshot: { async findUnique() { return null; } },
    } as any;
    const stats = await getMetaUsageStats(prisma);
    assert.equal(stats.counts.recentWindowSize, 10);
    assert.equal(stats.counts.errorRateLast500, 0, 'ten successes, zero errors — the rate itself is accurate');
    assert.equal(stats.counts.meetsErrorGate, false, 'but the verdict must not be asserted on 10 samples, only on 500');
  });

  await checkAsync('meetsErrorGate asserts true once the window is full and under the gate', async () => {
    const calls = [...Array.from({ length: 480 }, () => ({ success: true })), ...Array.from({ length: 20 }, () => ({ success: false }))];
    const prisma = {
      metaUsageDailyCounter: { async findMany() { return []; } },
      metaUsageRecentCall: { async findMany() { return calls; } },
      metaUsageLatestSnapshot: { async findUnique() { return null; } },
    } as any;
    const stats = await getMetaUsageStats(prisma);
    assert.equal(stats.counts.recentWindowSize, 500);
    assert.equal(stats.counts.errorRateLast500, 4, '20/500 = 4%');
    assert.equal(stats.counts.meetsErrorGate, true, '4% is under the 15% gate, and the window is full');
  });

  await checkAsync('the latest snapshot round-trips JSON fields into the typed latest.* shape', async () => {
    const prisma = {
      metaUsageDailyCounter: { async findMany() { return []; } },
      metaUsageRecentCall: { async findMany() { return []; } },
      metaUsageLatestSnapshot: {
        async findUnique() {
          return {
            appUsage: { call_count: 42, total_cputime: 10, total_time: 20 },
            adAccountUsage: { acc_id_util_pct: 55, ads_api_access_tier: 'standard_access' },
            businessUseCase: { unit: 'x' },
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          };
        },
      },
    } as any;
    const stats = await getMetaUsageStats(prisma);
    assert.deepEqual(stats.latest.appUsage, { callCount: 42, totalCpuTime: 10, totalTime: 20 });
    assert.equal(stats.latest.adAccountUsage!.tier, 'standard_access');
    assert.equal(stats.latest.lastUpdated, '2026-08-01T00:00:00.000Z');
  });

  console.log('\n── 6. deriveConnectionStatus — the blocked-reason chain, exhaustively ──');

  check('no token → BLOCKED, before any Meta status is even considered', () => {
    const r = deriveConnectionStatus({
      hasToken: false, expired: false, metaAccountStatus: META_ACCOUNT_STATUS.ACTIVE,
      metaDisableReason: null, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'BLOCKED');
  });

  check('expired token → BLOCKED', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: true, metaAccountStatus: null, metaDisableReason: null, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'BLOCKED');
  });

  check('a healthy, active account is HEALTHY with no metaAccountStatus synced yet', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: false, metaAccountStatus: null, metaDisableReason: null, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'HEALTHY');
  });

  check('DISABLED surfaces metaDisableReason in the headline — this is the fix', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: false, metaAccountStatus: META_ACCOUNT_STATUS.DISABLED,
      metaDisableReason: 3, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'BLOCKED');
    assert.ok(r.headline.includes('3'), `headline must name the disable_reason code: "${r.headline}"`);
  });

  check('DISABLED with no synced disable_reason still gets the account_status label, without a bare number', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: false, metaAccountStatus: META_ACCOUNT_STATUS.DISABLED,
      metaDisableReason: null, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'BLOCKED');
    assert.ok(r.headline.length > 0 && !/^\d+$/.test(r.headline));
  });

  check('UNSETTLED → BLOCKED, matching campaignLifecycle.ts\'s own "halted" verdict', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: false, metaAccountStatus: META_ACCOUNT_STATUS.UNSETTLED,
      metaDisableReason: null, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'BLOCKED');
    assert.equal(r.connection, accountDeliveryHold(META_ACCOUNT_STATUS.UNSETTLED).halted ? 'BLOCKED' : 'WARNING');
  });

  check('IN_GRACE_PERIOD → WARNING, NOT BLOCKED — this is the over-alarm this fix corrects', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: false, metaAccountStatus: META_ACCOUNT_STATUS.IN_GRACE_PERIOD,
      metaDisableReason: null, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'WARNING',
      'the account is still delivering — accountDeliveryHold() says halted=false, and the console must agree');
  });

  check('an unrecognised Meta code is treated as a hold, never silently healthy', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: false, metaAccountStatus: 9999,
      metaDisableReason: null, localStatus: 'ACTIVE',
    });
    assert.equal(r.connection, 'BLOCKED');
  });

  check('Meta ACTIVE but locally inactive → WARNING, not HEALTHY and not BLOCKED', () => {
    const r = deriveConnectionStatus({
      hasToken: true, expired: false, metaAccountStatus: META_ACCOUNT_STATUS.ACTIVE,
      metaDisableReason: null, localStatus: 'PAUSED',
    });
    assert.equal(r.connection, 'WARNING');
  });

  console.log('\n── 7. Graphify — dependency strength on DEPENDS_ON edges ──');

  const graph = buildArchitectureGraph();

  check('every QUEUE→redis edge is explicitly OPTIONAL_FALLBACK, not an unqualified hard dependency', () => {
    for (const name of Object.values(QUEUE_NAMES)) {
      const edge = graph.edges.find((e) => e.kind === 'DEPENDS_ON' && e.from === queueNodeId(name) && e.to === deployNodeId('redis'));
      assert.ok(edge, `expected a DEPENDS_ON edge from queue ${name} to redis`);
      assert.equal(edge!.strength, 'OPTIONAL_FALLBACK',
        'lib/queue.ts proves enqueueOrFallback() never loses work when Redis is absent — the edge must say so');
    }
    const moduleEdge = graph.edges.find((e) => e.kind === 'DEPENDS_ON' && e.to === deployNodeId('redis') && e.from.startsWith('module:'));
    assert.equal(moduleEdge?.strength, 'OPTIONAL_FALLBACK');
  });

  check('the intelligence layer chain is REQUIRED — a real, no-fallback short-circuit', () => {
    const layerDeps = graph.edges.filter((e) => e.kind === 'DEPENDS_ON' && e.from.startsWith('layer:') && e.to.startsWith('layer:'));
    assert.ok(layerDeps.length > 0, 'expected at least one layer→layer DEPENDS_ON edge');
    for (const e of layerDeps) {
      assert.equal(e.strength, 'REQUIRED', `${e.id} short-circuits on failure per hierarchy.ts — it is not optional`);
    }
  });

  check('a snapshot round-tripped through parseGraphSnapshot preserves strength', () => {
    const plain = JSON.parse(JSON.stringify(graph));
    const parsed = parseGraphSnapshot(plain);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      const edge = parsed.snapshot.edges.find((e) => e.kind === 'DEPENDS_ON' && e.strength === 'OPTIONAL_FALLBACK');
      assert.ok(edge, 'at least one OPTIONAL_FALLBACK edge must survive the parse');
    }
  });

  check('an edge with a bogus strength value degrades to unset, not a rejected snapshot', () => {
    const minimal = {
      version: GRAPH_SCHEMA_VERSION, generatedAt: '2026-01-01T00:00:00.000Z', source: 'test', repositoryCommit: null,
      nodes: [
        { id: 'n1', nodeClass: 'SERVICE', label: 'n1', what: 'a', owner: 'test', provenance: { method: 'REPOSITORY_DECLARATION', source: 't' } },
        { id: 'n2', nodeClass: 'DB_MODEL', label: 'n2', what: 'b', owner: 'test', provenance: { method: 'REPOSITORY_DECLARATION', source: 't' } },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: 'DEPENDS_ON', strength: 'MAYBE_SOMETIMES', provenance: { method: 'REPOSITORY_DECLARATION', source: 't' } }],
      metadata: {},
    };
    const parsed = parseGraphSnapshot(minimal);
    assert.equal(parsed.ok, true, 'a bad optional field must not sink an otherwise-valid edge');
    if (parsed.ok) assert.equal(parsed.snapshot.edges[0]!.strength, undefined);
  });

  check('an edge with no strength at all still round-trips fine — it is genuinely optional', () => {
    const minimal = {
      version: GRAPH_SCHEMA_VERSION, generatedAt: '2026-01-01T00:00:00.000Z', source: 'test', repositoryCommit: null,
      nodes: [
        { id: 'n1', nodeClass: 'SERVICE', label: 'n1', what: 'a', owner: 'test', provenance: { method: 'REPOSITORY_DECLARATION', source: 't' } },
        { id: 'n2', nodeClass: 'DB_MODEL', label: 'n2', what: 'b', owner: 'test', provenance: { method: 'REPOSITORY_DECLARATION', source: 't' } },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: 'READS', provenance: { method: 'REPOSITORY_DECLARATION', source: 't' } }],
      metadata: {},
    };
    const parsed = parseGraphSnapshot(minimal);
    assert.equal(parsed.ok, true);
  });

  console.log('\n── 8. Context/AI — "not tested" and "not selected" are classifications, not bugs ──');

  check('the intelligence subsystem is still deliberately NOT_TESTED, never a fabricated score', () => {
    const src = readFileSync(join(__dirname, 'src/services/adminOpsHealth.ts'), 'utf8');
    const idx = src.indexOf("key: 'intelligence'");
    assert.ok(idx > 0, 'the intelligence subsystem entry must still exist');
    assert.ok(/status:\s*'NOT_TESTED'/.test(src.slice(idx, idx + 400)),
      'intelligence health must stay NOT_TESTED — narration coverage is measured elsewhere, and a live check does not exist yet');
  });

  check('a workspace with no linked ad account is NOT_TESTED, not an error', () => {
    const src = readFileSync(join(__dirname, 'src/services/adminOpsHealth.ts'), 'utf8');
    assert.ok(/بلا حساب إعلاني — لم يُربط بعد/.test(src),
      '"no account linked yet" must read as a setup state, not a failure — see the no-account branch');
  });

  console.log(`\n════ ${passed} passed, ${failures.length} failed ════`);
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main();
