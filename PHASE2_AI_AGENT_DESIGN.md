# Phase 2 — Adlytic Smart Assistant: Agent Architecture Design

**Status:** Proposed — awaiting user approval before implementation.
**Applies:** `src/services/ClaudeCMO.ts`, `src/services/aiContextBuilder.ts`, `src/services/aiContextBuilderV5.ts`, `src/services/aiKnowledgeContext.ts`, `src/services/claudeClient.ts`, `src/api/server.ts:2384-2436` (chat endpoint), `prisma/schema.prisma` (new tables).

---

## 1. Goal

Turn the current "rule engine that outsources Arabic wording to Claude" into a **real analytical agent** that:

- Talks to PostgreSQL **directly through typed tools** (no bulk context injection).
- Uses historical data as a **comparison instrument**, never as the answer.
- Classifies campaigns into **best / mid / worst** with a per-campaign "what makes it unique."
- Remembers the conversation across turns.
- Answers in natural Arabic without English jargon leakage.

The user's pipeline stays intact:

```
Meta Ads → Data Collector → PostgreSQL (single source of truth)
    → Analytics + Historical Engines → Decision Engine → LLM → Recommendations
```

Change: the LLM step becomes a Claude **agent**, not a translator. It calls tools that read PostgreSQL live.

---

## 2. Architecture pattern

**Chosen pattern:** Single Agent Pattern (per `agent-designer/references/agent_architecture_patterns.md`).

**Why not supervisor / swarm / hierarchical:**

| Criterion | Adlytic reality | Fit |
|---|---|---|
| Agent count | One conversational role (the CMO) | Single |
| Task complexity | Medium — analyze, compare, rank, explain | Single |
| Coordination need | Low — no parallel workers | Single |
| Fault tolerance | Not a system-of-systems; one degraded reply is acceptable | Single |
| Latency budget | Chat UX expects &lt;5s p50 | Single (multi-agent adds RTTs) |

**Agent archetype:** Specialist + Interface combined.
- **Specialist:** deep Meta-Ads analytics expertise via tools + knowledge base.
- **Interface:** direct chat with the merchant, memory of the thread.

**What we intentionally keep from today's stack:**
- Physics / Confidence / Recovery / Pattern engines stay. They still produce `campaignBrainSnapshot` + `campaignIntelligenceReport`. The agent **reads them via tools**, it does not replace them. This is exactly the user's request: the rule engines are the deterministic decision layer, the LLM is the reasoning + communication layer.

**What we drop:**
- `aiContextBuilder.ts` (V1) — deleted.
- `aiContextBuilderV5.ts` (V5) — deleted. Its data becomes tool responses.
- `aiKnowledgeContext.ts`'s bulk KB injection — replaced by an on-demand `lookup_knowledge` tool.

---

## 3. Tool catalog

All tools are **read-only** (idempotent by design), return in a **standard envelope**, and enforce **workspace isolation** at the tool boundary — no tool trusts the LLM to pass the right `workspaceId`; the dispatcher scopes every query to the caller's workspace.

### 3.1 Standard response envelope

Every tool returns:

```ts
type ToolResult<T> =
  | { ok: true; data: T; meta: ToolMeta }
  | { ok: false; error: ToolError };

interface ToolMeta {
  toolName: string;
  executionMs: number;
  cachedSeconds?: number; // if served from cache
}

interface ToolError {
  code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL_ERROR' | 'TIMEOUT';
  message: string;
  field?: string;         // which input was wrong
  retryable: boolean;
}
```

Rationale: matches `tool_design_best_practices.md` §"Response Structure" — predictable shape success or failure, so Claude never has to guess.

### 3.2 The eight tools

Each tool has: single responsibility, strong input schema, comparison built into the response (current + prior + delta%), and structured errors.

---

#### T1. `list_campaigns`

**Purpose:** Get every active campaign in the workspace with headline metrics, ordered by health.
**Use case:** "ما هي حملاتي؟", "أرني حملاتي النشطة".

