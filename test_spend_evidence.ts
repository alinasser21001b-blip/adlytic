// ═════════════════════════════════════════════════════════════════════════
//  test_spend_evidence.ts — unverified IQD spend stays visible per PERIOD and is
//  kept out of the recommendations that rest on it. CI-safe: NO database, no Redis,
//  no secrets (the Postgres twin is test_spend_evidence_postgres.ts).
//
//  Owner requirement: "Keep SPEND_SCALE_UNVERIFIED visible for affected periods
//  after factor=1. Exclude unverified spend from recommendations that depend on it."
//  The model and its limits: delivery/core/SPEND_EVIDENCE_GATING.md.
//
//    1. the day rule is ONE function, shared with the repair
//    2. periods: contiguous runs, newest first, capped, exact totals, never a function of the factor or of "now"
//    3. campaign rows: verified only through a verified account row AND a reconciling day total
//    4. what depends on spend — and what does not
//    5. the read-time gate over stored recommendations (fake db)
//    6. generation: RecommendationEngine, RulesEngine, V5 (fake prisma) — spend-independent recommendations
//       keep working, non-IQD and clean windows are byte-identical to before
//    7. the Brain (pure)
//    8. the AI agent's save_recommendation
//    9. wiring (static): every producer and reader goes through the gate
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

