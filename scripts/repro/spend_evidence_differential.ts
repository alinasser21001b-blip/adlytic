// ═════════════════════════════════════════════════════════════════════════
//  scripts/repro/spend_evidence_differential.ts — "non-IQD and fully verified IQD
//  behave exactly as before", as a DIFFERENTIAL: the same synthetic rows, read by
//  the old source and by the new source, byte-compared.
//
//  Synthetic loopback Postgres only (database name adlytic_repro*). Never real data.
//
//    DB=postgresql://adlytic@127.0.0.1:54329/adlytic_repro_rc2      # a FRESH clone: seed once
//    DATABASE_URL=$DB npx tsx scripts/repro/spend_evidence_differential.ts seed
//    DATABASE_URL=$DB npx tsx scripts/repro/spend_evidence_differential.ts dump /tmp/new.json
//    git checkout <old-rev> -- src            # the old source; the script is not under src/
//    DATABASE_URL=$DB npx tsx scripts/repro/spend_evidence_differential.ts dump /tmp/old.json
//    git checkout HEAD -- src
//    for t in usd iqd-verified; do diff <(jq ".\"$t\"" /tmp/old.json) <(jq ".\"$t\"" /tmp/new.json); done
//        # USD: empty. verified IQD: empty, or only the additive data-health keys against a pre-gate base.
//        # iqd-unverified is in the dump to SHOW the gate (it is expected to differ), never to be compared for identity.
//
//  `dump` runs the real engines (rules, recommendation, V5, Brain) for each tenant, reads every IQD-reaching route
//  through the real app — including the weekly report, a 61-day history (so the PRIOR window is read), and the campaign
//  "investigate" tab — and runs the AI agent's read tools through the real dispatcher (list / details / rank / compare /
//  anomaly / simulate). Volatile fields (clock-dependent burn rate, staleness, timings) and row ids are normalised so
//  only behaviour is compared.
// ═════════════════════════════════════════════════════════════════════════

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'synthetic-repro-jwt-secret-0123456789abcdef0123';
process.env['TOKEN_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
delete process.env['REDIS_URL'];

import { writeFileSync } from 'node:fs';

const url = process.env['DATABASE_URL'] ?? '';
let parsed: URL;
try { parsed = new URL(url); } catch { console.error('NOT RUN: DATABASE_URL missing/invalid'); process.exit(2); }
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.startsWith('adlytic_repro')) {
  console.error(`REFUSED: host=${parsed.hostname} db=${dbName}. Needs a loopback host and a database named adlytic_repro*.`);
  process.exit(2);
}
const mode = process.argv[2];
const outFile = process.argv[3];
if (mode !== 'seed' && mode !== 'dump') { console.error('usage: seed | dump <file>'); process.exit(2); }

const TENANTS = [
  { key: 'usd', currency: 'USD', factor: 100, raws: false },
  { key: 'iqd-verified', currency: 'IQD', factor: 1, raws: true },
  // No raw evidence at all: in the dump to SHOW what the gate changes. Never compared for identity.
  { key: 'iqd-unverified', currency: 'IQD', factor: 1, raws: false },
] as const;
const HISTORY_DAYS = 61; // ACCOUNT and CAMPAIGN rows ago 0..61: the current 30-day window, the prior one, and the agent tools' 60-day reads
const ids = (k: string) => ({ user: `diffu_${k}`, ws: `diffw_${k}`, acct: `diffa_${k}`, camp: (i: number) => `diffc${i}_${k}` });

