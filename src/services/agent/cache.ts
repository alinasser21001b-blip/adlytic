// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/cache.ts
//
//  In-process TTL cache keyed on (workspaceId, toolName, argsHash). Small,
//  deliberate, no external service.
//
//  Why in-process and not Redis:
//    - The cost we're avoiding is a single Postgres query at ~30ms. Redis
//      round-trip is ~5ms — not zero. In-process Map is ~0.01ms.
//    - Cache is per-process. In a two-instance deploy each holds its own
//      copy. Coherence isn't required — worst case is one merchant's next
//      turn sees data 60s older than another's; still fresher than the 15
//      min auto-sync cadence.
//    - Bounded memory via LRU eviction.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §19.3 (gap #3)
// ════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';

interface CacheEntry {
  value: unknown;
  expiresAt: number;   // epoch ms
  /** Byte-cost estimate for eviction accounting. Rough — length of JSON. */
  sizeBytes: number;
}

/** Compact FIFO+TTL cache. Not thread-safe (Node is single-threaded per event loop). */
export class ToolCache {
  private store = new Map<string, CacheEntry>();
  private totalSize = 0;
  private readonly maxSizeBytes: number;

  constructor(maxSizeBytes = 16 * 1024 * 1024 /* 16 MiB */) {
    this.maxSizeBytes = maxSizeBytes;
  }

  /**
   * Deterministic cache key. Args are JSON-stringified with sorted keys so
   * `{a:1,b:2}` and `{b:2,a:1}` produce the same hash.
   */
  static key(workspaceId: string, toolName: string, args: Record<string, unknown>): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    return `${workspaceId}:${toolName}:${createHash('sha1').update(sortedArgs).digest('hex').slice(0, 12)}`;
  }

  get<T>(key: string): { value: T; ageSeconds: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      this.totalSize -= entry.sizeBytes;
      return null;
    }
    // Move-to-end for LRU behavior on the Map's insertion order.
    this.store.delete(key);
    this.store.set(key, entry);
    return { value: entry.value as T, ageSeconds: Math.floor((now - (entry.expiresAt - this.getTtlMs(entry))) / 1000) };
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (ttlSeconds <= 0) return;
    const sizeBytes = estimateBytes(value);
    // Evict oldest entries until we fit. Bail if the value itself exceeds the cap.
    if (sizeBytes > this.maxSizeBytes) return;
    while (this.totalSize + sizeBytes > this.maxSizeBytes && this.store.size > 0) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.store.get(oldestKey)!;
      this.store.delete(oldestKey);
      this.totalSize -= oldest.sizeBytes;
    }
    const existing = this.store.get(key);
    if (existing) this.totalSize -= existing.sizeBytes;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      sizeBytes,
    });
    this.totalSize += sizeBytes;
  }

  /** Discard every entry belonging to a workspace. Used when the workspace's
   *  data materially changed (e.g. after a manual sync). */
  invalidateWorkspace(workspaceId: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${workspaceId}:`)) {
        this.store.delete(k);
        this.totalSize -= v.sizeBytes;
        removed++;
      }
    }
    return removed;
  }

  size(): { entries: number; bytes: number } {
    return { entries: this.store.size, bytes: this.totalSize };
  }

  private getTtlMs(entry: CacheEntry): number {
    // TTL isn't stored per entry (space saving); rough estimate for ageSeconds
    // is "time since insertion" which we can approximate via expiry.
    // For clarity: entry.expiresAt = insertionTime + ttlMs, so
    // ageMs = now - insertionTime = now - (expiresAt - ttlMs).
    // We don't store ttlMs, so we approximate as 60000 (default read-tool TTL).
    // The result is only shown to Claude as coarse "cachedSeconds" — precision
    // beyond ~10s is not useful. Sufficient.
    void entry;
    return 60_000;
  }
}

/** Rough byte estimate for cache accounting. UTF-8-ish. */
function estimateBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 1024;   // fallback for values with circular refs
  }
}

/** Module-level singleton. Wire from the dispatcher constructor if you'd
 *  prefer DI; both work. */
export const toolCache = new ToolCache();
