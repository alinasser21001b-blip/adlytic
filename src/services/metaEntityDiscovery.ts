// ════════════════════════════════════════════════════════════════════════
//  src/services/metaEntityDiscovery.ts
//
//  FINDING A SUBJECT TO PROBE — a different problem from measuring one.
//
//  Round 1 and Round 2 of the capability probe both reported "ad set probed:
//  none found, ad probed: none found", and neither run recorded a single
//  reason. The discovery helper they used was four lines long and threw away
//  everything that would have explained the result:
//
//      if (!res.ok) return undefined;              // status discarded
//      return j.data?.[0]?.id;                     // empty vs refused: same
//
//  So six capabilities came back NOT_TESTED with no way to tell whether the
//  account has no ad sets, whether Meta refused the edge, or whether the
//  request was simply asked wrongly. That is not a weak finding, it is an
//  absent one.
//
//  THE SEPARATION THIS MODULE ENFORCES
//  Discovery asks "does a readable object exist?". Insights asks "what did it
//  do in a window?". Those are different questions and the second one's
//  parameters must never leak into the first: no time_range, no level, no
//  date_preset, no action or attribution config. An entity that delivered
//  nothing on the probe's one-day window still EXISTS, and a discovery step
//  that inherited that window would report it as absent — manufacturing a
//  NOT_TESTED out of a quiet Tuesday.
//
//  WHAT CHANGED, AND WHY EACH CHANGE IS A HYPOTHESIS, NOT A TWEAK
//
//  1. Account-level edges, unconditionally.
//     The old chain was campaign → adsets → ads, seeded from ONE campaign
//     (`limit=1`). If that campaign had no ad sets, discovery truncated and
//     took six candidates with it. `/act_X/adsets` spans every campaign, so
//     the first campaign's contents stop being load-bearing. This also makes
//     the call count deterministic, which matters more than it sounds: a
//     fixed cost is what lets the total call count identify which build ran.
//
//  2. `summary=total_count` on every edge.
//     This answers ACCOUNT_ADSET_COUNT directly instead of inferring it from
//     whether a page happened to be non-empty. An edge that returns no rows
//     while reporting a non-zero total is a REQUEST defect, and until now
//     that state was indistinguishable from an empty account.
//
//  3. `limit=25`, not `limit=1`.
//     The Graph API can apply visibility filtering AFTER the page boundary,
//     so a one-item page can come back empty while `paging.next` points at
//     more data. At limit=1 that failure is most likely and least visible.
//
//  4. Every non-2xx is recorded with status, code and subcode.
//     "Refused" and "empty" are opposite findings with opposite fixes.
//
//  READ-ONLY. GET only, and no parameter here can mutate anything.
// ════════════════════════════════════════════════════════════════════════
import { redact } from './metaCapabilityProbe';

export type DiscoveryLevel = 'campaign' | 'adset' | 'ad';

/**
 * Which endpoint shape was asked. Named as a CLASS rather than a URL so a
 * trace can be compared between runs without diffing account ids.
 */
export type DiscoveryEndpointClass =
  | 'ACCOUNT_CAMPAIGNS'
  | 'ACCOUNT_ADSETS'
  | 'ACCOUNT_ADS'
  | 'ACCOUNT_CAMPAIGNS_ALL_STATUSES'
  | 'ACCOUNT_ADSETS_ALL_STATUSES'
  | 'ACCOUNT_ADS_ALL_STATUSES'
  | 'CAMPAIGN_ADSETS'
  | 'ADSET_ADS';

/**
 * A discovery step that came back "empty" is only informative once you know
 * WHICH kind of empty it was. These are the kinds worth separating.
 */
export type DiscoveryAnomaly =
  /** data:[] but paging.next exists — the page was cut before any visible row. */
  | 'EMPTY_WITH_NEXT_PAGE'
  /** data:[] but summary.total_count > 0 — the edge has objects we did not get. */
  | 'EMPTY_WITH_NONZERO_TOTAL'
  /** Meta refused. Says nothing about whether the objects exist. */
  | 'REFUSED'
  /** We asked for a total and Meta did not send one — the count is unproven. */
  | 'NO_SUMMARY'
  /** Never asked: the call budget ran out first. Not a finding about Meta. */
  | 'NOT_ASKED_BUDGET';

