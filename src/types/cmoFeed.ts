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
  /**
   * Brain's raw decision-engine action code for this item (identical value to
   * `insightType` today — exposed under its own name so a consumer doesn't have
   * to know `insightType` doubles as the action code). Present on every item
   * once the item has passed the authority guard below.
   */
  actionCode?: string;
  /**
   * Whether `hierarchy.ts::permitAction()` allows this action against the
   * campaign's OWN canonical reconciled intelligence (funnel diagnosis +
   * forbiddenActions) — the same guard already enforced on the campaign-
   * inspector timeline and on priorityAction/GET .../recommendations. `true`
   * when the canonical state can't be resolved for this campaign (no
   * measurable window / insufficient data): absence of a contrary diagnosis
   * is not proof of contradiction, so the item is not penalized for it.
   * A forbidden (`false`) item is filtered out before this DTO reaches
   * `getDashboard()`'s caller — it never appears in `cmoFeedV2` — so any
   * item actually present here already has `permitted !== false`.
   */
  permitted?: boolean;
  /**
   * Whether permitAction() has JURISDICTION over this item's action code.
   *
   * `permitAction` is a veto whose domain is exactly PERMIT_ACTION_DOMAIN
   * (hierarchy.ts). Outside it the guard returns allowed:true for ANY string —
   * it would say allowed:true for "BANANA" — so `permitted: true` on such a
   * code asserts a check that structurally could not have happened. The feed's
   * BEHAVIOUR was always right (nothing that should drop was kept); only the
   * label overclaimed. This field separates the two.
   */
  authorityRelation?: 'GOVERNED' | 'NOT_GOVERNED';
  /** Why `permitted` is false — human-readable, from permitAction()'s own reason. Null when permitted or unresolved. */
  permittedReason?: string | null;
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
