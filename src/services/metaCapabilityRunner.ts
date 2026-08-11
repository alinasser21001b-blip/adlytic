// ════════════════════════════════════════════════════════════════════════
//  src/services/metaCapabilityRunner.ts
//
//  Runs the capability probe for ONE workspace, resolving the token through
//  the same path the sync workers use, and returns the two documents.
//
//  Shared by the CLI runner and the admin route so a probe run produces the
//  same evidence however it was triggered.
//
//  READ-ONLY. Every Meta call is a GET; there is no code path here that can
//  POST, PATCH or DELETE against Meta, and none that writes to our database.
// ════════════════════════════════════════════════════════════════════════
import type { PrismaClient } from '@prisma/client';

import { config } from '../config';
import { resolveAccountToken } from './accountToken';
import {
  PROBE_CANDIDATES,
  redact,
  runCapabilityProbe,
  type ProbeResult,
  type ProbeTransport,
} from './metaCapabilityProbe';
import { matrixMd, reportMd, type ProbeRunContext } from './metaCapabilityReport';
import { decryptToken } from './tokenEncryption';

export interface CapabilityRunInput {
  workspaceId: string;
  maxCalls?: number;
  since?: string;
  until?: string;
}

export interface CapabilityRunOutput {
  /** Rendered META_CAPABILITY_MATRIX.md */
  matrix: string;
  /** Rendered META_CAPABILITY_PROBE_REPORT.md */
  report: string;
  /** Raw rows, for anyone who wants to diff runs programmatically. */
  results: ProbeResult[];
  context: ProbeRunContext;
}

/** Meta's own error payloads can carry the request URL, token included. */
export function redactProbeError(msg: string): string {
  return redact(msg);
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** GET-only transport. Deliberately exposes no method parameter. */
function httpTransport(token: string, base: string): ProbeTransport & { calls: number } {
  const t = {
    calls: 0,
    async rawGet(path: string, params: Record<string, string>) {
      t.calls += 1;
      const qs = new URLSearchParams({ ...params, access_token: token });
      const res = await fetch(`${base}${path}?${qs.toString()}`, { method: 'GET' });
      let body: unknown = null;
      try { body = await res.json(); } catch { body = null; }
      return { status: res.status, body };
    },
  };
  return t;
}

export async function runCapabilityProbeForWorkspace(
  prisma: PrismaClient,
  input: CapabilityRunInput,
): Promise<CapabilityRunOutput> {
  const apiVersion = config.meta.apiVersion;
  const base = `https://graph.facebook.com/${apiVersion}`;
  const budget = Math.min(Math.max(input.maxCalls ?? 40, 1), 40);

  const acct = await prisma.adAccount.findFirst({
    where: { workspaceId: input.workspaceId },
    select: {
      externalAccountId: true, accessTokenEncrypted: true,
      tokenSource: true, connectionId: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!acct) throw new Error(`workspace ${input.workspaceId} has no ad account`);

  const resolved = await resolveAccountToken(prisma, acct as never);
  if (!resolved.encrypted) throw new Error(`workspace ${input.workspaceId} has no stored Meta token`);

  // decryptToken throws TokenDecryptError on a key mismatch, and that is NOT
  // softened here: a key problem and an expired token are different incidents
  // with different fixes, and a probe run must not blur them.
  const token = decryptToken(resolved.encrypted);

  const remaining = { left: budget };
  const account = acct.externalAccountId;

  // Discover something real to probe against. These are ordinary list calls
  // production already makes, and they spend the same budget as everything else.
  const listOne = async (path: string): Promise<string | undefined> => {
    if (remaining.left <= 0) return undefined;
    remaining.left -= 1;
    const qs = new URLSearchParams({ fields: 'id', limit: '1', access_token: token });
    const res = await fetch(`${base}${path}?${qs.toString()}`, { method: 'GET' });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { data?: { id?: string }[] };
    return j.data?.[0]?.id;
  };

  const entityIds: { campaign?: string; adset?: string; ad?: string } = {};
  entityIds.campaign = await listOne(`/${account}/campaigns`);
  if (entityIds.campaign) entityIds.adset = await listOne(`/${entityIds.campaign}/adsets`);
  if (entityIds.adset) entityIds.ad = await listOne(`/${entityIds.adset}/ads`);
  const discoveryCalls = budget - remaining.left;

  const since = input.since ?? isoDaysAgo(2);
  const until = input.until ?? since;

  const transport = httpTransport(token, base);
  const results = await runCapabilityProbe(transport, PROBE_CANDIDATES, {
    externalAccountId: account,
    entityIds,
    maxCalls: remaining.left,
    since,
    until,
  });

  const context: ProbeRunContext = {
    apiVersion,
    account,
    campaign: entityIds.campaign ?? '',
    adset: entityIds.adset ?? '',
    ad: entityIds.ad ?? '',
    since,
    until,
    calls: String(discoveryCalls + transport.calls),
    budget: String(budget),
    at: new Date().toISOString(),
  };

  return {
    matrix: matrixMd(results, context),
    report: reportMd(results, context),
    results,
    context,
  };
}
