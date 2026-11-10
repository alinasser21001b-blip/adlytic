#!/usr/bin/env -S npx tsx
// ════════════════════════════════════════════════════════════════════════
//  scripts/ops/preflight-schema.ts — "is this database safe to point THIS build at?"
//
//    DATABASE_URL=postgresql://… npx tsx scripts/ops/preflight-schema.ts \
//        [--json] [--counts] [--volume-bytes N] [--i-understand-this-reads-a-real-database]
//
//  Exit codes   0 GO · 1 NO-GO · 2 NOT RUN (cannot connect, bad arguments, refused)
//  Every check  prints PASS | FAIL | WARN | NOT_RUN with a one-line reason.
//
//  WHAT IT CHECKS (see delivery/core/RAILWAY_RECOVERY_RUNBOOK.md)
//    connect      server version and the database name, REDACTED (first 3 chars + length)
//    identities   the migrations this checkout ships (prisma/migrations/*/migration.sql) versus
//                 _prisma_migrations: missing, extra ("ahead"), unfinished, and the equal-count
//                 wrong history that a count comparison calls ok
//    checksums    sha256 of each shipped migration.sql versus the checksum Prisma stored when it
//                 applied it. `prisma migrate deploy` does NOT compare them (observed, see the
//                 runbook), and /api/health does not either: an edited-after-apply migration is
//                 invisible to both. This is the one check the health gate cannot make.
//    tables       every Prisma model's table exists in schema public
//    columns      every scalar/enum column of those models exists
//    restore_point / size / volume   row count and newest finished_at of _prisma_migrations,
//                 pg_database_size, the 10 largest tables, percent of --volume-bytes used
//    counts       with --counts: aggregates only (never an id, never a customer value)
//
//  IT CANNOT DISAGREE WITH /api/health about identities, tables and columns: the shipped list,
//  the required tables and the required columns come from src/lib/dbHealth.ts, and the state
//  precedence (failed > pending/diverged > missing table > missing column > ahead > ok) is the
//  same. test_preflight_schema.ts cross-checks both against dbHealth.probeReadiness.
//
//  SAFETY
//    · The whole run is one `BEGIN READ ONLY` transaction with SET LOCAL statement_timeout and
//      lock_timeout, and it ends with ROLLBACK — Postgres itself refuses a write inside it.
//    · Every statement is a constant defined below. Nothing read from the database is ever
//      interpolated into SQL (counts are chosen from a fixed list, gated on catalog presence).
//    · assertReadOnlySql() is a second, independent layer: every statement sent must start with
//      SELECT / SHOW / WITH, or be exactly BEGIN READ ONLY / ROLLBACK / SET LOCAL <timeout>; no
//      semicolons, comments, dollar-quoting, writing keywords or writing functions.
//    · Refuses a non-loopback DATABASE_URL unless --i-understand-this-reads-a-real-database.
//    · Output never contains the host, port, user, password or full database name; driver error
//      text is never printed (only a closed vocabulary and a SQLSTATE/Node code).
//    · No network access other than the one Postgres connection. No Railway/GitHub/Meta calls.
// ════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  classifyDbError,
  migrationDirCandidates,
  requiredColumnNames,
  requiredTableNames,
  shippedMigrationNames,
} from '../../src/lib/dbHealth';
import type { ReadinessState } from '../../src/lib/dbHealth';
import { pgSslFor } from '../../src/lib/pgSsl';

// ── vocabulary ───────────────────────────────────────────────────────────

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'NOT_RUN';
export type Verdict = 'GO' | 'NO-GO';

export interface CheckResult {
  id: string;
  status: CheckStatus;
  /** A gating check that is FAIL or NOT_RUN makes the verdict NO-GO. Non-gating checks inform. */
  gating: boolean;
  /** One line. */
  reason: string;
  /** Capped list of names / lines that explain the reason. */
  details?: string[];
}

/** A _prisma_migrations row (rows whose rolled_back_at is set are flagged, not dropped, so the pure function owns that rule). */
export interface HistoryRow { name: string; checksum: string | null; finished: boolean; rolledBack?: boolean }

/** sha256 hex of a migration.sql: raw bytes (what Prisma stores), and with every line ending normalised to LF / to CRLF. */
export interface FileHash { sha256: string; lfSha256: string; crlfSha256: string }

export interface SchemaFacts {
  /** Migration names this build ships. null / [] = unreadable → fail closed. */
  shipped: string[] | null;
  /** name → hashes of the shipped migration.sql. null = could not be read → fail closed. */
  fileHashes: Record<string, FileHash> | null;
  /** _prisma_migrations rows. null = the table does not exist. */
  history: HistoryRow[] | null;
  requiredTables: string[] | null;
  requiredColumns: ReadonlyMap<string, string[]> | null;
  presentTables: ReadonlySet<string> | string[];
  /** table → columns present (schema public). null = could not be read. */
  presentColumns: ReadonlyMap<string, ReadonlySet<string>> | null;
}

export interface SchemaDecision {
  verdict: Verdict;
  /** The word /api/health would log for this database (identities + tables + columns only). */
  state: ReadinessState;
  checks: CheckResult[];
}

// ── small pure helpers ───────────────────────────────────────────────────

const LIST_CAP = 10;
const NAME_MAX = 80;

/** Only identifier characters survive. Names read from the database are text, never trusted. */
function safeName(v: unknown): string {
  return String(v).replace(/[^A-Za-z0-9_.-]/g, '?').slice(0, NAME_MAX);
}

function capList(label: string, names: string[]): string[] {
  const sorted = [...names].sort();
  const shown = sorted.slice(0, LIST_CAP).map((n) => `${label}: ${safeName(n)}`);
  if (sorted.length > LIST_CAP) shown.push(`${label}: +${sorted.length - LIST_CAP} more`);
  return shown;
}

export function sha256Variants(buf: Buffer): FileHash {
  const h = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const text = buf.toString('latin1');                 // byte-preserving: only 0x0D / 0x0A are touched
  const lf = text.replace(/\r\n/g, '\n');
  return {
    sha256: h(buf),
    lfSha256: h(Buffer.from(lf, 'latin1')),
    crlfSha256: h(Buffer.from(lf.replace(/\n/g, '\r\n'), 'latin1')),
  };
}

/** First 3 characters and the length. A name of 3 characters or fewer reveals nothing of itself. */
export function redactDatabaseName(name: string): string {
  const s = String(name ?? '');
  return s.length > 3 ? `${s.slice(0, 3)}***(len=${s.length})` : `***(len=${s.length})`;
}