```jsonc
// Input
{
  "type": "object",
  "properties": {
    "windowDays": { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 },
    "sortBy":     { "type": "string", "enum": ["health","spend","roas","ctr","messages"], "default": "health" },
    "direction":  { "type": "string", "enum": ["asc","desc"], "default": "desc" },
    "limit":      { "type": "integer", "minimum": 1, "maximum": 50, "default": 20 }
  },
  "additionalProperties": false
}
```

```ts
// Output
data: {
  windowDays: number;
  campaigns: Array<{
    id: string;
    name: string;
    status: 'ACTIVE' | 'PAUSED' | ...;
    healthScore: number;         // 0–100
    healthBand: 'excellent'|'good'|'attention'|'poor';
    tier: 'best'|'mid'|'worst';  // derived from health quantile
    metrics: {
      spend:    { current: number; prior: number; deltaPct: number | null };
      messages: { current: number; prior: number; deltaPct: number | null };
      ctr:      { current: number | null; prior: number | null; deltaPct: number | null };
      cpm:      { current: number | null; prior: number | null; deltaPct: number | null };
      roas:     { current: number | null; prior: number | null; deltaPct: number | null };
    };
    whyLabel: string;   // one-line Arabic: "تفاعل عالي، تكلفة منخفضة"
  }>;
}
```

**Comparison contract:** every metric returns `current` + `prior` (equal-length window shifted back) + `deltaPct`. Claude never sees "current" without "vs prior" side by side.

**Tiering rule (deterministic, not LLM-invented):**
- `best`: top 25% by health OR (roas > 2 AND spend > median)
- `worst`: bottom 25% by health OR (spend > median AND messages = 0)
- `mid`: everything else.

**`whyLabel` generator:** two most differentiating metrics vs the workspace median, formatted in Arabic. E.g. `"CTR فوق المتوسط بـ 40%، تكلفة الرسالة أقل بـ 30%"`. Computed in TS, not by the LLM.

---

#### T2. `get_campaign_details`

**Purpose:** Deep dive on one campaign — current window, historical baseline, top issues, top recommendations.
**Use case:** "تحدث لي عن حملة X", "لماذا حملة X أداؤها ضعيف؟".

```jsonc
// Input
{
  "type": "object",
  "properties": {
    "campaignId":   { "type": "string", "minLength": 1 },
    "windowDays":   { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 },
    "compareToDays":{ "type": "integer", "minimum": 7,  "maximum": 180, "default": 90 }
  },
  "required": ["campaignId"],
  "additionalProperties": false
}
```

```ts
// Output
data: {
  campaign: {
    id: string; name: string; status: string;
    objective: string; startedAt: string;
    dailyBudget: number | null;
  };
  windowMetrics: {
    // same shape as T1's `metrics`
  };
  historicalBaseline: {
    // aggregate over compareToDays as a "normal for this campaign" reference
    days: number;
    ctrMean: number | null;
    cpmMean: number | null;
    dailySpendMean: number;
    dailyMessagesMean: number;
  };
  vsBaseline: {
    ctrPct: number | null;    // current CTR / baseline CTR - 1
    cpmPct: number | null;
    spendPct: number;
    messagesPct: number;
  };
  topIssues: Array<{ code: string; severity: string; evidence: string[] }>;     // from campaignIntelligenceReport
  topRecommendations: Array<{ text: string; priority: string; strength: number }>;
  latestBrainAction: { action: string; priority: string; date: string } | null;  // from campaignBrainSnapshot
}
```

**Comparison as instrument:** the `historicalBaseline` block is what makes yesterday's data useful — a benchmark, not the answer. Claude uses it to say *"CTR اليوم 0.8% مقابل خط الأساس التاريخي 1.2% (انخفاض 33%)"*.

---

#### T3. `compare_periods`

**Purpose:** Explicit two-window comparison of any entity (account, campaign, adset, ad) with per-metric verdict.
**Use case:** "قارن هذا الأسبوع بالأسبوع الماضي", "كيف كان الأداء الشهر الماضي مقارنة بهذا الشهر؟".

