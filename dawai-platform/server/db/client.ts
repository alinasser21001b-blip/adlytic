import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { config } from "../config";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface DbExecutor {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface Database extends DbExecutor {
  transaction<T>(run: (tx: DbExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function wrapPglite(client: PGlite): Database {
  // PGlite is single-threaded; concurrent API requests can hang. Serialize
  // top-level work, but allow nested queries inside an active transaction.
  let gate: Promise<unknown> = Promise.resolve();
  let depth = 0;

  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (depth > 0) return work();
    const run = gate.then(async () => {
      depth += 1;
      try {
        return await work();
      } finally {
        depth -= 1;
      }
    });
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const executor = (connection: PGlite): DbExecutor => ({
    async query<T>(text: string, params: unknown[] = []) {
      return exclusive(async () => {
        const result = await connection.query<T>(text, params);
        return {
          rows: result.rows,
          rowCount: rowCountOf(result),
        };
      });
    },
  });

  return {
    query: (text, params) => exclusive(() => executor(client).query(text, params)),
    transaction: (run) =>
      exclusive(() =>
        client.transaction(async (transaction) => {
          const txExecutor: DbExecutor = {
            async query<T>(text: string, params: unknown[] = []) {
              const result = await (
                transaction as unknown as PGlite
              ).query<T>(text, params);
              return {
                rows: result.rows,
                rowCount: result.affectedRows ?? result.rows.length,
              };
            },
          };
          return run(txExecutor);
        }),
      ),
    close: () => exclusive(() => client.close()),
  };
}

function wrapPostgres(client: ReturnType<typeof postgres>): Database {
  const executor = (connection: ReturnType<typeof postgres>): DbExecutor => ({
    async query<T>(text: string, params: unknown[] = []) {
      const result = await connection.unsafe(text, params as never[]);
      return {
        rows: [...result] as T[],
        rowCount: result.count,
      };
    },
  });

  return {
    ...executor(client),
    transaction: (run) =>
      client.begin(async (transaction) =>
        run(executor(transaction as unknown as ReturnType<typeof postgres>)),
      ) as Promise<unknown> as Promise<never>,
    close: async () => {
      await client.end();
    },
  };
}

/**
 * How many rows a PGlite result represents.
 *
 * `affectedRows ?? rows.length` looks right and is wrong: PGlite returns
 * `affectedRows: 0` for a SELECT rather than leaving it undefined, so `??`
 * never falls through and EVERY read reported a row count of zero.
 *
 * That is not cosmetic. `migrateDatabase` decides whether a migration has
 * already run with `applied.rowCount > 0`, which was therefore always false —
 * so every migration re-ran on every boot, and the one statement in them that
 * Postgres cannot express idempotently (`ALTER TABLE ... ADD CONSTRAINT`, in
 * 0006) failed with «constraint already exists». The observable effect is that
 * the app started once and never again: the sequence the README gives for a
 * first run — `npm run db:migrate` then `npm run dev` — crashed on the second
 * of the two commands.
 *
 * Rows first, because a result that carried rows is a read and its count is
 * how many it carried; `affectedRows` is the answer only for a write, which
 * returns none.
 */
function rowCountOf(result: { rows: unknown[]; affectedRows?: number }): number {
  return result.rows.length > 0 ? result.rows.length : result.affectedRows ?? 0;
}

async function splitSqlStatements(sql: string): Promise<string[]> {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}

export async function migrateDatabase(database: DbExecutor): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const usersProbe = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = 'users'
     ) AS exists`,
  );
  if (usersProbe.rows[0]?.exists) {
    await database.query(
      `INSERT INTO schema_migrations (version)
       VALUES ('0001_init')
       ON CONFLICT (version) DO NOTHING`,
    );
  }

  const migrationsDir = resolve(process.cwd(), "migrations");
  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const applied = await database.query(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [version],
    );
    if (applied.rowCount > 0) continue;

    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    const statements = await splitSqlStatements(sql);
    for (const statement of statements) {
      await database.query(statement);
    }
    await database.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
      [version],
    );
  }
}

export async function createDatabase(options?: {
  memory?: boolean;
  migrate?: boolean;
}): Promise<Database> {
  let database: Database;

  if (config.databaseUrl && !options?.memory) {
    database = wrapPostgres(
      postgres(config.databaseUrl, {
        max: config.dbPoolMax,
        idle_timeout: config.dbIdleTimeout,
        connect_timeout: config.dbConnectTimeout,
        prepare: true,
      }),
    );
  } else {
    // PGlite creates its own data directory but NOT the parent, so a fresh
    // clone died on boot with `ENOENT: mkdir .data/dawai` — a first-run
    // failure that says nothing about what to do. Production uses DATABASE_URL
    // and never reaches this branch.
    if (!options?.memory) {
      mkdirSync(dirname(config.pglitePath), { recursive: true });
    }
    const pglite = new PGlite(options?.memory ? undefined : config.pglitePath);
    await pglite.waitReady;
    database = wrapPglite(pglite);
  }

  if (options?.migrate ?? true) {
    await migrateDatabase(database);
  }

  return database;
}
