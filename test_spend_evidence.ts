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
  check('the period reads /insights and /campaigns carry the data-quality header for the requested range', /spendScaleFlagForRange\(prisma,\s*account,\s*sinceDate,\s*null\)/.test(insightsRoute) && /spendScaleFlagForRange\(prisma,\s*account,\s*sinceDate,\s*null,\s*'CAMPAIGN'\)/.test(campaignsRoute) && /DATA_QUALITY_HEADER/.test(insightsRoute) && /DATA_QUALITY_HEADER/.test(campaignsRoute));
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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
