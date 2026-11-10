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
//  A first fix compared a COUNT of applied migrations with a count of shipped
//  ones. A count cannot tell "the 41 migrations this build ships" from "41
//  migrations, one of which this build has never heard of" — and it reads a
//  half-applied or foreign history as ok (scripts/repro/health_matrix.ts, H8).
//
//  WHAT IT DOES NOW
//  Release readiness is a question about IDENTITIES, not counts:
//
//    shipped  = names of the directories under prisma/migrations that hold a
//               migration.sql (what THIS build was written against)
//    applied  = _prisma_migrations.migration_name, finished and not rolled back
//    failed   = _prisma_migrations rows that are neither finished nor rolled back
//    required = every table of every Prisma model, in schema `public`
//
//    ok        every shipped identity applied; nothing else; no required table absent
//    ahead     every shipped identity applied, plus identities this build does
//              not ship (an older release running against a newer database).
//              TOLERATED — a rollback must not take the service down
//    pending   some shipped identity is not applied, no extras
//    diverged  some shipped identity is not applied AND extras exist. Includes
//              equal-count wrong histories (41 shipped / 41 applied, one name differs)
//    failed    any unfinished row, even when every shipped identity is applied
//    missing   a required table is absent (also: an empty database)
//    unknown   shipped list unreadable, required-table list unreadable, history
//              table absent, or the probe itself errored
//
//    READY = ok | ahead. Everything else is NOT ready and answers 503.
//    Fail closed: an unreadable shipped list never passes silently; it is logged.
//
//  Precedence when several things are wrong: failed > pending/diverged > missing
//  table > ahead > ok. A pending migration usually ALSO means missing tables;
//  naming the migration is the more useful label, and the table list is logged
//  regardless.
//
//  WHAT LEAVES THIS MODULE
//  · The PUBLIC body says nothing about any of this. Not-ready is the same
//    shape as ready with a different status/HTTP code (see server.ts). The
//    reason and the detail go to the server log only — a closed vocabulary
//    plus migration/table NAMES (at most 5 each), sanitised.
//  · It never returns or logs the driver's message text — that text carries
//    the host:port and sometimes the user name — nor a URL, host, port, user
//    or SQL text.
//  · No environment variables, no network, no calls to Railway/Meta/GitHub.
// ════════════════════════════════════════════════════════════════════════

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/** Closed vocabulary for CONNECTIVITY failures. Server log only — never the public body. */
export type DbFailureReason =
  | 'unreachable'       // refused / DNS / connection closed / too many connections
  | 'database_missing'  // server answered, the named database does not exist
  | 'auth'              // credentials or role rejected
  | 'tls'               // TLS handshake / certificate problem
  | 'timeout'           // reached, then timed out
  | 'unknown';

export type ReadinessState = 'ok' | 'ahead' | 'pending' | 'diverged' | 'failed' | 'missing' | 'unknown';

export type UnknownReason =
  | 'shipped_unreadable'  // prisma/migrations could not be read (or holds no migration)
  | 'tables_unreadable'   // the required-table list could not be derived from the Prisma client
  | 'history_absent'      // every required table exists but there is no _prisma_migrations
  | 'probe_error';        // a query failed

export interface Readiness {
  state: ReadinessState;
  /** ok | ahead. The only thing the route turns into a 200. */
  ready: boolean;
  /** Distinct applied identities (finished, not rolled back). null when the history was not read. */
  applied: number | null;
  /** Migrations this build ships. null when unreadable. */
  shipped: number | null;
  /** Shipped but not applied (full list; the log truncates). */
  missingMigrations: string[];
  /** Applied but not shipped by this build. */
  unexpectedMigrations: string[];
  /** Rows that are neither finished nor rolled back. */
  failedMigrations: string[];
  /** Required tables that are absent. */
  missingTables: string[];
  unknownReason?: UnknownReason;
  /** Only for probe_error: the structure of the error, never its text. */
  cause?: { reason: DbFailureReason; prismaCode: string; adapterKind: string };
}

const READY_STATES: ReadonlySet<ReadinessState> = new Set<ReadinessState>(['ok', 'ahead']);

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

// ── what THIS build requires ─────────────────────────────────────────────

let shippedCache: string[] | undefined;

/**
 * Where this build's migrations can be, most trustworthy first.
 *
 * The module's OWN location comes first: the shipped list defines "what this
 * build needs", so it must be read from this build's files. The working
 * directory is incidental — a process started from another checkout, or from a
 * directory with a different prisma/migrations, would otherwise be judged
 * against a foreign list (an older one makes a database that lacks the newest
 * migration look ready). It stays as the LAST resort, and asking for it can
 * itself fail (process.cwd() throws when the directory was deleted), which must
 * never escape into the health route.
 */
export function migrationDirCandidates(): string[] {
  const out = [
    path.resolve(__dirname, '..', '..', 'prisma', 'migrations'),          // src/lib → repo root (tsx)
    path.resolve(__dirname, '..', '..', '..', 'prisma', 'migrations'),    // dist/src/lib → repo root (compiled)
  ];
  try { out.push(path.resolve(process.cwd(), 'prisma', 'migrations')); } catch { /* cwd deleted: skip the fallback */ }
  return out;
}

