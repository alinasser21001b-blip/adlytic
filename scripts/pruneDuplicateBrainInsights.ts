/**
 * Prune duplicate campaign_brain_snapshots that spam the CMO feed with
 * identical learning-phase messages.
 *
 * Keeps one row per (campaign_id, tick_date) — preferring narrated rows,
 * then highest priority, then latest narrationGeneratedAt.
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
import { isLearningPhaseNarration, readNarrationTitle } from '../src/lib/cmoInsightDedupe';

const DRY_RUN = process.env['DRY_RUN'] !== '0';

type SnapshotRow = {
  id: string;
  campaignId: string;
  tickDate: Date;
  action: string;
  priority: string;
  narrationJson: unknown;
  narrationGeneratedAt: Date | null;
  createdAt: Date;
};

function priorityWeight(p: string): number {
  if (p === 'CRITICAL') return 3;
  if (p === 'HIGH') return 2;
  return 1;
}

function pickWinner(a: SnapshotRow, b: SnapshotRow): SnapshotRow {
  const aN = a.narrationJson != null;
  const bN = b.narrationJson != null;
  if (aN !== bN) return aN ? a : b;

  const aLearn = aN && isLearningPhaseNarration(a.narrationJson);
  const bLearn = bN && isLearningPhaseNarration(b.narrationJson);
  if (aLearn !== bLearn) return aLearn ? b : a;

  const pw = priorityWeight(a.priority) - priorityWeight(b.priority);
  if (pw !== 0) return pw > 0 ? a : b;

  const aGen = a.narrationGeneratedAt?.getTime() ?? 0;
  const bGen = b.narrationGeneratedAt?.getTime() ?? 0;
  if (aGen !== bGen) return aGen > bGen ? a : b;

  return a.createdAt <= b.createdAt ? a : b;
}

function groupKey(campaignId: string, tickDate: Date): string {
  return `${campaignId}:${tickDate.toISOString().slice(0, 10)}`;
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
      narrationJson: true,
      narrationGeneratedAt: true,
      createdAt: true,
    },
    orderBy: [{ campaignId: 'asc' }, { tickDate: 'asc' }, { createdAt: 'asc' }],
  });

  const groups = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const key = groupKey(row.campaignId, row.tickDate);
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const toDelete: string[] = [];
  let duplicateGroups = 0;
  let learningSpamRows = 0;

  for (const [, bucket] of groups) {
    if (bucket.length <= 1) continue;
    duplicateGroups++;
    let winner = bucket[0]!;
    for (let i = 1; i < bucket.length; i++) {
      winner = pickWinner(winner, bucket[i]!);
    }
    for (const row of bucket) {
      if (row.id === winner.id) continue;
      toDelete.push(row.id);
      const title = readNarrationTitle(row.narrationJson);
      if (title && isLearningPhaseNarration(row.narrationJson)) learningSpamRows++;
    }
  }

  console.log(
    `[prune-brain-insights] scanned=${rows.length} duplicateGroups=${duplicateGroups} ` +
    `toDelete=${toDelete.length} learningSpam=${learningSpamRows} dryRun=${DRY_RUN}`,
  );

  if (toDelete.length === 0) {
    console.log('[prune-brain-insights] nothing to prune.');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log('[prune-brain-insights] sample ids:', toDelete.slice(0, 10).join(', '));
    console.log('[prune-brain-insights] re-run with DRY_RUN=0 to delete.');
  } else {
    const CHUNK = 100;
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const slice = toDelete.slice(i, i + CHUNK);
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
