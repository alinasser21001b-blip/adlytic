/**
 * Prune duplicate campaign_brain_snapshots that spam the CMO feed with
 * identical learning-phase messages.
 *
 * Keeps one learning-phase row per campaign (across all tick dates).
 * Also collapses same-day duplicate rows when the unique index was violated
 * by legacy data.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/pruneDuplicateBrainInsights.ts
 *   railway run npx tsx scripts/pruneDuplicateBrainInsights.ts
 *
 * Dry-run (default): logs what would be deleted.
 *   DRY_RUN=0 npx tsx --env-file=.env scripts/pruneDuplicateBrainInsights.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  isLearningPhaseNarration,
  isLearningPhaseSnapshot,
  readNarrationTitle,
} from '../src/lib/cmoInsightDedupe';

const DRY_RUN = process.env['DRY_RUN'] !== '0';

type SnapshotRow = {
  id: string;
  campaignId: string;
  tickDate: Date;
  action: string;
  priority: string;
  payload: unknown;
  narrationJson: unknown;
  narrationGeneratedAt: Date | null;
  createdAt: Date;
};

function priorityWeight(p: string): number {
  if (p === 'CRITICAL') return 3;
  if (p === 'HIGH') return 2;
  return 1;
}

function isLearningSpamRow(row: SnapshotRow): boolean {
  if (row.narrationJson != null && isLearningPhaseNarration(row.narrationJson)) return true;
  return isLearningPhaseSnapshot({ action: row.action, payload: row.payload });
}

function pickWinner(a: SnapshotRow, b: SnapshotRow): SnapshotRow {
  const aN = a.narrationJson != null;
  const bN = b.narrationJson != null;
  if (aN !== bN) return aN ? a : b;

  const aLearn = aN && isLearningPhaseNarration(a.narrationJson);
  const bLearn = bN && isLearningPhaseNarration(b.narrationJson);
  if (aLearn !== bLearn) return aLearn ? a : b;

  const pw = priorityWeight(a.priority) - priorityWeight(b.priority);
  if (pw !== 0) return pw > 0 ? a : b;

  const aGen = a.narrationGeneratedAt?.getTime() ?? 0;
  const bGen = b.narrationGeneratedAt?.getTime() ?? 0;
  if (aGen !== bGen) return aGen > bGen ? a : b;

  return a.createdAt <= b.createdAt ? a : b;
}

function sameDayKey(campaignId: string, tickDate: Date): string {
  return `${campaignId}:${tickDate.toISOString().slice(0, 10)}`;
}

function learningCampaignKey(campaignId: string): string {
  return `${campaignId}:learning`;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL not set');

  const parsed = new URL(url);
  const pool = new pg.Pool({
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: parsed.hostname.endsWith('.railway.internal')
      ? false
      : { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const rows = await prisma.campaignBrainSnapshot.findMany({
    select: {
      id: true,
      campaignId: true,
      tickDate: true,
      action: true,
      priority: true,
      payload: true,
      narrationJson: true,
      narrationGeneratedAt: true,
      createdAt: true,
    },
    orderBy: [{ campaignId: 'asc' }, { tickDate: 'asc' }, { createdAt: 'asc' }],
  });

  const sameDayGroups = new Map<string, SnapshotRow[]>();
  const learningGroups = new Map<string, SnapshotRow[]>();

  for (const row of rows) {
    const dayKey = sameDayKey(row.campaignId, row.tickDate);
    const dayBucket = sameDayGroups.get(dayKey) ?? [];
    dayBucket.push(row);
    sameDayGroups.set(dayKey, dayBucket);

    if (isLearningSpamRow(row)) {
      const learnKey = learningCampaignKey(row.campaignId);
      const learnBucket = learningGroups.get(learnKey) ?? [];
      learnBucket.push(row);
      learningGroups.set(learnKey, learnBucket);
    }
  }

  const toDelete = new Set<string>();
  let duplicateDayGroups = 0;
  let learningCampaignGroups = 0;
  let learningSpamRows = 0;

  for (const [, bucket] of sameDayGroups) {
    if (bucket.length <= 1) continue;
    duplicateDayGroups++;
    let winner = bucket[0]!;
    for (let i = 1; i < bucket.length; i++) {
      winner = pickWinner(winner, bucket[i]!);
    }
    for (const row of bucket) {
      if (row.id === winner.id) continue;
      toDelete.add(row.id);
    }
  }

  for (const [, bucket] of learningGroups) {
    if (bucket.length <= 1) continue;
    learningCampaignGroups++;
    let winner = bucket[0]!;
    for (let i = 1; i < bucket.length; i++) {
      winner = pickWinner(winner, bucket[i]!);
    }
    for (const row of bucket) {
      if (row.id === winner.id) continue;
      toDelete.add(row.id);
      const title = readNarrationTitle(row.narrationJson);
      if (title && isLearningPhaseNarration(row.narrationJson)) learningSpamRows++;
    }
  }

  const toDeleteList = Array.from(toDelete);

  console.log(
    `[prune-brain-insights] scanned=${rows.length} duplicateDayGroups=${duplicateDayGroups} ` +
    `learningCampaignGroups=${learningCampaignGroups} toDelete=${toDeleteList.length} ` +
    `learningSpam=${learningSpamRows} dryRun=${DRY_RUN}`,
  );

  if (toDeleteList.length === 0) {
    console.log('[prune-brain-insights] nothing to prune.');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log('[prune-brain-insights] sample ids:', toDeleteList.slice(0, 10).join(', '));
    console.log('[prune-brain-insights] re-run with DRY_RUN=0 to delete.');
  } else {
    const CHUNK = 100;
    let deleted = 0;
    for (let i = 0; i < toDeleteList.length; i += CHUNK) {
      const slice = toDeleteList.slice(i, i + CHUNK);
      const result = await prisma.campaignBrainSnapshot.deleteMany({
        where: { id: { in: slice } },
      });
      deleted += result.count;
    }
    console.log(`[prune-brain-insights] deleted ${deleted} duplicate row(s).`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