async function main() {
  const { PrismaClient, EntityType, IssueCode, RecommendationSource } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = (await import('pg')).default;
  const { signToken } = await import('../../src/services/jwtAuth');
  const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: dbName, max: 10 });
  try { await pool.query('select 1'); } catch (e) { console.error('NOT RUN: cannot reach the synthetic database:', (e as Error).message); process.exit(2); }
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const day = (n: number) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(0, 0, 0, 0); return d; };

  if (mode === 'seed') {
    for (const t of TENANTS) {
      const id = ids(t.key);
      await prisma.recommendation.deleteMany({ where: { entityId: { in: [id.acct, id.camp(0), id.camp(1), id.camp(2)] } } });
      await prisma.workspace.deleteMany({ where: { id: id.ws } });
      await prisma.user.deleteMany({ where: { id: id.user } });
      await prisma.user.create({ data: { id: id.user, email: `${id.user}@repro.invalid`, passwordHash: 'x', name: id.user, isActive: true } });
      await prisma.workspace.create({ data: { id: id.ws, name: 'Synthetic' } });
      await prisma.workspaceMember.create({ data: { workspaceId: id.ws, userId: id.user, role: 'OWNER' } });
      await prisma.adAccount.create({ data: { id: id.acct, workspaceId: id.ws, externalAccountId: `act_${t.key}`, name: 'Synthetic account', currency: t.currency, currencyMinorFactor: t.factor, timezone: 'UTC', metaAccountStatus: 1, lastSyncedAt: new Date() } });
      for (let c = 0; c < 3; c++) await prisma.campaign.create({ data: { id: id.camp(c), adAccountId: id.acct, externalCampaignId: `c${c}_${t.key}`, name: `Campaign ${c}`, objective: 'MESSAGES', dailyBudget: 5_000_000n } });
      for (let a = 0; a <= HISTORY_DAYS; a++) {
        const spend = a === 0 ? 80_000 : 100_000;
        const msgs = a === 0 ? 0 : a <= 7 ? 10 : 20;
        await prisma.dailyStat.create({ data: { entityType: EntityType.ACCOUNT, entityId: id.acct, date: day(a), spend: BigInt(spend), impressions: 25_000n, clicks: 500n, linkClicks: 500n, messages: BigInt(msgs), ctr: 2.0, frequency: 2.0, cpm: spend / 25, cpc: spend / 500 } });
        if (t.raws) await prisma.rawInsight.create({ data: { entityType: EntityType.ACCOUNT, entityId: id.acct, date: day(a), rawJson: { spend: String(spend) } } });
      }
      for (let c = 0; c < 3; c++) for (let a = 0; a <= HISTORY_DAYS; a++) {
        const spend = a === 0 ? 26_667 : 33_333;
        await prisma.dailyStat.create({ data: { entityType: EntityType.CAMPAIGN, entityId: id.camp(c), date: day(a), spend: BigInt(spend), impressions: 8_000n, clicks: 160n, linkClicks: 160n, messages: BigInt(a === 0 ? 0 : a <= 7 ? 3 : 6), ctr: 2.0, frequency: 2.0, cpm: spend / 8, cpc: spend / 160 } });
      }
      await prisma.metricTrend.create({ data: { entityType: EntityType.ACCOUNT, entityId: id.acct, date: day(0), ctrTrend: -0.33, cpmTrend: 0.4, frequencyTrend: 0.46, resultsTrend: -0.33, spendTrend: 0 } });
      await prisma.detectedIssue.create({ data: { entityType: EntityType.ACCOUNT, entityId: id.acct, date: day(1), issueCode: IssueCode.HIGH_FREQUENCY, severity: 'MEDIUM', evidenceJson: [] } });
      for (const r of [
        { code: 'PAUSE_AND_RELAUNCH', priority: 'CRITICAL' as const, issues: ['AUDIENCE_FATIGUE', 'DECLINING_RESULTS', 'RISING_COST_PER_RESULT'], src: 'V1_RULES' },
        { code: 'BROADEN_AUDIENCE', priority: 'HIGH' as const, issues: ['AUDIENCE_FATIGUE', 'HIGH_FREQUENCY'], src: 'V1_RULES' },
        { code: 'INCREASE_BUDGET', priority: 'MEDIUM' as const, issues: [], src: 'AI_AGENT' },
      ]) {
        await prisma.recommendation.create({ data: { entityType: EntityType.ACCOUNT, entityId: id.acct, date: day(1), priority: r.priority, actionCode: r.code, sourceIssuesJson: r.issues, source: r.src === 'AI_AGENT' ? RecommendationSource.AI_AGENT : RecommendationSource.V1_RULES } });
      }
    }
    console.log('seeded', TENANTS.map((t) => t.key).join(', '));
    await prisma.$disconnect(); await pool.end();
    return;
  }

  // ── dump ──
  const { buildRoutes } = await import('../../src/api/server');
  const { RulesEngine } = await import('../../src/engines/rules/RulesEngine');
  const { RecommendationEngine } = await import('../../src/engines/recommendation/RecommendationEngine');
  const { AdlyticIntelligenceSystem } = await import('../../src/engines/intelligence/AdlyticIntelligenceSystem');
  const { runBrainOrchestrator } = await import('../../src/workers/runBrainOrchestrator');
  const { ToolDispatcher } = await import('../../src/services/agent/dispatcher');
  const { ToolCache } = await import('../../src/services/agent/cache');
  const { RateLimiter } = await import('../../src/services/agent/rateLimit');
  const { buildAgentToolHandlers } = await import('../../src/services/agent/tools');
  const app = buildRoutes(prisma);
  const noMeta: any = new Proxy({}, { get: () => () => { throw new Error('no network'); } });
  const VOLATILE = new Set(['checkedAt', 'generatedAt', 'syncAgeHours', 'fetchedAt', 'createdAt', 'updatedAt', 'durationMs', 'computedAt', 'timestamp', 'narrationGeneratedAt',
    // clock-dependent: the agent tools' envelope and today's burn rate / staleness
    'executionMs', 'cachedSeconds', 'stalenessMinutes', 'burnRatePerHour']);
  /** Narrative text carries the clock-dependent burn rate ("معدل الحرق 5,000 لكل ساعة", "(5,000/ساعة)", "لحوالي 3 ساعات"): digits masked there only. */
  const maskClock = (t: string) => t.replace(/(معدل الحرق )[0-9.,]+/g, '$1#').replace(/\(?[0-9.,]+\/ساعة\)?/g, '#/ساعة').replace(/(لحوالي |لأقل من )[0-9.,]+/g, '$1#');
  const norm = (v: unknown): unknown => {
    // arrays of plain strings (e.g. id lists) come back in an unspecified order from some routes: compare them as sets
    if (Array.isArray(v)) return v.every((x) => typeof x === 'string') ? [...(v as string[])].sort() : v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as object).sort().filter((k) => !VOLATILE.has(k)).map((k) => [k, k === 'id' || k === 'reportId' || k === 'campaignRowId' ? 'ID' : norm((v as Record<string, unknown>)[k])]));
    }
    return typeof v === 'bigint' ? v.toString() : typeof v === 'string' ? maskClock(v) : v;
  };
  const quiet = async <T,>(fn: () => Promise<T>): Promise<T> => { const l = console.log, i = console.info, w = console.warn; console.log = console.info = console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.info = i; console.warn = w; } };

  const out: Record<string, unknown> = {};
  for (const t of TENANTS) {
    const id = ids(t.key);
    const asOf = new Date();
    await quiet(async () => {
      await new RulesEngine(prisma).run(EntityType.ACCOUNT, id.acct, { asOf });
      await new RecommendationEngine(prisma).run(EntityType.ACCOUNT, id.acct, { asOf });
      await new AdlyticIntelligenceSystem(prisma).run(id.acct, asOf);
      await runBrainOrchestrator(prisma, noMeta, id.acct, { now: asOf });
    });
    const token = signToken({ sub: id.user, email: `${id.user}@repro.invalid`, ver: 0 });
    const routes = [
      `/api/dashboard/${id.ws}`, `/api/workspaces/${id.ws}/recommendations`, `/api/workspaces/${id.ws}/insights?days=30`, `/api/workspaces/${id.ws}/campaigns?days=30`,
      `/api/workspaces/${id.ws}/data-health`, `/api/workspaces/${id.ws}/issues`, `/api/workspaces/${id.ws}/insights/trends`, `/api/workspaces/${id.ws}/campaigns/${id.camp(0)}/inspector`,
      `/api/weekly-report/${id.ws}`, `POST:/api/workspaces/${id.ws}/campaigns/${id.camp(0)}/investigate`,
    ];
    const res: Record<string, unknown> = {};
    for (const r0 of routes) {
      const isPost = r0.startsWith('POST:');
      const r = isPost ? r0.slice(5) : r0;
      const resp = await quiet(() => app.request(r, { method: isPost ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` } }));
      const headers = Object.fromEntries([...resp.headers.entries()].filter(([k]) => k.startsWith('x-') && k !== 'x-recommendation-log-id' && k !== 'x-request-id').sort());
      let body: unknown; try { body = await resp.json(); } catch { body = null; }
      res[`${isPost ? 'POST ' : ''}${r.replace(id.ws, ':ws').replace(id.camp(0), ':camp')}`] = { status: resp.status, headers, body: norm(body) };
    }
    // the AI agent's read tools through the real dispatcher (a fresh cache and limiter per call: the envelope the model gets)
    const callTool = async (name: string, args: unknown) => quiet(() => new ToolDispatcher(buildAgentToolHandlers() as any, { prisma, workspaceId: id.ws, userId: id.user } as any, { cache: new ToolCache(), rateLimiter: new RateLimiter({ capacity: 10_000 }) }).dispatch(name, args));
    const acctCmp = (entityType: string, entityId: string) => ({ entityType, entityId, windowA: { sinceDaysAgo: 7, untilDaysAgo: 1 }, windowB: { sinceDaysAgo: 14, untilDaysAgo: 8 } });
    const toolCalls: Array<[string, string, unknown]> = [
      ['tool:list_campaigns', 'list_campaigns', {}],
      ['tool:list_campaigns sortBy cost_per_message', 'list_campaigns', { sortBy: 'cost_per_message' }],
      ['tool:get_campaign_details', 'get_campaign_details', { campaignId: id.camp(0) }],
      ['tool:rank_campaigns cost_per_message', 'rank_campaigns', { metric: 'cost_per_message' }],
      ['tool:rank_campaigns ctr', 'rank_campaigns', { metric: 'ctr' }],
      ['tool:compare_periods ACCOUNT', 'compare_periods', acctCmp('ACCOUNT', id.acct)],
      ['tool:compare_periods CAMPAIGN', 'compare_periods', acctCmp('CAMPAIGN', id.camp(0))],
      ['tool:detect_anomaly workspace', 'detect_anomaly', { scope: 'workspace', lookbackDays: 7 }],
      ['tool:detect_anomaly campaign', 'detect_anomaly', { scope: 'campaign', campaignId: id.camp(0), lookbackDays: 7 }],
      ['tool:simulate_budget_shift', 'simulate_budget_shift', { fromCampaignId: id.camp(0), toCampaignId: id.camp(1), shiftAmount: { value: 20, unit: 'pct_of_from' }, projectionDays: 7 }],
    ];
    for (const [label, name, args] of toolCalls) res[label] = norm(await callTool(name, args));
    res['rows:detected_issues'] = norm(await prisma.detectedIssue.findMany({ where: { entityId: id.acct }, orderBy: [{ date: 'asc' }, { issueCode: 'asc' }] }));
    res['rows:recommendations'] = norm(await prisma.recommendation.findMany({ where: { entityId: id.acct }, orderBy: [{ date: 'asc' }, { actionCode: 'asc' }] }));
    res['rows:campaign_brain_snapshots'] = norm(await prisma.campaignBrainSnapshot.findMany({ where: { workspaceId: id.ws }, orderBy: [{ externalCampaignId: 'asc' }] }));
    res['rows:campaign_recommendations'] = norm(await prisma.campaignRecommendation.findMany({ where: { report: { adAccountId: id.acct } }, orderBy: [{ actionCode: 'asc' }] }).catch(() => []));
    out[t.key] = res;
  }
  writeFileSync(outFile!, JSON.stringify(out, null, 1));
  console.log('wrote', outFile, `(${JSON.stringify(out).length} bytes)`);
  await prisma.$disconnect(); await pool.end();
}

main().catch((e) => { console.error('differential crashed:', e); process.exit(1); });
