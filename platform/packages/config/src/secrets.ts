/**
 * Secrets — resolved through an interface, never read from the environment
 * at the point of use.
 *
 * @blueprint §8 · V4
 * @owner platform-foundation
 * @why A secret read inline is a secret that ends up in a log line, a stack
 *      trace or a snapshot. Routing every read through one interface gives a
 *      single place to add redaction, rotation and an access record, and makes
 *      `grep process.env` a complete audit of secret access.
 * @implements config/secrets
 */

export type SecretName =
  | "DATABASE_URL"
  | "SMS_PROVIDER_KEY"
  | "PUSH_PROVIDER_KEY"
  | "OBJECT_STORAGE_KEY"
  | "PRESCRIPTION_ENCRYPTION_KEY"
  | "SESSION_SIGNING_KEY";

/** Opaque. It has no `toString`, so it cannot be interpolated into a log line
 *  by accident — reading it is an explicit, greppable call. */
export type Secret = { readonly reveal: () => string };

export interface SecretStore {
  get(name: SecretName): Secret;
  /** Names present, for a boot-time completeness check. Never values. */
  available(): readonly SecretName[];
}

const wrap = (value: string): Secret => ({ reveal: () => value });

/**
 * Reads from a supplied map. Production supplies a manager-backed store; this
 * exists so tests and local development do not need one.
 */
export function mapSecretStore(source: Readonly<Record<string, string | undefined>>): SecretStore {
  return {
    get(name) {
      const v = source[name];
      if (v === undefined || v === "") throw new Error(`Secret "${name}" is not available`);
      return wrap(v);
    },
    available() {
      return (Object.keys(source) as SecretName[]).filter((k) => source[k] !== undefined && source[k] !== "");
    },
  };
}

/** Boot-time check. A service asserts what it needs and fails to start without
 *  it, rather than failing on the first request that needs it. */
export function requireSecrets(store: SecretStore, needed: readonly SecretName[]): void {
  const have = new Set(store.available());
  const missing = needed.filter((n) => !have.has(n));
  if (missing.length) throw new Error(`Missing required secrets: ${missing.join(", ")}`);
}
