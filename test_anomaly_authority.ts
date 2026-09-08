// test_anomaly_authority.ts — Phase 4: canonical anomaly ownership.
//
// Proves the AI-agent's detect_anomaly tool (a genuinely independent
// z-score statistical scan — no canonical equivalent to delegate to) can no
// longer stand as an unaware, potentially-contradictory second authority:
// it now consults detected_issues for the same entity/window, drops the one
// metric/issueCode pairing safe to drop (ctr vs LOW_CTR), and always labels
// its remaining findings as supplementary relative to any canonical issue
// codes present. Uses a fake PrismaClient — no live database.
//
// Run: npx tsx test_anomaly_authority.ts

import { EntityType, IssueCode } from '@prisma/client';
import { detectAnomalyHandler } from './src/services/agent/tools/detectAnomaly';
import type { ToolHandlerCtx } from './src/services/agent/dispatcher';

let pass = 0, fail = 0;
function report(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve().then(fn).then(
    () => {},
    (e) => { fail++; console.log(`  ✗ ${name} — threw: ${e?.message ?? e}`); },
  );
}

// ── Fixture builder ────────────────────────────────────────────────────
//
// 30 baseline days with a small, deliberate wobble (so std > 0) around a
// known mean, then a scan window whose one day is a genuine outlier. Every
// field the tool's extractMetric()/dailyStat query touches is populated;
// nothing else is read by the handler under test.

const DAY_MS = 86_400_000;
// The handler under test computes its own scan window from a real
// `new Date()` (detectAnomaly.ts) with no injectable clock, so the fixture's
// "day 0" must track real time too. A fixed calendar date here previously
// drifted out of the handler's actual lookback window as real time passed
// it, failing every assertion downstream of the query returning zero rows —
// not a capability regression, a stale anchor. Computed once so every
// dateAt() call in a single run agrees on "today".
const TODAY = (() => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
})();
function dateAt(daysAgo: number): Date {
  return new Date(TODAY.getTime() - daysAgo * DAY_MS);
}

function makeDailyRow(daysAgo: number, entityType: EntityType, entityId: string, opts: {
  impressions: number; clicks: number; messages: number; spend: number;
}) {
  return {
    date: dateAt(daysAgo),
    entityType,
    entityId,
    impressions: BigInt(opts.impressions),
    clicks: BigInt(opts.clicks),
    messages: BigInt(opts.messages),
    spend: BigInt(opts.spend),
    ctr: null as number | null,
    cpm: null as number | null,
  };
}

/**
 * Baseline: ctr wobbles 1.8%-2.2% around a 2.0% mean (std > 0, so the ctr
 * metric clears the `std <= 0` skip); messages wobbles 18-22 around a mean
 * of 20 for the same reason. Scan day 0 craters ctr to 0.2% (z ≈ -9).
 */
function buildRows(entityType: EntityType, entityId: string) {
  const rows: ReturnType<typeof makeDailyRow>[] = [];
  for (let d = 37; d >= 7; d--) {
    const clicks = d % 2 === 0 ? 18 : 22;      // 1.8% / 2.2% around impressions=1000
    const messages = d % 2 === 0 ? 18 : 22;    // mean 20, std 2
    rows.push(makeDailyRow(d, entityType, entityId, { impressions: 1000, clicks, messages, spend: 10000 }));
  }
  // Scan window (last 7 days): steady except day 0, a genuine ctr crash.
  for (let d = 6; d >= 1; d--) {
    rows.push(makeDailyRow(d, entityType, entityId, { impressions: 1000, clicks: 20, messages: 20, spend: 10000 }));
  }
  rows.push(makeDailyRow(0, entityType, entityId, { impressions: 1000, clicks: 2, messages: 20, spend: 10000 }));
  return rows;
}

interface FakeSetup {
  workspaceId: string;
  accountId: string;
  accountName: string;
  rows: ReturnType<typeof makeDailyRow>[];
  issues: Array<{ entityType: EntityType; entityId: string; issueCode: IssueCode }>;
  lastSyncedAt: Date | null;
}