export interface DiscoveryStep {
  step: number;
  endpointClass: DiscoveryEndpointClass;
  level: DiscoveryLevel;
  path: string;
  /** Exactly what was sent. Token-free by construction — it rides in a header. */
  params: Record<string, string>;
  status: number | null;
  ok: boolean;
  metaCode: number | null;
  metaSubcode: number | null;
  /** Meta's message, truncated and redacted. */
  detail: string | null;
  /** Rows in `data[]`. null when the call never completed. */
  returned: number | null;
  /** `summary.total_count`, when Meta returned one. null is UNPROVEN, not 0. */
  totalCount: number | null;
  hasNextPage: boolean;
  pickedId: string | null;
  /** Why the picked id was preferred, when it was not simply the first row. */
  pickedReason: string | null;
  anomalies: DiscoveryAnomaly[];
  elapsedMs: number;
}

export interface AccountEntityCounts {
  /**
   * `null` means UNPROVEN — Meta returned no summary, or the call was refused
   * or never made. It does NOT mean zero, and no consumer may round it to
   * zero: "the account has no ad sets" and "we failed to count them" lead to
   * opposite conclusions about whether the probe result is trustworthy.
   */
  campaigns: number | null;
  adsets: number | null;
  ads: number | null;
}

export interface DiscoveryOutcome {
  entityIds: { campaign?: string; adset?: string; ad?: string };
  counts: AccountEntityCounts;
  steps: DiscoveryStep[];
  callsSpent: number;
}

/** The minimum discovery needs. Mirrors ProbeTransport deliberately. */
export type DiscoveryGet = (
  path: string,
  params: Record<string, string>,
) => Promise<{ status: number; body: unknown }>;

/**
 * Statuses valid at all three object levels. The Graph API's default edge
 * listing quietly excludes ARCHIVED and DELETED objects, so an account whose
 * ad sets are all archived reports an empty edge — true for the default
 * filter, misleading as an answer to "does an ad set exist?".
 *
 * Restricted to the subset every level accepts. A level-specific value would
 * turn this rung into a 400, and a fallback that fails for its own reasons
 * teaches nothing about the hypothesis it was meant to test.
 */
const ALL_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'IN_PROCESS', 'WITH_ISSUES'];

/** Page size. See note 3 in the header — 1 is the worst possible choice here. */
const PAGE = '25';

/**
 * Discovery parameters, and nothing else.
 *
 * Note what is absent: no `time_range`, no `level`, no `date_preset`, no
 * `action_breakdowns`, no attribution parameters. That absence is the
 * contract, and `test_probe_discovery.ts` fails the build if any of them
 * appears here.
 */
function discoveryParams(allStatuses: boolean): Record<string, string> {
  const p: Record<string, string> = {
    fields: 'id,effective_status',
    limit: PAGE,
    summary: 'total_count',
  };
  if (allStatuses) p.effective_status = JSON.stringify(ALL_STATUSES);
  return p;
}

interface EdgeRow { id?: string; effective_status?: string }

/**
 * Prefer a live object over an archived one.
 *
 * A probe wants the most READABLE subject available, and an archived ad set
 * can legitimately refuse insights that a live one would return — picking one
 * would produce a capability verdict about the object's lifecycle rather than
 * about the capability. When only archived objects exist we still take one and
 * say so, because testing against an archived object beats testing against
 * nothing at all.
 */
function pick(rows: EdgeRow[]): { id: string; reason: string | null } | null {
  const withId = rows.filter((r): r is EdgeRow & { id: string } => typeof r.id === 'string' && r.id.length > 0);
  if (withId.length === 0) return null;
  const dormant = new Set(['ARCHIVED', 'DELETED']);
  const live = withId.find((r) => !r.effective_status || !dormant.has(r.effective_status));
  if (live) {
    return {
      id: live.id,
      reason: live === withId[0] ? null : `first row was ${withId[0]?.effective_status ?? 'unknown'}; picked a live object instead`,
    };
  }
  return { id: withId[0]!.id, reason: 'every returned object is archived or deleted — probing against a dormant object' };
}

function metaError(body: unknown): { code: number | null; subcode: number | null; detail: string | null } {
  const err = (body as { error?: Record<string, unknown> } | null)?.error ?? null;
  const raw = [err?.message, err?.error_user_msg].filter((x) => typeof x === 'string').join(' | ');
  return {
    code: typeof err?.code === 'number' ? err.code : null,
    subcode: typeof err?.error_subcode === 'number' ? err.error_subcode : null,
    detail: raw ? redact(raw) : null,
  };
}