import { readFileSync } from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`); }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ROOT = __dirname;
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
/** Code only: a comment that explains the old behaviour must not trip a check on the new one. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const iso = (daysAgo: number) => new Date(Date.UTC(2026, 10, 10) - daysAgo * 86_400_000).toISOString().slice(0, 10);

// ── a fake database that answers the three evidence queries and the two model lookups ─────────
interface FakeOpts {
  currency?: string;
  /** ACCOUNT daily_stats rows */
  account?: Array<{ day: string; spend: number }>;
  /** ACCOUNT raw_insights rows (distinct day/spend pairs, as the GROUP BY returns them) */
  raws?: Array<{ day: string; spend: number | string | null }>;
  /** Σ and count of the account's CAMPAIGN rows per day */
  campaigns?: Array<{ day: string; total: number; n: number }>;
  throwOnQuery?: boolean;
  noEntity?: boolean;
}
function fakeDb(o: FakeOpts) {
  const log = { queries: 0, sql: [] as string[] };
  const inRange = (day: string, from: unknown, to: unknown) => day >= String(from) && day <= String(to);
  const db: any = {
    log,
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      log.queries++;
      const text = strings.join('?');
      log.sql.push(text);
      if (o.throwOnQuery) throw new Error('db down');
      const [, from, to] = values;
      if (text.includes('raw_insights')) return (o.raws ?? []).filter((r) => inRange(r.day, from, to)).map((r) => ({ day: r.day, spend: r.spend == null ? null : String(r.spend) }));
      if (text.includes("'CAMPAIGN'")) return (o.campaigns ?? []).filter((r) => inRange(r.day, from, to)).map((r) => ({ day: r.day, total: String(r.total), n: r.n }));
      return (o.account ?? []).filter((r) => inRange(r.day, from, to)).map((r) => ({ day: r.day, spend: String(r.spend) }));
    },
    adAccount: { findFirst: async ({ where }: any) => (o.noEntity ? null : { id: where.id, currency: o.currency ?? 'IQD' }) },
    campaign: { findFirst: async () => (o.noEntity ? null : { adAccount: { id: 'acct_1', currency: o.currency ?? 'IQD' } }) },
  };
  return db;
}

async function main() {
  const S = await import('./src/lib/spendEvidence');
  const Rule = await import('./src/lib/spendScaleRule');
  const Repair = await import('./src/lib/iqdRepair');

  // ── 1. one rule, shared ──────────────────────────────────────────────
  console.log('\n── 1. the day rule is ONE function, shared with the repair ──');
  const J = Rule.judgeDayAgainstRaws;
  check('stored == a raw → VERIFIED', J(150_000, [150_000]).verdict === 'VERIFIED');
  check('restated day (an earlier raw next to the final one) → VERIFIED', J(150_000, [90_000, 150_000]).verdict === 'VERIFIED');
  check('another raw proves it exactly x100 → NOT certified (contradicted)', J(150_000, [150_000, 1_500]).verdict !== 'VERIFIED');
  check('all raws agree and stored is x100 → OVERSCALED', J(15_000_000, [150_000]).verdict === 'OVERSCALED');
  check('raws disagree and none matches → conflicting, UNVERIFIABLE (no guess)', same(J(777, [100, 5_000]), { verdict: 'UNVERIFIABLE', conflicting: true }), J(777, [100, 5_000]));
  check('no raw at all → UNVERIFIABLE', J(150_000, []).verdict === 'UNVERIFIABLE');
  check('the repair module re-exports the SAME functions (no second copy to drift)', Repair.judgeSpendScale === Rule.judgeSpendScale && Repair.parseMetaSpend === Rule.parseMetaSpend);
  const repairSrc = code(read('src/lib/iqdRepair.ts'));
  check('iqdRepair.collectScaleEvidence delegates to judgeDayAgainstRaws', /judgeDayAgainstRaws\(/.test(repairSrc));
  const evSrc = code(read('src/lib/spendEvidence.ts'));
  check('spendEvidence.ts uses the shared rule and never imports the repair writer', /from '\.\/spendScaleRule'/.test(evSrc) && !/iqdRepair/.test(evSrc));
  check('spendEvidence.ts never reads the stored currency factor — the factor is not evidence', !/currencyMinorFactor|currency_minor_factor/.test(evSrc));
  check('spendEvidence.ts issues no write', !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction|INSERT |UPDATE |DELETE /.test(evSrc));

  // ── 2. periods ───────────────────────────────────────────────────────
  console.log('\n── 2. periods: contiguous runs of rows that are neither verified nor proven x100 ──');
  const row = (day: string, status: 'VERIFIED' | 'OVERSCALED' | 'UNVERIFIED') => ({ day, status });
  const mixed = [
    row('2026-01-01', 'UNVERIFIED'), row('2026-01-02', 'UNVERIFIED'), row('2026-01-03', 'UNVERIFIED'),
    row('2026-01-04', 'VERIFIED'),
    row('2026-01-05', 'UNVERIFIED'),
    row('2026-01-06', 'OVERSCALED'),
    row('2026-01-07', 'UNVERIFIED'), row('2026-01-09', 'UNVERIFIED'), // 01-08 has no row: it does not break the run
  ];
  const p = S.buildPeriods(mixed, 'UNVERIFIED');
  check('three unverified runs, newest first', same(p.periods, [{ from: '2026-01-07', to: '2026-01-09', rows: 2 }, { from: '2026-01-05', to: '2026-01-05', rows: 1 }, { from: '2026-01-01', to: '2026-01-03', rows: 3 }]), p.periods);
  check('a VERIFIED row ends a run; a day with no row does not', p.periods.length === 3 && p.periods[0]!.rows === 2);
  check('an OVERSCALED row ends an unverified run, and is listed on its own', same(S.buildPeriods(mixed, 'OVERSCALED').periods, [{ from: '2026-01-06', to: '2026-01-06', rows: 1 }]));
  check('totals are exact', p.totalPeriods === 3 && p.totalRows === 6 && p.truncated === false);
  const many = Array.from({ length: 60 }, (_, i) => row(iso(120 - i * 2), i % 2 === 0 ? 'UNVERIFIED' : 'VERIFIED'));
  const capped = S.buildPeriods(many, 'UNVERIFIED', 5);
  check('the list is capped (newest kept) but the totals stay exact', capped.periods.length === 5 && capped.totalPeriods === 30 && capped.totalRows === 30 && capped.truncated === true && capped.periods[0]!.from > capped.periods[4]!.from, capped);
  check('SPEND_PERIODS_CAP is the documented 24', S.SPEND_PERIODS_CAP === 24);
  check('all rows verified → no period', S.buildPeriods([row('2026-01-01', 'VERIFIED')], 'UNVERIFIED').periods.length === 0);

  // history is read for ALL time: a period far older than any rolling window is listed, whatever "now" is
  const oldDb = fakeDb({
    account: [{ day: iso(400), spend: 1000 }, { day: iso(399), spend: 1000 }, { day: iso(5), spend: 2000 }, { day: iso(4), spend: 2000 }],
    raws: [{ day: iso(5), spend: 2000 }, { day: iso(4), spend: 2000 }],
  });
  const per = await S.listSpendPeriods(oldDb, 'acct_1');
  check('a 400-day-old unverified period is listed (older than the 30-day window and the 90-day raw retention)', same(per.unverifiedPeriods, [{ from: iso(400), to: iso(399), rows: 2 }]) && per.unverifiedRowsTotal === 2 && per.overscaledPeriods.length === 0, per);
  check('listSpendPeriods issues no window bound (it reads all history)', oldDb.log.sql.every((q: string) => !/INTERVAL|now\(\)/i.test(q)));
  const overDb = fakeDb({ account: [{ day: iso(3), spend: 15_000_000 }], raws: [{ day: iso(3), spend: 150_000 }] });
  const perO = await S.listSpendPeriods(overDb, 'acct_1');
  check('rows PROVEN x100 are listed as overscaledPeriods, not as unverified', perO.overscaledPeriods.length === 1 && perO.unverifiedPeriods.length === 0, perO);
  const sameAccountA = await S.listSpendPeriods(fakeDb({ account: [{ day: iso(9), spend: 5 }], raws: [] }), 'acct_1');
  const sameAccountB = await S.listSpendPeriods(fakeDb({ currency: 'IQD', account: [{ day: iso(9), spend: 5 }], raws: [] }), 'acct_1');
  check('the answer is a function of the ROWS only: the same rows give the same periods', same(sameAccountA, sameAccountB));

  // ── 3. campaign rows ─────────────────────────────────────────────────
  console.log('\n── 3. campaign rows: verified only through the account row AND a reconciling day total ──');
  const R = S.campaignSumReconciles;
  check('campaign sum == account → reconciles', R(300_000, 300_000, 2));
  check('within 2% → reconciles', R(300_000, 295_000, 2));
  check('3% off → does NOT reconcile', !R(300_000, 291_000, 2));
  check('campaigns add up to x100 of the account → does NOT reconcile', !R(300_000, 30_000_000, 2));
  check('campaigns add up to a hundredth → does NOT reconcile', !R(300_000, 3_000, 2));
  check('rounding slack of a few IQD on a tiny day → reconciles', R(3, 2, 2) && R(0, 0, 2));
  check('NaN → does NOT reconcile', !R(NaN, 5, 1));
  const day = (account: 'VERIFIED' | 'OVERSCALED' | 'UNVERIFIED' | null, accountSpend: number | null, campaignSpend: number, campaignRows: number) => ({ day: '2026-01-01', account, accountSpend, campaignSpend, campaignRows });
  const L = S.dayStatusAtLevel;
  check('CAMPAIGN: account verified + campaigns reconcile → VERIFIED', L(day('VERIFIED', 300_000, 300_000, 2), 'CAMPAIGN') === 'VERIFIED');
  check('CAMPAIGN: account verified but campaigns do not add up → UNVERIFIED', L(day('VERIFIED', 300_000, 30_000_000, 2), 'CAMPAIGN') === 'UNVERIFIED');
  check('CAMPAIGN: campaigns reconcile with an UNPROVEN account row → still UNVERIFIED (both may be x100 together)', L(day('UNVERIFIED', 300_000, 300_000, 2), 'CAMPAIGN') === 'UNVERIFIED');
  check('CAMPAIGN: account row proven x100 → OVERSCALED', L(day('OVERSCALED', 30_000_000, 30_000_000, 2), 'CAMPAIGN') === 'OVERSCALED');
  check('CAMPAIGN: campaign rows but NO account row at all → UNVERIFIED', L(day(null, null, 300_000, 2), 'CAMPAIGN') === 'UNVERIFIED');
  check('CAMPAIGN: no campaign rows that day → nothing to judge (null)', L(day('UNVERIFIED', 300_000, 0, 0), 'CAMPAIGN') === null);
  check('ACCOUNT: judged on the account row alone, campaigns ignored', L(day('VERIFIED', 300_000, 30_000_000, 2), 'ACCOUNT') === 'VERIFIED' && L(day(null, null, 5, 1), 'ACCOUNT') === null);
  const winDays = [
    { day: iso(6), account: 'VERIFIED' as const, accountSpend: 100, campaignSpend: 100, campaignRows: 1 },
    { day: iso(5), account: 'VERIFIED' as const, accountSpend: 100, campaignSpend: 9_900, campaignRows: 1 },
    { day: iso(4), account: 'UNVERIFIED' as const, accountSpend: 100, campaignSpend: 100, campaignRows: 1 },
  ];
  const wa = S.summarizeWindow(winDays, 'ACCOUNT', iso(6), iso(4));
  const wc = S.summarizeWindow(winDays, 'CAMPAIGN', iso(6), iso(4));
  check('the same three days: ACCOUNT level has 1 unverified row, CAMPAIGN level has 2', wa.unverified === 1 && wa.verified === 2 && wc.unverified === 2 && wc.verified === 1, [wa, wc]);
  check('a window outside the rows is empty and clean (nothing to judge)', S.summarizeWindow(winDays, 'ACCOUNT', iso(60), iso(50)).clean === true);
  check('over-scale outranks unverified as the reason', S.summarizeWindow([{ day: iso(1), account: 'OVERSCALED', accountSpend: 1, campaignSpend: 0, campaignRows: 0 }, { day: iso(2), account: 'UNVERIFIED', accountSpend: 1, campaignSpend: 0, campaignRows: 0 }], 'ACCOUNT', null, null).reason === 'SPEND_SCALE_OVERSCALED');

  // evidence read through the fake db
  const verifiedDb = fakeDb({
    account: [{ day: iso(2), spend: 100_000 }, { day: iso(1), spend: 100_000 }],
    raws: [{ day: iso(2), spend: 100_000 }, { day: iso(1), spend: 100_000 }],
    campaigns: [{ day: iso(2), total: 100_000, n: 2 }, { day: iso(1), total: 100_000, n: 2 }],
  });
  const wv = await S.evaluateSpendWindow(verifiedDb, { id: 'acct_1', currency: 'IQD' }, iso(5), iso(0), 'CAMPAIGN');
  check('a fully proven window with reconciling campaigns is clean at CAMPAIGN level', wv.clean && wv.verified === 2 && wv.applies, wv);
  const halfDb = fakeDb({
    account: [{ day: iso(2), spend: 100_000 }, { day: iso(1), spend: 100_000 }],
    raws: [{ day: iso(2), spend: 100_000 }],
    campaigns: [{ day: iso(2), total: 100_000, n: 2 }, { day: iso(1), total: 100_000, n: 2 }],
  });
  const wh = await S.evaluateSpendWindow(halfDb, { id: 'acct_1', currency: 'IQD' }, iso(5), iso(0), 'CAMPAIGN');
  check('one day without a raw counterpart makes the window not clean: SPEND_SCALE_UNVERIFIED, 1 of 2', !wh.clean && wh.reason === 'SPEND_SCALE_UNVERIFIED' && wh.unverified === 1 && wh.verified === 1, wh);
  const usdDb = fakeDb({ currency: 'USD', account: [{ day: iso(1), spend: 1 }] });
  const wu = await S.evaluateSpendWindow(usdDb, { id: 'acct_1', currency: 'USD' }, iso(5), iso(0), 'ACCOUNT');
  check('a non-IQD account: not applicable, clean, and NOT ONE query is made', !wu.applies && wu.clean && usdDb.log.queries === 0, [wu, usdDb.log.queries]);
  check('spendScaleFlagForRange: null for non-IQD and for a clean range', (await S.spendScaleFlagForRange(usdDb, { id: 'a', currency: 'USD' }, null, null)) === null && (await S.spendScaleFlagForRange(verifiedDb, { id: 'a', currency: 'IQD' }, iso(5), iso(0))) === null);
  const flag = await S.spendScaleFlagForRange(halfDb, { id: 'a', currency: 'IQD' }, iso(5), iso(0));
  check('…and a period read that overlaps unverified rows carries SPEND_SCALE_UNVERIFIED with the rows and periods', flag?.code === 'SPEND_SCALE_UNVERIFIED' && flag.severity === 'WARN' && flag.rows === 1 && flag.of === 2 && flag.periods.length === 1 && !!flag.messageAr, flag);
  const flagOld = await S.spendScaleFlagForRange(oldDb, { id: 'a', currency: 'IQD' }, iso(420), iso(380));
  check('a read of a period far older than any window still carries the flag', flagOld?.code === 'SPEND_SCALE_UNVERIFIED' && flagOld.rows === 2, flagOld);
  const flagOtherRange = await S.spendScaleFlagForRange(oldDb, { id: 'a', currency: 'IQD' }, iso(300), iso(200));
  check('…and a read of a range with no affected row does not', flagOtherRange === null, flagOtherRange);

  // ── 4. what depends on spend ─────────────────────────────────────────
  console.log('\n── 4. what depends on spend — and what does not ──');
  const D = S.spendDependenceOfRecommendation;
  for (const c of ['PAUSE_AND_RELAUNCH', 'REVIEW_BUDGET_PACING', 'INCREASE_BUDGET', 'DECREASE_BUDGET', 'PAUSE', 'PAUSE_URGENT', 'SCALE_BUDGET', 'PAUSE_CAMPAIGN', 'EMERGENCY_PAUSE', 'ADJUST_BID']) {
    check(`${c} depends on spend (by action code)`, D({ actionCode: c }).dependent);
  }
  for (const c of ['REFRESH_CREATIVES', 'REFRESH_CREATIVE', 'BROADEN_AUDIENCE', 'IMPROVE_HOOKS', 'CHECK_TARGETING', 'NARROW_AUDIENCE', 'EXPAND_AUDIENCE', 'MONITOR', 'INVESTIGATE_TRACKING', 'IMPROVE_AD_COPY', 'EXPAND_AUDIENCE']) {
    check(`${c} does NOT depend on spend`, !D({ actionCode: c }).dependent);
  }
  check('composed from RISING_COST_PER_RESULT → depends, whatever its action code', D({ actionCode: 'SOMETHING_NEW', sourceIssues: ['AUDIENCE_FATIGUE', 'RISING_COST_PER_RESULT'] }).basis === 'SOURCE_ISSUE');
  check('composed from fatigue + frequency only → does not', !D({ actionCode: 'BROADEN_AUDIENCE', sourceIssues: ['AUDIENCE_FATIGUE', 'HIGH_FREQUENCY'] }).dependent);
  const kbBreach = (metricKey: string, id: string) => ({ metricKey, recommended_optimization_actions: [{ id }] });
  check('a knowledge-base recommendation owned by a cost metric depends on spend', D({ actionCode: 'CPMSG_PAUSE_BLEEDERS', details: { source: 'meta_ads_knowledge_base', metricBreaches: [kbBreach('cost_per_message', 'CPMSG_PAUSE_BLEEDERS')] } }).basis === 'KB_METRIC');
  check('a knowledge-base recommendation owned by CTR does not — even next to a CPM breach it does not own', !D({ actionCode: 'CTR_TEST_NEW_HOOKS', details: { source: 'meta_ads_knowledge_base', metricBreaches: [kbBreach('ctr', 'CTR_TEST_NEW_HOOKS'), kbBreach('cpm', 'CPM_REVIEW_BIDS')] } }).dependent);
  check('…but if the owning breach cannot be matched, any cost breach decides (never a guess in the permissive direction)', D({ actionCode: 'UNMATCHED', details: { source: 'meta_ads_knowledge_base', metricBreaches: [kbBreach('ctr', 'X'), kbBreach('cpc', 'Y')] } }).dependent);
  const m = { ctr: 0.4, cpm: 8, cpc: 0.2, frequency: 5, cost_per_message: 9, cost_per_thruplay: 1, roas: 2 };
  const w = S.withholdSpendDerivedMetrics(m);
  check('spend-derived KB metrics are removed, ctr/frequency stay, the input is not mutated', same(w, { ctr: 0.4, frequency: 5 }) && m.cpm === 8, w);
  check('issue codes: RISING_COST_PER_RESULT, HIGH_CPM, BUDGET_BURNING_FAST depend on spend; fatigue/frequency/CTR/results do not',
    ['RISING_COST_PER_RESULT', 'HIGH_CPM', 'BUDGET_BURNING_FAST'].every(S.isSpendDependentIssueCode) && !['AUDIENCE_FATIGUE', 'HIGH_FREQUENCY', 'LOW_CTR', 'DECLINING_RESULTS'].some(S.isSpendDependentIssueCode));

  // ── 5. the display gate over stored recommendations ──────────────────
  console.log('\n── 5. the read-time gate over STORED recommendations ──');
  const rec = (over: Record<string, unknown>) => ({ id: 'r1', entityType: 'ACCOUNT', entityId: 'acct_1', date: new Date(`${iso(0)}T00:00:00Z`), actionCode: 'REFRESH_CREATIVES', source: 'V1_RULES', sourceIssuesJson: [], detailsJson: null, ...over });
  const unclean = fakeDb({ account: [{ day: iso(5), spend: 1000 }], raws: [] });
  const recs = [
    rec({ id: 'indep', actionCode: 'REFRESH_CREATIVES' }),
    rec({ id: 'budget', actionCode: 'REVIEW_BUDGET_PACING', sourceIssuesJson: ['RISING_COST_PER_RESULT'] }),
    rec({ id: 'composed', actionCode: 'BROADEN_AUDIENCE', sourceIssuesJson: ['RISING_COST_PER_RESULT'] }),
    rec({ id: 'ai-budget', actionCode: 'INCREASE_BUDGET', source: 'AI_AGENT', sourceIssuesJson: { source: 'ai_agent' } }),
  ];
  const part = await S.partitionRecommendationsBySpendEvidence(unclean, recs as any);
  check('IQD, window not clean: spend-dependent ones withheld, the spend-independent one kept', same(part.kept.map((r: any) => r.id), ['indep']) && same(part.suppressed.map((x) => x.id).sort(), ['ai-budget', 'budget', 'composed']), [part.kept.map((r: any) => r.id), part.suppressed.map((x) => x.id)]);
  check('…each withheld one says why (reason code, basis, window) — not silent', part.suppressed.every((x) => x.reason === 'SPEND_SCALE_UNVERIFIED' && !!x.basis && x.window.unverified === 1) && part.suppressed.find((x) => x.id === 'budget')?.basis === 'ACTION_CODE' && part.suppressed.find((x) => x.id === 'composed')?.basis === 'SOURCE_ISSUE', part.suppressed);
  const cleanDb = fakeDb({ account: [{ day: iso(5), spend: 1000 }], raws: [{ day: iso(5), spend: 1000 }] });
  const partClean = await S.partitionRecommendationsBySpendEvidence(cleanDb, recs as any);
  check('IQD, window fully verified: everything kept, nothing suppressed', partClean.kept.length === 4 && partClean.suppressed.length === 0);
  const partUsd = await S.partitionRecommendationsBySpendEvidence(fakeDb({ currency: 'USD' }), recs as any);
  check('non-IQD: everything kept, and the evidence tables are never read', partUsd.kept.length === 4 && partUsd.suppressed.length === 0);
  const usdLog = fakeDb({ currency: 'USD' });
  await S.partitionRecommendationsBySpendEvidence(usdLog, recs as any);
  check('…zero $queryRaw calls for a non-IQD account', usdLog.log.queries === 0, usdLog.log.queries);
  const partErr = await S.partitionRecommendationsBySpendEvidence(fakeDb({ throwOnQuery: true }), recs as any);
  check('evidence unreadable → spend-dependent ones are withheld (fail closed), independent ones kept', same(partErr.kept.map((r: any) => r.id), ['indep']) && partErr.suppressed.length === 3, [partErr.kept.length, partErr.suppressed.length]);
  // each recommendation is judged by ITS OWN window
  const twoWeeks = fakeDb({
    account: [{ day: iso(40), spend: 1000 }, { day: iso(3), spend: 1000 }],
    raws: [{ day: iso(40), spend: 1000 }],
  });
  const aged = await S.partitionRecommendationsBySpendEvidence(twoWeeks, [
    rec({ id: 'old-verified', actionCode: 'REVIEW_BUDGET_PACING', date: new Date(`${iso(38)}T00:00:00Z`) }),
    rec({ id: 'new-unverified', actionCode: 'REVIEW_BUDGET_PACING', date: new Date(`${iso(0)}T00:00:00Z`) }),
  ] as any);
  check('an old recommendation built on a verified window stays; a new one built on an unverified window goes', same(aged.kept.map((r: any) => r.id), ['old-verified']) && same(aged.suppressed.map((x) => x.id), ['new-unverified']), aged);
  const batchDb = fakeDb({ account: [{ day: iso(5), spend: 1000 }], raws: [] });
  await S.partitionRecommendationsBySpendEvidence(batchDb, Array.from({ length: 40 }, (_, i) => rec({ id: `b${i}`, actionCode: 'PAUSE_AND_RELAUNCH', date: new Date(`${iso(i % 10)}T00:00:00Z`) })) as any);
  check('40 stored recommendations of one account cost ONE evidence read (not one per row)', batchDb.log.queries === 2, batchDb.log.queries);
  const aiWin = S.windowForAsOf(iso(0), S.EVIDENCE_WINDOWS.aiAgent);
  const engWin = S.windowForAsOf(iso(0), S.EVIDENCE_WINDOWS.engine);
  check('windows: engine = 14 days ending 2 days before as-of; AI agent = 30 days ending as-of', engWin.to === iso(2) && engWin.from === iso(15) && aiWin.to === iso(0) && aiWin.from === iso(29), [engWin, aiWin]);

  // the AI agent reads up to 30 days; the deterministic engines 14 (ending 2 days before as-of)
  const windowDb = fakeDb({ account: [{ day: iso(20), spend: 1000 }, { day: iso(3), spend: 1000 }], raws: [{ day: iso(3), spend: 1000 }] });
  const byWindow = await S.partitionRecommendationsBySpendEvidence(windowDb, [
    rec({ id: 'ai-30d', actionCode: 'DECREASE_BUDGET', source: 'AI_AGENT' }),
    rec({ id: 'v1-14d', actionCode: 'REVIEW_BUDGET_PACING', source: 'V1_RULES' }),
  ] as any);
  check('an unverified day 20 days ago is inside the AI agent\'s 30-day window (withheld) but outside the engines\' 14-day window (kept)', same(byWindow.suppressed.map((x) => x.id), ['ai-30d']) && same(byWindow.kept.map((r: any) => r.id), ['v1-14d']), [byWindow.suppressed.map((x) => x.id), byWindow.kept.map((r: any) => r.id)]);

  // ── 6. generation ────────────────────────────────────────────────────
  console.log('\n── 6. generation: spend-independent recommendations keep working, clean and non-IQD are untouched ──');
  const { RecommendationEngine } = await import('./src/engines/recommendation/RecommendationEngine');
  const { EntityType, IssueCode } = await import('@prisma/client');
  const asOf = new Date('2026-06-14T12:00:00Z');
  const asOfIso = '2026-06-14';
  const dailyRows = ['06-05', '06-06', '06-07', '06-08', '06-09', '06-10', '06-11', '06-12'].map((d) => ({
    // Healthy delivery metrics on purpose (frequency 2.0, CTR 2.0, CPC 2): the knowledge base finds no
    // breach, so the detected-issue composition is what decides. The breaching fixtures are built below.
    date: new Date(`2026-${d}`), spend: 40n, impressions: 2500n, reach: 1800n, clicks: 50n, linkClicks: 0n,
    messages: 4n, purchases: 0n, leads: 0n, conversions: 4n, ctr: 2.0, cpm: 5.2, frequency: 2.0,
  }));
  function engineDb(o: { currency: string; issues: string[]; daily?: any[]; evidence: FakeOpts }) {
    const ev = fakeDb({ currency: o.currency, ...o.evidence });
    const written: any[] = [];
    const db: any = {
      ...ev,
      detectedIssue: { findMany: async () => o.issues.map((c) => ({ issueCode: c, severity: 'HIGH', evidenceJson: {} })) },
      dailyStat: { findMany: async () => o.daily ?? dailyRows },
      campaign: { findFirst: ev.campaign.findFirst, findUnique: async () => null, findMany: async () => [] },
      adAccount: { findFirst: ev.adAccount.findFirst, findUnique: async () => ({ workspace: { industryProfile: null } }) },
      recommendation: {
        deleteMany: () => ({ op: 'delete' }),
        create: ({ data }: any) => { written.push(data); return { op: 'create' }; },
      },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    return { db, written };
  }
  const uncleanEv: FakeOpts = { account: [{ day: '2026-06-10', spend: 13000 }], raws: [] };
  const cleanEv: FakeOpts = { account: [{ day: '2026-06-10', spend: 13000 }], raws: [{ day: '2026-06-10', spend: 13000 }] };
  const furniture = [IssueCode.AUDIENCE_FATIGUE, IssueCode.DECLINING_RESULTS, IssueCode.RISING_COST_PER_RESULT];

  const base = engineDb({ currency: 'USD', issues: furniture, evidence: uncleanEv });
  const rUsd = await new RecommendationEngine(base.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  const cleanIqd = engineDb({ currency: 'IQD', issues: furniture, evidence: cleanEv });
  const rClean = await new RecommendationEngine(cleanIqd.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  const gated = engineDb({ currency: 'IQD', issues: furniture, evidence: uncleanEv });
  const rGated = await new RecommendationEngine(gated.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  check('USD: the three-signal story still composes PAUSE_AND_RELAUNCH', rUsd.recommendation?.actionCode === 'PAUSE_AND_RELAUNCH' && rUsd.spendEvidence === undefined, rUsd);
  check('IQD with a fully verified window: byte-identical to the non-IQD run (regression)', same(rClean, rUsd) && same(cleanIqd.written, base.written), [rClean, rUsd]);
  check('IQD, spend NOT verified: PAUSE_AND_RELAUNCH (needs RISING_COST_PER_RESULT) is not produced…', rGated.ok && rGated.recommendation?.actionCode !== 'PAUSE_AND_RELAUNCH', rGated.recommendation);
  check('…the spend-independent remainder composes instead: REFRESH_CREATIVES from fatigue + declining results', rGated.recommendation?.actionCode === 'REFRESH_CREATIVES' && !rGated.recommendation.sourceIssues.includes(IssueCode.RISING_COST_PER_RESULT), rGated.recommendation);
  check('…and the suppression is visible: result.spendEvidence and the stored row both name RISING_COST_PER_RESULT and the reason', rGated.spendEvidence?.reason === 'SPEND_SCALE_UNVERIFIED' && same(rGated.spendEvidence.withheldIssueCodes, ['RISING_COST_PER_RESULT']) && (gated.written[0]?.detailsJson as any)?.spendEvidence?.reason === 'SPEND_SCALE_UNVERIFIED', [rGated.spendEvidence, gated.written]);

  const onlyCost = engineDb({ currency: 'IQD', issues: [IssueCode.RISING_COST_PER_RESULT], evidence: uncleanEv });
  const rOnlyCost = await new RecommendationEngine(onlyCost.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  check('a rising-cost issue alone: no recommendation is written on unverified spend (REVIEW_BUDGET_PACING withheld)', rOnlyCost.ok && rOnlyCost.recommendation === null && onlyCost.written.length === 0 && same(rOnlyCost.spendEvidence?.withheldIssueCodes, ['RISING_COST_PER_RESULT']), [rOnlyCost, onlyCost.written]);
  const onlyCostUsd = engineDb({ currency: 'USD', issues: [IssueCode.RISING_COST_PER_RESULT], evidence: uncleanEv });
  const rOnlyCostUsd = await new RecommendationEngine(onlyCostUsd.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  check('…the same issue on a USD account still yields REVIEW_BUDGET_PACING', rOnlyCostUsd.recommendation?.actionCode === 'REVIEW_BUDGET_PACING', rOnlyCostUsd.recommendation);

  // Safety net: a rule table that maps a spend-free issue to a spend-dependent action code (a custom `rules` seam) is still not written.
  const budgetRule = [{ requiredIssues: [IssueCode.LOW_CTR], priority: 'MEDIUM' as any, actionCode: 'REVIEW_BUDGET_PACING' as any, rationale: 'test rule: a budget action from a spend-free issue' }];
  const netDb = engineDb({ currency: 'IQD', issues: [IssueCode.LOW_CTR], evidence: uncleanEv });
  const rNet = await new RecommendationEngine(netDb.db).run(EntityType.ACCOUNT, 'acct_1', { asOf, rules: budgetRule });
  const netUsd = engineDb({ currency: 'USD', issues: [IssueCode.LOW_CTR], evidence: uncleanEv });
  const rNetUsd = await new RecommendationEngine(netUsd.db).run(EntityType.ACCOUNT, 'acct_1', { asOf, rules: budgetRule });
  check('safety net: a composed recommendation that still rests on spend (REVIEW_BUDGET_PACING) is not written on unverified IQD spend, and the result says so', rNet.ok && rNet.recommendation === null && netDb.written.length === 0 && rNet.spendEvidence?.recommendationWithheld === true, [rNet, netDb.written]);
  check('…the same rule table on a USD account writes it (the net is not an unconditional ban)', rNetUsd.recommendation?.actionCode === 'REVIEW_BUDGET_PACING' && netUsd.written.length === 1, rNetUsd);

  const fatigueOnly = engineDb({ currency: 'IQD', issues: [IssueCode.AUDIENCE_FATIGUE, IssueCode.HIGH_FREQUENCY], evidence: uncleanEv });
  const rFatigue = await new RecommendationEngine(fatigueOnly.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  const fatigueUsd = engineDb({ currency: 'USD', issues: [IssueCode.AUDIENCE_FATIGUE, IssueCode.HIGH_FREQUENCY], evidence: uncleanEv });
  const rFatigueUsd = await new RecommendationEngine(fatigueUsd.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  check('creative fatigue by frequency/CTR on UNVERIFIED IQD spend: BROADEN_AUDIENCE (HIGH) is still produced, same action and priority as USD',
    rFatigue.recommendation?.actionCode === 'BROADEN_AUDIENCE' && rFatigue.recommendation.priority === rFatigueUsd.recommendation?.priority && same(rFatigue.recommendation.sourceIssues, rFatigueUsd.recommendation?.sourceIssues), [rFatigue.recommendation, rFatigueUsd.recommendation]);
  const lowCtr = engineDb({ currency: 'IQD', issues: [IssueCode.LOW_CTR], evidence: uncleanEv });
  const rLow = await new RecommendationEngine(lowCtr.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  check('LOW_CTR on unverified IQD spend: IMPROVE_HOOKS is still produced', rLow.recommendation?.actionCode === 'IMPROVE_HOOKS', rLow.recommendation);
  // knowledge-base path
  const costBreach = dailyRows.map((r) => ({ ...r, cpm: 9_000_000, ctr: 2.0, frequency: 1.2, spend: 9_000_000n, messages: 1n }));
  const kbUsd = engineDb({ currency: 'USD', issues: [], daily: costBreach, evidence: uncleanEv });
  const rKbUsd = await new RecommendationEngine(kbUsd.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  const kbIqd = engineDb({ currency: 'IQD', issues: [], daily: costBreach, evidence: uncleanEv });
  const rKbIqd = await new RecommendationEngine(kbIqd.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  check('precondition: on USD the cost metrics breach the knowledge base and produce a recommendation', (rKbUsd.recommendation?.details as any)?.source === 'meta_ads_knowledge_base', rKbUsd.recommendation);
  check('IQD, spend unverified: a recommendation owned by a cost-derived knowledge-base metric is NOT produced', rKbIqd.recommendation === null && (rKbIqd.spendEvidence?.withheldMetrics ?? []).includes('cpc'), [rKbIqd.recommendation, rKbIqd.spendEvidence]);
  const ctrBreach = dailyRows.map((r) => ({ ...r, cpm: 9_000_000, ctr: 0.05, frequency: 1.2, spend: 9_000_000n, messages: 1n }));
  const kbCtr = engineDb({ currency: 'IQD', issues: [], daily: ctrBreach, evidence: uncleanEv });
  const rKbCtr = await new RecommendationEngine(kbCtr.db).run(EntityType.ACCOUNT, 'acct_1', { asOf });
  check('…while a CTR breach on the same unverified window still yields its knowledge-base recommendation', (rKbCtr.recommendation?.details as any)?.source === 'meta_ads_knowledge_base' && (rKbCtr.recommendation?.details as any)?.metricBreaches?.every((b: any) => !S.SPEND_DERIVED_KB_METRICS.has(b.metricKey)), rKbCtr.recommendation);

  // RulesEngine (issues)
  const { RulesEngine } = await import('./src/engines/rules/RulesEngine');
  function rulesDb(currency: string, evidence: FakeOpts) {
    const ev = fakeDb({ currency, ...evidence });
    const issuesWritten: any[] = [];
    const db: any = {
      ...ev,
      metricTrend: { findFirst: async () => ({ date: new Date('2026-06-14'), ctrTrend: -0.33, cpmTrend: 0.3, frequencyTrend: 0.46, resultsTrend: -0.33, spendTrend: 0 }) },
      // frequency 5.4 > the 5.0 ceiling: HIGH_FREQUENCY fires (the engine-level fatigue story)
      dailyStat: { findMany: async () => dailyRows.map((r) => ({ ...r, spend: 13000n, frequency: 5.4 })) },
      campaign: { findFirst: ev.campaign.findFirst, findUnique: async () => null },
      adAccount: { findFirst: ev.adAccount.findFirst },
      detectedIssue: { deleteMany: () => ({}), createMany: ({ data }: any) => { issuesWritten.push(...data); return {}; } },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    return { db, issuesWritten };
  }
  const rUsdRules = rulesDb('USD', uncleanEv);
  const outUsd = await new RulesEngine(rUsdRules.db).run(EntityType.ACCOUNT, 'acct_1', { asOf, windowDays: 7, attributionLagDays: 2 });
  const rCleanRules = rulesDb('IQD', { account: [{ day: '2026-06-10', spend: 13000 }], raws: [{ day: '2026-06-10', spend: 13000 }] });
  const outClean = await new RulesEngine(rCleanRules.db).run(EntityType.ACCOUNT, 'acct_1', { asOf, windowDays: 7, attributionLagDays: 2 });
  const rGatedRules = rulesDb('IQD', uncleanEv);
  const outGated = await new RulesEngine(rGatedRules.db).run(EntityType.ACCOUNT, 'acct_1', { asOf, windowDays: 7, attributionLagDays: 2 });
  const codesOf = (r: any) => r.issues.map((i: any) => i.issueCode).sort();
  check('USD: RISING_COST_PER_RESULT fires (resultsTrend -0.33 vs spendTrend 0)', codesOf(outUsd).includes('RISING_COST_PER_RESULT'), codesOf(outUsd));
  check('IQD with a fully verified window: the very same issues, byte for byte', same(outClean.issues, outUsd.issues));
  check('IQD, spend NOT verified: RISING_COST_PER_RESULT is not detected…', outGated.ok && !codesOf(outGated).includes('RISING_COST_PER_RESULT'), codesOf(outGated));
  check('…while fatigue, high frequency and declining results — which do not rest on spend — still are', ['AUDIENCE_FATIGUE', 'HIGH_FREQUENCY', 'DECLINING_RESULTS'].every((c) => codesOf(outGated).includes(c)), codesOf(outGated));
  // Signals as the engine builds them — read through a probe detector, so this does not lean on the detector's own guard
  const probeOf = async (currency: string, evidence: FakeOpts) => {
    let seen: any = null;
    const probe = (sg: any) => { seen = sg; return null; };
    await new RulesEngine(rulesDb(currency, evidence).db).run(EntityType.ACCOUNT, 'acct_1', { asOf, windowDays: 7, attributionLagDays: 2, detectors: [probe] });
    return seen;
  };
  const sgUsd = await probeOf('USD', uncleanEv), sgClean = await probeOf('IQD', { account: [{ day: '2026-06-10', spend: 13000 }], raws: [{ day: '2026-06-10', spend: 13000 }] }), sgHeld = await probeOf('IQD', uncleanEv);
  check('Signals, non-IQD and verified IQD: spendTrend / cpmTrend / currentCpm are the real values and there is no spendWithheld key', sgUsd.spendTrend === 0 && sgUsd.cpmTrend === 0.3 && sgUsd.currentCpm === 5.2 && !('spendWithheld' in sgUsd) && same(sgClean, sgUsd), [sgUsd, sgClean]);
  check('Signals, unverified IQD: spendTrend, cpmTrend and currentCpm are ALL null, spendWithheld is stamped, and the non-spend signals are untouched',
    sgHeld.spendTrend === null && sgHeld.cpmTrend === null && sgHeld.currentCpm === null && sgHeld.spendWithheld === 'SPEND_SCALE_UNVERIFIED' && sgHeld.ctrTrend === sgUsd.ctrTrend && sgHeld.frequencyTrend === sgUsd.frequencyTrend && sgHeld.resultsTrend === sgUsd.resultsTrend && sgHeld.currentCtr === sgUsd.currentCtr && sgHeld.currentFrequency === sgUsd.currentFrequency, sgHeld);
  const { detectRisingCostPerResult } = await import('./src/engines/rules/detectRisingCostPerResult');
  const sig = { ctrTrend: null, cpmTrend: null, frequencyTrend: null, resultsTrend: -0.4, spendTrend: 0.1, currentCtr: null, currentFrequency: null, currentCpm: null, currentResults: 0, currentSpend: 0 };
  check('the detector itself declines when its Signals say spend is withheld (defence in depth)', detectRisingCostPerResult(sig as any) !== null && detectRisingCostPerResult({ ...sig, spendWithheld: 'SPEND_SCALE_UNVERIFIED' } as any) === null);

  // The Brain's period signals (loadCampaignSignalsBatch) — real windows, fake prisma
  const { loadCampaignSignalsBatch } = await import('./src/engines/rules/loadCampaignSignals');
  const sigAsOf = new Date('2026-06-14T12:00:00Z');
  const sigRows: any[] = [];
  for (let i = 2; i <= 15; i++) {
    const d = new Date(Date.UTC(2026, 5, 14) - i * 86_400_000);
    const prior = i >= 9;
    sigRows.push({ entityType: 'CAMPAIGN', entityId: 'c1', date: d, spend: prior ? 100_000n : 160_000n, messages: prior ? 20n : 10n, impressions: 25_000n, reach: 20_000n, clicks: 500n, linkClicks: 500n, ctr: prior ? 2.0 : 1.2, cpm: prior ? 4000 : 6400, frequency: prior ? 2.0 : 3.0, purchases: 0n, leads: 0n });
  }
  const sigPrisma: any = { dailyStat: { findMany: async () => sigRows }, campaign: { findMany: async () => [{ id: 'c1', objective: 'MESSAGES', messagingCtaAds: 0, adSets: [] }] } };
  const sigPlain = (await loadCampaignSignalsBatch(sigPrisma, ['c1'], { asOf: sigAsOf })).get('c1')!;
  const sigNull = (await loadCampaignSignalsBatch(sigPrisma, ['c1'], { asOf: sigAsOf, spendWithheld: null })).get('c1')!;
  const sigHeld = (await loadCampaignSignalsBatch(sigPrisma, ['c1'], { asOf: sigAsOf, spendWithheld: 'SPEND_SCALE_UNVERIFIED' })).get('c1')!;
  check('precondition: the fixture has real spend / CPM trends', sigPlain.spendTrend != null && sigPlain.cpmTrend != null && sigPlain.currentCpm != null, sigPlain);
  check('period signals: with no verdict (or a null one) the result is byte-identical to before', same(sigPlain, sigNull) && !('spendWithheld' in sigPlain));
  check('period signals: with a verdict, spendTrend / cpmTrend / currentCpm are null and spendWithheld is stamped — CTR, frequency and results trends are untouched', sigHeld.spendTrend === null && sigHeld.cpmTrend === null && sigHeld.currentCpm === null && sigHeld.spendWithheld === 'SPEND_SCALE_UNVERIFIED' && sigHeld.ctrTrend === sigPlain.ctrTrend && sigHeld.frequencyTrend === sigPlain.frequencyTrend && sigHeld.resultsTrend === sigPlain.resultsTrend && sigHeld.currentCtr === sigPlain.currentCtr && sigHeld.currentFrequency === sigPlain.currentFrequency, sigHeld);

  // ── 7. the Brain ─────────────────────────────────────────────────────
  console.log('\n── 7. the Brain: cost-based verdicts are withheld, the rest is untouched ──');
  const { runBrainForCampaign } = await import('./src/engine/AdlyticBrain');
  const baseline = { avgCostPerMessage: 5.0, avgCTR: 2.0, avgFrequency: 2.0, avgCPM: 10.0, avgCPC: 0.5, metadata: { campaignCount: 12, totalSpend: 1800, totalMessages: 360, totalImpressions: 180000, totalClicks: 3600 }, confidence: { score: 90, level: 'high' as const } };
  const fx = {
    beast: { campaignId: 'beast_01', campaignName: 'b', spend: 200, impressions: 10000, clicks: 300, ctr: 3.0, frequency: 1.5, messages: 50, cpm: 20.0, cpc: 0.667 },
    dying: { campaignId: 'dying_01', campaignName: 'd', spend: 100, impressions: 5000, clicks: 50, ctr: 1.0, frequency: 2.5, messages: 10, cpm: 20.0, cpc: 2.0 },
    noise: { campaignId: 'noise_01', campaignName: 'n', spend: 20, impressions: 5000, clicks: 25, ctr: 0.5, frequency: 2.0, messages: 2, cpm: 4.0, cpc: 0.8 },
    newborn: { campaignId: 'newborn_01', campaignName: 'w', spend: 15, impressions: 2000, clicks: 42, ctr: 2.1, frequency: 1.9, messages: 3, cpm: 7.5, cpc: 0.357 },
    phoenix: { campaignId: 'phoenix_01', campaignName: 'p', spend: 40, impressions: 4000, clicks: 92, ctr: 2.3, frequency: 2.5, messages: 10, cpm: 10.0, cpc: 0.434 },
    steady: { campaignId: 'steady_01', campaignName: 's', spend: 100, impressions: 5000, clicks: 100, ctr: 2.0, frequency: 2.0, messages: 20, cpm: 20.0, cpc: 1.0 },
  };
  const bleedV2: any = {
    marketBaseline: { recentAverageCPM: 20.0, recentAverageCPC: 1.0 },
    goldStandard: { bestHistoricalCpm: 18.0, bestHistoricalCtr: 2.2, bestHistoricalCostPerMessage: 4.5 },
    hourlyVelocity: { hoursActiveToday: 4, totalSpendToday: 50, totalMessagesToday: 0, dailyBudget: 100 },
    audienceBreakdowns: { topAgeGroup: '25-34', topGender: 'female', bestPlacement: 'instagram_reels', peakTimeWindow: '21:00-01:00' },
    visionContext: { productType: 'x', visualHook: 'SHORT_VIDEO' },
  };
  const WH = 'SPEND_SCALE_UNVERIFIED' as const;
  for (const [k, expected] of [['beast', 'SCALE_BUDGET'], ['dying', 'REFRESH_CREATIVE'], ['noise', 'PAUSE_CAMPAIGN'], ['phoenix', 'RESCUE_WATCH']] as const) {
    const plain = runBrainForCampaign(fx[k], baseline as any);
    const held = runBrainForCampaign(fx[k], baseline as any, undefined, { spendWithheld: WH });
    check(`${k}: ${expected} without evidence trouble…`, plain.decision.action === expected, plain.decision.action);
    check(`${k}: …is withheld on unverified spend — HOLD_AND_MONITOR, original kept in overriddenAction and spendEvidence, reason says why`,
      held.decision.action === 'HOLD_AND_MONITOR' && held.decision.overriddenAction === expected && held.decision.spendEvidence?.withheldAction === expected && held.decision.spendEvidence?.reason === WH && held.decision.reason.includes(WH), held.decision);
  }
  for (const k of ['steady', 'newborn'] as const) {
    const plain = runBrainForCampaign(fx[k], baseline as any);
    const held = runBrainForCampaign(fx[k], baseline as any, undefined, { spendWithheld: WH });
    check(`${k} (${plain.decision.action}) does not rest on spend: identical with or without the gate`, same(plain, held));
  }
  const bleedPlain = runBrainForCampaign(fx.steady, baseline as any, bleedV2);
  const bleedHeld = runBrainForCampaign(fx.steady, baseline as any, bleedV2, { spendWithheld: WH });
  check('the spend-velocity EMERGENCY_PAUSE is not issued on unverified spend either', bleedPlain.decision.action === 'EMERGENCY_PAUSE' && bleedHeld.decision.action === 'HOLD_AND_MONITOR' && bleedHeld.decision.spendEvidence?.withheldAction === 'EMERGENCY_PAUSE', [bleedPlain.decision.action, bleedHeld.decision]);
  check('REGRESSION: spendWithheld null / undefined / absent leave every result byte-identical', Object.values(fx).every((raw) => same(runBrainForCampaign(raw, baseline as any), runBrainForCampaign(raw, baseline as any, undefined, { spendWithheld: null })) && same(runBrainForCampaign(raw, baseline as any), runBrainForCampaign(raw, baseline as any, undefined, {}))));
  // grounding on frequency/CTR still works while the physics verdict is withheld
  const fatigueSignals: any = { ctrTrend: -0.28, cpmTrend: null, frequencyTrend: 0.46, resultsTrend: -0.33, spendTrend: null, currentCtr: 1.0, currentFrequency: 5.4, currentCpm: null, currentResults: 10, currentSpend: 100, spendWithheld: WH };
  const fat = runBrainForCampaign(fx.steady, baseline as any, undefined, { spendWithheld: WH, periodSignals: fatigueSignals });
  const fatPlain = runBrainForCampaign(fx.steady, baseline as any, undefined, { periodSignals: { ...fatigueSignals, spendWithheld: undefined } });
  check('creative fatigue (frequency up, CTR down, results down) still lifts HOLD → REFRESH_CREATIVE on withheld spend, same as without the gate', fat.decision.action === fatPlain.decision.action && fat.decision.action === 'REFRESH_CREATIVE', [fat.decision.action, fatPlain.decision.action]);
  const beastFat = runBrainForCampaign(fx.beast, baseline as any, undefined, { spendWithheld: WH, periodSignals: fatigueSignals });
  check('a SCALE_BUDGET that was withheld is NOT silently turned into a budget action by grounding (it is HOLD, or the spend-free fatigue refresh)', ['HOLD_AND_MONITOR', 'REFRESH_CREATIVE'].includes(beastFat.decision.action) && beastFat.decision.action !== 'SCALE_BUDGET', beastFat.decision);

  // ── 8. the AI agent ──────────────────────────────────────────────────
  console.log('\n── 8. the AI agent: a budget move or a pause is not saved on unverified spend ──');
  const { saveRecommendationHandler } = await import('./src/services/agent/tools/saveRecommendation');
  function aiDb(currency: string, evidence: FakeOpts) {
    const ev = fakeDb({ currency, ...evidence });
    const table: any[] = [];
    const db: any = {
      ...ev,
      recommendation: {
        findUnique: async () => null,
        upsert: async ({ create }: any) => { const r = { id: `rec_${table.length}`, ...create }; table.push(r); return r; },
      },
      campaign: { findFirst: ev.campaign.findFirst },
      adAccount: { findFirst: ev.adAccount.findFirst },
      workspaceMember: { findFirst: async () => ({ role: 'OWNER' }) },   // the tool's role gate (recommendation-write-auth) runs first
    };
    return { db, table };
  }
  const args = (actionCode: string) => ({ entityType: 'ACCOUNT' as const, entityId: 'acct_1', text: 'نص توصية طويل بما يكفي للتحقق', actionCode: actionCode as any, priority: 'HIGH' as const, reasoning: 'This is a sufficiently long AI reasoning string for validation.' });
  const ctx = (db: any) => ({ prisma: db, workspaceId: 'ws_1', userId: 'u_1' });
  const h = saveRecommendationHandler();
  const iqdBad = aiDb('IQD', { account: [{ day: iso(2), spend: 1000 }], raws: [] });
  const refused = await h.run(args('INCREASE_BUDGET'), ctx(iqdBad.db));
  check('IQD, unverified spend: INCREASE_BUDGET is refused (STALE_DATA, SPEND_SCALE_UNVERIFIED in the message) and nothing is stored', !refused.ok && (refused as any).error.code === 'STALE_DATA' && /SPEND_SCALE_UNVERIFIED/.test((refused as any).error.message) && iqdBad.table.length === 0, refused);
  const refusedPause = await h.run(args('PAUSE'), ctx(aiDb('IQD', { account: [{ day: iso(2), spend: 1000 }], raws: [] }).db));
  check('…and so is PAUSE', !refusedPause.ok);
  const kept = await h.run(args('REFRESH_CREATIVE'), ctx(iqdBad.db));
  check('…while REFRESH_CREATIVE (does not rest on spend) is saved as before', kept.ok && iqdBad.table.length === 1, kept);
  const iqdGood = aiDb('IQD', { account: [{ day: iso(2), spend: 1000 }], raws: [{ day: iso(2), spend: 1000 }] });
  check('IQD with verified spend: INCREASE_BUDGET is saved', (await h.run(args('INCREASE_BUDGET'), ctx(iqdGood.db))).ok && iqdGood.table.length === 1);
  const usdAi = aiDb('USD', { account: [{ day: iso(2), spend: 1000 }], raws: [] });
  check('USD: INCREASE_BUDGET is saved, and no evidence query is made', (await h.run(args('INCREASE_BUDGET'), ctx(usdAi.db))).ok && usdAi.table.length === 1 && usdAi.db.log.queries === 0, usdAi.db.log.queries);
  const brokenAi = aiDb('IQD', { throwOnQuery: true });
  check('evidence unreadable → the spend-dependent action is refused, not saved on a guess', !(await h.run(args('DECREASE_BUDGET'), ctx(brokenAi.db))).ok && brokenAi.table.length === 0);

  // ── 9. wiring ────────────────────────────────────────────────────────
  console.log('\n── 9. wiring: every producer and reader of spend-dependent advice goes through the gate ──');
  const server = code(read('src/api/server.ts'));
  const recRoute = /app\.get\('\/api\/workspaces\/:workspaceId\/recommendations'[\s\S]*?\n {2}\}\);/.exec(server)?.[0] ?? '';
  check('GET /recommendations partitions the stored rows by spend evidence and reports what it withheld',
    /partitionRecommendationsBySpendEvidence\(prisma,\s*permittedRecs\)/.test(recRoute) && /const recs = spendGate\.kept/.test(recRoute) && /X-Recommendations-Withheld/.test(recRoute) && /include'\]\s*===\s*'suppressed'/.test(recRoute) && /DATA_QUALITY_HEADER/.test(recRoute));
  const insightsRoute = /app\.get\('\/api\/workspaces\/:workspaceId\/insights'[\s\S]*?\n {2}\}\);/.exec(server)?.[0] ?? '';
  const campaignsRoute = /app\.get\('\/api\/workspaces\/:workspaceId\/campaigns'[\s\S]*?\n {2}\}\);/.exec(server)?.[0] ?? '';
  check('the period reads /insights and /campaigns carry the data-quality header for the requested range', /spendScaleFlagFailClosed\(prisma,\s*account,\s*sinceDate,\s*null\)/.test(insightsRoute) && /spendScaleFlagFailClosed\(prisma,\s*account,\s*sinceDate,\s*null,\s*'CAMPAIGN'\)/.test(campaignsRoute) && /DATA_QUALITY_HEADER/.test(insightsRoute) && /DATA_QUALITY_HEADER/.test(campaignsRoute));
  const dash = code(read('src/services/getDashboard.ts'));
  check('getDashboard evaluates the window and gates priorityAction, issues, KB metrics, diagnose signals, drain, forecast, bleed alert and steady-state',
    /evaluateSpendWindow\(prisma,\s*account,\s*sinceDate,\s*null,\s*'ACCOUNT'\)/.test(dash) && /partitionRecommendationsBySpendEvidence/.test(dash) && /isSpendDependentIssueCode/.test(dash) && /withholdSpendDerivedMetrics/.test(dash)
      && /drainRaw && !spendGated/.test(dash) && /forecastRaw\.daysLeft > 0 && !spendGated/.test(dash) && /bleedRaw && !spendGated/.test(dash) && /spendWithheld: spendReason/.test(dash) && /roas: spendGated \? null/.test(dash) && /cpm: spendGated \? null : cpmWindow/.test(dash) && /totalMsgs > 0 && !spendGated/.test(dash) && /kbMetrics: CampaignMetrics = spendGated \? withholdSpendDerivedMetrics\(kbMetricsAll\)/.test(dash));
  const brainWorker = code(read('src/workers/runBrainOrchestrator.ts'));
  check('the Brain orchestrator evaluates the CAMPAIGN-level window and passes the verdict to the period signals AND to the Brain',
    /evaluateSpendWindow\([^)]*'CAMPAIGN'\)/.test(brainWorker) && /\{ asOf: now, spendWithheld \}/.test(brainWorker) && /periodSignals: periodSignalsByCampaign\.get\(campaign\.id\) \?\? null, spendWithheld/.test(brainWorker));
  const recEngine = code(read('src/engines/recommendation/RecommendationEngine.ts'));
  check('RecommendationEngine evaluates the window, drops spend-dependent issues and metrics before composition, and re-checks the result',
    /evaluateEntityWindow\(this\.prisma,\s*entityType,\s*entityId,\s*asOf,\s*EVIDENCE_WINDOWS\.engine\)/.test(recEngine) && /isSpendDependentIssueCode/.test(recEngine) && /withholdSpendDerivedMetrics/.test(recEngine) && /spendDependenceOfRecommendation/.test(recEngine));
  const rulesEngine = code(read('src/engines/rules/RulesEngine.ts'));
  check('RulesEngine nulls spendTrend / cpmTrend / currentCpm and stamps spendWithheld', /spendTrend: spendWithheld \? null/.test(rulesEngine) && /cpmTrend: spendWithheld \? null/.test(rulesEngine) && /currentCpm: spendWithheld \? null/.test(rulesEngine) && /spendWithheld \? \{ spendWithheld \}/.test(rulesEngine));
  const v5 = code(read('src/engines/intelligence/AdlyticIntelligenceSystem.ts'));
  check('the V5 shadow engine skips its rising-cost rule and spend-derived KB metrics', /spendWithheld \? null : ruleRisingCostPerResult/.test(v5) && /withholdSpendDerivedMetrics\(buildCampaignMetrics/.test(v5));
  const ai = code(read('src/services/agent/tools/saveRecommendation.ts'));
  check('save_recommendation refuses spend-dependent codes on unverified spend', /isSpendDependentActionCode\(args\.actionCode\)/.test(ai) && /SPEND_SCALE_UNVERIFIED/.test(ai));
  const monitor = code(read('src/services/dataIntegrityMonitor.ts'));
  check('data-health: the spendScale report carries the periods (listSpendPeriods) next to the old keys', /listSpendPeriods\(prisma,\s*account\.id\)/.test(monitor) && /\.\.\.periods/.test(monitor) && /window: \{ days: windowDays/.test(monitor) && /history: \{ accountRows/.test(monitor));
  check('the existing WARN/CRITICAL checks are unchanged in code and severity', /code: 'SPEND_SCALE_OVERSCALED',\s*severity: 'CRITICAL'/.test(monitor) && /code: 'SPEND_SCALE_UNVERIFIED',\s*severity: 'WARN'/.test(monitor));


  // ── 10. second review round: the paths the first gate missed (SE-1, SE-2, SE-4, SE-5, SE-6) ─────────────
  console.log('\n── 10. review round 2: aiRecommendations, weekly report, prior window, the visible reason, fail-closed reads ──');
  const SX: any = S;
  const REASON = 'SPEND_SCALE_UNVERIFIED';

  // SE-6 — an unreadable evidence read flags the range; it never throws into a data endpoint
  const failClosed: undefined | ((...a: any[]) => Promise<any>) = SX.spendScaleFlagFailClosed;
  check('SE-6: spendScaleFlagFailClosed exists', typeof failClosed === 'function');
  if (typeof failClosed === 'function') {
    const broken = fakeDb({ currency: 'IQD', throwOnQuery: true });
    const origErr = console.error; console.error = () => {};
    let threw = false; let fc: any = null;
    try { fc = await failClosed(broken, { id: 'acct_1', currency: 'IQD' }, iso(10), null, 'CAMPAIGN'); } catch { threw = true; } finally { console.error = origErr; }
    check('SE-6: IQD, evidence unreadable → no throw, an `unreadable` SPEND_SCALE_UNVERIFIED flag at the asked level', !threw && fc?.code === REASON && fc.unreadable === true && fc.level === 'CAMPAIGN' && /could not be read/.test(fc.message) && /تعذّرت/.test(fc.messageAr), [threw, fc]);
    const usdBroken = fakeDb({ currency: 'USD', throwOnQuery: true });
    check('SE-6: USD → null, and not one query was made (an unreadable table cannot matter to it)', (await failClosed(usdBroken, { id: 'acct_1', currency: 'USD' }, iso(10), null)) === null && usdBroken.log.queries === 0);
    const okVer = fakeDb({ currency: 'IQD', account: [{ day: iso(3), spend: 1000 }], raws: [{ day: iso(3), spend: 1000 }] });
    const okBad = fakeDb({ currency: 'IQD', account: [{ day: iso(3), spend: 1000 }], raws: [] });
    check('SE-6: a readable window behaves exactly like spendScaleFlagForRange (clean → null; unverified → the normal flag, not `unreadable`)',
      (await failClosed(okVer, { id: 'acct_1', currency: 'IQD' }, iso(10), null)) === null
      && same(await failClosed(okBad, { id: 'acct_1', currency: 'IQD' }, iso(10), null), await S.spendScaleFlagForRange(okBad, { id: 'acct_1', currency: 'IQD' }, iso(10), null)));
  }
  const server2 = code(read('src/api/server.ts'));
  const insights2 = /app\.get\('\/api\/workspaces\/:workspaceId\/insights'[\s\S]*?\n {2}\}\);/.exec(server2)?.[0] ?? '';
  const campaigns2 = /app\.get\('\/api\/workspaces\/:workspaceId\/campaigns'[\s\S]*?\n {2}\}\);/.exec(server2)?.[0] ?? '';
  check('SE-6: /insights and /campaigns read the evidence through the fail-closed helper — no bare `await spendScaleFlagForRange` left in server.ts',
    /await spendScaleFlagFailClosed\(/.test(insights2) && /await spendScaleFlagFailClosed\(/.test(campaigns2) && !/spendScaleFlagForRange/.test(server2), [/spendScaleFlagForRange/.test(server2)]);

  // SE-5a — GET /recommendations judges the account window itself, whatever is stored
  const recRoute2 = /app\.get\('\/api\/workspaces\/:workspaceId\/recommendations'[\s\S]*?\n {2}\}\);/.exec(server2)?.[0] ?? '';
  check('SE-5: GET /recommendations evaluates the account window (30-day ACCOUNT, fail closed) and sets X-Data-Quality + the count from it — not only from rows it suppressed',
    /spendScaleFlagFailClosed\(prisma,\s*account,\s*accountLocalDateFloor\(account\.timezone,\s*30\),\s*null,\s*'ACCOUNT'\)/.test(recRoute2) && /windowFlag/.test(recRoute2) && /dataQualityCodes\.length > 0/.test(recRoute2) && /X-Recommendations-Withheld/.test(recRoute2) && /flags: windowFlag/.test(recRoute2), recRoute2.slice(-900));

  // SE-4 — the prior window's flag (pure)
  const priorW = S.summarizeWindow([{ day: iso(40), account: 'UNVERIFIED', accountSpend: 1, campaignSpend: 0, campaignRows: 0 }, { day: iso(41), account: 'VERIFIED', accountSpend: 1, campaignSpend: 0, campaignRows: 0 }], 'ACCOUNT', iso(60), iso(31));
  const priorFlag = S.flagFromWindow(priorW, { prior: true });
  const curFlag = S.flagFromWindow(priorW);
  check('SE-4: a prior-window flag carries the same code, is marked window: "prior", says "prior window" / الفترة السابقة, and lists its unverified period',
    priorFlag?.code === REASON && priorFlag.window === 'prior' && /^prior window:/.test(priorFlag.message) && /^الفترة السابقة/.test(priorFlag.messageAr) && same(priorFlag.periods, [{ from: iso(40), to: iso(40), rows: 1 }]), priorFlag);
  check('SE-4: the current-window flag is untouched — no `window` key, the same text as before', curFlag && !('window' in curFlag) && curFlag.message.endsWith('spend-based advice for this period is withheld'), curFlag);

  // SE-1 — aiRecommendations (fake prisma: it reads Brain snapshots only)
  const { computeAIRecommendations, snapshotSpendWithheld } = await import('./src/services/aiRecommendations');
  const snap = (id: string, name: string, pattern: string, action: string, score: number, priority = 'NORMAL', payload: any = {}, daysOld = 0) =>
    ({ campaignId: id, action, priority, patternSignature: pattern, finalScore: score, payload: { campaignName: name, ...payload }, tickDate: new Date(Date.now() - daysOld * 86_400_000) });
  const aiSnaps = [
    snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'SCALE_BUDGET', 81, 'HIGH'),
    snap('c_dying', 'Dying', 'DYING_CREATIVE', 'REFRESH_CREATIVE', 30, 'CRITICAL'),
    snap('c_noise', 'Noise', 'UNSTABLE_NOISE', 'KEEP_COLLECTING', 40),
    snap('c_stable', 'Stable', 'STABLE_PERFORMER', 'HOLD_AND_MONITOR', 75),
    snap('c_new', 'Newborn', 'UNDER_OBSERVATION', 'KEEP_COLLECTING', 10),
  ];
  const aiFake = (snaps: any[]) => ({ campaignBrainSnapshot: { findMany: async () => snaps } }) as any;
  const stripAt = (o: any) => { const c = { ...o }; delete c.generatedAt; return c; };
  const aiPlain = await computeAIRecommendations(aiFake(aiSnaps), 'ws_1');
  const aiNull = await (computeAIRecommendations as any)(aiFake(aiSnaps), 'ws_1', { spendWithheld: null });
  check('SE-1 baseline: with no verdict the cards are the five, scale and fix/pause among them, and there is NO spendWithheld key', aiPlain.recommendations.map((r) => r.id).join() === 'det-scale,det-dying,det-unstable,det-stable,det-collecting' && !('spendWithheld' in aiPlain), aiPlain.recommendations.map((r) => r.id));
  check('SE-1: a null verdict is byte-identical to no verdict at all', same(stripAt(aiPlain), stripAt(aiNull)));
  const aiGated: any = await (computeAIRecommendations as any)(aiFake(aiSnaps), 'ws_1', { spendWithheld: REASON });
  check('SE-1: on an unverified window the scale card and the pause / creative-refresh card are NOT emitted — no budget advice, no `scale` / `pause` / `fix` category left',
    aiGated.recommendations.map((r: any) => r.id).join() === 'det-unstable,det-stable,det-collecting' && !aiGated.recommendations.some((r: any) => ['scale', 'pause', 'fix'].includes(r.category)) && !JSON.stringify(aiGated).includes('زِد ميزانيتها'), aiGated.recommendations.map((r: any) => r.id));
  check('SE-1: …and the DTO says what it left out and why (spendWithheld: reason + the card ids), source deterministic', aiGated.spendWithheld?.reason === REASON && same(aiGated.spendWithheld.ids, ['det-scale', 'det-dying']) && aiGated.source === 'deterministic', aiGated.spendWithheld);
  const aiOver: any = await (computeAIRecommendations as any)(aiFake(aiSnaps), 'ws_1', { spendWithheld: 'SPEND_SCALE_OVERSCALED' });
  check('SE-1: the reason follows the verdict (OVERSCALED outranks nothing here, it is passed through)', aiOver.spendWithheld?.reason === 'SPEND_SCALE_OVERSCALED');
  // a verdict the Brain itself withheld for ONE campaign (its CAMPAIGN-level window) — read from the stored decision
  const heldPayload = { decision: { spendEvidence: { withheld: true, reason: REASON, withheldAction: 'SCALE_BUDGET' } } };
  const perCamp = [snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'HOLD_AND_MONITOR', 81, 'NORMAL', heldPayload), snap('c_beast2', 'Beast2', 'SCALABLE_BEAST', 'SCALE_BUDGET', 82, 'HIGH'), snap('c_stable', 'Stable', 'STABLE_PERFORMER', 'HOLD_AND_MONITOR', 75)];
  const aiPer: any = await (computeAIRecommendations as any)(aiFake(perCamp), 'ws_1', { spendWithheld: null });
  const scaleCard = aiPer.recommendations.find((r: any) => r.id === 'det-scale');
  check('SE-1: a campaign whose stored Brain decision was withheld for spend is left out of the scale card by itself — the other beast stays', same(scaleCard?.campaignIds, ['c_beast2']) && aiPer.spendWithheld?.reason === REASON && same(aiPer.spendWithheld.ids, ['det-scale']), [scaleCard, aiPer.spendWithheld]);
  // only the LATEST tick of a campaign counts: an older withheld tick next to a newer clean one (the window was repaired) is not a verdict
  const staleHeld = [snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'HOLD_AND_MONITOR', 81, 'NORMAL', heldPayload, 3), snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'SCALE_BUDGET', 82, 'HIGH', {}, 0)];
  const aiStale: any = await (computeAIRecommendations as any)(aiFake(staleHeld), 'ws_1', { spendWithheld: null });
  // the reason of a per-campaign verdict follows what the Brain stored; over-scale outranks unverified when both occur
  const overPayload = { decision: { spendEvidence: { withheld: true, reason: 'SPEND_SCALE_OVERSCALED', withheldAction: 'SCALE_BUDGET' } } };
  const aiPerOver: any = await (computeAIRecommendations as any)(aiFake([snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'HOLD_AND_MONITOR', 81, 'NORMAL', overPayload)]), 'ws_1', { spendWithheld: null });
  const aiPerMixed: any = await (computeAIRecommendations as any)(aiFake([snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'HOLD_AND_MONITOR', 81, 'NORMAL', overPayload), snap('c_beast2', 'Beast2', 'SCALABLE_BEAST', 'HOLD_AND_MONITOR', 80, 'NORMAL', heldPayload)]), 'ws_1', { spendWithheld: null });
  check('SE-1: a per-campaign withheld verdict keeps its own reason (OVERSCALED), and OVERSCALED outranks UNVERIFIED when both occur',
    typeof snapshotSpendWithheld === 'function' && snapshotSpendWithheld(overPayload) === 'SPEND_SCALE_OVERSCALED' && aiPerOver.spendWithheld?.reason === 'SPEND_SCALE_OVERSCALED' && aiPerMixed.spendWithheld?.reason === 'SPEND_SCALE_OVERSCALED', [aiPerOver.spendWithheld, aiPerMixed.spendWithheld]);
  const newerHeld = [snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'SCALE_BUDGET', 82, 'HIGH', {}, 3), snap('c_beast', 'Beast', 'SCALABLE_BEAST', 'HOLD_AND_MONITOR', 81, 'NORMAL', heldPayload, 0)];
  const aiNewerHeld: any = await (computeAIRecommendations as any)(aiFake(newerHeld), 'ws_1', { spendWithheld: null });
  check('SE-1: a withheld OLDER snapshot does not hide the scale card when the campaign\'s LATEST snapshot is clean…', aiStale.recommendations.some((r: any) => r.id === 'det-scale') && !('spendWithheld' in aiStale), aiStale);
  check('SE-1: …and a withheld LATEST snapshot does, whatever an older clean one said', !aiNewerHeld.recommendations.some((r: any) => r.id === 'det-scale') && aiNewerHeld.spendWithheld?.ids?.includes('det-scale'), aiNewerHeld);
  check('SE-1: snapshotSpendWithheld reads payload.decision.spendEvidence and nothing else', typeof snapshotSpendWithheld === 'function' && snapshotSpendWithheld(heldPayload) === REASON && snapshotSpendWithheld({}) === null && snapshotSpendWithheld(null) === null && snapshotSpendWithheld({ decision: { spendEvidence: { withheld: false } } }) === null);
  const aiClean: any = await (computeAIRecommendations as any)(aiFake([aiSnaps[3]!, aiSnaps[4]!]), 'ws_1', { spendWithheld: REASON });
  check('SE-1: nothing to withhold (no scale / dying campaign) → the DTO carries no spendWithheld key even when gated', !('spendWithheld' in aiClean) && aiClean.recommendations.length === 2, aiClean);

  // The AI narrative is not used on an unverified window: a stubbed provider proves it (no network). The provider
  // adapter caches its client (and so the fetch it was built with), so ONE stub serves the whole section and the key
  // is set only inside `withProvider` — outside it isAIAvailable() is false and nothing reaches the stub.
  const realFetch = globalThis.fetch; const realKeys = [process.env['ANTHROPIC_API_KEY'], process.env['OPENAI_API_KEY']];
  let providerCalls = 0;
  (globalThis as any).fetch = async (_url: unknown, init: any) => {
    providerCalls++;
    const system = JSON.stringify(JSON.parse(String(init?.body ?? '{}')).system ?? '');
    const text = /weekly performance summary/.test(system)
      ? JSON.stringify({ summaryAr: 'ملخص ذكي', recommendationsAr: ['زِد ميزانية Alpha'] })
      : JSON.stringify([{ priority: 'high', category: 'scale', titleAr: 'زيادة', bodyAr: 'زِد ميزانية Beast', campaignNames: ['Beast'] }]);
    return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const withProvider = async <T,>(fn: () => Promise<T>): Promise<T> => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-not-real'; delete process.env['OPENAI_API_KEY'];
    try { return await fn(); } finally {
      if (realKeys[0] === undefined) delete process.env['ANTHROPIC_API_KEY']; else process.env['ANTHROPIC_API_KEY'] = realKeys[0];
      if (realKeys[1] === undefined) delete process.env['OPENAI_API_KEY']; else process.env['OPENAI_API_KEY'] = realKeys[1];
    }
  };
  const aiAvail: any = await withProvider(() => computeAIRecommendations(aiFake(aiSnaps), 'ws_1'));
  const callsAfterControl = providerCalls;
  const aiGatedWithKey: any = await withProvider(() => (computeAIRecommendations as any)(aiFake(aiSnaps), 'ws_1', { spendWithheld: REASON }));
  check('SE-1 control: with a provider configured and a verified window the AI narrative IS used (source ai, one provider call) — so the next check proves something', aiAvail?.source === 'ai' && callsAfterControl === 1, [aiAvail?.source, callsAfterControl]);
  check('SE-1: …and on an unverified window the provider is NOT called at all and the scale card the model would have written is not there', providerCalls === callsAfterControl && aiGatedWithKey?.source === 'deterministic' && !aiGatedWithKey.recommendations.some((r: any) => r.category === 'scale'), [providerCalls, callsAfterControl, aiGatedWithKey?.source]);

  // SE-2 — the weekly report (fake prisma: the 7+7 day window, CAMPAIGN rows)
  const { generateWeeklyReport } = await import('./src/services/weeklyReport');
  const localMidnight = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; };
  const dayOf = (n: number) => localMidnight(n).toISOString().slice(0, 10);
  const campRows = (n: number, id: string) => ({ entityId: id, date: localMidnight(n), spend: n <= 7 ? 100_000n : 50_000n, impressions: 10_000n, clicks: id === 'c_a' ? 400n : 100n, messages: n <= 7 ? 10n : 30n, purchases: 0n, leads: 0n, frequency: 2 });
  const wkStats = Array.from({ length: 14 }, (_, i) => i + 1).flatMap((n) => [campRows(n, 'c_a'), campRows(n, 'c_b')]);
  const wkSnaps = [
    { campaignId: 'c_a', action: 'SCALE_BUDGET', priority: 'HIGH', patternSignature: 'SCALABLE_BEAST', finalScore: 81, payload: {} },
    { campaignId: 'c_b', action: 'PAUSE_CAMPAIGN', priority: 'CRITICAL', patternSignature: 'UNSTABLE_NOISE', finalScore: 30, payload: {} },
  ];
  function weeklyDb(currency: string, ev: { raw: (n: number) => boolean; throwOnQuery?: boolean }) {
    const days = Array.from({ length: 14 }, (_, i) => i + 1);
    const evidence = fakeDb({
      currency,
      throwOnQuery: ev.throwOnQuery,
      account: days.map((n) => ({ day: dayOf(n), spend: n <= 7 ? 200_000 : 100_000 })),
      raws: days.filter(ev.raw).map((n) => ({ day: dayOf(n), spend: n <= 7 ? 200_000 : 100_000 })),
      campaigns: days.map((n) => ({ day: dayOf(n), total: n <= 7 ? 200_000 : 100_000, n: 2 })),
    });
    const db: any = {
      ...evidence,
      adAccount: { findFirst: async () => ({ id: 'acct_1', currency, currencyMinorFactor: 1 }) },
      campaign: { findMany: async () => [
        { id: 'c_a', name: 'Alpha', status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT', messagingCtaAds: 0, adSets: [{ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }] },
        { id: 'c_b', name: 'Beta', status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT', messagingCtaAds: 0, adSets: [{ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }] },
      ] },
      dailyStat: {
        findMany: async ({ where }: any) => wkStats.filter((r) => {
          const d = where.date ?? {};
          return (!d.gte || r.date >= d.gte) && (!d.lt || r.date < d.lt) && (!d.lte || r.date <= d.lte);
        }),
      },
      campaignBrainSnapshot: { findMany: async () => wkSnaps },
    };
    return db;
  }
  const noise = console.warn; console.warn = () => {};
  const wkUsd = await generateWeeklyReport(weeklyDb('USD', { raw: () => false }), 'ws_1');
  const wkVer = await generateWeeklyReport(weeklyDb('IQD', { raw: () => true }), 'ws_1');
  const unverDb = weeklyDb('IQD', { raw: (n) => n !== 3 && n !== 10 });
  const wkBad: any = await generateWeeklyReport(unverDb, 'ws_1');
  const wkBroken: any = await generateWeeklyReport(weeklyDb('IQD', { raw: () => true, throwOnQuery: true }), 'ws_1');
  console.warn = noise;
  const pick = (r: any) => r && ({ recommendationsAr: r.recommendationsAr, delta: r.delta, best: r.bestCampaign, worst: r.worstCampaign, brain: r.brainActions, source: r.source });
  check('SE-2 baseline (USD): the report advises a budget increase for the best CTR campaign and a pause for the worst, shows both cost deltas, and has no dataQuality key',
    wkUsd != null && wkUsd.recommendationsAr.some((x) => x.includes('فكّر بزيادة ميزانيتها')) && wkUsd.recommendationsAr.some((x) => x.includes('أوقفها مؤقتاً')) && wkUsd.delta.spendPct === 100 && wkUsd.delta.costPerResultPct != null && wkUsd.bestCampaign?.pattern === 'SCALABLE_BEAST' && wkUsd.bestCampaign.healthScore === 81 && !('dataQuality' in wkUsd), wkUsd && pick(wkUsd));
  check('SE-2: a FULLY VERIFIED IQD window gives the very same advice, deltas, highlights and Brain counts as the USD twin, and no dataQuality key', wkVer != null && same(pick(wkVer), pick(wkUsd)) && !('dataQuality' in wkVer), [wkVer && pick(wkVer), wkUsd && pick(wkUsd)]);
  check('SE-2: an UNVERIFIED window (two days without raw evidence) carries dataQuality: SPEND_SCALE_UNVERIFIED at CAMPAIGN level over exactly the 7+7 days, with the periods',
    wkBad?.dataQuality?.flags?.length === 1 && wkBad.dataQuality.flags[0].code === REASON && wkBad.dataQuality.flags[0].level === 'CAMPAIGN' && wkBad.dataQuality.flags[0].from === dayOf(14) && wkBad.dataQuality.flags[0].to === dayOf(1) && wkBad.dataQuality.flags[0].rows === 2 && wkBad.dataQuality.flags[0].of === 14 && wkBad.dataQuality.flags[0].periods.length === 2, wkBad?.dataQuality);
  const recsBad: string[] = wkBad?.recommendationsAr ?? [];
  check('SE-2: …no budget-increase advice and no pause advice remains in recommendationsAr (the strings the old code produced are gone)',
    wkBad != null && !recsBad.some((x) => x.includes('فكّر بزيادة ميزانيتها') || x.includes('أوقفها') || x.includes('لحماية الميزانية')) && !/ميزانية|زيادة/.test(recsBad.filter((x) => !x.includes('محجوبة')).join(' ')), recsBad);
  check('SE-2: …what does not rest on spend is KEPT: the creative-refresh line for the weakest-CTR campaign and the results-dropped line',
    recsBad.some((x) => x.includes('«Beta»') && x.includes('جدّد إبداعها')) && recsBad.some((x) => x.includes('انخفضت النتائج')), recsBad);
  check('SE-2: …and the report says it withheld the spend-based advice (a line in recommendationsAr naming the reason)', recsBad.some((x) => x.includes('محجوبة') && x.includes('لم يُتحقق منه')), recsBad);
  check('SE-2: the spend and cost-per-result CHANGES are withheld (null), the results and CTR changes are not; the absolute figures are shown as stored',
    wkBad?.delta.spendPct === null && wkBad.delta.costPerResultPct === null && wkBad.delta.resultsPct === wkUsd?.delta.resultsPct && wkBad.delta.ctrPct === wkUsd?.delta.ctrPct && wkBad.thisWeek.spendDisplay === wkVer?.thisWeek.spendDisplay && wkBad.thisWeek.costPerResult === wkVer?.thisWeek.costPerResult, [wkBad?.delta, wkUsd?.delta]);
  check('SE-2: the cost-blended Brain fields of the highlights (pattern, healthScore) are withheld, and so is a spend-dependent verdict (SCALE_BUDGET / PAUSE_CAMPAIGN left over from before the gate); the CTR ranking itself is unchanged',
    wkBad?.bestCampaign?.campaignName === 'Alpha' && wkBad.bestCampaign.pattern === null && wkBad.bestCampaign.healthScore === null && wkBad.bestCampaign.action === null && wkBad.worstCampaign?.campaignName === 'Beta' && wkBad.worstCampaign.action === null && wkBad.bestCampaign.ctr === wkUsd?.bestCampaign?.ctr, [wkBad?.bestCampaign, wkBad?.worstCampaign]);
  check('SE-2: every withheld part is named in dataQuality.withheld, each with the reason', ['recommendations', 'delta', 'summary', 'campaignHighlights'].every((sf) => wkBad?.dataQuality?.withheld?.some((w: any) => w.surface === sf && w.reason === REASON)), wkBad?.dataQuality?.withheld);
  check('SE-2: the spend-trend sentence ("بزيادة في الإنفاق…") is not in the summary of the unverified report, and is in the verified one', wkVer != null && wkVer.summaryAr.includes('بزيادة في الإنفاق') && wkBad != null && !wkBad.summaryAr.includes('الإنفاق مقارنة'), [wkVer?.summaryAr, wkBad?.summaryAr]);
  check('SE-2: evidence UNREADABLE → the report is still served, treated as unverified (fail closed on the advice, open on the data), the flag says it could not be read',
    wkBroken?.dataQuality?.flags?.[0]?.unreadable === true && wkBroken.dataQuality.flags[0].code === REASON && wkBroken.thisWeek.spend === wkVer?.thisWeek.spend && !wkBroken.recommendationsAr.some((x: string) => x.includes('فكّر بزيادة ميزانيتها')), wkBroken?.dataQuality);
  check('SE-2: USD makes no evidence query at all', (weeklyDb('USD', { raw: () => false }) as any).log.queries === 0);
  // the AI narrative gets the spend figures: not used when unverified (the same stubbed provider)
  providerCalls = 0;
  const wkAiVer: any = await withProvider(() => generateWeeklyReport(weeklyDb('IQD', { raw: () => true }), 'ws_1'));
  const wkAiCallsAfterVer = providerCalls;
  const wkAiBad: any = await withProvider(() => generateWeeklyReport(unverDb, 'ws_1'));
  const wkAiCalls = providerCalls;
  (globalThis as any).fetch = realFetch;
  check('SE-2 control: a verified window with a provider configured uses the AI narrative (one call); an unverified one does NOT call it and is deterministic', wkAiVer?.source === 'ai' && wkAiCallsAfterVer === 1 && wkAiCalls === 1 && wkAiBad?.source === 'deterministic' && !wkAiBad.recommendationsAr.some((x: string) => x.includes('زِد ميزانية')), [wkAiVer?.source, wkAiCalls, wkAiBad?.source]);

  // wiring: the dashboard, the weekly route, the prior window
  const dash2 = code(read('src/services/getDashboard.ts'));
  check('SE-1/SE-2: getDashboard hands the verdict to computeAIRecommendations and lists the cards / report parts it withheld in dataQuality.withheld',
    /computeAIRecommendations\(prisma,\s*ws\.id,\s*\{\s*spendWithheld:\s*spendGated \? spendReason : null\s*\}\)/.test(dash2) && /surface: "aiRecommendations"/.test(dash2) && /surface: "weeklyReport"/.test(dash2) && /"aiRecommendations" \| "weeklyReport"/.test(dash2), []);
  check('SE-4: getDashboard evaluates the PRIOR window (priorSinceDate → the day before sinceDate, ACCOUNT) and puts its flag, marked prior, into dataQuality — without gating anything on it',
    /evaluateSpendWindow\(prisma,\s*account,\s*priorSinceDate,\s*addDaysIso\(isoDay\(sinceDate\),\s*-1\),\s*'ACCOUNT'\)/.test(dash2) && /flagFromWindow\(priorSpendWindow,\s*\{\s*prior:\s*true\s*\}\)/.test(dash2) && !/spendGated\s*=\s*[^;]*priorSpendWindow/.test(dash2), []);
  const wkRoute = /app\.get\('\/api\/weekly-report\/:workspaceId'[\s\S]*?\n {2}\}\);/.exec(server2)?.[0] ?? '';
  check('SE-2: GET /api/weekly-report/:ws sets X-Data-Quality from the report\'s own dataQuality', /report\.dataQuality/.test(wkRoute) && /DATA_QUALITY_HEADER/.test(wkRoute), wkRoute);
  const wkSrc = code(read('src/services/weeklyReport.ts'));
  check('SE-2: the weekly report evaluates the 7+7 day window at CAMPAIGN level, treats an unreadable read as unverified, and skips the AI narrative when gated',
    /evaluateSpendWindow\(prisma,\s*account,\s*evidenceFrom,\s*evidenceTo,\s*'CAMPAIGN'\)/.test(wkSrc) && /unreadableWindow\(/.test(wkSrc) && /isAIAvailable\(\) && !spendGated/.test(wkSrc), []);

  // SE-5b — the visible reason: both pages render dataQuality (the function is lifted out of the page source and RUN)
  const pageOf = (rel: string) => read(rel);
  const dashPage = pageOf('src/web/pages/dashboardPage.ts');
  const recPage = pageOf('src/web/pages/recommendationsPage.ts');
  function lift(src: string, name: string): string | null {
    const at = src.indexOf(`function ${name}(`);
    if (at < 0) return null;
    let depth = 0; let started = false;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
      if (src[i] === '{') { depth++; started = true; } else if (src[i] === '}') { depth--; if (started && depth === 0) return src.slice(at, i + 1); }
    }
    return null;
  }
  const esc = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function runBanner(src: string, locale: 'AR' | 'EN', payload: any) {
    const fn = lift(src, 'renderDataQualityBanner');
    if (!fn) return null;
    const box: any = { style: { display: 'none' }, innerHTML: '' };
    const doc = { getElementById: (id: string) => (id === 'data-quality-banner' ? box : null) };
    // eslint-disable-next-line no-new-func
    new Function('document', 'escHtml', 'lbl', `${fn}; renderDataQualityBanner(${JSON.stringify(payload)});`)(doc, esc, (en: string, ar: string) => (locale === 'AR' ? ar : en));
    return box as { style: { display: string }; innerHTML: string };
  }
  for (const [label, src] of [['dashboard', dashPage], ['recommendations', recPage]] as const) {
    check(`SE-5: the ${label} page has the banner element and calls renderDataQualityBanner on the payload it already loads`,
      /id="data-quality-banner"/.test(src) && /(?<!function )renderDataQualityBanner\(dashData\)/.test(src) && lift(src, 'renderDataQualityBanner') !== null, []);
    const hostile = { dataQuality: { flags: [{ code: REASON, message: 'EN <img src=x onerror=alert(1)>', messageAr: '٤ أيام <script>alert(1)</script> غير موثَّقة', window: undefined }], withheld: [{ surface: 'priorityAction', reason: REASON }] } };
    const shown = runBanner(src, 'AR', hostile);
    check(`SE-5: the ${label} banner shows the server's Arabic text, ESCAPED, when dataQuality is present`, !!shown && shown.style.display === 'flex' && shown.innerHTML.includes('٤ أيام') && !shown.innerHTML.includes('<script') && !shown.innerHTML.includes('<img') && shown.innerHTML.includes('&lt;script&gt;'), shown);
    const hidden = runBanner(src, 'AR', {});
    const hidden2 = runBanner(src, 'AR', { dataQuality: { flags: [], withheld: [] } });
    check(`SE-5: the ${label} banner stays hidden when there is no dataQuality (verified IQD, USD) — and when it is empty`, !!hidden && hidden.style.display === 'none' && hidden.innerHTML === '' && !!hidden2 && hidden2.style.display === 'none', [hidden, hidden2]);
    // (a surface this page renders: the recommendations page only reports what its own list is made of — see SP-3 below)
    const onlyWithheld = runBanner(src, 'AR', { dataQuality: { flags: [], withheld: [{ surface: label === 'dashboard' ? 'aiRecommendations' : 'priorityAction', reason: REASON }] } });
    check(`SE-5: the ${label} banner says so even when only a surface was withheld (no flag text) — a generic Arabic line, not nothing`, !!onlyWithheld && onlyWithheld.style.display === 'flex' && /لم يُتحقق منه/.test(onlyWithheld.innerHTML), onlyWithheld);
  }
  const priorOnlyDash = runBanner(dashPage, 'AR', { dataQuality: { flags: [{ code: REASON, message: 'prior window: …', messageAr: 'الفترة السابقة: …', window: 'prior' }], withheld: [] } });
  const priorOnlyRec = runBanner(recPage, 'AR', { dataQuality: { flags: [{ code: REASON, message: 'prior window: …', messageAr: 'الفترة السابقة: …', window: 'prior' }], withheld: [] } });
  check('SE-5/SE-4: a prior-window flag alone IS shown on the dashboard (its KPI deltas are in doubt) but NOT on the recommendations page (it is about advice)', priorOnlyDash?.style.display === 'flex' && priorOnlyDash.innerHTML.includes('الفترة السابقة') && priorOnlyRec?.style.display === 'none', [priorOnlyDash, priorOnlyRec]);
  // SP-3 — a flag that is not about the account's own window must not relabel it "unverified", and must not make the
  // recommendations page call its list incomplete. The weekly report's own flag is marked window 'weekly'.
  const wkFlagPure = (S as any).flagFromWindow(S.summarizeWindow([{ day: iso(3), account: 'VERIFIED', accountSpend: 100, campaignSpend: 85, campaignRows: 2 }], 'CAMPAIGN', iso(14), iso(1)), { weekly: true });
  const curFlagPure = (S as any).flagFromWindow(S.summarizeWindow([{ day: iso(3), account: 'VERIFIED', accountSpend: 100, campaignSpend: 85, campaignRows: 2 }], 'CAMPAIGN', iso(14), iso(1)));
  check('SP-3: flagFromWindow(…, { weekly: true }) marks the flag window "weekly" and names the WEEKLY REPORT in both languages; without the option the flag is exactly the old one (no window key)',
    wkFlagPure?.window === 'weekly' && /^weekly report:/.test(wkFlagPure.message) && /^التقرير الأسبوعي/.test(wkFlagPure.messageAr) && wkFlagPure.code === REASON && wkFlagPure.level === 'CAMPAIGN' && wkFlagPure.rows === 1 && !('window' in curFlagPure) && curFlagPure.message.endsWith('spend-based advice for this period is withheld'), [wkFlagPure, curFlagPure]);
  const unreadWk = (S as any).flagFromWindow(S.unreadableWindow('IQD', 'CAMPAIGN', iso(14), iso(1)), { weekly: true });
  check('SP-3: an unreadable weekly window is a weekly flag too (window "weekly", unreadable, names the report)', unreadWk?.window === 'weekly' && unreadWk.unreadable === true && /^weekly report:/.test(unreadWk.message) && /التقرير الأسبوعي/.test(unreadWk.messageAr), unreadWk);
  const weeklyOnlyPayload = { dataQuality: { flags: [{ code: REASON, message: 'weekly report: 3 of 14 …', messageAr: 'التقرير الأسبوعي: 3 من 14 …', window: 'weekly', level: 'CAMPAIGN' }], withheld: [{ surface: 'weeklyReport', reason: REASON, detail: 'recommendations: x' }, { surface: 'weeklyReport', reason: REASON, detail: 'delta: y' }] } };
  const wkDash = runBanner(dashPage, 'AR', weeklyOnlyPayload);
  const wkRec = runBanner(recPage, 'AR', weeklyOnlyPayload);
  check('SP-3: weekly flag ALONE → the dashboard banner is shown, titled as a PART of the spend (not "spend is not verified"), names the weekly report, says what was withheld (the report, twice) and that the account\'s own spend is verified',
    wkDash?.style.display === 'flex' && /تعذّر التحقق من جزء من الإنفاق/.test(wkDash.innerHTML) && !/الإنفاق غير موثَّق/.test(wkDash.innerHTML) && /التقرير الأسبوعي: 3 من 14/.test(wkDash.innerHTML) && /المحجوب من هذه الصفحة: التقرير الأسبوعي \(2\)/.test(wkDash.innerHTML) && /إنفاق الحساب نفسه[^<]*موثَّق/.test(wkDash.innerHTML), wkDash);
  check('SP-3: weekly flag ALONE → the recommendations page shows NO banner (nothing its list is made of was withheld) and never the "list may be incomplete" line', wkRec?.style.display === 'none' && wkRec.innerHTML === '', wkRec);
  const wkPlusAi = runBanner(dashPage, 'AR', { dataQuality: { flags: weeklyOnlyPayload.dataQuality.flags, withheld: [...weeklyOnlyPayload.dataQuality.withheld, { surface: 'aiRecommendations', reason: REASON }] } });
  check('SP-3: …but when something ELSE was withheld too (aiRecommendations), the dashboard does not claim that only the weekly report is affected', !!wkPlusAi && !/إنفاق الحساب نفسه/.test(wkPlusAi.innerHTML) && /بطاقات التوصيات الذكية \(1\)/.test(wkPlusAi.innerHTML) && /التقرير الأسبوعي \(2\)/.test(wkPlusAi.innerHTML), wkPlusAi);
  const mixedBanner = runBanner(dashPage, 'AR', { dataQuality: { flags: [{ code: REASON, message: 'N', messageAr: '3 من 30 صف إنفاق …', level: 'ACCOUNT' }, ...weeklyOnlyPayload.dataQuality.flags], withheld: [{ surface: 'issues', reason: REASON, detail: 'HIGH_CPM' }] } });
  check('SP-3: a flag on the 30-day window keeps the "spend is not verified" title on the dashboard (and no "only the weekly report" claim)', !!mixedBanner && /الإنفاق غير موثَّق/.test(mixedBanner.innerHTML) && !/تعذّر التحقق من جزء/.test(mixedBanner.innerHTML) && !/إنفاق الحساب نفسه/.test(mixedBanner.innerHTML), mixedBanner);
  const priorOnlyTitle = runBanner(dashPage, 'AR', { dataQuality: { flags: [{ code: REASON, message: 'prior window: …', messageAr: 'الفترة السابقة: …', window: 'prior' }], withheld: [] } });
  check('SP-3: a prior-window flag alone no longer relabels the current window either — the dashboard title says a PART of the spend', !!priorOnlyTitle && /تعذّر التحقق من جزء من الإنفاق/.test(priorOnlyTitle.innerHTML) && !/الإنفاق غير موثَّق/.test(priorOnlyTitle.innerHTML) && !/إنفاق الحساب نفسه/.test(priorOnlyTitle.innerHTML), priorOnlyTitle);
  const ownFlagRec = runBanner(recPage, 'AR', { dataQuality: { flags: [{ code: REASON, message: 'N', messageAr: '3 من 30 صف إنفاق …', level: 'ACCOUNT' }, ...weeklyOnlyPayload.dataQuality.flags], withheld: [] } });
  check('SP-3: an own-window flag (even next to a weekly one) still shows the recommendations banner, with its text, the title and the incomplete-list line — but NOT the weekly flag\'s text', ownFlagRec?.style.display === 'flex' && /الإنفاق غير موثَّق/.test(ownFlagRec.innerHTML) && /ناقصة/.test(ownFlagRec.innerHTML) && /3 من 30 صف إنفاق/.test(ownFlagRec.innerHTML) && !/التقرير الأسبوعي/.test(ownFlagRec.innerHTML), ownFlagRec);
  const recOnlyAi = runBanner(recPage, 'AR', { dataQuality: { flags: [], withheld: [{ surface: 'aiRecommendations', reason: REASON }, { surface: 'weeklyReport', reason: REASON }, { surface: 'forecast', reason: REASON }] } });
  check('SP-3: surfaces the recommendations page does not render (aiRecommendations, weeklyReport, forecast…) alone do NOT trigger its banner', recOnlyAi?.style.display === 'none', recOnlyAi);
  for (const surface of ['priorityAction', 'issues', 'knowledgeBase', 'steadyState']) {
    const b = runBanner(recPage, 'AR', { dataQuality: { flags: [], withheld: [{ surface, reason: REASON }] } });
    check(`SP-3: a withheld ${surface} (part of the list) does trigger the recommendations banner, with the generic line and the incomplete-list line`, b?.style.display === 'flex' && /لم يُتحقق منه/.test(b.innerHTML) && /ناقصة/.test(b.innerHTML), b);
  }
  const hostileWk = runBanner(dashPage, 'AR', { dataQuality: { flags: [], withheld: [{ surface: '<img src=x onerror=alert(1)>', reason: REASON }] } });
  check('SP-3: an unknown withheld surface name from the server is escaped, never interpreted', !!hostileWk && !hostileWk.innerHTML.includes('<img') && hostileWk.innerHTML.includes('&lt;img'), hostileWk);
  check('SP-3 wiring: the weekly report builds its flag with { weekly: true }, and the dashboard still carries it only when nothing else is in doubt',
    /flagFromWindow\(evidence,\s*\{\s*weekly:\s*true\s*\}\)/.test(wkSrc) && /if \(dataQualityFlags\.length === 0\) dataQualityFlags\.push\(\.\.\.\(weeklyReport\?\.dataQuality\?\.flags \?\? \[\]\)\)/.test(dash2), []);
  function runWeeklyRender(report: any) {
    const fn = lift(dashPage, 'renderWeeklyReport');
    if (!fn) return null;
    const sec: any = { style: { display: 'none' }, classList: { add() {} } };
    const cont: any = { innerHTML: '' };
    const doc = { getElementById: (id: string) => (id === 'weekly-report-section' ? sec : id === 'weekly-report-content' ? cont : null) };
    // eslint-disable-next-line no-new-func
    new Function('document', 'escHtml', 'lbl', `${fn}; renderWeeklyReport(${JSON.stringify(report)});`)(doc, esc, (en: string, ar: string) => ar);
    return cont.innerHTML as string;
  }
  const wkRep = { weekStart: '2026-01-01', weekEnd: '2026-01-08', thisWeek: { spendDisplay: '1 IQD', results: 1, ctr: 1 }, lastWeek: { spendDisplay: '1 IQD', results: 1, ctr: 1 }, delta: { spendPct: null, resultsPct: 5, ctrPct: 1, costPerResultPct: null },
    bestCampaign: { campaignId: 'a', campaignName: 'Alpha', ctr: 4, spend: 1, results: 1 }, worstCampaign: { campaignId: 'b', campaignName: 'Beta', ctr: 1, spend: 1, results: 1 }, brainActions: {}, activeCampaigns: 2, pausedCampaigns: 0, recommendationsAr: [], summaryAr: '' };
  const wkHtmlClean = runWeeklyRender(wkRep);
  const wkHtmlHeld = runWeeklyRender({ ...wkRep, dataQuality: { flags: [{ code: REASON }], withheld: [] } });
  check('SE-5: the dashboard\'s weekly-report block offers the best campaign\'s "Scale this" budget link on a clean report and NOT while report.dataQuality is set (the worst campaign\'s diagnose link stays)',
    !!wkHtmlClean && wkHtmlClean.includes('best-action') && wkHtmlClean.includes('worst-action') && !!wkHtmlHeld && !wkHtmlHeld.includes('best-action') && wkHtmlHeld.includes('worst-action') && wkHtmlHeld.includes('Alpha'), [wkHtmlClean?.length, wkHtmlHeld?.length]);

  // ── 11. review round 3 — SP-1 / SP-2: the AI agent's READ tools and the investigate tab obey the same rule ─────────────
  console.log('\n── 11. review round 3: the agent read tools (simulate_budget_shift, rank_campaigns, compare_periods, detect_anomaly, list_campaigns, get_campaign_details) and the investigate tab ──');
  const G: any = await import('./src/services/agent/spendGate');
  const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const winRows = (days: number, o: { verified: boolean; unverifiedAgo?: number[] }) => {
    const account = Array.from({ length: days + 1 }, (_, i) => ({ day: ago(i), spend: 100_000 }));
    const raws = account.filter((r, i) => o.verified && !(o.unverifiedAgo ?? []).includes(i)).map((r) => ({ day: r.day, spend: r.spend }));
    const campaigns = account.map((r) => ({ day: r.day, total: r.spend, n: 2 }));
    return { account, raws, campaigns };
  };
  // pure: the verdict → the object a gated result carries
  const verdictOf = (o: object) => S.summarizeWindow(Array.from({ length: 5 }, (_, i) => ({ day: ago(i), account: (i < 2 ? 'UNVERIFIED' : 'VERIFIED') as any, accountSpend: 100, campaignSpend: 100, campaignRows: 2, ...o })), 'CAMPAIGN', ago(4), ago(0));
  const cleanV = S.summarizeWindow([{ day: ago(0), account: 'VERIFIED', accountSpend: 100, campaignSpend: 100, campaignRows: 2 }], 'CAMPAIGN', ago(4), ago(0));
  check('SP-2: describeAgentSpend is null for a clean window, for a non-IQD window and for nothing — a tool then adds no key at all', G.describeAgentSpend(cleanV, ['x']) === null && G.describeAgentSpend(S.notApplicable('CAMPAIGN', ago(4), ago(0)), ['x']) === null && G.describeAgentSpend(null, ['x']) === null && G.isSpendGated(cleanV) === false && G.isSpendGated(null) === false);
  const evPure = G.describeAgentSpend(verdictOf({}), ['deltas.spendPct', 'pacing']);
  check('SP-2: describeAgentSpend carries the reason code, the level, the window, the counts, what was left out and an instruction for the model that says SPEND_SCALE_UNVERIFIED and forbids budget / pacing / cost advice',
    evPure?.code === REASON && evPure.level === 'CAMPAIGN' && evPure.unverified === 2 && evPure.rows === 5 && evPure.from === ago(4) && same(evPure.withheld, ['deltas.spendPct', 'pacing']) && /^SPEND_SCALE_UNVERIFIED:/.test(evPure.note) && /Do NOT give budget, pacing, forecast, pause-for-cost or cost-per-result advice/.test(evPure.note) && /deltas\.spendPct; pacing/.test(evPure.note) && !('unreadable' in evPure), evPure);
  const overV = S.summarizeWindow([{ day: ago(0), account: 'OVERSCALED', accountSpend: 10_000, campaignSpend: 10_000, campaignRows: 1 }], 'ACCOUNT', ago(4), ago(0));
  const evOver = G.describeAgentSpend(overV, []);
  check('SP-2: a proven x100 window keeps its own (stronger) reason code', evOver?.code === 'SPEND_SCALE_OVERSCALED' && /^SPEND_SCALE_OVERSCALED:/.test(evOver.note) && /100x raw Meta spend/.test(evOver.note), evOver);
  const evUnread = G.describeAgentSpend(S.unreadableWindow('IQD', 'CAMPAIGN', ago(4), ago(0)), []);
  check('SP-2: an unreadable window says so (unreadable: true, "could not be read") and is still SPEND_SCALE_UNVERIFIED — fail closed', evUnread?.unreadable === true && evUnread.code === REASON && /could not be read/.test(evUnread.note), evUnread);
  check('SP-2: a confidence level can only go down because of unverified spend', G.lowerConfidence('high') === 'low' && G.lowerConfidence('medium') === 'low' && G.lowerConfidence('low') === 'low');
  check('SP-2: the spend metrics are exactly spend, cpm and cost_per_message (roas is Meta\'s own ratio, ctr / messages / health do not rest on spend)', [...G.SPEND_METRIC_KEYS].sort().join() === 'cost_per_message,cpm,spend');
  // the window helper: fail closed, no query for USD
  const brokenA = fakeDb({ currency: 'IQD', throwOnQuery: true });
  const errNoise = console.error; console.error = () => {};
  const wBroken = await G.agentSpendWindow(brokenA, { id: 'acct_1', currency: 'IQD' }, 'CAMPAIGN', ago(30), ago(0));
  console.error = errNoise;
  check('SP-2: agentSpendWindow on an unreadable IQD read is NOT clean (unreadable, SPEND_SCALE_UNVERIFIED) — it never throws into a tool', wBroken.clean === false && wBroken.unreadable === true && wBroken.reason === REASON && G.isSpendGated(wBroken));
  const usdA = fakeDb({ currency: 'USD', throwOnQuery: true });
  const wUsd = await G.agentSpendWindow(usdA, { id: 'acct_1', currency: 'USD' }, 'CAMPAIGN', ago(30), ago(0));
  check('SP-2: agentSpendWindow for USD makes no query and is not applicable (so no key, no gate)', wUsd.applies === false && wUsd.clean === true && usdA.log.queries === 0 && !G.isSpendGated(wUsd));
  check('SP-2: the refusal wording is the one save_recommendation uses — the code first, then the counts', /^SPEND_SCALE_UNVERIFIED: this budget projection rests on spend that could not be verified against raw Meta data \(2 unverified, 0 over-scaled of 5 day\(s\) in /.test(G.spendRefusalMessage('this budget projection', verdictOf({}))) && /could not be read/.test(G.spendRefusalMessage('x', S.unreadableWindow('IQD', 'CAMPAIGN', ago(4), ago(0)))));

  // simulate_budget_shift (fake prisma): refused where save_recommendation refuses, answered (and no key added) elsewhere
  const { simulateBudgetShiftHandler } = await import('./src/services/agent/tools/simulateBudgetShift');
  const simDb = (currency: string, ev: FakeOpts) => {
    const base = fakeDb({ currency, ...ev });
    const camp = (id: string) => ({ id, name: id, dailyBudget: 60_000n, adAccount: { id: 'acct_1', currency, currencyMinorFactor: currency === 'USD' ? 100 : 1, lastSyncedAt: new Date() } });
    const rows = Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.now() - i * 86_400_000), spend: 50_000n, messages: 5n }));
    return Object.assign(base, {
      campaign: { findFirst: async ({ where }: any) => camp(where.id) },
      dailyStat: { findMany: async () => rows },
    });
  };
  const simArgs = { fromCampaignId: 'c_a', toCampaignId: 'c_b', shiftAmount: { value: 20, unit: 'pct_of_from' as const }, projectionDays: 7 };
  const simCtx = (db: any) => ({ prisma: db, workspaceId: 'ws_1', userId: 'u_1' });
  const simH = simulateBudgetShiftHandler();
  const simVer = await simH.run(simArgs, simCtx(simDb('IQD', winRows(32, { verified: true }))));
  const simBad = await simH.run(simArgs, simCtx(simDb('IQD', winRows(32, { verified: false }))));
  const simHole = await simH.run(simArgs, simCtx(simDb('IQD', winRows(32, { verified: true, unverifiedAgo: [3] }))));
  const simUsdDb = simDb('USD', winRows(32, { verified: false }));
  const simUsd = await simH.run(simArgs, simCtx(simUsdDb));
  const simBroken = await simH.run(simArgs, simCtx(simDb('IQD', { throwOnQuery: true })));
  check('SP-2: simulate_budget_shift on VERIFIED IQD spend answers as before: a projection, confidence high, caveats [], and no spendEvidence key', simVer.ok && (simVer as any).data.confidence === 'high' && same((simVer as any).data.caveats, []) && !('spendEvidence' in (simVer as any).data), simVer);
  check('SP-2: …on UNVERIFIED IQD spend it REFUSES — STALE_DATA, SPEND_SCALE_UNVERIFIED in the message, a suggestion, no data (the case that used to answer "confidence: high, caveats: []")',
    !simBad.ok && (simBad as any).error.code === 'STALE_DATA' && /^SPEND_SCALE_UNVERIFIED:/.test((simBad as any).error.message) && /cannot be verified/.test((simBad as any).error.suggestion) && (simBad as any).error.retryable === false && !('data' in simBad), simBad);
  check('SP-2: …one unverified day anywhere in the 30 days it reads is enough (strict, as everywhere), and the message counts it', !simHole.ok && /1 unverified, 0 over-scaled of 31 day\(s\)/.test((simHole as any).error.message), (simHole as any).error?.message);
  check('SP-2: …a USD account is answered as before, with NO evidence query (and no spendEvidence key)', simUsd.ok && simUsdDb.log.queries === 0 && !('spendEvidence' in (simUsd as any).data), [simUsd.ok, simUsdDb.log.queries]);
  check('SP-2: …evidence UNREADABLE → refused (fail closed), never answered on a guess', !simBroken.ok && (simBroken as any).error.code === 'STALE_DATA' && /could not be read/.test((simBroken as any).error.message), simBroken);

  // rank_campaigns (fake prisma): only the spend metrics ask for evidence
  const { rankCampaignsHandler } = await import('./src/services/agent/tools/rankCampaigns');
  const rankDb = (currency: string, ev: FakeOpts) => {
    const base = fakeDb({ currency, ...ev });
    const rows = (id: string) => Array.from({ length: 10 }, (_, i) => ({ entityId: id, date: new Date(Date.now() - i * 86_400_000), spend: 50_000n, impressions: 10_000n, clicks: id === 'c_a' ? 300n : 100n, messages: 5n, roas: null }));
    return Object.assign(base, {
      workspace: { findUnique: async () => ({ id: 'ws_1', adAccounts: [{ id: 'acct_1', currency, currencyMinorFactor: currency === 'USD' ? 100 : 1, lastSyncedAt: new Date() }] }) },
      campaign: { findMany: async () => [{ id: 'c_a', name: 'Alpha' }, { id: 'c_b', name: 'Beta' }] },
      dailyStat: { findMany: async () => [...rows('c_a'), ...rows('c_b')] },
      healthScore: { findMany: async () => [] },
    });
  };
  const rankH = rankCampaignsHandler();
  const rkArgs = (metric: string) => ({ metric: metric as any, direction: 'best' as const, windowDays: 30, limit: 5, minSpendPctOfTotal: 1 });
  const rankBad = rankDb('IQD', winRows(32, { verified: false }));
  const rCpm = await rankH.run(rkArgs('cost_per_message'), simCtx(rankBad));
  const queriesAfterSpendRank = rankBad.log.queries;
  const rCtr = await rankH.run(rkArgs('ctr'), simCtx(rankBad));
  check('SP-2: rank_campaigns by cost_per_message / cpm / spend on UNVERIFIED IQD spend REFUSES (STALE_DATA, SPEND_SCALE_UNVERIFIED, field metric)', !rCpm.ok && (rCpm as any).error.code === 'STALE_DATA' && /SPEND_SCALE_UNVERIFIED/.test((rCpm as any).error.message) && (rCpm as any).error.field === 'metric' && !(await rankH.run(rkArgs('cpm'), simCtx(rankDb('IQD', winRows(32, { verified: false }))))).ok && !(await rankH.run(rkArgs('spend'), simCtx(rankDb('IQD', winRows(32, { verified: false }))))).ok, rCpm);
  check('SP-2: …a ranking by CTR on the same unverified account is answered, unchanged, with no spendEvidence key — and asks for no evidence at all', rCtr.ok && (rCtr as any).data.ranked[0]?.campaignName === 'Alpha' && !('spendEvidence' in (rCtr as any).data) && rankBad.log.queries === queriesAfterSpendRank, [rCtr.ok, rankBad.log.queries, queriesAfterSpendRank]);
  const rankVer = rankDb('IQD', winRows(32, { verified: true }));
  const rankUsd = rankDb('USD', winRows(32, { verified: false }));
  check('SP-2: …verified IQD and USD rank by cost per message as before (USD with zero evidence queries)', (await rankH.run(rkArgs('cost_per_message'), simCtx(rankVer))).ok && (await rankH.run(rkArgs('cost_per_message'), simCtx(rankUsd))).ok && rankUsd.log.queries === 0);

  // compare_periods (fake prisma)
  const { comparePeriodsHandler } = await import('./src/services/agent/tools/comparePeriods');
  const cmpDb = (currency: string, ev: FakeOpts) => {
    const base = fakeDb({ currency, ...ev });
    const acct = { id: 'acct_1', name: 'Acct', currency, currencyMinorFactor: currency === 'USD' ? 100 : 1, lastSyncedAt: new Date() };
    const rows = Array.from({ length: 16 }, (_, i) => ({ entityType: 'ACCOUNT', entityId: 'acct_1', date: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - i * 86_400_000), spend: BigInt(i < 7 ? 120_000 : 100_000), impressions: 10_000n, clicks: 200n, messages: BigInt(i < 7 ? 10 : 12), roas: null })).reverse();
    return Object.assign(base, {
      adAccount: { findFirst: async () => acct },
      dailyStat: { findMany: async () => rows },
    });
  };
  const cmpH = comparePeriodsHandler();
  const cmpArgs = { entityType: 'ACCOUNT' as const, entityId: 'acct_1', windowA: { sinceDaysAgo: 7, untilDaysAgo: 1 }, windowB: { sinceDaysAgo: 14, untilDaysAgo: 8 } };
  const cmpVer = await cmpH.run(cmpArgs, simCtx(cmpDb('IQD', winRows(16, { verified: true })))) as any;
  const cmpBad = await cmpH.run(cmpArgs, simCtx(cmpDb('IQD', winRows(16, { verified: false })))) as any;
  const cmpUsdDb = cmpDb('USD', winRows(16, { verified: false }));
  const cmpUsd = await cmpH.run(cmpArgs, simCtx(cmpUsdDb)) as any;
  check('SP-2: compare_periods on VERIFIED IQD spend: the spend / CPM / cost-per-message deltas are there, confidence high, no spendEvidence key; USD the same with no evidence query',
    cmpVer.ok && cmpVer.data.deltas.spendPct != null && cmpVer.data.deltas.cpmPct != null && cmpVer.data.deltas.costPerMessagePct != null && cmpVer.data.verdicts.confidence === 'high' && !('spendEvidence' in cmpVer.data) && cmpUsd.ok && cmpUsd.data.deltas.spendPct != null && cmpUsd.data.verdicts.confidence === 'high' && cmpUsdDb.log.queries === 0, [cmpVer.data?.deltas, cmpVer.data?.verdicts]);
  check('SP-2: …on UNVERIFIED IQD spend the three spend-derived deltas are null, the verdict is made from messages / CTR, confidence is LOW, spendEvidence (ACCOUNT level) says why, and the verdict reasons say so',
    cmpBad.ok && cmpBad.data.deltas.spendPct === null && cmpBad.data.deltas.cpmPct === null && cmpBad.data.deltas.costPerMessagePct === null && cmpBad.data.deltas.messagesPct === cmpVer.data.deltas.messagesPct && cmpBad.data.deltas.ctrPct === cmpVer.data.deltas.ctrPct
      && cmpBad.data.verdicts.confidence === 'low' && cmpBad.data.spendEvidence?.code === REASON && cmpBad.data.spendEvidence.level === 'ACCOUNT' && cmpBad.data.verdicts.reasons.at(-1)?.includes('لم يُتحقق من الإنفاق') && !cmpBad.data.verdicts.reasons.slice(0, -1).some((r: string) => /الإنفاق|CPM|تكلفة الرسالة/.test(r)), [cmpBad.data?.deltas, cmpBad.data?.verdicts]);
  check('SP-2: …the absolute totals stay as stored (the gate withholds comparisons, not money)', cmpBad.data.windowA.totals.spend === cmpVer.data.windowA.totals.spend && cmpBad.data.windowB.ratios.cpm === cmpVer.data.windowB.ratios.cpm);
  const cmpBroken = await cmpH.run(cmpArgs, simCtx(cmpDb('IQD', { throwOnQuery: true }))) as any;
  check('SP-2: …an unreadable evidence read gates the comparison too (spendEvidence.unreadable, confidence low) — still answered, never on a guess', cmpBroken.ok && cmpBroken.data.spendEvidence?.unreadable === true && cmpBroken.data.verdicts.confidence === 'low' && cmpBroken.data.deltas.spendPct === null, cmpBroken.data?.spendEvidence);

  // list_campaigns: the tiering and the why-labels, pure — the spend-median and CPM / cost-per-message clauses are left out while gated
  const LC: any = await import('./src/services/agent/tools/listCampaigns');
  const pair = (current: number | null) => ({ current, prior: current, deltaPct: 0 });
  const item = (id: string, o: { health: number; spend: number; roas: number; msgs: number; cpm?: number; cpmsg?: number }) => ({
    id, name: id, status: 'ACTIVE', healthScore: o.health, healthBand: 'good', tier: 'mid',
    metrics: { spend: pair(o.spend), messages: pair(o.msgs), ctr: pair(2), cpm: pair(o.cpm ?? 100), cost_per_message: pair(o.cpmsg ?? 10), roas: pair(o.roas) },
    whyLabel: '', whyReasons: [],
  });
  // X: weak health (so not best by the composite) but roas > 2 with spend above the median → "best" ONLY through the spend clause
  const tierSet = () => [item('x', { health: 60, spend: 900, roas: 3, msgs: 10 }), item('a', { health: 90, spend: 100, roas: 3, msgs: 10 }), item('b', { health: 90, spend: 100, roas: 3, msgs: 10 }), item('c', { health: 90, spend: 100, roas: 3, msgs: 10 }), item('d', { health: 40, spend: 100, roas: 3, msgs: 10 }), item('e', { health: 40, spend: 100, roas: 3, msgs: 10 })];
  const tClean = tierSet(); LC.applyTiers(tClean);
  const tGated = tierSet(); LC.applyTiers(tGated, true);
  check('SP-2: applyTiers — a campaign that is "best" only because its spend is above the median (roas > 2) is best on verified spend and NOT best while the spend is unverified', tClean.find((i: any) => i.id === 'x')?.tier === 'best' && tGated.find((i: any) => i.id === 'x')?.tier !== 'best', [tClean.map((i: any) => i.tier), tGated.map((i: any) => i.tier)]);
  // Z: healthy by score, but spend above the median with ZERO messages → "worst" ONLY through the spend clause
  const worstSet = () => [item('z', { health: 90, spend: 900, roas: 0, msgs: 0 }), item('l1', { health: 50, spend: 100, roas: 1, msgs: 10 }), item('l2', { health: 50, spend: 100, roas: 1, msgs: 10 }), item('a', { health: 90, spend: 100, roas: 1, msgs: 10 }), item('b', { health: 90, spend: 100, roas: 1, msgs: 10 })];
  const wtClean = worstSet(); LC.applyTiers(wtClean);
  const wtGated = worstSet(); LC.applyTiers(wtGated, true);
  check('SP-2: applyTiers — a campaign that is "worst" only because it spends above the median with no messages is worst on verified spend and NOT worst while the spend is unverified', wtClean.find((i: any) => i.id === 'z')?.tier === 'worst' && wtGated.find((i: any) => i.id === 'z')?.tier !== 'worst', [wtClean.map((i: any) => i.tier), wtGated.map((i: any) => i.tier)]);
  const wSet = () => [item('a', { health: 80, spend: 100, roas: 1, msgs: 10 }), item('b', { health: 80, spend: 100, roas: 1, msgs: 10 }), item('c', { health: 80, spend: 100, roas: 1, msgs: 10 }), item('d', { health: 80, spend: 100, roas: 1, msgs: 10, cpm: 1000, cpmsg: 100 })];
  const wClean = wSet(); LC.applyWhyLabels(wClean);
  const wGated = wSet(); LC.applyWhyLabels(wGated, true);
  const dOf = (xs: any[]) => xs.find((i: any) => i.id === 'd');
  check('SP-2: applyWhyLabels — a campaign distinguished only by CPM / cost per message gets a "CPM … higher than average" label on verified spend and the neutral one while the spend is unverified', /CPM|تكلفة الرسالة/.test(dOf(wClean).whyLabel) && dOf(wGated).whyLabel === 'أداء متوسط عبر كل المؤشرات' && !/CPM|تكلفة الرسالة/.test(dOf(wGated).whyReasons.join()), [dOf(wClean).whyLabel, dOf(wGated).whyLabel]);
  check('SP-2: …with no verdict (the default argument) both are exactly what they were', (() => { const a = tierSet(); LC.applyTiers(a); const b = tierSet(); LC.applyTiers(b, false); const c = wSet(); LC.applyWhyLabels(c); const d = wSet(); LC.applyWhyLabels(d, false); return same(a, b) && same(c, d); })());

  // the investigate narratives (pure): what the tab says on unverified spend
  const { buildDeterministicInvestigationNarratives: narr } = await import('./src/services/agent/investigateNarratives');
  const pacing = { todaySpend: 97_000, dailyBudget: 100_000, pctOfBudget: 97, burnRatePerHour: 5_000 };
  const evForNarr = G.describeAgentSpend(verdictOf({}), ['spendPacing.pctOfBudget / burnRatePerHour']);
  const nClean = narr({ budget: pacing }, ['budget']);
  const nGated = narr({ budget: { spendEvidence: evForNarr } }, ['budget']);
  const nGatedWithFigures = narr({ budget: { ...pacing, spendEvidence: evForNarr } }, ['budget']);
  check('SP-1: a clean campaign\'s budget narrative still says "raise the budget" at 97 % (the baseline this test protects)', /ارفع الميزانية اليومية/.test(nClean['budget'] ?? ''), nClean);
  check('SP-1: the budget narrative of a campaign whose spend is unverified gives NO budget move — no "raise the budget", no "cut spend", no pacing figure — and says the spend could not be verified',
    /تعذّر التحقق من إنفاق هذه الحملة/.test(nGated['budget'] ?? '') && !/ارفع|قلّل|رفع/.test(nGated['budget'] ?? '') && !/97|5,000/.test(nGated['budget'] ?? '') && nGatedWithFigures['budget'] === nGated['budget'], [nGated, nGatedWithFigures]);
  const details = (extra: object) => ({ campaign: { name: 'Alpha', status: 'ACTIVE', objective: 'MESSAGES' }, windowMetrics: { spend: { current: 1_000_000, prior: 900_000, deltaPct: 11.1 }, ctr: { current: 2, prior: 2, deltaPct: 0 }, cpm: { current: 4_000, prior: 3_500, deltaPct: 14.3 }, messages: { current: 100, prior: 90, deltaPct: 11.1 } }, historicalBaseline: { days: 60, ctrMean: 2, cpmMean: 3_800, dailySpendMean: 30_000, dailyMessagesMean: 3, costPerMessageMean: 10_000 }, vsBaseline: { ctrPct: 0, cpmPct: 5.2, spendPct: 11.1, messagesPct: 4 }, topIssues: [], topRecommendations: [], ...extra });
  const hClean = narr({ structure: details({}), historical_trend: details({}) }, ['structure', 'historical_trend']);
  const gatedDetails = details({ windowMetrics: { spend: { current: 1_000_000, prior: 900_000, deltaPct: null }, ctr: { current: 2, prior: 2, deltaPct: 0 }, cpm: { current: 4_000, prior: 3_500, deltaPct: null }, messages: { current: 100, prior: 90, deltaPct: 11.1 } }, vsBaseline: { ctrPct: 0, cpmPct: null, spendPct: null, messagesPct: 4 }, spendEvidence: evForNarr });
  const hGated = narr({ structure: gatedDetails, historical_trend: gatedDetails }, ['structure', 'historical_trend']);
  check('SP-1: a clean campaign\'s structure and historical sections state the spend and CPM comparisons', /\(\+11\.1% مقابل الفترة السابقة\)/.test(hClean['structure'] ?? '') && /الإنفاق مقابل الأساس \+11\.1%/.test(hClean['historical_trend'] ?? '') && /تكلفة الألف ظهور مقابل الأساس/.test(hClean['historical_trend'] ?? ''), hClean);
  check('SP-1: …an unverified one states none of them, keeps the CTR / messages comparisons, and says why in both sections',
    !/\(\+?-?[0-9.]+% مقابل الفترة السابقة\)/.test((hGated['structure'] ?? '').replace(/\(0\.0%\)/g, '')) && !/الإنفاق مقابل الأساس|تكلفة الألف ظهور مقابل الأساس/.test(hGated['historical_trend'] ?? '') && /النتائج\/الرسائل مقابل الأساس \+4\.0%/.test(hGated['historical_trend'] ?? '') && /التفاعل والنتائج قريبان/.test(hGated['historical_trend'] ?? '') && /الأداء الحالي قريب/.test(hClean['historical_trend'] ?? '') && (hGated['structure'] ?? '').includes('لم يُتحقق من الإنفاق') && (hGated['historical_trend'] ?? '').includes('لم يُتحقق من الإنفاق'), hGated);

  // wiring (static): the gate is in each tool, investigate follows the details' verdict, and the loop hands the whole result to the model
  const tool = (n: string) => code(read(`src/services/agent/tools/${n}.ts`));
  check('SP-2 wiring: simulate_budget_shift and rank_campaigns refuse through agentSpendWindow + isSpendGated (CAMPAIGN level) with the save_recommendation wording',
    /agentSpendWindow\(prisma,\s*acct,\s*'CAMPAIGN',\s*sinceDate/.test(tool('simulateBudgetShift')) && /isSpendGated\(verdict\)/.test(tool('simulateBudgetShift')) && /fail\('STALE_DATA',\s*spendRefusalMessage\(/.test(tool('simulateBudgetShift'))
      && /SPEND_METRIC_KEYS\.has\(args\.metric\)/.test(tool('rankCampaigns')) && /agentSpendWindow\(prisma,\s*account,\s*'CAMPAIGN'/.test(tool('rankCampaigns')) && /fail\('STALE_DATA',\s*spendRefusalMessage\(/.test(tool('rankCampaigns')), []);
  check('SP-2 wiring: compare_periods (ACCOUNT level for an account, CAMPAIGN level below it), detect_anomaly (by scope) and list_campaigns / get_campaign_details (CAMPAIGN level) evaluate the window they read and add spendEvidence only when gated',
    /args\.entityType === 'ACCOUNT' \? 'ACCOUNT' : 'CAMPAIGN',\s*earliest,\s*latest/.test(tool('comparePeriods')) && /\.\.\.\(spendEvidence \? \{ spendEvidence \} : \{\}\)/.test(tool('comparePeriods')) && /lowerConfidence\(confidence\)/.test(tool('comparePeriods'))
      && /args\.scope === 'workspace' \? 'ACCOUNT' : 'CAMPAIGN',\s*baselineSince/.test(tool('detectAnomaly')) && /spendGated && SPEND_METRIC_KEYS\.has\(spec\.key\)/.test(tool('detectAnomaly')) && /isSpendDependentIssueCode/.test(tool('detectAnomaly'))
      && /agentSpendWindow\(prisma,\s*account,\s*'CAMPAIGN',\s*priorSinceDate/.test(tool('listCampaigns')) && /applyTiers\(items,\s*spendGated\)/.test(tool('listCampaigns')) && /applyWhyLabels\(items,\s*spendGated\)/.test(tool('listCampaigns'))
      && /agentSpendWindow\(prisma,\s*account,\s*'CAMPAIGN',\s*sincePrior/.test(tool('getCampaignDetails')) && /spendPacing\.pctOfBudget = null/.test(tool('getCampaignDetails')) && /vsBaseline\.cpmPct = null/.test(tool('getCampaignDetails')), []);
  const inv = code(read('src/services/agent/investigate.ts'));
  check('SP-1 wiring: investigate takes the verdict from get_campaign_details, gives the budget section only the evidence when gated, ranks the audience / creative / hourly sections by CTR then, and tells the model (a conditional prompt line)',
    /const details = await dispatcher\.dispatch\('get_campaign_details'/.test(inv) && /spendEvidence \? \{ spendEvidence \} :/.test(inv) && /\{ metric: 'ctr' \}/.test(inv) && /\.\.\.spendFree/.test(inv) && /includes\('"spendEvidence"'\)/.test(inv) && /\.\.\.\(spendEvidence \? \{ spendEvidence \} : \{\}\)/.test(inv), []);
  const loopSrc = code(read('src/services/agent/loop.ts'));
  check('SP-2 wiring: the chat loop hands the model the WHOLE tool result (JSON.stringify(result)) — a spendEvidence key and a STALE_DATA refusal are seen by the model, not filtered', /content:\s*JSON\.stringify\(result\)/.test(loopSrc), []);
  check('SP-2 wiring: no spend-reading tool is left reading spend without the gate — the six gated tools import spendGate; the others are the documented residual',
    ['simulateBudgetShift', 'rankCampaigns', 'comparePeriods', 'detectAnomaly', 'listCampaigns', 'getCampaignDetails'].every((n) => /from '\.\.\/spendGate'/.test(tool(n))), []);

  // the doc says what the code does (the first version's claims were wrong)
  const docSrc = read('delivery/core/SPEND_EVIDENCE_GATING.md');
  check('DOC: the claim that aiRecommendations is "already judged at its own tick" is gone, and aiRecommendations / weeklyReport are in the gated list',
    !/already judged at its own tick/.test(docSrc) && /aiRecommendations/.test(docSrc) && /weeklyReport/.test(docSrc) && /SE-3/.test(docSrc), []);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
