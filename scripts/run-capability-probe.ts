// ════════════════════════════════════════════════════════════════════════
//  scripts/run-capability-probe.ts
//
//  Runs the read-only Meta capability probe against ONE authorized ad
//  account and writes the evidence into META_CAPABILITY_MATRIX.md and
//  META_CAPABILITY_PROBE_REPORT.md.
//
//  USAGE
//    META_ACCESS_TOKEN=…  \
//    META_AD_ACCOUNT_ID=act_123…  \
//    [META_CAMPAIGN_ID=…] [META_ADSET_ID=…] [META_AD_ID=…] \
//    [PROBE_MAX_CALLS=40] \
//    npx tsx scripts/run-capability-probe.ts
//
//  PREFERRED on a server: resolve the token from the database instead, so it
//  never enters the shell or the shell's history. Both variables are already
//  set on any host that runs the workers.
//    WORKSPACE_ID=ws_…  npx tsx scripts/run-capability-probe.ts
//  (reads DATABASE_URL + TOKEN_ENCRYPTION_KEY from the ambient environment,
//   resolves the workspace's ad account, decrypts through the same path the
//   sync workers use, and never prints the token)
//
//  SAFETY
//    · GET only. There is no code path here that can POST, PATCH or DELETE.
//    · Hard call budget (default 40) enforced by the probe itself.
//    · Stops the whole run on the first rate limit rather than burning quota.
//    · The token is read from the environment, never printed, never written
//      to either output file, and stripped out of Meta's own error messages.
//    · Entity ids are discovered with ordinary list calls that production
//      already makes; those count against the budget like any other call.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';

import { resolveAccountToken } from '../src/services/accountToken';
import { decryptToken } from '../src/services/tokenEncryption';
import {
  PROBE_CANDIDATES,
  runCapabilityProbe,
  type ProbeResult,
  type ProbeTransport,
} from '../src/services/metaCapabilityProbe';

const API_VERSION = process.env.META_API_VERSION ?? 'v20.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `\n✗ ${name} is not set (and WORKSPACE_ID was not given either).\n`
      + `  This script does not invent capability results. Without a real token on a real\n`
      + `  account there is nothing to record, and a matrix filled from documentation is\n`
      + `  exactly the error the probe exists to prevent.\n`,
    );
    process.exit(2);
  }
  return v;
}

/** GET-only transport. Deliberately has no method parameter. */
function httpTransport(token: string): ProbeTransport & { calls: number } {
  const t = {
    calls: 0,
    async rawGet(path: string, params: Record<string, string>) {
      t.calls += 1;
      const qs = new URLSearchParams({ ...params, access_token: token });
      const res = await fetch(`${BASE}${path}?${qs.toString()}`, { method: 'GET' });
      let body: unknown = null;
      try { body = await res.json(); } catch { body = null; }
      return { status: res.status, body };
    },
  };
  return t;
}

/** One list call per level, to find something real to probe against. */
async function discoverEntities(token: string, account: string, budget: { left: number }) {
  const out: { campaign?: string; adset?: string; ad?: string } = {};
  const get = async (path: string, params: Record<string, string>) => {
    if (budget.left <= 0) return null;
    budget.left -= 1;
    const qs = new URLSearchParams({ ...params, access_token: token });
    const res = await fetch(`${BASE}${path}?${qs.toString()}`, { method: 'GET' });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { id?: string }[] };
    return j.data?.[0]?.id ?? null;
  };

  out.campaign = process.env.META_CAMPAIGN_ID
    ?? (await get(`/${account}/campaigns`, { fields: 'id', limit: '1' })) ?? undefined;
  if (out.campaign) {
    out.adset = process.env.META_ADSET_ID
      ?? (await get(`/${out.campaign}/adsets`, { fields: 'id', limit: '1' })) ?? undefined;
  }
  if (out.adset) {
    out.ad = process.env.META_AD_ID
      ?? (await get(`/${out.adset}/ads`, { fields: 'id', limit: '1' })) ?? undefined;
  }
  return out;
}

