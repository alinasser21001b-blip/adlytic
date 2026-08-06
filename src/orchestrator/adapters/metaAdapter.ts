// ════════════════════════════════════════════════════════════════════════
//  src/orchestrator/adapters/metaAdapter.ts — Meta ProviderAdapter
//
//  Meta is the orchestrator's FIRST adapter, not its shape. Everything
//  Meta-specific (Graph endpoints, System User assignment, the act_ id
//  convention) lives behind this file; the engine sees only contracts.ts.
//
//  ── What this adapter automates ────────────────────────────────────────
//  The manual chore today is: the client approves Partner Access in their
//  Business Manager, then an operator opens Business Settings and assigns
//  the ad account to our System User by hand. The CREATE_CONNECTION step
//  does that assignment over Graph (`POST /{act_id}/assigned_users`), then
//  writes the MetaConnection (the single source of auth truth) plus a
//  token-less AdAccount row pointing at it, and hands off to the existing
//  sync. The AdAccount NEVER stores a copy of the System User token: it is
//  written with tokenSource='SYSTEM_USER', connectionId set and
//  accessTokenEncrypted=null, which is exactly the shape the background
//  auto-sync's SYSTEM_USER branch selects for.
//
//  ── Capability tiers, honestly applied ─────────────────────────────────
//  STATIC  — read straight from config. Free.
//  PROBED  — ONE System User account listing per detection. That single
//            call answers "is the asset visible yet?", which is the only
//            question the whole flow actually hinges on.
//  `requestPending` stays false on purpose: Meta exposes no cheap, reliable
//  signal for "a partner-access request is pending on this asset". Rather
//  than invent an endpoint or burn quota on a guess, we leave it false and
//  let AWAIT_EXTERNAL_GRANT poll for visibility — the observable truth.
//
//  OPTIMISTIC capabilities (can we actually assign this asset?) are never
//  pre-computed. We attempt the assignment and degrade to BLOCKED with a
//  concrete Arabic requirement when Meta refuses on permissions. That is
//  the contract's rule, implemented literally.
// ════════════════════════════════════════════════════════════════════════

import type {
  CapabilitySet,
  OnboardingContext,
  PlannedStep,
  ProviderAdapter,
  ReconcileResult,
  StepOutcome,
} from '../contracts';
import { nextCheckDelayMs } from '../polling';
import { config } from '../../config';
import {
  buildMetaOAuth,
  fetchMetaAdAccountsByToken,
  type MetaAdAccountInfo,
} from '../../services/metaOAuth';
import { upsertMetaConnection } from '../../services/metaConnectionStore';
import { currencyMinorFactorFor } from '../../lib/currency';
import { kickoffInitialSync } from '../../lib/initialSync';

// Stable step ids — they survive re-planning, so `currentStepId` stays
// meaningful even when the plan shape changes between transitions.
export const META_STEP_AWAIT_GRANT = 'META_AWAIT_GRANT';
export const META_STEP_CREATE_CONNECTION = 'META_CREATE_CONNECTION';
export const META_STEP_START_SYNC = 'META_START_SYNC';

/**
 * Local twin of server.ts's `normalizeEnvAccessToken` (which is not
 * exported). Operators paste tokens with stray quotes and newlines; this
 * keeps a formatting mistake from looking like an auth failure.
 * Never log the result.
 */
function normalizeToken(raw: string | null | undefined): string {
  if (!raw) return '';
  let token = raw.trim().replace(/[\r\n]+/g, '');
  if (!token) return '';
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token.replace(/^bearer\s+/i, '').trim();
}

/** Single-line, truncated, token-free error text safe to persist/show. */
function sanitize(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, ' ').trim().slice(0, 280);
}

