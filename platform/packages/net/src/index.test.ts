/**
 * @blueprint §21 · D27
 * @owner platform-foundation
 */
import { describe, it, expect } from "vitest";
import { delayFor, shouldRetry, exhausted, classify, DEFAULT_POLICY } from "./index.js";

describe("backoff is patient and jittered", () => {
  it("grows exponentially and is capped", () => {
    const noJitter = () => 1;
    expect(delayFor(1, DEFAULT_POLICY, noJitter)).toBe(1_000);
    expect(delayFor(3, DEFAULT_POLICY, noJitter)).toBe(4_000);
    expect(delayFor(20, DEFAULT_POLICY, noJitter)).toBe(DEFAULT_POLICY.maxDelayMs);
  });
  it("jitter spreads the retry — when a tower returns, devices must not sync", () => {
    const a = delayFor(4, DEFAULT_POLICY, () => 0.1);
    const b = delayFor(4, DEFAULT_POLICY, () => 0.9);
    expect(a).toBeLessThan(b);
  });
  it("is deterministic when randomness is supplied", () => {
    expect(delayFor(3, DEFAULT_POLICY, () => 0.5)).toBe(delayFor(3, DEFAULT_POLICY, () => 0.5));
  });
});

describe("only transient failures retry", () => {
  it("retries a timeout", () => {
    expect(shouldRetry({ kind: "transient", reason: "t" }, 1, DEFAULT_POLICY)).toBe(true);
  });
  it("never retries a refusal — the server understood and said no", () => {
    expect(shouldRetry({ kind: "permanent", reason: "403" }, 1, DEFAULT_POLICY)).toBe(false);
  });
  it("never retries a duplicate — it already landed", () => {
    expect(shouldRetry({ kind: "duplicate" }, 1, DEFAULT_POLICY)).toBe(false);
  });
  it("stops at the policy limit and becomes visible to the user", () => {
    expect(shouldRetry({ kind: "transient", reason: "t" }, DEFAULT_POLICY.maxAttempts, DEFAULT_POLICY)).toBe(false);
    expect(exhausted(DEFAULT_POLICY.maxAttempts, DEFAULT_POLICY)).toBe(true);
  });
});

describe("every caller classifies identically", () => {
  it("409 is a duplicate, which is success", () => expect(classify(409).kind).toBe("duplicate"));
  it("429 and 5xx are transient", () => {
    expect(classify(429).kind).toBe("transient");
    expect(classify(503).kind).toBe("transient");
  });
  it("4xx other than the retryable ones is permanent", () => {
    expect(classify(403).kind).toBe("permanent");
    expect(classify(404).kind).toBe("permanent");
  });
  it("2xx is accepted", () => expect(classify(201).kind).toBe("accepted"));
});
