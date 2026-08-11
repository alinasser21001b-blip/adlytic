// ════════════════════════════════════════════════════════════════════════
//  src/services/metaCapabilityProbe.ts
//
//  WHY THIS EXISTS
//  Four different things get conflated when people talk about "what Meta
//  gives us":
//
//      DOCUMENTED  ⊃  SUPPORTED BY OUR API VERSION
//                  ⊃  ALLOWED BY OUR APP'S PERMISSIONS
//                  ⊃  ACTUALLY READABLE WITH THIS TOKEN, ON THIS ACCOUNT
//
//  Only the last one is a capability. A field in Meta's docs that this
//  token cannot read is not something Adlytic can build on, and a matrix
//  built from the documentation is a wish list, not evidence.
//
//  This module answers the last question empirically: it asks Meta for one
//  candidate at a time and classifies what comes back.
//
//  WHAT IT WILL NOT DO
//  Read-only. It issues GETs against the insights and object-read endpoints
//  only — never a POST, never a budget or status write. It honours the same
//  MetaClient pacing and usage tracking as production traffic, and it takes
//  a hard budget so a discovery run can never eat the account's quota (the
//  Marketing API access tier is gated on a <15% error rate, and a prober is
//  a machine for generating errors — that is its whole job, so it must be
//  small and deliberate).
//
//  It never logs a token, and it truncates Meta's error payload to the
//  fields needed to explain a failure.
// ════════════════════════════════════════════════════════════════════════

/** Why a candidate is or is not usable. Ordered roughly most→least actionable. */
export type ProbeVerdict =
  | 'AVAILABLE'            // returned data (or an empty-but-valid result set)
  | 'PERMISSION_REQUIRED'  // the app/token lacks a scope or role
  | 'OBJECT_REQUIRED'      // the object does not exist / is not visible to us
  | 'LEVEL_REQUIRED'       // valid field, wrong insights level
  | 'BREAKDOWN_CONFLICT'   // breakdown not combinable with this field/level
  | 'ACCOUNT_NOT_ELIGIBLE' // account/business lacks the feature
  | 'UNAVAILABLE'          // field unknown to this API version
  | 'DEPRECATED'           // removed in this or a newer version
  | 'RATE_LIMITED'         // hit a quota; says nothing about the capability
  | 'UNKNOWN';             // classified nothing — record and read by hand

/** One thing worth asking Meta about. */
export interface ProbeCandidate {
  /** Stable id used as the matrix row key. */
  id: string;
  /** insights | node — which shape of request to build. */
  kind: 'insights' | 'node';
  /** Which entity this must be asked of. */
  level?: 'account' | 'campaign' | 'adset' | 'ad';
  /** Fields to request. One candidate should isolate ONE unknown. */
  fields: string[];
  /** Breakdowns to request, when the candidate is about a breakdown. */
  breakdowns?: string[];
  /** Extra query params (e.g. action_breakdowns). */
  params?: Record<string, string>;
  /** Why this is worth an API call — recorded in the matrix. */
  rationale: string;
}

export interface ProbeResult {
  id: string;
  verdict: ProbeVerdict;
  /** HTTP status, when a response came back. */
  status: number | null;
  /** Meta's own error code / subcode, when present. */
  metaCode: number | null;
  metaSubcode: number | null;
  /** Meta's message, truncated. Never contains our token — see redact(). */
  detail: string | null;
  /** Which field names actually came back on the first row, when AVAILABLE. */
  returnedFields: string[] | null;
  /** True when the request succeeded but the result set was empty. An empty
   *  result is NOT proof the field is unavailable — the account may simply
   *  have no data in the window. Recorded so the matrix can say so. */
  emptyResult: boolean;
  probedAt: string;
}

/** Meta error codes, from the Marketing API error reference. */
const CODE_PERMISSION = new Set([10, 200, 272, 294]);
const CODE_RATE = new Set([4, 17, 32, 341, 613, 80000, 80004]);
const CODE_TOKEN = new Set([190, 102, 463, 467, 458, 459, 460]);
const CODE_DEPRECATED = new Set([2635]);

/**
 * Strip anything secret from a string before it is stored or logged.
 * Meta echoes the request URL in some error payloads, and that URL carries
 * access_token=. A capability matrix is a document people paste around.
 */
