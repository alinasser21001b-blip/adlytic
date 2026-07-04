// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/rateLimit.ts
//
//  Token bucket per workspace. Bounds tool-call churn from a runaway loop or
//  a hostile prompt. Above the limit the dispatcher returns a RATE_LIMIT
//  error to Claude so it can back off gracefully — never a silent 500.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §19.4 (gap #4)
// ════════════════════════════════════════════════════════════════════════

interface Bucket {
  /** Tokens currently available. Max = capacity. */
  tokens: number;
  /** Epoch ms of the last refill. */
  lastRefillMs: number;
}

interface RateLimitConfig {
  /** Max concurrent tokens per workspace. Default 30. */
  capacity: number;
  /** How often a full-capacity refill would take, in ms. Default 60_000 (1 min). */
  refillIntervalMs: number;
}

/**
 * Token-bucket limiter. `capacity` tokens per `refillIntervalMs`. Rate is
 * continuous — after 30s, half the bucket has refilled.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly cfg: RateLimitConfig;

  constructor(cfg: Partial<RateLimitConfig> = {}) {
    this.cfg = {
      capacity: cfg.capacity ?? 30,
      refillIntervalMs: cfg.refillIntervalMs ?? 60_000,
    };
  }

  /** Attempt to consume 1 token for `workspaceId`. Returns true when allowed. */
  tryConsume(workspaceId: string, cost = 1): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    let bucket = this.buckets.get(workspaceId);
    if (!bucket) {
      bucket = { tokens: this.cfg.capacity, lastRefillMs: now };
      this.buckets.set(workspaceId, bucket);
    } else {
      // Continuous refill: (elapsedMs / refillIntervalMs) * capacity tokens.
      const elapsed = now - bucket.lastRefillMs;
      if (elapsed > 0) {
        const refill = (elapsed / this.cfg.refillIntervalMs) * this.cfg.capacity;
        bucket.tokens = Math.min(this.cfg.capacity, bucket.tokens + refill);
        bucket.lastRefillMs = now;
      }
    }
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true };
    }
    // How long until we have `cost` tokens?
    const missing = cost - bucket.tokens;
    const retryAfterMs = Math.ceil((missing / this.cfg.capacity) * this.cfg.refillIntervalMs);
    return { allowed: false, retryAfterMs };
  }

  /** Discard bucket state for a workspace. Used in tests. */
  reset(workspaceId?: string): void {
    if (workspaceId) this.buckets.delete(workspaceId);
    else this.buckets.clear();
  }
}

export const toolRateLimiter = new RateLimiter();
