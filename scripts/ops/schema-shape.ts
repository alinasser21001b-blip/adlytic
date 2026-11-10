// ════════════════════════════════════════════════════════════════════════
//  scripts/ops/schema-shape.ts — "is the database's SHAPE the one this checkout's migrations create?"
//
//  WHY. The identity / table / column checks of preflight-schema.ts (and /api/health) only ask whether names exist.
//  Observed on Postgres 16 (adversarial review), every one of these printed GO:
//    · a column's type changed (bigint → integer / text / numeric, timestamp → timestamptz, date → timestamp)
//    · NOT NULL dropped, a column DEFAULT dropped
//    · an enum value dropped or renamed, an enum type dropped (the column left as text)
//    · a UNIQUE or PRIMARY KEY index dropped, replaced by a non-unique or a partial one
//    · a FOREIGN KEY dropped (ON DELETE CASCADE is what removes a tenant's rows)
//  `prisma migrate deploy` is no help (it never compares anything but names), and the Prisma client's own metadata
//  (Prisma.dmmf) carries only names, so the expected shape has to come from the migrations themselves:
//
//    scripts/ops/expected-schema.json   what `prisma migrate deploy` of THIS checkout produces on an empty Postgres,
//                                       written by scripts/ops/schema-snapshot.ts and re-derived from a real fresh
//                                       migration by test_preflight_schema_pg.ts (a stale file fails that test).
//
//  The file records the migration names it was generated for. A checkout whose shipped list differs makes the check
//  NOT_RUN (gating): fail closed, never "compared against the wrong schema". test_preflight_schema.ts (no database)
//  fails the build when a migration is added without regenerating the file.
//
//  WHAT COUNTS (signatures are strings built by the catalog queries below, so nothing is parsed from SQL text):
//    column    "<format_type>[ NOT NULL][ DEFAULT]"      type differs → FAIL; NOT NULL where the model is optional → FAIL;
//                                                        default dropped → FAIL; nullable where NOT NULL expected → WARN
//    enum      labels, in order                          type absent or a label absent → FAIL (extra labels are fine)
//    index     "PRIMARY|UNIQUE|INDEX [USING m] cols [WHERE] [OPTS ..]"
//                                                        PRIMARY / UNIQUE absent → FAIL; a plain INDEX absent → WARN
//                                                        (performance only; a UNIQUE index with the same columns satisfies it)
//    foreign key "cols -> table(cols) ON DELETE a ON UPDATE b"   absent or with other actions → FAIL
//  Extra tables, columns, indexes, enum labels and foreign keys are IGNORED (a newer database is not a broken one),
//  index and constraint NAMES are ignored (a definition under another name is the same index), column ORDER is ignored.
//  Only schema public is read; the run sets search_path = pg_catalog, public so type names print the same everywhere.
// ════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckResult } from './preflight-schema';

// ── the catalog statements (constants; every one is SELECT-only and passes assertReadOnlySql) ──

const ACTIONS = `array['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']`;
const ACTION_CODES = `array['a', 'r', 'c', 'n', 'd']`;

// LOCKS: every statement here reads only pg_catalog tables. pg_get_indexdef() was tried first and opens the index, which
// queues behind an ACCESS EXCLUSIVE lock on its table (found by test_preflight_schema_pg.ts section 8: lock_timeout killed the
// transaction before the counts); the column names of an index come from pg_attribute and pg_index.indkey instead.
export const SHAPE_SQL = {
  columns: `SELECT cl.relname AS t, a.attname AS c, pg_catalog.format_type(a.atttypid, a.atttypmod) || (array['', ' NOT NULL'])[1 + a.attnotnull::int] || (array['', ' DEFAULT'])[1 + a.atthasdef::int] AS sig FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class cl ON cl.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public' AND cl.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY 1, 2`,
  enums: `SELECT t.typname AS name, e.enumlabel AS label FROM pg_catalog.pg_type t JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' ORDER BY 1, e.enumsortorder`,
  indexes: `SELECT cl.relname AS t, concat_ws(' ', (array['INDEX', 'UNIQUE', 'PRIMARY'])[1 + i.indisunique::int + i.indisprimary::int], nullif('USING ' || am.amname, 'USING btree'), (SELECT string_agg(coalesce((SELECT a.attname::text FROM pg_catalog.pg_attribute a WHERE a.attrelid = i.indrelid AND a.attnum = i.indkey[k.n]), '(expression)'), ',' ORDER BY k.n) FROM generate_series(0, i.indnkeyatts - 1) AS k(n)), nullif((array['', 'WHERE'])[1 + (i.indpred IS NOT NULL)::int], ''), nullif('OPTS ' || i.indoption::text, 'OPTS ' || repeat('0 ', i.indnkeyatts - 1) || '0')) AS sig FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class cl ON cl.oid = i.indrelid JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid JOIN pg_catalog.pg_am am ON am.oid = ic.relam JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public' AND cl.relkind IN ('r', 'p') AND i.indisvalid ORDER BY 1, 2`,
  foreignKeys: `SELECT cl.relname AS t, (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) || ' -> ' || rcl.relname || '(' || (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord) JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) || ') ON DELETE ' || (${ACTIONS})[array_position(${ACTION_CODES}, c.confdeltype::text)] || ' ON UPDATE ' || (${ACTIONS})[array_position(${ACTION_CODES}, c.confupdtype::text)] AS sig FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid JOIN pg_catalog.pg_class rcl ON rcl.oid = c.confrelid JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace WHERE c.contype = 'f' AND n.nspname = 'public' ORDER BY 1, 2`,
} as const;