export function redact(s: string): string {
  return s
    .replace(/access_token=[^&\s"]+/gi, 'access_token=[redacted]')
    .replace(/\bEA[A-Za-z0-9_-]{20,}/g, '[redacted-token]')
    .slice(0, 400);
}

/**
 * Turn a Meta failure into a verdict.
 *
 * Deliberately conservative: anything not confidently recognised becomes
 * UNKNOWN rather than being forced into a bucket. A matrix row that says
 * UNKNOWN prompts a human to look; a row that guesses wrong gets believed.
 */
export function classifyProbeFailure(
  status: number,
  body: unknown,
): { verdict: ProbeVerdict; metaCode: number | null; metaSubcode: number | null; detail: string | null } {
  const err = (body as { error?: Record<string, unknown> } | null)?.error ?? null;
  const code = typeof err?.code === 'number' ? err.code : null;
  const subcode = typeof err?.error_subcode === 'number' ? err.error_subcode : null;
  const rawMsg = [err?.message, err?.error_user_msg].filter((x) => typeof x === 'string').join(' | ');
  const msg = rawMsg ? redact(rawMsg) : null;
  const lower = (rawMsg || '').toLowerCase();

  const out = (verdict: ProbeVerdict) => ({ verdict, metaCode: code, metaSubcode: subcode, detail: msg });

  // Quota first: a 429 tells us nothing about the capability itself, so it
  // must never be recorded as "unavailable" — that would bake a transient
  // condition into the matrix as a permanent fact.
  if (status === 429 || (code != null && CODE_RATE.has(code))) return out('RATE_LIMITED');

  // A dead token invalidates the whole run, not this candidate.
  if (code != null && CODE_TOKEN.has(code)) return out('UNKNOWN');

  if (code != null && CODE_DEPRECATED.has(code)) return out('DEPRECATED');
  if (code != null && CODE_PERMISSION.has(code)) return out('PERMISSION_REQUIRED');
  if (code != null && code >= 200 && code <= 299) return out('PERMISSION_REQUIRED');

  // Message-shape rules. Meta returns code 100 for almost every request
  // problem, so the message is the only discriminator — but it is prose and
  // Meta rewords it between versions, hence the conservative fallthrough.
  //
  // Permission wording is checked BEFORE the generic code-100 rule: Meta
  // returns "(#100) Requires permission to view this ad account" for an
  // access problem, and the generic rule would have filed that under
  // UNAVAILABLE — turning "ask for the scope" into "Meta does not offer it",
  // which is the difference between a fixable gap and an abandoned one.
  if (lower.includes('permission') || lower.includes('not authorized') || lower.includes('access denied')) {
    return out('PERMISSION_REQUIRED');
  }
  if (lower.includes('breakdown')) return out('BREAKDOWN_CONFLICT');
  if (lower.includes('level') && lower.includes('field')) return out('LEVEL_REQUIRED');
  if (subcode === 33 || lower.includes('does not exist') || lower.includes('unsupported get request')) {
    return out('OBJECT_REQUIRED');
  }
  if (lower.includes('not eligible') || lower.includes('not available for this ad account')) {
    return out('ACCOUNT_NOT_ELIGIBLE');
  }
  if (lower.includes('deprecated') || lower.includes('no longer supported')) return out('DEPRECATED');
  if (code === 100 && (lower.includes('param') || lower.includes('field') || lower.includes('invalid'))) {
    return out('UNAVAILABLE');
  }
  if (status >= 500) return out('UNKNOWN');

  return out('UNKNOWN');
}

/** The minimum a prober needs from a transport. MetaClient satisfies it. */
export interface ProbeTransport {
  /** Perform ONE read. Must resolve with status+body for BOTH success and
   *  failure — a transport that throws on 400 hides the very payload the
   *  classifier needs. */
  rawGet(path: string, params: Record<string, string>): Promise<{ status: number; body: unknown }>;
}

export interface ProbeRunOptions {
  /** act_<id> for account-level and node reads. */
  externalAccountId: string;
  /** A real campaign/adset/ad id, when the candidate needs that level. Absent
   *  ids make the candidate UNKNOWN rather than failing it — "we could not
   *  test this" is a different statement from "Meta refused". */
  entityIds?: Partial<Record<'campaign' | 'adset' | 'ad', string>>;
  /** Hard cap on requests for the whole run. */
  maxCalls?: number;
  /** Insight window, kept tiny: this asks whether a field is READABLE, not
   *  what it says. A 1-day window is the cheapest question that still
   *  returns a row shape. */
  since?: string;
  until?: string;
}

const DEFAULT_MAX_CALLS = 40;

/**
 * Run the candidates and return one row per candidate.
 *
 * Never throws for a candidate-level failure — a probe run that aborts on the
 * first refusal tells you about one field and nothing about the other thirty.
 */
export async function runCapabilityProbe(
  transport: ProbeTransport,
  candidates: ProbeCandidate[],
  opts: ProbeRunOptions,
): Promise<ProbeResult[]> {
  const max = opts.maxCalls ?? DEFAULT_MAX_CALLS;
  const day = opts.since ?? isoDaysAgo(2);
  const until = opts.until ?? isoDaysAgo(2);
  const results: ProbeResult[] = [];
  let calls = 0;

  for (const c of candidates) {
    const now = new Date().toISOString();

    if (calls >= max) {
      results.push(blank(c.id, 'UNKNOWN', `probe budget of ${max} calls exhausted before this candidate`, now));
      continue;
    }

    const target = resolveTarget(c, opts);
    if (!target) {
      results.push(blank(c.id, 'UNKNOWN', `no ${c.level} id available in this workspace to probe against`, now));
      continue;
    }

    const params: Record<string, string> = { fields: c.fields.join(',') };
    if (c.kind === 'insights') {
      params.level = c.level ?? 'account';
      params.time_range = JSON.stringify({ since: day, until });
      params.limit = '1';
      if (c.breakdowns?.length) params.breakdowns = c.breakdowns.join(',');
    }
    Object.assign(params, c.params ?? {});

    const path = c.kind === 'insights' ? `/${target}/insights` : `/${target}`;

    calls += 1;
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await transport.rawGet(path, params));
    } catch (e) {
      results.push(blank(c.id, 'UNKNOWN', redact(e instanceof Error ? e.message : String(e)), now));
      continue;
    }

    if (status >= 200 && status < 300) {
      const rows = extractRows(body);
      results.push({
        id: c.id,
        verdict: 'AVAILABLE',
        status,
        metaCode: null,
        metaSubcode: null,
        detail: null,
        // Which of the fields we asked for actually came back. Meta silently
        // omits fields it has no value for, so this is the difference between
        // "the field exists" and "the field exists AND this account has it".
        returnedFields: rows.length ? Object.keys(rows[0] as Record<string, unknown>) : [],
        emptyResult: rows.length === 0,
        probedAt: now,
      });
      continue;
    }

    const cls = classifyProbeFailure(status, body);
    results.push({
      id: c.id,
      verdict: cls.verdict,
      status,
      metaCode: cls.metaCode,
      metaSubcode: cls.metaSubcode,
      detail: cls.detail,
      returnedFields: null,
      emptyResult: false,
      probedAt: now,
    });

    // A quota refusal means every later candidate would be answered by the
    // quota rather than by Meta's opinion of the field. Stop and say so.
    if (cls.verdict === 'RATE_LIMITED') {
      for (const rest of candidates.slice(candidates.indexOf(c) + 1)) {
        results.push(blank(rest.id, 'UNKNOWN', 'run stopped: the account hit a Meta rate limit earlier in this pass', now));
      }
      break;
    }
  }

  return results;
}