const VERDICT_NOTE: Record<string, string> = {
  AVAILABLE: 'the token read it',
  PERMISSION_REQUIRED: 'ask for the scope — this is a fixable gap, not an absent capability',
  OBJECT_REQUIRED: 'the object is not visible to this token',
  LEVEL_REQUIRED: 'valid field, wrong level',
  BREAKDOWN_CONFLICT: 'not combinable here',
  ACCOUNT_NOT_ELIGIBLE: 'the account/business lacks the feature',
  UNAVAILABLE: 'this API version does not know the field',
  DEPRECATED: 'removed',
  RATE_LIMITED: 'quota — says NOTHING about the capability',
  NOT_TESTED: 'never asked — not a Meta opinion',
  UNKNOWN: 'refused, and the refusal was not recognised — read the detail by hand',
};

function matrixMd(results: ProbeResult[], ctx: Record<string, string>): string {
  const rows = results.map((r) => {
    const c = PROBE_CANDIDATES.find((x) => x.id === r.id);
    const ev = r.evidence
      ? (r.evidence.present ? `yes${r.evidence.sample ? ` (\`${r.evidence.sample}\`)` : ` (${r.evidence.type})`}` : '**no**')
      : '—';
    return `| \`${r.id}\` | ${c?.dimension ?? '—'} | ${c?.kind ?? ''} | ${c?.level ?? 'account'} | `
      + `${(c?.fields ?? []).join(', ')} | ${(c?.breakdowns ?? []).join(', ') || '—'} | `
      + `**${r.verdict}** | ${r.baselineVerdict ?? '—'} | ${ev} | ${r.status ?? '—'} | `
      + `${r.metaCode ?? '—'}${r.metaSubcode != null ? '/' + r.metaSubcode : ''} | ${r.calls} | `
      + `${r.detail ? r.detail.replace(/\|/g, '\\|').slice(0, 160) : '—'} |`;
  });

  return `# META_CAPABILITY_MATRIX

Generated by \`scripts/run-capability-probe.ts\`. Every row is evidence from a
real request; nothing here comes from documentation.

| context | value |
|---|---|
| API version | \`${API_VERSION}\` |
| ad account | \`${ctx.account}\` |
| campaign probed | \`${ctx.campaign || '(none found)'}\` |
| ad set probed | \`${ctx.adset || '(none found)'}\` |
| ad probed | \`${ctx.ad || '(none found)'}\` |
| time range | ${ctx.since} → ${ctx.until} |
| total API calls | ${ctx.calls} (budget ${ctx.budget}) |
| run at | ${ctx.at} |

## Rows

| capability | dimension | kind | level | fields | breakdowns | verdict | baseline | field returned | HTTP | meta code | calls | detail |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

## Reading this table

${Object.entries(VERDICT_NOTE).map(([k, v]) => `- **${k}** — ${v}`).join('\n')}

A **NOT_TESTED** row is not a finding about Meta. It means the run could not
ask: no object to ask about, the budget ran out, an earlier rate limit stopped
the run, or the candidate's own baseline failed first.

A row with verdict AVAILABLE but *field returned: no* means Meta accepted the
request and did not return the field. That is not a capability — it is usually
an account below a reporting threshold, and it is recorded rather than rounded
up to "available".
`;
}

function reportMd(results: ProbeResult[], ctx: Record<string, string>): string {
  const by = (v: string) => results.filter((r) => r.verdict === v);
  const withField = by('AVAILABLE').filter((r) => r.evidence?.present);
  const acceptedButEmpty = by('AVAILABLE').filter((r) => r.evidence && !r.evidence.present);
  const line = (r: ProbeResult) => {
    const c = PROBE_CANDIDATES.find((x) => x.id === r.id);
    return `- \`${r.id}\` — ${c?.rationale.split('.')[0] ?? ''}.`;
  };
  const none = '_(none)_';
  const list = (rs: ProbeResult[]) => (rs.length ? rs.map(line).join('\n') : none);

  return `# META_CAPABILITY_PROBE_REPORT

Run at ${ctx.at} against \`${ctx.account}\` on \`${API_VERSION}\`.
${ctx.calls} API calls (budget ${ctx.budget}). Read-only; GET requests only.

> **Three of these seven questions the probe can answer. Four it cannot.**
> A, B and F are facts about the API and are generated below. C, D, E and G are
> judgements about MEANING — grain, temporal behaviour, diagnostic power — and
> a script that filled them in would be doing the exact thing this whole phase
> was built to prevent: turning a capability into a claim without evidence.
> They are left as prompts, with the evidence needed to answer them attached.

## A. What can we access?

Meta accepted the request **and returned the field**:

${list(withField)}

Accepted, but the field never arrived — availability is **unproven**, usually an
account below a reporting threshold:

${list(acceptedButEmpty)}

Refused:

${list([...by('PERMISSION_REQUIRED'), ...by('OBJECT_REQUIRED'), ...by('ACCOUNT_NOT_ELIGIBLE'), ...by('UNAVAILABLE'), ...by('DEPRECATED')])}

Never asked — **not a finding about Meta**:

${list([...by('NOT_TESTED'), ...by('RATE_LIMITED'), ...by('UNKNOWN')])}

## B. What can we access at each object level?

Level is a first-class dimension here: a field readable at \`ad\` and refused at
\`campaign\` is not an absent capability, it is a capability with an address.

| level | baseline readable? | capabilities confirmed at this level |
|---|---|---|
${(['account', 'campaign', 'adset', 'ad'] as const).map((lv) => {
    const baseRow = results.find((r) => r.id.startsWith('baseline.') &&
      (PROBE_CANDIDATES.find((c) => c.id === r.id)?.level ?? 'account') === lv);
    const confirmed = withField.filter((r) =>
      (PROBE_CANDIDATES.find((c) => c.id === r.id)?.level ?? 'account') === lv);
    return `| \`${lv}\` | ${baseRow ? baseRow.verdict : '—'} | ${confirmed.length ? confirmed.map((r) => '\`' + r.id + '\`').join(', ') : '—'} |`;
  }).join('\n')}

