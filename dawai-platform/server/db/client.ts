import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  const executor = (connection: PGlite): DbExecutor => ({
    async query<T>(text: string, params: unknown[] = []) {
      const result = await connection.query<T>(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
  });

  return {
    ...executor(client),
    transaction: (run) =>
      client.transaction(async (transaction) =>
        run(executor(transaction as unknown as PGlite)),
      ),
    close: () => client.close(),
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

export async function createDatabase(options?: {
  memory?: boolean;
  migrate?: boolean;
}): Promise<Database> {
  let database: Database;

  if (config.databaseUrl && !options?.memory) {
    database = wrapPostgres(
      postgres(config.databaseUrl, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: true,
      }),
    );
  } else {
    const pglite = new PGlite(options?.memory ? undefined : config.pglitePath);
    await pglite.waitReady;
    database = wrapPglite(pglite);
  }

  if (options?.migrate ?? true) {
    await migrateDatabase(database);
  }

  return database;
}

export async function migrateDatabase(database: DbExecutor): Promise<void> {
  const migration = await readFile(
    resolve(process.cwd(), "migrations", "0001_init.sql"),
    "utf8",
  );
  const statements = migration
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await database.query(statement);
  }
}