/** One recorded discovery call. Never throws for a Meta-side failure. */
async function askEdge(
  get: DiscoveryGet,
  step: number,
  endpointClass: DiscoveryEndpointClass,
  level: DiscoveryLevel,
  path: string,
  allStatuses: boolean,
): Promise<DiscoveryStep> {
  const params = discoveryParams(allStatuses);
  const t0 = Date.now();
  const row: DiscoveryStep = {
    step, endpointClass, level, path, params,
    status: null, ok: false, metaCode: null, metaSubcode: null, detail: null,
    returned: null, totalCount: null, hasNextPage: false,
    pickedId: null, pickedReason: null, anomalies: [], elapsedMs: 0,
  };

  let status: number;
  let body: unknown;
  try {
    ({ status, body } = await get(path, params));
  } catch (e) {
    // A transport rejection is a host/network fact, not a Meta verdict.
    row.elapsedMs = Date.now() - t0;
    row.detail = redact(e instanceof Error ? e.message : String(e));
    row.anomalies.push('REFUSED');
    return row;
  }
  row.elapsedMs = Date.now() - t0;
  row.status = status;
  row.ok = status >= 200 && status < 300;

  if (!row.ok) {
    const e = metaError(body);
    row.metaCode = e.code;
    row.metaSubcode = e.subcode;
    row.detail = e.detail;
    row.anomalies.push('REFUSED');
    return row;
  }

  const env = (body ?? {}) as {
    data?: unknown[];
    paging?: { next?: string };
    summary?: { total_count?: number };
  };
  const rows = Array.isArray(env.data) ? (env.data as EdgeRow[]) : [];
  row.returned = rows.length;
  row.hasNextPage = typeof env.paging?.next === 'string' && env.paging.next.length > 0;
  row.totalCount = typeof env.summary?.total_count === 'number' ? env.summary.total_count : null;

  const chosen = pick(rows);
  if (chosen) {
    row.pickedId = chosen.id;
    row.pickedReason = chosen.reason;
  }

  if (row.totalCount === null) row.anomalies.push('NO_SUMMARY');
  if (rows.length === 0 && row.hasNextPage) row.anomalies.push('EMPTY_WITH_NEXT_PAGE');
  if (rows.length === 0 && (row.totalCount ?? 0) > 0) row.anomalies.push('EMPTY_WITH_NONZERO_TOTAL');

  return row;
}

/**
 * Find one campaign, one ad set and one ad on the account.
 *
 * Cost: exactly 3 calls when all three edges answer, plus at most one extra
 * per level when an edge comes back empty or refused. The base cost being
 * FIXED is deliberate — it makes the run's total call count a signature that
 * identifies which discovery implementation executed.
 */
