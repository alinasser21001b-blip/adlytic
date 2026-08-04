/**
 * @blueprint §3 · §8 · §10 · D40 · D20
 * @owner platform-foundation
 * @why Configuration fails in one of two places: at boot, where it is cheap,
 *      or in front of a patient. These tests hold it to the first. The secret
 *      tests exist because this module's claim — that a secret cannot reach a
 *      log line by accident — is only true if the shape actually behaves that
 *      way, and nothing had ever checked.
 */
import { describe, it, expect } from "vitest";
import { loadConfig, ConfigError } from "./env.js";
import { mapSecretStore, requireSecrets } from "./secrets.js";
import { flagResolver, PHASE_0_FLAGS } from "./flags.js";

const complete = {
  DAWAI_ENV: "production",
  DAWAI_LAUNCH_DISTRICT_ID: "d-karrada",
  DAWAI_SERVICE_NAME: "patient-api",
  DAWAI_RELEASE_ID: "1.5.0",
};

describe("configuration is validated at boot, not on the first request", () => {
  it("a complete environment loads", () => {
    expect(loadConfig(complete)).toMatchObject({ environment: "production", launchDistrictId: "d-karrada" });
  });

  it("defaults the log level rather than requiring it", () => {
    expect(loadConfig(complete).logLevel).toBe("info");
  });

  it("reports EVERY problem at once, not the first", () => {
    // A deploy that fails four times because it is told one missing key at a
    // time is four deploys.
    try {
      loadConfig({});
      expect.unreachable("empty configuration loaded");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).problems.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("a blank value is missing, not present", () => {
    expect(() => loadConfig({ ...complete, DAWAI_SERVICE_NAME: "   " })).toThrow(ConfigError);
  });

  it("an environment outside the four is refused by name", () => {
    try {
      loadConfig({ ...complete, DAWAI_ENV: "prod" });
      expect.unreachable("an unknown environment loaded");
    } catch (e) {
      expect((e as ConfigError).problems.join(" ")).toContain("DAWAI_ENV");
    }
  });

  it("an unknown log level is refused", () => {
    expect(() => loadConfig({ ...complete, DAWAI_LOG_LEVEL: "verbose" })).toThrow(ConfigError);
  });

  it("the result is frozen — configuration is read, never edited", () => {
    expect(Object.isFrozen(loadConfig(complete))).toBe(true);
  });

  it("D40 — the launch district is load-bearing and cannot be defaulted", () => {
    const { DAWAI_LAUNCH_DISTRICT_ID: _omitted, ...without } = complete;
    expect(() => loadConfig(without)).toThrow(ConfigError);
  });
});

describe("§8 — a secret cannot reach a log line by accident", () => {
  const store = mapSecretStore({ SESSION_SIGNING_KEY: "s3cr3t", SMS_PROVIDER_KEY: "" });

  it("reading is an explicit, greppable call", () => {
    expect(store.get("SESSION_SIGNING_KEY").reveal()).toBe("s3cr3t");
  });

  it("interpolating one yields nothing — this is the claim the type makes", () => {
    const secret = store.get("SESSION_SIGNING_KEY");
    expect(`${secret}`).not.toContain("s3cr3t");
    expect(JSON.stringify(secret)).not.toContain("s3cr3t");
    expect(JSON.stringify({ key: secret })).not.toContain("s3cr3t");
  });

  it("an empty value is absent, not an empty secret", () => {
    expect(() => store.get("SMS_PROVIDER_KEY")).toThrow(/not available/);
    expect(store.available()).not.toContain("SMS_PROVIDER_KEY");
  });

  it("a missing secret throws on read rather than returning undefined", () => {
    expect(() => store.get("DATABASE_URL")).toThrow(/DATABASE_URL/);
  });

  it("the boot check names every missing secret, and never a value", () => {
    try {
      requireSecrets(store, ["SESSION_SIGNING_KEY", "DATABASE_URL", "PUSH_PROVIDER_KEY"]);
      expect.unreachable("missing secrets passed the boot check");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("PUSH_PROVIDER_KEY");
      expect(message, "a secret value reached an error message").not.toContain("s3cr3t");
    }
  });

  it("a satisfied boot check passes silently", () => {
    expect(() => requireSecrets(store, ["SESSION_SIGNING_KEY"])).not.toThrow();
  });
});

describe("§10 — Phase 0 ships no flags, and a typo is not a default", () => {
  it("the registry is empty, deliberately", () => {
    expect(PHASE_0_FLAGS).toEqual([]);
  });

  it("an unregistered flag throws rather than resolving false", () => {
    // Returning false silently would let a typo disable a feature with no
    // signal at all.
    const r = flagResolver(PHASE_0_FLAGS, { isEnabled: () => true });
    expect(() => r.isEnabled("newCheckout")).toThrow(/not registered/);
  });

  it("a registered flag falls back to its declared default when the source fails", () => {
    const def = { name: "f", owner: "platform", removeBy: "2.0.0", defaultValue: true, blueprint: "§10" };
    const r = flagResolver([def], { isEnabled: () => { throw new Error("source down"); } });
    expect(r.isEnabled("f")).toBe(true);
  });

  it("every registered flag carries an owner and a removal version", () => {
    for (const f of PHASE_0_FLAGS) {
      expect(f.owner, f.name).toBeTruthy();
      expect(f.removeBy, f.name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
