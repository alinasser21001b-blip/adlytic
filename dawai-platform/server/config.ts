import { createHash } from "node:crypto";
import { resolve } from "node:path";

export type DeployEnv = "development" | "staging" | "production" | "test";

function deployEnv(): DeployEnv {
  const raw = (process.env.DAWAI_ENV ?? process.env.NODE_ENV ?? "development")
    .trim()
    .toLowerCase();
  if (raw === "staging") return "staging";
  if (raw === "production") return "production";
  if (raw === "test") return "test";
  return "development";
}

function requiredInProtected(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  const env = deployEnv();
  if (env === "production" || env === "staging") {
    throw new Error(`${name}_REQUIRED_IN_${env.toUpperCase()}`);
  }
  return fallback;
}

function requireMinLength(name: string, value: string, min: number): string {
  if (value.length < min) {
    throw new Error(`${name}_MUST_BE_AT_LEAST_${min}_CHARS`);
  }
  return value;
}

const defaultEncryptionKey = createHash("sha256")
  .update("dawai-local-development-encryption-key")
  .digest("base64");

const env = deployEnv();
const isProtected = env === "production" || env === "staging";

const storageEncryptionKey = requiredInProtected(
  "STORAGE_ENCRYPTION_KEY",
  defaultEncryptionKey,
);
const sessionPepper = requireMinLength(
  "SESSION_PEPPER",
  requiredInProtected(
    "SESSION_PEPPER",
    "dawai-local-session-pepper-change-in-production",
  ),
  isProtected ? 32 : 8,
);

const encryptionKeyBytes = Buffer.from(storageEncryptionKey, "base64");
if (encryptionKeyBytes.length !== 32) {
  if (isProtected) {
    throw new Error("STORAGE_ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64");
  }
}

const webOrigin = process.env.WEB_ORIGIN;
if (isProtected && !webOrigin) {
  throw new Error("WEB_ORIGIN_REQUIRED_IN_PRODUCTION");
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  deployEnv: env,
  isProtected,
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL,
  dbPoolMax: Number(process.env.DB_POOL_MAX ?? (isProtected ? 20 : 10)),
  dbIdleTimeout: Number(process.env.DB_IDLE_TIMEOUT ?? 20),
  dbConnectTimeout: Number(process.env.DB_CONNECT_TIMEOUT ?? 10),
  pglitePath:
    process.env.PGLITE_PATH ??
    resolve(process.cwd(), ".data", env === "test" ? "test" : "dawai"),
  storagePath: process.env.STORAGE_PATH ?? resolve(process.cwd(), "storage"),
  storageBackend: (process.env.STORAGE_BACKEND ?? "local") as
    | "local"
    | "s3",
  storageEncryptionKey,
  sessionPepper,
  webOrigin: webOrigin ?? "http://localhost:5173",
  secureCookies: isProtected || process.env.SECURE_COOKIES === "true",
  trustProxy: process.env.TRUST_PROXY === "true" || isProtected,
  runLifecycleInApi: process.env.RUN_LIFECYCLE_IN_API !== "false",
  requestLifetimeMinutes: Number(process.env.REQUEST_LIFETIME_MINUTES ?? 20),
  offerLifetimeMinutes: Number(process.env.OFFER_LIFETIME_MINUTES ?? 10),
  reservationAckMinutes: Number(process.env.RESERVATION_ACK_MINUTES ?? 3),
  reservationHoldMinutes: Number(process.env.RESERVATION_HOLD_MINUTES ?? 15),
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 30),
  /** Public base URL used only for reset-token handoff docs / logs in non-prod. */
  publicAppUrl: process.env.PUBLIC_APP_URL ?? webOrigin ?? "http://localhost:5173",
  /** Object storage (S3-compatible). Required only when STORAGE_BACKEND=s3. */
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "auto",
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },
  /** Push/SMS providers — adapters no-op until credentials are set. */
  fcm: {
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  apns: {
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
    bundleId: process.env.APNS_BUNDLE_ID,
    privateKey: process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  sms: {
    provider: process.env.SMS_PROVIDER ?? "none",
    apiKey: process.env.SMS_API_KEY,
    senderId: process.env.SMS_SENDER_ID,
  },
  malwareScanUrl: process.env.MALWARE_SCAN_URL,
  /** MVP is pickup-first. Delivery APIs stay but are disabled unless explicitly enabled. */
  mvpDeliveryEnabled: process.env.MVP_DELIVERY_ENABLED === "true",
};

if (isProtected && !config.databaseUrl) {
  throw new Error("DATABASE_URL_REQUIRED_IN_PRODUCTION");
}

if (config.storageBackend === "s3") {
  if (
    !config.s3.endpoint ||
    !config.s3.bucket ||
    !config.s3.accessKeyId ||
    !config.s3.secretAccessKey
  ) {
    throw new Error("S3_STORAGE_CONFIGURATION_INCOMPLETE");
  }
}

if (
  isProtected &&
  config.adminEmail &&
  config.adminPassword &&
  config.adminPassword.length < 16
) {
  throw new Error("ADMIN_PASSWORD_TOO_WEAK");
}