export async function discoverProbeEntities(
  get: DiscoveryGet,
  account: string,
  budget: { left: number },
): Promise<DiscoveryOutcome> {
  const steps: DiscoveryStep[] = [];
  const spentAtStart = budget.left;
  let n = 0;

  const run = async (
    endpointClass: DiscoveryEndpointClass,
    level: DiscoveryLevel,
    path: string,
    allStatuses = false,
  ): Promise<DiscoveryStep> => {
    n += 1;
    if (budget.left <= 0) {
      const skipped: DiscoveryStep = {
        step: n, endpointClass, level, path, params: discoveryParams(allStatuses),
        status: null, ok: false, metaCode: null, metaSubcode: null,
        detail: 'call budget exhausted before this step — not a finding about Meta',
        returned: null, totalCount: null, hasNextPage: false,
        pickedId: null, pickedReason: null, anomalies: ['NOT_ASKED_BUDGET'], elapsedMs: 0,
      };
      steps.push(skipped);
      return skipped;
    }
    budget.left -= 1;
    const s = await askEdge(get, n, endpointClass, level, path, allStatuses);
    steps.push(s);
    return s;
  };

  const counts: AccountEntityCounts = { campaigns: null, adsets: null, ads: null };
  const entityIds: { campaign?: string; adset?: string; ad?: string } = {};

  // ── The three account-level edges, always, in a fixed order ────────────
  const levels: {
    level: DiscoveryLevel;
    edge: string;
    base: DiscoveryEndpointClass;
    wide: DiscoveryEndpointClass;
    countKey: keyof AccountEntityCounts;
  }[] = [
    { level: 'campaign', edge: 'campaigns', base: 'ACCOUNT_CAMPAIGNS', wide: 'ACCOUNT_CAMPAIGNS_ALL_STATUSES', countKey: 'campaigns' },
    { level: 'adset', edge: 'adsets', base: 'ACCOUNT_ADSETS', wide: 'ACCOUNT_ADSETS_ALL_STATUSES', countKey: 'adsets' },
    { level: 'ad', edge: 'ads', base: 'ACCOUNT_ADS', wide: 'ACCOUNT_ADS_ALL_STATUSES', countKey: 'ads' },
  ];

  for (const L of levels) {
    const first = await run(L.base, L.level, `/${account}/${L.edge}`);
    if (first.totalCount !== null) counts[L.countKey] = first.totalCount;
    if (first.pickedId) {
      entityIds[L.level] = first.pickedId;
      continue;
    }

    // Nothing usable came back. Exactly one more call, and WHICH call depends
    // on why — an empty edge and a refused edge are different hypotheses.
    if (first.ok) {
      // Hypothesis: the default listing hides ARCHIVED/DELETED objects.
      const wide = await run(L.wide, L.level, `/${account}/${L.edge}`, true);
      if (wide.totalCount !== null && counts[L.countKey] === null) counts[L.countKey] = wide.totalCount;
      if (wide.pickedId) entityIds[L.level] = wide.pickedId;
    } else if (L.level === 'adset' && entityIds.campaign) {
      // Hypothesis: the ACCOUNT edge is refused while the nested edge is not.
      // Only worth asking when the account edge actually failed; when it
      // merely came back empty, the nested edge is a strict subset and would
      // spend a call to re-answer a question already answered.
      const nested = await run('CAMPAIGN_ADSETS', 'adset', `/${entityIds.campaign}/adsets`);
      if (nested.pickedId) entityIds.adset = nested.pickedId;
    } else if (L.level === 'ad' && entityIds.adset) {
      const nested = await run('ADSET_ADS', 'ad', `/${entityIds.adset}/ads`);
      if (nested.pickedId) entityIds.ad = nested.pickedId;
    }
  }

  return { entityIds, counts, steps, callsSpent: spentAtStart - budget.left };
}

/**
 * The one-paragraph reading of a trace, for the report and the console.
 *
 * Written so it can say "we do not know" — the previous version of this
 * output said "(none found)" for every unresolved level, which reads as a
 * fact about the account and was, on both runs so far, a fact about our
 * request instead.
 */
export function summariseDiscovery(d: DiscoveryOutcome): string[] {
  const out: string[] = [];
  for (const L of ['campaign', 'adset', 'ad'] as const) {
    const key = (L === 'campaign' ? 'campaigns' : L === 'adset' ? 'adsets' : 'ads') as keyof AccountEntityCounts;
    const id = d.entityIds[L];
    const count = d.counts[key];
    const mine = d.steps.filter((s) => s.level === L);
    if (id) {
      out.push(`${L}: found \`${id}\`${count !== null ? ` (account has ${count})` : ' (count UNPROVEN)'}`);
      continue;
    }
    const refused = mine.find((s) => s.anomalies.includes('REFUSED'));
    if (refused) {
      out.push(`${L}: NOT FOUND — Meta refused the edge (HTTP ${refused.status ?? 'no response'}`
        + `${refused.metaCode !== null ? `, code ${refused.metaCode}` : ''}). `
        + 'This is a statement about access, not about whether the objects exist.');
      continue;
    }
    const falseEmpty = mine.find((s) =>
      s.anomalies.includes('EMPTY_WITH_NEXT_PAGE') || s.anomalies.includes('EMPTY_WITH_NONZERO_TOTAL'));
    if (falseEmpty) {
      out.push(`${L}: NOT FOUND, but the edge reports objects exist `
        + `(total_count ${falseEmpty.totalCount ?? 'unknown'}, next page ${falseEmpty.hasNextPage ? 'present' : 'absent'}). `
        + 'This is OUR request failing, not an empty account.');
      continue;
    }
    if (count === 0) {
      out.push(`${L}: none exist — the account reports 0, across all statuses. `
        + 'Every candidate at this level is legitimately untestable.');
      continue;
    }
    out.push(`${L}: NOT FOUND and the count is UNPROVEN — Meta returned no total. `
      + 'Do not read this as an empty account.');
  }
  return out;
}
