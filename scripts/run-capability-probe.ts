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
//    · The token travels in the Authorization header, NEVER the query
//      string: a URL-borne token leaks into proxy logs, caches, Referer
//      headers and Meta's own echoed error payloads.
//    · It is read from the environment, never printed, never written to
//      either output file, and stripped out of Meta's own error messages.
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
import { matrixMd, reportMd } from '../src/services/metaCapabilityReport';
import { metaGetRequest } from '../src/services/metaCapabilityRunner';

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
      const { url, init } = metaGetRequest(BASE, path, params, token);
      const res = await fetch(url, init);
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
    const { url, init } = metaGetRequest(BASE, path, params, token);
    const res = await fetch(url, init);
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

  const ctx = {
    apiVersion: API_VERSION,
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