/** Meta returns permission refusals across a few codes/shapes. */
function isPermissionError(message: string): boolean {
  return /permission|not authorized|unauthorized|\(#200\)|\(#10\)|\(#3\)|#294|does not have/i.test(message);
}

const BLOCKED_ASSIGN_REQUIREMENT =
  'لا يملك مستخدم النظام صلاحية إسناد هذا الحساب الإعلاني تلقائيًا. ' +
  'افتح إعدادات الأعمال لدى العميل (Business Settings → الحسابات الإعلانية) ' +
  'وأسند الحساب إلى مستخدم النظام الخاص بنا بصلاحية "عرض الأداء" على الأقل، ثم اضغط "تحقق الآن".';

/**
 * The MetaConnection row requires a non-null `businessId`. When Meta gives
 * us no Business Manager we fall back to a stable, System-User-derived
 * placeholder — the SAME convention as server.ts's `resolveBusinessId`, so
 * the orchestrator and the OAuth flows converge on one connection row per
 * (workspace, business) instead of silently forking into two.
 * Pure — unit-tested in test_orchestrator.ts.
 */
export function resolveConnectionBusinessId(
  businessId: string | undefined | null,
  systemUserId: string | undefined | null,
): string {
  if (businessId) return businessId;
  return systemUserId ? `su_${systemUserId}` : 'unknown';
}

interface VisibilityProbe {
  accounts: MetaAdAccountInfo[];
  systemUserId?: string;
  /** Owning Business Manager, when the probe could resolve it. */
  businessId?: string;
  businessName?: string;
  /** Scopes the System User token actually carries (empty when unknown). */
  scopes: string[];
}

export class MetaAdapter implements ProviderAdapter {
  readonly provider = 'META' as const;
  /** Meta has no reliable "partner access approved" webhook — we poll. */
  readonly supportsEvents = false;

  private token(): string {
    return normalizeToken(config.meta.systemUserToken);
  }

  /** ONE probe call: what does our System User currently see? */
  private async probeVisibility(): Promise<VisibilityProbe> {
    const token = this.token();
    if (!token) return { accounts: [], scopes: [] };
    const oauth = buildMetaOAuth();
    if (oauth) {
      const resolved = await oauth.resolveSystemUserConnection(token);
      return {
        accounts:     resolved.accounts,
        systemUserId: resolved.systemUserId,
        businessId:   resolved.businessId,
        businessName: resolved.businessName,
        scopes:       resolved.scopes ?? [],
      };
    }
    // No app credentials: a raw account listing is all we get. Recover the
    // Business Manager from the accounts themselves when Meta returns it.
    const accounts = await fetchMetaAdAccountsByToken(token, config.meta.apiVersion);
    const biz = accounts.find((a) => a.business?.id)?.business;
    return { accounts, businessId: biz?.id, businessName: biz?.name, scopes: [] };
  }

  private staticCaps() {
    const appId = config.meta.appId;
    const appSecret = config.meta.appSecret;
    return {
      hasSystemUserToken: this.token().length > 0,
      hasAppCredentials: Boolean(appId && appSecret),
      canLoginForBusiness: Boolean(appId && appSecret && config.meta.systemUserConfigId),
    };
  }

  async detectCapabilities(ctx: OnboardingContext): Promise<CapabilitySet> {
    const staticCaps = this.staticCaps();
    const detectedAt = new Date().toISOString();

    const alreadyLinked = Boolean(
      await ctx.prisma.adAccount.findFirst({
        where: { externalAccountId: ctx.externalAccountId },
        select: { id: true },
      }),
    );

    let assetVisible = false;
    try {
      const probe = await this.probeVisibility();
      assetVisible = probe.accounts.some((a) => a.id === ctx.externalAccountId);
    } catch (err) {
      // A Meta failure must not fabricate capabilities. Report STATIC only
      // and let the step layer surface the real error with a retry.
      console.warn(`[orchestrator:meta] capability probe failed: ${sanitize(err)}`);
      return {
        static: staticCaps,
        probed: { assetVisible: false, requestPending: false, alreadyLinked },
        detectedAt,
      };
    }

    return {
      static: staticCaps,
      probed: {
        assetVisible,
        // Deliberately false — see the header note. Meta gives no cheap,
        // reliable "request pending" signal, and guessing here would make
        // the timeline lie to the operator.
        requestPending: false,
        alreadyLinked,
      },
      detectedAt,
    };
  }

  /** Pure — capabilities in, ordered steps out. Unit-testable without I/O. */
  planSteps(caps: CapabilitySet, _ctx: OnboardingContext): PlannedStep[] {
    const startSync: PlannedStep = {
      id: META_STEP_START_SYNC,
      kind: 'START_SYNC',
      label: 'بدء أول مزامنة للبيانات',
      targetState: 'READY',
    };
    const createConnection: PlannedStep = {
      id: META_STEP_CREATE_CONNECTION,
      kind: 'CREATE_CONNECTION',
      label: 'إسناد الحساب الإعلاني وربطه بالمنصة',
      targetState: 'CONNECTING',
    };
    const awaitGrant: PlannedStep = {
      id: META_STEP_AWAIT_GRANT,
      kind: 'AWAIT_EXTERNAL_GRANT',
      label: 'بانتظار موافقة العميل على منح الوصول',
      targetState: 'VERIFYING',
    };

    if (caps.probed.alreadyLinked) return [startSync];
    if (caps.probed.assetVisible) return [createConnection, startSync];
    return [awaitGrant, createConnection, startSync];
  }

  async execute(step: PlannedStep, ctx: OnboardingContext): Promise<StepOutcome> {
    switch (step.id) {
      case META_STEP_AWAIT_GRANT:
        return this.executeAwaitGrant(ctx);
      case META_STEP_CREATE_CONNECTION:
        return this.executeCreateConnection(ctx);
      case META_STEP_START_SYNC:
        return this.executeStartSync(ctx);
      default:
        return { status: 'FAILED', retryable: false, reason: `Unknown step ${step.id}` };
    }
  }

  private async executeAwaitGrant(ctx: OnboardingContext): Promise<StepOutcome> {
    let probe: VisibilityProbe;
    try {
      probe = await this.probeVisibility();
    } catch (err) {
      return { status: 'FAILED', retryable: true, reason: sanitize(err) };
    }
    if (probe.accounts.some((a) => a.id === ctx.externalAccountId)) {
      return { status: 'DONE', note: 'ظهر الحساب الإعلاني لدى مستخدم النظام — تمت الموافقة.' };
    }
    return {
      status: 'WAITING_EXTERNAL',
      pollAfterMs: nextCheckDelayMs(0) ?? 30_000,
      note: 'لم يظهر الحساب بعد — بانتظار موافقة العميل في مدير الأعمال.',
    };
  }

  /**
   * The step that removes the manual chore: assign the (already visible)
   * asset to our System User, then persist the local AdAccount row.
   * Idempotent — Meta accepts a repeat assignment, and the AdAccount write
   * is an upsert on the unique (platform, externalAccountId).
   */
  private async executeCreateConnection(ctx: OnboardingContext): Promise<StepOutcome> {
    const token = this.token();
    if (!token) {
      return {
        status: 'BLOCKED',
        requirement: 'لم يتم ضبط META_SYSTEM_USER_TOKEN على الخادم — لا يمكن إتمام الربط تلقائيًا.',
      };
    }

    let probe: VisibilityProbe;
    try {
      probe = await this.probeVisibility();
    } catch (err) {
      return { status: 'FAILED', retryable: true, reason: sanitize(err) };
    }

    const info = probe.accounts.find((a) => a.id === ctx.externalAccountId);
    if (!info) {
      return {
        status: 'WAITING_EXTERNAL',
        pollAfterMs: nextCheckDelayMs(0) ?? 30_000,
        note: 'الحساب لم يعد ظاهرًا لمستخدم النظام — بانتظار منح الوصول.',
      };
    }

    // ── Assign the asset to the System User (the automated chore) ──────
    if (probe.systemUserId) {
      const params = new URLSearchParams({
        user: probe.systemUserId,
        tasks: JSON.stringify(['ANALYZE']),
      });
      try {
        const res = await fetch(
          `https://graph.facebook.com/${config.meta.apiVersion}/${encodeURIComponent(ctx.externalAccountId)}/assigned_users`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          },
        );
        const data = (await res.json()) as Record<string, unknown>;
        if (data['error']) {
          const e = data['error'] as Record<string, unknown>;
          const message = String(e['message'] ?? e['type'] ?? 'unknown error');
          // OPTIMISTIC capability degrading gracefully: we could not know
          // in advance whether we may assign — now we do, and we ask for
          // the one specific thing that unblocks it.
          if (isPermissionError(message) || res.status === 403) {
            return { status: 'BLOCKED', requirement: BLOCKED_ASSIGN_REQUIREMENT };
          }
          return { status: 'FAILED', retryable: true, reason: sanitize(message) };
        }
      } catch (err) {
        return { status: 'FAILED', retryable: true, reason: sanitize(err) };
      }
    }

    // ── Persist auth ONCE, on the MetaConnection ───────────────────────
    // MetaConnection is the single source of authentication truth. The
    // AdAccount below deliberately stores NO token: it points at this
    // connection instead, so rotating META_SYSTEM_USER_TOKEN in the
    // environment updates one row and every account follows.
    //
    // `businessId` is required and non-null on MetaConnection — see
    // resolveConnectionBusinessId for the fallback convention.
    const businessId = resolveConnectionBusinessId(probe.businessId, probe.systemUserId);
    if (!probe.businessId) {
      console.warn(
        `[orchestrator:meta] Could not resolve a Business Manager id from Meta — falling back to "${businessId}". The MetaConnection will use this placeholder business id.`,
      );
    }

    let connectionId: string;
    try {
      connectionId = await upsertMetaConnection(ctx.prisma, {
        workspaceId:     ctx.workspaceId,
        businessId,
        businessName:    probe.businessName ?? null,
        systemUserId:    probe.systemUserId ?? null,
        token,
        scopes:          probe.scopes,
        grantedAssetIds: probe.accounts.map((a) => a.id),
        configId:        config.meta.systemUserConfigId,
      });
    } catch (err) {
      return { status: 'FAILED', retryable: true, reason: sanitize(err) };
    }

    // ── Persist the local AdAccount (pure account representation) ──────
    const name = info.name?.trim() ? info.name : `Meta Ad Account ${info.id}`;
    const currency = info.currency?.trim() ? info.currency.toUpperCase() : 'USD';
    const timezone = info.timezone_name?.trim() ? info.timezone_name : 'UTC';

    try {
      const account = await ctx.prisma.adAccount.upsert({
        where: { platform_externalAccountId: { platform: 'META', externalAccountId: info.id } },
        update: {
          name,
          currency,
          currencyMinorFactor: currencyMinorFactorFor(currency),
          timezone,
          status: 'ACTIVE',
          // Auth now lives on the connection — see the note above. These
          // three fields together are exactly what the background auto-sync
          // SYSTEM_USER branch matches on (src/workers/backgroundScheduler.ts).
          tokenSource: 'SYSTEM_USER',
          connectionId,
          accessTokenEncrypted: null,
          tokenExpiresAt: null,
        },
        create: {
          workspaceId: ctx.workspaceId,
          platform: 'META',
          externalAccountId: info.id,
          name,
          currency,
          currencyMinorFactor: currencyMinorFactorFor(currency),
          timezone,
          status: 'ACTIVE',
          tokenSource: 'SYSTEM_USER',
          connectionId,
          accessTokenEncrypted: null,
          tokenExpiresAt: null,
        },
        select: { id: true },
      });
      await ctx.prisma.connectionOnboarding.update({
        where: { id: ctx.onboardingId },
        data: { linkedAdAccountId: account.id },
      });
      return {
        status: 'DONE',
        note: `تم إسناد الحساب ${info.id} وربطه بالمنصة.`,
        data: { adAccountId: account.id },
      };
    } catch (err) {
      return { status: 'FAILED', retryable: true, reason: sanitize(err) };
    }
  }

  /** Hand off to the existing sync pipeline — the orchestrator stops here. */
  private async executeStartSync(ctx: OnboardingContext): Promise<StepOutcome> {
    const account = await this.linkedAccount(ctx);
    if (!account) {
      return { status: 'FAILED', retryable: true, reason: 'No local AdAccount row to sync yet.' };
    }
    try {
      await kickoffInitialSync(ctx.prisma, account.id, 'orchestrator');
    } catch (err) {
      return { status: 'FAILED', retryable: true, reason: sanitize(err) };
    }
    return {
      status: 'DONE',
      note: 'تم تشغيل أول مزامنة للبيانات.',
      data: { adAccountId: account.id },
    };
  }

  private async linkedAccount(ctx: OnboardingContext) {
    if (ctx.linkedAdAccountId) {
      const byId = await ctx.prisma.adAccount.findUnique({
        where: { id: ctx.linkedAdAccountId },
        select: { id: true, lastSyncedAt: true },
      });
      if (byId) return byId;
    }
    return ctx.prisma.adAccount.findFirst({
      where: { externalAccountId: ctx.externalAccountId },
      select: { id: true, lastSyncedAt: true },
    });
  }

  /** Read-only. Answers "is this step's effect already true?" — no writes. */
  async verify(step: PlannedStep, ctx: OnboardingContext): Promise<StepOutcome> {
    if (step.id === META_STEP_START_SYNC) {
      const account = await this.linkedAccount(ctx);
      if (account?.lastSyncedAt) {
        return { status: 'DONE', note: 'البيانات مزامَنة مسبقًا.' };
      }
      return { status: 'FAILED', retryable: true, reason: 'not-yet-synced' };
    }

    let visible = false;
    try {
      const probe = await this.probeVisibility();
      visible = probe.accounts.some((a) => a.id === ctx.externalAccountId);
    } catch (err) {
      return { status: 'FAILED', retryable: true, reason: sanitize(err) };
    }

    if (step.id === META_STEP_AWAIT_GRANT) {
      return visible
        ? { status: 'DONE', note: 'الحساب ظاهر لمستخدم النظام.' }
        : { status: 'WAITING_EXTERNAL', pollAfterMs: nextCheckDelayMs(0) ?? 30_000 };
    }

    if (step.id === META_STEP_CREATE_CONNECTION) {
      const account = await this.linkedAccount(ctx);
      if (visible && account) return { status: 'DONE', note: 'الربط المحلي موجود مسبقًا.' };
      return visible
        ? { status: 'FAILED', retryable: true, reason: 'local-account-missing' }
        : { status: 'WAITING_EXTERNAL', pollAfterMs: nextCheckDelayMs(0) ?? 30_000 };
    }

    return { status: 'FAILED', retryable: false, reason: `Unknown step ${step.id}` };
  }

  /** Re-derive the truth from Meta + the local DB, ignoring stored state. */
  async reconcile(ctx: OnboardingContext): Promise<ReconcileResult> {
    const account = await this.linkedAccount(ctx);
    if (account) {
      return account.lastSyncedAt
        ? { corrected: true, actualState: 'READY', note: 'الحساب مربوط والبيانات مزامَنة.' }
        : { corrected: true, actualState: 'SYNCING', note: 'الحساب مربوط وبانتظار اكتمال المزامنة.' };
    }

    let visible = false;
    try {
      const probe = await this.probeVisibility();
      visible = probe.accounts.some((a) => a.id === ctx.externalAccountId);
    } catch (err) {
      return { corrected: false, note: `تعذّر الوصول إلى Meta: ${sanitize(err)}` };
    }

    return visible
      ? { corrected: true, actualState: 'CONNECTING', note: 'الحساب ظاهر لكن لم يُنشأ سجل محلي بعد.' }
      : { corrected: true, actualState: 'WAITING_EXTERNAL_ACTION', note: 'الحساب غير ظاهر — بانتظار منح الوصول.' };
  }
}

/** Shared singleton — the adapter is stateless. */
export const metaAdapter = new MetaAdapter();
