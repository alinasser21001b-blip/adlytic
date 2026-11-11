// ═════════════════════════════════════════════════════════════════════════
//  test_spend_evidence_postgres.ts — unverified IQD spend stays visible per
//  PERIOD and is kept out of the recommendations that rest on it, on a SYNTHETIC
//  local Postgres, through the real app and the real engines. Not part of
//  test:all (CI has no database); run:
//
//    createdb adlytic_repro_rc2 && DATABASE_URL=… npx prisma migrate deploy
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc2 \
//      npm run test:spend-evidence-pg
//
//  It REFUSES to run unless the host is loopback and the database is named
//  adlytic_repro*, and it exits 2 ("NOT RUN") — never a silent green — when it
//  cannot connect. All figures are synthetic IQD amounts.
//
//  The twin of the CI-safe test_spend_evidence.ts: same rules, real rows.
//    1. data-health after the repair (factor = 1): periods stay, WARN stays, the repair and
//       the factor change neither; older-than-window periods are listed; caps and totals
//    2. period reads carry the flag for an overlapping range — and only for one
//    3. campaign rows: verified only through a verified account row + a reconciling day total
//    4. generation with the real engines: unverified → spend-dependent withheld, fatigue kept;
//       verified IQD and USD → identical to each other
//    5. stored recommendations: GET /recommendations withholds, says so, and keeps the rest
//    6. the dashboard: priorityAction, drain, forecast, bleed, issues withheld — visibly
//    7. the AI agent and the Brain
//    8. review round 2 (SE-1, SE-2, SE-4, SE-5, SE-6): an IQD twin — verified vs unverified vs USD — through the real
//       app: dashboard aiRecommendations + weeklyReport, GET /api/weekly-report/:ws, GET /recommendations with no
//       stored row, the prior window, and a raw_insights that cannot be read
// ═════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import path from 'node:path';

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
delete process.env['REDIS_URL'];