```jsonc
// Input
{
  "type": "object",
  "properties": {
    "entityType": { "type": "string", "enum": ["ACCOUNT","CAMPAIGN","ADSET","AD"] },
    "entityId":   { "type": "string", "minLength": 1 },
    "windowA":    { "type": "object", "properties": {
                      "sinceDaysAgo": { "type":"integer","minimum":1,"maximum":365 },
                      "untilDaysAgo": { "type":"integer","minimum":0,"maximum":365 }
                    }, "required":["sinceDaysAgo","untilDaysAgo"] },
    "windowB":    { "type": "object", "properties": {
                      "sinceDaysAgo": { "type":"integer","minimum":1,"maximum":365 },
                      "untilDaysAgo": { "type":"integer","minimum":0,"maximum":365 }
                    }, "required":["sinceDaysAgo","untilDaysAgo"] }
  },
  "required": ["entityType","entityId","windowA","windowB"],
  "additionalProperties": false
}
```

```ts
// Output
data: {
  windowA: { since: string; until: string; days: number; totals: {...}; ratios: {...} };
  windowB: { since: string; until: string; days: number; totals: {...}; ratios: {...} };
  deltas: {
    spendPct: number | null;
    messagesPct: number | null;
    ctrPct: number | null;
    cpmPct: number | null;
    roasPct: number | null;
  };
  verdicts: {
    // deterministic, not LLM-generated — Claude quotes these
    overall: 'better'|'worse'|'flat'|'mixed';
    reasons: string[];   // Arabic, e.g. ["الإنفاق ارتفع 12%","الرسائل انخفضت 25%"]
  };
}
```

---

#### T4. `rank_campaigns`

**Purpose:** Explicit best/worst by a metric with an unambiguous ordering.
**Use case:** "ما أفضل حملاتي؟", "أرني أسوأ 3 حملات في الإنفاق"

```jsonc
{
  "type": "object",
  "properties": {
    "metric":     { "type": "string", "enum": ["roas","ctr","cpm","cost_per_message","spend","messages","health"] },
    "direction":  { "type": "string", "enum": ["best","worst"], "default": "best" },
    "windowDays": { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 },
    "limit":      { "type": "integer", "minimum": 1, "maximum": 20, "default": 5 },
    "minSpend":   { "type": "number", "minimum": 0, "default": 0,
                    "description": "Exclude tiny-spend campaigns from ranking to avoid noise" }
  },
  "required": ["metric","direction"],
  "additionalProperties": false
}
```

```ts
// Output
data: {
  metric: string; direction: 'best'|'worst';
  windowDays: number;
  ranked: Array<{
    rank: number;
    campaignId: string;
    campaignName: string;
    value: number | null;         // the metric value
    valueDisplay: string;         // formatted, e.g. "2.4x" for ROAS
    reasonToRank: string;         // Arabic: why is this best/worst
  }>;
  excluded: number;                // count filtered by minSpend
}
```

---

#### T5. `get_audience_breakdown`

**Purpose:** Split a campaign's metrics by a Meta breakdown dimension.
**Use case:** "من الجمهور الأفضل استجابة؟", "أي فئة عمرية تكلف أقل؟".

Reads from `breakdownStat` table (already synced by `syncBreakdowns` in syncAccount.ts:897).

```jsonc
{
  "type": "object",
  "properties": {
    "campaignId": { "type": "string", "minLength": 1 },
    "dimension":  { "type": "string", "enum": ["age","gender","country","placement","platform","device"] },
    "metric":     { "type": "string", "enum": ["spend","messages","ctr","cpm","cost_per_message","roas"], "default": "cost_per_message" },
    "windowDays": { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 },
    "limit":      { "type": "integer", "minimum": 1, "maximum": 30, "default": 10 }
  },
  "required": ["campaignId","dimension"],
  "additionalProperties": false
}
```

