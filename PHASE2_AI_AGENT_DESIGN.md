# Phase 2 — Adlytic Smart Assistant: Agent Architecture Design (v2)

**Status:** Proposed — awaiting user approval before implementation.
**Version:** v2 — deepened from initial draft with proactive discovery, 4 new tools, model routing, evaluation harness, and streaming UX.
**Applies:** `src/services/ClaudeCMO.ts`, `src/services/aiContextBuilder.ts`, `src/services/aiContextBuilderV5.ts`, `src/services/aiKnowledgeContext.ts`, `src/services/claudeClient.ts`, `src/api/server.ts:2384-2436` (chat endpoint), `prisma/schema.prisma` (new tables), `src/web/pages/aiPage.ts` (streaming UI).

---

## 1. Goal

Turn the current "rule engine that outsources Arabic wording to Claude" into a **real analytical CMO agent** that:

- Talks to PostgreSQL **directly through 12 typed tools** — no bulk context injection.
- Uses historical data as a **comparison instrument**, never as the answer.
- Classifies campaigns into **best / mid / worst** with a per-campaign "what makes it unique" derived from statistical differentiation, not LLM guessing.
- **Detects anomalies proactively** — the agent volunteers "your campaign X drifted 2.5σ from its baseline this morning" without being asked.
- **Runs a daily autonomous brief** — every morning, produces a "insight of the day" using tools, persisted to the merchant's dashboard.
- Remembers the conversation across turns.
- Answers in natural Arabic (Iraqi/Gulf register) without English jargon leakage.
- **Routes work between Haiku (fast classifier) and Sonnet (deep analyst)** to keep cost and latency under control.
- Streams responses so the merchant sees progress during multi-tool turns.

The user's pipeline stays intact:

```
Meta Ads → Data Collector → PostgreSQL (single source of truth)
    → Analytics + Historical Engines → Decision Engine → LLM Agent → Recommendations
```

Change: the LLM step becomes a Claude **agent with tools**, not a translator. Rule engines remain the deterministic decision floor the agent stands on.

---

## 2. Architecture pattern

**Chosen pattern:** Single Agent Pattern with model routing (per `agent-designer/references/agent_architecture_patterns.md`).

**Why not supervisor / swarm / hierarchical:**

| Criterion | Adlytic reality | Fit |
|---|---|---|
| Agent count | One conversational role (the CMO) | Single |
| Task complexity | Medium–High — analyze, compare, rank, explain, detect | Single suffices with rich tools |
| Coordination need | Low — no parallel workers | Single |
| Fault tolerance | Not a system-of-systems; one degraded reply is acceptable | Single |
| Latency budget | Chat UX expects &lt;5s p50; streaming can extend to 15s p95 | Single (multi-agent adds RTTs) |

**Agent archetype:** Specialist + Interface combined.
- **Specialist:** deep Meta-Ads analytics expertise via tools + knowledge base.
- **Interface:** direct chat with the merchant, memory of the thread, streamed replies.

**Model routing** (Hybrid — one agent, two-model backend):
- **Haiku 4.5** — intent classification, question routing, dynamic suggested-question generation, tool argument sanitization. Fast (&lt;1s), cheap.
- **Sonnet 5** — the actual analyst turn: reads tool results, reasons, writes the Arabic reply. Slow (2–8s), expensive but justified.

**What we intentionally keep from today's stack:**
- Physics / Confidence / Recovery / Pattern engines stay. They still produce `campaignBrainSnapshot` + `campaignIntelligenceReport`. The agent **reads them via tools** — it does not replace them. The rule engines remain the deterministic decision layer, the LLM agent is the reasoning + communication layer.

**What we drop:**
- `aiContextBuilder.ts` (V1) — deleted at 2.5.
- `aiContextBuilderV5.ts` (V5) — deleted at 2.5. Its data becomes tool responses.
- `aiKnowledgeContext.ts`'s bulk KB injection — replaced by a `lookup_knowledge` RAG tool.

---

## 3. Tool catalog

Twelve tools. All read-only except `save_recommendation`. Standard envelope. Workspace isolation enforced at the dispatcher, never trusted from the LLM.

### 3.1 Standard response envelope

```ts
type ToolResult<T> =
  | { ok: true; data: T; meta: ToolMeta }
  | { ok: false; error: ToolError };

interface ToolMeta {
  toolName: string;
  executionMs: number;
  cachedSeconds?: number;
  dataFreshness: {
    sourceTable: string;       // e.g. "daily_stats"
    latestRowDate: string;     // YYYY-MM-DD of the newest row read
    stalenessMinutes: number;  // now - latest_sync_at
  };
}

interface ToolError {
  code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'STALE_DATA';
  message: string;
  field?: string;
  retryable: boolean;
  suggestion?: string;         // e.g. "wait 30s for next sync" or "narrow the window"
}
```

**Why include `dataFreshness`:** the agent should be honest about staleness — "بيانات آخر مزامنة قبل 8 دقائق" instead of pretending the numbers are live-live.

### 3.2 The twelve tools

**Group A — Read the state (7 tools):**

| # | Tool | Purpose | Cache TTL |
|---|---|---|---|
| T1 | `list_campaigns` | All campaigns, tiered best/mid/worst, headline metrics | 60s |
| T2 | `get_campaign_details` | One campaign: current + historical baseline + issues + recs | 60s |
| T3 | `compare_periods` | Explicit A vs B window comparison for any entity | 120s |
| T4 | `rank_campaigns` | Top-N or bottom-N by chosen metric | 60s |
| T5 | `get_audience_breakdown` | Segment split (age/gender/placement/country/device) | 300s |
| T6 | `get_creative_performance` | Best/worst creatives + creative feature extraction | 300s |
| T7 | `lookup_knowledge` | RAG over Meta Ads best-practices + industry benchmarks | 3600s |

**Group B — Detect patterns (3 tools, NEW):**

| # | Tool | Purpose | Cache TTL |
|---|---|---|---|
| T8 | `detect_anomaly` | Statistical outlier detection vs 30-day rolling baseline | 300s |
| T9 | `get_hourly_pattern` | Hour-of-day and day-of-week performance heatmap | 900s |
| T10 | `find_similar_campaigns` | Campaigns with matching audience/objective/creative | 600s |

**Group C — Reason and act (2 tools, NEW):**

| # | Tool | Purpose | Cache TTL |
|---|---|---|---|
| T11 | `simulate_budget_shift` | "If you move X% from A to B, expected outcome is…" | 0 (write-through) |
| T12 | `save_recommendation` | Persist a recommendation to the merchant's inbox | 0 (write) |

---

### 3.3 Detailed schemas — Group A

#### T1. `list_campaigns`

**Description Claude sees:** *"List every active campaign in the workspace with current-window metrics compared to the prior window, health tier (best/mid/worst), and a one-line whyLabel explaining what makes each campaign distinctive. Call this first whenever the merchant asks about their campaigns in general ('ما حملاتي', 'شنو أفضل حملة'). For a specific campaign by name, use get_campaign_details instead."*

```jsonc
// Input
{
  "type": "object",
  "properties": {
    "windowDays": { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 },
    "sortBy":     { "type": "string", "enum": ["health","spend","roas","ctr","messages","cost_per_message"], "default": "health" },
    "direction":  { "type": "string", "enum": ["asc","desc"], "default": "desc" },
    "includeInactive": { "type": "boolean", "default": false },
    "limit":      { "type": "integer", "minimum": 1, "maximum": 50, "default": 20 }
  },
  "additionalProperties": false
}
```

```ts
// Output data shape
{
  windowDays: number;
  totalActive: number;
  campaigns: Array<{
    id: string;
    name: string;
    status: 'ACTIVE' | 'PAUSED' | 'DELETED';
    healthScore: number;
    healthBand: 'excellent'|'good'|'attention'|'poor';
    tier: 'best'|'mid'|'worst';   // deterministic; 'mid' for all when count < 4
    metrics: {
      spend:            { current: number; prior: number; deltaPct: number | null; display: string };
      messages:         { current: number; prior: number; deltaPct: number | null };
      ctr:              { current: number | null; prior: number | null; deltaPct: number | null };
      cpm:              { current: number | null; prior: number | null; deltaPct: number | null };
      cost_per_message: { current: number | null; prior: number | null; deltaPct: number | null; display: string };
      roas:             { current: number | null; prior: number | null; deltaPct: number | null };
    };
    whyLabel: string;   // Arabic: "CTR فوق المتوسط بـ 40%، تكلفة الرسالة أقل بـ 30%"
    whyReasons: string[];  // machine-readable: ["ctr_above_median_40pct", "cpm_below_median_30pct"]
  }>;
}
```

**Tiering — deterministic:**
- If total active &lt; 4 → all get `tier: 'mid'`, `whyLabel: 'حساب صغير — لا مقارنة كافية'`.
- Else:
  - `best`: top 25% by (health × 0.6 + normalized_roas × 0.4) OR (roas &gt; 2 AND spend &gt; workspace_median)
  - `worst`: bottom 25% by health OR (spend &gt; workspace_median AND messages = 0 for last 7 days)
  - `mid`: everything else

**`whyLabel` generator (in TS, not LLM-invented):**
1. For each campaign, compute z-score vs workspace mean for 5 metrics.
2. Pick the 2 metrics with largest |z|.
3. Format as Arabic:
   - `z > 1.0`: "أعلى من المتوسط بـ X%"
   - `z < -1.0`: "أقل من المتوسط بـ X%"
   - `-1.0 <= z <= 1.0`: skip (not distinctive)
4. If no metric is distinctive → `whyLabel = 'أداء متوسط عبر كل المؤشرات'`.

**Why this makes the assistant "very smart":** the assistant can immediately answer *"شنو أفضل حملة"* with **"الحملة X — CTR أعلى بـ 40%، تكلفة الرسالة أقل بـ 30%"** — a specific, evidence-backed answer, not a generic one.

---

#### T2. `get_campaign_details`

**Description Claude sees:** *"Deep dive into ONE campaign. Returns current-window metrics with prior comparison, plus a HISTORICAL BASELINE (60+ days) and vs-baseline delta so you can say 'CTR اليوم أقل بـ 33% من خط الأساس التاريخي للحملة نفسها'. Also returns detected issues, top recommendations from the intelligence engine, and the latest brain-decided action. Use when the merchant asks about ONE campaign by name."*