export function isLoopbackHost(host: string): boolean {
  let h = String(host ?? '').trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h === 'localhost' || h === '::1') return true;
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return !!m && [m[1], m[2], m[3]].every((o) => Number(o) <= 255);
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n; let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${u === 0 ? v : v.toFixed(1)} ${units[u]}`;
}

function ageDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 864e5);
}

// ── the pure decision ────────────────────────────────────────────────────

/** GO only when no gating check is FAIL or NOT_RUN. A check the operator asked for and that could not run is never skipped silently. */
export function combineVerdict(checks: CheckResult[]): Verdict {
  return checks.some((c) => c.gating && (c.status === 'FAIL' || c.status === 'NOT_RUN')) ? 'NO-GO' : 'GO';
}

const notRun = (id: string, reason: string, gating = true): CheckResult => ({ id, status: 'NOT_RUN', gating, reason });

/**
 * Given what this build ships and what the database holds, is the schema one this build can run against?
 * Pure: no I/O. The state vocabulary and precedence are src/lib/dbHealth.ts's (failed > pending/diverged >
 * missing table > missing column > ahead > ok; unknown when anything needed to decide is unreadable);
 * the extra dimension is the checksum comparison, which the health gate does not make.
 */
export function decideVerdict(f: SchemaFacts): SchemaDecision {
  const present = f.presentTables instanceof Set ? f.presentTables : new Set(f.presentTables as Iterable<string>);
  const shippedOk = !!f.shipped && f.shipped.length > 0;
  const tablesKnown = !!f.requiredTables && f.requiredTables.length > 0;
  const columnsKnown = !!f.requiredColumns;

  // ── tables ──
  const missingTables = tablesKnown ? f.requiredTables!.filter((t) => !present.has(t)).sort() : [];
  let tablesCheck: CheckResult;
  if (!tablesKnown) {
    tablesCheck = notRun('tables', 'the list of required tables could not be derived from the Prisma client (fail closed)');
  } else if (missingTables.length > 0) {
    tablesCheck = { id: 'tables', status: 'FAIL', gating: true, reason: `${missingTables.length} of ${f.requiredTables!.length} required tables are absent from schema public`, details: capList('absent table', missingTables) };
  } else {
    tablesCheck = { id: 'tables', status: 'PASS', gating: true, reason: `all ${f.requiredTables!.length} required tables are present` };
  }

  // ── columns ──
  const missingColumns: string[] = [];
  let columnsCheck: CheckResult;
  if (!columnsKnown) {
    columnsCheck = notRun('columns', 'the list of required columns could not be derived from the Prisma client (fail closed)');
  } else if (!f.presentColumns) {
    columnsCheck = notRun('columns', 'the columns present in the database could not be read');
  } else {
    let evaluated = 0; let skipped = 0; let total = 0;
    for (const [table, cols] of f.requiredColumns!) {
      if (!present.has(table)) { skipped++; continue; }
      evaluated++;
      total += cols.length;
      const have = f.presentColumns.get(table);
      for (const c of cols) if (!have || !have.has(c)) missingColumns.push(`${table}.${c}`);
    }
    missingColumns.sort();
    if (missingColumns.length > 0) {
      columnsCheck = { id: 'columns', status: 'FAIL', gating: true, reason: `${missingColumns.length} required column(s) are absent (every read of the affected table fails with P2022)`, details: capList('absent column', missingColumns) };
    } else if (skipped > 0) {
      columnsCheck = { id: 'columns', status: 'WARN', gating: true, reason: `no required column is absent among ${evaluated} present table(s); ${skipped} required table(s) are absent, so their columns were not evaluated` };
    } else {
      columnsCheck = { id: 'columns', status: 'PASS', gating: true, reason: `all ${total} required columns of ${evaluated} tables are present` };
    }
  }

  // ── identities (and the state, with dbHealth's precedence) ──
  let state: ReadinessState;
  let identity: CheckResult;
  if (!shippedOk) {
    state = 'unknown';
    identity = notRun('identities', 'the list of migrations this build ships could not be read (fail closed)');
  } else if (f.history === null) {
    state = !tablesKnown || !columnsKnown ? 'unknown' : missingTables.length > 0 ? 'missing' : 'unknown';
    identity = { id: 'identities', status: 'FAIL', gating: true, reason: 'there is no _prisma_migrations table: the database has no migration history' + (missingTables.length > 0 ? ' (an empty or unmigrated database)' : ' although the schema is present (Prisma would refuse it with P3005)') };
  } else {
    const live = f.history.filter((r) => !r.rolledBack);                 // a rolled-back row is neither applied nor failed
    const applied = new Set(live.filter((r) => r.finished).map((r) => r.name));
    const failed = [...new Set(live.filter((r) => !r.finished).map((r) => r.name))].sort();
    const shippedSet = new Set(f.shipped!);
    const missingMigrations = f.shipped!.filter((n) => !applied.has(n)).sort();
    const unexpected = [...applied].filter((n) => !shippedSet.has(n)).sort();
    const details = [...capList('unfinished', failed), ...capList('not applied', missingMigrations), ...capList('not shipped', unexpected)];
    const n = f.shipped!.length;
    if (!tablesKnown || !columnsKnown) {
      state = 'unknown';
      identity = { id: 'identities', status: unexpected.length > 0 || missingMigrations.length > 0 || failed.length > 0 ? 'FAIL' : 'PASS', gating: true, reason: `${applied.size}/${n} shipped migrations applied (the required table/column lists are unreadable, see below)`, details };
    } else if (failed.length > 0) {
      state = 'failed';
      identity = { id: 'identities', status: 'FAIL', gating: true, reason: `${failed.length} unfinished (failed or interrupted) migration row(s); ${missingMigrations.length} shipped migration(s) not applied`, details };
    } else if (missingMigrations.length > 0 && unexpected.length > 0) {
      state = 'diverged';
      identity = { id: 'identities', status: 'FAIL', gating: true, reason: `diverged history: ${missingMigrations.length} shipped migration(s) not applied AND ${unexpected.length} applied migration(s) this build does not ship${applied.size === n ? ' (equal count: a count comparison would call this ok)' : ''}`, details };
    } else if (missingMigrations.length > 0) {
      state = 'pending';
      identity = { id: 'identities', status: 'FAIL', gating: true, reason: `${missingMigrations.length} of ${n} shipped migrations are not applied (pending)`, details };
    } else if (missingTables.length > 0) {
      state = 'missing';
      identity = { id: 'identities', status: 'PASS', gating: true, reason: `all ${n} shipped migrations are applied (but required tables are absent, see tables)` };
    } else if (f.presentColumns === null) {
      state = 'unknown';
      identity = { id: 'identities', status: 'PASS', gating: true, reason: `all ${n} shipped migrations are applied (the columns could not be read, see columns)` };
    } else if (missingColumns.length > 0) {
      state = 'missing';
      identity = { id: 'identities', status: 'PASS', gating: true, reason: `all ${n} shipped migrations are applied (but required columns are absent, see columns)` };
    } else if (unexpected.length > 0) {
      state = 'ahead';
      identity = { id: 'identities', status: 'WARN', gating: true, reason: `all ${n} shipped migrations are applied; ${unexpected.length} applied migration(s) this build does not ship (an older build on a newer database: tolerated, as /api/health tolerates it)`, details };
    } else {
      state = 'ok';
      identity = { id: 'identities', status: 'PASS', gating: true, reason: `${applied.size}/${n} shipped migrations applied; none unfinished, none unexpected` };
    }
  }

  // ── checksums ──
  let checksum: CheckResult;
  if (!shippedOk) {
    checksum = notRun('checksums', 'no shipped migration list to compare against (fail closed)');
  } else if (f.history === null) {
    checksum = notRun('checksums', 'no _prisma_migrations table: nothing to compare');
  } else if (!f.fileHashes) {
    checksum = notRun('checksums', 'the shipped migration.sql files could not be hashed (fail closed)');
  } else {
    const drift: string[] = []; const lineEndings: string[] = []; const unreadable: string[] = [];
    let compared = 0; let notShipped = 0;
    const shippedSet = new Set(f.shipped!);
    for (const r of f.history) {
      if (r.rolledBack || !r.finished) continue;                          // only applied rows carry a checksum that means "applied"
      if (!shippedSet.has(r.name)) { notShipped++; continue; }
      const file = f.fileHashes[r.name];
      if (!file) { unreadable.push(r.name); continue; }
      compared++;
      const stored = (r.checksum ?? '').toLowerCase();
      if (stored === file.sha256) continue;
      if (stored === file.lfSha256 || stored === file.crlfSha256) { lineEndings.push(r.name); continue; }
      drift.push(r.name);
    }
    const details = [...capList('drift', drift), ...capList('line-endings only', lineEndings), ...capList('file unreadable', unreadable)];
    if (drift.length > 0) {
      checksum = { id: 'checksums', status: 'FAIL', gating: true, reason: `${drift.length} applied migration(s) differ from the shipped file (edited after it was applied, or a different file with the same name); \`prisma migrate deploy\` would not notice`, details };
    } else if (unreadable.length > 0) {
      checksum = { id: 'checksums', status: 'NOT_RUN', gating: true, reason: `${unreadable.length} shipped migration file(s) could not be hashed`, details };
    } else if (lineEndings.length > 0) {
      checksum = { id: 'checksums', status: 'WARN', gating: true, reason: `${lineEndings.length} checksum(s) differ ONLY by line endings (a CRLF/LF checkout: the SQL text is identical); ${compared - lineEndings.length} match byte for byte`, details };
    } else {
      checksum = { id: 'checksums', status: 'PASS', gating: true, reason: `${compared}/${compared} compared applied checksums match the shipped files byte for byte${notShipped > 0 ? ` (${notShipped} applied migration(s) are not shipped by this build: no file to compare)` : ''}` };
    }
  }

  const checks = [identity, checksum, tablesCheck, columnsCheck];
  return { verdict: combineVerdict(checks), state, checks };
}

