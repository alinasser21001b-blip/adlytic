// ════════════════════════════════════════════════════════════════════════
//  scripts/repro/heal_on_get.ts — LOCAL-ONLY reproduction of "heal on GET".
//
//  Question it answers: which read routes MUTATE the database, under what
//  condition, what exactly do they write, and is that write safe?
//
//  The mutation lives in src/lib/iqdRepair.ts#healAccountCurrencyAndSpend and
//  is reached from GET handlers through:
//    · getAccount()                 src/api/server.ts:917-927  (≈19 GET routes)
//    · GET /api/workspaces/:id      src/api/server.ts:3126-3133
//    · getDashboard()               src/services/getDashboard.ts:874-881
//
//  Safety: this script refuses to run unless DATABASE_URL points at a LOOPBACK
//  host and a database whose name starts with "adlytic_repro". It seeds only
//  synthetic rows (fake IQD figures, fake users) and prints aggregates.
//
//    createdb adlytic_repro_heal && DATABASE_URL=… npx prisma migrate deploy
//    DATABASE_URL=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_heal \
//      npx tsx scripts/repro/heal_on_get.ts
// ════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
delete process.env['REDIS_URL']; // keep the process free of open handles

import { writeFileSync } from 'node:fs';

const url = process.env['DATABASE_URL'] ?? '';
let parsed: URL;
try { parsed = new URL(url); } catch { console.error('DATABASE_URL missing/invalid'); process.exit(2); }
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.startsWith('adlytic_repro')) {
  console.error(`REFUSED: host=${parsed.hostname} db=${dbName}. Needs a loopback host and a database named adlytic_repro*.`);
  process.exit(2);
}

type Json = Record<string, unknown>;
const out: Json = { generatedBy: 'scripts/repro/heal_on_get.ts', database: dbName, scenarios: {} as Json };
const scenarios = out['scenarios'] as Json;

