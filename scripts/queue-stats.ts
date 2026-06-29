// ════════════════════════════════════════════════════════════════════════
//  scripts/queue-stats.ts
//
//  Live, terminal-resident watch for the BullMQ queues.
//
//  Usage:
//    REDIS_URL=redis://... npx tsx scripts/queue-stats.ts
//
//  Refreshes every 2s. Shows active / waiting / completed / failed / delayed
//  counts for each of the four Phase-3 queues. A ⚠️ icon appears next to any
//  row whose `failed` count is greater than zero so a regression is visible
//  before the operator even reads the numbers.
//
//  Design notes:
//    • Pure Redis. No Prisma, no Hono, no business code. The point is to be
//      a lightweight passive observer that can sit alongside a staging soak
//      without adding a database connection or competing for any queue lock.
//    • Constructs ITS OWN ioredis client with `maxRetriesPerRequest: null`
//      (BullMQ's requirement) — does NOT share the API singleton in
//      src/lib/redis.ts (which is tuned to fail-fast for request traffic).
//    • Imports QUEUE_NAMES from src/lib/queue.ts so the monitor can NEVER
//      drift from production's queue names. If queue.ts ships a -v2 queue,
//      this monitor follows automatically.
//    • The Queue instances here are read-only OBSERVERS. Constructing a
//      `new Queue(name, { connection })` without an attached Worker neither
//      drains jobs nor mutates queue state — it just gives us a handle for
//      getJobCounts().
//    • Graceful SIGINT: closes Queue handles + quits the ioredis client so
//      the process doesn't leave dangling Redis connections in CLIENT LIST
//      after Ctrl+C.
// ════════════════════════════════════════════════════════════════════════

import IORedis, { type Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../src/lib/queue';

const REFRESH_MS = 2_000;

/** Counts we ask Redis for on every tick. Order matters — drives column order. */
const COUNT_KEYS = ['active', 'waiting', 'completed', 'failed', 'delayed'] as const;
type CountKey = (typeof COUNT_KEYS)[number];

/** Column header per count, with emoji as requested. */
const HEADERS: Record<CountKey, string> = {
  active: '🏃 Active',
  waiting: '⏳ Waiting',
  completed: '✅ Completed',
  failed: '🔴 Failed',
  delayed: '🕒 Delayed',
};

// ── env check ─────────────────────────────────────────────────────────────

function fatal(msg: string): never {
  console.error(`[queue-stats] ${msg}`);
  process.exit(1);
}

const REDIS_URL = (process.env['REDIS_URL'] ?? '').trim();
if (!REDIS_URL) {
  fatal('REDIS_URL is not set. Usage: REDIS_URL=redis://... npx tsx scripts/queue-stats.ts');
}

// Sanitize the URL for display — never print credentials.
function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname;
    const port = u.port || (u.protocol === 'rediss:' ? '6380' : '6379');
    return `${u.protocol}//${host}:${port}`;
  } catch {
    return '<invalid-url>';
  }
}
const REDIS_DISPLAY = sanitizeUrl(REDIS_URL);

// ── connection + queues ───────────────────────────────────────────────────

const connection: Redis = new IORedis(REDIS_URL, {
  // BullMQ-compatible client tuning. The monitor only issues short GETs
  // (getJobCounts → HMGET / ZCARD) so the blocking-friendly setting is more
  // about staying consistent with the workers than about correctness here.
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  lazyConnect: false,
  retryStrategy: (times: number) => Math.min(50 * 2 ** times, 5_000),
  keepAlive: 30_000,
  connectionName: `adlytic-queue-stats-${process.pid}`,
});

let redisStatus: 'connecting' | 'connected' | 'error' = 'connecting';
connection.on('connect', () => { redisStatus = 'connected'; });
connection.on('ready', () => { redisStatus = 'connected'; });
connection.on('error', (err) => {
  redisStatus = 'error';
  // Suppress noisy duplicate stack traces; keep the dashboard clean.
  process.stderr.write(`[queue-stats] redis error: ${err.message}\n`);
});
connection.on('end', () => { redisStatus = 'error'; });

const queues: Record<string, Queue> = {
  [QUEUE_NAMES.syncAccount]: new Queue(QUEUE_NAMES.syncAccount, { connection }),
  [QUEUE_NAMES.maintenance]: new Queue(QUEUE_NAMES.maintenance, { connection }),
  [QUEUE_NAMES.enginesAndBrain]: new Queue(QUEUE_NAMES.enginesAndBrain, { connection }),
  [QUEUE_NAMES.reconcileCampaigns]: new Queue(QUEUE_NAMES.reconcileCampaigns, { connection }),
};
const QUEUE_ORDER = Object.keys(queues);

