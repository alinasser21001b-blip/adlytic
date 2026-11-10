// ═════════════════════════════════════════════════════════════════════════
//  test_iqd_repair_postgres.ts — the IQD repair and the read-only GETs, on a
//  SYNTHETIC local Postgres. Not part of test:all (CI has no database); run:
//
//    createdb adlytic_repro_iqd && DATABASE_URL=… npx prisma migrate deploy
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_iqd \
//      npm run test:iqd-repair-pg
//
//  It REFUSES to run unless the host is loopback and the database is named
//  adlytic_repro*, and it exits 2 ("NOT RUN") — never a silent green — when it
//  cannot connect. All figures are synthetic IQD amounts.
//
//  Covers: correct IQD rows are never rewritten; GETs write nothing and give the
//  same answers for a stale-factor account as for a canonical one; concurrent
//  repairs act exactly once; a concurrent writer wins over the repair; failure
//  rolls EVERYTHING back (factor included); rows stranded with factor=1 are
//  repaired from evidence; ambiguous rows stay intact; other tenants are never
//  touched; sync-side behaviour; the integrity signal.
// ═════════════════════════════════════════════════════════════════════════

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
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TRUE_SPEND = 150_000;      // synthetic IQD per campaign per day
const IMPRESSIONS = 25_000;      // => CPM 6 000 IQD: the shape that fooled the old heuristic
const DAYS = [1, 2, 3];

