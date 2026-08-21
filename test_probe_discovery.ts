// ════════════════════════════════════════════════════════════════════════
//  test_probe_discovery.ts — EXPERIMENT −1
//
//  A test performed entirely against our own code. No Meta call, no network,
//  no token. Everything asserted here was, until now, being INFERRED from a
//  production run — and an inference about your own source is a fact you
//  declined to check.
//
//  The load-bearing question it answers:
//
//      Round 1 reported 16 total API calls.
//      Round 2 reported 16 total API calls.
//      Is 16 a signature of a particular discovery implementation?
//
//  If it is, the total call count identifies which build executed, and the
//  question "was the new code deployed?" becomes decidable from evidence the
//  operator already has — without a Railway dashboard, and without assuming
//  deployment from git history.
// ════════════════════════════════════════════════════════════════════════
import {
  discoverProbeEntities,
  summariseDiscovery,
  type DiscoveryGet,
} from './src/services/metaEntityDiscovery';
import { runCapabilityProbe, PROBE_CANDIDATES } from './src/services/metaCapabilityProbe';
import { metaGetRequest } from './src/services/metaCapabilityRunner';
import { getBuildIdentity, resetBuildIdentityCache, isCommitShaped } from './src/lib/buildIdentity';
import { discoveryMd } from './src/services/metaCapabilityReport';

let failed = 0; let passed = 0;
const ok = (m: string) => { console.log('  ✓ ' + m); passed++; };
const bad = (m: string) => { console.error('  ✗ ' + m); failed++; };
const eq = (a: unknown, b: unknown, m: string) =>
  (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : bad(`${m} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`));

const ACCOUNT = 'act_TEST';
const CAMPAIGN = '120252320877770236';

// ── A recording fake transport ─────────────────────────────────────────
interface Recorded { path: string; params: Record<string, string> }

function fakeGet(
  handler: (path: string, params: Record<string, string>) => { status: number; body: unknown },
): { get: DiscoveryGet; calls: Recorded[] } {
  const calls: Recorded[] = [];
  return {
    calls,
    get: async (path, params) => { calls.push({ path, params }); return handler(path, params); },
  };
}

const edge = (ids: string[], total: number | null, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    data: ids.map((id) => ({ id, effective_status: 'ACTIVE' })),
    ...(total === null ? {} : { summary: { total_count: total } }),
    ...extra,
  },
});

// ════════════════════════════════════════════════════════════════════════
//  1. THE CALL SIGNATURE — is 16 decisive?
// ════════════════════════════════════════════════════════════════════════
//
//  The OLD discovery, reproduced here EXACTLY as it stood at 63731b9^ (the
//  build Round 1 ran) and at 63731b9 (the build Round 2 was supposed to run).
//  Reproducing it rather than importing it is deliberate: the point is to
//  measure code that no longer exists in the tree.

async function oldStrictChain(get: DiscoveryGet, budget: { left: number }): Promise<number> {
  const start = budget.left;
  const listOne = async (path: string): Promise<string | undefined> => {
    if (budget.left <= 0) return undefined;
    budget.left -= 1;
    const r = await get(path, { fields: 'id', limit: '1' });
    if (r.status < 200 || r.status >= 300) return undefined;
    return (r.body as { data?: { id?: string }[] })?.data?.[0]?.id;
  };
  const e: { campaign?: string; adset?: string; ad?: string } = {};
  e.campaign = await listOne(`/${ACCOUNT}/campaigns`);
  if (e.campaign) e.adset = await listOne(`/${e.campaign}/adsets`);
  if (e.adset) e.ad = await listOne(`/${e.adset}/ads`);
  return start - budget.left;
}

async function withAccountFallback(get: DiscoveryGet, budget: { left: number }): Promise<number> {
  const start = budget.left;
  const listOne = async (path: string): Promise<string | undefined> => {
    if (budget.left <= 0) return undefined;
    budget.left -= 1;
    const r = await get(path, { fields: 'id', limit: '1' });
    if (r.status < 200 || r.status >= 300) return undefined;
    return (r.body as { data?: { id?: string }[] })?.data?.[0]?.id;
  };
  const e: { campaign?: string; adset?: string; ad?: string } = {};
  e.campaign = await listOne(`/${ACCOUNT}/campaigns`);
  if (e.campaign) e.adset = await listOne(`/${e.campaign}/adsets`);
  if (!e.adset) e.adset = await listOne(`/${ACCOUNT}/adsets`);
  if (e.adset) e.ad = await listOne(`/${e.adset}/ads`);
  if (!e.ad) e.ad = await listOne(`/${ACCOUNT}/ads`);
  return start - budget.left;
}