/** Capacity: WARN above 80% of the volume, FAIL above 95% (writes and migrations fail on a full volume). */
export function evaluateVolume(dbBytes: number | null, volumeBytes: number | null | undefined): CheckResult {
  if (volumeBytes === undefined || volumeBytes === null) return notRun('volume', 'capacity not assessed: pass --volume-bytes N (the volume size in bytes)', false);
  if (dbBytes === null || !Number.isFinite(dbBytes)) return notRun('volume', '--volume-bytes was given but the database size could not be read');
  const pct = (dbBytes / volumeBytes) * 100;
  const text = `database ${fmtBytes(dbBytes)} of a ${fmtBytes(volumeBytes)} volume = ${pct.toFixed(1)}% (database only: WAL and other databases on the volume are not included)`;
  if (dbBytes * 100 > volumeBytes * 95) return { id: 'volume', status: 'FAIL', gating: true, reason: `${text}; above 95%: writes and migrations fail on a full volume` };
  if (dbBytes * 100 > volumeBytes * 80) return { id: 'volume', status: 'WARN', gating: true, reason: `${text}; above 80%` };
  return { id: 'volume', status: 'PASS', gating: true, reason: text };
}

// ── counts (aggregates only) ─────────────────────────────────────────────

export interface CountsData {
  rows: Record<string, number | null>;
  dailyStats: { oldest: string | null; newest: string | null } | null;
  syncJobs: { oldest: string | null; newest: string | null; newestCompleted: string | null } | null;
  syncStatus: Record<string, number> | null;
  duplicates: Record<string, { groups: number; extra: number } | null>;
  orphans: { rows: number; distinctIds: number } | null;
  iqd: { total: number; nonCanonical: number } | null;
  tokens: { adAccounts: number | null; metaConnections: number | null };
  /** Requested statements that could not be read, with a closed-vocabulary reason. */
  notRead: Array<{ id: string; reason: string }>;
}

export const STALE_DAYS = 7;

