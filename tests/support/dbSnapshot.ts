// ═════════════════════════════════════════════════════════════════════════
//  tests/support/dbSnapshot.ts — "did anything, anywhere, change?" for a
//  SYNTHETIC local Postgres. Shared by the *_postgres.ts tests that must prove
//  a refused request wrote nothing.
//
//  A snapshot is, for EVERY base table of the public schema (discovered from
//  the catalog, so a table added tomorrow is covered without editing a test):
//     row identity (primary key, or ctid when a table has none)  ->  xmin
//  xmin is the id of the transaction that wrote the row VERSION. It changes on
//  any UPDATE (even one that sets a column to its current value) and on any
//  re-insert, so "no row got a new version" is provable at the storage level.
//  pg_stat counters are deliberately NOT used: they are flushed lazily and
//  lag behind the statements that produced them.
//
//  Not covered, on purpose: sequences (cuid ids use none), pg_catalog, and the
//  _prisma_migrations bookkeeping table.
// ═════════════════════════════════════════════════════════════════════════

import type { Pool } from 'pg';

export type Snapshot = Map<string, Map<string, string>>;

interface TableInfo { name: string; pk: string[] }

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

export async function listTables(pool: Pool): Promise<TableInfo[]> {
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );
  const pks = await pool.query<{ table_name: string; column_name: string; ordinal_position: number }>(
    `SELECT kcu.table_name, kcu.column_name, kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.table_name, kcu.ordinal_position`,
  );
  const pkOf = new Map<string, string[]>();
  for (const r of pks.rows) pkOf.set(r.table_name, [...(pkOf.get(r.table_name) ?? []), r.column_name]);
  return tables.rows.map((t) => ({ name: t.table_name, pk: pkOf.get(t.table_name) ?? [] }));
}

/**
 * `where` (optional) restricts every table to rows whose whole-row text contains
 * one of the given substrings — used to snapshot "everything that mentions this
 * tenant's ids", in any column of any table.
 */
export async function snapshotAll(pool: Pool, tables?: TableInfo[], mentioning?: string[]): Promise<Snapshot> {
  const list = tables ?? await listTables(pool);
  const out: Snapshot = new Map();
  const patterns = mentioning?.map((s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`);
  for (const t of list) {
    const key = t.pk.length ? `concat_ws('|', ${t.pk.map((c) => `${q(c)}::text`).join(', ')})` : 'ctid::text';
    const where = patterns ? ` WHERE ${q(t.name)}::text LIKE ANY ($1::text[])` : '';
    const res = await pool.query<{ k: string; x: string }>(
      `SELECT ${key} AS k, xmin::text AS x FROM ${q(t.name)}${where}`,
      patterns ? [patterns] : [],
    );
    out.set(t.name, new Map(res.rows.map((r) => [r.k, r.x])));
  }
  return out;
}

/** Human-readable list of every difference ("table:key added|removed|rewritten"). Empty = identical. */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  for (const [table, rowsAfter] of after) {
    const rowsBefore = before.get(table) ?? new Map<string, string>();
    for (const [k, x] of rowsAfter) {
      if (!rowsBefore.has(k)) out.push(`${table}:${k} added`);
      else if (rowsBefore.get(k) !== x) out.push(`${table}:${k} rewritten`);
    }
    for (const k of rowsBefore.keys()) if (!rowsAfter.has(k)) out.push(`${table}:${k} removed`);
  }
  for (const table of before.keys()) if (!after.has(table)) out.push(`${table} dropped`);
  return out.sort();
}

export function totalRows(s: Snapshot): number {
  let n = 0;
  for (const rows of s.values()) n += rows.size;
  return n;
}

/** Distinct table names that appear in a diff. */
export function tablesIn(diff: string[]): string[] {
  return [...new Set(diff.map((d) => d.split(':')[0]!))].sort();
}