/**
 * Names of the migrations that ship with this build — directories under
 * prisma/migrations that hold a migration.sql — sorted. `null` when no
 * candidate directory is readable (never `[]` for "could not read").
 * A successful non-empty read is memoised; a failure is retried next time.
 */
export function shippedMigrationNames(candidates?: string[]): string[] | null {
  if (!candidates && shippedCache) return shippedCache;
  const dirs = candidates ?? migrationDirCandidates();
  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) continue;
      const names = readdirSync(dir).filter((n) => {
        try { return statSync(path.join(dir, n)).isDirectory() && existsSync(path.join(dir, n, 'migration.sql')); } catch { return false; }
      }).sort();
      if (!candidates && names.length > 0) shippedCache = names;
      return names;
    } catch { /* try the next candidate */ }
  }
  return null;
}

let requiredCache: string[] | undefined;

/**
 * Table of every Prisma model (its @@map, else the model name), taken from the
 * GENERATED client's own metadata — the same artefact every query goes through,
 * so it cannot drift from what the app actually reads. `null` when the client
 * does not expose it (the readiness probe then fails closed).
 * test_health_migration_gate.ts proves it equals the tables parsed from
 * prisma/schema.prisma, so a Prisma upgrade that drops this metadata fails CI
 * instead of failing a deployment.
 */
export function requiredTableNames(): string[] | null {
  if (requiredCache) return requiredCache;
  try {
    const dmmf = (Prisma as unknown as { dmmf?: { datamodel?: { models?: Array<{ name?: unknown; dbName?: unknown }> } } }).dmmf;
    const models = dmmf?.datamodel?.models;
    if (!Array.isArray(models) || models.length === 0) return null;
    const names: string[] = [];
    for (const m of models) {
      const n = typeof m.dbName === 'string' && m.dbName ? m.dbName : typeof m.name === 'string' ? m.name : '';
      if (!n) return null;
      names.push(n);
    }
    requiredCache = [...new Set(names)].sort();
    return requiredCache;
  } catch {
    return null;
  }
}

// ── the readiness decision (pure) ────────────────────────────────────────

interface HistoryRow { name: string; finished: boolean }

function decide(shipped: string[], required: string[], tables: ReadonlySet<string>, history: HistoryRow[] | null): Readiness {
  const missingTables = required.filter((t) => !tables.has(t)).sort();
  const base = { shipped: shipped.length, missingMigrations: [] as string[], unexpectedMigrations: [] as string[], failedMigrations: [] as string[], missingTables };

  if (history === null) {
    // No history table. An empty database is "missing"; a populated one with no history proves nothing.
    return missingTables.length > 0
      ? { ...base, state: 'missing', ready: false, applied: null }
      : { ...base, state: 'unknown', ready: false, applied: null, unknownReason: 'history_absent' };
  }

  const applied = new Set(history.filter((r) => r.finished).map((r) => r.name));
  const failedMigrations = [...new Set(history.filter((r) => !r.finished).map((r) => r.name))].sort();
  const shippedSet = new Set(shipped);
  const missingMigrations = shipped.filter((n) => !applied.has(n));
  const unexpectedMigrations = [...applied].filter((n) => !shippedSet.has(n)).sort();

  const state: ReadinessState =
    failedMigrations.length > 0 ? 'failed'
    : missingMigrations.length > 0 ? (unexpectedMigrations.length > 0 ? 'diverged' : 'pending')
    : missingTables.length > 0 ? 'missing'
    : unexpectedMigrations.length > 0 ? 'ahead'
    : 'ok';

  return { ...base, state, ready: READY_STATES.has(state), applied: applied.size, missingMigrations, unexpectedMigrations, failedMigrations };
}

function unknown(unknownReason: UnknownReason, shipped: number | null, extra: Partial<Readiness> = {}): Readiness {
  return {
    state: 'unknown', ready: false, applied: null, shipped,
    missingMigrations: [], unexpectedMigrations: [], failedMigrations: [], missingTables: [],
    unknownReason, ...extra,
  };
}

// ── readiness probe ──────────────────────────────────────────────────────

const READY_CACHE_MS = 30_000;
let readyCache = new WeakMap<object, { at: number; value: Readiness }>();

export interface ProbeOptions {
  now?: () => number;
  /** Override the shipped identities (tests). `undefined` = read from disk; `null` = unreadable. */
  shipped?: string[] | null;
  /** Override the required tables (tests). `undefined` = from the generated client; `null` = unreadable. */
  requiredTables?: string[] | null;
  cacheMs?: number;
}

/**
 * Is this database one THIS build can run against? Two bounded queries (which
 * tables exist; which migrations are recorded) compared with the build's own
 * identities. Never throws.
 *
 * CACHING: a READY result is reused for 30 s because the endpoint is public and
 * may be polled. A not-ready or errored result is NEVER cached — the next
 * request asks again, so recovery is visible at once. (The route's `SELECT 1`
 * liveness check is not cached either.)
 */