```ts
// Output
data: {
  dimension: string; metric: string;
  segments: Array<{
    segment: string;             // "18-24" or "IQ" or "instagram_stories"
    spend: number;
    messages: number;
    metricValue: number | null;
    metricDisplay: string;
    shareOfSpendPct: number;      // % of total spend in this campaign
  }>;
  best: { segment: string; reason: string } | null;
  worst: { segment: string; reason: string } | null;
}
```

---

#### T6. `get_creative_performance`

**Purpose:** Rank creatives inside a campaign so we can say which ad copy/image is working.
Reads from `adCreative` + per-ad `dailyStat` (EntityType.AD).

```jsonc
{
  "type": "object",
  "properties": {
    "campaignId": { "type": "string" },
    "windowDays": { "type": "integer", "minimum": 1, "maximum": 90, "default": 30 },
    "limit":      { "type": "integer", "minimum": 1, "maximum": 20, "default": 5 }
  },
  "required": ["campaignId"]
}
```

Output shape mirrors T4 (ranked list) but per-ad, with creative previews (title, body preview, cta type, thumbnail URL).

---

#### T7. `lookup_knowledge`

**Purpose:** On-demand retrieval from `metaAdsKnowledgeBase.json` + benchmarks + rule catalog. Replaces the giant system-prompt injection.
**Use case:** Claude asks itself "what does Meta recommend when CTR &lt; 1%?" mid-turn.

```jsonc
{
  "type": "object",
  "properties": {
    "topic":     { "type": "string", "minLength": 2,
                   "description": "Free-text query, e.g. 'low CTR remediation' or 'placement optimization'." },
    "industry":  { "type": "string", "description": "Optional: industry code for industry-tuned benchmarks" }
  },
  "required": ["topic"]
}
```

Implementation option A (v1): keyword match against JSON topics.
Implementation option B (later): embeddings-based RAG (uses `rag-architect` skill).

Start with A; migrate to B in Phase 2.5.

---

#### T8. `save_recommendation`

**Purpose:** The one **write** tool. When Claude drafts a recommendation it wants to persist to the merchant's dashboard (not just say in chat), it calls this.
Writes to `recommendations` table with `source='ai_agent'`.

```jsonc
{
  "type": "object",
  "properties": {
    "entityType":  { "type": "string", "enum": ["ACCOUNT","CAMPAIGN"] },
    "entityId":    { "type": "string" },
    "text":        { "type": "string", "minLength": 10, "maxLength": 500 },
    "actionCode":  { "type": "string", "enum": ["PAUSE","REFRESH_CREATIVE","INCREASE_BUDGET","DECREASE_BUDGET","NARROW_AUDIENCE","EXPAND_AUDIENCE","MONITOR"] },
    "priority":    { "type": "string", "enum": ["CRITICAL","HIGH","NORMAL"] },
    "reasoning":   { "type": "string", "minLength": 20, "maxLength": 800,
                     "description": "Why the agent chose this — kept for audit" }
  },
  "required": ["entityType","entityId","text","actionCode","priority","reasoning"],
  "additionalProperties": false
}
```

**Guardrail (human-in-the-loop):** every AI-generated recommendation is written with `status='SUGGESTED_BY_AI'` (new enum value). The dashboard shows it as "الذكاء الاصطناعي يقترح…" with an accept/dismiss button. Nothing changes on Meta.

---

## 4. Conversation memory model

Two new Prisma models. Migration name: `20260704_ai_conversation_memory`.

