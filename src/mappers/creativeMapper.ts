// ════════════════════════════════════════════════════════════════════════
//  src/mappers/creativeMapper.ts
//
//  Phase 5 cordon for the CREATIVE side of the Meta graph.
//
//  Meta returns ad-set / ad / creative blobs with field names that drift
//  every quarter (`object_story_spec.link_data.message` vs
//  `asset_feed_spec.bodies[0].text`, etc.). All that complexity ends here.
//  Callers receive normalized, platform-neutral shapes ready for upsert.
//
//  Same discipline as insightMapper.ts — Meta vocabulary is trapped in
//  this file. Engines and repositories are never exposed to it.
// ════════════════════════════════════════════════════════════════════════

import type { MetaInsightRow } from "../services/metaClient";

// ── NormalizedAdSet ─────────────────────────────────────────────────────
export interface NormalizedAdSet {
  externalAdSetId: string;
  name: string;
  status: string;                  // raw Meta string; status mapping happens in syncAccount
  dailyBudgetMinor: bigint | null;  // null when Meta doesn't expose one (e.g. campaign-budget-optimized)
  optimizationGoal: string | null;
  targeting: unknown;               // forensic blob — written into Json column verbatim
}

export function mapMetaAdSet(row: MetaInsightRow): NormalizedAdSet {
  const externalAdSetId = String(row['id'] ?? '');
  if (!externalAdSetId) throw new Error('Meta ad-set row missing id');

  const dailyBudgetRaw = row['daily_budget'];
  const dailyBudgetMinor =
    dailyBudgetRaw !== undefined && dailyBudgetRaw !== null && dailyBudgetRaw !== ''
      ? BigInt(String(dailyBudgetRaw))
      : null;

  return {
    externalAdSetId,
    name: String(row['name'] ?? '(unnamed)'),
    status: String(row['effective_status'] ?? row['status'] ?? ''),
    dailyBudgetMinor,
    optimizationGoal: row['optimization_goal'] != null ? String(row['optimization_goal']) : null,
    targeting: row['targeting'] ?? null,
  };
}

// ── NormalizedAd + NormalizedCreative ──────────────────────────────────
export interface NormalizedAd {
  externalAdId: string;
  name: string;
  status: string;
  /** The expanded creative, if Meta returned one inline. */
  creative: NormalizedCreative | null;
}

export interface NormalizedCreative {
  externalCreativeId: string;
  name: string | null;
  thumbnailUrl: string | null;
  imageHash: string | null;
  videoId: string | null;
  primaryText: string | null;     // body / message / asset_feed_spec.bodies[0]
  headline: string | null;        // title / asset_feed_spec.titles[0]
  description: string | null;     // link_data.description / asset_feed_spec.descriptions[0]
  callToActionType: string | null;
  /** Full Meta creative payload — kept as-is for forensic queries. */
  raw: unknown;
}

export function mapMetaAd(row: MetaInsightRow): NormalizedAd {
  const externalAdId = String(row['id'] ?? '');
  if (!externalAdId) throw new Error('Meta ad row missing id');

  const creativeRaw = row['creative'];
  const creative =
    creativeRaw && typeof creativeRaw === 'object'
      ? mapMetaCreative(creativeRaw as Record<string, unknown>)
      : null;

  return {
    externalAdId,
    name: String(row['name'] ?? '(unnamed)'),
    status: String(row['effective_status'] ?? row['status'] ?? ''),
    creative,
  };
}

/**
 * Extract the canonical copy from a creative blob. Meta has at least three
 * shapes here depending on creative type (single-image, asset-feed dynamic
 * creative, page-post boost), and any of them can be missing fields. We try
 * each shape in order of preference and stop at the first hit.
 */
export function mapMetaCreative(c: Record<string, unknown>): NormalizedCreative | null {
  const externalCreativeId = String(c['id'] ?? '');
  if (!externalCreativeId) return null;

  const oss = (c['object_story_spec'] as Record<string, unknown> | undefined) ?? undefined;
  const linkData = oss?.['link_data']  as Record<string, unknown> | undefined;
  const videoData = oss?.['video_data'] as Record<string, unknown> | undefined;
  const afs = (c['asset_feed_spec'] as Record<string, unknown> | undefined) ?? undefined;

  // Primary text — try (in order): top-level `body`, link_data.message,
  // video_data.message, first asset-feed body.
  const primaryText =
    firstString(c['body']) ??
    firstString(linkData?.['message']) ??
    firstString(videoData?.['message']) ??
    firstFromObjectArray(afs?.['bodies'], 'text');

  // Headline / title.
  const headline =
    firstString(c['title']) ??
    firstString(linkData?.['name']) ??
    firstFromObjectArray(afs?.['titles'], 'text');

  // Description (link sub-text).
  const description =
    firstString(linkData?.['description']) ??
    firstFromObjectArray(afs?.['descriptions'], 'text');

  // CTA button — at top-level or nested under link_data.call_to_action.type.
  const callToActionType =
    firstString(c['call_to_action_type']) ??
    firstString(
      (linkData?.['call_to_action'] as Record<string, unknown> | undefined)?.['type']
    );

  // Video id can be at top-level or under video_data.video_id.
  const videoId =
    firstString(c['video_id']) ??
    firstString(videoData?.['video_id']);

  return {
    externalCreativeId,
    name: firstString(c['name']),
    thumbnailUrl: firstString(c['thumbnail_url']),
    imageHash: firstString(c['image_hash']),
    videoId,
    primaryText,
    headline,
    description,
    callToActionType,
    raw: c,
  };
}

// ── primitives ──────────────────────────────────────────────────────────
function firstString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

/** Pull the first non-empty `key` field from an array of objects, defensively. */
function firstFromObjectArray(arr: unknown, key: string): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const v = (item as Record<string, unknown>)[key];
      const s = firstString(v);
      if (s) return s;
    }
  }
  return null;
}