```jsonc
{
  "type": "object",
  "properties": {
    "campaignId":    { "type": "string", "minLength": 1 },
    "windowDays":    { "type": "integer", "minimum": 1,  "maximum": 90,  "default": 30 },
    "baselineDays":  { "type": "integer", "minimum": 30, "maximum": 180, "default": 90 }
  },
  "required": ["campaignId"],
  "additionalProperties": false
}
```

Output structure documented in the design's supplementary file `agent_tool_schemas.ts`. Key fields:
- `campaign`: name, status, objective, dailyBudget, startedAt
- `windowMetrics`: current + prior + delta%
- `historicalBaseline`: mean values over baselineDays (the "normal for this campaign")
- `vsBaseline`: percentage delta of window vs baseline — the killer signal
- `topIssues`: from campaignIntelligenceReport (already computed by rule engines)
- `topRecommendations`: from campaignIntelligenceReport
- `latestBrainAction`: latest campaignBrainSnapshot row
- `spendPacing`: (NEW) today's spend as % of daily budget + burn rate

---

#### T3. `compare_periods`

**Description Claude sees:** *"Explicit A vs B window comparison for any entity. Use when the merchant asks 'قارن هذا الأسبوع بالماضي' or 'كيف كان الشهر الماضي مقابل هذا الشهر'. Returns deterministic verdicts and reasons — quote them verbatim."*

Schema and output shape unchanged from v1 draft (see §3.3 in git history). Added: `verdicts.confidence` (`high` when both windows have >7 days of data, `low` otherwise).

---

#### T4. `rank_campaigns`

**Description Claude sees:** *"Rank campaigns best-to-worst or worst-to-best by ONE metric. Use for 'أفضل 3 حملات' / 'أسوأ حملات' questions. Excludes tiny-spend campaigns automatically (minSpend defaults to 1% of workspace total) so a 5-cent test campaign doesn't dominate the ranking."*

Added to v2: `minSpendPctOfTotal` (default 1%) — automatic filtering of noise campaigns.

---

#### T5. `get_audience_breakdown`

**Description Claude sees:** *"Split a campaign's metrics by an audience dimension (age, gender, country, placement, platform, device). Returns the best and worst segment with a one-line reason. Use when merchant asks about who the ad is reaching or which platform is working."*

Added to v2:
- `segmentSignificance`: for each segment, whether the sample size is large enough for the metric to be trustworthy (≥100 impressions for CTR, ≥10 conversions for cost-per-result). Segments below threshold are flagged, not hidden.
- `concentrationIndex`: Herfindahl-Hirschman-like measure of how concentrated spend is. Answers *"is the campaign broad or narrow?"*.

---

#### T6. `get_creative_performance`

**Description Claude sees:** *"Rank the ads (creatives) inside a campaign. Returns metrics per ad AND extracted creative features (has_video, has_carousel, text_length_bucket, cta_type, headline_first_word). Use when merchant asks 'أي إعلان يشتغل أفضل' or 'ليش الإعلان X ما يشتغل'. The feature extraction lets you say what characteristics correlate with success."*

**NEW — Creative feature extraction:**

For each ad, extract from `AdCreative`:
- `has_video`: creative has `video_id` set
- `has_carousel`: `object_story_spec.link_data.child_attachments.length > 1`
- `text_length_bucket`: `short` (&lt;60 chars) | `medium` (60–160) | `long` (>160), based on `body`
- `cta_type`: `call_to_action_type` (e.g. `MESSAGE_PAGE`, `SHOP_NOW`)
- `headline_first_word`: first word of `title` (rough intent signal)
- `has_emoji`: unicode emoji present in body

Response includes `featureCorrelations` — for the top 3 features, the correlation with the primary metric (e.g. *"إعلانات بفيديو: cost_per_message أقل بـ 25% في المتوسط"*).

**Why this matters:** the merchant asks *"ليش الإعلانات ما تشتغل؟"*. The agent can answer *"لاحظت: 4 من 5 إعلانات بدون فيديو، والفيديو مرتبط بتقليل تكلفة الرسالة 25% في هذه الحملة"* — a real, evidence-based diagnosis.

---

#### T7. `lookup_knowledge`

**Description Claude sees:** *"Retrieve Meta Ads best-practice guidance from the knowledge base. Use when you need to explain WHY a threshold matters, cite Meta's recommendation, or find remediation actions for a specific issue. Returns 3–5 relevant snippets with source references."*

**v2 upgrade — RAG instead of keyword match:**

- Index `metaAdsKnowledgeBase.json` + `benchmarks_by_industry.json` + `decision_rules.json` at build time using `text-embedding-3-small` (OpenAI, cheap) OR Anthropic embeddings when available.
- Store vectors in Postgres via `pgvector` extension.
- Query: embed the topic string, cosine-similarity top-5 snippets, return with a diversity filter (no two snippets from the same section).

Response:

```ts
{
  snippets: Array<{
    id: string;
    title: string;
    content: string;        // truncated to 400 chars
    source: string;         // "meta_ads_kb:low_ctr_playbook"
    similarity: number;
    industry?: string;      // present when snippet is industry-tuned
  }>;
  fallbackUsed: boolean;    // true when no similarity > 0.6, returned generic guidance
}
```

**Migration:** ship v1 with keyword-match (simple `.filter()` over JSON) so we don't block on pgvector setup. Add embeddings in Phase 2.5.

---

### 3.4 Detailed schemas — Group B (NEW pattern-detection tools)

#### T8. `detect_anomaly`

**Description Claude sees:** *"Statistical anomaly detection: finds daily metrics that are unusually far from the 30-day rolling baseline for the entity. Use PROACTIVELY when the merchant opens the app in the morning ('صباح الخير' greeting) or when they ask 'شنو الجديد'. Returns anomalies with severity, direction, and z-score. Does NOT return known rule-engine issues — those are already surfaced via list_campaigns."*

```jsonc
{
  "type": "object",
  "properties": {
    "scope":     { "type": "string", "enum": ["workspace","campaign"], "default": "workspace" },
    "campaignId": { "type": "string", "description": "Required when scope='campaign'" },
    "lookbackDays": { "type": "integer", "minimum": 3, "maximum": 30, "default": 7,
                      "description": "How many recent days to check for anomalies. Baseline is always 30d ending before this window." },
    "minAbsZ":   { "type": "number", "minimum": 1.5, "maximum": 5, "default": 2.0,
                   "description": "Minimum |z-score| to report. 2.0 = ~5% chance under normal distribution." }
  },
  "additionalProperties": false
}
```

```ts
{
  anomalies: Array<{
    date: string;              // YYYY-MM-DD
    entityType: 'ACCOUNT'|'CAMPAIGN'|'ADSET'|'AD';
    entityId: string;
    entityName: string;
    metric: 'spend'|'ctr'|'cpm'|'messages'|'cost_per_message'|'roas';
    value: number;             // observed
    baselineMean: number;
    baselineStd: number;
    zScore: number;            // signed: negative = worse than usual (context-dependent)
    direction: 'better'|'worse';  // interpreted per metric (higher CTR = better, higher CPM = worse)
    severity: 'high'|'medium'|'low';   // |z| >= 3, 2.5, 2.0 respectively
    likelyCause: string | null;  // Arabic, from a rule table (weekend, budget change, etc.)
  }>;
  totalChecked: number;         // entity × metric × day combinations examined
}
```

**Statistical method:** for each `(entity, metric)` compute mean μ and std σ over the 30 days before the lookback window. Any daily value in the lookback window with `|value − μ| / σ ≥ minAbsZ` is an anomaly. Direction interpretation:
- `ctr, messages, roas`: higher = better
- `cpm, cost_per_message, spend`: higher = worse (context-dependent for spend)

**Why this makes the assistant "very smart":** the merchant doesn't need to know their CTR dropped 40% yesterday — the agent tells them *first*, with the z-score as evidence.

---

#### T9. `get_hourly_pattern`

**Description Claude sees:** *"Hour-of-day × day-of-week performance heatmap for a campaign or the whole account. Reveals when ads perform best. Meta returns hourly breakdowns via 'hourly_stats_aggregated_by_advertiser_time_zone'. Use when merchant asks about timing, or when you want to suggest a dayparting change. Returns the top-3 best hours and bottom-3 worst hours with confidence."*

```jsonc
{
  "type": "object",
  "properties": {
    "scope":     { "type": "string", "enum": ["account","campaign"], "default": "account" },
    "campaignId":{ "type": "string" },
    "metric":    { "type": "string", "enum": ["ctr","cpm","messages","cost_per_message"], "default": "cost_per_message" },
    "windowDays":{ "type": "integer", "minimum": 7, "maximum": 60, "default": 30 }
  },
  "additionalProperties": false
}
```

```ts
{
  metric: string;
  heatmap: number[][];        // 7 days × 24 hours (day 0 = Sunday), null when no data
  bestSlots: Array<{ dayOfWeek: number; hour: number; value: number; sampleSize: number }>;
  worstSlots: Array<{ dayOfWeek: number; hour: number; value: number; sampleSize: number }>;
  reliability: 'high'|'medium'|'low';   // depends on sample size per cell
}
```

**Requires syncBreakdowns extension:** current `syncBreakdowns` supports `['age','gender']` and `['publisher_platform','platform_position']`. We need to add `['hourly_stats_aggregated_by_advertiser_time_zone']` breakdown. This is a small syncAccount.ts change (Phase 2.2).

---

#### T10. `find_similar_campaigns`

**Description Claude sees:** *"Find campaigns SIMILAR to a reference campaign by objective, audience, and placement mix. Use to answer 'حملات مشابهة لـ X' or when you want to say 'الحملة A تشبه B — لكن B تحقق نصف تكلفة الرسالة، ليش؟'. Similarity is cosine over feature vectors, not LLM opinion."*

```jsonc
{
  "type": "object",
  "properties": {
    "referenceCampaignId": { "type": "string" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 10, "default": 5 },
    "minSimilarity": { "type": "number", "minimum": 0, "maximum": 1, "default": 0.5 }
  },
  "required": ["referenceCampaignId"],
  "additionalProperties": false
}
```

