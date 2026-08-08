// ════════════════════════════════════════════════════════════════════════
//  src/analytics/actionSemantics.ts — THE CANONICAL META ACTION RESOLVER
//
//  Meta's `actions` array does NOT contain a list of independent events. It
//  contains the SAME business event described at several granularities, plus
//  genuinely different events, all flattened into one array with no marker
//  distinguishing the two cases.
//
//  Summing such an array is therefore never safe by default. Adlytic learned
//  this in production twice:
//
//    · messages — summing `messaging_conversation_started_7d` with
//      `messaging_first_reply` reported 163 where Ads Manager said 87
//    · landing page views — `omni_landing_page_view` includes
//      `landing_page_view`; summing them doubles the count
//
//  purchases, leads and REVENUE still had the same defect. This module fixes
//  the whole class rather than the individual instances.
//
//  ── The resolution rule ────────────────────────────────────────────────
//
//    PREFER  → the canonical representation, first present wins
//    FALLBACK→ the next representation down the preference list
//    NEVER   → sum two representations of the same business event
//
//  ── Why preference order, not arithmetic ───────────────────────────────
//  Meta publishes no authoritative containment lattice for action types, so
//  "subtract the overlap" would be guesswork dressed as precision. The
//  standard we can actually verify is PARITY WITH ADS MANAGER: the client
//  compares our number against the one Meta shows them, and the canonical
//  type is the one Meta itself reports. That is the same standard that fixed
//  the message count, and it is the standard applied here.
//
//  ── Counts and values must agree ───────────────────────────────────────
//  Revenue is resolved against the SAME action_type that won the count, so
//  ROAS can never divide an omni-scoped value by a pixel-scoped count. A
//  correct purchase count with a mismatched revenue figure is still a broken
//  analytics system.
// ════════════════════════════════════════════════════════════════════════

/** How a member of a family relates to the others. Documentation + intent. */
export type OverlapBehavior =
  | 'CANONICAL'        // what Ads Manager reports for this event
  | 'UMBRELLA'         // aggregates the canonical plus other channels
  | 'CHANNEL_SPECIFIC' // one source of the same event (pixel, app, offline)
  | 'ALIAS'            // legacy/duplicate naming of the same event
  | 'DIFFERENT_STAGE'; // a different funnel stage — must never be counted here

export interface ActionTypeDef {
  actionType: string;
  behavior: OverlapBehavior;
  /** Why it sits at this rank — read this before reordering anything. */
  note: string;
}

export interface ActionFamilyDef {
  familyKey: string;
  /** The business event, named in the merchant's world. */
  businessEvent: string;
  /**
   * Preference order. FIRST PRESENT WINS — never summed.
   * Ordered so the winner matches what Meta Ads Manager reports.
   */
  preference: readonly ActionTypeDef[];
  /**
   * Types that look related but describe a DIFFERENT event. Listed explicitly
   * so a future reader knows they were considered and rejected, not missed.
   */
  excluded: readonly ActionTypeDef[];
  aggregationRule: 'PICK_FIRST_PRESENT';
  /** Whether the resolved number is a direct count or a proxy. */
  approximate: boolean;
}

// ── The families ────────────────────────────────────────────────────────

