// ════════════════════════════════════════════════════════════════════════
//  src/api/types.ts — MIRROR of the backend response DTOs this app renders.
//
//  Adlytic's server has no published package the app can import types from
//  (src/services/getDashboard.ts et al. live in a plain TS server, not a
//  library), so these are hand-transcribed rather than imported. That is a
//  real risk — a mirror can drift from what it mirrors — and it is not left
//  to discipline: test_mobile_contract.ts (repo root) fetches a live
//  dashboard/campaign/why response through a locally booted server and
//  asserts every field this file reads is present with the type declared
//  here. A silent backend rename fails that test, not a customer's screen.
//
//  RULE THIS FILE FOLLOWS EVERYWHERE: a field typed `| null` stays optional
//  chained and rendered as "missing", never coalesced to 0/""/false. See
//  src/components/Metric.tsx, which is the only place a metric is FORMATTED.
// ════════════════════════════════════════════════════════════════════════

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface MeWorkspace {
  id: string;
  name: string;
}
export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  memberships: Array<{ id: string; role: string; workspace: MeWorkspace }>;
}

export type HealthBand = 'excellent' | 'good' | 'attention' | 'poor' | 'none' | 'critical' | 'unknown';

export interface KpiDTO {
  key: string;
  label: string;
  value: number | null;
  display: string;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
  goodWhenUp: boolean;
}

export interface IssueDTO {
  code: string;
  title: string;
  severity: string;
  causes: string[];
  recommendations: string[];
}

export interface PriorityActionDTO {
  actionCode: string;
  priority: string;
  text: string;
  costDisplay?: string | null;
  expectation?: string;
  evidence?: string[];
}

export interface CampaignCardDTO {
  id: string;
  metaId: string;
  name: string;
  health: number;
  band: string;
  messages: number;
  ctr: number | null;
  cpm: number | null;
  frequency: number | null;
}

// ── GET /api/workspaces/:id/campaigns — the list this app actually renders.
//
// NOT dashboard.campaigns/bestCampaign/worstCampaign (CampaignCardDTO above).
// Those depend on a CAMPAIGN-level row in `health_scores`, and tracing
// runEngines.ts confirmed nothing in the current pipeline ever writes one —
// every HealthScoreEngine.run() call in the codebase is EntityType.ACCOUNT
// only. Verified live: a freshly mock-connected account with 2 actively
// delivering campaigns returned campaigns:[] here. The web app already
// avoids this by using the endpoint below for its own campaigns list
// (campaignsPage.ts) — this app does the same, not a new decision. Recorded
// as POST_ALPHA debt in ALPHA_LAUNCH.md; not fixed here because Alpha's own
// journey no longer depends on it once this app reads the working endpoint.
export interface ObjectiveKpiCardDTO {
  key: string;
  labelAr: string;
  value: number | null;
  display: string;
  /** True when the number is a proxy. The UI MUST label it — never render as exact. */
  approximate: boolean;
  priority: number;
}

export type DeliveryTier =
  | 'DELIVERING_TODAY' | 'DELIVERING_WINDOW' | 'ACCOUNT_HALTED'
  | 'DORMANT_ACTIVE' | 'NOT_DELIVERING' | 'PAUSED' | 'ARCHIVED' | 'DELETED';

export interface CampaignListItemDTO {
  id: string;
  name: string;
  status: string;
  deliveryTier: DeliveryTier;
  /** Ordered, objective-specific; index 0 is the headline. Null when the
   *  purpose could not be resolved — render nothing, never a guessed layout. */
  objectiveKpis: { family: string; cards: ObjectiveKpiCardDTO[] } | null;
}

export interface DashboardDTO {
  empty?: true;
  accountHold?: { reason: string; sinceDisplay?: string } & Record<string, unknown>;
  workspace?: {
    id: string;
    name: string;
    currency: string;
    currencyMinorFactor: number;
    lastSyncedAt: string | null;
    activeCampaigns: number;
  };
  health: {
    score: number | null;
    band: HealthBand;
    confidence: string | null;
    source: 'objective' | 'legacy' | 'none';
  };
  kpis: KpiDTO[];
  issues: IssueDTO[];
  priorityAction: PriorityActionDTO | null;
  bestCampaign: CampaignCardDTO | null;
  worstCampaign: CampaignCardDTO | null;
  campaigns?: CampaignCardDTO[];
}

export interface CampaignDetailDTO {
  id: string;
  name: string;
  status: string;
  externalCampaignId: string;
  objective: string | null;
}

// ── /why — the customer-safe reasoning chain (src/services/campaignWhy.ts) ─

export interface WhyStageDTO {
  ordinal: number;
  stage: string;
  labelAr: string;
  status: 'REACHED' | 'NOT_REACHED';
  findingAr: string | null;
  absenceAr: string | null;
}

export interface WhyDataTruthDTO {
  presenceAr: string | null;
  coverageAr: string | null;
  settlementAr: string | null;
  dataConfidenceAr: string | null;
  daysStored: number;
  daysMissing: number;
  windowSince: string;
  windowUntil: string;
  lastSyncedAt: string | null;
}

export interface CampaignWhyDTO {
  campaign: { id: string; name: string; status: string };
  chain: WhyStageDTO[];
  dataTruth: WhyDataTruthDTO;
  purpose: {
    reasonAr: string | null;
    primaryKpiLabelAr: string;
    resultApproximate: boolean;
  };
  diagnosis: {
    problemClassAr: string | null;
    confidenceAr: string | null;
    alert: boolean;
    counterEvidenceAr: string[];
    breakPresentButNotUnusual: boolean;
  };
  evidence: Array<{ issueCode: string; titleAr: string; severityAr: string; date: string }>;
  recommendation: { actionAr: string | null; forbiddenAr: string[] } | null;
  deterministic: boolean;
}

// ── Meta OAuth ──────────────────────────────────────────────────────────

export interface MetaOAuthStartResponse {
  configured: boolean;
  url?: string;
  sessionId?: string;
  mock?: boolean;
  directToken?: boolean;
  systemUser?: boolean;
  reason?: string;
  message?: string;
}

export interface MetaAdAccountInfo {
  id: string;
  name: string;
  currency?: string;
}

export interface MetaOAuthAccountsResponse {
  accounts: MetaAdAccountInfo[];
  workspaceId: string;
}

export interface TokenHealthResponse {
  ok: boolean;
  [k: string]: unknown;
}

/** Shape of every error body this API returns — checked structurally, not by field presence alone. */
export interface ApiErrorBody {
  error: string;
  code?: string;
  reasonAr?: string;
}
