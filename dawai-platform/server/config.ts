import { createHash } from "node:crypto";
import { resolve } from "node:path";

function requiredInProduction(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name}_REQUIRED_IN_PRODUCTION`);
  }
  return fallback;
}

const defaultEncryptionKey = createHash("sha256")
  .update("dawai-local-development-encryption-key")
  .digest("base64");

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL,
  pglitePath:
    process.env.PGLITE_PATH ??
    resolve(process.cwd(), ".data", process.env.NODE_ENV === "test" ? "test" : "dawai"),
  storagePath: process.env.STORAGE_PATH ?? resolve(process.cwd(), "storage"),
  storageEncryptionKey: requiredInProduction(
    "STORAGE_ENCRYPTION_KEY",
    defaultEncryptionKey,
  ),
  sessionPepper: requiredInProduction(
    "SESSION_PEPPER",
    "dawai-local-session-pepper-change-in-production",
  ),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  secureCookies: process.env.NODE_ENV === "production",
  requestLifetimeMinutes: Number(process.env.REQUEST_LIFETIME_MINUTES ?? 20),
  offerLifetimeMinutes: Number(process.env.OFFER_LIFETIME_MINUTES ?? 10),
  reservationAckMinutes: Number(process.env.RESERVATION_ACK_MINUTES ?? 3),
  reservationHoldMinutes: Number(process.env.RESERVATION_HOLD_MINUTES ?? 15),
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
};

if (
  config.nodeEnv === "production" &&
  (!config.databaseUrl || !config.storageEncryptionKey)
) {
  throw new Error("PRODUCTION_DATABASE_AND_STORAGE_CONFIGURATION_REQUIRED");
}