Any row whose \`baselineVerdict\` is not AVAILABLE says the LEVEL failed, not the
field. Those are:

${list(results.filter((r) => r.baselineVerdict && r.baselineVerdict !== 'AVAILABLE'))}

## C. What has meaningful temporal semantics? — **human judgement**

The probe cannot answer this: it observes one request, and temporal meaning is
a property of the field, not of the response.

For every capability in A, decide before it is allowed near storage:

- **point-in-time** (a state read now, e.g. \`budget_remaining\`) — storing it in
  a daily table fabricates a time series out of whenever the sync happened to
  run. That is falsifying temporal semantics, not enriching data.
- **window-scoped** (an aggregate over the requested range) — carries the range
  in its meaning; comparing two of them across different ranges is invalid.
- **daily-grained** (one honest value per calendar day, in the account's
  timezone).
- **configuration** (changes only when a human changes it — belongs in an event
  log with a valid-from, never in a metrics table).

Evidence available to you per row: the returned \`type\`, the enum \`sample\`, and
the time range the request used.

## D. What has useful diagnostic semantics? — **human judgement**

Availability is not diagnostic value. For each capability in A:
which competing hypothesis does it help *distinguish*? A signal that moves with
everything else distinguishes nothing.

## E. What can be combined? — **human judgement, informed by F**

The probe proves technical combinability only (F). Whether two signals may be
combined *analytically* — same grain, same window, same attribution context,
same entity — is a semantic question. Two fields Meta returns in one row can
still be incomparable if they were counted under different attribution windows.

## F. What cannot safely be combined? — **evidence below**

The probe answers this directly. A \`BREAKDOWN_CONFLICT\` is Meta stating that
two dimensions are not jointly reportable:

${list(by('BREAKDOWN_CONFLICT'))}

${by('BREAKDOWN_CONFLICT').length === 0
    ? '_No breakdown conflict was observed in this run. That is not proof that none exists — only these combinations were tested._'
    : '_Each row above is a combination that must never be requested together, and a pair of signals that cannot be jointly attributed._'}

## G. Which signals materially expand the campaign state model? — **human judgement**

The question is not "is this new data" but "does the campaign state change
shape without it". Answer only after C, D and E.

One statement the script will make on its own, because it is mechanical:

\`field.insights.attribution_setting\` is **${results.find((r) => r.id === 'field.insights.attribution_setting')?.verdict ?? 'NOT_TESTED'}**${
    results.find((r) => r.id === 'field.insights.attribution_setting')?.evidence?.present
      ? ` and the field returned (\`${results.find((r) => r.id === 'field.insights.attribution_setting')?.evidence?.sample ?? 'yes'}\`)`
      : ' and the field did not return'
  }.

