// ═════════════════════════════════════════════════════════════════════════
//  test_iqd_no_get_writes.ts
//
//  Reads must not write stored money. src/lib/iqdRepair.ts used to be reached
//  from ~20 GET routes, the dashboard and the workspace route; it was
//  reproduced rewriting CORRECT IQD rows 100x smaller, double-dividing under
//  concurrent requests, and committing its "repaired" flag before the repair
//  (scripts/repro/heal_on_get.ts, delivery/core/HEAL_ON_GET.md).
//
//  Four layers, none needs a database (the Postgres-backed repair tests are in
//  test_iqd_repair_postgres.ts and run on a synthetic local database):
//    1. judgeSpendScale — the pure evidence rule.
//    2. static boundary — who may import the repair module, and that the shared
//       read helper getAccount() contains no write call.
//    3. raw-factor readers resolve the factor instead of trusting the column.
//    4. behaviour — a real GET against a stale-IQD fake whose every write method
//       throws: 200, canonical factor in the response, zero writes attempted.
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = process.env['NODE_ENV'] ?? 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long-xxxx';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://user:pass@localhost:5432/adlytic_test';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — got: ${JSON.stringify(got)}`); }
}

const ROOT = __dirname;
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
/** Code only: a comment that explains the old behaviour must not trip a check on the new one. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Text of every `app.<verb>(` handler in server.ts, by verb + route. */
function handlers(src: string): Array<{ verb: string; route: string; text: string; start: number }> {
  const re = /^ {2}app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/gm;
  const heads: Array<{ verb: string; route: string; index: number }> = [];
  for (let m = re.exec(src); m; m = re.exec(src)) heads.push({ verb: m[1]!, route: m[3]!, index: m.index });
  return heads.map((h, i) => ({ verb: h.verb, route: h.route, start: h.index, text: code(src.slice(h.index, heads[i + 1]?.index ?? src.length)) }));
}

async function main() {
  const R = await import('./src/lib/iqdRepair');

  // ── 1. the evidence rule ─────────────────────────────────────────────
  console.log('\n── 1. judgeSpendScale: evidence, never a guess ──');
  const J = R.judgeSpendScale;
  check('stored == raw major → VERIFIED', J(150_000, 150_000) === 'VERIFIED');
  check('off by one rounding → VERIFIED', J(150_001, 150_000) === 'VERIFIED');
  check('stored == 100 x raw → OVERSCALED', J(15_000_000, 150_000) === 'OVERSCALED');
  check('within 2% of 100 x raw → OVERSCALED', J(15_200_000, 150_000) === 'OVERSCALED');
  check('3% off 100 x raw → UNVERIFIABLE (not a guess)', J(15_450_000, 150_000) === 'UNVERIFIABLE');
  check('matches neither scale (37 x) → UNVERIFIABLE', J(5_550_000, 150_000) === 'UNVERIFIABLE');
  check('no raw evidence → UNVERIFIABLE, whatever the magnitude', J(15_000_000, null) === 'UNVERIFIABLE' && J(150_000, null) === 'UNVERIFIABLE');
  check('zero spend both sides → VERIFIED', J(0, 0) === 'VERIFIED');
  check('stored >0 but raw 0 → UNVERIFIABLE (cannot be 100x of nothing)', J(500, 0) === 'UNVERIFIABLE');
  check('garbage evidence (NaN, negative) → UNVERIFIABLE', J(100, NaN) === 'UNVERIFIABLE' && J(100, -5) === 'UNVERIFIABLE' && J(NaN, 100) === 'UNVERIFIABLE');
  check('parseMetaSpend reads string and number, rejects junk', R.parseMetaSpend({ spend: '150000' }) === 150000 && R.parseMetaSpend({ spend: 42 }) === 42 && R.parseMetaSpend({ spend: '' }) === null && R.parseMetaSpend(null) === null && R.parseMetaSpend({ spend: 'abc' }) === null);
  // The shape that made the old heuristic wrong: a CORRECT row with CPM 6 000 IQD.
  check('a correct row with a high CPM is never judged over-scaled without proof', J(150_000, null) !== 'OVERSCALED');

  // ── 2. static boundary ───────────────────────────────────────────────
  console.log('\n── 2. who may reach the repair module ──');
  const srcFiles = walk(path.join(ROOT, 'src'));
  const importers = srcFiles
    .filter((f) => /from\s+['"][^'"]*\/iqdRepair['"]/.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))
    .sort();
  const allowed = ['src/api/server.ts', 'src/services/dataIntegrityMonitor.ts', 'src/workers/syncAccount.ts'];
  check('only server.ts (repair route), syncAccount.ts and the integrity monitor import iqdRepair', JSON.stringify(importers) === JSON.stringify(allowed), importers);

  const monitor = read('src/services/dataIntegrityMonitor.ts');
  const monitorImport = (/import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/lib\/iqdRepair['"]/.exec(monitor)?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean).sort().join(',');
  check('the integrity monitor imports only the two READ-ONLY evidence readers', monitorImport === 'accountHistoryEvidenceCoverage,collectScaleEvidence', monitorImport);

  const sync = code(read('src/workers/syncAccount.ts'));
  check('sync uses reconcileAccountScaleForSync, not a bare writer', /reconcileAccountScaleForSync/.test(sync) && !/healAccountCurrencyAndSpend|healIqdAccountFactors|rescaleIqdSpendFromRaw/.test(sync));

  const serverRaw = read('src/api/server.ts');
  const server = code(serverRaw);
  const hs = handlers(serverRaw);
  const usingRepair = hs.filter((h) => /repairIqdAccountScale/.test(h.text));
  check('repairIqdAccountScale appears in exactly one handler: POST …/repair-iqd',
    usingRepair.length === 1 && usingRepair[0]!.verb === 'post' && /repair-iqd/.test(usingRepair[0]!.route), usingRepair.map((h) => `${h.verb} ${h.route}`));
  check('no GET handler mentions the repair module or its predicate',
    hs.filter((h) => h.verb === 'get').every((h) => !/iqdRepair|repairIqd|reconcileAccountScale|currencyFactorNeedsHeal|healAccount/.test(h.text)));
  check('server.ts no longer imports the old global writers or the heal predicate', !/healIqdAccountFactors|rescaleIqdSpendFromRaw|healAccountCurrencyAndSpend|currencyFactorNeedsHeal/.test(server));
  check('the repair route is scoped to the caller\'s account (no global updateMany over every IQD account)',
    /repairIqdAccountScale\(prisma,\s*account\.id\)/.test(server));

  const getAccountText = code(/async function getAccount\([\s\S]*?\n {2}}\n/.exec(server)?.[0] ?? '');
  check('getAccount() is found', getAccountText.length > 100, getAccountText.length);
  check('getAccount() contains no write call', !/\.(update|updateMany|create|createMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction/.test(getAccountText), getAccountText.match(/\.(update|create|upsert|delete)\w*\(/g));
  check('getAccount() does not reach the repair module either (a helper shared by ~20 GET routes)', !/repairIqd|reconcileAccountScale|iqdRepair|healAccount|currencyFactorNeedsHeal/.test(getAccountText), getAccountText.match(/repairIqd\w*|reconcile\w*|heal\w*/g));

  const dash = read('src/services/getDashboard.ts');
  check('getDashboard.ts does not import or call any repair writer', !/iqdRepair|healAccountCurrencyAndSpend|reconcileAccountScale|repairIqd/.test(code(dash)));
  check('getDashboard.ts still reports the canonical factor in memory', /account\.currencyMinorFactor\s*=\s*currencyMinorFactorFor\(account\.currency\)/.test(dash));

  // ── 3. raw-factor readers resolve ────────────────────────────────────
  console.log('\n── 3. readers that used to rely on the GET heal now resolve the factor ──');
  const weekly = read('src/services/weeklyReport.ts');
  check('weeklyReport resolves the factor (part of the dashboard DTO)', /resolveCurrencyMinorFactor\(account\.currency,\s*account\.currencyMinorFactor\)/.test(weekly) && !/const factor = account\.currencyMinorFactor;/.test(weekly));
  const brain = read('src/workers/runBrainOrchestrator.ts');
  check('the brain orchestrator resolves the factor and selects currency', /resolveCurrencyMinorFactor\(account\.currency,\s*account\.currencyMinorFactor\)/.test(brain) && /currency:\s*true/.test(brain));
  check('the brain orchestrator never passes the raw stored column on', !/currencyMinorFactor:\s*account\.currencyMinorFactor/.test(brain));

  // ── 4. behaviour: a real GET, every write throws ─────────────────────
  console.log('\n── 4. GET /api/workspaces/:id on a stale IQD account ──');
  const WRITE_METHODS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
  const writes: string[] = [];
  const base: Record<string, any> = {
    user: { findUnique: async ({ where }: any) => (where.id === 'u1' ? { id: 'u1', tokenVersion: 0, isActive: true } : null) },
    workspaceMember: { findFirst: async () => ({ id: 'm1', userId: 'u1', workspaceId: 'ws1', role: 'OWNER' }), findMany: async () => [] },
    workspace: {
      findUniqueOrThrow: async () => ({
        id: 'ws1', name: 'Test', industryProfile: null,
        adAccounts: [
          { id: 'acc-iqd', name: 'IQD', currency: 'IQD', currencyMinorFactor: 100, status: 'ACTIVE', lastSyncedAt: null, externalAccountId: 'act_1', tokenExpiresAt: null, metaAccountStatus: 1 },
          { id: 'acc-usd', name: 'USD', currency: 'USD', currencyMinorFactor: 100, status: 'ACTIVE', lastSyncedAt: null, externalAccountId: 'act_2', tokenExpiresAt: null, metaAccountStatus: 1 },
        ],
      }),
    },
  };
  const trapped = new Proxy(base, {
    get(t, prop: string) {
      if (prop === '$executeRaw' || prop === '$executeRawUnsafe' || prop === '$transaction') return () => { writes.push(prop); throw new Error(`write attempted: ${prop}`); };
      const v = t[prop];
      if (v && typeof v === 'object') {
        return new Proxy(v, { get(m, meth: string) { if (WRITE_METHODS.has(meth)) return () => { writes.push(`${prop}.${meth}`); throw new Error(`write attempted: ${prop}.${meth}`); }; return m[meth]; } });
      }
      return v;
    },
  }) as unknown as import('@prisma/client').PrismaClient;

  const { buildRoutes } = await import('./src/api/server');
  const { signToken } = await import('./src/services/jwtAuth');
  const app = buildRoutes(trapped);
  const token = signToken({ sub: 'u1', email: 'u1@test.invalid', ver: 0 });
  const res = await app.request('/api/workspaces/ws1', { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json() as { adAccounts?: Array<{ id: string; currencyMinorFactor: number }> };
  check('the GET succeeds (200)', res.status === 200, res.status);
  check('zero write calls were attempted', writes.length === 0, writes);
  const iqd = body.adAccounts?.find((a) => a.id === 'acc-iqd');
  const usd = body.adAccounts?.find((a) => a.id === 'acc-usd');
  check('response contract kept: a stale IQD account is reported with factor 1', iqd?.currencyMinorFactor === 1, iqd);
  check('response contract kept: USD keeps 100', usd?.currencyMinorFactor === 100, usd);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('test_iqd_no_get_writes crashed:', e); process.exit(1); });
