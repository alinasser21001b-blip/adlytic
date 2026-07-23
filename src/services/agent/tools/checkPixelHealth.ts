// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/tools/checkPixelHealth.ts
//
//  Best-effort Pixel / Conversions API health check. Unlike every other
//  tool in this catalog, this one makes a LIVE Meta API call instead of
//  reading pre-synced Postgres — Meta's Dataset Quality API has no
//  equivalent in Adlytic's existing sync pipeline, and building a full
//  sync+schema pipeline for a surface whose permission viability is
//  unconfirmed would be speculative engineering. See PHASE3_IFA_DESIGN.md
//  §1.3 and the pixel-health task notes for the research trail:
//    - Dataset Quality API needs a `dataset_id` tied to Conversions API
//      (server-side) events — a different integration surface than the
//      ads_read-scoped campaign/insights reads this app already does.
//    - developers.facebook.com blocks scraped doc fetches, so the exact
//      permission requirement could not be independently confirmed here.
//
//  Consequence: THIS TOOL MUST DEGRADE GRACEFULLY. A permission error, a
//  missing pixel, or an account with no Conversions API integration at all
//  are all EXPECTED outcomes, not exceptional ones — never let a thrown
//  MetaApiError become an uncaught crash.
// ════════════════════════════════════════════════════════════════════════

import type { ToolHandler } from '../dispatcher';
import { ok, fail } from '../envelope';
import { MetaClient, MetaApiError } from '../../metaClient';
import { resolveAccountToken } from '../../accountToken';
import { decryptToken } from '../../tokenEncryption';
import { config } from '../../../config';

interface CheckPixelHealthArgs {
  // No args — pixel health is account-wide, not per-campaign. Meta ad
  // accounts typically have one primary pixel/dataset.
}

interface CheckPixelHealthResult {
  pixelId: string;
  pixelName: string;
  lastFiredAt: string | null;
  /** Per-event coverage the Dataset Quality API returned, verbatim. Empty
   *  array (not null) when the call succeeded but returned no events —
   *  distinct from "we couldn't check" (which is a fail() instead). */
  eventCoverage: Array<{ eventName: string; coveragePct: number | null; goalPct: number | null; description: string | null }>;
}

export function checkPixelHealthHandler(): ToolHandler<CheckPixelHealthArgs, CheckPixelHealthResult> {
  return {
    name: 'check_pixel_health',
    description:
      "Checks the ad account's Meta Pixel / Conversions API dataset health via Meta's live Dataset Quality API (event match quality, per-event coverage). This is a LIVE Meta call, not pre-synced data — it can fail with a permission or NOT_FOUND error on accounts without a Conversions API integration set up; treat that as a real 'not available for this account' answer, not a system error to retry. Use when the merchant asks about tracking, pixel setup, or conversion data quality.",
    schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    cacheTtlSeconds: 900,
    timeoutMs: 9000,
    async run(_args, ctx) {
      const { prisma, workspaceId } = ctx;

      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { adAccounts: true },
      });
      const account = ws?.adAccounts[0];
      if (!account) {
        return fail('NOT_FOUND', 'No ad account connected to this workspace', { retryable: false });
      }

      const resolved = await resolveAccountToken(prisma, account);
      if (!resolved.encrypted) {
        return fail('NOT_FOUND', 'No Meta access token available for this account', { retryable: false });
      }
      let accessToken: string;
      try {
        accessToken = decryptToken(resolved.encrypted);
      } catch {
        return fail('INTERNAL_ERROR', 'Stored Meta token could not be decrypted', { retryable: false });
      }

      const meta = new MetaClient({ apiVersion: config.meta.apiVersion, accessToken });

      let pixels;
      try {
        pixels = await meta.listPixels(account.externalAccountId);
      } catch (err) {
        return metaErrorToFail(err, 'listing pixels for this ad account');
      }
      const pixel = pixels[0];
      if (!pixel) {
        return fail('NOT_FOUND', 'No Meta Pixel / Dataset is registered on this ad account', {
          retryable: false,
          suggestion: 'The merchant needs to set up a Pixel or Conversions API dataset in Meta Events Manager first.',
        });
      }
      const pixelId = String(pixel['id'] ?? '');
      const pixelName = String(pixel['name'] ?? 'Pixel');
      const lastFiredAt = pixel['last_fired_time'] != null ? String(pixel['last_fired_time']) : null;

      let quality;
      try {
        quality = await meta.getDatasetQuality(pixelId);
      } catch (err) {
        return metaErrorToFail(err, `dataset quality for pixel ${pixelId}`);
      }
      if (!quality) {
        return fail('NOT_FOUND', 'Dataset Quality API returned no data for this pixel', { retryable: false });
      }

      const web = quality['web'] as Array<{ event_name?: unknown; event_coverage?: { percentage?: unknown; goal_percentage?: unknown; description?: unknown } }> | undefined;
      const eventCoverage = Array.isArray(web)
        ? web.map((e) => ({
            eventName: String(e.event_name ?? 'unknown'),
            coveragePct: typeof e.event_coverage?.percentage === 'number' ? e.event_coverage.percentage : null,
            goalPct: typeof e.event_coverage?.goal_percentage === 'number' ? e.event_coverage.goal_percentage : null,
            description: e.event_coverage?.description != null ? String(e.event_coverage.description) : null,
          }))
        : [];

      return ok<CheckPixelHealthResult>(
        { pixelId, pixelName, lastFiredAt, eventCoverage },
        { sourceTable: 'meta_live_api', latestRowDate: new Date().toISOString().slice(0, 10), stalenessMinutes: 0 },
      );
    },
  } satisfies ToolHandler<CheckPixelHealthArgs, CheckPixelHealthResult>;
}

function metaErrorToFail(err: unknown, context: string): import('../envelope').ToolResult<never> {
  if (err instanceof MetaApiError) {
    // 4xx other than 429 = permission/scope/not-found — never retryable.
    // 429/5xx = transient — worth a retry.
    const retryable = err.status === 429 || err.status >= 500;
    return fail(
      retryable ? 'TIMEOUT' : 'FORBIDDEN',
      `Meta API error while ${context}: ${err.message}`,
      { retryable, suggestion: retryable ? 'Try again shortly.' : 'This ad account likely lacks the required permission or Conversions API setup for pixel diagnostics.' },
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return fail('INTERNAL_ERROR', `Unexpected error while ${context}: ${msg}`, { retryable: false });
}

export type { CheckPixelHealthArgs, CheckPixelHealthResult };
