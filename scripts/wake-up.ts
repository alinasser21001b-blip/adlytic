// ════════════════════════════════════════════════════════════════════════
//  scripts/wake-up.ts
//
//  One-shot pipeline trigger — used when you don't want to wait for the
//  cron or reconnect Meta via the UI. For every AdAccount with a live
//  access token, runs in order:
//
//    1. worker.syncLifetimeTotals(acct.id)    ← surfaces true lifetime spend
//    2. worker.syncChunked(job.id)            ← deep historical sync window
//    3. runEngines + runBrainOrchestrator     ← V1 engines + V6 brain tick
//    4. runBrainNarrationCron(prisma)         ← regenerates Arabic narration
//
//  WINDOW_DAYS env (default 180) controls how far back the chunked sync goes.
//  WORKSPACE_ID env (optional) narrows to a single workspace.
//
//  Usage (Railway):
//    railway run npx tsx scripts/wake-up.ts
//  Usage (local against prod DB):
//    npx tsx --env-file=.env scripts/wake-up.ts
// ════════════════════════════════════════════════════════════════════════

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, SyncJobStatus } from '@prisma/client';
import pg from 'pg';

import { MetaClient } from '../src/services/metaClient';
import { SyncAccountWorker } from '../src/workers/syncAccount';
import { runEngines } from '../src/workers/runEngines';
import { runBrainOrchestrator } from '../src/workers/runBrainOrchestrator';
import { runBrainNarrationCron } from '../src/workers/brainNarrationCron';
import { decryptToken } from '../src/services/tokenEncryption';

const url  = new URL(process.env['DATABASE_URL']!);
const pool = new pg.Pool({
  host:     url.hostname,
  port:     Number(url.port) || 5432,
  user:     decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  ssl:      url.hostname.endsWith('.railway.internal') ? false : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const WINDOW_DAYS  = Number(process.env['WINDOW_DAYS']  ?? 180);
const WORKSPACE_ID = process.env['WORKSPACE_ID'] ?? null;
const API_VERSION  = process.env['META_API_VERSION'] ?? 'v20.0';

async function main(): Promise<void> {
  console.log(`[wake-up] window=${WINDOW_DAYS}d  workspace=${WORKSPACE_ID ?? '<all>'}`);

  const accounts = await prisma.adAccount.findMany({
    where: {
      status: 'ACTIVE',
      accessTokenEncrypted: { not: null },
      ...(WORKSPACE_ID ? { workspaceId: WORKSPACE_ID } : {}),
    },
  });
  console.log(`[wake-up] found ${accounts.length} eligible ad account(s)`);

  for (const acct of accounts) {
    const tag = `[wake-up:${acct.externalAccountId}]`;
    if (!acct.accessTokenEncrypted) { console.warn(`${tag} no token — skip`); continue; }
    if (acct.tokenExpiresAt && acct.tokenExpiresAt < new Date()) {
      console.warn(`${tag} token expired — skip`);
      continue;
    }

    const meta   = new MetaClient({ apiVersion: API_VERSION, accessToken: decryptToken(acct.accessTokenEncrypted) });
    const worker = new SyncAccountWorker(prisma, meta);

    // 1. Lifetime totals — independent of the chunked window.
    console.log(`${tag} (1/4) lifetime totals…`);
    await worker.syncLifetimeTotals(acct.id);

    // 2. Deep historical sync via SyncJob.
    const now   = new Date();
    const since = new Date(now.getTime() - (WINDOW_DAYS - 1) * 86400 * 1000);
    const job   = await prisma.syncJob.create({
      data: {
        adAccountId: acct.id,
        status:      SyncJobStatus.PENDING,
        windowDays:  WINDOW_DAYS,
        windowSince: since,
        windowUntil: now,
        triggeredBy: 'wake-up-script',
      },
    });
    console.log(`${tag} (2/4) syncChunked job=${job.id} ${WINDOW_DAYS}d…`);
    await worker.syncChunked(job.id);
    const final = await prisma.syncJob.findUnique({ where: { id: job.id } });
    if (final?.status !== SyncJobStatus.COMPLETED) {
      console.error(`${tag} sync ended ${final?.status} — ${final?.error ?? 'no error'}; skipping engines+brain`);
      continue;
    }

    // 3. V1 engines + V6 brain orchestrator.
    console.log(`${tag} (3/4) engines + brain tick…`);
    await runEngines(prisma, acct.id);
    await runBrainOrchestrator(prisma, meta, acct.id);
  }

  // 4. Narration cron — picks up every brain snapshot whose narration is
  //    null or stale, regardless of which account it came from.
  console.log(`[wake-up] (4/4) narration cron tick…`);
  const narr = await runBrainNarrationCron(prisma);
  console.log(`[wake-up] narration: considered=${narr.considered} narrated=${narr.narrated} sentinels=${narr.sentinels} durationMs=${narr.durationMs}`);

  await prisma.$disconnect();
  console.log(`[wake-up] done`);
}

main().catch(async (e) => {
  console.error('[wake-up] FATAL', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