// ── rendering ─────────────────────────────────────────────────────────────

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
function padLeft(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

/** Visible width that approximates terminal cells — emoji count as 2. */
function visibleWidth(s: string): number {
  // Strip ANSI then count emoji-like characters as 2.
  // We don't use ANSI here, so just count emoji range as 2 cells.
  let w = 0;
  for (const ch of s) {
    // Surrogate-pair emoji typically render double-wide.
    if (ch.codePointAt(0)! > 0xFFFF) w += 2;
    else w += 1;
  }
  return w;
}
function padHeader(s: string, width: number): string {
  const diff = width - visibleWidth(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

const QUEUE_COL_WIDTH = Math.max(
  ...QUEUE_ORDER.map((n) => n.length),
  'Queue'.length,
);
const COUNT_COL_WIDTHS: Record<CountKey, number> = {
  active: Math.max(visibleWidth(HEADERS.active), 7),
  waiting: Math.max(visibleWidth(HEADERS.waiting), 7),
  completed: Math.max(visibleWidth(HEADERS.completed), 11),
  failed: Math.max(visibleWidth(HEADERS.failed), 7),
  delayed: Math.max(visibleWidth(HEADERS.delayed), 7),
};

function renderHeader(): string {
  const cols = COUNT_KEYS.map((k) => padHeader(HEADERS[k], COUNT_COL_WIDTHS[k]));
  return `${padRight('Queue', QUEUE_COL_WIDTH)}   ${cols.join('   ')}`;
}

function renderSeparator(): string {
  const cols = COUNT_KEYS.map((k) => '─'.repeat(COUNT_COL_WIDTHS[k]));
  return `${'─'.repeat(QUEUE_COL_WIDTH)}   ${cols.join('   ')}`;
}

function renderRow(name: string, counts: Record<string, number>): string {
  const cols = COUNT_KEYS.map((k) =>
    padLeft(String(counts[k] ?? 0), COUNT_COL_WIDTHS[k]),
  );
  const alert = (counts['failed'] ?? 0) > 0 ? '  ⚠️' : '';
  return `${padRight(name, QUEUE_COL_WIDTH)}   ${cols.join('   ')}${alert}`;
}

/** ANSI escape: move cursor to home + clear screen (more reliable across
 *  terminals than console.clear() which is a no-op on some shells). */
function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[0;0H');
}

// ── tick loop ─────────────────────────────────────────────────────────────

let tickInFlight = false;
let stopped = false;
let nextTimer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  if (tickInFlight || stopped) return;
  tickInFlight = true;
  try {
    const results = await Promise.all(
      QUEUE_ORDER.map((name) =>
        queues[name]!
          .getJobCounts(...COUNT_KEYS)
          .then((c) => ({ name, counts: c, error: null as string | null }))
          .catch((err) => ({
            name,
            counts: {} as Record<string, number>,
            error: err instanceof Error ? err.message : String(err),
          })),
      ),
    );

    clearScreen();
    const now = new Date().toISOString();
    const statusIcon =
      redisStatus === 'connected' ? '✓ connected'
      : redisStatus === 'connecting' ? '… connecting'
      : '✗ error';
    console.log(`Adlytic Queue Monitor   ${now}   redis: ${statusIcon}  (${REDIS_DISPLAY})`);
    console.log('');
    console.log(renderHeader());
    console.log(renderSeparator());
    for (const r of results) {
      if (r.error) {
        console.log(`${padRight(r.name, QUEUE_COL_WIDTH)}   error: ${r.error}`);
      } else {
        console.log(renderRow(r.name, r.counts));
      }
    }
    console.log('');
    console.log(`Refreshing every ${REFRESH_MS / 1000}s. Press Ctrl+C to exit.`);
  } finally {
    tickInFlight = false;
    if (!stopped) {
      nextTimer = setTimeout(() => { void tick(); }, REFRESH_MS);
    }
  }
}

// ── graceful shutdown ─────────────────────────────────────────────────────

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  stopped = true;
  if (nextTimer) clearTimeout(nextTimer);
  process.stdout.write(`\n[queue-stats] ${signal} — closing connections…\n`);
  try {
    await Promise.allSettled(Object.values(queues).map((q) => q.close()));
  } catch {
    // queues already closed — fine
  }
  try {
    await connection.quit();
  } catch {
    // already disconnected — fine
  }
  process.exit(0);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

// ── boot ──────────────────────────────────────────────────────────────────

void tick();