export async function probeReadiness(prisma: PrismaClient, opts: ProbeOptions = {}): Promise<Readiness> {
  const now = (opts.now ?? Date.now)();
  const cacheMs = opts.cacheMs ?? READY_CACHE_MS;
  const hit = readyCache.get(prisma);
  if (hit && now - hit.at < cacheMs) return hit.value;

  const shipped = opts.shipped === undefined ? shippedMigrationNames() : opts.shipped;
  const required = opts.requiredTables === undefined ? requiredTableNames() : opts.requiredTables;

  let value: Readiness;
  if (!shipped || shipped.length === 0) {
    value = unknown('shipped_unreadable', null);
  } else if (!required || required.length === 0) {
    value = unknown('tables_unreadable', shipped.length);
  } else {
    try {
      const tableRows = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public'`;
      const tables = new Set(tableRows.map((r) => String(r.name)));
      let history: HistoryRow[] | null = null;
      if (tables.has('_prisma_migrations')) {
        const rows = await prisma.$queryRaw<Array<{ name: string; finished: boolean }>>`
          SELECT migration_name AS name, (finished_at IS NOT NULL) AS finished
          FROM public._prisma_migrations
          WHERE rolled_back_at IS NULL`;
        history = rows.map((r) => ({ name: String(r.name), finished: r.finished === true }));
      }
      value = decide(shipped, required, tables, history);
    } catch (err) {
      value = unknown('probe_error', shipped.length, { cause: describeError(err) });
    }
  }

  if (value.ready) readyCache.set(prisma, { at: now, value });
  else readyCache.delete(prisma);
  return value;
}

// ── rate-limited, message-free logging ───────────────────────────────────

const lastLogged = new Map<string, number>();
const LOG_EVERY_MS = 60_000;
const MAX_NAMES = 5;
const MAX_NAME_LEN = 64;

/** Only identifier characters survive; anything else (newline, space, '/', ':', '@') becomes '?'. */
function safeToken(v: unknown): string {
  return String(v).replace(/[^A-Za-z0-9_.-]/g, '?').slice(0, MAX_NAME_LEN);
}

function describeError(err: unknown): NonNullable<Readiness['cause']> {
  const e = err as { code?: unknown; meta?: { driverAdapterError?: { cause?: { kind?: unknown } } } } | null;
  return {
    reason: classifyDbError(err),
    prismaCode: typeof e?.code === 'string' ? safeToken(e.code) : '-',
    adapterKind: typeof e?.meta?.driverAdapterError?.cause?.kind === 'string' ? safeToken(e.meta.driverAdapterError.cause.kind) : '-',
  };
}

function throttled(key: string, now: number): boolean {
  const last = lastLogged.get(key);
  if (last !== undefined && now - last < LOG_EVERY_MS) return true;
  lastLogged.set(key, now);
  return false;
}

/** One line per reason per minute. Never includes the driver message, host, or user. */
export function logDbFailure(reason: DbFailureReason, err: unknown, now: number = Date.now()): boolean {
  if (throttled(`conn:${reason}`, now)) return false;
  const c = describeError(err);
  console.warn(`[adlytic:health] database probe failed reason=${reason} prismaCode=${c.prismaCode} adapterKind=${c.adapterKind}`);
  return true;
}

function nameList(label: string, names: string[]): string {
  if (names.length === 0) return '';
  const more = names.length - MAX_NAMES;
  return ` ${label}=${names.slice(0, MAX_NAMES).map(safeToken).join(',')}${more > 0 ? `,+${more}more` : ''}`;
}

/**
 * One line per state per minute for a reachable database that is not
 * release-ready: the state, applied/shipped counts and at most 5 names each of
 * missing and unexpected migrations, failed rows and missing tables.
 * Names are sanitised; no driver text, host, port, user, URL or SQL.
 */
export function logNotReady(r: Readiness, now: number = Date.now()): boolean {
  if (r.ready) return false;
  if (throttled(`ready:${r.state}:${r.unknownReason ?? ''}`, now)) return false;
  const cause = r.cause ? ` reason=${r.cause.reason} prismaCode=${r.cause.prismaCode} adapterKind=${r.cause.adapterKind}` : '';
  console.warn(
    `[adlytic:health] database not release-ready state=${r.state} applied=${r.applied ?? '?'} shipped=${r.shipped ?? '?'}`
    + (r.unknownReason ? ` unknownReason=${r.unknownReason}` : '')
    + cause
    + nameList('missingMigrations', r.missingMigrations)
    + nameList('unexpectedMigrations', r.unexpectedMigrations)
    + nameList('failedMigrations', r.failedMigrations)
    + nameList('missingTables', r.missingTables),
  );
  return true;
}

/** Test seam: forget rate-limit and cache memory. */
export function __resetDbHealthStateForTests(): void {
  lastLogged.clear();
  shippedCache = undefined;
  requiredCache = undefined;
  readyCache = new WeakMap();
}
