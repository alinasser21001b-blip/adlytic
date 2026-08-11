// ════════════════════════════════════════════════════════════════════════
//  test_meta_capability_probe.ts
//
//  The probe's whole job is to turn Meta's refusals into an honest matrix.
//  Two ways it could betray that job, both tested here:
//
//    1. It guesses. A refusal forced into the wrong bucket becomes a matrix
//       row that people believe. Anything not confidently recognised must
//       come back UNKNOWN, and a rate limit must NEVER be recorded as
//       "unavailable" — that bakes a transient condition in as a fact.
//
//    2. It writes. A discovery tool pointed at live client ad accounts must
//       be provably read-only. The transport here records every call and the
//       test asserts no method other than GET is ever used.
//
//  No live token and no network: a fake transport replays real Meta error
//  payload shapes.
// ════════════════════════════════════════════════════════════════════════
import {
  classifyProbeFailure,
  redact,
  runCapabilityProbe,
  PROBE_CANDIDATES,
  type ProbeCandidate,
  type ProbeTransport,
} from './src/services/metaCapabilityProbe';

let passed = 0;
let failed = 0;
const ok = (n: string) => { console.log('  ✓ ' + n); passed++; };
const bad = (n: string, extra?: string) => { console.error('  ✗ ' + n + (extra ? '  → ' + extra : '')); failed++; };
const eq = (got: unknown, want: unknown, n: string) =>
  (got === want ? ok(n) : bad(n, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));

// ── 1. Classification of real Meta error shapes ─────────────────────────
console.log('\n── Meta refusals are classified, not guessed ──');

const metaErr = (o: Record<string, unknown>) => ({ error: o });

eq(classifyProbeFailure(400, metaErr({ code: 100, message: '(#100) Requires permission to view this ad account' })).verdict,
  'PERMISSION_REQUIRED', 'code 100 + permission wording is not mistaken for a bad field');

eq(classifyProbeFailure(403, metaErr({ code: 200, message: '(#200) Permissions error' })).verdict,
  'PERMISSION_REQUIRED', 'code 200 → PERMISSION_REQUIRED');

eq(classifyProbeFailure(400, metaErr({ code: 100, error_subcode: 33, message: 'Unsupported get request. Object does not exist' })).verdict,
  'OBJECT_REQUIRED', 'subcode 33 → OBJECT_REQUIRED');

eq(classifyProbeFailure(400, metaErr({ code: 100, message: 'breakdowns: impression_device is not valid with these fields' })).verdict,
  'BREAKDOWN_CONFLICT', 'a breakdown refusal is its own verdict, not UNAVAILABLE');

eq(classifyProbeFailure(400, metaErr({ code: 100, message: '(#100) param fields must be a valid field' })).verdict,
  'UNAVAILABLE', 'an unknown field → UNAVAILABLE');

eq(classifyProbeFailure(400, metaErr({ code: 2635, message: 'You are calling a deprecated version of the Ads API' })).verdict,
  'DEPRECATED', 'code 2635 → DEPRECATED');

eq(classifyProbeFailure(400, metaErr({ code: 100, message: 'This feature is not available for this ad account' })).verdict,
  'ACCOUNT_NOT_ELIGIBLE', 'account ineligibility is distinguished from a missing permission');

// The rule that matters most.
eq(classifyProbeFailure(429, metaErr({ code: 17, message: 'User request limit reached' })).verdict,
  'RATE_LIMITED', 'a 429 is RATE_LIMITED');
eq(classifyProbeFailure(400, metaErr({ code: 4, message: 'Application request limit reached' })).verdict,
  'RATE_LIMITED', 'code 4 is RATE_LIMITED even on a 400');

for (const v of [
  classifyProbeFailure(429, metaErr({ code: 17, message: 'limit' })).verdict,
  classifyProbeFailure(400, metaErr({ code: 613, message: 'Calls to this api have exceeded the rate limit' })).verdict,
]) {
  if (v === 'UNAVAILABLE') bad('a rate limit was recorded as UNAVAILABLE — a transient condition became a permanent fact');
}
ok('no rate limit is ever recorded as UNAVAILABLE');

// Unrecognised shapes must not be forced into a bucket.
eq(classifyProbeFailure(400, metaErr({ code: 100, message: 'Something we have never seen' })).verdict,
  'UNKNOWN', 'an unrecognised message stays UNKNOWN rather than being guessed');
eq(classifyProbeFailure(500, {}).verdict, 'UNKNOWN', 'a 5xx is UNKNOWN — it says nothing about the field');
eq(classifyProbeFailure(400, metaErr({ code: 190, message: 'Error validating access token' })).verdict,
  'UNKNOWN', 'a dead token invalidates the run, not the candidate');

