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
  | 'NOT_TESTED'           // never asked — no token, no budget, no object, or a
                           // prerequisite rung failed. NOT a Meta opinion.
  | 'UNKNOWN';             // asked, refused, and the refusal was not recognised

/**
 * The seven dimensions a capability claim can fail on. A probe that tests
 * several at once produces an unattributable verdict: request three
 * breakdowns together, get a refusal, and you have learned that some
 * unidentified part of the request was wrong.
 *
 * Each candidate therefore isolates ONE dimension and declares a `baseline`
 * — the same request minus the thing under test. The baseline runs first:
 *
 *   baseline fails  → the failure belongs to the OBJECT / LEVEL / PERMISSION,
 *                     and the candidate is NOT_TESTED, not UNAVAILABLE.
 *   baseline passes → any failure now belongs to the isolated dimension.
 *
 * That is the difference between evidence and a guess.
 */
export type CapabilityDimension =
  | 'API_VERSION'      // does v20.0 know this at all
  | 'PERMISSION'       // does the app/token hold the scope
  | 'TOKEN_ACCESS'     // can THIS token reach THIS object
  | 'ENTITY_LEVEL'     // is it valid at the level we asked
  | 'FIELD'            // is the field itself readable
  | 'BREAKDOWN'        // is the breakdown combinable here
  | 'REPORTING_CONFIG'; // attribution / action_breakdowns / time_increment

/** One thing worth asking Meta about. */
export interface ProbeCandidate {
  /** Stable id used as the matrix row key. */
  id: string;
  /** insights | node — which shape of request to build. */
  kind: 'insights' | 'node';
  /** Which entity this must be asked of. */
  level?: 'account' | 'campaign' | 'adset' | 'ad';
  /** Fields to request. One candidate isolates ONE unknown. */
  fields: string[];
  /** Breakdowns to request, when the candidate is about a breakdown. */
  breakdowns?: string[];
  /** Extra query params (e.g. action_breakdowns, attribution windows). */
  params?: Record<string, string>;
  /** Which single dimension this candidate isolates. */
  dimension: CapabilityDimension;
  /**
   * The same request WITHOUT the thing under test. Run first; if it fails,
   * the candidate is NOT_TESTED and the failure is reported against the
   * baseline instead. Omit only for a candidate that IS the baseline.
   */
  baseline?: { fields: string[]; breakdowns?: string[]; params?: Record<string, string> };
  /** The specific field whose presence in the response is the evidence. */
  evidenceField?: string;
  /** Why this is worth an API call — recorded in the matrix. */
  rationale: string;
}

/** What actually came back for one field, without persisting customer data. */
export interface FieldEvidence {
  field: string;
  present: boolean;
  /** JS type of the value — 'string' | 'number' | 'object' | 'array' | 'null'. */
  type: string | null;
  /**
   * A sample, ONLY for enum-shaped values (short, no spaces, e.g. "7d_click",
   * "above_average"). Those are semantics and are needed to interpret the
   * capability. Anything longer or free-form is withheld: this file is
   * evidence about the API, not a copy of the client's data.
   */
  sample: string | null;
}

export interface ProbeResult {
  id: string;
  verdict: ProbeVerdict;
  dimension: CapabilityDimension;
  /** Exact request, for reproducibility. Never carries a token. */
  request: { path: string; params: Record<string, string> } | null;
  /** HTTP status, when a response came back. */
  status: number | null;
  /** Meta's own error code / subcode, when present. */
  metaCode: number | null;
  metaSubcode: number | null;
  /** Meta's message, truncated and redacted. */
  detail: string | null;
  /** Which field names actually came back on the first row, when AVAILABLE. */
  returnedFields: string[] | null;
  /** Did the field under test actually arrive, and in what shape. */
  evidence: FieldEvidence | null;
  /** True when the request succeeded but the result set was empty. An empty
   *  result is NOT proof the field is unavailable — the account may simply
   *  have no data in the window. Recorded so the matrix can say so. */
  emptyResult: boolean;
  /** How the baseline (same request minus the thing under test) fared. */
  baselineVerdict: ProbeVerdict | null;
  /** Wall-clock ms and how many calls this candidate cost. */
  elapsedMs: number | null;
  calls: number;
  probedAt: string;
}