// ── the data ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export interface ShapeRows { columns: Row[]; enums: Row[]; indexes: Row[]; foreignKeys: Row[] }

export interface Shape {
  /** table → column → signature */
  columns: Record<string, Record<string, string>>;
  /** enum type → labels in sort order */
  enums: Record<string, string[]>;
  /** table → signatures (sorted) */
  indexes: Record<string, string[]>;
  /** table → signatures (sorted) */
  foreignKeys: Record<string, string[]>;
}

export interface ExpectedShape extends Shape {
  version: 1;
  /** The migration names the snapshot was generated for (sorted). Must equal what the checkout ships. */
  migrations: string[];
  /** Informational: the server that produced it. Never compared. */
  generatedWith: string;
}

export const EXPECTED_SHAPE_FILE = path.resolve(__dirname, 'expected-schema.json');
export const REGENERATE_HINT = 'regenerate it: create an EMPTY local database, run `prisma migrate deploy` against it, then `DATABASE_URL=<that loopback url> npx tsx scripts/ops/schema-snapshot.ts --write`';

// ── rows → shape (pure) ──────────────────────────────────────────────────

export function shapeFromRows(rows: ShapeRows, onlyTables?: ReadonlySet<string> | null): Shape {
  const keep = (t: string) => !onlyTables || onlyTables.has(t);
  const shape: Shape = { columns: {}, enums: {}, indexes: {}, foreignKeys: {} };
  for (const r of rows.columns) {
    const t = String(r['t']); if (!keep(t)) continue;
    (shape.columns[t] ??= {})[String(r['c'])] = String(r['sig']);
  }
  for (const r of rows.enums) (shape.enums[String(r['name'])] ??= []).push(String(r['label']));
  for (const [key, src] of [['indexes', rows.indexes], ['foreignKeys', rows.foreignKeys]] as const) {
    for (const r of src) { const t = String(r['t']); if (!keep(t)) continue; (shape[key][t] ??= []).push(String(r['sig'])); }
    for (const t of Object.keys(shape[key])) shape[key][t]!.sort();
  }
  return shape;
}

function sortedObject<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]!]));
}

export function buildExpectedShape(shape: Shape, migrations: string[], generatedWith: string): ExpectedShape {
  return {
    version: 1,
    generatedWith,
    migrations: [...migrations].sort(),
    enums: sortedObject(shape.enums),
    columns: Object.fromEntries(Object.keys(shape.columns).sort().map((t) => [t, sortedObject(shape.columns[t]!)])),
    indexes: sortedObject(shape.indexes),
    foreignKeys: sortedObject(shape.foreignKeys),
  };
}

