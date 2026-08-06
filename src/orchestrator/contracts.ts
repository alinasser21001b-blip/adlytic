// ════════════════════════════════════════════════════════════════════════
//  src/orchestrator/contracts.ts — THE FROZEN CONTRACT
//
//  Connection Orchestrator: the subsystem that establishes and maintains a
//  provider connection. Meta is its first Adapter, not its shape.
//
//  ── Boundary (deliberate, do not widen) ────────────────────────────────
//  The orchestrator OWNS: capability detection, planning, step execution,
//  verification, reconciliation, and the audit timeline.
//  It does NOT own: sync scheduling, the ETL pipeline, or dashboards. It
//  hands off to the existing sync worker once an AdAccount is ready. Every
//  "orchestrator" that ignores this boundary becomes a god-object.
//
//  ── Capability tiers (the load-bearing idea) ───────────────────────────
//  Capabilities are NOT one pre-computed list. They come in three tiers
//  with different costs, and conflating them either burns Graph API quota
//  on every page load (threatening the access-tier error-rate gate) or
//  blocks a path that would actually have worked:
//
//    STATIC     — derived from config/env. Free. Valid until redeploy.
//    PROBED     — one cheap API call. Cached per scope, short TTL.
//    OPTIMISTIC — unknowable without attempting the action itself.
//
//  RULE: OPTIMISTIC capabilities MUST NEVER be pre-computed and MUST NEVER
//  block a plan. They are modelled as "attempt, and degrade gracefully on
//  failure". `detectCapabilities` therefore returns STATIC + PROBED only.
//
//  ── Why verify() and reconcile() exist ─────────────────────────────────
//  Retry is not the hard problem; reconciliation is. If we assign an asset
//  on Meta and crash before writing ASSIGNED locally, a retry-only engine
//  believes the work never happened. Every step that touches an external
//  system must be checkable (`verify`) and the whole record must be
//  re-derivable from external truth (`reconcile`).
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

// ── Provider-neutral vocabulary ─────────────────────────────────────────

export type ProviderName = 'META' | 'GOOGLE_ADS' | 'TIKTOK';

/**
 * Provider-neutral lifecycle. Each provider's own flow maps onto these:
 *   Meta        — partner request → client approves in BM → assign asset → sync
 *   Google Ads  — MCC link invite → customer accepts in Google Ads → sync
 *   TikTok      — Business Center invite → accept → sync
 * If a future provider does not map, the abstraction is wrong — fix the
 * abstraction, do not add a provider-specific state.
 */
export type OnboardingStateName =
  | 'REQUEST_CREATED'
  | 'WAITING_EXTERNAL_ACTION'
  | 'CONNECTING'
  | 'VERIFYING'
  | 'SYNCING'
  | 'READY'
  | 'BLOCKED'
  | 'FAILED';

/** Generic step kinds. Adapters translate these into their own API calls. */
export type StepKind =
  | 'AWAIT_EXTERNAL_GRANT'  // a human must approve on the provider's surface
  | 'ASSIGN_ASSET'          // grant our service identity access to the asset
  | 'CREATE_CONNECTION'     // persist the local connection/account record
  | 'START_SYNC'            // hand off to the sync worker
  | 'VERIFY_DATA';          // confirm data actually landed

export interface PlannedStep {
  /** Stable id, unique within a plan. Survives re-planning. */
  id: string;
  kind: StepKind;
  /** Operator-facing label (Arabic) rendered in the timeline. */
  label: string;
  /** State the record moves to once this step reports DONE. */
  targetState: OnboardingStateName;
}

// ── Capabilities ────────────────────────────────────────────────────────

/** Free to compute — read from config/env. Cached until redeploy. */
export interface StaticCapabilities {
  /** A System User token is configured for this deployment. */
  hasSystemUserToken: boolean;
  /** App id + secret are present (needed for token validation). */
  hasAppCredentials: boolean;
  /** App is Live with a Login-for-Business configuration available. */
  canLoginForBusiness: boolean;
}