If AVAILABLE with the field present, stored conversions can carry the window
they were counted under, and comparability across workspaces becomes reachable.
If not, the honest consequence is that CPA comparisons between workspaces must
be **withdrawn from the product**, not shown with a caveat.

---

### Raw results

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`
`;
}

/**
 * Resolve a token WITHOUT it ever passing through a shell.
 *
 * The first version of this script only accepted META_ACCESS_TOKEN from the
 * environment, while its own usage block advertised a database path that did
 * not exist. That is a false promise in a security-sensitive place: someone
 * following the docstring on a server would fall back to pasting a live Meta
 * token into their shell, where it lands in history. Implemented here through
 * the SAME resolve+decrypt path the sync workers use, so it inherits the
 * system-user / per-account distinction rather than reimplementing it.
 */
async function tokenFromWorkspace(workspaceId: string): Promise<{ token: string; account: string }> {
  const prisma = new PrismaClient();
  try {
    const acct = await prisma.adAccount.findFirst({
      where: { workspaceId },
      select: {
        externalAccountId: true, accessTokenEncrypted: true,
        tokenSource: true, connectionId: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!acct) throw new Error(`workspace ${workspaceId} has no ad account`);

    const resolved = await resolveAccountToken(prisma, acct as never);
    if (!resolved.encrypted) throw new Error(`workspace ${workspaceId} has no stored Meta token`);

    // decryptToken throws TokenDecryptError on a key mismatch — deliberately
    // NOT softened here. A key problem and an expired token are different
    // incidents with different fixes, and a probe run must not blur them.
    return { token: decryptToken(resolved.encrypted), account: acct.externalAccountId };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const workspaceId = process.env.WORKSPACE_ID;
  let token: string;
  let account: string;

  if (workspaceId) {
    ({ token, account } = await tokenFromWorkspace(workspaceId));
    if (process.env.META_AD_ACCOUNT_ID) account = process.env.META_AD_ACCOUNT_ID;
    console.log(`resolved a token for workspace ${workspaceId} (account ${account}) — not printed`);
  } else {
    token = need('META_ACCESS_TOKEN');
    account = need('META_AD_ACCOUNT_ID');
  }
  const budget = Number(process.env.PROBE_MAX_CALLS ?? 40);

  const since = process.env.PROBE_SINCE ?? new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const until = process.env.PROBE_UNTIL ?? since;

  const remaining = { left: budget };
  const entityIds = await discoverEntities(token, account, remaining);
  const discovery = budget - remaining.left;

  const transport = httpTransport(token);
  const results = await runCapabilityProbe(transport, PROBE_CANDIDATES, {
    externalAccountId: account,
    entityIds,
    maxCalls: remaining.left,
    since,
    until,
  });

  const ctx: Record<string, string> = {
    account,
    campaign: entityIds.campaign ?? '',
    adset: entityIds.adset ?? '',
    ad: entityIds.ad ?? '',
    since, until,
    calls: String(discovery + transport.calls),
    budget: String(budget),
    at: new Date().toISOString(),
  };

  writeFileSync('META_CAPABILITY_MATRIX.md', matrixMd(results, ctx));
  writeFileSync('META_CAPABILITY_PROBE_REPORT.md', reportMd(results, ctx));

  const tally: Record<string, number> = {};
  for (const r of results) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
  console.log(`\n${discovery + transport.calls} API calls used of ${budget}`);
  console.log(Object.entries(tally).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  console.log('\nwrote META_CAPABILITY_MATRIX.md and META_CAPABILITY_PROBE_REPORT.md');
}

main().catch((e) => {
  // Never print the error verbatim — Meta echoes the request URL, token and all.
  console.error('probe run failed:', e instanceof Error ? e.message.slice(0, 200) : 'unknown');
  process.exit(1);
});