export const ACTION_FAMILIES: Record<string, ActionFamilyDef> = {
  messages: {
    familyKey: 'messages',
    businessEvent: 'A person started a conversation with the business',
    preference: [
      {
        actionType: 'onsite_conversion.messaging_conversation_started_7d',
        behavior: 'CANONICAL',
        note: 'Ads Manager\'s "Messaging conversations started" — the number the client sees.',
      },
      {
        actionType: 'messaging_conversation_started',
        behavior: 'ALIAS',
        note: 'Legacy naming of the same event; only reachable on older rows.',
      },
      {
        actionType: 'onsite_conversion.total_messaging_connection',
        behavior: 'UMBRELLA',
        note: 'Newer "Messaging connections" — includes started conversations. Fallback only: summing it with the canonical double-counts, since a connection contains the start.',
      },
    ],
    excluded: [
      {
        actionType: 'onsite_conversion.messaging_first_reply',
        behavior: 'DIFFERENT_STAGE',
        note: 'A reply INSIDE an existing conversation — a later funnel stage, not another conversation. Summing it produced 163 vs Ads Manager\'s 87 in production.',
      },
      {
        actionType: 'onsite_conversion.messaging_block',
        behavior: 'DIFFERENT_STAGE',
        note: 'A negative outcome, not a conversation start.',
      },
    ],
    aggregationRule: 'PICK_FIRST_PRESENT',
    approximate: false,
  },

  purchases: {
    familyKey: 'purchases',
    businessEvent: 'A completed purchase attributed to the ad',
    preference: [
      {
        actionType: 'purchase',
        behavior: 'CANONICAL',
        note: 'Meta\'s standard purchase event and what Ads Manager reports as "Purchases". Preferred so our count matches the client\'s screen.',
      },
      {
        actionType: 'offsite_conversion.fb_pixel_purchase',
        behavior: 'CHANNEL_SPECIFIC',
        note: 'The website/pixel-tracked purchase specifically. A subset of `purchase` — fallback only, for accounts where only the pixel breakdown is returned.',
      },
      {
        actionType: 'omni_purchase',
        behavior: 'UMBRELLA',
        note: 'Omnichannel roll-up (web + app + offline + in-store). SUPERSET of `purchase`. Last resort: it is the broadest and least comparable to Ads Manager\'s default column, but better than reporting nothing when it is the only representation present.',
      },
    ],
    excluded: [
      {
        actionType: 'initiate_checkout',
        behavior: 'DIFFERENT_STAGE',
        note: 'Checkout started, not completed — an earlier funnel stage.',
      },
      {
        actionType: 'add_to_cart',
        behavior: 'DIFFERENT_STAGE',
        note: 'Earlier funnel stage.',
      },
      {
        actionType: 'purchase_roas',
        behavior: 'DIFFERENT_STAGE',
        note: 'A ratio, not an event count. Resolved separately.',
      },
    ],
    aggregationRule: 'PICK_FIRST_PRESENT',
    approximate: false,
  },

  leads: {
    familyKey: 'leads',
    businessEvent: 'A person submitted their contact details',
    preference: [
      {
        actionType: 'lead',
        behavior: 'CANONICAL',
        note: 'Meta\'s standard lead event and Ads Manager\'s "Leads" column. Covers instant forms and pixel leads together.',
      },
      {
        actionType: 'onsite_conversion.lead_grouped',
        behavior: 'UMBRELLA',
        note: 'Meta\'s grouped on-site lead metric. Fallback when `lead` is absent.',
      },
      {
        actionType: 'leadgen.other',
        behavior: 'CHANNEL_SPECIFIC',
        note: 'Instant-form (lead ad) submissions specifically. A subset of `lead` — fallback only.',
      },
      {
        actionType: 'offsite_conversion.fb_pixel_lead',
        behavior: 'CHANNEL_SPECIFIC',
        note: 'Website/pixel lead specifically. Also a subset of `lead` — fallback only.',
      },
    ],
    excluded: [
      {
        actionType: 'complete_registration',
        behavior: 'DIFFERENT_STAGE',
        note: 'Account registration is a distinct business event; it has its own family below and must not inflate lead counts.',
      },
    ],
    aggregationRule: 'PICK_FIRST_PRESENT',
    approximate: false,
  },

  landing_page_views: {
    familyKey: 'landing_page_views',
    businessEvent: 'A person actually arrived at the destination page',
    preference: [
      {
        actionType: 'landing_page_view',
        behavior: 'CANONICAL',
        note: 'Ads Manager\'s "Landing page views".',
      },
      {
        actionType: 'omni_landing_page_view',
        behavior: 'UMBRELLA',
        note: 'Omnichannel roll-up that INCLUDES landing_page_view. Fallback only — summing the two doubles the count.',
      },
    ],
    excluded: [
      {
        actionType: 'link_click',
        behavior: 'DIFFERENT_STAGE',
        note: 'The click, not the arrival. The GAP between them is the entire diagnostic value of the traffic funnel — see analytics/funnel.',
      },
    ],
    aggregationRule: 'PICK_FIRST_PRESENT',
    approximate: false,
  },

  registrations: {
    familyKey: 'registrations',
    businessEvent: 'A person completed a sign-up / registration',
    preference: [
      {
        actionType: 'complete_registration',
        behavior: 'CANONICAL',
        note: 'Meta\'s standard registration event.',
      },
      {
        actionType: 'offsite_conversion.fb_pixel_complete_registration',
        behavior: 'CHANNEL_SPECIFIC',
        note: 'Pixel-specific registration; subset of the canonical.',
      },
      {
        actionType: 'omni_complete_registration',
        behavior: 'UMBRELLA',
        note: 'Omnichannel roll-up; superset. Last resort.',
      },
    ],
    excluded: [],
    aggregationRule: 'PICK_FIRST_PRESENT',
    // Not currently persisted to DailyStat — defined so any future consumer
    // inherits the resolver instead of writing another sum.
    approximate: false,
  },

  app_installs: {
    familyKey: 'app_installs',
    businessEvent: 'A person installed the advertised app',
    preference: [
      {
        actionType: 'mobile_app_install',
        behavior: 'CANONICAL',
        note: 'Ads Manager\'s "App installs".',
      },
      {
        actionType: 'app_install',
        behavior: 'ALIAS',
        note: 'Alternate naming of the same event.',
      },
      {
        actionType: 'omni_app_install',
        behavior: 'UMBRELLA',
        note: 'Omnichannel roll-up; superset. Last resort.',
      },
    ],
    excluded: [],
    aggregationRule: 'PICK_FIRST_PRESENT',
    // NOTE: the app funnel currently approximates installs from all-clicks
    // because no account in production returns these action types yet. When
    // one does, this family replaces the proxy and `approximate` drops to
    // false at the funnel-definition level too.
    approximate: false,
  },
};

