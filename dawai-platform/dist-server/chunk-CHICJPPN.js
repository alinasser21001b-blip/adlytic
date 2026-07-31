// server/config.ts
import { createHash } from "crypto";
import { resolve } from "path";
function requiredInProduction(name, fallback) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name}_REQUIRED_IN_PRODUCTION`);
  }
  return fallback;
}
var defaultEncryptionKey = createHash("sha256").update("dawai-local-development-encryption-key").digest("base64");
var config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL,
  pglitePath: process.env.PGLITE_PATH ?? resolve(process.cwd(), ".data", process.env.NODE_ENV === "test" ? "test" : "dawai"),
  storagePath: process.env.STORAGE_PATH ?? resolve(process.cwd(), "storage"),
  storageEncryptionKey: requiredInProduction(
    "STORAGE_ENCRYPTION_KEY",
    defaultEncryptionKey
  ),
  sessionPepper: requiredInProduction(
    "SESSION_PEPPER",
    "dawai-local-session-pepper-change-in-production"
  ),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  secureCookies: process.env.NODE_ENV === "production",
  requestLifetimeMinutes: Number(process.env.REQUEST_LIFETIME_MINUTES ?? 20),
  offerLifetimeMinutes: Number(process.env.OFFER_LIFETIME_MINUTES ?? 10),
  reservationAckMinutes: Number(process.env.RESERVATION_ACK_MINUTES ?? 3),
  reservationHoldMinutes: Number(process.env.RESERVATION_HOLD_MINUTES ?? 15),
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD
};
if (config.nodeEnv === "production" && (!config.databaseUrl || !config.storageEncryptionKey)) {
  throw new Error("PRODUCTION_DATABASE_AND_STORAGE_CONFIGURATION_REQUIRED");
}

// server/db/client.ts
import { readFile } from "fs/promises";
import { resolve as resolve2 } from "path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
function wrapPglite(client) {
  const executor = (connection) => ({
    async query(text, params = []) {
      const result = await connection.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length
      };
    }
  });
  return {
    ...executor(client),
    transaction: (run) => client.transaction(
      async (transaction) => run(executor(transaction))
    ),
    close: () => client.close()
  };
}
function wrapPostgres(client) {
  const executor = (connection) => ({
    async query(text, params = []) {
      const result = await connection.unsafe(text, params);
      return {
        rows: [...result],
        rowCount: result.count
      };
    }
  });
  return {
    ...executor(client),
    transaction: (run) => client.begin(
      async (transaction) => run(executor(transaction))
    ),
    close: async () => {
      await client.end();
    }
  };
}
async function createDatabase(options) {
  let database;
  if (config.databaseUrl && !(options == null ? void 0 : options.memory)) {
    database = wrapPostgres(
      postgres(config.databaseUrl, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: true
      })
    );
  } else {
    const pglite = new PGlite((options == null ? void 0 : options.memory) ? void 0 : config.pglitePath);
    await pglite.waitReady;
    database = wrapPglite(pglite);
  }
  if ((options == null ? void 0 : options.migrate) ?? true) {
    await migrateDatabase(database);
  }
  return database;
}
async function migrateDatabase(database) {
  const migration = await readFile(
    resolve2(process.cwd(), "migrations", "0001_init.sql"),
    "utf8"
  );
  const statements = migration.split(/;\s*(?:\n|$)/).map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    await database.query(statement);
  }
}

export {
  config,
  createDatabase
};
//# sourceMappingURL=chunk-CHICJPPN.js.map