/** One cheap API call each. Cached per business/account, short TTL. */
export interface ProbedCapabilities {
  /** The asset is already visible to our service identity. */
  assetVisible: boolean;
  /** A grant request for this asset is pending on the provider side. */
  requestPending: boolean;
  /** A local account record already exists for this asset. */
  alreadyLinked: boolean;
}

export interface CapabilitySet {
  static: StaticCapabilities;
  probed: ProbedCapabilities;
  /** ISO timestamp — lets the engine reason about staleness. */
  detectedAt: string;
  /**
   * OPTIMISTIC capabilities are intentionally ABSENT from this type.
   * `canAssignAsset` / `canRequestGrant` cannot be known without trying;
   * modelling them here would force either a wasted probe call or a wrong
   * guess. They surface instead as a BLOCKED StepOutcome at execute() time.
   */
}

// ── Step outcomes ───────────────────────────────────────────────────────

/**
 * BLOCKED is deliberately distinct from FAILED: it is not an error, it is
 * a missing prerequisite. The UI renders it as "the one thing still
 * needed" — which is the entire point of the guided experience.
 */
export type StepOutcome =
  | { status: 'DONE'; note?: string; data?: Record<string, unknown> }
  | { status: 'WAITING_EXTERNAL'; pollAfterMs: number; note?: string }
  | { status: 'BLOCKED'; requirement: string }
  | { status: 'FAILED'; retryable: boolean; reason: string };

export interface ReconcileResult {
  /** True when external truth disagreed with our stored state. */
  corrected: boolean;
  /** State the record should actually be in, per the provider. */
  actualState?: OnboardingStateName;
  note?: string;
}

// ── Execution context ───────────────────────────────────────────────────

export interface OnboardingContext {
  onboardingId: string;
  workspaceId: string;
  provider: ProviderName;
  /** Provider-scoped asset id (Meta: "act_123456"). */
  externalAccountId: string;
  attempts: number;
  /** Set once the local account record exists. */
  linkedAdAccountId: string | null;
  prisma: PrismaClient;
}

// ── The Adapter contract ────────────────────────────────────────────────

/**
 * One implementation per ad platform. The engine knows ONLY this interface.
 *
 * Design rule enforced at review time: never shape this interface around a
 * single provider. Before changing it, sketch how the next provider would
 * implement it — if that sketch does not fit, the change is Meta-specific
 * logic wearing a generic name.
 */
export interface ProviderAdapter {
  readonly provider: ProviderName;
  /**
   * Whether this provider can push us grant/approval events. When false the
   * engine falls back to adaptive polling. Meta is currently false: there is
   * no reliable webhook for "partner access approved".
   */
  readonly supportsEvents: boolean;

  /** STATIC + PROBED tiers only. Never OPTIMISTIC. */
  detectCapabilities(ctx: OnboardingContext): Promise<CapabilitySet>;

  /**
   * Pure: capabilities in, ordered steps out. Called on EVERY transition,
   * never once at creation — a plan frozen at creation goes stale the
   * moment a capability changes (App Review landing mid-flight, an asset
   * being granted early, access being revoked).
   */
  planSteps(caps: CapabilitySet, ctx: OnboardingContext): PlannedStep[];

  /** Perform the step's side effect. Must be idempotent. */
  execute(step: PlannedStep, ctx: OnboardingContext): Promise<StepOutcome>;

  /** Read-only: is this step's effect actually true on the provider? */
  verify(step: PlannedStep, ctx: OnboardingContext): Promise<StepOutcome>;

  /** Re-derive the true state from the provider, ignoring stored state. */
  reconcile(ctx: OnboardingContext): Promise<ReconcileResult>;
}

/** Terminal states never re-enter the poller. */
export const TERMINAL_STATES: ReadonlySet<OnboardingStateName> = new Set([
  'READY',
  'FAILED',
]);