export function evaluateCounts(c: CountsData, now: Date): CheckResult[] {
  const out: CheckResult[] = [];
  const keyTables = Object.keys(c.rows).sort();
  const empty = keyTables.filter((t) => c.rows[t] === 0);
  out.push({
    id: 'counts.rows', status: empty.length > 0 ? 'WARN' : 'PASS', gating: false,
    reason: empty.length > 0 ? `${empty.length} of ${keyTables.length} key tables are empty: ${empty.join(', ')}` : `${keyTables.length} key tables, all non-empty`,
    details: keyTables.map((t) => `${t}: ${c.rows[t] === null ? 'not read' : c.rows[t]}`),
  });

  const dsAge = c.dailyStats ? ageDays(c.dailyStats.newest, now) : null;
  const sjAge = c.syncJobs ? ageDays(c.syncJobs.newestCompleted, now) : null;
  const stale: string[] = [];
  if (c.dailyStats) { if (dsAge === null) stale.push('no daily_stats rows'); else if (dsAge > STALE_DAYS) stale.push(`newest daily_stats date ${c.dailyStats.newest} is ${dsAge} days old`); }
  if (c.syncJobs) { if (sjAge === null) stale.push('no COMPLETED sync job'); else if (sjAge > STALE_DAYS) stale.push(`newest COMPLETED sync ${c.syncJobs.newestCompleted} is ${sjAge} days old`); }
  if (c.dailyStats || c.syncJobs) {
    out.push({
      id: 'counts.freshness', status: stale.length > 0 ? 'WARN' : 'PASS', gating: false,
      reason: stale.length > 0 ? `${stale.join('; ')} (threshold ${STALE_DAYS} days)` : `newest daily_stats ${c.dailyStats?.newest ?? '-'} (${dsAge ?? '?'} days ago), newest completed sync ${c.syncJobs?.newestCompleted ?? '-'}`,
      details: [`daily_stats oldest ${c.dailyStats?.oldest ?? '-'} newest ${c.dailyStats?.newest ?? '-'}`, `sync_jobs oldest ${c.syncJobs?.oldest ?? '-'} newest ${c.syncJobs?.newest ?? '-'} newest completed ${c.syncJobs?.newestCompleted ?? '-'}`],
    });
  }

  if (c.syncStatus) {
    const total = Object.values(c.syncStatus).reduce((a, b) => a + b, 0);
    const active = (c.syncStatus['PENDING'] ?? 0) + (c.syncStatus['PROCESSING'] ?? 0);
    out.push({
      id: 'counts.sync_status', status: active > 0 ? 'WARN' : 'PASS', gating: false,
      reason: active > 0
        ? `${active} sync job(s) are PENDING/PROCESSING in the copy: the startup sweep of every role except api flips them to FAILED`
        : `${total} sync job(s): ${Object.entries(c.syncStatus).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`,
      details: Object.entries(c.syncStatus).map(([k, v]) => `${k}: ${v}`),
    });
  }

  const dupKeys = Object.keys(c.duplicates).sort();
  const dups = dupKeys.filter((k) => c.duplicates[k] && c.duplicates[k]!.groups > 0);
  if (dupKeys.length > 0) {
    out.push({
      id: 'counts.duplicates', status: dups.length > 0 ? 'FAIL' : 'PASS', gating: true,
      reason: dups.length > 0
        ? `duplicate rows against a unique key in ${dups.join(', ')} (the unique index is missing or was not restored; upserts depend on it)`
        : `no duplicate rows against the ${dupKeys.length} unique keys checked`,
      details: dupKeys.map((k) => `${k}: ${c.duplicates[k] === null ? 'not read' : `${c.duplicates[k]!.groups} duplicate group(s), ${c.duplicates[k]!.extra} extra row(s)`}`),
    });
  }

  if (c.orphans) {
    out.push({
      id: 'counts.orphans', status: c.orphans.rows > 0 ? 'WARN' : 'PASS', gating: false,
      reason: c.orphans.rows > 0
        ? `${c.orphans.rows} orphaned campaign daily_stats row(s) across ${c.orphans.distinctIds} distinct campaign id(s) (ids are never printed); the scheduled integrity sweep deletes these GLOBALLY, across every tenant, once background work runs`
        : 'no orphaned campaign daily_stats rows',
    });
  }

  if (c.iqd) {
    out.push({
      id: 'counts.iqd', status: c.iqd.nonCanonical > 0 ? 'WARN' : 'PASS', gating: false,
      reason: c.iqd.nonCanonical > 0
        ? `${c.iqd.nonCanonical} of ${c.iqd.total} IQD account(s) store currency_minor_factor <> 1 (size the repair with delivery/core/IQD_REPAIR.md before any sync)`
        : `${c.iqd.total} IQD account(s), none with currency_minor_factor <> 1`,
    });
  }

  if (c.tokens.adAccounts !== null || c.tokens.metaConnections !== null) {
    out.push({
      id: 'counts.tokens', status: 'PASS', gating: false,
      reason: `access tokens present (counted only: never decrypted, never printed): ad_accounts=${c.tokens.adAccounts ?? '?'}, meta_connections=${c.tokens.metaConnections ?? '?'}`,
    });
  }

  if (c.notRead.length > 0) {
    out.push({
      id: 'counts.unread', status: 'NOT_RUN', gating: true,
      reason: `${c.notRead.length} requested count statement(s) could not be read`,
      details: c.notRead.slice(0, LIST_CAP + 2).map((n) => `${safeName(n.id)}: ${safeName(n.reason)}`),
    });
  }
  return out;
}

// ── SQL: every statement the script can send ─────────────────────────────

const TS_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

export const SQL = {
  begin: 'BEGIN READ ONLY',
  setStatementTimeout: `SET LOCAL statement_timeout = '20s'`,
  setLockTimeout: `SET LOCAL lock_timeout = '2s'`,
  rollback: 'ROLLBACK',
  version: 'SHOW server_version',
  dbName: 'SELECT current_database() AS name',
  // The next three are the same catalog queries src/lib/dbHealth.ts runs.
  tables: `SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public'`,
  history: `SELECT migration_name AS name, checksum, (finished_at IS NOT NULL) AS finished, (rolled_back_at IS NOT NULL) AS rolled_back FROM public._prisma_migrations ORDER BY migration_name`,
  columns: `SELECT cl.relname AS t, a.attname AS c FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class cl ON cl.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public' AND cl.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped`,
  historyStats: `SELECT count(*)::bigint AS total, count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::bigint AS rolled_back, to_char(max(finished_at) AT TIME ZONE 'UTC', ${TS_FORMAT}) AS newest_finished FROM public._prisma_migrations`,
  dbSize: 'SELECT pg_database_size(current_database())::bigint AS bytes',
  largestTables: `SELECT cl.relname AS name, pg_total_relation_size(cl.oid)::bigint AS bytes FROM pg_catalog.pg_class cl JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public' AND cl.relkind IN ('r', 'p') ORDER BY 2 DESC, 1 LIMIT 10`,
} as const;

export interface CountQuery {
  id: string;
  sql: string;
  /** [table, ...columns] that must exist before the statement may be sent. Chosen from the catalog read, never interpolated. */
  needs: ReadonlyArray<readonly [string, ...string[]]>;
}