function makeFakePrisma(setups: FakeSetup[]) {
  const dailyStatCalls: unknown[] = [];
  const issueCalls: unknown[] = [];
  const prisma = {
    workspace: {
      async findUnique(args: { where: { id: string } }) {
        const s = setups.find((x) => x.workspaceId === args.where.id);
        if (!s) return null;
        return {
          id: s.workspaceId,
          adAccounts: [{
            id: s.accountId, name: s.accountName,
            currency: 'USD', currencyMinorFactor: 100, lastSyncedAt: s.lastSyncedAt,
          }],
        };
      },
    },
    campaign: {
      async findFirst() { return null; },
    },
    dailyStat: {
      async findMany(args: any) {
        dailyStatCalls.push(args);
        const entityIds: string[] = args.where.entityId.in;
        const since: Date = args.where.date.gte;
        const until: Date = args.where.date.lte;
        const all = setups.flatMap((s) => s.rows);
        return all
          .filter((r) => entityIds.includes(r.entityId))
          .filter((r) => r.date.getTime() >= since.getTime() && r.date.getTime() <= until.getTime())
          .sort((a, b) => a.date.getTime() - b.date.getTime());
      },
    },
    detectedIssue: {
      async findMany(args: any) {
        issueCalls.push(args);
        const entityIds: string[] = args.where.entityId.in;
        const all = setups.flatMap((s) => s.issues.map((i) => ({ ...i })));
        return all.filter((i) => entityIds.includes(i.entityId));
      },
    },
  };
  return { prisma, dailyStatCalls, issueCalls };
}

function ctxFor(prisma: any, workspaceId: string): ToolHandlerCtx {
  return { prisma, workspaceId, userId: 'user_1' };
}

