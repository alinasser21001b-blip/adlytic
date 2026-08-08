/**
 * Part A — historical action-overlap reconciliation.
 *
 * Proves the repair is idempotent, bounded, observable, retryable,
 * interruptible, and — most importantly — HONEST: a row whose raw payload was
 * not retained is reported and left alone, never "corrected" by a guess.
 *
 * Run: npx tsx test_action_reconcile.ts
 */
import assert from 'node:assert/strict';
import {
  reconcileActionOverlap,
  summarizeReconcile,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
} from './src/lib/actionOverlapReconcile';

let passed = 0;
const fail: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e: any) => { fail.push(name); console.error(`  ✗ ${name}\n      ${e.message}`); });
}

const A = (t: string, v: number | string) => ({ action_type: t, value: String(v) });
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Raw payload with the overlapping purchase forms that caused the inflation. */
const OVERLAP_RAW = {
  date_start: '2026-07-01', spend: '1000', impressions: '50000', reach: '20000',
  clicks: '900', inline_link_clicks: '400',
  actions: [
    A('purchase', 12),
    A('offsite_conversion.fb_pixel_purchase', 12),
    A('omni_purchase', 15),
    A('lead', 10),
    A('leadgen.other', 6),
    A('landing_page_view', 320),
  ],
  action_values: [A('purchase', 3600), A('omni_purchase', 4500)],
};

/** A minimal in-memory Prisma double. */
function makePrisma(opts: { withRaw?: boolean; rows?: any[]; throwOnRaw?: boolean } = {}) {
  const withRaw = opts.withRaw !== false;
  const updates: any[] = [];
  const rows = opts.rows ?? [{
    id: 'ds1', entityType: 'ACCOUNT', entityId: 'acct1', date: D('2026-07-01'),
    // Stored by the OLD summing mapper: 12+12+15 = 39 purchases, 10+6 = 16
    // leads, 3600+4500 = 8100 revenue, and columns that did not exist yet.
    purchases: 39n, leads: 16n, revenueMinor: 8100n,
    linkClicks: 0n, landingPageViews: 0n, messages: 0n,
  }];
  return {
    updates,
    prisma: {
      dailyStat: {
        findMany: async ({ take, where }: any) => {
          let out = rows;
          if (where?.id?.gt) out = out.filter((r: any) => r.id > where.id.gt);
          return out.slice(0, take);
        },
        update: async (args: any) => { updates.push(args); return args; },
      },
      rawInsight: {
        findMany: async () => {
          if (opts.throwOnRaw) throw new Error('raw query failed');
          if (!withRaw) return [];
          return rows.map((r: any) => ({
            entityType: r.entityType, entityId: r.entityId, date: r.date,
            rawJson: OVERLAP_RAW, fetchedAt: new Date(),
          }));
        },
      },
      adAccount: { findMany: async () => [{ id: 'acct1', currencyMinorFactor: 1 }] },
      campaign: { findMany: async () => [] },
    } as any,
  };
}

