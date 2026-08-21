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
import { getBuildIdentity } from '../lib/buildIdentity';
import { resolveAccountToken } from './accountToken';
import { discoverProbeEntities } from './metaEntityDiscovery';
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

/**
 * Turn a thrown probe failure into something an operator can act on.
 *
 * The first real run returned a bare 500 with a truncated message and left no
 * server-side trace, so the failure was undiagnosable from either end. Every
 * branch here names a DIFFERENT next action — that is the point of splitting
 * them, and why they do not share a status code either.
 */
export function classifyProbeRunFailure(err: Error): {
  code: string; status: number; message: string;
} {
  const m = err.message.toLowerCase();

  if (err.name === 'TokenDecryptError') {
    return {
      code: 'TOKEN_DECRYPT_FAILED',
      status: 424,
      message: 'تعذّر فكّ تشفير رمز Meta المحفوظ لهذه المساحة — مفتاح التشفير تغيّر. '
        + 'أعد ربط الحساب، ولا تُعالجها كانتهاء صلاحية رمز: السببان مختلفان والإصلاحان مختلفان.',
    };
  }
  if (m.includes('no ad account')) {
    return {
      code: 'NO_AD_ACCOUNT',
      status: 400,
      message: 'هذه المساحة بلا حساب إعلاني مرتبط — لا يوجد ما يُسأل عنه.',
    };
  }
  if (m.includes('no stored meta token')) {
    return {
      code: 'NO_TOKEN',
      status: 424,
      message: 'الحساب الإعلاني موجود لكن بلا رمز Meta محفوظ. اربط الحساب أولاً.',
    };
  }
  // fetch() rejects (rather than resolving with a status) only when the
  // request never completed: DNS, TLS, or egress policy.
  if (m.includes('fetch failed') || m.includes('econnrefused') || m.includes('enotfound')
    || m.includes('getaddrinfo') || m.includes('certificate')) {
    return {
      code: 'META_UNREACHABLE',
      status: 502,
      message: 'تعذّر الوصول إلى graph.facebook.com من الخادم. '
        + 'هذا قيد شبكة على المضيف، لا حكم على أي قدرة.',
    };
  }
  return {
    code: 'PROBE_FAILED',
    status: 500,
    message: 'فشل تشغيل المرقاب. التفاصيل في الحقل detail وفي سجل الخادم.',
  };
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Build a Meta GET request with the token in the AUTHORIZATION HEADER.
 *
 * A token in the query string leaks along paths nobody audits: proxy access
 * logs, browser and CDN caches, `Referer` headers, APM traces, and — the one
 * that bites hardest here — Meta's own error payloads, which echo the
 * request URL back to us and which we then persist as probe evidence. The
 * header never appears in any of those.
 *
 * redact() stays as defence in depth. Two independent guarantees are not
 * redundancy; the first one failing is exactly when the second matters.
 *
 * Exported so a test can assert on the real construction rather than on a
 * reimplementation of it.
 */
export function metaGetRequest(
  base: string, path: string, params: Record<string, string>, token: string,
): { url: string; init: RequestInit } {
  const qs = new URLSearchParams(params);
  const q = qs.toString();
  return {
    url: `${base}${path}${q ? '?' + q : ''}`,
    init: { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
  };
}

/** GET-only transport. Deliberately exposes no method parameter. */
function httpTransport(token: string, base: string): ProbeTransport & { calls: number } {
  const t = {
    calls: 0,
    async rawGet(path: string, params: Record<string, string>) {
      t.calls += 1;
      const { url, init } = metaGetRequest(base, path, params, token);
      const res = await fetch(url, init);
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

  // ── Entity discovery ───────────────────────────────────────────────────
  //
  // Owned by metaEntityDiscovery.ts, which records every step: endpoint
  // class, HTTP status, Meta code, rows returned, summary.total_count and
  // whether a next page existed. The helper this replaced returned
  // `undefined` for a refusal and for an empty edge alike, which is why two
  // consecutive runs reported "no ad set found" and neither could say why.
  //
  // Discovery gets its own budget slice and its own transport closure so it
  // cannot accidentally inherit an insights parameter.
  const discovery = await discoverProbeEntities(
    async (path, params) => {
      const { url, init } = metaGetRequest(base, path, params, token);
      const res = await fetch(url, init);
      let body: unknown = null;
      try { body = await res.json(); } catch { body = null; }
      return { status: res.status, body };
    },
    account,
    remaining,
  );
  const entityIds = discovery.entityIds;
  const discoveryCalls = discovery.callsSpent;

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
    discoveryCalls: String(discoveryCalls),
    probeCalls: String(transport.calls),
    budget: String(budget),
    at: new Date().toISOString(),
    // Stamped so a probe report can never again be separated from the build
    // that produced it. Two runs with the same evidence and different builds
    // are two different experiments; two runs with the same build and the
    // same evidence are a reproduction. Without this the reader cannot tell
    // which one they are holding.
    build: getBuildIdentity(),
    discovery,
  };

  return {
    matrix: matrixMd(results, context),
    report: reportMd(results, context),
    results,
    context,
  };
}