async function run() {
  const handler = detectAnomalyHandler();

  // ── 1. Baseline behaviour: no canonical issue → ctr crash reported ─────
  await check('without a canonical LOW_CTR issue, the ctr crash is reported', async () => {
    const { prisma } = makeFakePrisma([{
      workspaceId: 'ws_1', accountId: 'acct_1', accountName: 'Acct 1',
      rows: buildRows(EntityType.ACCOUNT, 'acct_1'), issues: [], lastSyncedAt: new Date(),
    }]);
    const res: any = await handler.run(
      { scope: 'workspace', lookbackDays: 7, minAbsZ: 2.0 },
      ctxFor(prisma, 'ws_1'),
    );
    report('call succeeded', res.ok === true, res);
    const ctrAnomalies = res.data.anomalies.filter((a: any) => a.metric === 'ctr');
    report('a ctr anomaly is present', ctrAnomalies.length > 0, res.data.anomalies);
    report('canonicalIssueCodes is empty', res.data.canonicalIssueCodes.length === 0, res.data.canonicalIssueCodes);
    report('note is always present', typeof res.data.note === 'string' && res.data.note.length > 0);
  });

  // ── 2. THE core fix: canonical LOW_CTR present → ctr finding suppressed ─
  await check('AI path cannot produce a contradictory authoritative result (LOW_CTR case)', async () => {
    const { prisma } = makeFakePrisma([{
      workspaceId: 'ws_2', accountId: 'acct_2', accountName: 'Acct 2',
      rows: buildRows(EntityType.ACCOUNT, 'acct_2'),
      issues: [{ entityType: EntityType.ACCOUNT, entityId: 'acct_2', issueCode: IssueCode.LOW_CTR }],
      lastSyncedAt: new Date(),
    }]);
    const res: any = await handler.run(
      { scope: 'workspace', lookbackDays: 7, minAbsZ: 2.0 },
      ctxFor(prisma, 'ws_2'),
    );
    const ctrAnomalies = res.data.anomalies.filter((a: any) => a.metric === 'ctr');
    report(
      'the ctr anomaly is suppressed once the canonical issue explains it',
      ctrAnomalies.length === 0,
      res.data.anomalies,
    );
    report('canonicalIssueCodes reports LOW_CTR', res.data.canonicalIssueCodes.includes('LOW_CTR'));
    report(
      'the note explicitly tells the caller to prefer the canonical explanation',
      res.data.note.toLowerCase().includes('canonical'),
    );
  });

  // ── 3. A canonical issue code with no safe metric mapping does NOT ──────
  //      silently suppress an unrelated finding — only ctr/LOW_CTR is exact.
  await check('an unrelated canonical issue code does not suppress a different metric\'s finding', async () => {
    const { prisma } = makeFakePrisma([{
      workspaceId: 'ws_3', accountId: 'acct_3', accountName: 'Acct 3',
      rows: buildRows(EntityType.ACCOUNT, 'acct_3'),
      issues: [{ entityType: EntityType.ACCOUNT, entityId: 'acct_3', issueCode: IssueCode.HIGH_FREQUENCY }],
      lastSyncedAt: new Date(),
    }]);
    const res: any = await handler.run(
      { scope: 'workspace', lookbackDays: 7, minAbsZ: 2.0 },
      ctxFor(prisma, 'ws_3'),
    );
    const ctrAnomalies = res.data.anomalies.filter((a: any) => a.metric === 'ctr');
    report(
      'ctr finding still fires — HIGH_FREQUENCY is not a safe stand-in for a ctr crash',
      ctrAnomalies.length > 0,
      res.data.anomalies,
    );
    report('canonicalIssueCodes still surfaces HIGH_FREQUENCY for context', res.data.canonicalIssueCodes.includes('HIGH_FREQUENCY'));
  });

  // ── 4. Deterministic thresholds ─────────────────────────────────────────
  await check('thresholds are deterministic: a stricter minAbsZ never finds MORE than a looser one', async () => {
    const { prisma } = makeFakePrisma([{
      workspaceId: 'ws_4', accountId: 'acct_4', accountName: 'Acct 4',
      rows: buildRows(EntityType.ACCOUNT, 'acct_4'), issues: [], lastSyncedAt: new Date(),
    }]);
    const loose: any = await handler.run({ scope: 'workspace', lookbackDays: 7, minAbsZ: 1.5 }, ctxFor(prisma, 'ws_4'));
    const strict: any = await handler.run({ scope: 'workspace', lookbackDays: 7, minAbsZ: 4.5 }, ctxFor(prisma, 'ws_4'));
    report(
      'loose threshold finds at least as many anomalies as strict',
      loose.data.anomalies.length >= strict.data.anomalies.length,
      { loose: loose.data.anomalies.length, strict: strict.data.anomalies.length },
    );
    const again: any = await handler.run({ scope: 'workspace', lookbackDays: 7, minAbsZ: 1.5 }, ctxFor(prisma, 'ws_4'));
    report(
      'identical input is fully repeatable (no hidden randomness)',
      JSON.stringify(loose.data.anomalies) === JSON.stringify(again.data.anomalies),
    );
  });

  // ── 5. Zero vs missing stay distinct ────────────────────────────────────
  await check('zero and missing remain distinct: a real 0 is scanned, an absent day is not invented', async () => {
    const rows = buildRows(EntityType.ACCOUNT, 'acct_5');
    // Day 1 of the scan window: an explicit, real zero for messages.
    const day1 = rows.find((r) => r.date.getTime() === dateAt(1).getTime())!;
    day1.messages = 0n;
    // Day 3 of the scan window: no row at all (never synced / gap).
    const withoutDay3 = rows.filter((r) => r.date.getTime() !== dateAt(3).getTime());

    const { prisma } = makeFakePrisma([{
      workspaceId: 'ws_5', accountId: 'acct_5', accountName: 'Acct 5',
      rows: withoutDay3, issues: [], lastSyncedAt: new Date(),
    }]);
    const res: any = await handler.run({ scope: 'workspace', lookbackDays: 7, minAbsZ: 2.0 }, ctxFor(prisma, 'ws_5'));
    report('call succeeded', res.ok === true, res);
    const messagesFindings = res.data.anomalies.filter((a: any) => a.metric === 'messages');
    const day1Finding = messagesFindings.find((a: any) => a.date === dateAt(1).toISOString().slice(0, 10));
    const day3Finding = res.data.anomalies.find((a: any) => a.date === dateAt(3).toISOString().slice(0, 10));
    report('the explicit zero on day 1 is checked and can be flagged as a real value', !!day1Finding, messagesFindings);
    report('the missing day 3 contributes no finding at all (not silently treated as zero)', !day3Finding);
  });

  // ── 6. Tenant isolation ─────────────────────────────────────────────────
  await check('tenant isolation: two workspaces never see each other\'s anomalies or issues', async () => {
    const { prisma } = makeFakePrisma([
      {
        workspaceId: 'ws_a', accountId: 'acct_shared_name', accountName: 'A',
        rows: buildRows(EntityType.ACCOUNT, 'acct_shared_name'),
        issues: [{ entityType: EntityType.ACCOUNT, entityId: 'acct_shared_name', issueCode: IssueCode.LOW_CTR }],
        lastSyncedAt: new Date(),
      },
      {
        workspaceId: 'ws_b', accountId: 'acct_b', accountName: 'B',
        rows: buildRows(EntityType.ACCOUNT, 'acct_b'), issues: [], lastSyncedAt: new Date(),
      },
    ]);
    const resA: any = await handler.run({ scope: 'workspace', lookbackDays: 7, minAbsZ: 2.0 }, ctxFor(prisma, 'ws_a'));
    const resB: any = await handler.run({ scope: 'workspace', lookbackDays: 7, minAbsZ: 2.0 }, ctxFor(prisma, 'ws_b'));
    report('workspace A sees its own suppression (LOW_CTR)', resA.data.anomalies.filter((a: any) => a.metric === 'ctr').length === 0);
    report('workspace B is unaffected by A\'s canonical issue', resB.data.anomalies.filter((a: any) => a.metric === 'ctr').length > 0);
    report('workspace B reports no canonical issue codes at all', resB.data.canonicalIssueCodes.length === 0, resB.data.canonicalIssueCodes);
    report(
      'every anomaly entityId in A\'s result belongs to A\'s account',
      resA.data.anomalies.every((a: any) => a.entityId === 'acct_shared_name'),
    );
  });

  console.log(`\n════ ${pass} passed, ${fail} failed ════`);
  if (fail > 0) process.exit(1);
}

run();