/** One entry per line: a schema change shows up as a small diff. */
export function formatExpectedShape(e: ExpectedShape): string {
  return `${JSON.stringify(e, null, 1)}\n`;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isStringMap = (v: unknown): v is Record<string, string> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every((x) => typeof x === 'string');

/** Structure check of a parsed snapshot. null when it is not a usable ExpectedShape. */
export function parseExpectedShape(raw: unknown): ExpectedShape | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o['version'] !== 1 || !isStringArray(o['migrations']) || (o['migrations'] as string[]).length === 0) return null;
  const grouped = (v: unknown, leaf: (x: unknown) => boolean): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(leaf);
  if (!grouped(o['columns'], isStringMap) || !grouped(o['enums'], isStringArray) || !grouped(o['indexes'], isStringArray) || !grouped(o['foreignKeys'], isStringArray)) return null;
  if (Object.keys(o['columns'] as object).length === 0) return null;
  // Same key order as buildExpectedShape, so format(parse(file)) is the file.
  return { version: 1, generatedWith: typeof o['generatedWith'] === 'string' ? o['generatedWith'] : '?', migrations: o['migrations'] as string[], enums: o['enums'] as ExpectedShape['enums'], columns: o['columns'] as ExpectedShape['columns'], indexes: o['indexes'] as ExpectedShape['indexes'], foreignKeys: o['foreignKeys'] as ExpectedShape['foreignKeys'] };
}

/** The committed snapshot. null when it is missing or malformed (the check then fails closed). */
export function loadExpectedShape(file: string = EXPECTED_SHAPE_FILE): ExpectedShape | null {
  try {
    if (!existsSync(file)) return null;
    return parseExpectedShape(JSON.parse(readFileSync(file, 'utf8')));
  } catch { return null; }
}

// ── the comparison (pure) ────────────────────────────────────────────────

const LIST_CAP = 10;
const TEXT_MAX = 110;
const DETAIL_CAP = 24;