const url = process.env['DATABASE_URL'] ?? '';
let parsed: URL;
try { parsed = new URL(url); } catch { console.error('NOT RUN: DATABASE_URL missing/invalid'); process.exit(2); }
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.startsWith('adlytic_repro')) {
  console.error(`REFUSED: host=${parsed.hostname} db=${dbName}. Needs a loopback host and a database named adlytic_repro*.`);
  process.exit(2);
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))?.slice(0, 900)}`); }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const { PrismaClient, EntityType, IssueCode, RecommendationSource } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('./src/api/server');
  const { signToken } = await import('./src/services/jwtAuth');
  const S = await import('./src/lib/spendEvidence');
  const { RulesEngine } = await import('./src/engines/rules/RulesEngine');
  const { RecommendationEngine } = await import('./src/engines/recommendation/RecommendationEngine');
  const { saveRecommendationHandler } = await import('./src/services/agent/tools/saveRecommendation');
  const { runBrainOrchestrator } = await import('./src/workers/runBrainOrchestrator');

  const pool = new pg.Pool({
    host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password), database: dbName, max: 20, connectionTimeoutMillis: 4000,
  });
  try { await pool.query('select 1'); } catch (e) { console.error('NOT RUN: cannot reach the synthetic database:', (e as Error).message); process.exit(2); }
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const app = buildRoutes(prisma);

  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };
  const iso = (n: number) => day(n).toISOString().slice(0, 10);
  let seq = 0;
  const log = console.log;
  const quiet = <T,>(fn: () => Promise<T>) => async () => { console.log = () => {}; console.info = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.info = log; console.warn = log; } };

  // ── seeding ──────────────────────────────────────────────────────────
  // raw: 'match' = a raw Meta row equal to the stored value (VERIFIED); 'none' = no raw at all;
  //      'x100'  = stored is exactly 100x what raw Meta says (PROVEN over-scaled).
  type RawMode = 'match' | 'none' | 'x100';
  interface Row { ago: number; spend: number; raw: RawMode; messages?: number; clicks?: number; freq?: number; ctr?: number }
  interface CampRow { ago: number; spend: number; messages?: number }
  interface SeedOpts { currency?: string; factor?: number; account: Row[]; campaigns?: CampRow[][]; trend?: 'furniture' | 'fatigue'; budgets?: boolean; budget?: bigint; objective?: string }

  async function seed(label: string, o: SeedOpts) {
    const n = `${label}-${++seq}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({ data: { email: `${n}@repro.invalid`, passwordHash: 'x', name: n, isActive: true } });
    const ws = await prisma.workspace.create({ data: { name: 'Synthetic' } });
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' } });
    const account = await prisma.adAccount.create({
      data: { workspaceId: ws.id, externalAccountId: `act_${n}`, name: 'Synthetic account', currency: o.currency ?? 'IQD', currencyMinorFactor: o.factor ?? 1, timezone: 'UTC', metaAccountStatus: 1, lastSyncedAt: new Date() },
    });
    const campaigns = [];
    for (let c = 0; c < (o.campaigns?.length ?? 0); c++) {
      campaigns.push(await prisma.campaign.create({ data: { adAccountId: account.id, externalCampaignId: `c${c}_${n}`, name: `Campaign ${c}`, objective: o.objective ?? 'OUTCOME_ENGAGEMENT', dailyBudget: o.budget ?? (o.budgets ? 5_000_000n : null) } }));
    }
    for (const r of o.account) {
      const clicks = r.clicks ?? 500;
      await prisma.dailyStat.create({
        data: {
          entityType: EntityType.ACCOUNT, entityId: account.id, date: day(r.ago), spend: BigInt(r.spend), impressions: 25_000n, clicks: BigInt(clicks), linkClicks: BigInt(clicks),
          messages: BigInt(r.messages ?? 10), ctr: r.ctr ?? 2.0, frequency: r.freq ?? 2.0, cpm: (r.spend / 25_000) * 1000, cpc: r.spend / clicks,
        },
      });
      if (r.raw !== 'none') {
        await prisma.rawInsight.create({ data: { entityType: EntityType.ACCOUNT, entityId: account.id, date: day(r.ago), rawJson: { spend: String(r.raw === 'x100' ? r.spend / 100 : r.spend) } } });
      }
    }
    for (let c = 0; c < campaigns.length; c++) {
      for (const r of o.campaigns![c]!) {
        await prisma.dailyStat.create({
          data: {
            entityType: EntityType.CAMPAIGN, entityId: campaigns[c]!.id, date: day(r.ago), spend: BigInt(r.spend), impressions: 12_000n, clicks: 250n, linkClicks: 250n,
            messages: BigInt(r.messages ?? 5), ctr: 2.0, frequency: 2.0, cpm: (r.spend / 12_000) * 1000, cpc: r.spend / 250,
          },
        });
      }
    }
    if (o.trend === 'furniture') {
      await prisma.metricTrend.create({ data: { entityType: EntityType.ACCOUNT, entityId: account.id, date: day(0), ctrTrend: -0.33, cpmTrend: 0, frequencyTrend: 0.46, resultsTrend: -0.33, spendTrend: 0 } });
    } else if (o.trend === 'fatigue') {
      await prisma.metricTrend.create({ data: { entityType: EntityType.ACCOUNT, entityId: account.id, date: day(0), ctrTrend: -0.28, cpmTrend: 0, frequencyTrend: 0.46, resultsTrend: null, spendTrend: 0 } });
    }
    const token = signToken({ sub: user.id, email: user.email, ver: 0 });
    return { user, ws, account, campaigns, token };
  }
  type Tenant = Awaited<ReturnType<typeof seed>>;

  /** `n` days (ago 1..n) of a steady account: `rawFor(ago)` says how each day is evidenced. */
  const steady = (n: number, rawFor: (ago: number) => RawMode, over: Partial<Row> = {}): Row[] =>
    Array.from({ length: n }, (_, i) => ({ ago: i + 1, spend: 100_000, raw: rawFor(i + 1), messages: i + 1 <= 7 ? 10 : 20, ...over }));

  const get = (path: string, token: string) => app.request(path, { headers: { authorization: `Bearer ${token}` } });
  const post = (path: string, token: string) => app.request(path, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  const health = async (t: Tenant) => { const r = await quiet(() => get(`/api/workspaces/${t.ws.id}/data-health`, t.token))(); return { status: r.status, body: (await r.json()) as any }; };
  const dq = (r: Response) => r.headers.get('x-data-quality');

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 1. data-health after the repair: the periods stay, whatever the factor, the repair or the clock say ──');
  // Stale factor 100. Days 1–10 evidenced, 11–14 NOT (a hole), 15–20 evidenced; 200–205 are far older than any raw evidence.
  const flagship = await seed('flagship', {
    factor: 100,
    account: [
      ...steady(20, (a) => (a >= 11 && a <= 14 ? 'none' : 'match')),
      ...Array.from({ length: 6 }, (_, i) => ({ ago: 200 + i, spend: 100_000, raw: 'none' as RawMode })),
    ],
  });
  const h0 = await health(flagship);
  const expectedPeriods = [{ from: iso(14), to: iso(11), rows: 4 }, { from: iso(205), to: iso(200), rows: 6 }];
  check('BEFORE the repair (factor 100): SPEND_SCALE_UNVERIFIED WARN, window 4 unverified of 20, and the periods are listed newest first', h0.body.checks?.some((c: any) => c.code === 'SPEND_SCALE_UNVERIFIED' && c.severity === 'WARN') && h0.body.spendScale?.window?.unverified === 4 && same(h0.body.spendScale?.unverifiedPeriods, expectedPeriods), [h0.body.spendScale?.window, h0.body.spendScale?.unverifiedPeriods]);
  check('…the older period (200+ days, beyond the 30-day window AND the raw retention) is listed too, not only counted', h0.body.spendScale?.unverifiedPeriods?.some((p: any) => p.from === iso(205) && p.rows === 6), h0.body.spendScale?.unverifiedPeriods);
  check('…with exact totals and the documented cap', h0.body.spendScale?.unverifiedPeriodsTotal === 2 && h0.body.spendScale?.unverifiedRowsTotal === 10 && h0.body.spendScale?.unverifiedPeriodsTruncated === false && h0.body.spendScale?.periodsCap === 24, h0.body.spendScale);
  check('…every pre-existing key is still there (additive only)', ['storedFactor', 'factorIsEvidence', 'window', 'history', 'currency'].every((k) => k in h0.body.spendScale) && ['window', 'accountId', 'checkedAt', 'overallStatus', 'checks', 'campaignCounts', 'divergencePct', 'divergenceStatus', 'orphanedCampaignIds', 'orphanedCount', 'staleActiveCount', 'syncAgeHours'].every((k) => k in h0.body), Object.keys(h0.body));
  const rep = await quiet(() => post(`/api/workspaces/${flagship.ws.id}/repair-iqd`, flagship.token))();
  const h1 = await health(flagship);
  const accountNow = await prisma.adAccount.findUniqueOrThrow({ where: { id: flagship.account.id }, select: { currencyMinorFactor: true } });
  check('the repair ran and flipped the stored factor to 1', rep.status === 200 && accountNow.currencyMinorFactor === 1, [rep.status, accountNow.currencyMinorFactor]);
  check('AFTER the repair (factor 1): the SAME periods, the same counts — the factor certified nothing', same(h1.body.spendScale?.unverifiedPeriods, expectedPeriods) && h1.body.spendScale?.storedFactor === 1 && h1.body.spendScale?.unverifiedRowsTotal === 10, h1.body.spendScale);
  check('…and the WARN is still there', h1.body.checks?.some((c: any) => c.code === 'SPEND_SCALE_UNVERIFIED' && c.severity === 'WARN') && h1.body.overallStatus !== 'OK', [h1.body.overallStatus, h1.body.checks?.map((c: any) => c.code)]);
  const rep2 = await quiet(() => post(`/api/workspaces/${flagship.ws.id}/repair-iqd`, flagship.token))();
  const h1b = await health(flagship);
  check('running the repair AGAIN changes nothing either', rep2.status === 200 && same(h1b.body.spendScale?.unverifiedPeriods, expectedPeriods));
  check('GET data-health writes nothing (xmin of the account\'s stats unchanged across two reads)', await (async () => {
    const a = JSON.stringify(await prisma.$queryRaw`SELECT id, xmin::text FROM daily_stats WHERE entity_id = ${flagship.account.id} ORDER BY id`);
    await health(flagship);
    return a === JSON.stringify(await prisma.$queryRaw`SELECT id, xmin::text FROM daily_stats WHERE entity_id = ${flagship.account.id} ORDER BY id`);
  })());

  // time moving forward: a period older than the 30-day window
  const aged = await seed('aged', { factor: 1, account: [...steady(10, () => 'match'), ...Array.from({ length: 5 }, (_, i) => ({ ago: 45 + i, spend: 100_000, raw: 'none' as RawMode }))] });
  const hAged = await health(aged);
  check('a period 45 days old (outside the 30-day window): no WARN — but it is LISTED, with its rows', !hAged.body.checks?.some((c: any) => c.code.startsWith('SPEND_SCALE')) && same(hAged.body.spendScale?.unverifiedPeriods, [{ from: iso(49), to: iso(45), rows: 5 }]) && hAged.body.spendScale?.window?.unverified === 0, [hAged.body.checks?.map((c: any) => c.code), hAged.body.spendScale?.unverifiedPeriods]);

  // cap and totals
  const fragmented = await seed('fragmented', { factor: 1, account: Array.from({ length: 80 }, (_, i) => ({ ago: i + 1, spend: 100_000, raw: (i % 2 === 0 ? 'none' : 'match') as RawMode })) });
  const hFrag = await health(fragmented);
  check('80 alternating days: 40 unverified runs — the list is capped at 24 (newest first), the totals say 40 / 40 and truncated', hFrag.body.spendScale?.unverifiedPeriods?.length === 24 && hFrag.body.spendScale?.unverifiedPeriodsTotal === 40 && hFrag.body.spendScale?.unverifiedRowsTotal === 40 && hFrag.body.spendScale?.unverifiedPeriodsTruncated === true && hFrag.body.spendScale.unverifiedPeriods[0].from > hFrag.body.spendScale.unverifiedPeriods[23].from, [hFrag.body.spendScale?.unverifiedPeriods?.length, hFrag.body.spendScale?.unverifiedPeriodsTotal]);

  // proven over-scale
  const over = await seed('over', { factor: 1, account: steady(6, () => 'x100').map((r) => ({ ...r, spend: 10_000_000 })) });
  const hOver = await health(over);
  check('rows PROVEN x100 (factor 1): CRITICAL as before, and the periods are listed under overscaledPeriods', hOver.body.checks?.some((c: any) => c.code === 'SPEND_SCALE_OVERSCALED' && c.severity === 'CRITICAL') && same(hOver.body.spendScale?.overscaledPeriods, [{ from: iso(6), to: iso(1), rows: 6 }]) && hOver.body.spendScale?.unverifiedPeriods?.length === 0, hOver.body.spendScale);

  // all verified / USD
  const verifiedT = await seed('verified', { factor: 1, account: steady(20, () => 'match') });
  const hVer = await health(verifiedT);
  check('a fully verified IQD account: no period, no warning', hVer.body.spendScale?.unverifiedPeriods?.length === 0 && hVer.body.spendScale?.overscaledPeriods?.length === 0 && !hVer.body.checks?.some((c: any) => c.code.startsWith('SPEND_SCALE')), hVer.body.spendScale);
  const usd = await seed('usd', { currency: 'USD', factor: 100, account: steady(20, () => 'none') });
  const hUsd = await health(usd);
  check('a USD account: no spendScale block at all, no check — exactly as before', hUsd.body.spendScale === undefined && !hUsd.body.checks?.some((c: any) => c.code.startsWith('SPEND_SCALE')));

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 2. a period read that overlaps an affected period carries the flag — and only then ──');
  const ins = async (t: Tenant, days: number) => quiet(() => get(`/api/workspaces/${t.ws.id}/insights?days=${days}`, t.token))();
  const i30 = await ins(aged, 30);
  const i90 = await ins(aged, 90);
  check('/insights?days=30 on the account whose only unverified period is 45 days old: no flag', dq(i30) === null && i30.status === 200, dq(i30));
  check('/insights?days=90 (the range now reaches that period): X-Data-Quality: SPEND_SCALE_UNVERIFIED', dq(i90) === 'SPEND_SCALE_UNVERIFIED', dq(i90));
  check('…and the body is still the same array of rows (the shape did not change)', Array.isArray(await i90.json()));
  const iFlag = await ins(flagship, 30);
  check('/insights?days=30 on the flagship account (a hole 11–14 days ago): flagged', dq(iFlag) === 'SPEND_SCALE_UNVERIFIED');
  check('/insights on a fully verified IQD account and on a USD account: no header',
    dq(await ins(verifiedT, 30)) === null && dq(await ins(usd, 30)) === null);
  const cFlag = await quiet(() => get(`/api/workspaces/${flagship.ws.id}/campaigns?days=30`, flagship.token))();
  check('/campaigns?days=30 is read at CAMPAIGN level: flagship has no campaign rows, so nothing to judge there → no flag', dq(cFlag) === null, dq(cFlag));
  const overIns = await ins(over, 30);
  check('over-scaled rows: the header says SPEND_SCALE_OVERSCALED', dq(overIns) === 'SPEND_SCALE_OVERSCALED', dq(overIns));
  const ctx = S.spendScaleFlagForRange(prisma, { id: flagship.account.id, currency: 'IQD' }, iso(20), iso(0));
  const flagObj = await ctx;
  check('the flag object (same code as the check) carries rows, of, range and the periods inside it', flagObj?.code === 'SPEND_SCALE_UNVERIFIED' && flagObj.rows === 4 && flagObj.of === 20 && same(flagObj.periods, [{ from: iso(14), to: iso(11), rows: 4 }]), flagObj);

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 3. campaign rows: verified only through a verified account row AND a reconciling day total ──');
  const camp = await seed('camp', {
    factor: 1,
    account: steady(6, () => 'match').map((r) => ({ ...r, spend: 200_000 })),
    campaigns: [
      [1, 2, 3].map((a) => ({ ago: a, spend: 100_000 })).concat([4, 5, 6].map((a) => ({ ago: a, spend: 10_000_000 }))), // days 4–6: x100 vs the account
      [1, 2, 3, 4, 5, 6].map((a) => ({ ago: a, spend: 100_000 })).map((r) => (r.ago >= 4 ? { ...r, spend: 0 } : r)),
    ],
  });
  const wAcc = await S.evaluateSpendWindow(prisma, { id: camp.account.id, currency: 'IQD' }, iso(10), iso(0), 'ACCOUNT');
  const wCmp = await S.evaluateSpendWindow(prisma, { id: camp.account.id, currency: 'IQD' }, iso(10), iso(0), 'CAMPAIGN');
  check('ACCOUNT level: 6 verified rows — clean', wAcc.clean && wAcc.verified === 6, wAcc);
  check('CAMPAIGN level: days 1–3 reconcile (verified), days 4–6 do not (campaigns add up to x100 of the account) → UNVERIFIED, 3 of 6', !wCmp.clean && wCmp.verified === 3 && wCmp.unverified === 3 && wCmp.reason === 'SPEND_SCALE_UNVERIFIED' && same(wCmp.periods, [{ from: iso(6), to: iso(4), rows: 3 }]), wCmp);
  const campUnproven = await seed('camp-unproven', { factor: 1, account: steady(6, () => 'none').map((r) => ({ ...r, spend: 200_000 })), campaigns: [steady(6, () => 'none').map((r) => ({ ago: r.ago, spend: 100_000 })), steady(6, () => 'none').map((r) => ({ ago: r.ago, spend: 100_000 }))] });
  const wU = await S.evaluateSpendWindow(prisma, { id: campUnproven.account.id, currency: 'IQD' }, iso(10), iso(0), 'CAMPAIGN');
  check('campaigns that reconcile PERFECTLY with an account row that has no raw proof are still unverified (both could be x100 together)', !wU.clean && wU.unverified === 6 && wU.verified === 0, wU);
  const campNoRows = await S.evaluateSpendWindow(prisma, { id: verifiedT.account.id, currency: 'IQD' }, iso(10), iso(0), 'CAMPAIGN');
  check('an account with verified account rows and NO campaign rows: nothing to judge at CAMPAIGN level (clean)', campNoRows.clean && campNoRows.rows === 0, campNoRows);
  const entWin = await S.evaluateEntityWindow(prisma, 'CAMPAIGN', camp.campaigns[0]!.id, iso(0), { lagDays: 0, spanDays: 10 });
  check('evaluateEntityWindow resolves a CAMPAIGN entity to its account and judges it at CAMPAIGN level', !entWin.clean && entWin.level === 'CAMPAIGN' && entWin.unverified === 3, entWin);

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 4. generation with the real engines ──');
  // Realistic IQD magnitudes: cpc 200 IQD sits far above the knowledge base's thresholds, so on a verified window the
  // cost-based knowledge-base recommendation wins — exactly what the gate must stop on unverified spend.
  const engineRows = (rawFor: (a: number) => RawMode) => steady(20, rawFor, { freq: 2.0, ctr: 2.0 });
  const eUnver = await seed('e-unver', { factor: 1, account: engineRows((a) => (a >= 4 && a <= 9 ? 'none' : 'match')), trend: 'furniture' });
  const eVer = await seed('e-ver', { factor: 1, account: engineRows(() => 'match'), trend: 'furniture' });
  const eUsd = await seed('e-usd', { currency: 'USD', factor: 100, account: engineRows(() => 'none'), trend: 'furniture' });
  const asOf = new Date();
  const run = async (t: Tenant) => {
    const rules = await quiet(() => new RulesEngine(prisma).run(EntityType.ACCOUNT, t.account.id, { asOf }))();
    const r = await quiet(() => new RecommendationEngine(prisma).run(EntityType.ACCOUNT, t.account.id, { asOf }))();
    const issues = (await prisma.detectedIssue.findMany({ where: { entityId: t.account.id } })).map((i) => i.issueCode).sort();
    const recs = await prisma.recommendation.findMany({ where: { entityId: t.account.id } });
    return { r, rules, issues, recs };
  };
  const oU = await run(eUnver), oV = await run(eVer), oD = await run(eUsd);
  check('verified IQD window: RISING_COST_PER_RESULT detected, a cost-based recommendation composed (the baseline)', oV.issues.includes('RISING_COST_PER_RESULT') && oV.recs.length === 1, [oV.issues, oV.recs.map((r) => r.actionCode)]);
  check('USD twin: identical issues and the identical recommendation (action, priority, source issues, details) as the verified IQD account',
    same(oD.issues, oV.issues) && oD.recs[0]?.actionCode === oV.recs[0]?.actionCode && oD.recs[0]?.priority === oV.recs[0]?.priority && same(oD.recs[0]?.sourceIssuesJson, oV.recs[0]?.sourceIssuesJson) && same(oD.recs[0]?.detailsJson, oV.recs[0]?.detailsJson), [oD.recs.map((r) => r.actionCode), oV.recs.map((r) => r.actionCode)]);
  check('USD and verified IQD: no spendEvidence key anywhere (nothing was withheld)', oD.r.spendEvidence === undefined && oV.r.spendEvidence === undefined && !JSON.stringify(oV.recs[0]?.detailsJson ?? {}).includes('spendEvidence'));
  check('UNVERIFIED IQD window: RISING_COST_PER_RESULT is NOT detected (its spendTrend was withheld)…', !oU.issues.includes('RISING_COST_PER_RESULT'), oU.issues);
  check('…the fatigue story still is (AUDIENCE_FATIGUE, DECLINING_RESULTS)', oU.issues.includes('AUDIENCE_FATIGUE') && oU.issues.includes('DECLINING_RESULTS'), oU.issues);
  check('…the cost-based knowledge-base recommendation is NOT produced; the spend-independent REFRESH_CREATIVES (HIGH) is, composed from fatigue + declining results only',
    oU.recs.length === 1 && oU.recs[0]!.actionCode === 'REFRESH_CREATIVES' && oU.recs[0]!.priority === 'HIGH' && same(oU.recs[0]!.sourceIssuesJson, ['AUDIENCE_FATIGUE', 'DECLINING_RESULTS']), oU.recs.map((r) => [r.actionCode, r.sourceIssuesJson]));
  check('…and the suppression is visible: the rules result names the withheld signals, the recommendation result and the stored row name the reason, the window and the withheld metrics',
    oU.rules.spendWithheld === 'SPEND_SCALE_UNVERIFIED' && oV.rules.spendWithheld === undefined && oD.rules.spendWithheld === undefined
    && oU.r.spendEvidence?.reason === 'SPEND_SCALE_UNVERIFIED' && oU.r.spendEvidence.withheldMetrics.includes('cpc') && (oU.recs[0]!.detailsJson as any)?.spendEvidence?.reason === 'SPEND_SCALE_UNVERIFIED' && (oU.recs[0]!.detailsJson as any).spendEvidence.window.unverified === 6, [oU.rules.spendWithheld, oU.r.spendEvidence, oU.recs[0]!.detailsJson]);
  // The engine can also be run on issues that were persisted BEFORE the gate (or by another run): it drops them itself.
  await prisma.detectedIssue.createMany({ data: [{ entityType: EntityType.ACCOUNT, entityId: eUnver.account.id, date: day(0), issueCode: IssueCode.RISING_COST_PER_RESULT, severity: 'HIGH', evidenceJson: [] }], skipDuplicates: true });
  const reRun = await quiet(() => new RecommendationEngine(prisma).run(EntityType.ACCOUNT, eUnver.account.id, { asOf }))();
  check('a RISING_COST_PER_RESULT issue already stored for the day (written before the gate existed) is dropped by the recommendation engine itself, and named', reRun.spendEvidence?.withheldIssueCodes?.includes('RISING_COST_PER_RESULT') && reRun.recommendation?.actionCode === 'REFRESH_CREATIVES' && !reRun.recommendation.sourceIssues.includes('RISING_COST_PER_RESULT'), [reRun.spendEvidence, reRun.recommendation?.sourceIssues]);

  // spend-independent fatigue by frequency / CTR keeps working, identically, on unverified spend
  // spend 100 IQD a day: CPM 4, CPC 0.001 — no cost metric breaches, so what the knowledge base finds is the frequency / CTR story alone.
  const fatigueRows = (rawFor: (a: number) => RawMode) => steady(20, rawFor, { freq: 5.4, ctr: 0.4, clicks: 100_000, spend: 100 });
  const fU = await seed('f-unver', { factor: 1, account: fatigueRows(() => 'none'), trend: 'fatigue' });
  const fV = await seed('f-ver', { factor: 1, account: fatigueRows(() => 'match'), trend: 'fatigue' });
  const fD = await seed('f-usd', { currency: 'USD', factor: 100, account: fatigueRows(() => 'none'), trend: 'fatigue' });
  const pU = await run(fU), pV = await run(fV), pD = await run(fD);
  check('creative fatigue by frequency/CTR: a recommendation is produced on UNVERIFIED spend…', pU.recs.length === 1 && pU.recs[0]!.actionCode.length > 0, pU.recs);
  check('…and it is the SAME action, priority and source issues as on the verified IQD account and on the USD one — spend-independent advice is untouched',
    [pV, pD].every((p) => p.recs[0]?.actionCode === pU.recs[0]?.actionCode && p.recs[0]?.priority === pU.recs[0]?.priority && same(p.recs[0]?.sourceIssuesJson, pU.recs[0]?.sourceIssuesJson)), [pU.recs.map((r) => r.actionCode), pV.recs.map((r) => r.actionCode), pD.recs.map((r) => r.actionCode)]);
  check('…and it does not rest on spend (by the same classification the readers use)', !S.spendDependenceOfRecommendation({ actionCode: pU.recs[0]!.actionCode, sourceIssues: pU.recs[0]!.sourceIssuesJson, details: pU.recs[0]!.detailsJson }).dependent, pU.recs[0]);

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 5. stored recommendations: GET /recommendations withholds, says so, and keeps the rest ──');
  async function store(t: Tenant, rows: Array<{ code: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; ago: number; issues?: string[]; source?: 'V1_RULES' | 'AI_AGENT'; details?: unknown }>) {
    for (const r of rows) {
      await prisma.recommendation.create({
        data: {
          entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(r.ago), priority: r.priority, actionCode: r.code,
          sourceIssuesJson: r.issues ?? [], detailsJson: (r.details ?? undefined) as any, source: r.source === 'AI_AGENT' ? RecommendationSource.AI_AGENT : RecommendationSource.V1_RULES,
        },
      });
    }
  }
  const stored = [
    { code: 'REVIEW_BUDGET_PACING', priority: 'CRITICAL' as const, ago: 3, issues: ['RISING_COST_PER_RESULT'] },
    { code: 'BROADEN_AUDIENCE', priority: 'HIGH' as const, ago: 3, issues: ['AUDIENCE_FATIGUE', 'HIGH_FREQUENCY'] },
    { code: 'IMPROVE_HOOKS', priority: 'MEDIUM' as const, ago: 2, issues: ['LOW_CTR'] },
    { code: 'INCREASE_BUDGET', priority: 'HIGH' as const, ago: 1, issues: [], source: 'AI_AGENT' as const },
  ];
  const rUnver = await seed('r-unver', { factor: 1, account: steady(20, (a) => (a >= 6 && a <= 9 ? 'none' : 'match')) });
  const rVer = await seed('r-ver', { factor: 1, account: steady(20, () => 'match') });
  const rUsd = await seed('r-usd', { currency: 'USD', factor: 100, account: steady(20, () => 'none') });
  for (const t of [rUnver, rVer, rUsd]) await store(t, stored);
  const recsOf = async (t: Tenant, q = '') => { const r = await quiet(() => get(`/api/workspaces/${t.ws.id}/recommendations${q}`, t.token))(); return { r, body: (await r.json()) as any }; };
  const gU = await recsOf(rUnver), gV = await recsOf(rVer), gD = await recsOf(rUsd);
  const codesOf = (b: any[]) => b.map((x) => x.actionCode).sort();
  check('verified IQD and USD accounts: all four stored recommendations come back, unchanged, no data-quality header', codesOf(gV.body).length === 4 && same(codesOf(gV.body), codesOf(gD.body)) && dq(gV.r) === null && dq(gD.r) === null && gV.r.headers.get('x-recommendations-withheld') === null, [codesOf(gV.body), codesOf(gD.body)]);
  check('unverified IQD window: the budget-pacing and the AI budget recommendation are withheld; the audience and hook ones come back', same(codesOf(gU.body), ['BROADEN_AUDIENCE', 'IMPROVE_HOOKS']), codesOf(gU.body));
  check('…and the response says so: X-Data-Quality + X-Recommendations-Withheld: 2', dq(gU.r) === 'SPEND_SCALE_UNVERIFIED' && gU.r.headers.get('x-recommendations-withheld') === '2', [dq(gU.r), gU.r.headers.get('x-recommendations-withheld')]);
  const gUs = await recsOf(rUnver, '?include=suppressed');
  check('?include=suppressed lists what was withheld, each with reason code, basis, entity, date and the evidence window', gUs.body.suppressed?.length === 2 && (gUs.body.suppressed ?? []).every((x: any) => x.reason === 'SPEND_SCALE_UNVERIFIED' && x.window.unverified >= 1) && same((gUs.body.suppressed ?? []).map((x: any) => x.actionCode).sort(), ['INCREASE_BUDGET', 'REVIEW_BUDGET_PACING']) && gUs.body.recommendations?.length === 2 && gUs.body.dataQuality?.spendWithheldCount === 2, gUs.body.suppressed);
  const repairU = await quiet(() => post(`/api/workspaces/${rUnver.ws.id}/repair-iqd`, rUnver.token))();
  check('running the repair does not bring them back (the gate follows the rows, not the factor)', repairU.status === 200 && same(codesOf((await recsOf(rUnver)).body), ['BROADEN_AUDIENCE', 'IMPROVE_HOOKS']));
  const rOver = await seed('r-over', { factor: 1, account: steady(20, () => 'x100').map((r) => ({ ...r, spend: 10_000_000 })) });
  await store(rOver, stored);
  const gO = await recsOf(rOver, '?include=suppressed');
  check('proven x100 rows: withheld with reason SPEND_SCALE_OVERSCALED', gO.body.suppressed?.length === 2 && (gO.body.suppressed ?? []).every((x: any) => x.reason === 'SPEND_SCALE_OVERSCALED') && dq(gO.r) === 'SPEND_SCALE_OVERSCALED', [gO.body.suppressed, dq(gO.r)]);
  // each stored recommendation is judged by its OWN window
  const rAged = await seed('r-aged', { factor: 1, account: [...steady(8, () => 'none'), ...Array.from({ length: 20 }, (_, i) => ({ ago: 40 + i, spend: 100_000, raw: 'match' as RawMode }))] });
  await store(rAged, [
    { code: 'REVIEW_BUDGET_PACING', priority: 'HIGH', ago: 42, issues: ['RISING_COST_PER_RESULT'] }, // built on a verified window
    { code: 'PAUSE_AND_RELAUNCH', priority: 'HIGH', ago: 1, issues: ['RISING_COST_PER_RESULT'] },     // built on an unverified one
  ]);
  const gA = await recsOf(rAged, '?include=suppressed');
  check('an OLD spend-dependent recommendation built on a verified window stays; a NEW one built on an unverified window goes', same((gA.body.recommendations ?? []).map((x: any) => x.actionCode), ['REVIEW_BUDGET_PACING']) && same((gA.body.suppressed ?? []).map((x: any) => x.actionCode), ['PAUSE_AND_RELAUNCH']), [gA.body.recommendations, gA.body.suppressed]);
  // knowledge-base rows: judged by the metric that owns the action
  const kbT = await seed('r-kb', { factor: 1, account: steady(20, () => 'none') });
  const breach = (metricKey: string, id: string) => ({ metricKey, recommended_optimization_actions: [{ id }] });
  await store(kbT, [
    { code: 'CPMSG_PAUSE_BLEEDERS', priority: 'CRITICAL', ago: 1, details: { source: 'meta_ads_knowledge_base', metricBreaches: [breach('cost_per_message', 'CPMSG_PAUSE_BLEEDERS')] } },
    { code: 'FREQ_EXPAND_AUDIENCE', priority: 'HIGH', ago: 1, details: { source: 'meta_ads_knowledge_base', metricBreaches: [breach('frequency', 'FREQ_EXPAND_AUDIENCE')] } },
  ]);
  const gK = await recsOf(kbT);
  check('knowledge-base recommendations: the one owned by cost_per_message is withheld, the one owned by frequency is kept', same(codesOf(gK.body), ['FREQ_EXPAND_AUDIENCE']), codesOf(gK.body));

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 6. the dashboard: spend-based advice is withheld — visibly — on unverified spend ──');
  // Last 7 days cost twice as much per message as the 7 before, so a drain exists on every tenant below; today bleeds.
  const dashRows = (rawFor: (a: number) => RawMode): Row[] => steady(20, rawFor);
  const mk = async (label: string, currency: string, factor: number, rawFor: (a: number) => RawMode) => {
    const t = await seed(label, { currency, factor, account: dashRows(rawFor) });
    await prisma.dailyStat.create({ data: { entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(0), spend: 80_000n, impressions: 9_000n, clicks: 200n, messages: 0n, ctr: 2.0, frequency: 2.0 } });
    if (currency === 'IQD' && rawFor(0) === 'match') await prisma.rawInsight.create({ data: { entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(0), rawJson: { spend: '80000' } } });
    // a campaign that is burning through its day: today's spend against an hourly burn rate recorded by the Brain's V2 velocity
    const burner = await prisma.campaign.create({ data: { adAccountId: t.account.id, externalCampaignId: `burn_${t.account.id}`, name: 'Burner', objective: 'MESSAGES', dailyBudget: 2_400_000n } });
    await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: burner.id, date: day(0), spend: 2_000_000n, impressions: 9_000n, clicks: 200n, messages: 0n, ctr: 2.0, frequency: 2.0 } });
    await prisma.campaignBrainSnapshot.create({ data: { workspaceId: t.ws.id, campaignId: burner.id, externalCampaignId: burner.externalCampaignId, tickDate: day(0), action: 'HOLD_AND_MONITOR', priority: 'NORMAL', patternSignature: 'STABLE_PERFORMER', finalScore: 60, payload: { campaignName: 'Burner', v2: { velocity: { burnRate: currency === 'IQD' ? 100_000 : 1_000 } }, physics: {} } as any } });
    await store(t, [
      { code: 'PAUSE_AND_RELAUNCH', priority: 'CRITICAL', ago: 1, issues: ['AUDIENCE_FATIGUE', 'DECLINING_RESULTS', 'RISING_COST_PER_RESULT'] },
      { code: 'BROADEN_AUDIENCE', priority: 'MEDIUM', ago: 1, issues: ['AUDIENCE_FATIGUE', 'HIGH_FREQUENCY'] },
    ]);
    // a trend row with a real CPM / spend story, as AnalyticsEngine would have written it
    await prisma.metricTrend.create({ data: { entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(0), ctrTrend: -0.33, cpmTrend: 0.4, frequencyTrend: 0.46, resultsTrend: -0.33, spendTrend: 0 } });
    await prisma.detectedIssue.createMany({ data: [
      { entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(0), issueCode: IssueCode.RISING_COST_PER_RESULT, severity: 'HIGH', evidenceJson: [] },
      { entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(0), issueCode: IssueCode.HIGH_FREQUENCY, severity: 'MEDIUM', evidenceJson: [] },
    ] });
    return t;
  };
  const dU = await mk('d-unver', 'IQD', 1, (a) => (a >= 3 && a <= 5 ? 'none' : 'match'));
  const dV = await mk('d-ver', 'IQD', 1, () => 'match');
  const dD = await mk('d-usd', 'USD', 100, () => 'none');
  const dash = async (t: Tenant) => { const r = await quiet(() => get(`/api/dashboard/${t.ws.id}`, t.token))(); return { status: r.status, body: (await r.json()) as any }; };
  const [bU, bV, bD] = [await dash(dU), await dash(dV), await dash(dD)];
  check('all three dashboards answer 200', [bU, bV, bD].every((b) => b.status === 200), [bU.status, bV.status, bD.status]);
  check('baseline (verified IQD) and USD: drain, bleed alert and a priority action exist, and there is NO dataQuality key', [bV, bD].every((b) => b.body.drain && b.body.bleedAlert && b.body.priorityAction && b.body.dataQuality === undefined), [bV.body.drain, bV.body.bleedAlert, bV.body.priorityAction?.actionCode]);
  check('…they agree on what the priority action, the issue codes and the presence of drain / forecast / bleed are (non-IQD behaves exactly as before)',
    bV.body.priorityAction.actionCode === bD.body.priorityAction.actionCode && same((bV.body.issues ?? []).map((i: any) => i.code).sort(), (bD.body.issues ?? []).map((i: any) => i.code).sort()) && !!bV.body.forecast === !!bD.body.forecast, [bV.body.priorityAction.actionCode, bD.body.priorityAction.actionCode]);
  check('UNVERIFIED IQD: no drain, no bleed alert, no forecast (spend-based advice)', bU.body.drain == null && bU.body.bleedAlert == null && bU.body.forecast == null, [bU.body.drain, bU.body.bleedAlert, bU.body.forecast]);
  check('…the priority action is NOT the withheld PAUSE_AND_RELAUNCH: the best recommendation that does not rest on spend (BROADEN_AUDIENCE) takes its place', bU.body.priorityAction?.actionCode === 'BROADEN_AUDIENCE', bU.body.priorityAction);
  check('…the spend-dependent issue RISING_COST_PER_RESULT is not shown; HIGH_FREQUENCY still is', !(bU.body.issues ?? []).some((i: any) => i.code === 'RISING_COST_PER_RESULT') && (bU.body.issues ?? []).some((i: any) => i.code === 'HIGH_FREQUENCY'), (bU.body.issues ?? []).map((i: any) => i.code));
  const surfaces = (bU.body.dataQuality?.withheld ?? []).map((w: any) => w.surface);
  check('…and dataQuality names the flag and every withheld surface: SPEND_SCALE_UNVERIFIED, priorityAction, issues, drain, bleedAlert',
    bU.body.dataQuality?.flags?.[0]?.code === 'SPEND_SCALE_UNVERIFIED' && ['priorityAction', 'issues', 'drain', 'bleedAlert'].every((s) => surfaces.includes(s)) && bU.body.dataQuality.withheld.every((w: any) => w.reason === 'SPEND_SCALE_UNVERIFIED'), bU.body.dataQuality);
  const diagCodes = (b: { body: any }) => (b.body.diagnoses ?? []).map((d: any) => d.code);
  check('…the cost diagnosis (RISING_COST_PER_RESULT, from the CPM / spend trends) is built on verified IQD and USD spend only', diagCodes(bV).includes('RISING_COST_PER_RESULT') && diagCodes(bD).includes('RISING_COST_PER_RESULT') && !diagCodes(bU).includes('RISING_COST_PER_RESULT'), [diagCodes(bV), diagCodes(bD), diagCodes(bU)]);
  check('…the knowledge-base cost breaches (cost_per_message, cpm) are not evaluated on unverified spend, and are named', surfaces.includes('knowledgeBase') && bU.body.dataQuality.withheld.filter((w: any) => w.surface === 'knowledgeBase').map((w: any) => w.detail).sort().join() === 'cost_per_message,cpm' && !(bU.body.priorityAction?.details?.metricBreaches ?? []).some((b: any) => S.SPEND_DERIVED_KB_METRICS.has(b.metricKey)) && (bV.body.priorityAction?.details?.metricBreaches ?? []).some((b: any) => S.SPEND_DERIVED_KB_METRICS.has(b.metricKey)), [bU.body.priorityAction?.details, bV.body.priorityAction?.details]);
  // no stored recommendation at all: the knowledge base alone would have produced a cost-based priority action
  const kbAcc = async (label: string, currency: string, factor: number, rawFor: (a: number) => RawMode) => seed(label, { currency, factor, account: steady(20, rawFor) });
  const kU = await dash(await kbAcc('k-unver', 'IQD', 1, (a) => (a >= 3 && a <= 5 ? 'none' : 'match')));
  const kV = await dash(await kbAcc('k-ver', 'IQD', 1, () => 'match'));
  const kD = await dash(await kbAcc('k-usd', 'USD', 100, () => 'none'));
  check('with NO stored recommendation: verified IQD and USD get the knowledge-base cost action as their priority action; unverified IQD gets none', kV.body.priorityAction?.actionCode === 'CPMSG_PAUSE_BLEEDERS' && kD.body.priorityAction?.actionCode === 'CPMSG_PAUSE_BLEEDERS' && (kU.body.priorityAction == null) && kV.body.dataQuality === undefined && kD.body.dataQuality === undefined, [kV.body.priorityAction?.actionCode, kD.body.priorityAction?.actionCode, kU.body.priorityAction]);
  check('budget-exhaustion prediction (pace / budget from today\'s spend vs burn rate): present on verified IQD and USD, withheld on unverified IQD and named in dataQuality',
    (bV.body.predictions?.budgetExhaustion ?? []).length === 1 && (bD.body.predictions?.budgetExhaustion ?? []).length === 1 && (bU.body.predictions?.budgetExhaustion ?? []).length === 0 && surfaces.includes('predictions'), [bV.body.predictions?.budgetExhaustion?.length, bD.body.predictions?.budgetExhaustion?.length, bU.body.predictions?.budgetExhaustion, surfaces]);
  check('…the other half of predictions (creative fatigue — no spend) is present in the unverified dashboard exactly as in the verified one', same(bU.body.predictions?.creativeFatigue ?? null, bV.body.predictions?.creativeFatigue ?? null) && bU.body.predictions !== undefined, [bU.body.predictions?.creativeFatigue, bV.body.predictions?.creativeFatigue]);
  check('…the KPI numbers themselves are still shown as stored (the gate withholds advice, it does not rewrite money)', bU.body.kpis?.find((k: any) => k.key === 'spend')?.value === bV.body.kpis?.find((k: any) => k.key === 'spend')?.value);

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 7. the AI agent and the Brain ──');
  const saveAs = (t: Tenant, entityType: 'ACCOUNT' | 'CAMPAIGN', entityId: string, actionCode: string) =>
    quiet(() => saveRecommendationHandler().run({ entityType, entityId, text: 'نص توصية طويل بما يكفي للتحقق', actionCode: actionCode as any, priority: 'HIGH', reasoning: 'This is a sufficiently long AI reasoning string for validation.' }, { prisma, workspaceId: t.ws.id, userId: t.user.id } as any))();
  const aU = await saveAs(rUnver, 'ACCOUNT', rUnver.account.id, 'DECREASE_BUDGET');
  const aV = await saveAs(rVer, 'ACCOUNT', rVer.account.id, 'DECREASE_BUDGET');
  const aUc = await saveAs(rUnver, 'ACCOUNT', rUnver.account.id, 'REFRESH_CREATIVE');
  const aD = await saveAs(rUsd, 'ACCOUNT', rUsd.account.id, 'DECREASE_BUDGET');
  check('save_recommendation: DECREASE_BUDGET on unverified IQD spend is refused (nothing stored); on verified IQD and on USD it is saved; REFRESH_CREATIVE is saved even on unverified spend',
    !aU.ok && (aU as any).error.code === 'STALE_DATA' && /SPEND_SCALE_UNVERIFIED/.test((aU as any).error.message) && aV.ok && aD.ok && aUc.ok
    && (await prisma.recommendation.count({ where: { entityId: rUnver.account.id, actionCode: 'DECREASE_BUDGET' } })) === 0, [aU, aV.ok, aD.ok, aUc.ok]);
  const aCamp = await saveAs(camp, 'CAMPAIGN', camp.campaigns[0]!.id, 'INCREASE_BUDGET');
  const aCampAcc = await saveAs(camp, 'ACCOUNT', camp.account.id, 'INCREASE_BUDGET');
  check('a CAMPAIGN-level budget recommendation is judged at CAMPAIGN level: refused where the campaigns do not reconcile with the (verified) account, while the same account-level one is saved',
    !aCamp.ok && aCampAcc.ok, [aCamp, aCampAcc.ok]);

  // the Brain, through the real orchestrator (no Meta: every client call throws, V2 falls back to V1-only)
  const noMeta: any = new Proxy({}, { get: () => () => { throw new Error('no network in this test'); } });
  // Latest rows (ago 0–1) are what the Brain's physics reads; the window rows (ago 2–8 vs 9–15) carry the period signals:
  // results fall 40 % at flat spend — the textbook RISING_COST_PER_RESULT shape that rule grounding detects from real trends.
  const brainCampaignRows = (c: number): CampRow[] => Array.from({ length: 16 }, (_, i) => ({ ago: i, spend: c === 0 ? 40_000 : 200_000, messages: c === 0 ? 100 : (i >= 2 && i <= 8 ? 24 : 40) }));
  const brainAccountRows = (rawFor: (a: number) => RawMode, k = 1): Row[] => Array.from({ length: 16 }, (_, i) => ({ ago: i, spend: k * (8 * 200_000 - 160_000), raw: rawFor(i), messages: 8 * 60 - 40 }));
  async function brainTenant(label: string, rawFor: (a: number) => RawMode) {
    // eight campaigns; one is a clear winner (cost per message a fifth of the others', CTR 3 %)
    return seed(label, { factor: 1, account: brainAccountRows(rawFor), campaigns: Array.from({ length: 8 }, (_, c) => brainCampaignRows(c)), budgets: false, objective: 'MESSAGES' });
  }
  const bTU = await brainTenant('b-unver', (a) => (a % 2 === 0 ? 'none' : 'match'));
  const bTV = await brainTenant('b-ver', () => 'match');
  const bTC = await seed('b-camp', { factor: 1, account: brainAccountRows(() => 'match', 2), campaigns: Array.from({ length: 8 }, (_, c) => brainCampaignRows(c)), objective: 'MESSAGES' });
  const bTD = await seed('b-usd', { currency: 'USD', factor: 100, account: brainAccountRows(() => 'none'), campaigns: Array.from({ length: 8 }, (_, c) => brainCampaignRows(c)), objective: 'MESSAGES' });
  const brainOf = async (t: Tenant) => {
    const res = await quiet(() => runBrainOrchestrator(prisma, noMeta, t.account.id))();
    const snaps = await prisma.campaignBrainSnapshot.findMany({ where: { campaignId: { in: t.campaigns.map((c) => c.id) } } });
    return { res, snaps };
  };
  const brU = await brainOf(bTU), brV = await brainOf(bTV), brD = await brainOf(bTD), brC = await brainOf(bTC);
  const actionsOf = (b: { snaps: Array<{ action: string }> }) => b.snaps.map((s) => s.action).sort();
  const spendDep = (a: string) => S.BRAIN_SPEND_DEPENDENT_ACTIONS.has(a);
  check('precondition: on VERIFIED IQD spend the Brain issues at least one cost-based verdict (scale / pause / rescue / refresh)', brV.res.ok && brV.snaps.length === 8 && actionsOf(brV).some(spendDep), actionsOf(brV));
  check('USD twin: the very same verdicts as the verified IQD account (the gate does not touch non-IQD)', same(actionsOf(brD), actionsOf(brV)), [actionsOf(brD), actionsOf(brV)]);
  check('UNVERIFIED IQD spend: NO cost-based verdict is issued — every one is HOLD_AND_MONITOR / KEEP_COLLECTING', brU.res.ok && brU.snaps.length === 8 && !actionsOf(brU).some(spendDep), actionsOf(brU));
  const accLevel = await S.evaluateSpendWindow(prisma, { id: bTC.account.id, currency: 'IQD' }, iso(15), iso(0), 'ACCOUNT');
  check('campaigns that do not add up to a VERIFIED account row: ACCOUNT level is clean, but the Brain (CAMPAIGN level) withholds every cost-based verdict and says why',
    accLevel.clean && brC.res.ok && !actionsOf(brC).some(spendDep) && brC.res.spendEvidence?.reason === 'SPEND_SCALE_UNVERIFIED' && brC.res.spendEvidence.unverified === 16, [accLevel.clean, actionsOf(brC), brC.res.spendEvidence]);
  const groundedIssues = (b: { snaps: Array<{ payload: any }> }) => b.snaps.flatMap((x) => (x.payload?.ruleGrounding?.issues ?? []).map((i: any) => i.code));
  check('rule grounding reads the period signals: on verified IQD and USD spend it detects RISING_COST_PER_RESULT from the real trends; on unverified spend (account- or campaign-level) it cannot — the spend-derived signals were withheld',
    groundedIssues(brV).includes('RISING_COST_PER_RESULT') && groundedIssues(brD).includes('RISING_COST_PER_RESULT') && !groundedIssues(brU).includes('RISING_COST_PER_RESULT') && !groundedIssues(brC).includes('RISING_COST_PER_RESULT'), [groundedIssues(brV), groundedIssues(brD), groundedIssues(brU), groundedIssues(brC)]);
  const withheldPayloads = brU.snaps.filter((s) => (s.payload as any)?.decision?.spendEvidence?.withheld === true);
  check('…each withheld one keeps the original verdict in payload.decision.overriddenAction + spendEvidence (visible, not silent), and the orchestrator result says so',
    withheldPayloads.length > 0 && withheldPayloads.every((s) => spendDep((s.payload as any).decision.overriddenAction) && (s.payload as any).decision.spendEvidence.reason === 'SPEND_SCALE_UNVERIFIED') && brU.res.spendEvidence?.reason === 'SPEND_SCALE_UNVERIFIED' && brV.res.spendEvidence === undefined && brD.res.spendEvidence === undefined, [brU.res.spendEvidence, withheldPayloads.length]);


  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 8. review round 2: the advice paths the first gate missed — an IQD twin, verified vs unverified vs USD ──');
  const REASON = 'SPEND_SCALE_UNVERIFIED';
  const [dsU, dsV, dsD] = [await dash(bTU), await dash(bTV), await dash(bTD)];
  const weekly = async (t: Tenant) => { const r = await quiet(() => get(`/api/weekly-report/${t.ws.id}`, t.token))(); return { r, body: (await r.json()) as any }; };
  const [xU, xV, xD] = [await weekly(bTU), await weekly(bTV), await weekly(bTD)];
  const cards = (b: any) => (b.aiRecommendations?.recommendations ?? []) as any[];
  /** The cards without their campaign ids (a twin tenant has its own ids). */
  const cardText = (b: any) => cards(b).map(({ campaignIds: _ids, ...c }) => c);
  const advice = (b: any) => ({ recs: b?.recommendationsAr, delta: b?.delta, best: b?.bestCampaign && { n: b.bestCampaign.campaignName, p: b.bestCampaign.pattern, h: b.bestCampaign.healthScore, a: b.bestCampaign.action }, worst: b?.worstCampaign && { n: b.worstCampaign.campaignName, p: b.worstCampaign.pattern, a: b.worstCampaign.action }, brain: b?.brainActions });
  check('all three dashboards and weekly-report routes answer 200', [dsU, dsV, dsD].every((b) => b.status === 200) && [xU, xV, xD].every((x) => x.r.status === 200), [dsU.status, dsV.status, dsD.status, xU.r.status, xV.r.status, xD.r.status]);

  // SE-1 — dashboard aiRecommendations
  check('SE-1 baseline: on VERIFIED IQD spend the winner gets the budget-increase card (det-scale, category scale)', cards(dsV.body).some((c) => c.id === 'det-scale' && c.category === 'scale' && /زِد ميزانيتها/.test(c.bodyAr)), cards(dsV.body).map((c) => c.id));
  check('SE-1: the USD twin gets exactly the same cards as the verified IQD account, and neither carries a dataQuality key or a spendWithheld key', same(cardText(dsD.body), cardText(dsV.body)) && dsV.body.dataQuality === undefined && dsD.body.dataQuality === undefined && dsV.body.aiRecommendations?.spendWithheld === undefined && dsD.body.aiRecommendations?.spendWithheld === undefined, [cards(dsD.body).map((c) => c.id), cards(dsV.body).map((c) => c.id)]);
  check('SE-1: on UNVERIFIED IQD spend the Brain gate held (no cost-based verdict) — and so now does the card: NO budget-increase card, no scale / pause / fix category at all',
    !cards(dsU.body).some((c) => c.id === 'det-scale' || ['scale', 'pause', 'fix'].includes(c.category)) && !JSON.stringify(dsU.body.aiRecommendations).includes('زِد ميزانيتها'), cards(dsU.body));
  check('SE-1: …the DTO and dataQuality.withheld both name it (aiRecommendations: det-scale), with the reason', dsU.body.aiRecommendations?.spendWithheld?.reason === REASON && dsU.body.aiRecommendations.spendWithheld.ids.includes('det-scale') && dsU.body.dataQuality?.withheld?.some((w: any) => w.surface === 'aiRecommendations' && w.reason === REASON && /det-scale/.test(w.detail ?? '')), [dsU.body.aiRecommendations?.spendWithheld, dsU.body.dataQuality?.withheld]);
  check('SE-1: …the spend-free cards of the same payload are untouched (the unverified dashboard still has the watch card for the campaigns under observation)', cards(dsU.body).some((c) => c.category === 'watch') === cards(dsV.body).some((c) => c.category === 'watch'), [cards(dsU.body).map((c) => c.id), cards(dsV.body).map((c) => c.id)]);

  // SE-1 (per campaign) — the Brain judges CAMPAIGN level over 16 days ending TODAY; the dashboard judges the ACCOUNT rows.
  // Only today's campaign rows drift (97 % of the verified account row), so the account window, the prior window and the
  // weekly report (it ends yesterday) are all clean — while the Brain withheld its verdicts. The scale card must follow the Brain.
  const bTF = await seed('b-drift', { factor: 1, account: brainAccountRows(() => 'match'), campaigns: Array.from({ length: 8 }, (_, c) => brainCampaignRows(c).map((r) => (r.ago === 0 && c >= 1 ? { ...r, spend: 194_000 } : r))), budgets: false, objective: 'MESSAGES' });
  const brF = await brainOf(bTF);
  const dsF = await dash(bTF);
  check('SE-1 precondition: today\'s campaign rows drift → the Brain (CAMPAIGN level, ends today) withholds its cost-based verdicts, while the dashboard\'s ACCOUNT window is clean', brF.res.spendEvidence?.reason === REASON && brF.res.spendEvidence.unverified === 1 && !actionsOf(brF).some(spendDep) && dsF.body.drain !== undefined, [brF.res.spendEvidence, actionsOf(brF)]);
  check('SE-1: …so the dashboard\'s scale card is not emitted either (the stored decision carries spendEvidence.withheld), the other cards are, and the DTO and dataQuality.withheld say so',
    !cards(dsF.body).some((c) => c.id === 'det-scale') && dsF.body.aiRecommendations?.spendWithheld?.ids?.includes('det-scale') && dsF.body.dataQuality?.withheld?.some((w: any) => w.surface === 'aiRecommendations'), [cards(dsF.body).map((c) => c.id), dsF.body.dataQuality]);
  check('SE-1: …and that dataQuality exists although no flag does (every window it judges is clean) — the page banner then says it in a generic line; nothing else was withheld (no drain / priority action change)', Array.isArray(dsF.body.dataQuality?.flags) && dsF.body.dataQuality.flags.length === 0 && dsF.body.dataQuality.withheld.every((w: any) => w.surface === 'aiRecommendations'), dsF.body.dataQuality);

  // SE-2 — weekly report, embedded and served
  check('SE-2 baseline: on VERIFIED IQD spend the report advises raising the best campaign\'s budget and carries the spend / cost-per-result changes', xV.body.recommendationsAr?.some((x: string) => x.includes('فكّر بزيادة ميزانيتها')) && xV.body.delta?.spendPct != null && xV.body.delta?.costPerResultPct != null && xV.body.dataQuality === undefined, advice(xV.body));
  check('SE-2: the USD twin\'s report has the same advice, changes, highlights and Brain counts as the verified IQD one; no dataQuality, no header on either route', same(advice(xD.body), advice(xV.body)) && xD.body.dataQuality === undefined && dq(xV.r) === null && dq(xD.r) === null, [advice(xD.body), advice(xV.body)]);
  check('SE-2: on UNVERIFIED spend the route answers 200 with X-Data-Quality: SPEND_SCALE_UNVERIFIED and the same flag in the body (CAMPAIGN level over the 7+7 days)', xU.r.status === 200 && dq(xU.r) === REASON && xU.body.dataQuality?.flags?.[0]?.code === REASON && xU.body.dataQuality.flags[0].level === 'CAMPAIGN' && xU.body.dataQuality.flags[0].of >= 10, [dq(xU.r), xU.body.dataQuality?.flags]);
  check('SE-2: …no budget-increase / pause advice in recommendationsAr; the worst-campaign line is the creative-only one; the reason is stated', !xU.body.recommendationsAr?.some((x: string) => /فكّر بزيادة ميزانيتها|أوقفها|لحماية الميزانية/.test(x)) && xU.body.recommendationsAr?.some((x: string) => x.includes('جدّد إبداعها')) && xU.body.recommendationsAr?.some((x: string) => x.includes('محجوبة')), xU.body.recommendationsAr);
  check('SE-2: …the spend and cost-per-result changes are null (results / CTR changes are not), pattern / healthScore / spend-dependent action of the highlights are withheld, the ranking is the verified one\'s',
    xU.body.delta?.spendPct === null && xU.body.delta?.costPerResultPct === null && xU.body.delta?.resultsPct === xV.body.delta?.resultsPct && xU.body.bestCampaign?.pattern === null && xU.body.bestCampaign?.healthScore === null && xU.body.bestCampaign?.action !== 'SCALE_BUDGET' && xU.body.bestCampaign?.ctr === xV.body.bestCampaign?.ctr, advice(xU.body));
  check('SE-2: the figures themselves are still shown as stored (the gate withholds advice and comparisons, not money)', xU.body.thisWeek?.spend === xV.body.thisWeek?.spend && xU.body.thisWeek?.spendDisplay === xV.body.thisWeek?.spendDisplay, [xU.body.thisWeek?.spendDisplay, xV.body.thisWeek?.spendDisplay]);
  check('SE-2: the SAME report is inside the unverified dashboard (advice identical to the route\'s), and the dashboard lists each withheld part under surface weeklyReport',
    same(dsU.body.weeklyReport?.recommendationsAr, xU.body.recommendationsAr) && dsU.body.weeklyReport?.dataQuality?.flags?.[0]?.code === REASON && ['recommendations', 'delta', 'campaignHighlights'].every((sf) => dsU.body.dataQuality?.withheld?.some((w: any) => w.surface === 'weeklyReport' && new RegExp(`^${sf}`).test(w.detail ?? ''))) && dsV.body.weeklyReport?.dataQuality === undefined, [dsU.body.weeklyReport?.recommendationsAr, dsU.body.dataQuality?.withheld]);

  // SE-5a — GET /recommendations says the window is not clean although nothing is stored
  const storedU = await prisma.recommendation.count({ where: { entityId: bTU.account.id } });
  const rcU = await recsOf(bTU), rcV = await recsOf(bTV), rcD = await recsOf(bTD);
  const rcUs = await recsOf(bTU, '?include=suppressed');
  check('SE-5 precondition: the unverified tenant has NO stored recommendation (the engines declined to write one)', storedU === 0, storedU);
  check('SE-5: GET /recommendations on it: 200, an empty list — AND X-Data-Quality: SPEND_SCALE_UNVERIFIED plus the withheld count header (0 stored rows suppressed)', rcU.r.status === 200 && same(rcU.body, []) && dq(rcU.r) === REASON && rcU.r.headers.get('x-recommendations-withheld') === '0', [rcU.r.status, rcU.body, dq(rcU.r), rcU.r.headers.get('x-recommendations-withheld')]);
  check('SE-5: ?include=suppressed carries the window flag in the body too (dataQuality.flags) for a client that cannot read headers', rcUs.body.dataQuality?.flags?.[0]?.code === REASON && rcUs.body.dataQuality.spendWithheldCount === 0 && same(rcUs.body.recommendations, []), rcUs.body);
  check('SE-5: the verified IQD twin and the USD twin send neither header', dq(rcV.r) === null && dq(rcD.r) === null && rcV.r.headers.get('x-recommendations-withheld') === null && rcD.r.headers.get('x-recommendations-withheld') === null, [dq(rcV.r), dq(rcD.r)]);

  // SE-6 — an evidence read that fails must not 500 the data endpoints
  const origQueryRaw = (prisma as any).$queryRaw.bind(prisma);
  let rawBroken = false;
  (prisma as any).$queryRaw = (q: any, ...v: any[]) => { const text = Array.isArray(q) ? q.join('?') : String(q?.strings?.join?.('?') ?? q); if (rawBroken && text.includes('raw_insights')) return Promise.reject(new Error('injected: raw_insights unreadable')); return origQueryRaw(q, ...v); };
  const read = async (path: string, t: Tenant) => { const r = await quiet(() => get(path, t.token))(); const text = await r.text(); let body: any = null; try { body = JSON.parse(text); } catch { /* not JSON */ } return { r, body }; };
  const [insOk, camOk] = [await read(`/api/workspaces/${bTV.ws.id}/insights?days=30`, bTV), await read(`/api/workspaces/${bTV.ws.id}/campaigns?days=30`, bTV)];
  rawBroken = true;
  const [insBr, camBr, recBr, dshBr, wkBr] = [
    await read(`/api/workspaces/${bTV.ws.id}/insights?days=30`, bTV), await read(`/api/workspaces/${bTV.ws.id}/campaigns?days=30`, bTV),
    await read(`/api/workspaces/${bTV.ws.id}/recommendations`, bTV), await read(`/api/dashboard/${bTV.ws.id}`, bTV), await read(`/api/weekly-report/${bTV.ws.id}`, bTV),
  ];
  const [insUsd, camUsd] = [await read(`/api/workspaces/${bTD.ws.id}/insights?days=30`, bTD), await read(`/api/workspaces/${bTD.ws.id}/campaigns?days=30`, bTD)];
  rawBroken = false;
  check('SE-6 control: with raw_insights readable, a verified IQD account\'s /insights and /campaigns answer 200 with no header', insOk.r.status === 200 && camOk.r.status === 200 && dq(insOk.r) === null && dq(camOk.r) === null && Array.isArray(insOk.body) && insOk.body.length > 0, [insOk.r.status, camOk.r.status]);
  check('SE-6: with raw_insights UNREADABLE, /insights answers 200 (not 500), the same rows as before, and X-Data-Quality: SPEND_SCALE_UNVERIFIED — fail closed on the flag, open on the data', insBr.r.status === 200 && dq(insBr.r) === REASON && same(insBr.body, insOk.body), [insBr.r.status, dq(insBr.r)]);
  check('SE-6: …and so does /campaigns', camBr.r.status === 200 && dq(camBr.r) === REASON && Array.isArray(camBr.body) && camBr.body.length === (camOk.body?.length ?? -1), [camBr.r.status, dq(camBr.r), camBr.body?.length, camOk.body?.length]);
  check('SE-6: …/recommendations, the dashboard (flag + withheld) and the weekly report (flag, report still served) keep answering 200 and fail closed too',
    recBr.r.status === 200 && dq(recBr.r) === REASON && dshBr.r.status === 200 && dshBr.body.dataQuality?.flags?.length >= 1 && wkBr.r.status === 200 && wkBr.body.dataQuality?.flags?.[0]?.unreadable === true && dq(wkBr.r) === REASON, [recBr.r.status, dq(recBr.r), dshBr.r.status, dshBr.body.dataQuality?.flags?.map((f: any) => f.code), wkBr.r.status, wkBr.body.dataQuality?.flags?.[0]]);
  check('SE-6: a USD account never touches raw_insights, so it is unaffected', insUsd.r.status === 200 && camUsd.r.status === 200 && dq(insUsd.r) === null && dq(camUsd.r) === null);

  // SE-4 — the prior window (the 30 days BEFORE the one the dashboard shows, which KPI deltas compare against)
  const priorRows = (priorScale: number, priorRaw: RawMode): Row[] => Array.from({ length: 62 }, (_, i) => ({ ago: i + 1, spend: (i < 30 ? 1 : priorScale) * 100_000, raw: (i < 30 ? 'match' : priorRaw) as RawMode, messages: 10 }));
  const pBad = await seed('prior-x100', { factor: 1, account: priorRows(100, 'none'), objective: 'MESSAGES' });
  const pOk = await seed('prior-verified', { factor: 1, account: priorRows(1, 'match'), objective: 'MESSAGES' });
  const pUsd = await seed('prior-usd', { currency: 'USD', factor: 100, account: priorRows(100, 'none'), objective: 'MESSAGES' });
  const [dpB, dpO, dpU] = [await dash(pBad), await dash(pOk), await dash(pUsd)];
  const priorFlag = (dpB.body.dataQuality?.flags ?? []).find((f: any) => f.window === 'prior');
  check('SE-4: current 30 days verified, prior 30 days stored x100 with no raws → dataQuality carries a flag marked window "prior" (SPEND_SCALE_UNVERIFIED, 30 of 30 rows, its period listed), and NO current-window flag',
    !!priorFlag && priorFlag.code === REASON && priorFlag.rows === 30 && priorFlag.of === 30 && priorFlag.periods?.length === 1 && priorFlag.periods[0].rows === 30 && /^prior window:/.test(priorFlag.message) && dpB.body.dataQuality.flags.length === 1, dpB.body.dataQuality);
  check('SE-4: it gates nothing — nothing is withheld (current window verified), and the KPI deltas are still shown as stored (as documented), so the flag is the only warning', (dpB.body.dataQuality?.withheld ?? []).length === 0 && !!dpB.body.kpis?.find((k: any) => k.key === 'spend'), dpB.body.dataQuality?.withheld);
  check('SE-4 control: the same account with a VERIFIED prior window has no dataQuality key at all; neither does the USD twin with the same unverified-looking prior rows', dpO.body.dataQuality === undefined && dpU.body.dataQuality === undefined, [dpO.body.dataQuality, dpU.body.dataQuality]);
  check('SE-4: a current-window flag, when there is one, comes FIRST and is not marked prior (the unverified Brain-twin dashboard)', dsU.body.dataQuality?.flags?.[0]?.window === undefined && dsU.body.dataQuality?.flags?.[0]?.code === REASON, dsU.body.dataQuality?.flags);

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 9. review round 3, SP-3: a VERIFIED IQD account whose campaigns do not reconcile only in the weekly window ──');
  // Every ACCOUNT row has its raw counterpart (verified, 61 days: current AND prior window clean). Two campaigns add up to 100 % of
  // the account row, except on days 3, 4, 5 ago where they add up to 85 % (a deleted / unsynced campaign): ONLY the weekly
  // report's CAMPAIGN-level 7+7 day reconciliation fails. Nothing the recommendations list is built from is in doubt.
  const wkOnlyRows = (n: number): CampRow[] => Array.from({ length: n }, (_, i) => ({ ago: i + 1, spend: i + 1 >= 3 && i + 1 <= 5 ? 42_500 : 50_000 }));
  const wkOnly = await seed('wk-only', { factor: 1, account: steady(61, () => 'match'), campaigns: [wkOnlyRows(61), wkOnlyRows(61)], objective: 'MESSAGES' });
  const wkOnlyUsd = await seed('wk-only-usd', { currency: 'USD', factor: 100, account: steady(61, () => 'none'), campaigns: [wkOnlyRows(61), wkOnlyRows(61)], objective: 'MESSAGES' });
  const [hWk, dWk, rWk, xWk, dWkU, rWkU] = [await health(wkOnly), await dash(wkOnly), await recsOf(wkOnly), await weekly(wkOnly), await dash(wkOnlyUsd), await recsOf(wkOnlyUsd)];
  check('SP-3 precondition: data-health says ALL CLEAR for the account (no SPEND_SCALE check, 0 unverified in its window) — the account IS verified', !hWk.body.checks?.some((c: any) => c.code.startsWith('SPEND_SCALE')) && hWk.body.spendScale?.window?.unverified === 0, [hWk.body.checks?.map((c: any) => c.code), hWk.body.spendScale?.window]);
  const wkFlag = dWk.body.dataQuality?.flags?.[0];
  check('SP-3: the weekly report fails closed on its own (flag at CAMPAIGN level, 3 of 14 days), as before — its advice is withheld and its X-Data-Quality is set',
    xWk.r.status === 200 && dq(xWk.r) === REASON && xWk.body.dataQuality?.flags?.[0]?.level === 'CAMPAIGN' && xWk.body.dataQuality.flags[0].rows === 3 && xWk.body.dataQuality.flags[0].of === 14 && !xWk.body.recommendationsAr?.some((x: string) => /فكّر بزيادة ميزانيتها|أوقفها|لحماية الميزانية/.test(x)), [dq(xWk.r), xWk.body.dataQuality?.flags]);
  check('SP-3: the dashboard\'s dataQuality carries that flag MARKED as the weekly report\'s (window "weekly") — it can no longer be read as the verdict of the 30-day window', dWk.body.dataQuality?.flags?.length === 1 && wkFlag?.window === 'weekly' && wkFlag.level === 'CAMPAIGN' && wkFlag.rows === 3, dWk.body.dataQuality?.flags);
  check('SP-3: …its text says what is withheld (the WEEKLY REPORT) in both languages, and does not say the account\'s spend is unverified', /weekly report/i.test(wkFlag?.message ?? '') && /التقرير الأسبوعي/.test(wkFlag?.messageAr ?? ''), [wkFlag?.message, wkFlag?.messageAr]);
  check('SP-3: every withheld entry of that dashboard is a weeklyReport one — nothing the recommendations list is made of (priorityAction, issues, knowledgeBase, steadyState) was withheld', (dWk.body.dataQuality?.withheld ?? []).length > 0 && dWk.body.dataQuality.withheld.every((w: any) => w.surface === 'weeklyReport'), dWk.body.dataQuality?.withheld);
  check('SP-3: GET /recommendations sends NO X-Data-Quality and NO X-Recommendations-Withheld — nothing was withheld from the list, and the window is clean', rWk.r.status === 200 && dq(rWk.r) === null && rWk.r.headers.get('x-recommendations-withheld') === null, [dq(rWk.r), rWk.r.headers.get('x-recommendations-withheld')]);
  const pagesDir = (rel: string) => readFileSync(path.join(__dirname, rel), 'utf8');
  const liftFn = (src: string, name: string): string | null => {
    const at = src.indexOf(`function ${name}(`); if (at < 0) return null;
    let depth = 0; let started = false;
    for (let i = src.indexOf('{', at); i < src.length; i++) { if (src[i] === '{') { depth++; started = true; } else if (src[i] === '}') { depth--; if (started && depth === 0) return src.slice(at, i + 1); } }
    return null;
  };
  const escH = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const banner = (rel: string, payload: unknown) => {
    const fn = liftFn(pagesDir(rel), 'renderDataQualityBanner'); if (!fn) return null;
    const box: any = { style: { display: 'none' }, innerHTML: '' };
    new Function('document', 'escHtml', 'lbl', `${fn}; renderDataQualityBanner(${JSON.stringify(payload)});`)({ getElementById: (id: string) => (id === 'data-quality-banner' ? box : null) }, escH, (_en: string, ar: string) => ar);
    return box as { style: { display: string }; innerHTML: string };
  };
  const recBanner = banner('src/web/pages/recommendationsPage.ts', dWk.body);
  const dashBanner = banner('src/web/pages/dashboardPage.ts', dWk.body);
  check('SP-3: the RECOMMENDATIONS page (run on the real payload) shows NO banner — it does not call the list "deliberately incomplete" when nothing was withheld from it', recBanner?.style.display === 'none' && recBanner.innerHTML === '' && !/ناقصة/.test(recBanner?.innerHTML ?? ''), recBanner);
  check('SP-3: the DASHBOARD page (run on the real payload) shows a banner that names the weekly report, does not use the "spend is not verified" title and does not claim the recommendations list is incomplete',
    dashBanner?.style.display === 'flex' && /التقرير الأسبوعي/.test(dashBanner.innerHTML) && !/الإنفاق غير موثَّق/.test(dashBanner.innerHTML) && !/ناقصة/.test(dashBanner.innerHTML), dashBanner);
  check('SP-3: the USD twin of the same rows: no dataQuality, no header, no banner (exactly as before)', dWkU.body.dataQuality === undefined && dq(rWkU.r) === null, [dWkU.body.dataQuality, dq(rWkU.r)]);
  // fail closed is intact on the account's OWN window: an unverified account still says so, on both pages, and still calls the list incomplete
  const recBannerU = banner('src/web/pages/recommendationsPage.ts', dsU.body);
  const dashBannerU = banner('src/web/pages/dashboardPage.ts', dsU.body);
  check('SP-3 control: an UNVERIFIED account keeps the "spend is not verified" title on both pages and the recommendations page still says its list may be incomplete',
    recBannerU?.style.display === 'flex' && /الإنفاق غير موثَّق/.test(recBannerU.innerHTML) && /ناقصة/.test(recBannerU.innerHTML) && dashBannerU?.style.display === 'flex' && /الإنفاق غير موثَّق/.test(dashBannerU.innerHTML), [recBannerU?.innerHTML.slice(0, 300), dashBannerU?.innerHTML.slice(0, 300)]);

  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── 10. review round 3, SP-1 / SP-2: the AI agent\'s READ tools and the campaign "investigate" tab obey the same evidence rule ──');
  const { ToolDispatcher } = await import('./src/services/agent/dispatcher');
  const { ToolCache } = await import('./src/services/agent/cache');
  const { RateLimiter } = await import('./src/services/agent/rateLimit');
  const { buildAgentToolHandlers } = await import('./src/services/agent/tools');
  const { investigateCampaign } = await import('./src/services/agent/investigate');
  // One fresh dispatcher per call (no cache, a roomy limiter): the envelope the MODEL gets, through the real dispatcher.
  const callTool = async (t: Tenant, name: string, args: unknown): Promise<any> =>
    quiet(() => new ToolDispatcher(buildAgentToolHandlers() as any, { prisma, workspaceId: t.ws.id, userId: t.user.id } as any, { cache: new ToolCache(), rateLimiter: new RateLimiter({ maxCalls: 10_000 } as any) }).dispatch(name, args))();
  // Two campaigns that always add up to the account row. Spend: today 107k; the last 7 days 120k; before that 99k/101k alternating.
  // Messages: 9/11 alternating before the window, 10 inside it, and ONE on ago 1 — so a spend anomaly AND a spend-free (messages) anomaly exist.
  const acctSpendAt = (ago: number) => (ago === 0 ? 107_000 : ago <= 7 ? 120_000 : ago % 2 === 0 ? 99_000 : 101_000);
  const acctMsgsAt = (ago: number) => (ago === 1 ? 1 : ago <= 7 ? 10 : ago % 2 === 0 ? 9 : 11);
  const agentAccount = (raw: RawMode): Row[] => Array.from({ length: 62 }, (_, ago) => ({ ago, spend: acctSpendAt(ago), raw, messages: acctMsgsAt(ago) }));
  const agentCamp = (c: number, drift = false): CampRow[] => Array.from({ length: 62 }, (_, ago) => ({ ago, spend: ago === 0 ? (c === 0 ? 57_000 : 50_000) : (drift && ago >= 3 && ago <= 5 ? 0.85 : 1) * acctSpendAt(ago) / 2, messages: Math.max(1, Math.round(acctMsgsAt(ago) / 2)) }));
  const agentTenant = (label: string, o: { currency?: string; factor?: number; raw: RawMode; drift?: boolean }) =>
    seed(label, { currency: o.currency, factor: o.factor ?? 1, account: agentAccount(o.raw), campaigns: [agentCamp(0, o.drift), agentCamp(1, o.drift)], budget: 60_000n, objective: 'MESSAGES' });
  const agV = await agentTenant('ag-ver', { raw: 'match' });
  const agU = await agentTenant('ag-unver', { raw: 'none' });
  const agD = await agentTenant('ag-usd', { currency: 'USD', factor: 100, raw: 'none' });
  const agR = await agentTenant('ag-recon', { raw: 'match', drift: true });   // account rows verified; the campaigns do not reconcile on days 3-5
  for (const t of [agV, agU, agD, agR]) {
    await prisma.detectedIssue.createMany({ data: [
      { entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(1), issueCode: IssueCode.RISING_COST_PER_RESULT, severity: 'HIGH', evidenceJson: [] },
      { entityType: EntityType.ACCOUNT, entityId: t.account.id, date: day(1), issueCode: IssueCode.HIGH_FREQUENCY, severity: 'MEDIUM', evidenceJson: [] },
    ] });
  }
  /** A result with this tenant's ids and the time-dependent burn rate taken out, so twin tenants can be compared byte for byte. */
  const scrub = (t: Tenant, v: unknown): string => {
    let j = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
    for (const [i, c] of t.campaigns.entries()) j = j.split(c.id).join(`CAMP${i}`);
    return j.split(t.account.id).join('ACCT').replace(/"(firstSeenInAdlyticAt|burnRatePerHour|executionMs|cachedSeconds|stalenessMinutes)":[^,}]*,?/g, '').replace(/,\}/g, '}');
  };
  const SIM = (t: Tenant) => ({ fromCampaignId: t.campaigns[0]!.id, toCampaignId: t.campaigns[1]!.id, shiftAmount: { value: 20, unit: 'pct_of_from' }, projectionDays: 7 });
  const spendMsg = (r: any) => String(r?.error?.message ?? '');

  // simulate_budget_shift — a budget move rests on spend entirely
  const [simV, simU, simD, simR] = [await callTool(agV, 'simulate_budget_shift', SIM(agV)), await callTool(agU, 'simulate_budget_shift', SIM(agU)), await callTool(agD, 'simulate_budget_shift', SIM(agD)), await callTool(agR, 'simulate_budget_shift', SIM(agR))];
  check('SP-2 baseline: on VERIFIED IQD spend simulate_budget_shift answers (ok, a projection, confidence high, no spendEvidence key)', simV.ok && simV.data.confidence === 'high' && simV.data.projected?.workspaceTotal != null && !('spendEvidence' in simV.data), simV);
  // (A USD account has factor 100, so its figures are in other units: byte-identity with the OLD source is proven by the
  // differential, scripts/repro/spend_evidence_differential.ts. Here: the USD answer is the ungated one.)
  check('SP-2: the USD twin answers as the verified account does — a projection, confidence high, no spendEvidence key, and not one evidence query was needed', simD.ok && simD.data.confidence === 'high' && simD.data.projected?.workspaceTotal != null && !('spendEvidence' in simD.data), simD);
  check('SP-2: on UNVERIFIED IQD spend it REFUSES (STALE_DATA, SPEND_SCALE_UNVERIFIED in the message, a suggestion) — no projection, no "confidence: high, caveats: []"',
    !simU.ok && simU.error.code === 'STALE_DATA' && /SPEND_SCALE_UNVERIFIED/.test(spendMsg(simU)) && /cannot be verified/.test(simU.error.suggestion ?? '') && !('data' in simU), simU);
  check('SP-2: …and it refuses exactly where save_recommendation refuses: a CAMPAIGN-level budget move on campaigns that do not reconcile with the verified account row', !simR.ok && simR.error.code === 'STALE_DATA', simR);
  const saveR = await quiet(() => saveRecommendationHandler().run({ entityType: 'CAMPAIGN', entityId: agR.campaigns[0]!.id, text: 'نص توصية طويل بما يكفي للتحقق', actionCode: 'INCREASE_BUDGET' as any, priority: 'HIGH', reasoning: 'This is a sufficiently long AI reasoning string for validation.' }, { prisma, workspaceId: agR.ws.id, userId: agR.user.id } as any))();
  check('SP-2: …(control) save_recommendation refuses the same budget move on the same tenant — the read tool and the write tool agree', !saveR.ok && (saveR as any).error.code === 'STALE_DATA', saveR);

  // get_campaign_details — spendPacing / vs-baseline are budget and cost advice in waiting
  const dtl = (t: Tenant) => callTool(t, 'get_campaign_details', { campaignId: t.campaigns[0]!.id });
  const [dtV, dtU, dtD, dtR] = [await dtl(agV), await dtl(agU), await dtl(agD), await dtl(agR)];
  check('SP-1 baseline: on VERIFIED IQD spend get_campaign_details has the pacing (95 % of budget, a burn rate), the spend / CPM / cost-per-message deltas, and no spendEvidence key',
    dtV.ok && dtV.data.spendPacing.pctOfBudget === 95 && typeof dtV.data.spendPacing.burnRatePerHour === 'number' && dtV.data.windowMetrics.cpm.deltaPct != null && dtV.data.vsBaseline.cpmPct != null && dtV.data.vsBaseline.spendPct != null && !('spendEvidence' in dtV.data), dtV.data?.spendPacing);
  check('SP-1: the USD twin returns the ungated details: pacing, comparisons, no spendEvidence key', dtD.ok && dtD.data.spendPacing.pctOfBudget === 95 && dtD.data.windowMetrics.cpm.deltaPct != null && dtD.data.vsBaseline.cpmPct != null && !('spendEvidence' in dtD.data), dtD.data?.spendPacing);
  const evU = dtU.data?.spendEvidence;
  check('SP-1: on UNVERIFIED IQD spend the details carry spendEvidence (SPEND_SCALE_UNVERIFIED, CAMPAIGN level, the window, counts, what was left out, an instruction for the model)',
    dtU.ok && evU?.code === REASON && evU.level === 'CAMPAIGN' && evU.unverified > 0 && typeof evU.from === 'string' && Array.isArray(evU.withheld) && evU.withheld.length >= 3 && /Do NOT give budget, pacing/.test(evU.note) && /SPEND_SCALE_UNVERIFIED/.test(evU.note), evU);
  check('SP-1: …the pacing is withheld (no % of budget, no burn rate — the numbers an "raise the budget" sentence is made of), and so are the spend / CPM / cost-per-message comparisons against the prior window and the baseline',
    dtU.data.spendPacing.pctOfBudget === null && dtU.data.spendPacing.burnRatePerHour === null && dtU.data.windowMetrics.spend.deltaPct === null && dtU.data.windowMetrics.cpm.deltaPct === null && dtU.data.windowMetrics.cost_per_message.deltaPct === null
      && dtU.data.vsBaseline.spendPct === null && dtU.data.vsBaseline.cpmPct === null && dtU.data.vsBaseline.costPerMessagePct === null, [dtU.data?.spendPacing, dtU.data?.vsBaseline]);
  check('SP-1: …what does not rest on spend is exactly the verified account\'s: CTR and messages (current, prior, delta), the CTR / messages baseline deltas, the learning phase, the campaign block',
    JSON.stringify([dtU.data.windowMetrics.ctr, dtU.data.windowMetrics.messages, dtU.data.vsBaseline.ctrPct, dtU.data.vsBaseline.messagesPct, dtU.data.learningPhase]) === JSON.stringify([dtV.data.windowMetrics.ctr, dtV.data.windowMetrics.messages, dtV.data.vsBaseline.ctrPct, dtV.data.vsBaseline.messagesPct, dtV.data.learningPhase]), [dtU.data?.windowMetrics?.ctr, dtV.data?.windowMetrics?.ctr]);
  check('SP-1: …the absolute spend figures are shown as stored (the gate withholds advice and comparisons, not money)', dtU.data.windowMetrics.spend.current === dtV.data.windowMetrics.spend.current && dtU.data.spendPacing.todaySpend === dtV.data.spendPacing.todaySpend && dtU.data.spendPacing.dailyBudget === dtV.data.spendPacing.dailyBudget);
  check('SP-1: a spend-dependent stored issue (RISING_COST_PER_RESULT) never reaches the details of an unverified account: topIssues has none', (dtU.data.topIssues ?? []).every((i: any) => !S.isSpendDependentIssueCode(i.code)), dtU.data?.topIssues);
  check('SP-1: levels — the account rows are verified but the campaigns do not reconcile (days 3-5): the CAMPAIGN-level details are gated too (the same verdict the Brain and save_recommendation use)', dtR.ok && dtR.data.spendEvidence?.code === REASON && dtR.data.spendEvidence.level === 'CAMPAIGN' && dtR.data.spendEvidence.unverified === 3 && dtR.data.spendPacing.pctOfBudget === null, dtR.data?.spendEvidence);

  // list_campaigns
  const lst = (t: Tenant, extra: object = {}) => callTool(t, 'list_campaigns', { ...extra });
  const [lsV, lsU, lsD] = [await lst(agV), await lst(agU), await lst(agD)];
  const metricsOf = (r: any) => r.data.campaigns.map((c: any) => c.metrics);
  check('SP-2 baseline: verified IQD list_campaigns carries the spend / CPM / cost-per-message deltas and no spendEvidence key; so does the USD twin', lsV.ok && lsV.data.campaigns.every((c: any) => c.metrics.spend.deltaPct != null && c.metrics.cpm.deltaPct != null) && !('spendEvidence' in lsV.data) && lsD.ok && lsD.data.campaigns.every((c: any) => c.metrics.spend.deltaPct != null && c.metrics.cpm.deltaPct != null) && !('spendEvidence' in lsD.data), [lsV.data?.campaigns?.[0]?.metrics?.spend]);
  check('SP-2: on UNVERIFIED IQD spend list_campaigns carries spendEvidence, and the spend / CPM / cost-per-message deltas are null while CTR / messages / ROAS are exactly the verified ones',
    lsU.ok && lsU.data.spendEvidence?.code === REASON && metricsOf(lsU).every((m: any) => m.spend.deltaPct === null && m.cpm.deltaPct === null && m.cost_per_message.deltaPct === null)
      && JSON.stringify(metricsOf(lsU).map((m: any) => [m.ctr, m.messages, m.roas])) === JSON.stringify(metricsOf(lsV).map((m: any) => [m.ctr, m.messages, m.roas])), [lsU.data?.spendEvidence, metricsOf(lsU)[0]?.spend]);
  const lsUSorted = await lst(agU, { sortBy: 'cost_per_message' });
  check('SP-2: …a request to SORT by a spend metric is not honoured on unverified spend (the order is by health) and the result says so', lsUSorted.ok && lsUSorted.data.spendEvidence?.withheld?.some((w: string) => /sort/i.test(w)), lsUSorted.data?.spendEvidence?.withheld);

  // rank_campaigns
  const rnk = (t: Tenant, metric: string) => callTool(t, 'rank_campaigns', { metric });
  const [rkVc, rkUc, rkDc, rkVt, rkUt] = [await rnk(agV, 'cost_per_message'), await rnk(agU, 'cost_per_message'), await rnk(agD, 'cost_per_message'), await rnk(agV, 'ctr'), await rnk(agU, 'ctr')];
  check('SP-2: rank_campaigns by cost_per_message — verified IQD and USD answer (same ranking, no spendEvidence); UNVERIFIED IQD refuses (STALE_DATA, SPEND_SCALE_UNVERIFIED): a ranking by cost per result is a cost comparison',
    rkVc.ok && rkDc.ok && !('spendEvidence' in rkVc.data) && !('spendEvidence' in rkDc.data) && rkDc.data.ranked.map((r: any) => r.campaignName).join() === rkVc.data.ranked.map((r: any) => r.campaignName).join() && !rkUc.ok && rkUc.error.code === 'STALE_DATA' && /SPEND_SCALE_UNVERIFIED/.test(spendMsg(rkUc)), [rkVc.ok, rkUc]);
  check('SP-2: …the same refusal for the other spend metrics (cpm, spend), while a ranking by CTR / messages / health is untouched on unverified spend (same answer as the verified account, no spendEvidence key)',
    !(await rnk(agU, 'cpm')).ok && !(await rnk(agU, 'spend')).ok && rkUt.ok && !('spendEvidence' in rkUt.data) && scrub(agU, rkUt.data) === scrub(agV, rkVt.data) && (await rnk(agU, 'messages')).ok && (await rnk(agU, 'health')).ok, [rkUt]);

  // compare_periods
  const cmp = (t: Tenant, entityType: 'ACCOUNT' | 'CAMPAIGN') => callTool(t, 'compare_periods', { entityType, entityId: entityType === 'ACCOUNT' ? t.account.id : t.campaigns[0]!.id, windowA: { sinceDaysAgo: 7, untilDaysAgo: 1 }, windowB: { sinceDaysAgo: 14, untilDaysAgo: 8 } });
  const [cpV, cpU, cpD, cpVc, cpUc, cpRa, cpRc] = [await cmp(agV, 'ACCOUNT'), await cmp(agU, 'ACCOUNT'), await cmp(agD, 'ACCOUNT'), await cmp(agV, 'CAMPAIGN'), await cmp(agU, 'CAMPAIGN'), await cmp(agR, 'ACCOUNT'), await cmp(agR, 'CAMPAIGN')];
  check('SP-2 baseline: verified IQD compare_periods has the spend delta (+20 %), confidence high, and no spendEvidence key; so has the USD twin', cpV.ok && Math.round(cpV.data.deltas.spendPct) === 20 && cpV.data.verdicts.confidence === 'high' && !('spendEvidence' in cpV.data) && cpD.ok && Math.round(cpD.data.deltas.spendPct) === 20 && cpD.data.verdicts.confidence === 'high' && !('spendEvidence' in cpD.data), [cpV.data?.deltas, cpV.data?.verdicts]);
  check('SP-2: on UNVERIFIED IQD spend the spend / CPM / cost-per-message deltas are null, the verdict is made from what does not rest on spend, confidence is LOW, spendEvidence says why',
    cpU.ok && cpU.data.deltas.spendPct === null && cpU.data.deltas.cpmPct === null && cpU.data.deltas.costPerMessagePct === null && cpU.data.deltas.messagesPct === cpV.data.deltas.messagesPct && cpU.data.deltas.ctrPct === cpV.data.deltas.ctrPct
      && cpU.data.verdicts.confidence === 'low' && cpU.data.spendEvidence?.code === REASON && cpU.data.spendEvidence.level === 'ACCOUNT' && !cpU.data.verdicts.reasons.some((r: string) => /الإنفاق|CPM|تكلفة الرسالة/.test(r) && !/حُجب|لم يُتحقق/.test(r)), [cpU.data?.deltas, cpU.data?.verdicts, cpU.data?.spendEvidence]);
  check('SP-2: …a campaign-level comparison on unverified spend is gated at CAMPAIGN level', cpUc.ok && cpUc.data.spendEvidence?.level === 'CAMPAIGN' && cpUc.data.deltas.spendPct === null && cpUc.data.verdicts.confidence === 'low' && cpVc.ok && !('spendEvidence' in cpVc.data) && cpVc.data.verdicts.confidence === 'high', [cpUc.data?.spendEvidence, cpVc.data?.verdicts]);
  check('SP-2: …levels: on the tenant whose account rows are verified but whose campaigns do not reconcile, the ACCOUNT comparison is clean and the CAMPAIGN comparison is gated',
    cpRa.ok && !('spendEvidence' in cpRa.data) && Math.round(cpRa.data.deltas.spendPct) === 20 && cpRc.ok && cpRc.data.spendEvidence?.level === 'CAMPAIGN' && cpRc.data.deltas.spendPct === null, [cpRa.data?.spendEvidence, cpRc.data?.spendEvidence]);

  // detect_anomaly
  const ano = (t: Tenant, scope: 'workspace' | 'campaign' = 'workspace') => callTool(t, 'detect_anomaly', scope === 'workspace' ? { scope, lookbackDays: 7 } : { scope, campaignId: t.campaigns[0]!.id, lookbackDays: 7 });
  const [anV, anU, anD, anUc] = [await ano(agV), await ano(agU), await ano(agD), await ano(agU, 'campaign')];
  const metricsIn = (r: any) => [...new Set((r.data.anomalies as any[]).map((a) => a.metric))].sort();
  check('SP-2 baseline: verified IQD detect_anomaly flags the spend spike (and the messages drop), lists the stored issue codes incl. RISING_COST_PER_RESULT, no spendEvidence key; so does the USD twin',
    anV.ok && metricsIn(anV).includes('spend') && metricsIn(anV).includes('messages') && anV.data.canonicalIssueCodes.includes('RISING_COST_PER_RESULT') && !('spendEvidence' in anV.data) && anD.ok && metricsIn(anD).includes('spend') && anD.data.canonicalIssueCodes.includes('RISING_COST_PER_RESULT') && !('spendEvidence' in anD.data), [metricsIn(anV), anV.data?.canonicalIssueCodes]);
  check('SP-2: on UNVERIFIED IQD spend the z-scores over spend, CPM and cost per message are not reported (a spend spike across a x100 boundary is not an anomaly), the messages anomaly IS, the spend-dependent stored issue is not listed, spendEvidence says why',
    anU.ok && !metricsIn(anU).some((m) => ['spend', 'cpm', 'cost_per_message'].includes(m)) && metricsIn(anU).includes('messages') && !anU.data.canonicalIssueCodes.includes('RISING_COST_PER_RESULT') && anU.data.canonicalIssueCodes.includes('HIGH_FREQUENCY') && anU.data.spendEvidence?.code === REASON && anU.data.spendEvidence.level === 'ACCOUNT', [metricsIn(anU), anU.data?.canonicalIssueCodes, anU.data?.spendEvidence]);
  check('SP-2: …a campaign-scope scan is gated at CAMPAIGN level', anUc.ok && anUc.data.spendEvidence?.level === 'CAMPAIGN' && !metricsIn(anUc).some((m) => ['spend', 'cpm', 'cost_per_message'].includes(m)), [anUc.data?.spendEvidence]);

  // fail closed: an evidence read that fails withholds (IQD), and never touches USD
  rawBroken = true;
  const [simBr, dtBr, lsBr, simBrUsd, dtBrUsd] = [await callTool(agV, 'simulate_budget_shift', SIM(agV)), await dtl(agV), await lst(agV), await callTool(agD, 'simulate_budget_shift', SIM(agD)), await dtl(agD)];
  rawBroken = false;
  check('SP-2: evidence UNREADABLE → fail closed: simulate refuses, details and list are gated with spendEvidence.unreadable (never answered on a guess); the USD account never reads raw_insights and is unaffected',
    !simBr.ok && simBr.error.code === 'STALE_DATA' && dtBr.ok && dtBr.data.spendEvidence?.unreadable === true && dtBr.data.spendPacing.pctOfBudget === null && lsBr.ok && lsBr.data.spendEvidence?.unreadable === true && simBrUsd.ok && dtBrUsd.ok && !('spendEvidence' in dtBrUsd.data), [simBr, dtBr.data?.spendEvidence, simBrUsd.ok]);
  const rawReads = async (t: Tenant, fn: () => Promise<unknown>) => { let n = 0; const orig = (prisma as any).$queryRaw; (prisma as any).$queryRaw = (q: any, ...v: any[]) => { if ((Array.isArray(q) ? q.join('?') : '').includes('raw_insights')) n++; return orig(q, ...v); }; try { await fn(); } finally { (prisma as any).$queryRaw = orig; } return n; };
  check('SP-2: USD makes no evidence query for any of the six tools; an IQD account reads raw_insights', (await rawReads(agD, async () => { await Promise.all([callTool(agD, 'simulate_budget_shift', SIM(agD)), dtl(agD), lst(agD), rnk(agD, 'cost_per_message'), cmp(agD, 'ACCOUNT'), ano(agD)]); })) === 0 && (await rawReads(agV, async () => { await dtl(agV); })) > 0);

  // the campaign "investigate" tab — POST /api/workspaces/:ws/campaigns/:camp/investigate (offline narratives: AI_AGENT_V2_ENABLED is unset)
  delete process.env['AI_AGENT_V2_ENABLED'];
  const investigate = async (t: Tenant) => { const r = await quiet(() => post(`/api/workspaces/${t.ws.id}/campaigns/${t.campaigns[0]!.id}/investigate`, t.token))(); return { r, body: (await r.json()) as any }; };
  const [ivV, ivU, ivD] = [await investigate(agV), await investigate(agU), await investigate(agD)];
  const section = (b: any, key: string): string => String((b.sections ?? []).find((x: any) => x.key === key)?.narrative ?? '');
  const maskBurn = (x: string) => x.replace(/معدل الحرق [0-9.,]+ لكل ساعة/g, 'معدل الحرق N لكل ساعة').replace(/[0-9.,]+\/ساعة/g, 'N/ساعة');
  check('SP-1 baseline: on VERIFIED IQD spend the investigate tab\'s budget section tells the merchant to raise the budget (97 % → 95 %: "ارفع الميزانية اليومية"), as before', ivV.r.status === 200 && /ارفع الميزانية اليومية/.test(section(ivV.body, 'budget')) && ivV.body.spendEvidence === undefined, [ivV.r.status, section(ivV.body, 'budget')]);
  check('SP-1: the USD twin\'s investigation is the ungated one: the same raise-the-budget budget section (burn rate, which depends on the clock, masked), eight sections, no spendEvidence', ivD.r.status === 200 && ivD.body.sections.length === 8 && maskBurn(section(ivD.body, 'budget')) === maskBurn(section(ivV.body, 'budget')) && ivD.body.spendEvidence === undefined, [section(ivD.body, 'budget')]);
  check('SP-1: on UNVERIFIED IQD spend the budget section gives NO budget move — no "raise the budget", no "cut spend on the pricier placements" — and says the spend could not be verified',
    ivU.r.status === 200 && !/ارفع الميزانية|قلّل الإنفاق|ارفع/.test(section(ivU.body, 'budget')) && /لم يُتحقق|تعذّر التحقق|غير موثَّق/.test(section(ivU.body, 'budget')) && section(ivU.body, 'budget') !== section(ivV.body, 'budget'), section(ivU.body, 'budget'));
  check('SP-1: …the report carries spendEvidence (SPEND_SCALE_UNVERIFIED) next to the sections, and the structure and historical sections state no spend / CPM comparison against the baseline and say why',
    ivU.body.spendEvidence?.code === REASON && !/الإنفاق مقابل الأساس|تكلفة الألف ظهور مقابل الأساس/.test(section(ivU.body, 'historical_trend')) && /لم يُتحقق|غير موثَّق/.test(section(ivU.body, 'historical_trend')) && !/إنفاق النافذة الحالية [0-9,.]+ \(/.test(section(ivU.body, 'structure')) && /إنفاق النافذة الحالية [0-9,.]+ \(/.test(section(ivV.body, 'structure')) && /الإنفاق مقابل الأساس/.test(section(ivV.body, 'historical_trend')), [ivU.body.spendEvidence?.code, section(ivU.body, 'historical_trend'), section(ivU.body, 'structure')]);
  check('SP-1: …and what does not rest on spend is the same as the verified account\'s (learning phase, pixel health sections)', section(ivU.body, 'learning_phase') === section(ivV.body, 'learning_phase') && section(ivU.body, 'pixel_health') === section(ivV.body, 'pixel_health'));
  const sameDay = ivU.body.sections.map((x: any) => x.key).join() === ivV.body.sections.map((x: any) => x.key).join();
  check('SP-1: the same eight sections come back for the unverified campaign (the tab does not break)', sameDay && ivU.body.sections.length === 8, ivU.body.sections?.map((x: any) => x.key));

  // the LLM path: a stubbed provider (no network) shows what the MODEL is handed
  const realFetch = globalThis.fetch;
  const seen: Array<{ system: string; user: string }> = [];
  (globalThis as any).fetch = async (_u: unknown, init: any) => {
    const b = JSON.parse(String(init?.body ?? '{}'));
    seen.push({ system: JSON.stringify(b.system ?? ''), user: JSON.stringify(b.messages ?? []) });
    return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: JSON.stringify({ budget: 'x' }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const keys = [process.env['ANTHROPIC_API_KEY'], process.env['OPENAI_API_KEY']];
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-not-real'; delete process.env['OPENAI_API_KEY']; process.env['AI_AGENT_V2_ENABLED'] = 'true';
  const llmV = await agentTenant('ag-ver-llm', { raw: 'match' });
  const llmU = await agentTenant('ag-unver-llm', { raw: 'none' });
  try {
    await quiet(() => investigateCampaign({ prisma, workspaceId: llmV.ws.id, userId: llmV.user.id, campaignId: llmV.campaigns[0]!.id }))();
    const seenV = seen.splice(0);
    await quiet(() => investigateCampaign({ prisma, workspaceId: llmU.ws.id, userId: llmU.user.id, campaignId: llmU.campaigns[0]!.id }))();
    const seenU = seen.splice(0);
    check('SP-1 (model prompt): the provider IS reached (stub) for both — so the next two checks prove something', seenV.length >= 1 && seenU.length >= 1, [seenV.length, seenU.length]);
    check('SP-1 (model prompt): for a VERIFIED account the model is handed the pacing (pctOfBudget) and nothing about spend evidence — the prompt is what it always was', seenV.some((x) => /pctOfBudget/.test(x.user)) && seenV.every((x) => !/spendEvidence|SPEND_SCALE/.test(x.user + x.system)), seenV.map((x) => x.user.slice(0, 200)));
    check('SP-1 (model prompt): for an UNVERIFIED account the model is handed spendEvidence (reason code, the instruction) and NO pacing numbers, and its instructions say what to do with it',
      seenU.some((x) => /spendEvidence/.test(x.user) && /SPEND_SCALE_UNVERIFIED/.test(x.user) && !/pctOfBudget\\":9|burnRatePerHour\\":[0-9]/.test(x.user) && /spendEvidence/.test(x.system)), seenU.map((x) => [x.system.slice(-300), x.user.slice(0, 300)]));
  } finally {
    (globalThis as any).fetch = realFetch; delete process.env['AI_AGENT_V2_ENABLED'];
    if (keys[0] === undefined) delete process.env['ANTHROPIC_API_KEY']; else process.env['ANTHROPIC_API_KEY'] = keys[0];
    if (keys[1] === undefined) delete process.env['OPENAI_API_KEY']; else process.env['OPENAI_API_KEY'] = keys[1];
  }

  console.log(`\n${pass} passed, ${fail} failed   (database: ${dbName})`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('test_spend_evidence_postgres crashed:', e); process.exit(1); });