async function main(): Promise<void> {
  const { PrismaClient, EntityType } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { buildRoutes } = await import('../../src/api/server');
  const { signToken } = await import('../../src/services/jwtAuth');

  const pool = new pg.Pool({
    host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password), database: dbName, max: 20,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const app = buildRoutes(prisma);

  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };
  let seq = 0;

  /** One synthetic tenant: user + workspace + account + campaign (+ stats / raw). */
  async function seed(label: string, o: {
    currency: string; factor: number; overscaled: boolean; withRaw: boolean; cpmIqd?: number;
  }) {
    const n = `${label}-${++seq}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({ data: { email: `${n}@repro.invalid`, passwordHash: 'x', name: n, isActive: true } });
    const ws = await prisma.workspace.create({ data: { name: n } });
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' } });
    const account = await prisma.adAccount.create({
      data: { workspaceId: ws.id, externalAccountId: `act_${n}`, name: n, currency: o.currency, currencyMinorFactor: o.factor, lifetimeSpendMinor: 0n },
    });
    const camp = await prisma.campaign.create({ data: { adAccountId: account.id, externalCampaignId: `c_${n}`, name: n } });
    const trueSpend = 150_000, impressions = 25_000;            // synthetic IQD majors: CPM = 6,000 IQD
    const k = o.overscaled ? 100 : 1;
    for (let i = 1; i <= 3; i++) {
      await prisma.dailyStat.create({
        data: {
          entityType: EntityType.CAMPAIGN, entityId: camp.id, date: day(i),
          spend: BigInt(trueSpend * k), impressions: BigInt(impressions), clicks: 500n,
          cpm: (trueSpend / impressions * 1000) * k, cpc: (trueSpend / 500) * k,
        },
      });
      if (o.withRaw) {
        await prisma.rawInsight.create({ data: { entityType: EntityType.CAMPAIGN, entityId: camp.id, date: day(i), rawJson: { spend: String(trueSpend) } } });
      }
    }
    const token = signToken({ sub: user.id, email: user.email, ver: 0 });
    return { ws, account, camp, token };
  }

  async function snap(t: { account: { id: string }; camp: { id: string } }) {
    const a = await prisma.adAccount.findUniqueOrThrow({ where: { id: t.account.id }, select: { currencyMinorFactor: true, lifetimeSpendMinor: true } });
    const rows = await prisma.dailyStat.findMany({ where: { entityId: t.camp.id }, orderBy: { date: 'asc' }, select: { spend: true, cpm: true } });
    return { factor: a.currencyMinorFactor, spendRows: rows.map((r) => Number(r.spend)), cpmRows: rows.map((r) => Math.round(Number(r.cpm))) };
  }

  const get = (a: typeof app, path: string, token: string) =>
    a.request(path, { headers: { authorization: `Bearer ${token}` } });

  // ── A. CORRECT data + stale factor + no raw_insights ──────────────────
  {
    const t = await seed('A', { currency: 'IQD', factor: 100, overscaled: false, withRaw: false });
    const before = await snap(t);
    const res = await get(app, `/api/workspaces/${t.ws.id}`, t.token);
    const after = await snap(t);
    scenarios['A_correct_rows_stale_factor_no_raw'] = {
      route: 'GET /api/workspaces/:id', status: res.status, before, after,
      verdict: after.spendRows[0] !== before.spendRows[0] ? 'CORRECT DATA REWRITTEN BY A READ (heuristic cannot tell correct from over-scaled)' : 'unchanged',
    };
  }

  // ── B. over-scaled rows WITH raw proof, reached through getAccount() ──
  {
    const t = await seed('B', { currency: 'IQD', factor: 100, overscaled: true, withRaw: true });
    const before = await snap(t);
    const res = await get(app, `/api/workspaces/${t.ws.id}/campaigns`, t.token);
    const mid = await snap(t);
    await get(app, `/api/workspaces/${t.ws.id}/campaigns`, t.token); // replay
    const replay = await snap(t);
    scenarios['B_overscaled_with_raw_via_getAccount'] = {
      route: 'GET /api/workspaces/:id/campaigns (getAccount)', status: res.status, before, after: mid,
      replayChangedNothing: JSON.stringify(mid) === JSON.stringify(replay),
    };
  }

  // ── C. atomicity: rescale fails AFTER the factor flag was committed ───
  {
    const t = await seed('C', { currency: 'IQD', factor: 100, overscaled: true, withRaw: true });
    const failing = new Proxy(prisma, {
      get(target, prop, recv) {
        if (prop === 'dailyStat') {
          return new Proxy((target as any).dailyStat, { get(d, m) { return m === 'update' ? async () => { throw new Error('injected dailyStat.update failure'); } : (d as any)[m]; } });
        }
        return Reflect.get(target, prop, recv);
      },
    }) as typeof prisma;
    const appFail = buildRoutes(failing);
    const before = await snap(t);
    const r1 = await get(appFail, `/api/workspaces/${t.ws.id}/campaigns`, t.token);
    const afterFail = await snap(t);
    const r2 = await get(app, `/api/workspaces/${t.ws.id}/campaigns`, t.token); // healthy retry
    const afterRetry = await snap(t);
    scenarios['C_failure_after_factor_committed'] = {
      firstGetStatus: r1.status, retryGetStatus: r2.status, before, afterFailedGet: afterFail, afterHealthyRetry: afterRetry,
      verdict: afterRetry.factor === 1 && afterRetry.spendRows[0] === before.spendRows[0]
        ? 'FACTOR FLIPPED, ROWS STAY OVER-SCALED: the flag that triggers the repair was committed before the repair, so the repair never retries'
        : 'repaired on retry',
    };
  }

  // ── D. concurrency on the heuristic path (over-scaled, NO raw proof) ──
  {
    const trials = 12, outcomes: Record<string, number> = {};
    for (let i = 0; i < trials; i++) {
      const t = await seed('D', { currency: 'IQD', factor: 100, overscaled: true, withRaw: false });
      await Promise.all([1, 2, 3, 4].map(() => get(app, `/api/workspaces/${t.ws.id}/campaigns`, t.token)));
      const s = await snap(t);
      const key = `final spend/day=${s.spendRows[0]}`;
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    }
    scenarios['D_four_concurrent_GETs_heuristic_path'] = { trials, expectedSpendPerDay: 150000, outcomes };
  }

  // ── E. control: USD account with the default factor must not write ────
  {
    const t = await seed('E', { currency: 'USD', factor: 100, overscaled: false, withRaw: false });
    const before = await snap(t);
    const res = await get(app, `/api/workspaces/${t.ws.id}`, t.token);
    const after = await snap(t);
    scenarios['E_usd_control'] = { status: res.status, unchanged: JSON.stringify(before) === JSON.stringify(after) };
  }

  // ── F. dashboard route reaches the same writer (getDashboard.ts:874) ──
  {
    const t = await seed('F', { currency: 'IQD', factor: 100, overscaled: true, withRaw: true });
    const before = await snap(t);
    let status: number | string = 'threw';
    try { status = (await get(app, `/api/dashboard/${t.ws.id}`, t.token)).status; } catch { /* dashboard may need more data; the heal runs first */ }
    const after = await snap(t);
    scenarios['F_dashboard_route'] = { route: 'GET /api/dashboard/:id', status, factorBefore: before.factor, factorAfter: after.factor, rowsChanged: JSON.stringify(before.spendRows) !== JSON.stringify(after.spendRows) };
  }

  console.log(JSON.stringify(out, null, 2));
  const dest = process.env['REPRO_OUT'];
  if (dest) writeFileSync(dest, JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  await pool.end();
}

main().then(() => process.exit(0)).catch((e) => { console.error('repro failed:', e); process.exit(1); });