const KEY_TABLES = ['users', 'workspaces', 'workspace_members', 'ad_accounts', 'campaigns', 'daily_stats', 'raw_insights', 'period_insights', 'sync_jobs', 'meta_connections'] as const;

const dupQuery = (t: string, cols: string[]): CountQuery => ({
  id: `dup.${t}`,
  sql: `SELECT count(*)::bigint AS groups, coalesce(sum(n - 1), 0)::bigint AS extra FROM (SELECT count(*) AS n FROM ${t} GROUP BY ${cols.join(', ')} HAVING count(*) > 1) d`,
  needs: [[t, ...cols]],
});

export const COUNT_QUERIES: ReadonlyArray<CountQuery> = [
  ...KEY_TABLES.map((t): CountQuery => ({ id: `rows.${t}`, sql: `SELECT count(*)::bigint AS n FROM ${t}`, needs: [[t]] })),
  { id: 'range.daily_stats', sql: 'SELECT min(date)::text AS oldest, max(date)::text AS newest FROM daily_stats', needs: [['daily_stats', 'date']] },
  {
    id: 'range.sync_jobs',
    sql: `SELECT to_char(min(created_at), ${TS_FORMAT}) AS oldest, to_char(max(created_at), ${TS_FORMAT}) AS newest, to_char(max(completed_at) FILTER (WHERE status = 'COMPLETED'), ${TS_FORMAT}) AS newest_completed FROM sync_jobs`,
    needs: [['sync_jobs', 'created_at', 'completed_at', 'status']],
  },
  { id: 'status.sync_jobs', sql: 'SELECT status::text AS status, count(*)::bigint AS n FROM sync_jobs GROUP BY status ORDER BY status::text', needs: [['sync_jobs', 'status']] },
  dupQuery('ad_accounts', ['platform', 'external_account_id']),
  dupQuery('campaigns', ['ad_account_id', 'external_campaign_id']),
  dupQuery('daily_stats', ['entity_type', 'entity_id', 'date']),
  dupQuery('period_insights', ['entity_type', 'entity_id', 'since', 'until']),
  dupQuery('workspace_members', ['workspace_id', 'user_id']),
  dupQuery('meta_connections', ['workspace_id', 'business_id']),
  {
    id: 'orphans.daily_stats',
    sql: `SELECT count(*)::bigint AS row_count, count(DISTINCT ds.entity_id)::bigint AS distinct_ids FROM daily_stats ds WHERE ds.entity_type = 'CAMPAIGN' AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = ds.entity_id)`,
    needs: [['daily_stats', 'entity_type', 'entity_id'], ['campaigns', 'id']],
  },
  {
    id: 'iqd.ad_accounts',
    sql: `SELECT count(*) FILTER (WHERE currency = 'IQD')::bigint AS iqd_total, count(*) FILTER (WHERE currency = 'IQD' AND currency_minor_factor <> 1)::bigint AS iqd_noncanonical FROM ad_accounts`,
    needs: [['ad_accounts', 'currency', 'currency_minor_factor']],
  },
  { id: 'tokens.ad_accounts', sql: 'SELECT count(*) FILTER (WHERE access_token_encrypted IS NOT NULL)::bigint AS n FROM ad_accounts', needs: [['ad_accounts', 'access_token_encrypted']] },
  { id: 'tokens.meta_connections', sql: 'SELECT count(*) FILTER (WHERE access_token_encrypted IS NOT NULL)::bigint AS n FROM meta_connections', needs: [['meta_connections', 'access_token_encrypted']] },
];

// ── the statement allowlist (second layer; the first is BEGIN READ ONLY) ──

const SET_LOCAL_RE = /^SET LOCAL (statement_timeout|lock_timeout) = '[0-9]{1,6}(ms|s)'$/i;
const FORBIDDEN_WORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|COPY|GRANT|REVOKE|INTO|CALL|DO|EXECUTE|PREPARE|DEALLOCATE|VACUUM|ANALYZE|REINDEX|CLUSTER|REFRESH|LOCK|COMMENT|MERGE|IMPORT|LISTEN|NOTIFY|UNLISTEN|DISCARD|RESET|SET|BEGIN|START|COMMIT|END|ABORT|ROLLBACK|SAVEPOINT|RELEASE|DECLARE|FETCH|MOVE|SECURITY|EXPLAIN|OWNER)\b/i;
const FORBIDDEN_LOCKING = /\bFOR\s+(SHARE|NO|KEY)\b/i;
const FORBIDDEN_FUNCTIONS = /\b(set_config|nextval|setval|pg_advisory\w*|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_switch_wal|pg_create_\w+|pg_drop_\w+|lo_\w+|dblink\w*|pg_read_\w+|pg_ls_\w+|pg_sleep\w*|pg_notify|txid_\w+)\b/i;

/**
 * Throws unless `sql` is exactly one statement from the read-only set. The message never echoes the
 * statement (it could carry a value). Defence in depth: Postgres itself refuses writes inside BEGIN READ ONLY.
 */
export function assertReadOnlySql(sql: string): void {
  const refuse = (why: string): never => { throw new Error(`read-only guard: statement refused (${why})`); };
  if (typeof sql !== 'string') return refuse('not a string');
  const s = sql.trim();
  if (s.length === 0) return refuse('empty');
  if (/[;\\$]/.test(s)) return refuse('forbidden character');
  if (s.includes('--') || s.includes('/*')) return refuse('comment');
  const norm = s.replace(/\s+/g, ' ').toUpperCase();
  if (norm === 'BEGIN READ ONLY' || norm === 'ROLLBACK') return;
  if (SET_LOCAL_RE.test(s.replace(/\s+/g, ' '))) return;
  if (!/^(SELECT|SHOW|WITH)\b/i.test(s)) return refuse('statement type not allowed');
  const quotes = (s.match(/'/g) ?? []).length;
  if (quotes % 2 !== 0) return refuse('unbalanced quote');
  const stripped = s.replace(/'(?:[^']|'')*'/g, "''");
  if (FORBIDDEN_WORDS.test(stripped) || FORBIDDEN_LOCKING.test(stripped)) return refuse('writing or locking keyword');
  if (FORBIDDEN_FUNCTIONS.test(stripped)) return refuse('writing or locking function');
}

// ── arguments ────────────────────────────────────────────────────────────

export type ParsedArgs =
  | { ok: true; json: boolean; counts: boolean; volumeBytes: number | undefined; acknowledged: boolean; help: boolean }
  | { ok: false; error: string };

export function parseArgs(argv: string[]): ParsedArgs {
  let json = false; let counts = false; let acknowledged = false; let help = false;
  let volumeBytes: number | undefined;
  const parseVolume = (raw: string | undefined): string | null => {
    if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) return '--volume-bytes needs a positive integer number of bytes';
    const n = Number(raw);
    if (!Number.isSafeInteger(n)) return '--volume-bytes is too large';
    volumeBytes = n;
    return null;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') json = true;
    else if (a === '--counts') counts = true;
    else if (a === '--i-understand-this-reads-a-real-database') acknowledged = true;
    else if (a === '--help' || a === '-h') help = true;
    else if (a === '--volume-bytes') { const e = parseVolume(argv[++i]); if (e) return { ok: false, error: e }; }
    else if (a.startsWith('--volume-bytes=')) { const e = parseVolume(a.slice('--volume-bytes='.length)); if (e) return { ok: false, error: e }; }
    else return { ok: false, error: `unknown argument ${JSON.stringify(a.slice(0, 40))}` };
  }
  return { ok: true, json, counts, volumeBytes, acknowledged, help };
}

