/**
 * Environment — validated once at boot, then immutable.
 *
 * @blueprint §3 · D40 · §10
 * @owner platform-foundation
 * @why A process that starts with a missing or malformed setting and discovers
 *      it on the first request fails in front of a patient. Validating at boot
 *      moves every configuration failure to a deploy, where it is cheap.
 * @implements config/env
 */

export type Environment = "development" | "test" | "staging" | "production";

export type AppConfig = {
  readonly environment: Environment;
  /** D40 — exactly one launch district, named before the first verification.
   *  The product refuses requests outside it, so this is load-bearing. */
  readonly launchDistrictId: string;
  readonly serviceName: string;
  readonly releaseId: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
};

export class ConfigError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`Configuration invalid:\n  ${problems.join("\n  ")}`);
    this.name = "ConfigError";
  }
}

const ENVIRONMENTS: readonly Environment[] = ["development", "test", "staging", "production"];
const LEVELS = ["debug", "info", "warn", "error"] as const;

/**
 * Parse and validate. Takes the source as a parameter rather than reading
 * `process.env` directly so that it is testable and so that a caller cannot
 * accidentally read configuration from two places.
 */
export function loadConfig(source: Readonly<Record<string, string | undefined>>): AppConfig {
  const problems: string[] = [];
  const req = (key: string): string => {
    const v = source[key];
    if (v === undefined || v.trim() === "") { problems.push(`${key} is required`); return ""; }
    return v.trim();
  };

  const environment = req("DAWAI_ENV") as Environment;
  if (environment && !ENVIRONMENTS.includes(environment))
    problems.push(`DAWAI_ENV must be one of ${ENVIRONMENTS.join(", ")}, got "${environment}"`);

  const launchDistrictId = req("DAWAI_LAUNCH_DISTRICT_ID");
  const serviceName = req("DAWAI_SERVICE_NAME");
  const releaseId = req("DAWAI_RELEASE_ID");

  const logLevel = (source["DAWAI_LOG_LEVEL"] ?? "info").trim() as AppConfig["logLevel"];
  if (!LEVELS.includes(logLevel)) problems.push(`DAWAI_LOG_LEVEL must be one of ${LEVELS.join(", ")}`);

  if (problems.length) throw new ConfigError(problems);
  return Object.freeze({ environment, launchDistrictId, serviceName, releaseId, logLevel });
}
