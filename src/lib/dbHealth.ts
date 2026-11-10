// ════════════════════════════════════════════════════════════════════════
//  src/lib/dbHealth.ts — what /api/health can truthfully say about the database.
//
//  WHY THIS EXISTS
//  /api/health used to run `SELECT 1` and report one of two things. That
//  hid two different problems (reproduced locally by
//  scripts/repro/health_matrix.ts):
//
//   1. FOUR different failures — server unreachable, DNS gone, database
//      dropped, credentials rejected — all produced the SAME 503 body
//      (`db: "unavailable"`) and not one log line naming the cause. A removed
//      Postgres service and a rotated password look identical from outside.
//
//   2. A reachable database with NO schema (restored without migrations, or
//      `?schema=` pointing somewhere the pool does not look) answered
//      200 `db: "ok"` while every real query failed with P2021. A green health
//      check on a broken app is worse than a red one: the platform promotes it.
//
//  WHAT IT DOES NOT DO
//  · It never returns or logs the driver's message text — that text carries
//    the host:port and sometimes the user name. Only a closed vocabulary
//    leaves this module.
//  · It does not decide to fail deployments on `pending`/`failed` migrations.
//    Those are reported, not enforced, until the owner decides: production has
//    not been exercised against that gate. Only the two cases where the app is
//    CERTAINLY broken degrade the status (database down, core schema missing).
// ════════════════════════════════════════════════════════════════════════

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

/** Closed vocabulary — safe to publish on an unauthenticated endpoint. */
export type DbFailureReason =
  | 'unreachable'       // refused / DNS / connection closed / too many connections
  | 'database_missing'  // server answered, the named database does not exist
  | 'auth'              // credentials or role rejected
  | 'tls'               // TLS handshake / certificate problem
  | 'timeout'           // reached, then timed out
  | 'unknown';

export type SchemaState =
  | 'ok'        // history table present, every shipped migration applied, none failed
  | 'missing'   // core table absent: the app cannot work on this database
  | 'pending'   // fewer migrations applied than ship with this build
  | 'failed'    // an unfinished (failed) migration row exists
  | 'unknown';  // could not be determined (no history table, no migrations dir, probe error)

export interface SchemaReadiness {
  state: SchemaState;
  /** Migrations recorded as finished and not rolled back. null if unknown. */
  applied: number | null;
  /** Migrations that ship with this build (directories under prisma/migrations). null if unreadable. */
  expected: number | null;
}

/** Driver-adapter error kinds (Prisma 7 + @prisma/adapter-pg) → reason. Observed, not assumed. */
const KIND_TO_REASON: Record<string, DbFailureReason> = {
  DatabaseNotReachable: 'unreachable',
  ConnectionClosed: 'unreachable',
  TooManyConnections: 'unreachable',
  DatabaseDoesNotExist: 'database_missing',
  DatabaseAccessDenied: 'auth',
  AuthenticationFailed: 'auth',
  TlsConnectionError: 'tls',
  SocketTimeout: 'timeout',
};
const PRISMA_CODE_TO_REASON: Record<string, DbFailureReason> = {
  P1001: 'unreachable', P1002: 'timeout', P1008: 'timeout', P1000: 'auth', P1003: 'database_missing', P1011: 'tls',
};
const NODE_CODE_TO_REASON: Record<string, DbFailureReason> = {
  ECONNREFUSED: 'unreachable', ENOTFOUND: 'unreachable', EAI_AGAIN: 'unreachable', ECONNRESET: 'unreachable',
  EHOSTUNREACH: 'unreachable', ENETUNREACH: 'unreachable', ETIMEDOUT: 'timeout',
};
const PG_SQLSTATE_TO_REASON: Record<string, DbFailureReason> = {
  '3D000': 'database_missing', '28000': 'auth', '28P01': 'auth', '57P03': 'unreachable', '53300': 'unreachable',
};

/** Map a driver/Prisma/Node error to the closed vocabulary. Reads structure, never message text. */
export function classifyDbError(err: unknown): DbFailureReason {
  const e = err as {
    code?: unknown;
    cause?: { code?: unknown } | null;
    meta?: { driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } | null } | null } | null;
  } | null;
  if (!e || typeof e !== 'object') return 'unknown';

  const adapterCause = e.meta?.driverAdapterError?.cause;
  const kind = typeof adapterCause?.kind === 'string' ? adapterCause.kind : null;
  if (kind && KIND_TO_REASON[kind]) return KIND_TO_REASON[kind]!;
  const original = typeof adapterCause?.originalCode === 'string' ? adapterCause.originalCode : null;
  if (original && PG_SQLSTATE_TO_REASON[original]) return PG_SQLSTATE_TO_REASON[original]!;

  const code = typeof e.code === 'string' ? e.code : null;
  if (code && PRISMA_CODE_TO_REASON[code]) return PRISMA_CODE_TO_REASON[code]!;
  if (code && NODE_CODE_TO_REASON[code]) return NODE_CODE_TO_REASON[code]!;
  if (code && PG_SQLSTATE_TO_REASON[code]) return PG_SQLSTATE_TO_REASON[code]!;
  const causeCode = typeof e.cause?.code === 'string' ? e.cause.code : null;
  if (causeCode && NODE_CODE_TO_REASON[causeCode]) return NODE_CODE_TO_REASON[causeCode]!;
  return 'unknown';
}

