// ════════════════════════════════════════════════════════════════════════
//  src/config.ts
//
//  Single source of truth for environment configuration.
//
//  Reads and validates EVERY env var the app cares about exactly once, at
//  module load, and exposes a typed, frozen `config` object. Nothing else in
//  the codebase should read `process.env` for these keys — import `config`
//  instead.
//
//  Validation policy (preserves prior per-file behavior, centralized here):
//    • Required secrets — JWT_SECRET, TOKEN_ENCRYPTION_KEY, DATABASE_URL:
//        production → FATAL (process exits via assertConfigOrExit at boot)
//        development → warning + safe fallback (dev default / plaintext)
//    • Everything else is optional with a documented default.
//
//  Boot reporting: call `reportConfig()` once at startup (serve.ts) to print
//  a single ✅/⚠️/❌ checklist plus the encryption-key fingerprint, and to
//  exit the process in production when a required var is missing/invalid.
// ════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';

// ── primitives ────────────────────────────────────────────────────────────

/** Read an env var, trimmed; treat empty/whitespace-only as absent. */
function env(key: string): string | undefined {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function envNumber(key: string, fallback: number): number {
  const raw = env(key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Read a boolean env var. Accepts 1/true/yes/on (case-insensitive) as true. */
function envBoolean(key: string, fallback: boolean): boolean {
  const raw = env(key);
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

const NODE_ENV = env('NODE_ENV') ?? 'development';
const IS_PRODUCTION = NODE_ENV !== 'development' && NODE_ENV !== 'test';

// ── validation bookkeeping ──────────────────────────────────────────────────

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface ConfigCheck {
  key: string;
  status: CheckStatus;
  /** Human-readable reason — present for warn/fail, optional detail for ok. */
  detail?: string;
}

const checks: ConfigCheck[] = [];
function record(check: ConfigCheck): void {
  checks.push(check);
}

/**
 * Validate a REQUIRED secret. In production a missing/invalid value is fatal
 * (status 'fail' → exit at boot). In development it degrades to a warning so
 * local work is unblocked.
 */
function validateRequired(key: string, value: string | undefined, validate: (v: string) => string | null): { ok: boolean } {
  if (value === undefined) {
    record({ key, status: IS_PRODUCTION ? 'fail' : 'warn', detail: `${key} is not set` });
    return { ok: false };
  }
  const reason = validate(value);
  if (reason) {
    record({ key, status: IS_PRODUCTION ? 'fail' : 'warn', detail: reason });
    return { ok: false };
  }
  record({ key, status: 'ok' });
  return { ok: true };
}

// ── JWT_SECRET ──────────────────────────────────────────────────────────────

const DEV_JWT_SECRET = 'adlytic-insecure-dev-secret-do-not-use-in-production-ever';
const rawJwtSecret = env('JWT_SECRET');
const jwtValid = validateRequired('JWT_SECRET', rawJwtSecret, (v) =>
  v.length < 32 ? 'JWT_SECRET must be at least 32 characters' : null,
);
const jwtSecret = jwtValid.ok ? (rawJwtSecret as string) : DEV_JWT_SECRET;

// ── TOKEN_ENCRYPTION_KEY ─────────────────────────────────────────────────────

const rawEncKey = env('TOKEN_ENCRYPTION_KEY');
const encValid = validateRequired('TOKEN_ENCRYPTION_KEY', rawEncKey, (v) =>
  v.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(v)
    ? 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'
    : null,
);
const tokenEncryptionKey: Buffer | null = encValid.ok ? Buffer.from(rawEncKey as string, 'hex') : null;
/** Short, non-reversible fingerprint of the key so operators can confirm the
 *  prod key matches what encrypted the stored tokens. Never logs the key. */
const tokenEncryptionKeyFingerprint: string | null = tokenEncryptionKey
  ? createHash('sha256').update(tokenEncryptionKey).digest('hex').slice(0, 8)
  : null;

// ── DATABASE_URL ─────────────────────────────────────────────────────────────

const rawDbUrl = env('DATABASE_URL');
validateRequired('DATABASE_URL', rawDbUrl, (v) => {
  try {
    new URL(v);
    return null;
  } catch {
    return `DATABASE_URL is not a valid URL`;
  }
});

// ── Meta OAuth ───────────────────────────────────────────────────────────────

const DEFAULT_META_API_VERSION = 'v20.0';
const rawApiVersion = env('META_API_VERSION') ?? DEFAULT_META_API_VERSION;
const metaApiVersion = /^v\d+\.\d+$/.test(rawApiVersion) ? rawApiVersion : DEFAULT_META_API_VERSION;
if (!/^v\d+\.\d+$/.test(rawApiVersion)) {
  record({ key: 'META_API_VERSION', status: 'warn', detail: `Invalid META_API_VERSION "${rawApiVersion}" — falling back to ${DEFAULT_META_API_VERSION}` });
}

const metaAppId = env('META_APP_ID');
const metaAppSecret = env('META_APP_SECRET');
const metaVerifyToken = env('META_VERIFY_TOKEN');
const metaRedirectUri = env('META_REDIRECT_URI') ?? 'http://localhost:3001/api/meta/oauth/callback';
const metaOAuthScope = env('META_OAUTH_SCOPE') ?? 'ads_read';
const metaDirectToken = env('META_DIRECT_TOKEN');
/**
 * Phase 1 feature flag. When false (default), the legacy user-OAuth flow is the
 * only active path and production behavior is unchanged. When true, the new
 * System User / FB Login for Business plumbing (MetaConnection) is enabled.
 */
const metaSystemUserEnabled = envBoolean('META_SYSTEM_USER_ENABLED', false);
record({
  key: 'META_SYSTEM_USER_ENABLED',
  status: 'ok',
  detail: metaSystemUserEnabled
    ? 'enabled — System User / FB Login for Business plumbing active'
    : 'disabled (default) — legacy OAuth flow only',
});
/**
 * Phase 2 — FB Login for Business "configuration" id. Identifies the Meta
 * Login configuration that defines which assets/permissions the business login
 * dialog requests. Required (when the flag is on) to build the config_id-based
 * authorization URL. Absent → the System User start endpoint falls back to the
 * manual-token modal with a clear reason.
 */
const metaSystemUserConfigId = env('META_LOGIN_CONFIG_ID');
/**
 * Phase 2 — optional pre-minted System User token. Lets an operator validate
 * the System User connection flow against their OWN Business before Meta App
 * Review approves FB Login for Business. When set (and the flag is on), the
 * OAuth dialog is bypassed and this token drives the MetaConnection directly.
 */
const metaSystemUserToken = env('META_SYSTEM_USER_TOKEN');
if (metaSystemUserEnabled) {
  record({
    key: 'META_LOGIN_CONFIG_ID',
    status: metaSystemUserConfigId ? 'ok' : 'warn',
    detail: metaSystemUserConfigId
      ? 'present — FB Login for Business config_id available'
      : 'absent — System User start will fall back to manual token entry',
  });
  if (metaSystemUserToken) {
    record({
      key: 'META_SYSTEM_USER_TOKEN',
      status: 'ok',
      detail: 'present — OAuth dialog bypassed; token drives MetaConnection directly (pre-App-Review testing)',
    });
  }
}

// ── Redis (optional — gates horizontal-scaling features) ─────────────────────
//
// Phase 1 of the horizontal-scaling roadmap. Redis is OPTIONAL: when unset,
// the Redis-backed modules (webhook debounce, distributed locks, queues)
// fall back to in-process implementations. We validate the URL here so the
// boot log makes the deploy state obvious; runtime errors are surfaced by
// src/lib/redis.ts via ioredis event listeners.

const rawRedisUrl = env('REDIS_URL');
let redisUrl: string | undefined;
if (rawRedisUrl === undefined) {
  record({
    key: 'REDIS_URL',
    status: 'warn',
    detail: 'not set — Redis-backed features disabled; using in-process fallbacks',
  });
} else {
  try {
    const u = new URL(rawRedisUrl);
    if (u.protocol !== 'redis:' && u.protocol !== 'rediss:') {
      record({
        key: 'REDIS_URL',
        status: 'warn',
        detail: `protocol must be redis:// or rediss:// (got ${u.protocol}) — feature disabled`,
      });
    } else {
      redisUrl = rawRedisUrl;
      record({
        key: 'REDIS_URL',
        status: 'ok',
        detail: `${u.protocol}//${u.hostname}:${u.port || '6379'}`,
      });
    }
  } catch {
    record({
      key: 'REDIS_URL',
      status: 'warn',
      detail: 'is not a valid URL — Redis-backed features disabled',
    });
  }
}

// ── feature flags (horizontal-scaling rollout) ───────────────────────────────
//
// Each flag here gates a Phase 2+ feature whose Redis path is being rolled out
// in stages. Off by default until the staging drill confirms graceful
// fallback behavior under simulated Redis outages.

/** Phase 2 — route Meta webhook reconcile debounce through Redis so multi-
 *  instance deploys coalesce bursts cluster-wide instead of per-process. */
const webhookRedisDebounceEnabled = envBoolean('WEBHOOK_REDIS_DEBOUNCE_ENABLED', false);
record({
  key: 'WEBHOOK_REDIS_DEBOUNCE_ENABLED',
  status: 'ok',
  detail: webhookRedisDebounceEnabled
    ? 'enabled — Meta webhook debounce uses Redis SET NX EX (with in-process fallback)'
    : 'disabled (default) — in-process Map debounce only',
});

/** Phase 3 — route fire-and-forget background work (post-OAuth initial sync,
 *  manual /sync triggers, webhook reconciles, lifetime-totals backfills, mock
 *  seed) through BullMQ instead of in-process setImmediate. Workers run inside
 *  the API process for Phase 3-a (zero-regression rollout); a follow-up phase
 *  splits workers into their own dynos. When the flag is off, or when Redis
 *  is unhealthy, every enqueue site falls back to its original setImmediate
 *  body so behavior is identical to pre-Phase-3. */
const bullmqEnabled = envBoolean('BULLMQ_ENABLED', false);
record({
  key: 'BULLMQ_ENABLED',
  status: 'ok',
  detail: bullmqEnabled
    ? 'enabled — fire-and-forget background work routed through BullMQ (with in-process fallback)'
    : 'disabled (default) — fire-and-forget runs via in-process setImmediate only',
});

// ── misc operational vars ────────────────────────────────────────────────────

const port = envNumber('PORT', 3001);
const syncIntervalMs = envNumber('SYNC_INTERVAL_MS', 6 * 60 * 60 * 1000);
const rawInsightsRetainDays = envNumber('RAW_INSIGHTS_RETAIN_DAYS', 90);

// ── CORS ─────────────────────────────────────────────────────────────────────

const rawAllowedOrigins = env('ALLOWED_ORIGINS');
const allowedOrigins = (rawAllowedOrigins ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (IS_PRODUCTION && allowedOrigins.length === 0) {
  record({
    key: 'ALLOWED_ORIGINS',
    status: 'fail',
    detail: 'ALLOWED_ORIGINS must be set to a comma-separated list of origins in production',
  });
} else if (allowedOrigins.length === 0) {
  record({
    key: 'ALLOWED_ORIGINS',
    status: 'warn',
    detail: 'not set — CORS allows all origins (development only)',
  });
} else {
  record({ key: 'ALLOWED_ORIGINS', status: 'ok', detail: allowedOrigins.join(', ') });
}

// ── public, frozen config ────────────────────────────────────────────────────

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;

  database: { url: string | undefined };

  /** Redis is optional; absent → consumers fall back to in-process behavior. */
  redis: { url: string | undefined };

  jwt: { secret: string };

  tokenEncryption: {
    /** 32-byte AES key, or null when unset (dev → plaintext storage). */
    key: Buffer | null;
    /** First 8 chars of sha256(key), or null when no key. Safe to log. */
    keyFingerprint: string | null;
  };

  meta: {
    apiVersion: string;
    appId: string | undefined;
    appSecret: string | undefined;
    /** Webhook subscription verify token (env META_VERIFY_TOKEN). */
    verifyToken: string | undefined;
    redirectUri: string;
    oauthScope: string;
    directToken: string | undefined;
    /** Phase 1 flag — gates System User / FB Login for Business plumbing. */
    systemUserEnabled: boolean;
    /** Phase 2 — FB Login for Business config_id (env META_LOGIN_CONFIG_ID). */
    systemUserConfigId: string | undefined;
    /** Phase 2 — optional pre-minted System User token (env META_SYSTEM_USER_TOKEN). */
    systemUserToken: string | undefined;
  };

  sync: {
    intervalMs: number;
    rawInsightsRetainDays: number;
  };

  cors: { allowedOrigins: string[] };

  /** Phase 2+ feature flags. Each must default to the pre-flag behavior. */
  features: {
    /** When true, Meta webhook debounce uses Redis SET NX EX (with in-process
     *  Map fallback if Redis is unhealthy). */
    webhookRedisDebounceEnabled: boolean;
    /** When true, fire-and-forget background work is enqueued into BullMQ
     *  (with in-process setImmediate fallback if Redis is unhealthy or the
     *  enqueue throws). */
    bullmqEnabled: boolean;
  };
}

export const config: Readonly<AppConfig> = Object.freeze({
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  port,
  database: Object.freeze({ url: rawDbUrl }),
  redis: Object.freeze({ url: redisUrl }),
  jwt: Object.freeze({ secret: jwtSecret }),
  tokenEncryption: Object.freeze({
    key: tokenEncryptionKey,
    keyFingerprint: tokenEncryptionKeyFingerprint,
  }),
  meta: Object.freeze({
    apiVersion: metaApiVersion,
    appId: metaAppId,
    appSecret: metaAppSecret,
    verifyToken: metaVerifyToken,
    redirectUri: metaRedirectUri,
    oauthScope: metaOAuthScope,
    directToken: metaDirectToken,
    systemUserEnabled: metaSystemUserEnabled,
    systemUserConfigId: metaSystemUserConfigId,
    systemUserToken: metaSystemUserToken,
  }),
  sync: Object.freeze({
    intervalMs: syncIntervalMs,
    rawInsightsRetainDays: rawInsightsRetainDays,
  }),
  cors: Object.freeze({ allowedOrigins }),
  features: Object.freeze({
    webhookRedisDebounceEnabled,
    bullmqEnabled,
  }),
}) as Readonly<AppConfig>;

// ── boot reporting ───────────────────────────────────────────────────────────

let _reported = false;

/**
 * Print a single ✅/⚠️/❌ checklist of required configuration, plus the
 * encryption-key fingerprint. In production, exits the process when any
 * required var is missing/invalid. Idempotent: only prints once.
 */
export function reportConfig(): void {
  if (_reported) return;
  _reported = true;

  const ICON: Record<CheckStatus, string> = { ok: '✅', warn: '⚠️ ', fail: '❌' };
  console.log(`[adlytic:config] Environment check (NODE_ENV=${NODE_ENV}):`);
  for (const c of checks) {
    const line = c.detail ? `${c.key} — ${c.detail}` : c.key;
    console.log(`  ${ICON[c.status]} ${line}`);
  }

  if (tokenEncryptionKeyFingerprint) {
    console.log(`  🔑 TOKEN_ENCRYPTION_KEY fingerprint: ${tokenEncryptionKeyFingerprint} (sha256 prefix; not the key)`);
  } else {
    console.log(`  🔑 TOKEN_ENCRYPTION_KEY fingerprint: <none> — tokens stored as plaintext`);
  }

  const failures = checks.filter((c) => c.status === 'fail');
  if (failures.length > 0) {
    console.error(
      `[adlytic:config] FATAL — ${failures.length} required configuration error(s) in production:\n` +
        failures.map((f) => `  • ${f.key}: ${f.detail}`).join('\n') +
        `\n  Generate a JWT secret:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"\n` +
        `  Generate an enc. key:   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
    process.exit(1);
  }
}

/** Exit in production if required config is invalid, without re-printing. */
export function assertConfigOrExit(): void {
  reportConfig();
}