// ── Resolution ──────────────────────────────────────────────────────────

export interface ActionRow {
  action_type?: string;
  value?: string | number;
}

export interface ResolvedAction {
  /** The resolved count/value. 0 when the family is absent entirely. */
  value: number;
  /** Which action_type won, or null when none were present. */
  matchedType: string | null;
  /** Rank of the winner in the preference list (0 = canonical). */
  rank: number | null;
  /**
   * Every family member that WAS present. Length > 1 proves overlapping
   * representations arrived together — the case that used to double-count.
   */
  candidatesPresent: string[];
  /** True when a non-canonical representation had to be used. */
  usedFallback: boolean;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve ONE business event from a Meta actions array.
 *
 * Walks the preference list and returns the first present representation.
 * Never sums two representations of the same event.
 */
export function resolveAction(
  actions: ActionRow[] | null | undefined,
  family: ActionFamilyDef,
): ResolvedAction {
  const rows = Array.isArray(actions) ? actions : [];
  const present = new Set<string>();
  for (const a of rows) {
    if (a?.action_type) present.add(a.action_type);
  }

  const candidatesPresent = family.preference
    .map((p) => p.actionType)
    .filter((t) => present.has(t));

  for (let rank = 0; rank < family.preference.length; rank++) {
    const wanted = family.preference[rank]!.actionType;
    for (const a of rows) {
      if (a?.action_type === wanted) {
        const n = num(a.value);
        if (Number.isFinite(n) && n >= 0) {
          return {
            value: n,
            matchedType: wanted,
            rank,
            candidatesPresent,
            usedFallback: rank > 0,
          };
        }
      }
    }
  }

  return { value: 0, matchedType: null, rank: null, candidatesPresent, usedFallback: false };
}

/** Integer count for a family (rounds; counts are whole events). */
export function resolveActionCount(
  actions: ActionRow[] | null | undefined,
  family: ActionFamilyDef,
): ResolvedAction {
  const r = resolveAction(actions, family);
  return { ...r, value: Math.round(r.value) };
}

/**
 * Resolve a monetary value (action_values) for the SAME representation that
 * won the count.
 *
 * This pairing is the point: resolving value independently could match
 * `omni_purchase` while the count matched `purchase`, producing a ROAS that
 * divides omnichannel revenue by website orders. Count and value must
 * describe the same event at the same scope, or neither is trustworthy.
 *
 * Falls back down the preference list only if the count's winning type has no
 * corresponding value row.
 */
export function resolveActionValuePairedTo(
  actionValues: ActionRow[] | null | undefined,
  family: ActionFamilyDef,
  countMatchedType: string | null,
): ResolvedAction & { pairedWithCount: boolean } {
  const rows = Array.isArray(actionValues) ? actionValues : [];

  if (countMatchedType) {
    for (const a of rows) {
      if (a?.action_type === countMatchedType) {
        const n = num(a.value);
        if (Number.isFinite(n) && n >= 0) {
          const rank = family.preference.findIndex((p) => p.actionType === countMatchedType);
          return {
            value: n,
            matchedType: countMatchedType,
            rank: rank >= 0 ? rank : null,
            candidatesPresent: family.preference
              .map((p) => p.actionType)
              .filter((t) => rows.some((r) => r.action_type === t)),
            usedFallback: rank > 0,
            pairedWithCount: true,
          };
        }
      }
    }
  }

  const fallback = resolveAction(rows, family);
  return { ...fallback, pairedWithCount: false };
}

/** Every family — for audit tables and invariant tests. */
export function allActionFamilies(): ActionFamilyDef[] {
  return Object.values(ACTION_FAMILIES);
}