// ── 2. Secrets never reach the matrix ───────────────────────────────────
console.log('\n── nothing secret survives into a stored row ──');
const leak = 'GET /v20.0/act_1/insights?access_token=EAAGm0PX4ZCpsBA1234567890abcdefghij&fields=spend failed';
const red = redact(leak);
if (/EAAGm0PX4ZCpsBA/.test(red) || /access_token=EA/.test(red)) bad('redact() left a token in the message', red);
else ok('redact() strips access_token= and bare EA… tokens');
eq(redact('x'.repeat(900)).length <= 400, true, 'redact() truncates so a matrix row cannot carry a payload dump');

const detail = classifyProbeFailure(400, metaErr({
  code: 100,
  message: 'Invalid param: access_token=EAAGm0PX4ZCpsBAsecret123456789012345',
})).detail;
if (detail && /EAAGm0PX4ZCpsBAsecret/.test(detail)) bad('a token survived into the classified detail', detail);
else ok('a token in Meta\'s own message does not survive classification');

async function main() {
  // ── 3. The probe is read-only, budgeted, and does not abort ─────────────
  console.log('\n── the run itself ──');

  interface Call { path: string; params: Record<string, string> }
  function fakeTransport(reply: (c: Call, n: number) => { status: number; body: unknown }) {
    const calls: Call[] = [];
    const t: ProbeTransport = {
      async rawGet(path, params) {
        calls.push({ path, params });
        return reply({ path, params }, calls.length);
      },
    };
    return { t, calls };
  }

  {
    const { t, calls } = fakeTransport(() => ({ status: 200, body: { data: [{ spend: '12.34', attribution_setting: '7d_click' }] } }));
    const res = await runCapabilityProbe(t, PROBE_CANDIDATES, {
      externalAccountId: 'act_1',
      entityIds: { campaign: '23', adset: '45', ad: '67' },
    });
    eq(res.length, PROBE_CANDIDATES.length, 'one row per candidate');
    eq(res.every((r) => r.verdict === 'AVAILABLE'), true, 'a healthy account yields AVAILABLE rows');
    eq(res[0].returnedFields?.includes('attribution_setting'), true,
      'AVAILABLE records WHICH fields actually came back, not just that the call worked');
    eq(calls.every((c) => /insights$|^\/(act_1|23|45|67)$/.test(c.path)), true,
      'every path is an insights read or a node read — no write endpoints');
    eq(calls.every((c) => !('access_token' in c.params)), true,
      'the probe never puts a token into the params it builds');
  }

  {
    // An empty result set is not evidence of absence.
    const { t } = fakeTransport(() => ({ status: 200, body: { data: [] } }));
    const res = await runCapabilityProbe(t, [PROBE_CANDIDATES[0]], { externalAccountId: 'act_1', entityIds: { campaign: '23' } });
    eq(res[0].verdict, 'AVAILABLE', 'an empty-but-valid response is still AVAILABLE');
    eq(res[0].emptyResult, true, 'and it is flagged empty, so the matrix can say the account had no data in the window');
  }

  {
    // One refusal must not end the run.
    let n = 0;
    const { t } = fakeTransport(() => {
      n += 1;
      return n === 1
        ? { status: 400, body: metaErr({ code: 100, message: '(#100) param fields must be a valid field' }) }
        : { status: 200, body: { data: [{ spend: '1' }] } };
    });
    const res = await runCapabilityProbe(t, PROBE_CANDIDATES.slice(0, 4), {
      externalAccountId: 'act_1', entityIds: { campaign: '23', adset: '45', ad: '67' },
    });
    eq(res[0].verdict, 'UNAVAILABLE', 'the refused candidate is marked');
    eq(res.slice(1).every((r) => r.verdict === 'AVAILABLE'), true,
      'the remaining candidates were still probed — one refusal tells you about one field');
  }

  {
    // A rate limit stops the run and says so, rather than mislabelling the rest.
    const { t, calls } = fakeTransport(() => ({ status: 429, body: metaErr({ code: 17, message: 'User request limit reached' }) }));
    const res = await runCapabilityProbe(t, PROBE_CANDIDATES.slice(0, 5), {
      externalAccountId: 'act_1', entityIds: { campaign: '23', adset: '45', ad: '67' },
    });
    eq(res[0].verdict, 'RATE_LIMITED', 'the throttled candidate is RATE_LIMITED');
    eq(res.slice(1).every((r) => r.verdict === 'NOT_TESTED'), true,
      'and the untested remainder is NOT_TESTED — neither UNAVAILABLE nor UNKNOWN');
    eq(calls.length, 1, 'the run stopped instead of burning the rest of the quota');
  }

  {
    // The budget is a hard stop.
    const { t, calls } = fakeTransport(() => ({ status: 200, body: { data: [{ spend: '1' }] } }));
    await runCapabilityProbe(t, PROBE_CANDIDATES, {
      externalAccountId: 'act_1', entityIds: { campaign: '23', adset: '45', ad: '67' }, maxCalls: 3,
    });
    eq(calls.length, 3, 'maxCalls is respected exactly');
  }

  {
    // "We could not test this" must not read as "Meta refused".
    const { t, calls } = fakeTransport(() => ({ status: 200, body: { data: [{}] } }));
    const adsetOnly: ProbeCandidate[] = PROBE_CANDIDATES.filter((c) => c.level === 'adset');
    const res = await runCapabilityProbe(t, adsetOnly, { externalAccountId: 'act_1' });   // no adset id
    eq(res.every((r) => r.verdict === 'NOT_TESTED'), true,
      'a candidate with no entity to probe is NOT_TESTED, never UNAVAILABLE');
    eq(calls.length, 0, 'and it costs no API call');
  }

  // ── 4. Every candidate carries its justification ────────────────────────
  console.log('\n── the candidate set ──');
  {
    const noReason = PROBE_CANDIDATES.filter((c) => !c.rationale || c.rationale.length < 40);
    eq(noReason.length, 0, 'every candidate states why it is worth an API call');
    const dupes = PROBE_CANDIDATES.map((c) => c.id).filter((id, i, a) => a.indexOf(id) !== i);
    eq(dupes.length, 0, 'candidate ids are unique (they are the matrix row keys)');
    const attribution = PROBE_CANDIDATES.find((c) => c.id === 'field.insights.attribution_setting');
    eq(!!attribution, true, 'attribution_setting is probed — the one field that makes stored conversions comparable');
    eq(attribution?.fields.includes('attribution_setting'), true, 'and it is actually requested');
    eq(attribution?.evidenceField, 'attribution_setting', 'and its presence in the response is the recorded evidence');

    // Every non-baseline candidate must isolate exactly one dimension.
    const noBaseline = PROBE_CANDIDATES.filter((c) => !c.baseline && !c.id.startsWith('baseline.'));
    eq(noBaseline.length, 0,
      'every candidate except the baselines declares a baseline, so a refusal is attributable to one dimension');
    const noEvidence = PROBE_CANDIDATES.filter((c) => !c.evidenceField);
    eq(noEvidence.length, 0, 'every candidate names the field whose presence is the evidence');

    // The unified-attribution probe must not adopt the setting in production.
    const unified = PROBE_CANDIDATES.find((c) => c.id === 'config.unified_attribution');
    eq(unified?.dimension, 'REPORTING_CONFIG', 'the unified-attribution probe is a REPORTING_CONFIG question');
    eq(/NOT adopted|not adopted/.test(unified?.rationale ?? ''), true,
      'and its rationale records that it is probed, never switched on — doing so would change stored numbers');
  }

    // ── 5. Dimension isolation ────────────────────────────────────────────
  console.log('\n── a refusal is attributable to ONE dimension ──');
  {
    // Baseline fails → the candidate was never really tested.
    const { t, calls } = fakeTransport((c) => (
      'attribution_setting' in (c.params.fields ? { [c.params.fields]: 1 } : {})
        ? { status: 200, body: { data: [{}] } }
        : { status: 400, body: metaErr({ code: 100, error_subcode: 33, message: 'Unsupported get request' }) }
    ));
    const cand = PROBE_CANDIDATES.find((c) => c.id === 'field.insights.attribution_setting')!;
    const res = await runCapabilityProbe(t, [cand], { externalAccountId: 'act_1', entityIds: { campaign: '23' } });
    eq(res[0].verdict, 'NOT_TESTED',
      'when the baseline fails, the candidate is NOT_TESTED — the object is at fault, not the field');
    eq(res[0].baselineVerdict, 'OBJECT_REQUIRED', 'and the baseline failure itself is recorded');
    eq(calls.length, 1, 'and no second call is wasted on a request that could not have been meaningful');
  }
  {
    // Baseline passes, candidate fails → attributable to the isolated thing.
    let n = 0;
    const { t } = fakeTransport(() => {
      n += 1;
      return n === 1
        ? { status: 200, body: { data: [{ spend: '1', impressions: '2' }] } }
        : { status: 400, body: metaErr({ code: 100, message: '(#100) param fields must be a valid field' }) };
    });
    const cand = PROBE_CANDIDATES.find((c) => c.id === 'field.insights.attribution_setting')!;
    const res = await runCapabilityProbe(t, [cand], { externalAccountId: 'act_1', entityIds: { campaign: '23' } });
    eq(res[0].baselineVerdict, 'AVAILABLE', 'the baseline succeeded');
    eq(res[0].verdict, 'UNAVAILABLE', 'so the refusal belongs to the isolated field');
    eq(res[0].dimension, 'FIELD', 'and the dimension is recorded on the row');
    eq(res[0].calls, 2, 'the candidate cost exactly baseline + test');
  }
  {
    // Evidence: the field arriving is what proves the capability.
    const { t } = fakeTransport(() => ({
      status: 200,
      body: { data: [{ spend: '1', impressions: '2', attribution_setting: '7d_click' }] },
    }));
    const cand = PROBE_CANDIDATES.find((c) => c.id === 'field.insights.attribution_setting')!;
    const res = await runCapabilityProbe(t, [cand], { externalAccountId: 'act_1', entityIds: { campaign: '23' } });
    eq(res[0].evidence?.present, true, 'evidence records that the field actually arrived');
    eq(res[0].evidence?.sample, '7d_click', 'an enum-shaped value is sampled — it IS the semantics');
    eq(res[0].request?.path, '/23/insights', 'the exact request is recorded for reproducibility');
    eq(res[0].request ? !('access_token' in res[0].request.params) : false, true,
      'and the recorded request carries no token');
  }
  {
    // A 200 that omits the field is NOT proof of availability.
    const { t } = fakeTransport(() => ({ status: 200, body: { data: [{ spend: '1', impressions: '2' }] } }));
    const cand = PROBE_CANDIDATES.find((c) => c.id === 'field.insights.ad_relevance')!;
    const res = await runCapabilityProbe(t, [cand], { externalAccountId: 'act_1', entityIds: { ad: '67' } });
    eq(res[0].verdict, 'AVAILABLE', 'Meta accepted the request');
    eq(res[0].evidence?.present, false,
      'but the field did not arrive — recorded, so the matrix cannot claim a capability Meta never returned');
  }
  {
    // Free-form customer content must never be sampled into the report.
    const { t } = fakeTransport(() => ({
      status: 200,
      body: { data: [{ id: '45', name: 'حملة العميل الخاصة — تفاصيل داخلية', learning_stage_info: { status: 'LEARNING' } }] },
    }));
    const cand = PROBE_CANDIDATES.find((c) => c.id === 'field.adset.learning_stage_info')!;
    const res = await runCapabilityProbe(t, [cand], { externalAccountId: 'act_1', entityIds: { adset: '45' } });
    eq(res[0].evidence?.type, 'object', 'a structured value records its type');
    eq(res[0].evidence?.sample, null, 'and is NOT sampled — the report is evidence about the API, not client data');
    const blob = JSON.stringify(res[0]);
    eq(/حملة العميل/.test(blob), false, 'no campaign name reaches the stored row');
  }

  // ── 6. The admin route and the CLI must be the same probe ─────────────
  console.log('\n── one probe, two triggers ──');
  {
    const { matrixMd, reportMd } = await import('./src/services/metaCapabilityReport');
    const { redactProbeError } = await import('./src/services/metaCapabilityRunner');
    const { t } = fakeTransport(() => ({
      status: 200,
      body: { data: [{ spend: '1', impressions: '2', attribution_setting: '7d_click' }] },
    }));
    const res = await runCapabilityProbe(t, PROBE_CANDIDATES, {
      externalAccountId: 'act_1', entityIds: { campaign: '23', adset: '45', ad: '67' },
    });
    const ctx = {
      apiVersion: 'v20.0', account: 'act_1', campaign: '23', adset: '45', ad: '67',
      since: '2026-01-01', until: '2026-01-01', calls: '17', budget: '40', at: '2026-01-02T00:00:00Z',
    };
    const m = matrixMd(res, ctx);
    const r = reportMd(res, ctx);
    eq(m.includes('act_1') && m.includes('v20.0'), true, 'the matrix records the run context');
    eq(/^## [A-G]\./m.test(r), true, 'the report carries the A–G headings');
    // Same inputs must render identically however the run was triggered — a
    // report that differs by trigger cannot be compared with the last one.
    eq(matrixMd(res, ctx) === m && reportMd(res, ctx) === r, true,
      'rendering is deterministic, so two runs are comparable');
    eq(/access_token|EAAG/.test(m + r), false, 'neither document can carry a token');
    eq(redactProbeError('failed: access_token=EAAGsecret1234567890abcdefghij').includes('EAAGsecret'), false,
      'the route error path redacts before returning');
  }

  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES`} ════\n`);
    process.exit(failed ? 1 : 0);

}

main();