// ── expected migrations (what THIS build ships) ──────────────────────────

let expectedCache: number | null | undefined;

/** Number of migration directories shipped with this build, or null when unreadable. */
export function expectedMigrationCount(candidates?: string[]): number | null {
  if (expectedCache !== undefined && !candidates) return expectedCache;
  const dirs = candidates ?? [
    path.resolve(process.cwd(), 'prisma', 'migrations'),
    path.resolve(__dirname, '..', '..', 'prisma', 'migrations'),          // src/lib → repo root (tsx)
    path.resolve(__dirname, '..', '..', '..', 'prisma', 'migrations'),    // dist/src/lib → repo root (compiled)
  ];
  let found: number | null = null;
  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) continue;
      found = readdirSync(dir).filter((n) => {
        try { return statSync(path.join(dir, n)).isDirectory() && existsSync(path.join(dir, n, 'migration.sql')); } catch { return false; }
      }).length;
      break;
    } catch { /* try the next candidate */ }
  }
  if (!candidates) expectedCache = found;
  return found;
}

// ── schema probe ─────────────────────────────────────────────────────────

const SCHEMA_CACHE_MS = 30_000;
let schemaCache = new WeakMap<object, { at: number; value: SchemaReadiness }>();

export interface ProbeOptions {
  now?: () => number;
  /** Override the shipped-migration count (tests). `undefined` = read from disk. */
  expected?: number | null;
  cacheMs?: number;
}

/**
 * One bounded round-trip: does the core table exist, and how do applied
 * migrations compare with what this build ships? Cached briefly because the
 * endpoint is public and may be polled.
 */
export async function probeSchema(prisma: PrismaClient, opts: ProbeOptions = {}): Promise<SchemaReadiness> {
  const now = (opts.now ?? Date.now)();
  const cacheMs = opts.cacheMs ?? SCHEMA_CACHE_MS;
  const hit = schemaCache.get(prisma);
  if (hit && now - hit.at < cacheMs) return hit.value;

  const expected = opts.expected === undefined ? expectedMigrationCount() : opts.expected;
  let value: SchemaReadiness;
  try {
    const rel = await prisma.$queryRaw<Array<{ core: boolean; history: boolean }>>`
      SELECT to_regclass('public.users') IS NOT NULL AS core,
             to_regclass('public._prisma_migrations') IS NOT NULL AS history`;
    const r = rel[0];
    if (!r?.core) {
      value = { state: 'missing', applied: null, expected };
    } else if (!r.history) {
      value = { state: 'unknown', applied: null, expected };
    } else {
      const counts = await prisma.$queryRaw<Array<{ applied: number; failed: number }>>`
        SELECT (count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL))::int AS applied,
               (count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL))::int AS failed
        FROM _prisma_migrations`;
      const applied = Number(counts[0]?.applied ?? 0);
      const failed = Number(counts[0]?.failed ?? 0);
      const state: SchemaState = failed > 0 ? 'failed' : expected == null ? 'unknown' : applied < expected ? 'pending' : 'ok';
      value = { state, applied, expected };
    }
  } catch {
    value = { state: 'unknown', applied: null, expected };
  }
  schemaCache.set(prisma, { at: now, value });
  return value;
}

// ── rate-limited, message-free logging ───────────────────────────────────

const lastLogged = new Map<string, number>();
const LOG_EVERY_MS = 60_000;

/** One line per reason per minute. Never includes the driver message, host, or user. */
export function logDbFailure(reason: DbFailureReason, err: unknown, now: number = Date.now()): boolean {
  const last = lastLogged.get(reason);
  if (last !== undefined && now - last < LOG_EVERY_MS) return false;
  lastLogged.set(reason, now);
  const e = err as { code?: unknown; meta?: { driverAdapterError?: { cause?: { kind?: unknown } } } } | null;
  const code = typeof e?.code === 'string' ? e.code : '-';
  const kind = typeof e?.meta?.driverAdapterError?.cause?.kind === 'string' ? e.meta.driverAdapterError.cause.kind : '-';
  console.warn(`[adlytic:health] database probe failed reason=${reason} prismaCode=${code} adapterKind=${kind}`);
  return true;
}

/** Test seam: forget rate-limit and schema memory. */
export function __resetDbHealthStateForTests(): void {
  lastLogged.clear();
  expectedCache = undefined;
  schemaCache = new WeakMap();
}
