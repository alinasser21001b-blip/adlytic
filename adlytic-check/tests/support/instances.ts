export const MOCK_PORT = 8790;
export const MOCK = `http://127.0.0.1:${MOCK_PORT}`;

const base = {
  ENVIRONMENT: "development",
  ANTHROPIC_API_KEY: "test-key-not-real",
  PROVIDER_BASE_URL: MOCK,
  TURNSTILE_SECRET_KEY: "test-secret-not-real",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_VERIFY_URL: `${MOCK}/siteverify`,
  IP_HASH_SECRET: "test-ip-secret",
  PROVIDER_TIMEOUT_MS: "9000",
  MAX_PROVIDER_CALLS_PER_DAY: "1000",
  BUILD_ID: "test",
};

/** Four real `wrangler dev` Workers, each with its own local D1 and settings. */
export const INSTANCES = {
  main: { port: 8801, vars: base },
  capped: { port: 8802, vars: { ...base, MAX_PROVIDER_CALLS_PER_DAY: "2" } },
  // Tiny reservation TTL and retention so expiry paths run in seconds.
  short: { port: 8803, vars: { ...base, RESERVATION_TTL_SECONDS: "3", PROVIDER_TIMEOUT_MS: "20000", REPORT_RETENTION_DAYS: "0.00006" } },
  // Production must ignore the test-double URLs and fail closed.
  production: { port: 8804, vars: { ...base, ENVIRONMENT: "production" } },
} as const;

export type InstanceName = keyof typeof INSTANCES;
export const urlOf = (n: InstanceName) => `http://127.0.0.1:${INSTANCES[n].port}`;