function blank(id: string, verdict: ProbeVerdict, detail: string, at: string): ProbeResult {
  return {
    id, verdict, status: null, metaCode: null, metaSubcode: null,
    detail, returnedFields: null, emptyResult: false, probedAt: at,
  };
}

/**
 * Which Meta object this candidate must be asked of.
 *
 * The level decides the target for BOTH kinds. This read `kind === 'node'`
 * first and returned the account for every node read — so `adset.attribution_spec`
 * was asked of the ad ACCOUNT, Meta answered "not a valid field" (correctly,
 * for an account), and the matrix would have recorded a perfectly available
 * ad-set field as UNAVAILABLE. Caught by the probe's own test: the exact
 * class of wrong answer this module exists to prevent.
 */
function resolveTarget(c: ProbeCandidate, opts: ProbeRunOptions): string | null {
  if (!c.level || c.level === 'account') return opts.externalAccountId;
  return opts.entityIds?.[c.level] ?? null;
}

function extractRows(body: unknown): unknown[] {
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown[] }).data)) {
    return (body as { data: unknown[] }).data;
  }
  // A node read returns the object itself, not a {data:[]} envelope.
  return body && typeof body === 'object' ? [body] : [];
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

// ════════════════════════════════════════════════════════════════════════
//  THE CANDIDATE SET
//
//  Every entry names one unknown and says why it is worth a call. Ordered by
//  decision value, because the budget may run out.
// ════════════════════════════════════════════════════════════════════════
export const PROBE_CANDIDATES: ProbeCandidate[] = [
  {
    id: 'insights.attribution_setting',
    kind: 'insights',
    level: 'campaign',
    fields: ['spend', 'actions', 'attribution_setting'],
    rationale:
      'Adlytic stores conversion counts with NO record of the attribution window they were counted under. '
      + 'Two accounts are therefore not comparable, and a client changing their window in Ads Manager silently '
      + 'rewrites the meaning of our history. This field REPORTS the applied setting without changing any number, '
      + 'so capturing it is the one measurement fix that costs nothing downstream.',
  },
  {
    id: 'insights.action_breakdowns.action_type',
    kind: 'insights',
    level: 'campaign',
    fields: ['actions', 'cost_per_action_type'],
    params: { action_breakdowns: 'action_type' },
    rationale:
      'Establishes whether action rows can be split further than the default, which decides whether '
      + 'result composition can be reconstructed rather than inferred.',
  },
  {
    id: 'insights.breakdown.publisher_platform+position+device',
    kind: 'insights',
    level: 'campaign',
    fields: ['spend', 'impressions', 'clicks', 'actions'],
    breakdowns: ['publisher_platform', 'platform_position', 'impression_device'],
    rationale:
      'Adlytic already uses publisher_platform+platform_position. Adding impression_device tests whether the '
      + 'three combine — Meta rejects some triples — which decides whether placement inefficiency can be '
      + 'separated from device inefficiency.',
  },
  {
    id: 'adset.attribution_spec',
    kind: 'node',
    level: 'adset',
    fields: ['id', 'attribution_spec', 'optimization_goal', 'billing_event', 'bid_strategy'],
    rationale:
      'attribution_spec is the CONFIGURED window at the ad set. Together with insights.attribution_setting it '
      + 'lets a reporting change be distinguished from a performance change — the hypothesis the diagnostic '
      + 'engine currently cannot test at all. billing_event and bid_strategy are auction context we never read.',
  },
  {
    id: 'adset.learning_stage_info',
    kind: 'node',
    level: 'adset',
    fields: ['id', 'learning_stage_info'],
    rationale:
      'Already requested by listAdSets as learning_stage_info{status}. Probed here to confirm it is genuinely '
      + 'populated for this account rather than silently omitted — the difference between a real LEARNING regime '
      + 'and one we would be inventing.',
  },
  {
    id: 'insights.ad_relevance_at_ad_level',
    kind: 'insights',
    level: 'ad',
    fields: ['quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking'],
    rationale:
      'Adlytic already requests these at ad level. Probed to confirm they are POPULATED for this account — Meta '
      + 'withholds them below an impression threshold, and a fatigue diagnosis built on a permanently null field '
      + 'would be built on nothing.',
  },
  {
    id: 'campaign.budget_and_pacing',
    kind: 'node',
    level: 'campaign',
    fields: ['id', 'daily_budget', 'lifetime_budget', 'budget_remaining', 'bid_strategy', 'special_ad_categories'],
    rationale:
      'budget_remaining and bid_strategy are the difference between "spend fell" and "the budget was exhausted", '
      + 'which are opposite diagnoses with opposite actions.',
  },
  {
    id: 'insights.time_increment.hourly',
    kind: 'insights',
    level: 'campaign',
    fields: ['spend', 'impressions'],
    breakdowns: ['hourly_stats_aggregated_by_advertiser_time_zone'],
    rationale:
      'Decides whether intra-day pacing is observable. Adlytic infers velocity from date_preset=today snapshots; '
      + 'an hourly breakdown would make it measured instead of inferred.',
  },
];
