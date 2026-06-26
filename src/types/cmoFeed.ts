/**
 * CMO Feed — canonical DTO types (schema only, no logic).
 *
 * Phase 1 deliverable: structural contract for deduplicated feed items.
 * Implementation (dedupe, truncation, generator cleanup) is deferred to Phase 2–3.
 *
 * @see CMO_FEED_ARCHITECTURE.md
 */

/** Maps to brain decision surface + pattern; used in dedupeKey composite. */
export type CmoInsightType =
  | 'EMERGENCY_PAUSE'
  | 'PAUSE_CAMPAIGN'
  | 'REFRESH_CREATIVE'
  | 'RESCUE_WATCH'
  | 'SCALE_BUDGET'
  | 'KEEP_COLLECTING'
  | 'HOLD_AND_MONITOR'
  | string; // patternSignature or future typed extensions

export type CmoFeedSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL';

/** Single deduplicated feed card served to the dashboard. */
export interface CmoFeedItemDTO {
  /** Stable id — snapshot cuid today; dedicated row id when cmo_feed_items exists. */
  id: string;
  campaignId: string;
  campaignName: string;
  /** Semantic category for dedupe + filtering (typically decision.action or action:pattern). */
  insightType: CmoInsightType;
  /** UTC calendar day (YYYY-MM-DD) aligned with CampaignBrainSnapshot.tickDate. */
  date: string;
  /** Arabic headline; max 150 chars enforced at DTO assembly layer. */
  title: string;
  /** Arabic body preview; max 150 chars enforced at DTO assembly layer. */
  body: string;
  severity: CmoFeedSeverity;
  /** Composite key: `${campaignId}:${insightType}:${date}` — unique per workspace per day. */
  dedupeKey: string;
  /** ISO timestamp when narration was last generated; null if pending. */
  generatedAt: string | null;
  /** Optional creative directive (separate from body budget). */
  creativeDirective?: string;
  /** Full body when truncated for preview; omitted when body fits within limit. */
  bodyFull?: string;
}

/** API payload for CMO Feed section (embedded in DashboardDTO or standalone endpoint). */
export interface CmoFeedDTO {
  items: CmoFeedItemDTO[];
  /** Count after dedupe; may differ from raw snapshot count. */
  total: number;
  /** Window label for UI meta, e.g. "today" | "last 7 days". */
  window: 'today' | 'rolling';
  /** Max chars applied to title/body at assembly (default 150). */
  maxPreviewChars: 150;
  truncated: boolean;
}

/** Feed-level metadata paired with `cmoFeedV2` items on DashboardDTO.brain. */
export interface CmoFeedMeta {
  /** Count after dedupe (before limit slice). */
  total: number;
  window: 'today' | 'rolling';
  maxPreviewChars: 150;
  /** True when any returned item required title/body truncation. */
  truncated: boolean;
}

/** Optional Prisma row shape — not migrated until Phase 2+. */
export interface CmoFeedItemRecord {
  id: string;
  workspaceId: string;
  campaignId: string;
  insightType: string;
  date: Date;
  title: string;
  body: string;
  severity: string;
  dedupeKey: string;
  snapshotId: string | null;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