const USAGE = `Usage: DATABASE_URL=postgresql://... npx tsx scripts/ops/preflight-schema.ts [options]

  --json                                         machine-readable output
  --counts                                       also print aggregate row counts (never ids, never customer values)
  --volume-bytes N                               volume size in bytes: WARN above 80%, FAIL above 95%
  --i-understand-this-reads-a-real-database      required when DATABASE_URL is not loopback
  --help

Read-only: one BEGIN READ ONLY transaction, ended with ROLLBACK. Exit 0 = GO, 1 = NO-GO, 2 = NOT RUN.`;

// ── I/O seams ────────────────────────────────────────────────────────────

export interface Queryable { query(text: string): Promise<{ rows: Array<Record<string, unknown>> }> }
export interface DbConn extends Queryable { end(): Promise<void> }
export interface ConnectConfig { host: string; port: number; user: string; password: string; database: string; ssl: unknown }
export interface BuildInfo {
  names: string[] | null;
  fileHashes: Record<string, FileHash> | null;
  requiredTables: string[] | null;
  requiredColumns: ReadonlyMap<string, string[]> | null;
}
export interface Deps { connect: (cfg: ConnectConfig) => Promise<DbConn>; readBuild: () => BuildInfo }
export interface Io { out: (s: string) => void; err: (s: string) => void; now?: () => Date }

/** What THIS checkout ships. The names and required tables/columns are dbHealth's own functions, so the preflight and the gate cannot disagree. */
export function readBuildFromCheckout(): BuildInfo {
  const names = shippedMigrationNames();
  let fileHashes: Record<string, FileHash> | null = null;
  if (names && names.length > 0) {
    for (const dir of migrationDirCandidates()) {
      try {
        if (!names.every((n) => existsSync(path.join(dir, n, 'migration.sql')))) continue;
        const h: Record<string, FileHash> = {};
        for (const n of names) h[n] = sha256Variants(readFileSync(path.join(dir, n, 'migration.sql')));
        fileHashes = h;
        break;
      } catch { /* next candidate */ }
    }
  }
  return { names, fileHashes, requiredTables: requiredTableNames(), requiredColumns: requiredColumnNames() };
}

async function defaultConnect(cfg: ConnectConfig): Promise<DbConn> {
  const pg = (await import('pg')).default;
  const client = new pg.Client({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database,
    ssl: cfg.ssl as never, connectionTimeoutMillis: 5_000, query_timeout: 30_000, application_name: 'adlytic-preflight-schema',
  });
  client.on('error', () => { /* a lost connection surfaces on the next query; never print the driver text */ });
  await client.connect();
  return {
    query: (text: string) => client.query(text) as unknown as Promise<{ rows: Array<Record<string, unknown>> }>,
    end: () => client.end(),
  };
}

// ── error vocabulary: nothing from a driver message ever reaches the operator ──

const SQLSTATE_REASON: Record<string, string> = {
  '57014': 'statement_timeout', '55P03': 'lock_timeout', '42501': 'permission_denied', '42P01': 'undefined_table',
  '42703': 'undefined_column', '25006': 'read_only_violation', '25P02': 'transaction_aborted',
  '57P01': 'connection_lost', '57P02': 'connection_lost', '57P03': 'connection_lost',
};
function queryErrorReason(err: unknown): string {
  if (err instanceof Error && err.message.startsWith('read-only guard:')) return 'guard_refused';
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    if (Object.prototype.hasOwnProperty.call(SQLSTATE_REASON, code)) return SQLSTATE_REASON[code]!;
    if (/^08[0-9A-Z]{3}$/.test(code) || code === 'ECONNRESET' || code === 'EPIPE') return 'connection_lost';
    if (/^[0-9A-Z]{5}$/.test(code)) return `sqlstate_${code}`;
  }
  const msg = err instanceof Error ? err.message : '';
  if (/Connection terminated|Client has encountered a connection error|query read timeout/i.test(msg)) return 'connection_lost';
  return 'error';
}
function connectErrorText(err: unknown): string {
  const reason = classifyDbError(err);
  const code = (err as { code?: unknown } | null)?.code;
  const shown = typeof code === 'string' && /^([A-Z][A-Z0-9_]{2,15}|[0-9A-Z]{5})$/.test(code) ? code : '-';
  return `reason=${reason} code=${shown}`;
}

// ── collection ───────────────────────────────────────────────────────────

interface Collected {
  server: string;
  database: string;
  tables: Set<string> | null;
  history: HistoryRow[] | null | undefined;      // null = the table does not exist; undefined = not read
  historyStats: { total: number; rolledBack: number; newestFinished: string | null } | null;
  columns: Map<string, Set<string>> | null;
  dbBytes: number | null;
  largest: Array<{ name: string; bytes: number }> | null;
  counts: CountsData | null;
  schemaError: string | null;
  sizeError: string | null;
  connectionLost: boolean;
}

function toInt(v: unknown): number | null {
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const tsOrNull = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) ? v : null);

function emptyCounts(): CountsData {
  return { rows: {}, dailyStats: null, syncJobs: null, syncStatus: null, duplicates: {}, orphans: null, iqd: null, tokens: { adAccounts: null, metaConnections: null }, notRead: [] };
}