/** Catalog text is data, not trusted: only a closed set of characters survives (no newline, no control character). */
function safeText(v: unknown): string {
  return String(v).replace(/[^A-Za-z0-9_.,()[\]" >-]/g, '?').slice(0, TEXT_MAX);
}

function capped(label: string, items: string[]): string[] {
  const sorted = [...items].sort();
  const shown = sorted.slice(0, LIST_CAP).map((x) => `${label}: ${x}`);
  if (sorted.length > LIST_CAP) shown.push(`${label}: +${sorted.length - LIST_CAP} more`);
  return shown;
}

interface ColumnSig { type: string; notNull: boolean; hasDefault: boolean }
function parseColumnSig(sig: string): ColumnSig {
  const m = /^(.*?)( NOT NULL)?( DEFAULT)?$/.exec(sig);
  return { type: m?.[1] ?? sig, notNull: !!m?.[2], hasDefault: !!m?.[3] };
}
function splitIndexSig(sig: string): { kind: string; rest: string } {
  const i = sig.indexOf(' ');
  return i < 0 ? { kind: sig, rest: '' } : { kind: sig.slice(0, i), rest: sig.slice(i + 1) };
}

export interface ShapeInput {
  expected: ExpectedShape | null;
  /** null = the catalog statements could not be read. */
  actual: Shape | null;
  /** Why `actual` is null (closed vocabulary), for the message. */
  actualError?: string | null;
  shipped: string[] | null;
  presentTables: ReadonlySet<string>;
}

const notRun = (reason: string, details?: string[]): CheckResult => ({ id: 'shape', status: 'NOT_RUN', gating: true, reason, ...(details ? { details } : {}) });

export function compareShape(i: ShapeInput): CheckResult {
  if (!i.expected) return notRun(`the expected-schema snapshot (scripts/ops/expected-schema.json) is missing or unreadable (fail closed); ${REGENERATE_HINT}`);
  if (!i.shipped || i.shipped.length === 0) return notRun('no shipped migration list to compare the snapshot against (fail closed)');
  const want = [...i.shipped].sort(); const have = [...i.expected.migrations].sort();
  if (want.length !== have.length || want.some((n, k) => n !== have[k])) {
    const added = want.filter((n) => !have.includes(n)); const removed = have.filter((n) => !want.includes(n));
    return notRun(`the expected-schema snapshot was generated for ${have.length} migration(s) and this checkout ships ${want.length}: it describes a different schema (fail closed); ${REGENERATE_HINT}`, [...capped('shipped but not in the snapshot', added.map(safeText)), ...capped('in the snapshot but not shipped', removed.map(safeText))]);
  }
  if (!i.actual) return notRun(`the database's column types, enums, indexes and foreign keys could not be read (${safeText(i.actualError ?? 'unknown')})`);

  const fails = { column: [] as string[], enum: [] as string[], index: [] as string[], fk: [] as string[] };
  const warns = { column: [] as string[], index: [] as string[] };
  let evaluated = 0; let skipped = 0;

  for (const table of Object.keys(i.expected.columns).sort()) {
    if (!i.presentTables.has(table)) { skipped++; continue; }
    evaluated++;
    const actCols = i.actual.columns[table] ?? {};
    for (const [col, expSig] of Object.entries(i.expected.columns[table]!)) {
      const actSig = actCols[col];
      if (actSig === undefined) continue;                                   // an absent column is the `columns` check's finding
      if (actSig === expSig) continue;
      const e = parseColumnSig(expSig); const a = parseColumnSig(actSig);
      const where = `${table}.${col}`;
      if (e.type !== a.type) fails.column.push(`${where}: type is ${safeText(a.type)}, expected ${e.type}`);
      else if (!e.notNull && a.notNull) fails.column.push(`${where}: NOT NULL where the model allows no value (inserts that omit it fail)`);
      else if (e.hasDefault && !a.hasDefault) fails.column.push(`${where}: the default is gone (inserts that rely on it fail)`);
      else if (e.notNull && !a.notNull) warns.column.push(`${where}: nullable, expected NOT NULL`);
    }
    const actIdx = new Set(i.actual.indexes[table] ?? []);
    const actFk = new Set(i.actual.foreignKeys[table] ?? []);
    for (const sig of i.expected.indexes[table] ?? []) {
      const { kind, rest } = splitIndexSig(sig);
      const satisfied = (kinds: string[]) => kinds.some((k) => actIdx.has(`${k} ${rest}`.trim()));
      if (kind === 'PRIMARY') { if (!satisfied(['PRIMARY'])) fails.index.push(`${table}: PRIMARY KEY (${safeText(rest)}) is absent`); }
      else if (kind === 'UNIQUE') { if (!satisfied(['UNIQUE', 'PRIMARY'])) fails.index.push(`${table}: UNIQUE (${safeText(rest)}) is absent or no longer unique`); }
      else if (!satisfied(['INDEX', 'UNIQUE', 'PRIMARY'])) warns.index.push(`${table}: index (${safeText(rest)}) is absent (slower queries only)`);
    }
    for (const sig of i.expected.foreignKeys[table] ?? []) if (!actFk.has(sig)) fails.fk.push(`${table}: foreign key ${safeText(sig)} is absent or has other actions`);
  }
  for (const [name, labels] of Object.entries(i.expected.enums)) {
    const act = i.actual.enums[name];
    if (!act) { fails.enum.push(`${safeText(name)}: the type is absent`); continue; }
    const missing = labels.filter((l) => !act.includes(l));
    if (missing.length > 0) fails.enum.push(`${safeText(name)}: value(s) absent: ${missing.map(safeText).join(', ')}`);
  }

  const nFail = fails.column.length + fails.enum.length + fails.index.length + fails.fk.length;
  const nWarn = warns.column.length + warns.index.length;
  const all = [
    ...capped('column', fails.column), ...capped('enum', fails.enum), ...capped('unique/primary index', fails.index), ...capped('foreign key', fails.fk),
    ...capped('warning (column)', warns.column), ...capped('warning (index)', warns.index),
  ];
  const details = all.length > DETAIL_CAP ? [...all.slice(0, DETAIL_CAP), `+${all.length - DETAIL_CAP} more line(s)`] : all;
  if (nFail > 0) {
    return { id: 'shape', status: 'FAIL', gating: true, reason: `${nFail} difference(s) from the schema this checkout's migrations create: ${fails.column.length} column(s), ${fails.enum.length} enum(s), ${fails.index.length} unique/primary index(es), ${fails.fk.length} foreign key(s)`, details };
  }
  if (skipped > 0 || nWarn > 0) {
    return { id: 'shape', status: 'WARN', gating: true, reason: `no blocking difference among ${evaluated} present table(s)${nWarn > 0 ? `; ${nWarn} non-blocking difference(s)` : ''}${skipped > 0 ? `; ${skipped} required table(s) are absent, so their shape was not evaluated` : ''}`, details };
  }
  const nCols = Object.values(i.expected.columns).reduce((n, c) => n + Object.keys(c).length, 0);
  return { id: 'shape', status: 'PASS', gating: true, reason: `column types, nullability, defaults (${nCols} columns), ${Object.keys(i.expected.enums).length} enums, indexes and foreign keys match the ${i.expected.migrations.length} migrations of this checkout (extras ignored)` };
}