```prisma
model AiConversation {
  id           String   @id @default(cuid())
  workspaceId  String   @map("workspace_id")
  userId       String   @map("user_id")
  title        String?
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user         User      @relation(fields: [userId],      references: [id], onDelete: Cascade)
  messages     AiMessage[]

  @@index([workspaceId, updatedAt])
  @@index([userId, updatedAt])
  @@map("ai_conversations")
}

model AiMessage {
  id             String   @id @default(cuid())
  conversationId String   @map("conversation_id")
  role           AiMessageRole
  content        String   @db.Text
  toolCallsJson  Json?    @map("tool_calls_json")   // when role=ASSISTANT and the turn invoked tools
  toolResultsJson Json?   @map("tool_results_json") // when role=TOOL
  tokensIn       Int?     @map("tokens_in")
  tokensOut      Int?     @map("tokens_out")
  latencyMs      Int?     @map("latency_ms")
  createdAt      DateTime @default(now()) @map("created_at")

  conversation   AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

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

**Retention policy:** keep last 90 days per workspace, then archive.

**Loading strategy per turn:**
- Load last `MAX_HISTORY_TURNS = 20` message pairs.
- If total tokens > `HISTORY_TOKEN_BUDGET = 8000`, drop oldest pairs first (never split a user↔assistant pair).
- Never load tool results older than the current conversation — they're stale by design (fresh tool calls will re-query DB).

---

## 5. The agent loop

Single `POST /api/workspaces/:workspaceId/ai/chat/v2` endpoint. Server-side loop:

```
1. Auth: verify user is member of workspace.
2. Load or create AiConversation (by ?conversationId= or new).
3. Load last N messages as history.
4. Persist the incoming user message.
5. Loop (max 6 iterations to bound cost/latency):
     - Call Anthropic with: system_prompt + history + tools[].
     - If response.stop_reason == 'tool_use':
         - For each tool_use block, dispatch to typed handler.
         - Persist a TOOL message with the result.
         - Continue loop.
     - Else break.
