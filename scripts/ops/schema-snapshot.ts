#!/usr/bin/env -S npx tsx
// ════════════════════════════════════════════════════════════════════════
//  scripts/ops/schema-snapshot.ts — (re)generate scripts/ops/expected-schema.json
//
//    DATABASE_URL=postgresql://<user>@127.0.0.1:<port>/<empty db migrated by `prisma migrate deploy`> \
//        npx tsx scripts/ops/schema-snapshot.ts [--write]
//
//  Needed whenever a migration is added or changed (test_preflight_schema.ts fails until it is regenerated).
//  Reads ONLY (the same BEGIN READ ONLY ... ROLLBACK session as the preflight, the same statement guards) and refuses
//  anything but a LOOPBACK database. It also refuses to describe a database that is not exactly what `prisma migrate
//  deploy` of this checkout leaves on an empty Postgres: every shipped migration applied once and byte-for-byte equal,
//  nothing unfinished, rolled back, extra or duplicated, every required table and column present.
//  Without --write it prints the JSON to stdout. Exit 0 written/printed · 1 refused (not a pristine migrated database) · 2 NOT RUN.
// ════════════════════════════════════════════════════════════════════════

import { writeFileSync } from 'node:fs';
import { collect, decideVerdict, defaultConnect, isLoopbackHost, readBuildFromCheckout } from './preflight-schema';
import type { Deps } from './preflight-schema';
import { EXPECTED_SHAPE_FILE, buildExpectedShape, formatExpectedShape, shapeFromRows } from './schema-shape';

export interface SnapshotIo { out: (s: string) => void; err: (s: string) => void }

export async function snapshotMain(argv: string[], env: Record<string, string | undefined>, io: SnapshotIo, deps: Partial<Deps> = {}, file: string = EXPECTED_SHAPE_FILE): Promise<number> {
  let write = false;
  for (const a of argv) {
    if (a === '--write') write = true;
    else if (a === '--help' || a === '-h') { io.out('Usage: DATABASE_URL=postgresql://<user>@127.0.0.1:<port>/<db> npx tsx scripts/ops/schema-snapshot.ts [--write]'); return 0; }
    else { io.err('NOT RUN: unknown argument (value not shown)'); return 2; }
  }
  const raw = env['DATABASE_URL'];
  if (!raw) { io.err('NOT RUN: DATABASE_URL is not set'); return 2; }
  let url: URL;
  try { url = new URL(raw); } catch { io.err('NOT RUN: DATABASE_URL is not a valid URL (value not shown)'); return 2; }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') { io.err('NOT RUN: DATABASE_URL must be a postgresql:// URL'); return 2; }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!isLoopbackHost(host)) { io.err('NOT RUN: refused: the snapshot describes a database migrated from scratch on THIS machine; DATABASE_URL must be a loopback address'); return 2; }
  const dec = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

  const build = (deps.readBuild ?? readBuildFromCheckout)();
  let conn;
  try { conn = await (deps.connect ?? defaultConnect)({ host, port: Number(url.port) || 5432, user: dec(url.username), password: dec(url.password), database: dec(url.pathname.replace(/^\//, '')), ssl: false }); }
  catch { io.err('NOT RUN: cannot connect (details withheld)'); return 2; }
  let col;
  try { col = await collect(conn, false); } catch { try { await conn.end(); } catch { /* ignore */ } io.err('NOT RUN: the read-only session failed before the first check'); return 2; }
  try { await conn.end(); } catch { /* ignore */ }
  if (col.connectionLost || !col.tables || col.history === undefined || !col.columns || !col.shapeRows) { io.err(`NOT RUN: the catalog could not be read (${col.schemaError ?? col.shapeError ?? 'unknown'})`); return 2; }

  const d = decideVerdict({
    shipped: build.names, fileHashes: build.fileHashes, history: col.history, requiredTables: build.requiredTables, requiredColumns: build.requiredColumns,
    presentTables: col.tables, presentColumns: col.columns, expectedShape: null, shape: null,
  });
  const strict = ['identities', 'checksums', 'tables', 'columns'].map((id) => d.checks.find((c) => c.id === id));
  const refusals: string[] = [];
  if (d.state !== 'ok') refusals.push(`health state is ${d.state}, not ok`);
  for (const c of strict) if (!c || c.status !== 'PASS') refusals.push(`${c?.id ?? '?'} is ${c?.status ?? 'missing'}: ${c?.reason ?? ''}`);
  if (col.history && build.names && col.history.length !== build.names.length) refusals.push(`_prisma_migrations holds ${col.history.length} row(s) for ${build.names.length} shipped migration(s): not a database migrated once from scratch`);
  if (!build.names || !build.requiredTables || !build.requiredColumns) refusals.push('the checkout\'s migration list or Prisma metadata could not be read');
  if (refusals.length > 0) { io.err(`REFUSED: not a pristine database migrated by \`prisma migrate deploy\` from this checkout:\n  - ${refusals.join('\n  - ')}`); return 1; }

  const shape = shapeFromRows(col.shapeRows, new Set(build.requiredTables!));
  // The shape must describe exactly the columns the Prisma client selects (names; types come from the migrations).
  const mismatch: string[] = [];
  for (const [table, cols] of build.requiredColumns!) {
    const have = Object.keys(shape.columns[table] ?? {});
    for (const c of cols) if (!have.includes(c)) mismatch.push(`${table}.${c} (required, absent)`);
    for (const c of have) if (!cols.includes(c)) mismatch.push(`${table}.${c} (in the database, not in the Prisma model)`);
  }
  if (mismatch.length > 0) { io.err(`REFUSED: the migrated database and the Prisma client disagree about columns:\n  - ${mismatch.slice(0, 10).join('\n  - ')}`); return 1; }

  const text = formatExpectedShape(buildExpectedShape(shape, build.names!, `PostgreSQL ${col.server}`));
  if (write) { writeFileSync(file, text); io.err(`wrote ${Object.keys(shape.columns).length} tables, ${Object.keys(shape.enums).length} enums for ${build.names!.length} migrations`); }
  else io.out(text.trimEnd());
  return 0;
}

if (require.main === module) {
  snapshotMain(process.argv.slice(2), process.env, { out: (s) => console.log(s), err: (s) => console.error(s) })
    .then((code) => process.exit(code), () => { console.error('NOT RUN: unexpected internal error (details withheld: they may contain connection data)'); process.exit(2); });
}