async function main() {
  const { PrismaClient, EntityType } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('./src/api/server');
  const { signToken } = await import('./src/services/jwtAuth');
  const R = await import('./src/lib/iqdRepair');
  const { runDataIntegrityCheck } = await import('./src/services/dataIntegrityMonitor');
  const { generateWeeklyReport } = await import('./src/services/weeklyReport');

  const pool = new pg.Pool({
    host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password), database: dbName, max: 20, connectionTimeoutMillis: 4000,
  });
  try { await pool.query('select 1'); } catch (e) { console.error('NOT RUN: cannot reach the synthetic database:', (e as Error).message); process.exit(2); }
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const app = buildRoutes(prisma);

  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };
  let seq = 0;

  // 'restated': sync APPENDS a raw row on every run, so a day can carry an earlier, different
  // value next to the final one. The stored (correct) value matches the final one.
  // 'stale100': the day carries a raw row equal to the stored (x100) value AND another raw that is exactly
  // 1/100 of it: "equal to SOME raw" must not bless a row that another raw proves is x100.
  type RawMode = 'none' | 'match' | 'conflict' | 'restated' | 'stale100';
  interface SeedOpts { currency?: string; factor: number; scale: 'correct' | 'over' | 'ambiguous37'; raw: RawMode; campaigns?: number; /** extra ACCOUNT-level rows N days ago, never with a raw counterpart */ oldAccountRows?: number[] }

  /** One synthetic tenant. `over` = every money field x100; `ambiguous37` = x37 (matches neither scale). */
  async function seed(label: string, o: SeedOpts) {
    const n = `${label}-${++seq}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({ data: { email: `${n}@repro.invalid`, passwordHash: 'x', name: n, isActive: true } });
    const ws = await prisma.workspace.create({ data: { name: 'Synthetic' } });
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' } });
    const account = await prisma.adAccount.create({
      data: { workspaceId: ws.id, externalAccountId: `act_${n}`, name: 'Synthetic account', currency: o.currency ?? 'IQD', currencyMinorFactor: o.factor, timezone: 'UTC', metaAccountStatus: 1, lastSyncedAt: new Date() },
    });
    const nCamp = o.campaigns ?? 2;
    const campaigns = [];
    for (let c = 0; c < nCamp; c++) campaigns.push(await prisma.campaign.create({ data: { adAccountId: account.id, externalCampaignId: `c${c}_${n}`, name: `Campaign ${c}` } }));
    const k = o.scale === 'over' ? 100 : o.scale === 'ambiguous37' ? 37 : 1;
    const entities: Array<{ type: 'ACCOUNT' | 'CAMPAIGN'; id: string; spend: number }> = [
      { type: 'ACCOUNT', id: account.id, spend: TRUE_SPEND * nCamp },
      ...campaigns.map((c) => ({ type: 'CAMPAIGN' as const, id: c.id, spend: TRUE_SPEND })),
    ];
    for (const e of entities) {
      for (const d of DAYS) {
        await prisma.dailyStat.create({
          data: {
            entityType: e.type === 'ACCOUNT' ? EntityType.ACCOUNT : EntityType.CAMPAIGN, entityId: e.id, date: day(d),
            spend: BigInt(e.spend * k), impressions: BigInt(IMPRESSIONS), clicks: 500n,
            cpm: (e.spend / IMPRESSIONS * 1000) * k, cpc: (e.spend / 500) * k, costPerMessage: 2_000 * k, revenueMinor: BigInt(400_000 * k),
          },
        });
        if (o.raw !== 'none') {
          const et = e.type === 'ACCOUNT' ? EntityType.ACCOUNT : EntityType.CAMPAIGN;
          if (o.raw === 'restated') await prisma.rawInsight.create({ data: { entityType: et, entityId: e.id, date: day(d), rawJson: { spend: String(Math.round(e.spend * 0.6)) } } });
          await prisma.rawInsight.create({ data: { entityType: et, entityId: e.id, date: day(d), rawJson: { spend: String(e.spend) } } });
          if (o.raw === 'conflict') await prisma.rawInsight.create({ data: { entityType: et, entityId: e.id, date: day(d), rawJson: { spend: String(Math.round(e.spend * 0.6)) } } });
          if (o.raw === 'stale100') await prisma.rawInsight.create({ data: { entityType: et, entityId: e.id, date: day(d), rawJson: { spend: String(e.spend * 100) } } });
        }
      }
    }
    for (const d of o.oldAccountRows ?? []) {
      await prisma.dailyStat.create({ data: { entityType: EntityType.ACCOUNT, entityId: account.id, date: day(d), spend: BigInt(TRUE_SPEND * nCamp * k), impressions: BigInt(IMPRESSIONS), clicks: 500n } });
    }
    const token = signToken({ sub: user.id, email: user.email, ver: 0 });
    return { user, ws, account, campaigns, token, ids: [account.id, ...campaigns.map((c) => c.id)] };
  }
  type Tenant = Awaited<ReturnType<typeof seed>>;

  async function snap(t: Tenant) {
    const a = await prisma.adAccount.findUniqueOrThrow({ where: { id: t.account.id }, select: { currencyMinorFactor: true, lifetimeSpendMinor: true } });
    const rows = await prisma.dailyStat.findMany({ where: { entityId: { in: t.ids } }, orderBy: [{ entityId: 'asc' }, { date: 'asc' }] });
    return {
      factor: a.currencyMinorFactor, lifetime: String(a.lifetimeSpendMinor),
      stats: rows.map((r) => ({ e: r.entityId, d: r.date.toISOString().slice(0, 10), spend: String(r.spend), cpm: r.cpm, cpc: r.cpc, cps: r.costPerMessage, rev: String(r.revenueMinor) })),
    };
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const spends = (s: Awaited<ReturnType<typeof snap>>) => [...new Set(s.stats.map((r) => r.spend))];

  /**
   * Database-level proof of "nothing was written": the xmin of every row of the
   * tenant. Any UPDATE — even one that stores the same value — creates a new row
   * version with a new xmin; a DELETE removes the row; an INSERT adds one.
   * (pg_stat counters were tried first and rejected: idle backends flush them
   * only every ~10 s, so they lag behind the statements.)
   */
  async function xmins(t: Tenant) {
    const a = await prisma.$queryRaw<unknown[]>`SELECT id, xmin::text AS x FROM ad_accounts WHERE id = ${t.account.id}`;
    const c = await prisma.$queryRaw<unknown[]>`SELECT id, xmin::text AS x FROM campaigns WHERE ad_account_id = ${t.account.id} ORDER BY id`;
    const s = await prisma.$queryRaw<unknown[]>`SELECT id, xmin::text AS x FROM daily_stats WHERE entity_id = ANY(${t.ids}) ORDER BY id`;
    const r = await prisma.$queryRaw<unknown[]>`SELECT id, xmin::text AS x FROM raw_insights WHERE entity_id = ANY(${t.ids}) ORDER BY id`;
    return JSON.stringify([a, c, s, r]);
  }

  const get = (path: string, token: string) => app.request(path, { headers: { authorization: `Bearer ${token}` } });
  const log = console.log; const quiet = <T,>(fn: () => Promise<T>) => async () => { console.log = () => {}; console.info = () => {}; try { return await fn(); } finally { console.log = log; console.info = log; } };

  // ── 1. GETs write nothing, and answer the same for a stale account ───
  console.log('\n── 1. every IQD-reaching GET is read-only and indifferent to the stored factor ──');
  const stale = await seed('stale', { factor: 100, scale: 'correct', raw: 'none' });
  const canon = await seed('canon', { factor: 1, scale: 'correct', raw: 'none' });
  const routes = (t: Tenant) => {
    const w = `/api/workspaces/${t.ws.id}`; const c = t.campaigns[0]!.id;
    return [
      w, `${w}/data-health`, `${w}/campaigns`, `${w}/export/campaigns.csv`, `${w}/export/insights.csv`,
      `${w}/campaigns/${c}`, `${w}/campaigns/${c}/why`, `${w}/campaigns/${c}/inspector`, `${w}/campaigns/${c}/adsets`,
      `${w}/adsets/none`, `${w}/adsets/none/ads`, `${w}/ads/none`,
      `${w}/insights`, `${w}/issue-dates`, `${w}/attribution`, `${w}/insights/trends`, `${w}/recommendations`,
      `${w}/refresh-log`, `${w}/issues`, `${w}/ad-assessor/campaigns`, `${w}/ad-assessor/context`, `/api/dashboard/${t.ws.id}`,
    ];
  };
  const before1 = await snap(stale);
  const x0 = await xmins(stale);
  const staleRes: Record<number, { status: number; text: string }> = {};
  const rs = routes(stale);
  for (let i = 0; i < rs.length; i++) { const r = await quiet(() => get(rs[i]!, stale.token))(); staleRes[i] = { status: r.status, text: await r.text() }; }
  const x1 = await xmins(stale);
  const after1 = await snap(stale);
  check(`all ${rs.length} read routes answered (no 5xx)`, Object.values(staleRes).every((r) => r.status < 500), Object.entries(staleRes).filter(([, r]) => r.status >= 500).map(([i, r]) => [rs[Number(i)], r.status]));
  check('stale IQD account: stored factor untouched (still 100)', after1.factor === 100, after1.factor);
  check('stale IQD account: every correct row untouched (spend, cpm, cpc, cost/message, revenue)', same(before1.stats, after1.stats), spends(after1));
  check('database-level proof: not one row of the tenant (account, campaigns, daily_stats, raw_insights) got a new version — no UPDATE, not even a no-op one', x0 === x1, { x0: x0.length, x1: x1.length });

  // same answers for stale vs canonical, ids and volatile fields normalised
  const idMap = new Map<string, string>([
    [stale.ws.id, 'WS'], [stale.account.id, 'ACC'], [stale.user.id, 'USER'], [stale.account.externalAccountId, 'EXT'],
    ...stale.campaigns.map((c, i) => [c.id, `C${i}`] as [string, string]), ...stale.campaigns.map((c, i) => [c.externalCampaignId, `XC${i}`] as [string, string]),
  ]);
  const idMap2 = new Map<string, string>([
    [canon.ws.id, 'WS'], [canon.account.id, 'ACC'], [canon.user.id, 'USER'], [canon.account.externalAccountId, 'EXT'],
    ...canon.campaigns.map((c, i) => [c.id, `C${i}`] as [string, string]), ...canon.campaigns.map((c, i) => [c.externalCampaignId, `XC${i}`] as [string, string]),
  ]);
  const VOLATILE = new Set(['checkedAt', 'generatedAt', 'timestamp', 'computedAt', 'createdAt', 'updatedAt', 'syncAgeHours', 'lastSyncedAt', 'bootedAt', 'at', 'now', 'durationMs', 'ms', 'tookMs', 'fetchedAt', 'since', 'until', 'asOf']);
  const CUID = /^c[a-z0-9]{20,}$/;
  /** Ids of tenant objects become tokens; remaining cuid `id` fields are row identities, not data. */
  const normalise = (text: string, ids: Map<string, string>, isHealth: boolean): unknown => {
    let s = text; for (const [k, v] of ids) s = s.split(k).join(v);
    try {
      const j = JSON.parse(s, (k, v) => (VOLATILE.has(k) ? undefined : k === 'id' && typeof v === 'string' && CUID.test(v) ? 'ROW' : v));
      if (isHealth && j && typeof j === 'object') {
        // The ONE intended difference: the new scale signal itself. Compare everything else.
        j.checks = (j.checks ?? []).filter((c: { code: string }) => !c.code.startsWith('SPEND_SCALE') && c.code !== 'ALL_CLEAR');
        delete j.overallStatus;
        if (j.spendScale) j.spendScale.storedFactor = 'X'; // the stored factor is the only thing that legitimately differs
      }
      return j;
    } catch { return s; }
  };
  const diffs: string[] = [];
  const canonRoutes = routes(canon);
  for (let i = 0; i < canonRoutes.length; i++) {
    const r = await quiet(() => get(canonRoutes[i]!, canon.token))();
    const health = /\/data-health$/.test(rs[i]!);
    const a = normalise(staleRes[i]!.text, idMap, health), b = normalise(await r.text(), idMap2, health);
    if (r.status !== staleRes[i]!.status || !same(a, b)) diffs.push(`${rs[i]!.replace(stale.ws.id, ':ws')} (status ${staleRes[i]!.status} vs ${r.status})`);
  }
  check('response contract: a stale-factor account answers exactly like a canonical-factor one on every route (data-health differs ONLY by the new scale signal)', diffs.length === 0, diffs);

  // the dashboard DTO and weekly report carry the canonical factor / amounts
  const dashStale = JSON.parse(staleRes[rs.length - 1]!.text) as { workspace?: { currencyMinorFactor?: number } };
  check('dashboard DTO reports currencyMinorFactor 1 for the stale IQD account', dashStale.workspace?.currencyMinorFactor === 1, dashStale.workspace?.currencyMinorFactor);
  const wkStale = await quiet(() => generateWeeklyReport(prisma, stale.ws.id))(); const wkCanon = await quiet(() => generateWeeklyReport(prisma, canon.ws.id))();
  check('weekly report (part of the dashboard) is identical for stale and canonical factor', same(wkStale && { s: wkStale.thisWeek?.spend, d: wkStale.thisWeek?.spendDisplay }, wkCanon && { s: wkCanon.thisWeek?.spend, d: wkCanon.thisWeek?.spendDisplay }), [wkStale?.thisWeek?.spendDisplay, wkCanon?.thisWeek?.spendDisplay]);

  // ── 2. the integrity signal ──────────────────────────────────────────
  console.log('\n── 2. spend whose scale cannot be verified uses the existing integrity signal ──');
  const integ = async (t: Tenant) => {
    const acct = await prisma.adAccount.findUniqueOrThrow({ where: { id: t.account.id } });
    return (await runDataIntegrityCheck(prisma, t.ws.id, acct)).checks.map((c) => c.code);
  };
  check('stale factor + no raw evidence → SPEND_SCALE_UNVERIFIED (WARN), not a rewrite', (await integ(stale)).includes('SPEND_SCALE_UNVERIFIED'), await integ(stale));
  const verifiedStale = await seed('vstale', { factor: 100, scale: 'correct', raw: 'match' });
  const codesV = await integ(verifiedStale);
  check('stale factor but every row PROVEN correct → no scale warning', !codesV.some((c) => c.startsWith('SPEND_SCALE')), codesV);
  const overT = await seed('over-sig', { factor: 1, scale: 'over', raw: 'match' });
  const codesO = await integ(overT);
  check('stranded rows (factor 1, rows x100 per raw evidence) → SPEND_SCALE_OVERSCALED (CRITICAL)', codesO.includes('SPEND_SCALE_OVERSCALED'), codesO);
  // factor = 1 is NOT evidence: a canonical account whose rows cannot be checked is still flagged.
  const codesCanon = await integ(canon);
  check('factor = 1 but NO raw evidence → SPEND_SCALE_UNVERIFIED: the factor certifies nothing', codesCanon.includes('SPEND_SCALE_UNVERIFIED'), codesCanon);
  const canonProven = await seed('canon-proven', { factor: 1, scale: 'correct', raw: 'match' });
  check('factor = 1 and every row PROVEN against raw Meta spend → no warning', !(await integ(canonProven)).some((c) => c.startsWith('SPEND_SCALE')), await integ(canonProven));
  const canonRestated = await seed('canon-restated', { factor: 1, scale: 'correct', raw: 'restated' });
  check('raw rows restated by later syncs (an earlier, different value next to the final one) are NOT a false alarm', !(await integ(canonRestated)).some((c) => c.startsWith('SPEND_SCALE')), await integ(canonRestated));
  const usd = await seed('usd', { currency: 'USD', factor: 100, scale: 'correct', raw: 'none' });
  check('USD account → never flagged', !(await integ(usd)).some((c) => c.startsWith('SPEND_SCALE')));

  // ── 3. repair: correct rows ──────────────────────────────────────────
  console.log('\n── 3. repair never touches correct rows ──');
  const cNoRaw = await seed('c-noraw', { factor: 100, scale: 'correct', raw: 'none' });
  const bNoRaw = await snap(cNoRaw);
  const rNoRaw = await quiet(() => R.repairIqdAccountScale(prisma, cNoRaw.account.id))();
  const aNoRaw = await snap(cNoRaw);
  check('correct rows, NO evidence: not one row changed', same(bNoRaw.stats, aNoRaw.stats), spends(aNoRaw));
  check('…they are reported as left intact, not as repaired', rNoRaw.rowsOverscaled === 0 && rNoRaw.accountRowsRescaled + rNoRaw.campaignRowsRescaled === 0, rNoRaw);
  const cRaw = await seed('c-raw', { factor: 100, scale: 'correct', raw: 'match' });
  const bRaw = await snap(cRaw);
  const rRaw = await quiet(() => R.repairIqdAccountScale(prisma, cRaw.account.id))();
  const aRaw = await snap(cRaw);
  check('correct rows WITH matching evidence: not one row changed', same(bRaw.stats, aRaw.stats), spends(aRaw));
  check('…all counted as VERIFIED (3 days x (1 account + 2 campaigns) = 9)', rRaw.rowsVerified === 9 && rRaw.rowsOverscaled === 0, rRaw);
  check('…and the factor flag is set only now (100 → 1)', bRaw.factor === 100 && aRaw.factor === 1 && rRaw.factorChanged, [bRaw.factor, aRaw.factor]);

  // ── 4. repair: over-scaled with evidence; idempotent ─────────────────
  console.log('\n── 4. over-scaled rows are repaired exactly, once ──');
  const ov = await seed('over', { factor: 100, scale: 'over', raw: 'match' });
  const rOv = await quiet(() => R.repairIqdAccountScale(prisma, ov.account.id))();
  const aOv = await snap(ov);
  const trueRow = (e: string) => { const s = e === ov.account.id ? TRUE_SPEND * 2 : TRUE_SPEND; return { spend: String(s), cpm: Math.round(s / IMPRESSIONS * 1000), cpc: Math.round(s / 500) }; };
  check('every row restored to the true amount; cpm, cpc, cost/message and revenue divided by 100', aOv.stats.every((r) => { const t = trueRow(r.e); return r.spend === t.spend && Math.round(r.cpm!) === t.cpm && Math.round(r.cpc!) === t.cpc && r.cps === 2000 && r.rev === '400000'; }), aOv.stats.slice(0, 2));
  check('counts: 3 account rows + 6 campaign rows rescaled, factor flipped', rOv.accountRowsRescaled === 3 && rOv.campaignRowsRescaled === 6 && rOv.factorChanged, rOv);
  const rOv2 = await quiet(() => R.repairIqdAccountScale(prisma, ov.account.id))();
  const aOv2 = await snap(ov);
  check('replay is a no-op (idempotent): nothing rescaled, rows identical', rOv2.accountRowsRescaled + rOv2.campaignRowsRescaled === 0 && same(aOv.stats, aOv2.stats), rOv2);
  const dry = await seed('dry', { factor: 100, scale: 'over', raw: 'match' });
  const bDry = await snap(dry);
  const rDry = await R.repairIqdAccountScale(prisma, dry.account.id, { apply: false });
  check('dry run reports the proven rows but writes nothing', rDry.status === 'dry_run' && rDry.rowsOverscaled === 9 && same(bDry, await snap(dry)), rDry);

  // ── 5. concurrency ───────────────────────────────────────────────────
  console.log('\n── 5. concurrency ──');
  const cc = await seed('conc', { factor: 100, scale: 'over', raw: 'match' });
  const results = await quiet(() => Promise.all(Array.from({ length: 6 }, () => R.repairIqdAccountScale(prisma, cc.account.id))))();
  const aCc = await snap(cc);
  const totalRescaled = results.reduce((n, r) => n + r.accountRowsRescaled + r.campaignRowsRescaled, 0);
  check('6 simultaneous repairs: every row has the TRUE amount (never divided twice)', aCc.stats.every((r) => r.spend === String(r.e === cc.account.id ? TRUE_SPEND * 2 : TRUE_SPEND)), spends(aCc));
  check('…and the rows were rescaled exactly once across all callers (9)', totalRescaled === 9, results.map((r) => r.accountRowsRescaled + r.campaignRowsRescaled));
  const mixed = await seed('conc2', { factor: 100, scale: 'over', raw: 'match' });
  await quiet(() => Promise.all([
    ...Array.from({ length: 4 }, () => R.repairIqdAccountScale(prisma, mixed.account.id)),
    ...Array.from({ length: 4 }, () => get(`/api/workspaces/${mixed.ws.id}/campaigns`, mixed.token)),
    ...Array.from({ length: 4 }, () => get(`/api/dashboard/${mixed.ws.id}`, mixed.token)),
  ]))();
  check('repairs racing with GETs: result identical to a single repair', same((await snap(mixed)).stats, aOv.stats.map((r) => ({ ...r, e: r.e === ov.account.id ? mixed.account.id : mixed.campaigns[ov.campaigns.findIndex((c) => c.id === r.e)]!.id }))), spends(await snap(mixed)));

  const raced = await seed('race', { factor: 100, scale: 'over', raw: 'match' });
  const victim = await prisma.dailyStat.findFirstOrThrow({ where: { entityId: raced.campaigns[0]!.id }, orderBy: { date: 'asc' } });
  const rRace = await quiet(() => R.repairIqdAccountScale(prisma, raced.account.id, {
    afterEvidence: async () => { await prisma.dailyStat.update({ where: { id: victim.id }, data: { spend: BigInt(TRUE_SPEND) } }); }, // a sync rewrites the row with the right value
  }))();
  const vAfter = await prisma.dailyStat.findUniqueOrThrow({ where: { id: victim.id } });
  check('a concurrent writer wins: its row is NOT divided again (stays 150000, not 1500)', String(vAfter.spend) === String(TRUE_SPEND), String(vAfter.spend));
  check('…the repair reports the skipped row and rescales the other 8', rRace.rowsSkippedChangedConcurrently === 1 && rRace.accountRowsRescaled + rRace.campaignRowsRescaled === 8, rRace);

  // ── 6. rollback ──────────────────────────────────────────────────────
  console.log('\n── 6. failure rolls everything back, including the factor flag ──');
  const failingOn = (nth: number) => {
    let n = 0;
    return new Proxy(prisma, {
      get(t, p, rcv) {
        if (p === '$transaction') {
          return (fn: (tx: any) => Promise<unknown>, o: unknown) => (t as any).$transaction((tx: any) => fn(new Proxy(tx, {
            get(tt, pp) {
              if (pp === 'dailyStat') return new Proxy(tt.dailyStat, { get(d, m) { return m === 'updateMany' ? async (...a: unknown[]) => { if (++n === nth) throw new Error('injected failure'); return d.updateMany(...a); } : d[m]; } });
              return tt[pp];
            },
          })), o);
        }
        return Reflect.get(t, p, rcv);
      },
    }) as typeof prisma;
  };
  const rb = await seed('rollback', { factor: 100, scale: 'over', raw: 'match' });
  const bRb = await snap(rb);
  let threw = false;
  try { await quiet(() => R.repairIqdAccountScale(failingOn(5), rb.account.id))(); } catch { threw = true; }
  const aRb = await snap(rb);
  check('the repair surfaces the failure', threw);
  check('4 rows had already been rewritten inside the transaction — NONE persisted', same(bRb.stats, aRb.stats), spends(aRb));
  check('the factor flag was NOT committed (still 100): nothing claims a repair that did not happen', aRb.factor === 100, aRb.factor);
  const rb2 = await quiet(() => R.repairIqdAccountScale(prisma, rb.account.id))();
  check('a healthy retry then repairs everything (the old code could never retry)', rb2.accountRowsRescaled + rb2.campaignRowsRescaled === 9 && (await snap(rb)).factor === 1, rb2);

  // ── 7. stranded rows ─────────────────────────────────────────────────
  console.log('\n── 7. rows stranded with factor = 1 ──');
  const st = await seed('stranded', { factor: 1, scale: 'over', raw: 'match' });
  const rSt = await quiet(() => R.repairIqdAccountScale(prisma, st.account.id))();
  const aSt = await snap(st);
  check('factor already 1 but rows x100 with evidence: repaired anyway (the decision rests on the rows)', rSt.accountRowsRescaled + rSt.campaignRowsRescaled === 9 && aSt.stats.every((r) => Number(r.spend) <= TRUE_SPEND * 2), rSt);
  check('…the factor stays 1 and the integrity signal clears', aSt.factor === 1 && !(await integ(st)).some((c) => c.startsWith('SPEND_SCALE')), await integ(st));
  const stNoEv = await seed('stranded-noev', { factor: 1, scale: 'over', raw: 'none' });
  const bStNo = await snap(stNoEv);
  const rStNo = await quiet(() => R.repairIqdAccountScale(prisma, stNoEv.account.id))();
  check('stranded rows WITHOUT evidence: left exactly as they are (cannot be proven)', same(bStNo.stats, (await snap(stNoEv)).stats) && rStNo.accountRowsRescaled + rStNo.campaignRowsRescaled === 0, rStNo);

  // ── 8. ambiguous rows ────────────────────────────────────────────────
  console.log('\n── 8. ambiguous rows stay intact ──');
  const amb = await seed('amb', { factor: 100, scale: 'ambiguous37', raw: 'match' });
  const bAmb = await snap(amb);
  const rAmb = await quiet(() => R.repairIqdAccountScale(prisma, amb.account.id))();
  check('stored value matches neither the raw spend nor 100 x it: untouched', same(bAmb.stats, (await snap(amb)).stats), spends(await snap(amb)));
  check('…counted as left intact (9)', rAmb.rowsUnverifiable === 9 && rAmb.accountRowsRescaled + rAmb.campaignRowsRescaled === 0, rAmb);
  const conf = await seed('conf', { factor: 100, scale: 'over', raw: 'conflict' });
  const bConf = await snap(conf);
  const rConf = await quiet(() => R.repairIqdAccountScale(prisma, conf.account.id))();
  check('two raw fetches that disagree are NOT evidence: rows untouched', same(bConf.stats, (await snap(conf)).stats) && rConf.conflictingRawKeys === 9, rConf);

  // "equal to ANY raw of the day" verifies restated days, but must never bless a row that another raw proves is x100
  const st100 = await seed('stale100', { factor: 100, scale: 'over', raw: 'stale100' });
  const bSt100 = await snap(st100);
  const dSt100 = await quiet(() => R.repairIqdAccountScale(prisma, st100.account.id, { apply: false }))();
  check('stored x100 value equals an OLDER raw while another raw of the same day is exactly 1/100 of it: NOT verified (dry run: 0 verified, 0 overscaled, 9 conflicting, 9 unproven)', dSt100.rowsVerified === 0 && dSt100.rowsOverscaled === 0 && dSt100.conflictingRawKeys === 9 && dSt100.rowsUnverifiable === 9, dSt100);
  const rSt100 = await quiet(() => R.repairIqdAccountScale(prisma, st100.account.id))();
  check('…and the repair does not guess which raw is newer: the rows are left exactly as they are', same(bSt100.stats, (await snap(st100)).stats) && rSt100.accountRowsRescaled + rSt100.campaignRowsRescaled === 0, rSt100);

  // ── 9. tenants ───────────────────────────────────────────────────────
  console.log('\n── 9. one tenant can never repair another ──');
  const A = await seed('tenantA', { factor: 100, scale: 'over', raw: 'match' });
  const B = await seed('tenantB', { factor: 100, scale: 'over', raw: 'match' });
  const bB = await snap(B);
  const rA = await quiet(() => R.repairIqdAccountScale(prisma, A.account.id))();
  check('repairing A repaired A', rA.accountRowsRescaled + rA.campaignRowsRescaled === 9);
  check('…and left B (also stale and over-scaled) byte-for-byte alone, factor included', same(bB, await snap(B)), spends(await snap(B)));
  const B2 = await seed('tenantB2', { factor: 100, scale: 'over', raw: 'match' });
  const A2 = await seed('tenantA2', { factor: 100, scale: 'over', raw: 'match' });
  const bB2 = await snap(B2);
  const route = await quiet(() => app.request(`/api/workspaces/${A2.ws.id}/repair-iqd`, { method: 'POST', headers: { authorization: `Bearer ${A2.token}` } }))();
  const routeBody = await route.json() as Record<string, any>;
  check('POST repair-iqd as A\'s owner: 200 and A is repaired', route.status === 200 && (await snap(A2)).factor === 1 && Number((await snap(A2)).stats[0]!.spend) <= TRUE_SPEND * 2, [route.status, routeBody]);
  check('…B2 (another workspace) is untouched — the old route rewrote EVERY IQD account', same(bB2, await snap(B2)), spends(await snap(B2)));
  check('route response contract kept (success, factorsHealed, rescale{accountsChecked,rowsRescaled,rowsVerified,campaignRowsRescaled}, syncJobId)',
    routeBody['success'] === true && routeBody['factorsHealed'] === 1 && ['accountsChecked', 'rowsRescaled', 'rowsVerified', 'campaignRowsRescaled'].every((k) => k in routeBody['rescale']) && 'syncJobId' in routeBody, routeBody);
  const viewer = await prisma.user.create({ data: { email: `viewer-${Math.random().toString(36).slice(2, 9)}@repro.invalid`, passwordHash: 'x', name: 'v', isActive: true } });
  await prisma.workspaceMember.create({ data: { workspaceId: B2.ws.id, userId: viewer.id, role: 'VIEWER' } });
  const vTok = signToken({ sub: viewer.id, email: viewer.email, ver: 0 });
  const vRes = await quiet(() => app.request(`/api/workspaces/${B2.ws.id}/repair-iqd`, { method: 'POST', headers: { authorization: `Bearer ${vTok}` } }))();
  check('a VIEWER still cannot trigger the repair (403) and nothing changed', vRes.status === 403 && same(bB2, await snap(B2)), vRes.status);

  // ── 10. other currencies / unknown account ───────────────────────────
  console.log('\n── 10. scope guards ──');
  const usdT = await seed('usd2', { currency: 'USD', factor: 100, scale: 'correct', raw: 'match' });
  const bU = await snap(usdT);
  const rU = await R.repairIqdAccountScale(prisma, usdT.account.id);
  check('a USD account is never repaired', rU.status === 'not_iqd' && same(bU, await snap(usdT)), rU.status);
  check('an unknown account id is reported, not thrown', (await R.repairIqdAccountScale(prisma, 'does-not-exist')).status === 'not_found');

  // ── 11. sync side ────────────────────────────────────────────────────
  console.log('\n── 11. sync: reconcileAccountScaleForSync ──');
  const sy = await seed('sync', { factor: 100, scale: 'over', raw: 'match' });
  const accSy = await prisma.adAccount.findUniqueOrThrow({ where: { id: sy.account.id } });
  const fSy = await quiet(() => R.reconcileAccountScaleForSync(prisma, accSy))();
  check('IQD stale: repaired from evidence and sync is told to use factor 1', fSy === 1 && (await snap(sy)).factor === 1 && Number((await snap(sy)).stats[0]!.spend) <= TRUE_SPEND * 2, [fSy, spends(await snap(sy))]);
  const sy2 = await seed('sync2', { factor: 100, scale: 'over', raw: 'match' });
  const accSy2 = await prisma.adAccount.findUniqueOrThrow({ where: { id: sy2.account.id } });
  const bSy2 = await snap(sy2);
  const origErr = console.error; console.error = () => {};
  let fFail: number | string = 'threw';
  try { fFail = await R.reconcileAccountScaleForSync(failingOn(2), accSy2); } catch { /* must not throw */ } finally { console.error = origErr; }
  check('IQD stale and the repair FAILS: sync does not throw, continues with factor 1', fFail === 1, fFail);
  check('…and nothing was left half-done (rolled back; the next sync retries)', same(bSy2, await snap(sy2)));
  const sy3 = await seed('sync3', { currency: 'USD', factor: 1, scale: 'correct', raw: 'none' });
  const accSy3 = await prisma.adAccount.findUniqueOrThrow({ where: { id: sy3.account.id } });
  const bSy3 = await snap(sy3);
  const fU = await R.reconcileAccountScaleForSync(prisma, accSy3);
  check('non-IQD stale factor: one compare-and-set on the column (1 → 100), rows never rewritten', fU === 100 && (await snap(sy3)).factor === 100 && same(bSy3.stats, (await snap(sy3)).stats), fU);

  // ── 12. factor = 1 does not certify historical spend that has no evidence ──
  console.log('\n── 12. a stored factor of 1 is not evidence ──');
  const healthOf = async (t: Tenant) => { const r = await quiet(() => get(`/api/workspaces/${t.ws.id}/data-health`, t.token))(); return { status: r.status, body: await r.json() as any }; };
  const f1 = await seed('f1-nof', { factor: 1, scale: 'correct', raw: 'none', campaigns: 1 });
  const h1 = await healthOf(f1);
  check('factor 1, rows with NO raw evidence: data-health WARNs (SPEND_SCALE_UNVERIFIED) and overallStatus is not OK', h1.body.checks?.some((c: any) => c.code === 'SPEND_SCALE_UNVERIFIED' && c.severity === 'WARN') && h1.body.overallStatus === 'WARN', [h1.body.overallStatus, h1.body.checks?.map((c: any) => c.code)]);
  check('…and spells it out: factorIsEvidence=false, 3 window rows, 0 verified, 3 unverified', h1.body.spendScale?.factorIsEvidence === false && h1.body.spendScale?.storedFactor === 1 && h1.body.spendScale?.window?.accountRows === 3 && h1.body.spendScale?.window?.verified === 0 && h1.body.spendScale?.window?.unverified === 3, h1.body.spendScale);
  const f2 = await seed('f2-stale', { factor: 100, scale: 'correct', raw: 'none' });
  const bF2 = await snap(f2);
  const rF2 = await quiet(() => R.repairIqdAccountScale(prisma, f2.account.id))();
  const aF2 = await snap(f2);
  const h2 = await healthOf(f2);
  check('stale factor with unverifiable rows: the repair flips the factor to 1 …', bF2.factor === 100 && aF2.factor === 1 && rF2.factorChanged, [bF2.factor, aF2.factor]);
  check('…leaves every unproven row exactly as it is, and REPORTS all 9 of them as left intact (not 0)', same(bF2.stats, aF2.stats) && rF2.rowsUnverifiable === 9, rF2);
  check('…and AFTER the flip the warning is still there: factor 1 did not certify them', h2.body.checks?.some((c: any) => c.code === 'SPEND_SCALE_UNVERIFIED') && h2.body.spendScale?.storedFactor === 1, [h2.body.spendScale, h2.body.checks?.map((c: any) => c.code)]);
  const f6 = await seed('f6-stale100', { factor: 1, scale: 'over', raw: 'stale100', campaigns: 1 });
  const h6 = await healthOf(f6);
  check('factor 1, rows x100, one raw equal to the stored value but another raw exactly 1/100: data-health does NOT certify them (SPEND_SCALE_UNVERIFIED, 0 verified)', h6.body.spendScale?.window?.verified === 0 && h6.body.spendScale?.window?.unverified === 3 && h6.body.checks?.some((c: any) => c.code === 'SPEND_SCALE_UNVERIFIED') && h6.body.overallStatus !== 'OK', [h6.body.spendScale?.window, h6.body.checks?.map((c: any) => c.code)]);
  const f3 = await seed('f3-hist', { factor: 1, scale: 'correct', raw: 'match', campaigns: 1, oldAccountRows: [200, 201, 202] });
  const h3 = await healthOf(f3);
  check('history older than any raw evidence (3 rows, 200+ days ago): reported, not certified', h3.body.spendScale?.history?.accountRows === 6 && h3.body.spendScale?.history?.withoutEvidence === 3, h3.body.spendScale?.history);
  check('…while the proven recent window raises no warning', h3.body.spendScale?.window?.verified === 3 && !h3.body.checks?.some((c: any) => c.code.startsWith('SPEND_SCALE')), [h3.body.spendScale?.window, h3.body.checks?.map((c: any) => c.code)]);
  const f4 = await seed('f4-str', { factor: 1, scale: 'over', raw: 'match', campaigns: 1 });
  const h4 = await healthOf(f4);
  check('factor 1 with rows x100 PROVEN by raw evidence: CRITICAL, not certified by the factor', h4.body.checks?.some((c: any) => c.code === 'SPEND_SCALE_OVERSCALED' && c.severity === 'CRITICAL') && h4.body.overallStatus === 'CRITICAL', [h4.body.overallStatus, h4.body.checks?.map((c: any) => c.code)]);
  const rF1 = await quiet(() => app.request(`/api/workspaces/${f1.ws.id}/repair-iqd`, { method: 'POST', headers: { authorization: `Bearer ${f1.token}` } }))();
  const rF1b = await rF1.json() as any;
  check('POST repair-iqd on an account with unproven rows reports them (rowsLeftIntact = 3 account + 3 campaign)', rF1.status === 200 && rF1b.rescale?.rowsLeftIntact === 6 && rF1b.rescale?.rowsRescaled === 0, rF1b);
  const hUsd = await healthOf(await seed('f5-usd', { currency: 'USD', factor: 100, scale: 'correct', raw: 'none', campaigns: 1 }));
  check('a USD account gets no spendScale block and no scale warning', hUsd.body.spendScale === undefined && !hUsd.body.checks?.some((c: any) => c.code.startsWith('SPEND_SCALE')), hUsd.body.spendScale);

  console.log(`\n${pass} passed, ${fail} failed   (database: ${dbName})`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('test_iqd_repair_postgres crashed:', e); process.exit(1); });