6. Persist final ASSISTANT message.
7. Return { conversationId, reply, toolCalls: [...for UI drill-down] }.
```

**Bounds (guardrails per `agent_architecture_patterns.md` §"Guardrails and Safety"):**

| Guard | Value | Enforcement |
|---|---|---|
| Max tool-use iterations per turn | 6 | Server loop counter |
| Max tools per iteration | 5 | Enforced by trimming Anthropic's response |
| Per-tool timeout | 5s | `Promise.race` in dispatcher |
| Per-turn total timeout | 60s | Overall Promise.race |
| Workspace isolation | Every tool arg re-scoped | Dispatcher, not LLM |
| Write tools | Only `save_recommendation`, marked SUGGESTED_BY_AI | Handler-side check |
| Max tokens per response | 2048 | Anthropic API param |

---

## 6. System prompt (v2)

Replaces the 145-line rigid prompt in `ClaudeCMO.ts`. Key changes:

- **~40 lines total.** Rules move to tool schemas (schema is the constraint).
- **No jargon rules** — just: "Reply in the user's language. Prefer plain Arabic. Explain any English metric name in Arabic parentheses on first use."
- **No "forbidden words" list** — enforced by tool output formatting.
- **Explicit tool-use policy:**
  > *"When the user asks about specific campaigns, call `list_campaigns` first. When they ask about a single campaign by name, call `get_campaign_details`. Use `compare_periods` for any 'أفضل من / أسوأ من' question. Cite the numbers from tool responses — do not invent values."*
- **Emergency escalation:** *"If a tool result includes severity=CRITICAL, surface it before answering the rest of the question."*

---

## 7. Migration plan

Zero-downtime, feature-flagged.

| Step | Change | Rollback |
|---|---|---|
| 2.1 | Add Prisma models + migration (backwards-compatible: new tables only) | Drop tables |
| 2.2 | Add `src/services/agent/` — `tools/`, `dispatcher.ts`, `loop.ts` | Delete folder |
| 2.3 | Add new route `POST /ai/chat/v2` behind `AI_AGENT_V2_ENABLED` env flag | Turn flag off |
| 2.4 | Update `aiPage.ts` to prefer v2 when flag is on; keep v1 fallback | Prefer v1 |
| 2.5 | After 1 week stable in prod: delete V1 chat endpoint, delete V1/V5 context builders, delete `aiKnowledgeContext.ts` bulk injection | Revert commit |

**Files DELETED at 2.5:**
- `src/services/aiContextBuilder.ts` (V1)
- `src/services/aiContextBuilderV5.ts` (V5)
- Half of `src/services/aiKnowledgeContext.ts` (keep `lookup_knowledge` data loader)
- Old system prompt block in `ClaudeCMO.ts` (kept for narration cron until Phase 3)

**Files KEPT:**
- `ClaudeCMO.ts` narration path (dashboard-pushed Arabic titles) — still uses rules + Claude for wording; migration of this pipe is Phase 2.6, not blocking.
- All engine files (`AdlyticBrain.ts`, `DecisionEngine.ts`, `PatternEngine.ts`, `RecoveryGate.ts`, `Physics.ts`) — untouched.
- All repositories and mappers — untouched.

---

## 8. What this fixes (from the audit findings)

| Audit finding | Fix |
|---|---|
| "Rule engine that outsources Arabic wording to Claude" | Claude now decides via tools; rules stay as deterministic layer it consults |
| "Two duplicate context builders V1/V5" | Both deleted at 2.5 |
| "Stateless chat: no conversation history" | `AiConversation` + `AiMessage` tables |
| "Static suggested questions" | UI derives 4 questions from the merchant's actual top/bottom campaign names |
| "Two contradictory voice regimes" | One system prompt, no forbidden-word list, tool responses format numbers in Arabic |
| "Emergency-pause bypasses LLM entirely" | Emergency escalation via tool result flag, LLM still speaks |
| "Evidence UI shows raw JSON" | Solved in Phase 3 (UI); design already produces human-readable strings |
| "Locale inferred from message script" | New chat endpoint reads `user.locale` from JWT-scoped user record |

---

## 9. Explicit non-goals (Phase 2)

- **Not** rewriting `ClaudeCMO.ts` narration cron. That's Phase 2.6, decoupled.
- **Not** touching engines or repositories.
- **Not** changing the dashboard UI. That's Phase 3.
- **Not** adding write actions to Meta (pause/enable). Only `save_recommendation` writes, and only to our DB with `SUGGESTED_BY_AI` status.
- **Not** streaming responses (Server-Sent Events). Nice-to-have; add in 2.7.

---

## 10. Success criteria

Phase 2 is done when:

1. `POST /ai/chat/v2` answers "قارن حملة X بالحملة Y" with numeric evidence from tool calls, in Arabic, in one HTTP round-trip.
2. The reply cites specific campaigns by name and quotes their exact metrics (not hallucinated).
3. Follow-up "لماذا؟" works — Claude has the conversation history.
4. `list_campaigns` returns tiered best/mid/worst with a non-empty `whyLabel` per campaign.
5. Tool errors surface as helpful Arabic messages, not raw stack traces.
6. `test:tenant` still passes — workspace isolation intact.
7. No mention of `claude-sonnet-4-6` anywhere.

---

## 11. Self-review — gaps caught before implementation

I ran the design through the `tool_design_best_practices.md` checklist and the `agent_architecture_patterns.md` anti-patterns list. 12 gaps found and folded back into the spec below.

| # | Gap | Fix |
|---|---|---|
| 1 | `save_recommendation` idempotency not specified — Claude could persist duplicates on a retry. | Idempotency key = `(workspaceId, entityType, entityId, actionCode)`. Second call with same key returns the existing row with `meta.deduplicated=true`. |
| 2 | Workspace isolation was described vaguely ("dispatcher scopes queries"). | The dispatcher receives `workspaceId` at construction time from JWT and passes it to every handler as a hidden argument. `workspaceId` is **not** part of any tool's public JSON schema — Claude cannot ask for another workspace even by accident. |
| 3 | No response caching — `list_campaigns` re-scans daily_stats on every turn. | 60-second TTL cache keyed on `(workspaceId, toolName, sha1(sortedArgs))`. In-process Map. Bypassed for `save_recommendation`. |
| 4 | No rate limit — a runaway loop could spam DB. | 30 tool calls per workspace per rolling minute (token bucket, in-memory). Above the limit, dispatcher returns `RATE_LIMIT` error to Claude so it can back off gracefully. |
| 5 | Cost bound not fully specified. | Per-turn budget: **6 iterations OR 20 000 accumulated tokens**, whichever fires first. On budget hit, return a graceful "أعطيتك أقصى تحليل ممكن الآن…" and persist. |
| 6 | PII in tool responses not addressed. | Tools return only campaign business data: campaign id/name, metrics, breakdown segments, creative preview text. **No** user emails, tokens, phone numbers, or internal IDs beyond campaign/adset/ad. Enforced by explicit `select` clauses in each handler. |
| 7 | Locale handling ambiguous. | `AiConversation` stores `locale` at creation from `user.locale`; passed as a one-line system-prompt suffix ("Reply in Arabic" / "Reply in English"). Default AR when unset. |
| 8 | No fallback when all tools fail. | After 3 consecutive tool errors in the same turn, dispatcher aborts the loop and returns a graceful Arabic message. Persisted with `role=ASSISTANT`, `meta.abortReason='tool_failure'`. |
| 9 | Tier assignment (best/mid/worst) breaks with few campaigns. | If workspace has &lt; 4 active campaigns, every campaign is `tier: 'mid'` and `whyLabel` skips ranking language ("حملة واحدة نشطة") — no false precision. |
| 10 | Audit trail vague. | Every tool call persists as `AiMessage` with `role=TOOL`, `toolCallsJson=args`, `toolResultsJson=result`. Full observability without a separate log table. |
| 11 | Migration rollback said "drop tables" — destroys conversation data. | Rollback for step 2.1 = table rename to `_deprecated_ai_conversations`, keep 30 days, then drop. Same for `_deprecated_ai_messages`. |
| 12 | What if Claude ignores a tool's schema (missing field, wrong type)? | Dispatcher validates every tool argument against its JSON schema (via `ajv`). On invalid: return `INVALID_INPUT` with the failing field name. Claude sees the error message and retries — Anthropic docs show this is the recommended pattern. |

**Anti-pattern audit — clean:**

- ❌ **God tool** — each of the 8 tools has one job. `list_campaigns` doesn't overlap with `get_campaign_details` (list vs deep-dive).
- ❌ **Chatty communication** — no inter-agent traffic (single-agent pattern).
- ❌ **Stateful tools** — read tools are pure functions of args + DB state at read time. `save_recommendation` writes to DB, which is correct (it's the write path).
- ❌ **Inconsistent interfaces** — every tool uses the same `ToolResult<T>` envelope.
- ❌ **Silent failures** — no `throw`; every failure returns `{ ok: false, error: {...} }` to Claude.
- ❌ **Generic errors** — enum codes with structured `field` / `retryable` metadata.
- ❌ **Under-specification** — tool JSON schemas set `additionalProperties: false`, so Claude cannot inject arbitrary fields.
- ❌ **Over-centralization** — Prisma is the shared DB layer (as intended); no single tool coordinator holds business state.
- ❌ **Circular dependencies** — tools depend only on Prisma + config; no tool calls another tool.
- ❌ **Unbounded operations** — every tool has an explicit `limit` in its schema and a 5s timeout in the dispatcher.

---

## 12. Estimated effort

| Sub-phase | Scope | LOC | Days |
|---|---|---|---|
| 2.1 Prisma migration | 2 tables + enum | ~50 | 0.25 |
| 2.2 Tools + dispatcher | 8 tools + envelope + validator | ~1200 | 1.5 |
| 2.3 Agent loop + route | Loop, prompt, persistence | ~400 | 1.0 |
| 2.4 UI wiring | aiPage.ts to /v2 | ~150 | 0.5 |
| 2.5 Cleanup | Delete V1/V5, remove dead code | ~-800 | 0.25 |
| **Total** | | **~1000 net** | **~3.5 days** |