function parseCount(c: CountsData, q: CountQuery, rows: Array<Record<string, unknown>>): void {
  const r = rows[0] ?? {};
  const [kind, name] = q.id.split('.') as [string, string];
  switch (kind) {
    case 'rows': c.rows[name] = toInt(r['n']); break;
    case 'range':
      if (name === 'daily_stats') c.dailyStats = { oldest: dateOrNull(r['oldest']), newest: dateOrNull(r['newest']) };
      else c.syncJobs = { oldest: tsOrNull(r['oldest']), newest: tsOrNull(r['newest']), newestCompleted: tsOrNull(r['newest_completed']) };
      break;
    case 'status': {
      const m: Record<string, number> = {};
      for (const row of rows) { const k = String(row['status'] ?? '').replace(/[^A-Z_]/g, '?').slice(0, 20); const n = toInt(row['n']); if (n !== null) m[k] = n; }
      c.syncStatus = m;
      break;
    }
    case 'dup': { const g = toInt(r['groups']); const e = toInt(r['extra']); c.duplicates[name] = g === null || e === null ? null : { groups: g, extra: e }; break; }
    case 'orphans': { const a = toInt(r['row_count']); const b = toInt(r['distinct_ids']); c.orphans = a === null || b === null ? null : { rows: a, distinctIds: b }; break; }
    case 'iqd': { const a = toInt(r['iqd_total']); const b = toInt(r['iqd_noncanonical']); c.iqd = a === null || b === null ? null : { total: a, nonCanonical: b }; break; }
    case 'tokens': if (name === 'ad_accounts') c.tokens.adAccounts = toInt(r['n']); else c.tokens.metaConnections = toInt(r['n']); break;
  }
}

/** Runs every read inside ONE read-only transaction and always ends with ROLLBACK. */
async function collect(conn: DbConn, wantCounts: boolean): Promise<Collected> {
  const send = async (text: string): Promise<Array<Record<string, unknown>>> => {
    assertReadOnlySql(text);
    return (await conn.query(text)).rows;
  };
  const out: Collected = {
    server: '?', database: '', tables: null, history: undefined, historyStats: null, columns: null, dbBytes: null, largest: null,
    counts: wantCounts ? emptyCounts() : null, schemaError: null, sizeError: null, connectionLost: false,
  };
  await send(SQL.begin);
  try {
    await send(SQL.setStatementTimeout);
    await send(SQL.setLockTimeout);

    const v = await send(SQL.version);
    out.server = /^\d+(\.\d+)?/.exec(String((v[0] ?? {})['server_version'] ?? ''))?.[0] ?? '?';
    out.database = String(((await send(SQL.dbName))[0] ?? {})['name'] ?? '');

    // After the first failing statement the transaction is dead: everything later is reported as not read.
    let aborted: string | null = null;
    const step = async <T>(fn: () => Promise<T>, onError: (reason: string) => void): Promise<T | undefined> => {
      if (aborted) { onError('transaction_aborted'); return undefined; }
      try { return await fn(); } catch (e) { aborted = queryErrorReason(e); if (aborted === 'connection_lost') out.connectionLost = true; onError(aborted); return undefined; }
    };
    const schemaFail = (r: string) => { out.schemaError = out.schemaError ?? r; };

    const tableRows = await step(() => send(SQL.tables), schemaFail);
    if (tableRows) out.tables = new Set(tableRows.map((r) => String(r['name'])));
    if (out.tables?.has('_prisma_migrations')) {
      const h = await step(() => send(SQL.history), schemaFail);
      if (h) out.history = h.map((r) => ({ name: String(r['name']), checksum: typeof r['checksum'] === 'string' ? (r['checksum'] as string) : null, finished: r['finished'] === true, rolledBack: r['rolled_back'] === true }));
      const hs = await step(() => send(SQL.historyStats), () => { /* informational */ });
      if (hs && hs[0]) out.historyStats = { total: toInt(hs[0]['total']) ?? 0, rolledBack: toInt(hs[0]['rolled_back']) ?? 0, newestFinished: tsOrNull(hs[0]['newest_finished']) };
    } else if (out.tables) {
      out.history = null;
    }
    const colRows = await step(() => send(SQL.columns), schemaFail);
    if (colRows) {
      out.columns = new Map();
      for (const r of colRows) { const t = String(r['t']); const s = out.columns.get(t) ?? new Set<string>(); s.add(String(r['c'])); out.columns.set(t, s); }
    }

    const size = await step(() => send(SQL.dbSize), (r) => { out.sizeError = r; });
    if (size) out.dbBytes = toInt((size[0] ?? {})['bytes']);
    if (wantCounts && out.counts) {
      const c = out.counts;
      for (const q of COUNT_QUERIES) {
        const unreadable = (reason: string) => { c.notRead.push({ id: q.id, reason }); if (q.id.startsWith('rows.')) c.rows[q.id.slice(5)] = null; };
        const satisfied = !!out.tables && !!out.columns && q.needs.every(([t, ...cols]) => out.tables!.has(t) && cols.every((col) => out.columns!.get(t)?.has(col)));
        if (!satisfied) { unreadable(out.tables && out.columns ? 'table_or_column_absent' : 'catalog_unreadable'); continue; }
        const rows = await step(() => send(q.sql), unreadable);
        if (rows) parseCount(c, q, rows);
      }
    }

    // Last on purpose: pg_total_relation_size takes an ACCESS SHARE lock on every table, so behind any ACCESS EXCLUSIVE
    // lock it waits for lock_timeout and kills the transaction. It is informational; nothing may depend on it running.
    const big = await step(() => send(SQL.largestTables), () => { /* informational */ });
    if (big) out.largest = big.map((r) => ({ name: safeName(r['name']), bytes: toInt(r['bytes']) ?? 0 }));
  } finally {
    try { await send(SQL.rollback); } catch { /* the transaction dies with the connection */ }
  }
  return out;
}

// ── the report ───────────────────────────────────────────────────────────

interface Report {
  verdict: Verdict;
  state: ReadinessState;
  checks: CheckResult[];
  target: { database: string; server: string; loopback: boolean };
  largestTables: Array<{ name: string; bytes: number }>;
  counts: CountsData | null;
}

