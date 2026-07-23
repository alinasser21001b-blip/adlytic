// ════════════════════════════════════════════════════════════════════════
//  src/lib/pgSsl.ts
//
//  ONE home for the "does this Postgres host need TLS?" decision. Previously
//  each pool construction (serve.ts, workers, scripts) duplicated its own
//  variant, and none of them allowed a localhost dev database at all —
//  every non-.railway.internal host was forced onto TLS, which a local
//  `initdb` server doesn't speak.
//
//  Rules:
//   • Railway private network (*.railway.internal) → no TLS (isolated VPC).
//   • localhost / 127.0.0.1 / ::1                  → no TLS (local dev/CI).
//   • Everything else (Railway proxy, Supabase…)   → TLS. Verification is
//     strict when DATABASE_CA_CERT is provided, tolerant otherwise (matches
//     the previous serve.ts behavior).
// ════════════════════════════════════════════════════════════════════════

export type PgSslConfig = false | { rejectUnauthorized: boolean; ca?: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function pgSslFor(hostname: string): PgSslConfig {
  if (hostname.endsWith('.railway.internal') || LOCAL_HOSTS.has(hostname)) {
    return false;
  }
  const caCert = process.env['DATABASE_CA_CERT'];
  return caCert
    ? { rejectUnauthorized: true, ca: caCert }
    : { rejectUnauthorized: true };
}