Similarity features (all workspace-scoped):
- objective (categorical one-hot)
- placements (multi-hot from breakdownStat)
- audience age buckets (histogram normalized)
- audience gender split
- creative feature vector (from T6's extractor)

```ts
{
  reference: { id: string; name: string };
  similar: Array<{
    campaignId: string;
    campaignName: string;
    similarity: number;
    performanceDelta: {
      cost_per_message: number | null;  // negative = reference is cheaper
      ctr: number | null;
      roas: number | null;
    };
    differentiator: string;   // Arabic: what's different about this campaign
  }>;
}
```

**Why this makes the assistant "very smart":** the agent can answer *"لماذا حملة X أسوأ من Y؟"* with a real structural comparison, not a vibe.

---

### 3.5 Detailed schemas — Group C (Reasoning & action tools)

#### T11. `simulate_budget_shift`

**Description Claude sees:** *"Simulate what happens if you shift budget from campaign A to campaign B. Uses historical CPM and conversion rates to project outcomes. Does NOT execute — this is analysis-only. Use when merchant asks 'شلون أوزّع الميزانية' or when you want to make a data-backed reallocation suggestion. Returns projected messages/ROAS and a confidence band."*

```jsonc
{
  "type": "object",
  "properties": {
    "fromCampaignId": { "type": "string" },
    "toCampaignId":   { "type": "string" },
    "shiftAmount": {
      "type": "object",
      "properties": {
        "value": { "type": "number", "minimum": 0.01 },
        "unit":  { "type": "string", "enum": ["pct_of_from","abs_daily"] }
      },
      "required": ["value","unit"]
    },
    "projectionDays": { "type": "integer", "minimum": 1, "maximum": 30, "default": 7 }
  },
  "required": ["fromCampaignId","toCampaignId","shiftAmount"],
  "additionalProperties": false
}
```

```ts
{
  currentAllocation: { fromDailyBudget: number; toDailyBudget: number };
  shiftedAllocation: { fromDailyBudget: number; toDailyBudget: number };
  projected: {
    fromCampaign: { messages: { low: number; mid: number; high: number }; spend: number };
    toCampaign:   { messages: { low: number; mid: number; high: number }; spend: number };
    workspaceTotal: { messagesDelta: number; roasDelta: number | null };
  };
  assumptionsUsed: string[];   // e.g. ["projected linear scaling ±20%", "no auction pressure change"]
  confidence: 'high'|'medium'|'low';
  caveats: string[];           // Arabic warnings about the projection
}
```

**Method:** compute historical cost_per_message and marginal spend efficiency for each campaign from the last 30 days. Linear projection ± 20% variance band. Confidence is `high` when both campaigns have >7 days of stable data, `low` when either is new (<7 days).

**Why this makes the assistant "very smart":** the merchant can ask *"لو حرّكت 30% من ميزانية A إلى B شنو يصير"* and get a *number* back, not a hand-wave.

---

#### T12. `save_recommendation`

**Description Claude sees:** *"Persist a recommendation to the merchant's Recommendations feed with status SUGGESTED_BY_AI. Merchant will see it as an actionable card. Use SPARINGLY — one per turn max — and only when your analysis is solid enough to defend. NEVER call this without first backing your reasoning with tool evidence."*

Schema unchanged from v1, plus:
- `evidenceMessageIds`: array of `AiMessage.id` — the tool messages that backed this recommendation. For audit.
- Idempotency key: `(workspaceId, entityType, entityId, actionCode)` — repeat call updates existing row instead of inserting a duplicate.

---

## 4. Conversation memory model

Two new Prisma models. Migration name: `20260704_ai_conversation_memory`.

```prisma
model AiConversation {
  id           String   @id @default(cuid())
  workspaceId  String   @map("workspace_id")
  userId       String   @map("user_id")
  title        String?
  locale       Locale   @default(AR)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // (NEW v2) proactive brief metadata
  isProactive  Boolean  @default(false) @map("is_proactive")
  triggerType  String?  @map("trigger_type")   // 'daily_brief' | 'anomaly_alert' | null

  workspace    Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user         User        @relation(fields: [userId],      references: [id], onDelete: Cascade)
  messages     AiMessage[]

  @@index([workspaceId, updatedAt])
  @@index([userId, updatedAt])
  @@index([workspaceId, isProactive, createdAt])
  @@map("ai_conversations")
}

model AiMessage {
  id              String   @id @default(cuid())
  conversationId  String   @map("conversation_id")
  role            AiMessageRole
  content         String   @db.Text
  toolCallsJson   Json?    @map("tool_calls_json")
  toolResultsJson Json?    @map("tool_results_json")
  tokensIn        Int?     @map("tokens_in")
  tokensOut       Int?     @map("tokens_out")
  latencyMs       Int?     @map("latency_ms")
  model           String?                          // (NEW v2) 'claude-haiku-4-5-...' | 'claude-sonnet-5'
  createdAt       DateTime @default(now()) @map("created_at")

  conversation    AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("ai_messages")
}

enum AiMessageRole {
  USER
  ASSISTANT
  TOOL
  SYSTEM
}
```

**Retention:** last 90 days per workspace, then archive to cold storage.

**History loading:** last `MAX_HISTORY_TURNS = 20` message pairs; if total tokens > `HISTORY_TOKEN_BUDGET = 8000`, drop oldest pairs first (never split a user↔assistant↔tool trio).

---

## 5. The agent loop (with model routing)

Single `POST /api/workspaces/:workspaceId/ai/chat/v2` endpoint. Server-side streaming loop.

```
1. Auth: verify user is workspace member.
2. Load or create AiConversation (by ?conversationId= or new).
3. Load last N messages as history.
4. Persist incoming user message.
5. FAST CLASSIFIER (Haiku):
     - Input: user message + last 3 turns for context.
     - Output: { intent: 'simple_lookup'|'analysis'|'comparison'|'greeting'|'off_topic',
                 needsTools: boolean, suggestedTools: string[], estimatedTurnCount: 1|2|3|4+ }
     - Cost: ~200 input + ~50 output tokens → ~$0.0002/turn.
6. IF intent = 'greeting' AND user opened a fresh session:
     - Skip Sonnet; run the DAILY BRIEF (see §7).
7. IF intent = 'off_topic':
     - Reply politely in Arabic: "أنا مساعد لتحليل حملاتك — كيف أقدر أساعد؟" — no LLM call.
8. ELSE run ANALYST loop (Sonnet):
     - Send system prompt + history + tools[] + user message.
     - Stream response tokens to the HTTP client (SSE).
     - If stop_reason == 'tool_use':
         - For each tool_use block, dispatch to typed handler (parallel where safe).
         - Persist a TOOL message with the result.
         - Continue loop with tool_result blocks.
     - Else break.
9. Persist final ASSISTANT message.
10. Return { conversationId, finalReply, toolCalls: [...for UI drill-down] }.
```

**Bounds:**

| Guard | Value | Where enforced |
|---|---|---|
| Max tool-use iterations per turn | 6 | Server loop counter |
| Max tools per iteration | 5 | Trim response |
| Per-tool timeout | 5s | `Promise.race` in dispatcher |
| Per-turn total timeout | 60s | Overall race |
| Workspace isolation | Injected by dispatcher | Dispatcher, not LLM |
| Write tools | Only `save_recommendation`, `SUGGESTED_BY_AI` status | Handler |
| Max tokens per response | 2048 (analyst) / 256 (classifier) | Anthropic API param |
| Per-turn token budget | 20 000 total | Loop tracker; abort at limit |
| Rate limit | 30 tool calls / workspace / minute | In-memory token bucket |

---

## 6. The actual system prompt (drafted)

**Analyst system prompt (Sonnet):**

```
You are Adlytic's Smart CMO — an analytical marketing advisor for Meta Ads
(Facebook & Instagram) merchants. You answer in the merchant's language.

## Your job
Analyze the merchant's campaigns using the tools provided, and give
evidence-backed recommendations. NEVER invent numbers. Every metric you
cite must come from a tool call in this turn.

## Language & tone
- Default: Modern Standard Arabic with an Iraqi/Gulf-friendly register.
- Latin digits (0-9), not Arabic-Indic digits.
- Metric acronyms (CTR, CPM, ROAS, CPA) in Latin letters; explain each
  in Arabic on first use in a conversation: "CTR (نسبة النقر)".
- Warm and direct. No filler. No marketing jargon for concepts with
  plain Arabic equivalents.
- Prefer concrete over abstract: "الحملة X خسرت 40 رسالة الأسبوع الماضي"
  beats "أداء الحملة تراجع".

## How to use tools
1. Start with list_campaigns when the merchant's question is general,
   OR get_campaign_details when they name one campaign.
2. Always compare current to prior — the tool results give you that.
3. When something looks unusual, call detect_anomaly to confirm it's not
   noise before flagging it.
4. Never call save_recommendation without first backing it with tool
   evidence in the same turn.
5. If a tool returns an error, adapt — don't repeat the same call. If
   3 tools fail in a row, tell the merchant honestly.

## Comparison discipline
Every metric you quote must be paired with either:
- its prior-period value + delta%, OR
- its historical baseline + delta%, OR
- an industry benchmark from lookup_knowledge.
A number alone is meaningless.

## When to escalate
If a tool result includes severity='high' anomaly OR healthBand='poor',
lead your answer with that. Don't bury critical issues.

## What you MUST NOT do
- Invent metric values.
- Cite campaigns by name without a tool having returned that name.
- Recommend Meta account changes (pause/enable) — only recommendations
  to save; the merchant executes on Meta themselves.
- Reveal internal IDs, tokens, or email addresses.
- Use forbidden phrases: "I'm just an AI", "as of my last training".

## What you SHOULD do proactively
When the merchant sends a first greeting ("مرحبا", "صباح الخير"), run
list_campaigns + detect_anomaly and lead with the most interesting
finding — don't wait to be asked.
```

**Classifier system prompt (Haiku):**

```
You are an intent classifier for a Meta Ads assistant. Given the user's
message and last 3 turns, output ONE JSON object:

{
  "intent": "simple_lookup" | "analysis" | "comparison" | "greeting" | "off_topic",
  "needsTools": boolean,
  "suggestedTools": string[],       // subset of tool names
  "estimatedTurnCount": 1 | 2 | 3 | "4+"
}

Rules:
- "greeting": pure greeting with no question ("مرحبا", "صباح الخير")
- "simple_lookup": one-tool question ("ما إنفاق حملة X؟")
- "analysis": needs comparison + reasoning ("لماذا CTR انخفض؟")
- "comparison": explicit A vs B ("قارن A و B")
- "off_topic": not about ads ("كيف الطقس؟")

Output ONLY the JSON. No prose.
```

The two prompts total ~90 lines vs the current 145-line rigid CMO prompt.

---

## 7. Proactive discovery mode (NEW — the "revolutionary" bit)

Today: the assistant is reactive. Merchant asks, assistant answers. In v2 the assistant also **speaks first**.

### 7.1 Daily brief (autonomous)

**Trigger:** cron every morning at 08:00 in the workspace's timezone. Runs per workspace with at least one active campaign.

**Flow:**

```
1. Call detect_anomaly(scope='workspace', lookbackDays=1, minAbsZ=2.0)
2. Call list_campaigns(sortBy='health', limit=10)
3. Call rank_campaigns(metric='cost_per_message', direction='worst', limit=3)
4. Call rank_campaigns(metric='roas', direction='best', limit=3)
5. Give Sonnet the assembled tool results with system prompt:
     "You are writing today's brief for the merchant. Highlight:
      - Any severity='high' anomaly from step 1 (MUST if present).
      - The single most-improved and most-declined campaign.
      - One actionable suggestion if evidence supports it.
      Keep to 5–8 sentences of Arabic. No headings, no bullets — a
      short paragraph the merchant reads over coffee."
6. Persist as an AiConversation with isProactive=true, triggerType='daily_brief'.
7. Push a notification (existing infra) to the merchant's dashboard.
```

**UI surface:** the dashboard gets a new "بريد الصباح" section that shows the latest daily brief. Merchant can click "استمر في الحوار" — this opens the chat page pre-loaded with the proactive conversation, so they can follow up naturally.

**Cost bound:** Sonnet turn with 4 tool calls ≈ 8 000 tokens ≈ $0.06/workspace/day. 100 workspaces = $6/day = $180/month. Justified.

### 7.2 Real-time anomaly alerts

**Trigger:** after each recurring auto-sync (already every 15 min per §5.1 of Phase 1 fix), we run a lightweight anomaly check.

**Flow:**

```
1. Directly (no LLM) run detect_anomaly logic.
2. If any severity='high' anomaly found AND no alert sent for this
   (entity, metric, day) in the last 4 hours:
     - Enqueue a Sonnet turn to write a 2-sentence Arabic alert.
     - Persist as AiConversation with isProactive=true, triggerType='anomaly_alert'.
     - Push notification.
3. Rate limit: max 3 anomaly alerts per workspace per day.
```

**Why this makes it "revolutionary":** merchants don't need to open the app to know something's wrong. The agent tells them, in Arabic, immediately.

---

## 8. Multi-turn worked example

Concrete illustration of the agent in action. Merchant's workspace: 8 campaigns, one running badly since yesterday.

```
USER (09:12): مرحبا

CLASSIFIER (Haiku, 400ms, $0.0002):
  { intent: 'greeting', needsTools: false, suggestedTools: [], estimatedTurnCount: 1 }

ROUTER: greeting + fresh session → run daily brief.

ANALYST (Sonnet):
  → tool_use: detect_anomaly({ scope: 'workspace', lookbackDays: 1, minAbsZ: 2.0 })
  ← { anomalies: [{
        entityName: 'حملة رمضان — عرض 20%',
        metric: 'cost_per_message',
        value: 8.4, baselineMean: 3.2, baselineStd: 0.9,
        zScore: 5.78, severity: 'high', direction: 'worse'
      }], totalChecked: 320 }

  → tool_use: get_campaign_details({ campaignId: 'cmp_abc', windowDays: 7, baselineDays: 90 })
  ← { campaign: {...}, windowMetrics: {...}, vsBaseline: { messagesPct: -68, cpmPct: +42 }, topIssues: [...] }

  → tool_use: get_creative_performance({ campaignId: 'cmp_abc', limit: 3 })
  ← { ranked: [...], featureCorrelations: [
        { feature: 'has_video', metric: 'cost_per_message', correlation: -0.62,
          note: 'إعلانات بفيديو أرخص بـ 40%' },
        { feature: 'text_length_bucket=short', metric: 'ctr', correlation: +0.51 }
      ] }

  → assistant (streamed, ~2.5s):
     "صباح الخير. عندي خبر مهم قبل ما تبدأ يومك: حملة رمضان — عرض 20% انفلتت
      من الأمس. تكلفة الرسالة قفزت من 3.2 دولار (المتوسط عندك) إلى 8.4 دولار
      — أعلى بـ 163%. الرسائل الأسبوع صار 68% أقل من خط أساس الحملة.

      قصّة إحصائية: هذا انحراف بـ 5.8 z-score، يعني أقل من واحد بالألف يصير
      صدفة. مو ضجيج.

      شفت الإبداعات (creatives) داخل الحملة: 4 من 5 إعلانات بدون فيديو،
      والفيديو مرتبط بتقليل تكلفة الرسالة 40% في نفس الحملة تاريخياً.

      اقتراحي: أوقف مؤقتاً الإعلانات الثابتة، وخلّي إعلان الفيديو ياخذ
      الميزانية. تحبّ أرسم لك سيناريو أرقام؟"

     tool_use: save_recommendation({
       entityType: 'CAMPAIGN', entityId: 'cmp_abc',
       actionCode: 'REFRESH_CREATIVE',
       text: 'استبدل 4 إعلانات ثابتة بإعلان فيديو في حملة رمضان — عرض 20%',
       priority: 'HIGH',
       reasoning: 'تكلفة الرسالة انحرفت 5.8σ وارتباط قوي بين has_video وانخفاض التكلفة',
       evidenceMessageIds: ['msg_...', 'msg_...']
     })

TURN TOTAL: 4 tool calls, ~7200 tokens, ~4.5s, ~$0.06
```

Contrast with today's behavior: the merchant would see a stale generic tile *"صحة الحساب: 78 — جيد"* and have to dig manually to find the problem.

---

## 9. Migration plan

Zero-downtime, feature-flagged.

| Step | Change | Rollback |
|---|---|---|
| 2.1 | Prisma migration: `ai_conversations`, `ai_messages`, enum; extend `syncBreakdowns` for `hourly_stats_aggregated_by_advertiser_time_zone`. | Rename tables to `_deprecated_*`, keep 30d. |
| 2.2 | `src/services/agent/` — `tools/*.ts` (12 files), `dispatcher.ts`, `envelope.ts`, `cache.ts`, `rateLimit.ts`. | Delete folder. |
| 2.3 | `src/services/agent/loop.ts` (Sonnet loop), `src/services/agent/classifier.ts` (Haiku), `src/services/agent/prompts.ts`. | Delete. |
| 2.4 | New route `POST /ai/chat/v2` behind `AI_AGENT_V2_ENABLED` flag; SSE streaming. | Flag off. |
| 2.5 | `src/workers/dailyBriefCron.ts` (proactive brief) behind `AI_PROACTIVE_ENABLED` flag. | Flag off. |
| 2.6 | Update `aiPage.ts` to consume SSE + surface proactive briefs. Keep V1 fallback. | Prefer V1. |
| 2.7 | RAG upgrade for `lookup_knowledge` (pgvector). | Fall back to keyword match. |
| 2.8 | After 2 weeks stable: delete V1 chat endpoint, V1/V5 context builders, bulk KB injection. | Revert commit. |

**Files DELETED at 2.8:**
- `src/services/aiContextBuilder.ts` (V1)
- `src/services/aiContextBuilderV5.ts` (V5)
- Bulk KB path in `src/services/aiKnowledgeContext.ts` (keep the data loader for RAG)
- Old system prompt block in `ClaudeCMO.ts` (kept for narration cron until Phase 2.9)

**Files KEPT:**
- `ClaudeCMO.ts` narration path (dashboard-pushed Arabic titles) — Phase 2.9 (post-2.8) rewrites this to use the new agent, non-blocking.
- All engine files (`AdlyticBrain.ts`, `DecisionEngine.ts`, `PatternEngine.ts`, `RecoveryGate.ts`, `Physics.ts`) — untouched.
- All repositories and mappers — untouched.

---

## 10. Cost & model routing

**Model choice per code path:**

| Path | Model | Reason |
|---|---|---|
| Classifier | Haiku 4.5 | Simple JSON output, sub-second, cheap |
| Chat analyst | Sonnet 5 | Multi-step reasoning + tool use, quality matters |
| Daily brief | Sonnet 5 | Same as chat |
| Anomaly alert (2-sentence) | Haiku 4.5 | Short output, cost-sensitive at scale |
| CMO narration cron (existing) | Sonnet 5 | Unchanged until Phase 2.9 |

**Per-turn budget for chat analyst:**

| Component | Tokens (est.) | Cost (Sonnet, $3/M in, $15/M out) |
|---|---|---|
| System prompt | 800 | $0.0024 |
| Tool descriptions | 3 000 | $0.009 |
| History (20 turns) | 4 000 | $0.012 |
| 3 tool results | 6 000 | $0.018 |
| Final answer | 400 | $0.006 |
| **Total per turn** | **14 200** | **~$0.05** |

**Monthly at 100 workspaces × 15 turns/day + 1 daily brief:**
- Chat: 100 × 15 × 30 × $0.05 = **$2 250/mo**
- Brief: 100 × 30 × $0.06 = **$180/mo**
- Classifier: 100 × 15 × 30 × $0.0002 = **$9/mo**
- **Total: ~$2 440/mo** at v2 launch scale

This is up from ~$300/mo today (crude estimate from current usage). ROI justified if it moves merchant retention from X to Y — measurable via Phase 2 evaluation §12.

---

## 11. Evaluation harness

Testing an LLM agent needs an eval set + automated scoring. Not "does it compile" — "does it answer correctly."

### 11.1 Eval set structure

Store in `src/services/agent/eval/prompts.ts`. 40 test cases across 5 categories:

- 10× simple lookup ("ما إنفاق حملة X؟")
- 10× analysis ("لماذا انخفض CTR؟")
- 10× comparison ("قارن هذا الأسبوع بالماضي")
- 5× greeting → should trigger daily brief
- 5× off-topic → should politely decline

Each case:

```ts
{
  id: string;
  category: string;
  prompt: string;                            // Arabic
  expectedTools: string[];                   // tools that MUST be called
  forbiddenTools: string[];                  // tools that MUST NOT be called
  expectedIntent: string;
  requiredEvidence: string[];                // substrings that must appear in reply
  forbiddenPhrases: string[];                // e.g. "as an AI"
  minToolCalls: number;
  maxToolCalls: number;
  seed: {                                    // deterministic DB state for the run
    workspaceId: string;
    campaignFixtures: CampaignFixture[];
  };
}
```

### 11.2 Automated scoring

Runs against a test workspace with seeded fixtures. For each case:

| Check | Method | Weight |
|---|---|---|
| Right tools called | Exact set match | 20% |
| No forbidden tools | Exact set exclusion | 10% |
| Required evidence present | Substring check | 30% |
| No forbidden phrases | Substring exclusion | 10% |
| Language check | Arabic character ratio &gt; 80% | 10% |
| Latency budget | p95 &lt; 10s | 10% |
| LLM-as-judge (Sonnet) | Rubric: helpfulness, accuracy, tone (1–5) | 10% |

**Pass threshold:** 80% weighted score per case, 90% aggregate.

### 11.3 CI integration

Nightly job (`npm run test:agent`):
1. Reset test DB from fixtures.
2. Run 40 eval cases sequentially.
3. Report per-category pass rate.
4. Post to Slack if aggregate &lt; 90%.

---

## 12. Observability

**Per-conversation data:** already captured by `AiMessage` (tokens, latency, model). New admin route `GET /api/admin/ai/usage` aggregates:

- Conversations/day per workspace
- Tool call frequency (top 10 tools)
- Failure rate by tool
- Latency p50 / p95 / p99
- Token cost per workspace per day
- Proactive brief send rate
- Anomaly alert send rate
- Recommendation accept/dismiss rate (from a new user-action log)

**Admin dashboard:** `src/web/pages/adminDashboardPage.ts` gets a new "AI Health" tab. Read-only, no external calls.

**Alert conditions (log to console; wire to on-call later):**
- Tool failure rate &gt; 5% in a rolling hour.
- p95 latency &gt; 20s.
- Cost per workspace/day &gt; $2.

---

## 13. Streaming UX

The chat endpoint returns Server-Sent Events (SSE). Events:

```
event: token
data: {"text": "صباح "}

event: token
data: {"text": "الخير. "}

event: tool_call
data: {"tool": "detect_anomaly", "args": {...}, "status": "started"}

event: tool_result
data: {"tool": "detect_anomaly", "durationMs": 234, "ok": true}

event: token
data: {"text": "لاحظت..."}

event: done
data: {"conversationId": "conv_...", "finalReply": "..."}
```

**Client (aiPage.ts) shows:**
- Streaming text in the bubble.
- Tool "chips" appearing in real time: "🔍 يفحص الشذوذ…" → "✓ فحص الشذوذ".
- Spinner disappears when `event: done` arrives.

**Why streaming matters:** a multi-tool turn takes 4–8s. Without streaming that's dead air. With streaming the merchant sees "the assistant is thinking" concretely — not just a spinner.

---

## 14. Fallback strategy (when Claude is down)

The current fallback is a generic *"Sorry, the AI assistant is temporarily unavailable"*. In v2, when the API errors:

1. Read the latest `campaignIntelligenceReport` for the workspace's account.
2. Read the top 2 items from its `recommendations`.
3. Read the latest `CampaignBrainSnapshot.narrationJson` if present.
4. Compose a hand-templated Arabic reply from those.
5. Prefix with: *"لا أقدر أتحدث بذكاء الآن، لكن هذا آخر تقرير محسوب:"*

This means even during Anthropic outages the merchant still sees fresh, relevant information — degraded but useful.

---

## 15. What this fixes (from the audit findings)

| Audit finding | Fix in v2 |
|---|---|
| Rule engine that outsources Arabic wording to Claude | Claude decides via tools; rules stay as deterministic layer it consults |
| Two duplicate context builders V1/V5 | Both deleted at 2.8 |
| Stateless chat: no conversation history | `AiConversation` + `AiMessage` tables |
| Static suggested questions | UI derives 4 questions from merchant's actual top/bottom campaigns via Haiku classifier |
| Two contradictory voice regimes | One system prompt, no forbidden-word list, tool responses format numbers uniformly |
| Emergency-pause bypasses LLM entirely | Emergency escalation via `severity='high'` in tool results, LLM still speaks |
| Evidence UI shows raw JSON | Solved in Phase 3 (UI); design already produces human-readable strings |
| Locale inferred from message script | Stored on `AiConversation.locale` from `user.locale` |
| Assistant is reactive only | Daily brief + anomaly alerts (§7) |
| No cost visibility | Per-conversation token log + admin dashboard (§12) |
| No evaluation | 40-case eval harness (§11) |
| Dead-air multi-tool turns | SSE streaming (§13) |

---

## 16. What makes this REVOLUTIONARY — side-by-side

Five scenarios showing before/after:

| Scenario | Today | v2 |
|---|---|---|
| Merchant opens app at 09:00 | Sees a dashboard tile *"صحة الحساب: 78 — جيد"*. No alerts. Has to hunt for problems. | Daily brief on the dashboard: *"صباح الخير. حملة رمضان انفلتت — تكلفة الرسالة قفزت 163% مقابل خط أساس الحملة (انحراف 5.8σ). 4 من 5 إعلانات بدون فيديو، والفيديو تاريخياً يخفض التكلفة 40%."* + suggested action card. |
| Merchant asks "شنو أفضل حملة؟" | Rule engine picks the campaign with highest health score. Reply: *"أفضل حملة: X"* (no reason). | Agent calls `rank_campaigns` + `list_campaigns`. Reply: *"أفضل حملة: X — ROAS 3.2x مقابل متوسط حسابك 1.8x، و CTR أعلى 40% من المتوسط. المميز: 80% من الجمهور فئة 25-34 وأنت لست ركّز فيها أصلاً."* |
| Merchant asks "قارن A و B" | *"Campaign A vs Campaign B: some numbers"* — LLM reads from V5 context which has only account-level data. | Agent calls `compare_periods` × 2 + `find_similar_campaigns` if applicable. Reply has both windows + verdicts + a structural comparison of what's different. |
| CTR drops 40% on Tuesday afternoon | Merchant discovers on Wednesday when they check manually. | 15 min later: push notification + proactive conversation *"لاحظت الآن: CTR حملة X انخفض 40% في الساعة الأخيرة (z-score 3.1). هل حصل تغيير على الميزانية؟"*. |
| Merchant asks "لو حرّكت 30% من A إلى B شنو يصير" | LLM guesses based on gut: *"قد يزيد الأداء"*. No numbers. | Agent calls `simulate_budget_shift`. Reply: *"لو حرّكت 30% (150 دولار يومياً): B تتوقع 42-58 رسالة إضافية، A تخسر 12-18 رسالة. صافي +25 رسالة، بثقة متوسطة (B جديدة، خط أساسها أضعف)."* |

**The qualitative leap:** from "reactive Arabic translation of rule decisions" to "proactive analyst with statistical rigor and structural comparison."

---

## 17. Non-goals (Phase 2)

- **Not** rewriting `ClaudeCMO.ts` narration cron. That's Phase 2.9, decoupled.
- **Not** touching engines or repositories.
- **Not** changing the dashboard UI beyond the "بريد الصباح" surface + streaming chat. Full UI redesign is Phase 3.
- **Not** adding write actions to Meta (pause/enable). Only `save_recommendation` writes, only to DB with `SUGGESTED_BY_AI`.
- **Not** multi-workspace insights ("merchants like you did X"). Requires consent flow. Phase 4.
- **Not** voice input/output. Chat-only for now.

---

## 18. Success criteria

Phase 2 is done when ALL of:

1. `POST /ai/chat/v2` answers "قارن حملة X بالحملة Y" with numeric evidence from tool calls, in Arabic, streamed, in under 8 seconds p95.
2. Reply cites specific campaigns by name and quotes exact metrics (verified against DB).
3. Follow-up "لماذا؟" works — Claude has conversation history.
4. `list_campaigns` returns tiered best/mid/worst with non-empty `whyLabel` per campaign.
5. Daily brief runs autonomously for at least one seeded workspace and appears on the dashboard.
6. At least one seeded anomaly triggers a real proactive alert within 15 minutes.
7. Tool errors surface as helpful Arabic messages, not raw stack traces.
8. `test:tenant` still passes.
9. Eval harness (§11) scores ≥ 90% aggregate on the 40-case set.
10. Admin AI-usage dashboard shows accurate per-workspace token/latency data.
11. Fallback (§14) fires cleanly during a simulated Anthropic outage.
12. No mention of `claude-sonnet-4-6` anywhere.

---

## 19. Self-review — gaps caught and fixed

Ran the design against `tool_design_best_practices.md` checklist and `agent_architecture_patterns.md` anti-patterns list. Original 12 gaps + 8 new gaps caught during the v2 deepening pass.

| # | Gap | Fix |
|---|---|---|
| 1 | `save_recommendation` idempotency not specified. | Idempotency key = `(workspaceId, entityType, entityId, actionCode)`. Second call updates existing row; response includes `meta.deduplicated=true`. |
| 2 | Workspace isolation described vaguely. | Dispatcher injects `workspaceId` at construction time from JWT and hands it to every handler as hidden argument. `workspaceId` is NOT in any tool's public JSON schema. |
| 3 | No response caching. | 60s TTL cache keyed on `(workspaceId, toolName, sha1(sortedArgs))`. In-process Map. Write tools bypass cache. |
| 4 | No rate limit. | 30 tool calls per workspace per rolling minute (token bucket). Above limit returns `RATE_LIMIT` error so Claude can back off. |
| 5 | Cost bound incomplete. | Per-turn: 6 iterations OR 20 000 tokens, whichever first. Overall abort returns graceful message. |
| 6 | PII in tool responses. | Explicit `select` clauses; no user emails/tokens/phones returned. |
| 7 | Locale handling ambiguous. | Stored on `AiConversation.locale` from `user.locale`; injected as system-prompt suffix. |
| 8 | No fallback when all tools fail. | 3 consecutive tool errors → break loop → graceful Arabic message. |
| 9 | Tier assignment breaks with few campaigns. | If active count &lt; 4, all `tier: 'mid'`, `whyLabel` skips ranking language. |
| 10 | Audit trail vague. | Every tool call persists as `AiMessage` with `role=TOOL`. Full observability without extra table. |
| 11 | Migration rollback destroys data. | Rollback = rename tables to `_deprecated_*`, keep 30 days, then drop. |
| 12 | LLM ignoring tool schema. | Dispatcher validates every arg against JSON schema (ajv). On invalid returns `INVALID_INPUT` with failing field; Claude retries. |
| **13** | **Data staleness invisible to LLM** — Claude would speak as if numbers are live. | Added `meta.dataFreshness` to every tool result: source table, latest row date, staleness minutes. System prompt tells Claude to acknowledge staleness above 60 min. |
| **14** | **Cost of monolithic Sonnet-only pipeline.** | Model routing: Haiku for classifier + short anomaly alerts, Sonnet for analyst. Saves ~60% cost. |
| **15** | **Dead air on multi-tool turns.** | SSE streaming (§13) with tool-call chips in the UI. |
| **16** | **No evaluation.** | 40-case eval harness with automated scoring (§11). |
| **17** | **Assistant reactive only, contradicts "revolutionary" spec.** | Daily brief + real-time anomaly alerts (§7). |
| **18** | **`get_hourly_pattern` needs data we don't sync.** | Extend `syncBreakdowns` to fetch `hourly_stats_aggregated_by_advertiser_time_zone` in Phase 2.1. |
| **19** | **`find_similar_campaigns` similarity ill-defined.** | Feature vector spec: objective one-hot + placements multi-hot + audience histogram + creative features. Cosine over these. |
| **20** | **Anthropic API outage would silence the assistant entirely.** | Fallback quotes latest `campaignIntelligenceReport` + narration (§14). |

**Anti-pattern audit — clean:**

- ❌ **God tool** — 12 tools each with one job; no overlap.
- ❌ **Chatty communication** — no inter-agent traffic (single agent).
- ❌ **Stateful tools** — read tools are pure; write tools intentionally persist.
- ❌ **Inconsistent interfaces** — all use `ToolResult<T>` envelope.
- ❌ **Silent failures** — no `throw`; every failure returns structured error.
- ❌ **Generic errors** — enum codes + `field` + `retryable`.
- ❌ **Under-specification** — all schemas `additionalProperties: false`.
- ❌ **Over-centralization** — Prisma is DB; no coordinator holds business state.
- ❌ **Circular dependencies** — no tool calls another tool.
- ❌ **Unbounded operations** — explicit `limit` per tool + 5s dispatcher timeout.

---

## 20. Anti-hallucination hard guardrails (NEW in v3)

"Don't invent numbers" as a system-prompt line is not enough. Merchants will trust the assistant IFF numbers are provably correct. Enforce it in code, not prose.

### 20.1 Deterministic post-check

Every ASSISTANT reply passes a validator before being sent to the merchant:

```
1. Extract all number-like tokens from the reply (regex: /-?\d+[.,]?\d*/g).
2. Extract all campaign/adset/ad names in quotes or after "الحملة"/"إعلان".
3. For each number: must appear (exact or ±0.5% rounding tolerance) in
   the toolResultsJson of at least one TOOL message in the same turn.
4. For each name: must appear verbatim in the tool results of this turn.
5. If ANY token fails:
     - Log a HALLUCINATION_DETECTED event.
     - Do NOT send reply to merchant.
     - Rewind: append a system message to Claude
       "Your previous reply contained the value 3.2x which was not in
        any tool result. Retry using only values from the tools called
        this turn." and re-run.
     - Max 2 retries. On third failure, degrade to fallback (§14).
```

**Exceptions from post-check:**
- Numbers inside quoted merchant messages ("قال المستخدم '5 دولار'…") — passed through.
- Well-known constants: 100, 1000, 30 (days), 24 (hours), etc.
- Percentages the tool result implicitly expresses ("34%" when tool returned `0.34`).

**Metrics tracked:** hallucination rate per model per week. If Sonnet > 2% or Haiku > 5%, escalate to prompt review.

### 20.2 Structured citation

Reply strings support a compact citation syntax that the UI can render as clickable footnotes:

```
"CTR اليوم 0.8% [T2:campaign.metrics.ctr.current] مقابل خط الأساس 1.2% [T2:campaign.historicalBaseline.ctrMean]"
```

The `[Tn:path]` markers get stripped from the visible text and rendered as a superscript reference. Clicking opens a modal showing the exact tool call and the JSON path used.

**Why this matters:** merchant can *verify* every number the assistant cites. Zero-hallucination is a claim; verifiability makes it real.

---

## 21. Continuous learning loop (NEW in v3)

The assistant should get smarter as the merchant uses it — not by retraining Claude, but by tuning the deterministic parts around it.

### 21.1 Signals we collect

Every merchant action becomes a signal in the `AiSignal` table:

```prisma
model AiSignal {
  id            String   @id @default(cuid())
  workspaceId   String
  userId        String
  createdAt     DateTime @default(now())
  signalType    AiSignalType
  targetType    String     // 'recommendation'|'alert'|'brief'|'message'
  targetId      String
  metadata      Json       // e.g. { dismissReason: 'noise', dwellMs: 340 }

  @@index([workspaceId, signalType, createdAt])
  @@map("ai_signals")
}

enum AiSignalType {
  RECOMMENDATION_ACCEPTED
  RECOMMENDATION_DISMISSED
  ALERT_TAPPED
  ALERT_IGNORED
  BRIEF_READ
  BRIEF_SKIPPED
  MESSAGE_HELPFUL
  MESSAGE_UNHELPFUL
  DWELL_TIME
  CITATION_CLICKED
}
```

### 21.2 What we tune from signals

**Anomaly z-score threshold per workspace:**
- Merchant dismisses 3+ anomaly alerts in a row as "noise" → raise their `minAbsZ` from 2.0 to 2.5.
- Merchant taps 3+ anomaly alerts as helpful → keep at 2.0.
- Bayesian update, EMA over last 20 signals.

**Recommendation priority ranking:**
- If merchant accepts REFRESH_CREATIVE 80% but dismisses PAUSE_CAMPAIGN 70% → rank REFRESH_CREATIVE first when both are viable.
- Per-workspace preference vector over actionCodes.

**Terseness auto-adjustment:**
- Median `dwellMs` on assistant messages < 8s → merchant likely skimming → shift to `terseness=terse` preference.
- Median dwellMs > 30s and `MESSAGE_HELPFUL` signals high → keep `terseness=detailed`.

**Suggested-question generation weights:**
- Track which suggested questions get clicked; upweight similar phrasings in next classification pass.

### 21.3 Guardrails on learning

- **Never learn from a single signal.** Minimum 5 signals before adjusting any parameter.
- **Bound all adjustments.** z-score can only move within [1.5, 3.5]. Terseness has 3 discrete levels.
- **Show the merchant what changed.** Settings page shows "الوكيل تعلّم أنك تفضل الملخصات القصيرة — يمكنك تغيير ذلك".
- **One-tap reset.** Merchant can revert all learned preferences.

---

## 22. User preferences (NEW in v3)

Stored on `User` (new fields) and read at every chat turn:

```prisma
model User {
  // ... existing fields
  aiLocale       Locale       @default(AR) @map("ai_locale")
  aiDialect      String?      @map("ai_dialect")      // 'iraqi'|'gulf'|'levantine'|'egyptian'|null
  aiTerseness    AiTerseness  @default(BALANCED) @map("ai_terseness")
  aiPersonality  AiPersonality @default(DIRECT) @map("ai_personality")
  aiCurrencyPref String?      @map("ai_currency_pref") // override account currency for display
}

enum AiTerseness { TERSE BALANCED DETAILED }
enum AiPersonality { DIRECT ENCOURAGING PROFESSIONAL }
```

**How they flow into the prompt:**

```
[Base system prompt]

## Merchant preferences (this session)
- Locale: Arabic (Iraqi dialect)
- Length preference: balanced (3-5 sentences per point)
- Tone: direct and encouraging
- Currency preference: IQD (override display; keep DB in account currency)
```

**Defaults from behavior:** on first use, dialect is inferred from user's IP (Iraq → iraqi) and can be overridden in settings.

**Why it makes the assistant feel "smart":** the same reply reads differently to different merchants. A blunt Iraqi retailer gets *"شفت حملة X، تكلفتها انفلتت — أوقف الإعلانات الثابتة"*. A cautious Gulf brand manager gets *"لاحظت مؤشراً في حملة X يستدعي المراجعة — تكلفة الرسالة ارتفعت 42% وقد يفيد تحديث الإبداعات"*.

---

## 23. Session-aware cross-surface context (NEW in v3)

The chat doesn't live in isolation — the merchant is often looking at a specific campaign on the dashboard when they open chat. The assistant should know that.

### 23.1 Session context envelope

Frontend passes a lightweight envelope with every chat request:

```jsonc
{
  "message": "لماذا هذا الأداء ضعيف؟",
  "sessionContext": {
    "currentSurface": "campaigns_page",
    "focusedCampaignId": "cmp_abc",
    "openTabsSummary": ["campaigns", "recommendations"],
    "lastDashboardKpiClicked": "ctr",
    "timeOnPage": 47
  }
}
```

### 23.2 How the agent uses it

- **Ambiguous references resolve:** merchant says *"لماذا هذا"* — agent knows "هذا" = campaign `cmp_abc` because they're looking at it. No clarifying question needed.
- **Skip redundant tool calls:** if the merchant is looking at the dashboard, `list_campaigns` output for the current window is likely already loaded in their view. Cache hit → no extra call.
- **Personalized suggested questions:** dynamic 4 suggestions match the surface. On the campaigns page: *"لماذا حملة X أفضل من Y؟"*. On the recommendations page: *"اشرح لي هذه التوصية"*.

### 23.3 Privacy

Session context is transient — not persisted. Only passed to the current turn. Merchant can disable via a toggle "لا تشاركني موقعي في التطبيق".

---

## 24. Structured output for UI (NEW in v3)

Some replies belong in a card, not a paragraph. Give Claude a way to opt into structured output via a special tool.

### 24.1 `render_ui_block` tool (T13)

**Description Claude sees:** *"When your reply is better rendered as a structured card (a KPI grid, a comparison table, a ranked list), call this instead of writing prose. The UI will render the block above your text reply. Use SPARINGLY — plain Arabic prose is preferred for narrative answers."*

```jsonc
{
  "type": "object",
  "properties": {
    "blockType": { "type": "string", "enum": ["kpi_grid","comparison_table","ranked_list","alert_banner","action_button_row"] },
    "title":     { "type": "string", "maxLength": 100 },
    "payload":   { "type": "object", "description": "Block-type-specific shape" },
    "citation":  { "type": "array", "items": { "type": "string" }, "description": "Tool call refs like ['T2:campaign.metrics']" }
  },
  "required": ["blockType","payload"]
}
```

**Block types & payload schemas** documented in `agent/blocks/schemas.ts`. Example — `comparison_table`:

```ts
{
  columns: ['الحملة', 'CTR', 'CPM', 'ROAS'],
  rows: [
    { label: 'رمضان — عرض 20%', values: ['1.8%', '$4.20', '2.1x'] },
    { label: 'إطلاق منتج جديد',  values: ['0.9%', '$6.80', '0.8x'] }
  ],
  highlight: { row: 1, reason: 'أداء تحت المتوسط' }
}
```

**UI renders:** block above the streamed prose. Merchant can tap a row to drill down.

**Why this is "smart":** prose is right for "why", tables are right for "what". The agent chooses.

---

## 25. Alert escalation ladder (NEW in v3)

Same anomaly persisting for days is not the same event repeated — it's a growing problem. The assistant's tone should reflect that.

### 25.1 The ladder

For each `(entity, metric, direction)` tuple, track `daysAnomalous` in `AiAnomalyState` table:

```prisma
model AiAnomalyState {
  id             String   @id @default(cuid())
  workspaceId    String
  entityType     EntityType
  entityId       String
  metric         String
  direction      String     // 'better'|'worse'
  firstDetectedAt DateTime
  lastDetectedAt  DateTime
  daysAnomalous  Int        @default(1)
  totalAlerts    Int        @default(0)
  merchantResponse String? // 'acknowledged'|'dismissed'|null

  @@unique([workspaceId, entityType, entityId, metric, direction])
}
```

### 25.2 Alert tone by ladder step

| daysAnomalous | Tone | Example |
|---|---|---|
| 1 | **Whisper** — soft observation | *"لاحظت شذوذاً بسيطاً في حملة X، لكن اليوم واحد فقط — راقب."* |
| 2 | **Normal** — clear description | *"يومان متتاليان: تكلفة الرسالة في حملة X أعلى بـ 60% من المتوسط. سبب واضح مقترح…"* |
| 3–4 | **Concerned** — urging action | *"3 أيام والوضع لم يتحسن. أنصحك بشدة تحدث الإبداعات أو توقف مؤقتاً."* |
| 5+ | **Escalation** — strongest voice | *"⚠️ 5 أيام والوضع يتدهور. لو ما تدخّلت الآن، الميزانية تتضرر بلا نتائج. القرار لك — أنا نبّهتك بأقصى ما أستطيع."* |

**Reset condition:** metric returns within 1.5σ of baseline for 2 consecutive days → clear the state.

**Guardrail:** merchant can silence one anomaly for 7 days via one tap ("لا أزعجني بهذا").

---

## 26. Sentiment matching + emotional intelligence (NEW in v3)

Before the analyst turn, run a lightweight sentiment check on the merchant's message. Adjust the reply's emotional register.

### 26.1 Detection

Haiku classifier extended:

```jsonc
{
  "sentiment": "neutral"|"frustrated"|"excited"|"confused"|"anxious",
  "signalStrength": 0..1  // confidence
}
```

Triggers by keyword + punctuation:
- **frustrated:** "ليش", "ما يشتغل", "خرا", exclamation marks, all-caps
- **excited:** "!", "ممتاز", "أخيراً", "شكراً"
- **confused:** "ما فهمت", "شنو يعني", multiple question marks
- **anxious:** "قلقان", "خايف", "الفلوس", "ميزانية"

### 26.2 Reply adjustments

| Detected | Adjustment |
|---|---|
| frustrated | Acknowledge briefly before diving in. *"أفهم إحباطك. خليني أشوف الأرقام…"* |
| excited | Match energy. *"يسعدني الخبر! خليني أرى شنو يشتغل بالضبط."* |
| confused | Reduce jargon, use analogies. Set terseness to `TERSE`. |
| anxious | Lead with reassurance data. *"ميزانيتك آمنة، لا خسائر كبيرة الآن."* |

**Never lie.** If numbers are bad, still say so — but with acknowledgment first when sentiment is negative.

---

## 27. New-merchant cold start (NEW in v3)

A merchant who just connected their account has 0–3 days of data. The agent must not pretend to have historical context.

### 27.1 Cold-start detection

At turn start, check `account.lastSyncedAt` and total daily_stat rows. Categorize:

- **Cold** (0–3 days data): apologize for limited context.
- **Warm** (4–14 days): partial baselines available.
- **Established** (15+ days): full analysis.

### 27.2 Cold-start behavior

- No baseline comparisons (they'd be noise).
- No z-score anomaly detection (need 30 days for a meaningful baseline).
- Instead: use industry benchmarks from `lookup_knowledge` + `benchmarks_by_industry.json`.
- Prompt suffix injected: *"This merchant has {n} days of data. Do not compare to their historical baseline (not available). Use industry benchmarks and current-window metrics only. Acknowledge the limited data gracefully."*

### 27.3 Onboarding conversation

First time the merchant opens the chat, agent runs:

```
1. list_campaigns to see what's there
2. If total activeCampaigns == 0:
     "أهلاً بك في Adlytic. ما شفت حملات نشطة بعد — لما تشغّل أول حملة على Meta،
      أنا سأبدأ التحليل تلقائياً."
3. If activeCampaigns >= 1:
     "أهلاً بك. عندك {n} حملة نشطة. سأحتاج بضعة أيام لبناء خط الأساس التاريخي،
      لكن يمكنني الآن مقارنة أدائك مع معايير الصناعة. تحبّ أبدأ؟"
4. Persist as AiConversation with metadata.onboardingType='initial'.
```

---

## 28. A/B testing infrastructure (NEW in v3)

The only way to prove "revolutionary" is to measure. Roll out V2 to 50% of workspaces first.

### 28.1 Bucketing

```ts
function isAgentV2Enabled(workspaceId: string): boolean {
  const bucket = sha1(`agent-v2-rollout-2026-07:${workspaceId}`).slice(0, 8);
  const bucketPct = parseInt(bucket, 16) % 100;
  return bucketPct < config.agent.v2RolloutPct;   // env-controlled 0..100
}
```

Sticky per workspace, deterministic, no cookies needed. Ramp: 10% → 25% → 50% → 100% over 3 weeks.

### 28.2 Metrics compared (per bucket, weekly)

- **Engagement:** chat turns per active user
- **Retention:** 7-day return rate to chat surface
- **Recommendation acceptance rate:** accepted / (accepted + dismissed)
- **Anomaly detection true-positive rate** (from merchant feedback)
- **Session dwell time on dashboard**
- **NPS-lite proxy:** MESSAGE_HELPFUL / (helpful + unhelpful)

### 28.3 Rollback trigger

Automatic rollback (v2 % → 0) if any of:
- Weekly hallucination rate > 3%
- p95 latency > 15s for 3 days
- Recommendation acceptance rate drops > 30% vs v1 bucket
- Cost per workspace/day > $3

---

## 29. Explainable recommendations audit trail (NEW in v3)

Every AI-generated recommendation carries a complete reasoning chain. Merchants can ask "لماذا اقترحت هذا؟" weeks later and get the exact evidence.

### 29.1 Persistence

`Recommendation` table extended:

```prisma
model Recommendation {
  // existing fields...
  source          String        @default("rule_engine")  // 'rule_engine' | 'ai_agent'
  reasoningChainJson Json?       // (NEW) the tool results + reasoning
  aiConversationId String?       // link back to the conversation that produced it
  aiMessageId      String?       // link to the specific ASSISTANT message
}
```

`reasoningChainJson` example:

```jsonc
{
  "generatedByModel": "claude-sonnet-5",
  "toolCallsInEvidence": [
    { "tool": "detect_anomaly", "returned": {...compressed} },
    { "tool": "get_creative_performance", "returned": {...compressed} }
  ],
  "keyFacts": [
    "cost_per_message deviated 5.8 sigma from 90d baseline on 2026-07-04",
    "4 of 5 creatives lack video; video correlates -0.62 with cost_per_message"
  ],
  "reasoning": "Video absence identified as most-likely cause; refreshing creatives ranked higher than pause because campaign has strong lifetime ROAS (2.1x).",
  "confidenceScore": 0.87,
  "alternativesConsidered": [
    { "action": "PAUSE_CAMPAIGN", "rejectedBecause": "sustained ROAS > 2x means pause loses proven learning" },
    { "action": "DECREASE_BUDGET", "rejectedBecause": "not addressing root cause (creative)" }
  ]
}
```

### 29.2 UI: "لماذا اقترحت هذا؟" button

On any recommendation card, a small "؟" button opens a modal showing:
- The key facts as bullets in Arabic
- The alternatives considered (transparency)
- A link to the original conversation
- Confidence score as a bar

**Why this matters for trust:** merchants can *audit* the AI's reasoning. This is the difference between "black box" and "glass box".

---

## 30. Fraud & suspicious-activity safety net (NEW in v3)

Some patterns are not "optimization opportunities" — they're red flags. The assistant should catch them.

### 30.1 Patterns detected in `check_suspicious_activity` (T14)

- **Impression fraud:** spend increased 500%+ hour-over-hour with impressions rising but 0 clicks/messages. Auction fraud or bot traffic.
- **Budget bleed:** daily spend exceeded daily budget by >30% (Meta's over-delivery gone wrong).
- **Attribution collapse:** conversions dropped to 0 while spend continued — tracking pixel likely broken.
- **Duplicate charges:** multiple identical ad sets with same creative and same audience (unintended duplication).
- **Runaway budget:** newly launched campaign hit 100% of daily budget in first hour.

### 30.2 Response

- **Severity ALWAYS `CRITICAL`** — surfaced first in any brief.
- Alert channel: push notification + email (not just chat).
- Tone: urgent, action-oriented. *"⚠️ فحصت الأرقام: حملة X استهلكت الميزانية في ساعة واحدة بلا أي رسائل. ممكن مشكلة في تتبع البيكسل. راجع Meta الآن."*
- Recommendation saved with `actionCode='INVESTIGATE_TRACKING'` or `'PAUSE_URGENT'`.

### 30.3 Rate limits

Fraud alerts are rare and important — no rate cap. But same fraud pattern doesn't re-alert within 6 hours.

---

## 31. Industry benchmarking (opt-in, NEW in v3)

Cross-workspace insights add real value — with careful consent.

### 31.1 What we compare

For merchants who opt in:
- Their CTR vs median of same-industry workspaces (same country + industry)
- Their cost_per_message vs same-cohort P50/P75
- Their ROAS vs same-cohort P50/P75

All returned as **rank percentiles**, never raw values or names of other merchants.

### 31.2 Consent flow

Settings toggle: *"شارك بياناتك مع مقارنات مجمّعة (بدون هوية) لتحسين نصائح Adlytic لك"*. Default: OFF. When ON:
- Their data becomes part of the aggregation pool.
- They can query the pool.
- Turn off any time → historical aggregations still exist (can't un-mix), but no future contribution.

### 31.3 `get_industry_benchmark` tool (T15)

**Description Claude sees:** *"For workspaces with benchmarking enabled, return industry P50/P75 for the merchant's metrics. Use when merchant asks 'شنو الوضع الطبيعي' or 'أنا أفضل ولا أسوأ من غيري'. Returns null with a reason when benchmarking is disabled — do NOT invent benchmarks."*

Response:

```ts
{
  enabled: boolean;
  reason?: string;     // "opted_out" | "insufficient_cohort" (<20 workspaces in cohort)
  cohort?: {
    industry: string;
    country: string;
    workspaceCount: number;    // for the merchant's transparency
  };
  benchmarks?: {
    ctr:              { p50: number; p75: number; yourRank: number };
    cost_per_message: { p50: number; p75: number; yourRank: number };
    roas:             { p50: number; p75: number; yourRank: number };
  };
}
```

### 31.4 Anonymization

- Cohort size floor: benchmark returned only when ≥20 workspaces in the same (industry, country) cell. Below floor: return `null` with reason.
- Weekly re-aggregation from raw data; no per-workspace values stored in the benchmark table.
- Differential privacy noise added to P50/P75 (Laplace noise, ε=0.5) to prevent inference of any single workspace.

---

## 32. Multi-language mid-conversation (NEW in v3)

Merchant may switch languages mid-thread. Reply in whatever they used *last*, not what the conversation was set to.

### 32.1 Per-turn language detection

Classifier extended output: `replyLanguage: 'ar'|'en'`. Detects from the most recent user message (not the conversation locale).

### 32.2 Handling

- System prompt includes: *"The user's LAST message was in {ar|en}. Reply in that language."*
- If it changes back next turn, follow again.
- `AiConversation.locale` stays as the *default* but per-message override wins.

---

## 33. Meta API budget awareness (NEW in v3)

Some tools trigger real Meta API calls (via the existing sync worker path). Be transparent about cost.

### 33.1 Tools flagged as "Meta-live"

Today, all tools read from PostgreSQL (indirectly from Meta via sync). Future tools may hit Meta live (e.g. `verify_campaign_status_live`). When they exist:

- Tool description declares: *"This tool hits Meta's API directly. Rate-limited to 10 calls/hour per workspace."*
- Response includes `meta.metaApiCallsUsed: 1`.
- Assistant tells merchant: *"شفت مباشرة من Meta (لأن الحالة قد تغيّرت الآن)…"*.

### 33.2 Not in Phase 2

All Phase 2 tools remain DB-only. This section reserves the pattern for Phase 3+ when live actions arrive.

---

## 34. Onboarding conversation flow (NEW in v3)

When a merchant first uses the chat, guide them explicitly.

### 34.1 Flow

Trigger: first `POST /ai/chat/v2` for a `user_id` in a workspace.

```
1. Skip classifier + full analyst turn. Send a hand-crafted greeting:
   "أهلاً {firstName}! أنا CMO ذكي، جاهز أساعدك تفهم حملاتك على Facebook و
    Instagram. أفضل طريقة تبدأ:
    ⚡ اسأل: 'شنو أفضل حملاتي؟'
    🔍 أو: 'هل هناك مشاكل الآن؟'
    📊 أو: 'قارن هذا الشهر بالماضي'.
    ما رأيك؟"
2. Log AiSignal(type=ONBOARDING_STARTED).
3. Next turn: normal flow.
```

### 34.2 First-week nudges

If user hasn't asked a comparison question in first week, agent proactively offers on next opening: *"لاحظت لم تسألني عن المقارنة بين الحملات — تحب أريك أفضل حملة الآن؟"*.

Bounded: max 3 nudges total; stops after any acknowledgment.

---

## 35. Deep progressive disclosure (NEW in v3)

Default reply length: 2-3 sentences. Merchant asks for more → expand.

### 35.1 Layered response

Every analyst turn produces two layers:

```
mainAnswer: string;         // 2-3 sentences, streamed first
expandedAnswer?: string;    // 5-10 sentences, only sent if merchant taps "أكثر"
```

Sent as SSE events:

```
event: main_answer
data: {"text": "الحملة X أفضل: ROAS 3.2x."}

event: expand_available
data: {"hasMore": true, "hint": "اشرح لي أكثر"}

// if user clicks "أكثر":
event: expanded_answer
data: {"text": "التفاصيل: ..."}
```

### 35.2 Personalization from §22

Merchant with `terseness=TERSE` → skip `expanded_answer` unless requested.
Merchant with `terseness=DETAILED` → send both immediately.

---

## 36. Estimated effort (v3)

| Sub-phase | Scope | LOC (net) | Days |
|---|---|---|---|
| 2.1 | Prisma migrations (conversations, signals, anomaly state, prefs, benchmark) + hourly breakdown sync extension | ~350 | 0.75 |
| 2.2 | Tool infrastructure (envelope, cache, rate limit, dispatcher, validator, dataFreshness) | ~700 | 1.0 |
| 2.3 | 15 tool handlers (12 from v2 + T13 render_ui_block + T14 check_suspicious + T15 industry_benchmark) | ~2 400 | 2.5 |
| 2.4 | Agent loop + classifier + prompts + sentiment + session context | ~700 | 1.25 |
| 2.5 | Anti-hallucination post-check + citation parser + retry logic | ~450 | 0.75 |
| 2.6 | SSE streaming endpoint (main + expanded layers) | ~350 | 0.5 |
| 2.7 | Daily brief cron + anomaly alert with escalation ladder + fraud alerts | ~600 | 1.0 |
| 2.8 | Continuous learning: signal ingestion + threshold tuning + preference EMA | ~500 | 0.75 |
| 2.9 | Evaluation harness + 40 cases + LLM-as-judge | ~900 | 1.25 |
| 2.10 | Admin observability page + smart fallback + A/B bucketing telemetry | ~550 | 0.75 |
| 2.11 | UI wiring: aiPage SSE consumer + proactive brief surface + citation modal + "why?" audit + onboarding flow | ~700 | 1.0 |
| 2.12 | Industry benchmark aggregation job + consent flow | ~350 | 0.5 |
| 2.13 | Cleanup: delete V1/V5, remove dead code, docs | ~-1 400 | 0.25 |
| **Total** | | **~7 150** | **~12.25 days** |

Grew from v2's 7.75 days → 12.25. The additions in v3 (guardrails, learning loop, preferences, sentiment, escalation, structured output, cold-start, A/B, benchmarking, cross-surface context, onboarding, progressive disclosure) are what turn "an assistant that reads DB" into "an assistant that trusts and gets trusted." Honest number.

---

## 37. What v3 changes vs v2 — summary

Sixteen new sections (§§20–35). The center of gravity moved from *"give Claude better tools"* to *"turn Claude into an accountable, personalized, safety-checked partner"*.

**New core capabilities:**

1. **Zero-hallucination guarantee via post-check** (§20) — every reply is validated against tool outputs; violations trigger a rewind, not a silent error.
2. **Learning loop** (§21) — the assistant tunes anomaly thresholds, recommendation priorities, and terseness from merchant signals over time.
3. **User preferences** (§22) — dialect, tone, terseness, currency preference persist per user.
4. **Session-aware context** (§23) — knows what the merchant is looking at right now.
5. **Structured UI blocks** (§24) — tables and cards when prose is wrong.
6. **Escalation ladder** (§25) — day-1 whisper → day-5 warning, per anomaly.
7. **Sentiment matching** (§26) — acknowledges frustration/anxiety before analysis.
8. **Cold-start handling** (§27) — new merchants get honest limited-data mode.
9. **A/B testing infra** (§28) — 10% → 100% ramp with automatic rollback triggers.
10. **Explainable recommendations** (§29) — every AI rec carries its full reasoning chain.
11. **Fraud safety net** (§30) — impression fraud, budget bleed, attribution collapse, duplicate charges, runaway budget.
12. **Industry benchmarking** (§31) — opt-in, cohort-floored, differential-privacy noise.
13. **Multi-language mid-thread** (§32) — reply in the last-used language, not the conversation locale.
14. **Onboarding conversation** (§34) — first-run flow with concrete example questions.
15. **Progressive disclosure** (§35) — 2-sentence answer first, expand on demand.
16. **Total tools: 15** (up from 12): +T13 `render_ui_block`, +T14 `check_suspicious_activity`, +T15 `get_industry_benchmark`.

**Anti-pattern audit (re-checked for v3 additions) — still clean.**