function buildReport(col: Collected, build: BuildInfo, args: { counts: boolean; volumeBytes: number | undefined }, loopback: boolean, now: Date): Report {
  const checks: CheckResult[] = [];
  checks.push({ id: 'connect', status: 'PASS', gating: true, reason: `connected, PostgreSQL ${col.server}, database ${redactDatabaseName(col.database)}, ${loopback ? 'loopback target' : 'NON-LOOPBACK target (operator acknowledged)'}` });

  let state: ReadinessState = 'unknown';
  if (col.schemaError || !col.tables) {
    const why = `the catalog could not be read (${col.schemaError ?? 'unknown'})`;
    for (const id of ['identities', 'checksums', 'tables', 'columns']) checks.push(notRun(id, why));
  } else {
    const d = decideVerdict({
      shipped: build.names, fileHashes: build.fileHashes, history: col.history === undefined ? null : col.history,
      requiredTables: build.requiredTables, requiredColumns: build.requiredColumns, presentTables: col.tables, presentColumns: col.columns,
    });
    state = d.state;
    checks.push(...d.checks);
  }

  if (col.historyStats) {
    checks.push({ id: 'restore_point', status: 'PASS', gating: false, reason: `${col.historyStats.total} _prisma_migrations row(s) (${col.historyStats.rolledBack} rolled back), newest finished ${col.historyStats.newestFinished ?? 'none'}` });
  } else {
    checks.push({ id: 'restore_point', status: 'WARN', gating: false, reason: 'no _prisma_migrations history was read' });
  }
  if (col.dbBytes !== null) {
    checks.push({
      id: 'size', status: 'PASS', gating: false, reason: `database size ${fmtBytes(col.dbBytes)} (pg_database_size)`,
      details: (col.largest ?? []).map((t) => `${t.name}: ${fmtBytes(t.bytes)}`),
    });
  } else {
    checks.push(notRun('size', `database size could not be read (${col.sizeError ?? 'unknown'})`, false));
  }
  checks.push(evaluateVolume(col.dbBytes, args.volumeBytes));

  if (args.counts && col.counts) checks.push(...evaluateCounts(col.counts, now));
  else checks.push(notRun('counts', 'not requested (pass --counts for aggregate row counts)', false));

  return { verdict: combineVerdict(checks), state, checks, target: { database: redactDatabaseName(col.database), server: col.server, loopback }, largestTables: col.largest ?? [], counts: col.counts };
}

function formatHuman(r: Report): string[] {
  const lines: string[] = ['Adlytic schema preflight (read-only: BEGIN READ ONLY ... ROLLBACK)'];
  for (const c of r.checks) {
    lines.push(`[${c.status}] ${c.id}: ${c.reason}`);
    for (const d of c.details ?? []) lines.push(`        ${d}`);
  }
  lines.push(`health-gate state for this database (identities + tables + columns): ${r.state}`);
  lines.push(`VERDICT: ${r.verdict} (exit ${r.verdict === 'GO' ? 0 : 1})`);
  return lines;
}

// ── main ─────────────────────────────────────────────────────────────────

export async function main(argv: string[], env: Record<string, string | undefined>, io: Io, deps: Partial<Deps> = {}): Promise<number> {
  const args = parseArgs(argv);
  if (!args.ok) { io.err(`NOT RUN: ${args.error}\n${USAGE}`); return 2; }
  if (args.help) { io.out(USAGE); return 0; }

  // Last-resort net: every emitted string is scrubbed of the connection's own values. The primary defence is that
  // none of them is ever put into a message (driver text is never printed; the database name is redacted).
  const scrub: Array<[string, number]> = [];
  const emit = (stream: 'out' | 'err', text: string): void => {
    let t = text;
    for (const [s, min] of [...scrub].sort((a, b) => b[0].length - a[0].length)) if (s.length >= min) t = t.split(s).join('[redacted]');
    io[stream](t);
  };
  const notRunExit = (reason: string): number => {
    if (args.json) emit('out', JSON.stringify({ verdict: 'NOT_RUN', reason }));
    else emit('err', `NOT RUN: ${reason}`);
    return 2;
  };

  const raw = env['DATABASE_URL'];
  if (!raw) return notRunExit('DATABASE_URL is not set');
  let url: URL;
  try { url = new URL(raw); } catch { return notRunExit('DATABASE_URL is not a valid URL (value not shown)'); }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return notRunExit('DATABASE_URL must be a postgresql:// URL');

  const dec = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const cfg: ConnectConfig = {
    host, port: Number(url.port) || 5432, user: dec(url.username), password: dec(url.password),
    database: dec(url.pathname.replace(/^\//, '')), ssl: false,
  };
  const loopback = isLoopbackHost(host);
  scrub.push([raw, 4], [cfg.password, 4], [url.password, 4], [cfg.user, 6], [cfg.database, 6]);
  if (!loopback) scrub.push([host, 4], [`${host}:${cfg.port}`, 4]);

  if (!loopback && !args.acknowledged) {
    return notRunExit('DATABASE_URL is not a loopback address. This tool only READS (BEGIN READ ONLY ... ROLLBACK), but it will not touch a real database unless you pass --i-understand-this-reads-a-real-database');
  }
  cfg.ssl = loopback ? false : pgSslFor(host);

  const build = (deps.readBuild ?? readBuildFromCheckout)();
  const connect = deps.connect ?? defaultConnect;
  const now = (io.now ?? (() => new Date()))();

  let conn: DbConn;
  try { conn = await connect(cfg); } catch (e) { return notRunExit(`cannot connect (${connectErrorText(e)})`); }

  let collected: Collected;
  try {
    collected = await collect(conn, args.counts);
  } catch (e) {
    try { await conn.end(); } catch { /* ignore */ }
    return notRunExit(`the read-only session failed before the first check (${queryErrorReason(e)})`);
  }
  try { await conn.end(); } catch { /* ignore */ }
  if (collected.connectionLost) return notRunExit('the connection was lost during the run (no verdict)');

  const report = buildReport(collected, build, { counts: args.counts, volumeBytes: args.volumeBytes }, loopback, now);
  if (args.json) {
    emit('out', JSON.stringify({ verdict: report.verdict, exitCode: report.verdict === 'GO' ? 0 : 1, state: report.state, target: report.target, checks: report.checks, largestTables: report.largestTables, counts: report.counts }, null, 2));
  } else {
    for (const line of formatHuman(report)) emit('out', line);
  }
  return report.verdict === 'GO' ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2), process.env, { out: (s) => console.log(s), err: (s) => console.error(s) })
    .then((code) => process.exit(code), () => { console.error('NOT RUN: unexpected internal error (details withheld: they may contain connection data)'); process.exit(2); });
}