/** Enum-shaped: short, single token, no whitespace. Safe to record. */
function enumSample(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.length > 24 || !/^[A-Za-z0-9_.,:-]+$/.test(v)) return null;
  return v;
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function fieldEvidence(row: Record<string, unknown> | null, field: string | undefined): FieldEvidence | null {
  if (!field) return null;
  if (!row || !(field in row)) return { field, present: false, type: null, sample: null };
  const v = row[field];
  return { field, present: true, type: typeOf(v), sample: enumSample(v) };
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
  const since = opts.since ?? isoDaysAgo(2);
  const until = opts.until ?? isoDaysAgo(2);
  const results: ProbeResult[] = [];
  let calls = 0;
  let quotaHit = false;

  /** One request. Returns the classified outcome plus the row it got back. */
  async function ask(
    path: string,
    params: Record<string, string>,
  ): Promise<{ verdict: ProbeVerdict; status: number | null; code: number | null; sub: number | null;
               detail: string | null; row: Record<string, unknown> | null; rows: number; ms: number }> {
    const t0 = Date.now();
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await transport.rawGet(path, params));
    } catch (e) {
      return { verdict: 'UNKNOWN', status: null, code: null, sub: null,
        detail: redact(e instanceof Error ? e.message : String(e)), row: null, rows: 0, ms: Date.now() - t0 };
    }
    const ms = Date.now() - t0;
    if (status >= 200 && status < 300) {
      const rows = extractRows(body);
      return { verdict: 'AVAILABLE', status, code: null, sub: null, detail: null,
        row: (rows[0] as Record<string, unknown>) ?? null, rows: rows.length, ms };
    }
    const cls = classifyProbeFailure(status, body);
    return { verdict: cls.verdict, status, code: cls.metaCode, sub: cls.metaSubcode,
      detail: cls.detail, row: null, rows: 0, ms };
  }

  function buildParams(
    c: ProbeCandidate,
    variant: { fields: string[]; breakdowns?: string[]; params?: Record<string, string> },
  ): Record<string, string> {
    const p: Record<string, string> = { fields: variant.fields.join(',') };
    if (c.kind === 'insights') {
      p.level = c.level ?? 'account';
      p.time_range = JSON.stringify({ since, until });
      p.limit = '1';
      if (variant.breakdowns?.length) p.breakdowns = variant.breakdowns.join(',');
    }
    Object.assign(p, variant.params ?? {});
    return p;
  }

  for (const c of candidates) {
    const now = new Date().toISOString();
    const base = (verdict: ProbeVerdict, detail: string, extra: Partial<ProbeResult> = {}): ProbeResult => ({
      id: c.id, verdict, dimension: c.dimension, request: null, status: null, metaCode: null,
      metaSubcode: null, detail, returnedFields: null, evidence: null, emptyResult: false,
      baselineVerdict: null, elapsedMs: null, calls: 0, probedAt: now, ...extra,
    });

    // Untested is not a Meta opinion — four separate reasons, all NOT_TESTED.
    if (quotaHit) {
      results.push(base('NOT_TESTED', 'the account hit a Meta rate limit earlier in this run; nothing after that point was asked'));
      continue;
    }
    if (calls >= max) {
      results.push(base('NOT_TESTED', `probe budget of ${max} calls was exhausted before this candidate`));
      continue;
    }
    const target = resolveTarget(c, opts);
    if (!target) {
      results.push(base('NOT_TESTED', `no ${c.level} id was available in this workspace to probe against`));
      continue;
    }

    const path = c.kind === 'insights' ? `/${target}/insights` : `/${target}`;
    let spent = 0;
    let elapsed = 0;
    let baselineVerdict: ProbeVerdict | null = null;

    // ── Rung 0: the baseline ────────────────────────────────────────────
    // The same request WITHOUT the thing under test. If this fails, the
    // failure belongs to the object, the level or the permission — NOT to
    // the field/breakdown/config we came to ask about. Reporting that as
    // UNAVAILABLE would be the exact lie this module exists to prevent.
    if (c.baseline) {
      if (calls >= max) {
        results.push(base('NOT_TESTED', `probe budget exhausted before this candidate's baseline`));
        continue;
      }
      const bParams = buildParams(c, c.baseline);
      calls += 1; spent += 1;
      const b = await ask(path, bParams);
      elapsed += b.ms;
      baselineVerdict = b.verdict;
      if (b.verdict === 'RATE_LIMITED') quotaHit = true;
      if (b.verdict !== 'AVAILABLE') {
        results.push(base('NOT_TESTED',
          `baseline failed before the isolated dimension could be tested: ${b.verdict}`
          + (b.detail ? ` — ${b.detail}` : ''),
          { request: { path, params: bParams }, status: b.status, metaCode: b.code,
            metaSubcode: b.sub, baselineVerdict: b.verdict, elapsedMs: elapsed, calls: spent }));
        continue;
      }
    }

    // ── Rung 1: the candidate, differing from the baseline by ONE thing ──
    if (calls >= max) {
      results.push(base('NOT_TESTED', `probe budget exhausted after the baseline`,
        { baselineVerdict, elapsedMs: elapsed, calls: spent }));
      continue;
    }
    const params = buildParams(c, { fields: c.fields, breakdowns: c.breakdowns, params: c.params });
    calls += 1; spent += 1;
    const r = await ask(path, params);
    elapsed += r.ms;
    if (r.verdict === 'RATE_LIMITED') quotaHit = true;

    results.push({
      id: c.id,
      verdict: r.verdict,
      dimension: c.dimension,
      request: { path, params },
      status: r.status,
      metaCode: r.code,
      metaSubcode: r.sub,
      detail: r.detail,
      returnedFields: r.verdict === 'AVAILABLE' ? Object.keys(r.row ?? {}) : null,
      evidence: r.verdict === 'AVAILABLE' ? fieldEvidence(r.row, c.evidenceField) : null,
      emptyResult: r.verdict === 'AVAILABLE' && r.rows === 0,
      baselineVerdict,
      elapsedMs: elapsed,
      calls: spent,
      probedAt: now,
    });
  }

  return results;
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
  // ── Rung 0 for everything: can this token read this object at all? ────
  {
    id: 'baseline.account.insights',
    kind: 'insights', level: 'account',
    fields: ['spend', 'impressions'],
    dimension: 'TOKEN_ACCESS',
    evidenceField: 'spend',
    rationale:
      'The floor. If this fails, every other verdict in the run is about the token or the account, '
      + 'not about any field — and the whole matrix must be read as NOT_TESTED rather than as absence.',
  },
  {
    id: 'baseline.campaign.insights',
    kind: 'insights', level: 'campaign',
    fields: ['spend', 'impressions'],
    dimension: 'ENTITY_LEVEL',
    evidenceField: 'spend',
    rationale: 'Confirms the campaign object is readable before any campaign-level field is blamed.',
  },
  {
    id: 'baseline.adset.node',
    kind: 'node', level: 'adset',
    fields: ['id', 'name'],
    dimension: 'ENTITY_LEVEL',
    evidenceField: 'id',
    rationale: 'Confirms the ad-set object is readable before any ad-set field is blamed.',
  },
  {
    id: 'baseline.ad.insights',
    kind: 'insights', level: 'ad',
    fields: ['spend', 'impressions'],
    dimension: 'ENTITY_LEVEL',
    evidenceField: 'spend',
    rationale: 'Confirms ad-level insights are readable before any ad-level field is blamed.',
  },

  // ── FIELD dimension ──────────────────────────────────────────────────
  {
    id: 'field.insights.attribution_setting',
    kind: 'insights', level: 'campaign',
    fields: ['spend', 'impressions', 'attribution_setting'],
    baseline: { fields: ['spend', 'impressions'] },
    dimension: 'FIELD',
    evidenceField: 'attribution_setting',
    rationale:
      'THE priority. Adlytic stores conversion counts with no record of the attribution window they were '
      + 'counted under, so two accounts are not comparable and a client changing the window in Ads Manager '
      + 'silently rewrites the meaning of our history. This field REPORTS the applied setting without '
      + 'selecting one, so capturing it changes no existing number — the only measurement fix with zero '
      + 'blast radius.',
  },
  {
    id: 'field.insights.ad_relevance',
    kind: 'insights', level: 'ad',
    fields: ['impressions', 'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking'],
    baseline: { fields: ['impressions'] },
    dimension: 'FIELD',
    evidenceField: 'quality_ranking',
    rationale:
      'Already requested in production (syncAccount.ts). Probed to learn whether it is POPULATED for this '
      + 'account — Meta withholds these below an impression threshold, and a fatigue diagnosis resting on a '
      + 'permanently null field rests on nothing. present:false here is the finding.',
  },
  {
    id: 'field.adset.attribution_spec',
    kind: 'node', level: 'adset',
    fields: ['id', 'name', 'attribution_spec'],
    baseline: { fields: ['id', 'name'] },
    dimension: 'FIELD',
    evidenceField: 'attribution_spec',
    rationale:
      'The CONFIGURED window at the ad set. With insights.attribution_setting it lets a reporting change be '
      + 'separated from a performance change — the hypothesis the diagnostic engine currently cannot ask.',
  },
  {
    id: 'field.adset.auction_config',
    kind: 'node', level: 'adset',
    fields: ['id', 'name', 'billing_event', 'bid_strategy', 'optimization_goal'],
    baseline: { fields: ['id', 'name'] },
    dimension: 'FIELD',
    evidenceField: 'bid_strategy',
    rationale:
      'Auction context Adlytic never reads. optimization_goal is already synced; billing_event and '
      + 'bid_strategy decide whether "CPM rose" means auction pressure or a bid-strategy consequence.',
  },
  {
    id: 'field.adset.learning_stage_info',
    kind: 'node', level: 'adset',
    fields: ['id', 'name', 'learning_stage_info'],
    baseline: { fields: ['id', 'name'] },
    dimension: 'FIELD',
    evidenceField: 'learning_stage_info',
    rationale:
      'Already requested by listAdSets. Probed to confirm it is genuinely populated rather than silently '
      + 'omitted — the difference between an observed LEARNING regime and an invented one.',
  },
  {
    id: 'field.campaign.budget_remaining',
    kind: 'node', level: 'campaign',
    fields: ['id', 'name', 'budget_remaining', 'bid_strategy'],
    baseline: { fields: ['id', 'name'] },
    dimension: 'FIELD',
    evidenceField: 'budget_remaining',
    rationale:
      '"Spend fell" and "the budget ran out" are opposite diagnoses with opposite actions, and Adlytic '
      + 'currently cannot tell them apart.',
  },

  // ── BREAKDOWN dimension — one breakdown added at a time ───────────────
  {
    id: 'breakdown.impression_device',
    kind: 'insights', level: 'campaign',
    fields: ['spend', 'impressions'],
    breakdowns: ['publisher_platform', 'platform_position', 'impression_device'],
    // The baseline is the PAIR Adlytic already uses in production, so a
    // refusal here is attributable to adding impression_device specifically.
    baseline: { fields: ['spend', 'impressions'], breakdowns: ['publisher_platform', 'platform_position'] },
    dimension: 'BREAKDOWN',
    evidenceField: 'impression_device',
    rationale:
      'Decides whether placement inefficiency separates from device inefficiency. Baseline is the pair '
      + 'already in production, so a failure names the third breakdown rather than the trio.',
  },
  {
    id: 'breakdown.hourly',
    kind: 'insights', level: 'campaign',
    fields: ['spend', 'impressions'],
    breakdowns: ['hourly_stats_aggregated_by_advertiser_time_zone'],
    baseline: { fields: ['spend', 'impressions'] },
    dimension: 'BREAKDOWN',
    evidenceField: 'hourly_stats_aggregated_by_advertiser_time_zone',
    rationale:
      'Adlytic infers intra-day velocity from date_preset=today snapshots. An hourly breakdown would make '
      + 'pacing measured instead of inferred.',
  },

  // ── REPORTING_CONFIG dimension ───────────────────────────────────────
  {
    id: 'config.action_breakdowns.action_type',
    kind: 'insights', level: 'campaign',
    fields: ['actions', 'cost_per_action_type'],
    params: { action_breakdowns: 'action_type' },
    baseline: { fields: ['actions', 'cost_per_action_type'] },
    dimension: 'REPORTING_CONFIG',
    evidenceField: 'actions',
    rationale:
      'Whether action rows can be split further than the default — decides if result composition can be '
      + 'reconstructed rather than inferred.',
  },
  {
    id: 'config.unified_attribution',
    kind: 'insights', level: 'campaign',
    fields: ['spend', 'actions', 'attribution_setting'],
    params: { use_unified_attribution_setting: 'true' },
    baseline: { fields: ['spend', 'actions', 'attribution_setting'] },
    dimension: 'REPORTING_CONFIG',
    evidenceField: 'attribution_setting',
    rationale:
      'READ-ONLY probe of whether the parameter is ACCEPTED. It is deliberately NOT adopted: switching it on '
      + 'would change the conversion numbers Adlytic already stores, and §32 forbids replacing a production '
      + 'number without a discrepancy report first. This run only establishes that the option exists.',
  },
];