/** How many calls the candidate set spends given which entity ids resolved. */
async function probeCallsFor(entityIds: Record<string, string>): Promise<number> {
  let calls = 0;
  const transport = {
    async rawGet() {
      calls += 1;
      // Every request succeeds and returns a row, so nothing short-circuits
      // for a reason other than a missing entity id — which is the variable
      // under test.
      return { status: 200, body: { data: [{ spend: '1', impressions: '2', id: 'x' }] } };
    },
  };
  await runCapabilityProbe(transport, PROBE_CANDIDATES, {
    externalAccountId: ACCOUNT,
    entityIds: entityIds as never,
    maxCalls: 100,
  });
  return calls;
}

async function section1() {
  console.log('\n── 1. the call signature: what does "16 calls" identify? ──');

  // The account Round 1 and Round 2 saw: one campaign, and the nested adsets
  // edge empty. This is the observed shape, reproduced.
  const observed = (path: string) => {
    if (path.endsWith('/campaigns')) return edge([CAMPAIGN], 1);
    return edge([], 0);
  };

  const oldT = fakeGet(observed);
  const oldCalls = await oldStrictChain(oldT.get, { left: 40 });
  const newT = fakeGet(observed);
  const fbCalls = await withAccountFallback(newT.get, { left: 40 });
  const curT = fakeGet(observed);
  const cur = await discoverProbeEntities(curT.get, ACCOUNT, { left: 40 });

  eq(oldCalls, 2, 'strict chain (63731b9^) spends 2 discovery calls on this account');
  eq(fbCalls, 4, 'account fallback (63731b9) spends 4 discovery calls on this account');

  const probeOnlyCampaign = await probeCallsFor({ campaign: CAMPAIGN });
  eq(probeOnlyCampaign, 14, 'the candidate set spends 14 calls when only a campaign resolved');

  // THE DECISIVE ARITHMETIC.
  const totalOld = oldCalls + probeOnlyCampaign;
  const totalFallback = fbCalls + probeOnlyCampaign;
  eq(totalOld, 16, 'strict chain + candidates = 16 — exactly what BOTH runs reported');
  if (totalFallback === 16) {
    bad('the fallback build also totals 16 — the call count would NOT identify the build');
  } else {
    ok(`the fallback build totals ${totalFallback}, not 16 — so 16 is a signature of the STRICT CHAIN`);
  }

  // The current implementation must also be distinguishable, or the same
  // ambiguity returns on the next run.
  const totalCurrent = cur.callsSpent + probeOnlyCampaign;
  if (totalCurrent === 16 || totalCurrent === totalFallback) {
    bad(`current discovery totals ${totalCurrent}, colliding with a previous build's signature`);
  } else {
    ok(`current discovery totals ${totalCurrent} — distinct from both earlier builds`);
  }

  // ── The alternate explanation, tested rather than dismissed ────────────
  //
  // A run can spend FEWER calls than its build's full cost if a rate limit
  // truncates it. So "16" is only decisive if no truncated fallback run also
  // lands on 16 while producing Round 1's verdicts. It turns out one does —
  // and it is distinguishable, because truncation leaves fingerprints in the
  // rows themselves. Asserting that here is what turns a plausible reading
  // into a checkable one.
  const truncatedTotals = new Set<number>();
  for (let stopAfter = 1; stopAfter <= 40; stopAfter++) {
    let calls = 0;
    const transport = {
      async rawGet() {
        calls += 1;
        if (calls >= stopAfter) {
          return { status: 429, body: { error: { code: 4, message: 'rate limit' } } };
        }
        return { status: 200, body: { data: [{ spend: '1', impressions: '2', id: 'x' }] } };
      },
    };
    const rows = await runCapabilityProbe(transport, PROBE_CANDIDATES, {
      externalAccountId: ACCOUNT, entityIds: { campaign: CAMPAIGN } as never, maxCalls: 100,
    });
    const total = fbCalls + calls;
    if (total !== 16) continue;
    truncatedTotals.add(stopAfter);
    // Round 1's evidence had config.unified_attribution AVAILABLE with the
    // field present. A truncated run cannot produce that.
    const unified = rows.find((r) => r.id === 'config.unified_attribution');
    if (unified?.verdict === 'AVAILABLE') {
      bad('a rate-limited fallback run reaches 16 calls AND still reports config.unified_attribution '
        + 'as AVAILABLE — the call count would not be decisive');
    }
  }
  if (truncatedTotals.size === 0) {
    ok('no rate-limited fallback run lands on 16 calls at all');
  } else {
    ok(`${truncatedTotals.size} truncated fallback run(s) reach 16 calls, but every one of them `
      + 'leaves config.unified_attribution non-AVAILABLE — which Round 1 and Round 2 did not');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  2. DISCOVERY MUST NOT INHERIT ANYTHING FROM INSIGHTS
// ════════════════════════════════════════════════════════════════════════
async function section2() {
  console.log('\n── 2. discovery carries no insights parameters ──');

  const t = fakeGet(() => edge([], 0));
  await discoverProbeEntities(t.get, ACCOUNT, { left: 40 });

  // An object either exists or does not. Nothing about a reporting window,
  // an attribution model, or a delivery date may participate in that answer.
  const FORBIDDEN = [
    'time_range', 'date_preset', 'level', 'breakdowns', 'action_breakdowns',
    'action_attribution_windows', 'use_unified_attribution_setting', 'time_increment',
  ];
  const offenders: string[] = [];
  for (const c of t.calls) {
    for (const k of FORBIDDEN) if (k in c.params) offenders.push(`${c.path} → ${k}`);
  }
  if (offenders.length) {
    bad(`discovery inherited insights parameters: ${offenders.join(', ')} — `
      + 'an entity that did not deliver on the probe day would be reported as absent');
  } else ok(`no insights parameter appears on any of the ${t.calls.length} discovery calls`);

  const allAskCount = t.calls.every((c) => c.params.summary === 'total_count');
  if (allAskCount) ok('every discovery call asks for summary=total_count');
  else bad('a discovery call omitted summary=total_count — the account count would be unprovable');

  const noLimitOne = t.calls.every((c) => c.params.limit !== '1');
  if (noLimitOne) ok('no discovery call uses limit=1 (the page size most likely to false-empty)');
  else bad('a discovery call still uses limit=1');
}

// ════════════════════════════════════════════════════════════════════════
//  3. THE SEVEN HYPOTHESES FOR "NO AD SET FOUND"
// ════════════════════════════════════════════════════════════════════════
async function section3() {
  console.log('\n── 3. each cause of an empty result is distinguishable ──');

  // 3a. Genuinely empty account.
  {
    const t = fakeGet(() => edge([], 0));
    const d = await discoverProbeEntities(t.get, ACCOUNT, { left: 40 });
    eq(d.counts, { campaigns: 0, adsets: 0, ads: 0 }, '3a: an empty account reports counts of 0, not null');
    const said = summariseDiscovery(d).join(' ');
    if (said.includes('none exist')) ok('3a: reported as "none exist", the one case where absence is a finding');
    else bad(`3a: misreported — ${said}`);
  }

  // 3b. Refused edge. The old helper returned undefined here, identically to 3a.
  {
    const t = fakeGet((p) => (p.endsWith('/adsets')
      ? { status: 403, body: { error: { code: 200, error_subcode: 1349125, message: 'Requires permission' } } }
      : edge(['x1'], 1)));
    const d = await discoverProbeEntities(t.get, ACCOUNT, { left: 40 });
    const step = d.steps.find((s) => s.level === 'adset');
    eq(step?.status, 403, '3b: a refusal records its HTTP status');
    eq(step?.metaCode, 200, '3b: a refusal records the Meta error code');
    eq(step?.metaSubcode, 1349125, '3b: a refusal records the Meta subcode');
    eq(d.counts.adsets, null, '3b: a refused count is null (UNPROVEN), never 0');
    const said = summariseDiscovery(d).find((l) => l.startsWith('adset')) ?? '';
    if (said.includes('refused')) ok('3b: reported as a refusal, not as an empty account');
    else bad(`3b: misreported — ${said}`);
  }

  // 3c. False empty: no rows, but the edge says objects exist.
  {
    const t = fakeGet((p) => (p.endsWith('/adsets')
      ? edge([], 7, { paging: { next: 'https://graph.facebook.com/next' } })
      : edge(['x1'], 1)));
    const d = await discoverProbeEntities(t.get, ACCOUNT, { left: 40 });
    const step = d.steps.find((s) => s.level === 'adset');
    if (step?.anomalies.includes('EMPTY_WITH_NONZERO_TOTAL') && step.anomalies.includes('EMPTY_WITH_NEXT_PAGE')) {
      ok('3c: an empty page with total_count=7 and a next cursor is flagged as OUR defect');
    } else bad(`3c: not flagged — anomalies were ${JSON.stringify(step?.anomalies)}`);
    eq(d.counts.adsets, 7, '3c: the count is still reported even though no row came back');
  }

  // 3d. Archived-only account — the default listing hides them.
  {
    let askedWide = false;
    const t = fakeGet((p, params) => {
      if (!p.endsWith('/adsets')) return edge(['x1'], 1);
      if (params.effective_status) { askedWide = true; return { status: 200, body: { data: [{ id: 'as9', effective_status: 'ARCHIVED' }], summary: { total_count: 3 } } }; }
      return edge([], 0);
    });
    const d = await discoverProbeEntities(t.get, ACCOUNT, { left: 40 });
    if (askedWide) ok('3d: an empty default listing triggers exactly one all-statuses retry');
    else bad('3d: the archived-objects hypothesis was never tested');
    eq(d.entityIds.adset, 'as9', '3d: the archived ad set is found and used rather than abandoned');
    const step = d.steps.find((s) => s.endpointClass === 'ACCOUNT_ADSETS_ALL_STATUSES');
    if (step?.pickedReason?.includes('archived')) ok('3d: the report says the subject is dormant');
    else bad('3d: an archived subject was used without saying so');
  }

  // 3e. First-campaign-only dependency — the Round 1 diagnosis.
  {
    // The first campaign has no ad sets; a LATER campaign does. The strict
    // chain finds nothing; account-level discovery must find it.
    const observed = (p: string) => {
      if (p.endsWith('/campaigns')) return edge([CAMPAIGN, 'c2'], 2);
      if (p === `/${CAMPAIGN}/adsets`) return edge([], 0);
      if (p.endsWith('/adsets')) return edge(['as_from_c2'], 4);
      return edge(['ad1'], 9);
    };
    const oldT = fakeGet(observed);
    await oldStrictChain(oldT.get, { left: 40 });
    const newT = fakeGet(observed);
    const d = await discoverProbeEntities(newT.get, ACCOUNT, { left: 40 });
    eq(d.entityIds.adset, 'as_from_c2', '3e: account-level discovery is not hostage to the first campaign');
    const touchedNested = newT.calls.some((c) => c.path === `/${CAMPAIGN}/adsets`);
    if (!touchedNested) ok('3e: the nested campaign→adsets edge is not asked at all when the account edge answers');
    else bad('3e: still spending a call on the nested edge unnecessarily');
  }

  // 3f. Budget exhaustion is not a Meta verdict.
  {
    const t = fakeGet(() => edge(['x'], 1));
    const d = await discoverProbeEntities(t.get, ACCOUNT, { left: 1 });
    const skipped = d.steps.filter((s) => s.anomalies.includes('NOT_ASKED_BUDGET'));
    if (skipped.length >= 2) ok('3f: steps beyond the budget are recorded as NOT_ASKED_BUDGET, not as empty');
    else bad(`3f: budget exhaustion left ${skipped.length} explained gaps in the trace`);
    eq(d.counts.adsets, null, '3f: an unasked count is UNPROVEN, not 0');
  }

  // 3g. A missing summary must not become a zero.
  {
    const t = fakeGet(() => edge([], null));
    const d = await discoverProbeEntities(t.get, ACCOUNT, { left: 40 });
    eq(d.counts, { campaigns: null, adsets: null, ads: null }, '3g: no summary → null counts, never 0');
    const said = summariseDiscovery(d).join(' ');
    if (said.includes('UNPROVEN')) ok('3g: reported as UNPROVEN rather than as an empty account');
    else bad(`3g: misreported — ${said}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
//  4. THE TOKEN STILL NEVER TOUCHES A URL
// ════════════════════════════════════════════════════════════════════════
function section4() {
  console.log('\n── 4. discovery params cannot carry a credential ──');
  const { url, init } = metaGetRequest(
    'https://graph.facebook.com/v20.0', '/act_1/adsets',
    { fields: 'id,effective_status', limit: '25', summary: 'total_count' },
    'EAsecrettokenvalue0123456789',
  );
  if (url.includes('EAsecret') || url.includes('access_token')) bad('the token reached the URL');
  else ok('the discovery URL carries no token');
  const auth = (init.headers as Record<string, string>)['Authorization'];
  if (auth === 'Bearer EAsecrettokenvalue0123456789') ok('the token rides in the Authorization header');
  else bad('the Authorization header was not set');
}

// ════════════════════════════════════════════════════════════════════════
//  5. BUILD IDENTITY — absence must read as absence
// ════════════════════════════════════════════════════════════════════════
function section5() {
  console.log('\n── 5. build identity ──');
  const keys = ['ADLYTIC_BUILD_COMMIT', 'RAILWAY_GIT_COMMIT_SHA', 'SOURCE_VERSION',
    'VERCEL_GIT_COMMIT_SHA', 'GITHUB_SHA', 'GIT_COMMIT'];
  const saved = keys.map((k) => [k, process.env[k]] as const);
  for (const k of keys) delete process.env[k];

  resetBuildIdentityCache();
  const none = getBuildIdentity();
  eq(none.resolved, false, 'no injected commit → resolved=false');
  eq(none.commit, null, 'no injected commit → commit is null, not a guess');

  // The defect this guards against: a misconfigured var holding a branch name
  // or an unexpanded shell variable, displayed as if it were a commit.
  process.env['RAILWAY_GIT_COMMIT_SHA'] = '$RAILWAY_GIT_COMMIT_SHA';
  resetBuildIdentityCache();
  eq(getBuildIdentity().resolved, false, 'an unexpanded variable is rejected, not displayed');
  process.env['RAILWAY_GIT_COMMIT_SHA'] = 'main';
  resetBuildIdentityCache();
  eq(getBuildIdentity().resolved, false, 'a branch name in the commit slot is rejected');

  process.env['RAILWAY_GIT_COMMIT_SHA'] = '63731b92d89e7e9adc821547206c48f842ff8896';
  resetBuildIdentityCache();
  const b = getBuildIdentity();
  eq(b.resolved, true, 'a real SHA resolves');
  eq(b.shortCommit, '63731b9', 'the short commit is what a human compares against git log');
  eq(b.source, 'RAILWAY_GIT_COMMIT_SHA', 'provenance names the env var it came from');

  if (isCommitShaped('63731b9') && !isCommitShaped('63731b9-dirty')) ok('commit shape check accepts short SHAs and rejects suffixes');
  else bad('commit shape check is wrong');

  for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  resetBuildIdentityCache();
}

// ════════════════════════════════════════════════════════════════════════
//  6. THE REPORT MUST NOT LAUNDER AN ABSENT TRACE
// ════════════════════════════════════════════════════════════════════════
async function section6() {
  console.log('\n── 6. the rendered report ──');
  const missing = discoveryMd(undefined);
  if (missing.includes('not evidence that discovery succeeded')) {
    ok('a report with no trace says so, instead of rendering an empty table that looks clean');
  } else bad('an absent trace renders as if nothing were wrong');

  const t = fakeGet((p) => (p.endsWith('/campaigns') ? edge([CAMPAIGN], 1) : edge([], 0)));
  const d = await discoverProbeEntities(t.get, ACCOUNT, { left: 40 });
  const md = discoveryMd(d);
  for (const need of ['ACCOUNT_CAMPAIGN_COUNT', 'ACCOUNT_ADSET_COUNT', 'ACCOUNT_AD_COUNT']) {
    if (md.includes(need)) ok(`the report states ${need}`);
    else bad(`the report omits ${need}`);
  }
  if (md.includes('UNPROVEN is not zero')) ok('the report refuses to let UNPROVEN read as zero');
  else bad('UNPROVEN/zero distinction missing from the report');
  if (/EA[A-Za-z0-9_-]{20,}/.test(md)) bad('the rendered trace contains something token-shaped');
  else ok('the rendered trace contains nothing token-shaped');
}

async function main() {
  await section1();
  await section2();
  await section3();
  section4();
  section5();
  await section6();
  console.log(`\n════ ${failed === 0 ? `${passed} passed, 0 failed` : `${failed} FAILURES, ${passed} passed`} ════\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