async function main() {
  console.log('\n── Strategy guarantees ──');

  await check('bounded: the batch limit is clamped, never unbounded', async () => {
    assert.equal(DEFAULT_BATCH_LIMIT, 500);
    assert.equal(MAX_BATCH_LIMIT, 5_000);
    const { prisma } = makePrisma();
    const r = await reconcileActionOverlap(prisma, { limit: 999_999, dryRun: true });
    assert.ok(r.scanned <= MAX_BATCH_LIMIT);
  });

  await check('observable: a dry run reports every field change and writes NOTHING', async () => {
    const { prisma, updates } = makePrisma();
    const r = await reconcileActionOverlap(prisma, { dryRun: true });
    assert.equal(updates.length, 0, 'dry run must not write');
    assert.equal(r.corrected, 1);
    const row = r.rows[0]!;
    assert.equal(row.outcome, 'CORRECTED');
    assert.deepEqual(row.changes!['purchases'], { from: 39, to: 12 });
    assert.deepEqual(row.changes!['leads'], { from: 16, to: 10 });
    assert.deepEqual(row.changes!['revenueMinor'], { from: 8100, to: 3600 });
    assert.deepEqual(row.changes!['linkClicks'], { from: 0, to: 400 });
    assert.deepEqual(row.changes!['landingPageViews'], { from: 0, to: 320 });
  });

  await check('dry run and apply produce the SAME report', async () => {
    const dry = await reconcileActionOverlap(makePrisma().prisma, { dryRun: true });
    const wet = await reconcileActionOverlap(makePrisma().prisma, { dryRun: false });
    assert.equal(dry.corrected, wet.corrected);
    assert.deepEqual(dry.totals, wet.totals,
      'an operator must see the exact impact before committing to it');
  });

  await check('apply writes the corrected values, including recomputed ROAS', async () => {
    const { prisma, updates } = makePrisma();
    await reconcileActionOverlap(prisma, { dryRun: false });
    assert.equal(updates.length, 1);
    const d = updates[0]!.data;
    assert.equal(d.purchases, 12n);
    assert.equal(d.leads, 10n);
    assert.equal(d.revenueMinor, 3600n);
    assert.equal(d.linkClicks, 400n);
    assert.equal(d.landingPageViews, 320n);
    // spend 1000, revenue 3600 → 3.6. Must NOT keep the 8.1 implied by the
    // inflated revenue figure.
    assert.equal(d.roas, 3.6, `ROAS must be recomputed from corrected revenue, got ${d.roas}`);
  });

  await check('idempotent: a second pass finds nothing left to correct', async () => {
    // Feed it the ALREADY-corrected row; the replay must agree with storage.
    const corrected = [{
      id: 'ds1', entityType: 'ACCOUNT', entityId: 'acct1', date: D('2026-07-01'),
      purchases: 12n, leads: 10n, revenueMinor: 3600n,
      linkClicks: 400n, landingPageViews: 320n, messages: 0n,
    }];
    const { prisma, updates } = makePrisma({ rows: corrected });
    const r = await reconcileActionOverlap(prisma, { dryRun: false });
    assert.equal(r.corrected, 0);
    assert.equal(r.alreadyCorrect, 1);
    assert.equal(updates.length, 0, 'a converged row must not be rewritten');
  });

  console.log('\n── Honesty: never manufacture history ──');

  await check('a row with NO retained raw payload is SKIPPED, not guessed', async () => {
    const { prisma, updates } = makePrisma({ withRaw: false });
    const r = await reconcileActionOverlap(prisma, { dryRun: false });
    assert.equal(r.skippedNoRaw, 1);
    assert.equal(r.corrected, 0);
    assert.equal(updates.length, 0,
      'without the payload we cannot verify the row — leaving it wrong is honest, ' +
      'inventing a correction is not');
    assert.equal(r.rows[0]!.outcome, 'SKIPPED_NO_RAW');
  });

  await check('skipped rows do not pollute the impact totals with fake deltas', async () => {
    const { prisma } = makePrisma({ withRaw: false });
    const r = await reconcileActionOverlap(prisma, { dryRun: true });
    assert.equal(r.totals.purchasesBefore, 0);
    assert.equal(r.totals.purchasesAfter, 0);
  });

  console.log('\n── Resilience ──');

  await check('retryable: a malformed payload fails ONE row, not the batch', async () => {
    const rows = [
      { id: 'ds1', entityType: 'ACCOUNT', entityId: 'acct1', date: D('2026-07-01'),
        purchases: 39n, leads: 16n, revenueMinor: 8100n, linkClicks: 0n, landingPageViews: 0n, messages: 0n },
      { id: 'ds2', entityType: 'ACCOUNT', entityId: 'acct1', date: D('2026-07-02'),
        purchases: 39n, leads: 16n, revenueMinor: 8100n, linkClicks: 0n, landingPageViews: 0n, messages: 0n },
    ];
    const bad = {
      updates: [] as any[],
      prisma: {
        dailyStat: {
          findMany: async ({ take }: any) => rows.slice(0, take),
          update: async (a: any) => { bad.updates.push(a); return a; },
        },
        rawInsight: {
          findMany: async () => [
            // ds1 payload is missing date_start → mapMetaInsight throws.
            { entityType: 'ACCOUNT', entityId: 'acct1', date: D('2026-07-01'), rawJson: { spend: '1' }, fetchedAt: new Date() },
            { entityType: 'ACCOUNT', entityId: 'acct1', date: D('2026-07-02'), rawJson: OVERLAP_RAW, fetchedAt: new Date() },
          ],
        },
        adAccount: { findMany: async () => [{ id: 'acct1', currencyMinorFactor: 1 }] },
        campaign: { findMany: async () => [] },
      } as any,
    };
    const r = await reconcileActionOverlap(bad.prisma, { dryRun: false });
    assert.equal(r.failed, 1, 'the malformed row is counted');
    assert.equal(r.corrected, 1, 'the healthy row is still repaired');
    assert.equal(bad.updates.length, 1);
    assert.equal(r.rows.find((x) => x.dailyStatId === 'ds1')!.outcome, 'FAILED');
  });

  await check('interruptible: each row is its own update, so a halt leaves consistency', async () => {
    const { prisma, updates } = makePrisma();
    await reconcileActionOverlap(prisma, { dryRun: false });
    // One update per row — no multi-row transaction to leave half-applied.
    assert.equal(updates.length, 1);
    assert.ok(updates[0]!.where?.id, 'updates are keyed by a single row id');
  });

  await check('paginated: a full batch reports hasMore and a resume cursor', async () => {
    const many = Array.from({ length: 3 }, (_, i) => ({
      id: `ds${i}`, entityType: 'ACCOUNT', entityId: 'acct1', date: D('2026-07-01'),
      purchases: 39n, leads: 16n, revenueMinor: 8100n, linkClicks: 0n, landingPageViews: 0n, messages: 0n,
    }));
    const { prisma } = makePrisma({ rows: many });
    const r = await reconcileActionOverlap(prisma, { limit: 3, dryRun: true });
    assert.equal(r.hasMore, true);
    assert.equal(r.nextCursor, 'ds2');
  });

  await check('the log summary leaks no payload contents or tokens', () => {
    const line = summarizeReconcile({
      scanned: 1, corrected: 1, alreadyCorrect: 0, skippedNoRaw: 0, failed: 0,
      hasMore: false, nextCursor: 'ds1',
      totals: { purchasesBefore: 39, purchasesAfter: 12, leadsBefore: 16, leadsAfter: 10, revenueBeforeMinor: 8100, revenueAfterMinor: 3600 },
      rows: [],
    });
    assert.ok(line.includes('purchases=39->12'));
    assert.ok(!/token|access_token|rawJson|Bearer/i.test(line), 'summary must be safe to log');
  });

  console.log(`\n════ ${passed} passed, ${fail.length} failed ════`);
  if (fail.length > 0) { console.error('failed: ' + fail.join(', ')); process.exit(1); }
}

main();
