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
  // Non-production only: link import may fetch this exact origin over plain http.
  LINK_TEST_ORIGIN: MOCK,
  PROVIDER_TIMEOUT_MS: "9000",
  MAX_PROVIDER_CALLS_PER_DAY: "1000",
  BUILD_ID: "test",
};

// V2 analyzer + Google accounts + credits, with a 4-second "day" and a short lease.
const accountsVars = {
  ...base,
  ANALYZER_VERSION: "v2",
  ACCOUNTS_ENABLED: "true",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GOOGLE_AUTH_URL: `${MOCK}/o/oauth2/v2/auth`,
  GOOGLE_TOKEN_URL: `${MOCK}/token`,
  FREE_REFILL_MS: "4000",
  RESERVATION_TTL_SECONDS: "6",
  PROVIDER_TIMEOUT_MS: "20000",
  PAYMENTS_ENABLED: "true",
  MAX_SESSIONS_PER_IP_HOUR: "1000",
  ZAINCASH_CLIENT_ID: "zc-client",
  ZAINCASH_CLIENT_SECRET: "zc-secret",
  ZAINCASH_BASE_URL: `${MOCK}/zc`,
  VIDEO_ENABLED: "true",
  ASR_BASE_URL: `${MOCK}/asr`,
} as const;

/** Real `wrangler dev` Workers, each with its own local D1 and settings. */
export const INSTANCES = {
  main: { port: 8801, vars: base },
  capped: { port: 8802, vars: { ...base, MAX_PROVIDER_CALLS_PER_DAY: "2" } },
  // Tiny reservation TTL and retention so expiry paths run in seconds.
  short: { port: 8803, vars: { ...base, RESERVATION_TTL_SECONDS: "3", PROVIDER_TIMEOUT_MS: "20000", REPORT_RETENTION_DAYS: "0.00006" } },
  // Production must ignore the test-double URLs and fail closed.
  production: { port: 8804, vars: { ...base, ENVIRONMENT: "production" } },
  accounts: { port: 8805, vars: accountsVars },
  // Kill switch: new purchases off, gateway credentials still present.
  paymentsOff: { port: 8806, vars: { ...accountsVars, PAYMENTS_ENABLED: "false" } },
} as const;

export type InstanceName = keyof typeof INSTANCES;
export const urlOf = (n: InstanceName) => `http://127.0.0.1:${INSTANCES[n].port}`;
