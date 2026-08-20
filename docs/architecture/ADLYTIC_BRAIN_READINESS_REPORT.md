# Adlytic Brain Readiness Report

**Engagement:** ADLYTIC — Final Intelligence Consolidation (Phases 4–10, final independent
audit). **Branch:** `claude/adlytic-graphify-analysis-ai34bu`. **Final HEAD:** `8c05c7f`.
**Companion documents:** `docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md`
(full ownership table, chain diagram, per-layer detail — this report summarizes and points
there rather than repeating it), `docs/ANALYTICS_RULES.md` (ten locked, enforced rules).

---

## 1. Executive Verdict

The intelligence chain — Meta → normalized data → validity → semantics → objective →
anomaly → diagnosis → evidence → decision → LLM explanation → DTO → UI — now has one
canonical authority at every layer, proven both by construction (one function/module owns
each decision) and behaviorally (Phase 10's 8 adversarial acceptance cases, built from the
real production chain, all pass; a fresh independent audit found and this pass fixed 8
additional confirmed P0/P1 gaps the earlier phases had not caught).

**One qualification, stated plainly rather than smoothed over:** `getDashboard.ts`'s
workspace-wide Brain feed (`cmoFeedV2`) is not yet cross-checked against
`reconcileIntelligence()`/`permitAction()` for its one conflict-capable action code
(`REFRESH_CREATIVE`) — the same-campaign inspector view *is* now annotated with this check,
but the dashboard-wide feed is not. This is a real, documented, deliberately-deferred gap
(fixing it correctly means adding per-campaign funnel computation to the hot dashboard-load
path, which needs proper load-testing, not a rushed final-audit patch) — see §12. Every
other invariant this report tracks is genuinely closed, not softened.

**Verdict:** `ADLYTIC_BRAIN_ARCHITECTURALLY_READY = YES, WITH ONE DOCUMENTED EXCEPTION`
(§12, item 1). Full field list in the engagement's closing return (below this report).

---

## 2. Final Architecture

```
Meta Graph API
  → mappers/insightMapper.ts + mappers/creativeMapper.ts (THE CORDON)
  → workers/syncAccount.ts + backgroundScheduler.ts (advisory-locked write path)
  → DailyStat / RawInsight (canonical per-day fields, incl. Meta's own ctr/cpm/frequency)
  → lib/campaignPurpose.ts + lib/objectiveKpis.ts (semantic classification)
  → analytics/resultSemantics.ts (result semantics — unit-safe, never cross-unit)
  → Pipeline A (engines/rules/detect*.ts → Evidence[] → detected_issues → diagnose.ts)
    + Pipeline B (analytics/funnel/diagnose.ts → analytics/intelligence/anomaly.ts →
      hierarchy.ts::reconcileIntelligence() → objectiveHealth.ts → recommend.ts)
    + AI-tool adapter (services/agent/tools/detectAnomaly.ts — canonical-aware, not a
      third authority)
  → decision arbitration (commandCenter.ts::ccRenderAction(), guarded by permitAction();
    getDashboard.ts filters detected_issues by suppressedIssueCodes before either hero
    card renders; the /recommendations flat list and the AI agent's one write tool,
    saveRecommendation.ts, are now both guarded by the same permitAction() check)
  → LLM explanation (adAssessor/*, api/server.ts's /ai/chat with
    formatCanonicalGroundingForV5Context() prepended whenever V5 context is used)
  → DTO (services/getDashboard.ts, campaign-inspector/campaigns-list routes — canonical
    per-day fields read directly, not recomputed; window/aggregate math computed from
    canonical inputs where no stored field exists for a custom range)
  → UI (web/pages/*.ts — formats/visualizes/derives presentation only)
```

Full diagram with the Meta cordon, sync-lock, and purge boxes:
`docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md` §1.

---

## 3. Canonical Ownership Matrix by Layer

| Layer | Owner |
|---|---|
| Meta ingestion cordon | `mappers/insightMapper.ts` (`mapMetaInsight`, `mapMetaBreakdownInsight`), `mappers/creativeMapper.ts` (`mapMetaCreative`, `isCarouselCreative`) |
| Sync write path + concurrency | `workers/syncAccount.ts` (`sync()`/`syncAccountLevelDataLocked()`/`syncChunked()`), `workers/backgroundScheduler.ts`, all now sharing one per-account advisory lock (`lib/advisoryLock.ts`) — including, as of this pass, `services/metaWebhook.ts`'s webhook-triggered reconcile and `workers/queue/reconcileCampaignsProcessor.ts`'s BullMQ processor |
| Semantic classification | `lib/campaignPurpose.ts` (`resolveCampaignPurpose`), `lib/objectiveKpis.ts` |
| Result semantics | `analytics/resultSemantics.ts` |
| Anomaly — pattern/metric level | `engines/rules/detect*.ts` → `Evidence[]` → `detected_issues` |
| Anomaly — funnel-stage level | `analytics/intelligence/anomaly.ts` |
| Anomaly — statistical adapter (non-authoritative) | `services/agent/tools/detectAnomaly.ts` |
| Diagnosis — pattern level | `engines/rules/diagnose.ts` (now sharing `objectiveInputOf()` from `types.ts` with `detectLowCtr.ts`, closing this pass's Finding 1) |
| Diagnosis — funnel/objective level | `analytics/funnel/diagnose.ts`, `analytics/intelligence/hierarchy.ts::reconcileIntelligence()` |
| Evidence contract | Canonical `Evidence` type (`analytics/evidence.ts`); `DashboardDTO.issues[].evidence` now typed `Record<string, unknown> & { knowledgeBase?: MetricBreach }` (Phase 8) |
| Decision / recommendation | `analytics/intelligence/recommend.ts`, `web/pages/dashboard/sections/commandCenter.ts::ccRenderAction()` + `hierarchy.ts::permitAction()` |
| Recommendation persistence + guard | `services/agent/tools/saveRecommendation.ts` (now guarded via the new `resolveEntityIntelligenceForGuard()`, `entityIntelligence.ts`); the flat `GET /recommendations` route now filters by the same guard |
| Sync concurrency | `lib/advisoryLock.ts` — one per-account key, held by every account-mutating entry point identified across this engagement |
| Data purge | `services/accountDataPurge.ts::purgeAccountAnalytics()` — now also covers `refresh_states`/`refresh_logs`/`recommendation_logs` (campaign-scoped) |
| V5 (legacy, still live) | `engines/intelligence/AdlyticIntelligenceSystem.ts` — labeled non-authoritative in `/ai/chat` context (Phase 5) |
| Brain (separate legacy system) | `engine/AdlyticBrain.ts` + `engine/v2/*` — reconciled against the pattern-level rule engine only (`engines/rules/ruleGrounding.ts`), not against `reconcileIntelligence()`; its one conflict-capable action (`REFRESH_CREATIVE`) is now annotated (not filtered) in the campaign-inspector `timeline`, not yet in the dashboard `cmoFeedV2` (§12) |
| DTO | `services/getDashboard.ts` (`DashboardDTO`), campaigns-list/inspector routes in `api/server.ts` |
| UI | `web/pages/*.ts`, `web/layout.ts` — presentation only |

Full table with INPUT/OUTPUT/PERSISTENCE/CONSUMERS/LEGACY-PATHS columns:
`docs/architecture/adlytic/ADLYTIC_INTELLIGENCE_ARCHITECTURE.md` §2.

---

## 4. Final Data Flow

See §2 above and the companion doc's Mermaid-equivalent ASCII diagram (§1). The forward
chain and backward traceability are both proven programmatically, not by inspection, in
`test_brain_acceptance.ts` (Phase 10) — every one of its 8 acceptance traces carries the
full required shape (`campaign, objective, primaryKpi, anomalies, diagnosis, evidence,
confidence, decision, doNotDo`) with zero LLM-authored fields, and each is built by
composing the real production functions (`diagnoseFunnel`, `detectAnomaly`,
`reconcileIntelligence`, `buildRecommendation`, `permitAction`) over deterministic
fixtures — never a hand-built verdict object.

---

## 5. Removed Duplicate Authorities

- **Phase 4:** `services/agent/tools/detectAnomaly.ts` converted from a standalone z-score
  scan into a canonical-aware adapter — cross-references `detected_issues` for the same
  entity/window, suppresses/labels the one safe exact mapping (ctr ↔ `LOW_CTR`).
- **Phase 5:** the two-hero-card competing-authority defect (`#command-center` vs
  `#main-move-card` disagreeing about the same account) closed by wiring
  `suppressedIssueCodes` (a pre-existing, previously-unused mechanism) into
  `getDashboard.ts`'s issue filtering.
- **Phase 6A:** `v2ContextAssembler.ts`'s reimplemented action-count resolution and the two
  divergent carousel detectors unified into single canonical functions.
- **This pass (final audit):** `detectLowCtr.ts`'s deprecated-field read (Finding 1, §12
  fixed list); `GET /recommendations` and `saveRecommendation.ts` both now defer to one
  shared guard (`resolveEntityIntelligenceForGuard`) instead of the guard existing in only
  one of the two places a recommendation reaches a merchant.

---

## 6. Remaining Legacy Adapters

- `services/agent/tools/detectAnomaly.ts` — genuinely independent 30-day z-score scan,
  kept as a supplementary, explicitly-labeled adapter (not merged into canonical anomaly
  detection — it answers a different question).
- `mapMetaCampaignFields()` (`workers/syncAccount.ts`) and `resolveCampaignStatusFromMeta()`
  (`lib/metaEntityStatus.ts`) — parse campaign metadata (status/budget) outside the three
  named mapper functions. The final audit flagged this as "adjacent debt, not a strict
  cordon violation" (they handle metadata, not insight/creative payloads, which is what the
  three mappers own) — noted here, not fixed this pass; a future cordon-hardening pass
  could fold them in.

---

## 7. Shadow/V5 Final Status

**V5 (`engines/intelligence/AdlyticIntelligenceSystem.ts`): `LEGACY_ACTIVE`, not shadow, not
retired.** Confirmed a real, live, preferred context source for `/ai/chat` when a report
exists. Authority-boundary fix (Phase 5): `formatCanonicalGroundingForV5Context()` prepends
an unconditional "this section is correct" block whenever V5 context is used. One known,
documented, unfixed drift remains — V5's own `RISING_COST_PER_RESULT` threshold diverges
from the canonical rule's (self-documented in `AdlyticIntelligenceSystem.ts`'s own "DRIFT
MANIFEST" comment) — accepted per the user's explicit instruction that V5 retirement is a
dedicated future audit, not this engagement's scope.

**Brain (`engine/AdlyticBrain.ts` + `engine/v2/*`): a separate, genuinely independent
system, found by the final audit — not previously fully scoped.** Phase 4 correctly
classified its `ConfidenceEngine`/`VelocityTrackerEngine`/`MarketPressureEngine` as
`NOT_AN_ANOMALY_ENGINE` (operational safety/emergency-pause), but that classification did
not cover Brain's `DecisionEngine`, which independently produces merchant-facing actions
(`SCALE_BUDGET`, `REFRESH_CREATIVE`, `PAUSE_CAMPAIGN`, `EMERGENCY_PAUSE`, …) reconciled only
against the pattern-level rule engine (`ruleGrounding.ts`), never against
`reconcileIntelligence()`/`permitAction()`. Of its action vocabulary, only
`REFRESH_CREATIVE` is creative-specific enough to actually contradict a funnel diagnosis —
this pass added a `permitted`/`permittedReason` annotation to the campaign-inspector's
Brain `timeline`, computed against that same campaign's `campaignIntelligence`. The
dashboard-wide `cmoFeedV2` feed does not yet carry the same annotation (§12).

---

## 8. Dead-Code / Schema Candidates

- **`AiAnomalyState`** (Phase 7) — real migration, zero application-code references.
- **`AiSignal`** (found by the final audit) — same migration batch
  (`ai_agent_v2_foundation`), zero application-code references.

Both classified `DEAD_SCHEMA_CANDIDATE`, neither dropped — no migration this engagement
unless unavoidable, per its standing discipline; schema removal is a dedicated future
cleanup pass.

Dead exported functions found by the final audit (not removed — no lint/dead-code tooling
in this repo to safely verify zero *dynamic* callers, and removing working code without
that certainty is out of scope for a consolidation pass): `runBrainBatch`
(`engine/AdlyticBrain.ts`), `getLiveCampaignIdsForAccount`
(`lib/campaignDataIsolation.ts`), `getSettingTyped` (`services/platformSettings.ts`),
`ensureTokenEncrypted` (`services/tokenEncryption.ts`), `closeRedis` (`lib/redis.ts`), plus
roughly a dozen smaller test-only helpers. Listed for a future cleanup pass, not acted on.

---

## 9. Test Coverage

30 standalone `tsx` test files wired into `npm run test:all`, run twice at every commit
throughout this engagement (623 assertions in the final confirmation run). New suites added
in this engagement's Phases 4–10 and the final audit:

| Suite | Assertions | Covers |
|---|---|---|
| `test_anomaly_authority.ts` | 18 | Phase 4 — canonical-aware AI-tool adapter, tenant isolation |
| `test_diagnosis_decision_ownership.ts` | 14 | Phase 5 — suppressedIssueCodes wiring, permitAction widening, V5 boundary |
| `test_meta_cordon_sync_purge.ts` | 15 | Phase 6 — cordon fixes, behavioral sync-lock proof, purge coverage |
| `test_v5_legacy_disposition.ts` | 6 | Phase 7 — reasoningChainJson leak fix, AiAnomalyState + AiSignal dead-schema |
| `test_dto_purity_containment.ts` | 17 | Phase 8 — CPM/linkClicks/confidence-band/knowledgeBase fixes |
| `test_architecture_doc_truth.ts` | 19 | Phase 9 — doc structure, banners, README correctness |
| `test_brain_acceptance.ts` | 13 | Phase 10 — all 8 adversarial acceptance cases, backward traceability |
| `test_final_audit_remediation.ts` | 15 | Final audit — all 8 confirmed P0/P1 fixes |

Pre-existing suites this engagement re-verified/re-wired: `test_intelligence.ts` (26
assertions, P5 hierarchy — found disconnected from `test:all`, wired in during Phase 5).

---

## 10. Known Limitations

- V5's `RISING_COST_PER_RESULT` threshold drift from canonical (documented, not fixed —
  V5 retirement is future scope).
- `mapMetaCampaignFields()`/`resolveCampaignStatusFromMeta()` sit outside the three named
  cordon mappers (adjacent debt, not a strict violation — see §6).
- `campaign_history_rollups` is not covered by `purgeAccountAnalytics()` — it aggregates
  across a whole workspace's campaigns with no per-account column, so a correct fix means a
  rollup recompute, not a delete; needs product direction this pass can't supply alone.
- `recommendation_logs` rows with `campaignId IS NULL` (account-level log entries) are not
  purged when a specific ad account is deleted from a multi-account workspace — the table
  only stores `workspaceId`, with no way to attribute such a row to one specific account.
- Conversation Outcome Intelligence (`answered → qualified → order → revenue`) — carried
  forward from the pre-existing analytics architecture: capable, not yet built.
- Meta connection/onboarding lifecycle (`metaOAuth.ts`, `MetaConnection` lifecycle, manual
  token-paste flow) — explicitly untouched throughout this entire engagement per the user's
  standing instruction; scoped as a dedicated, separate future audit.

---

## 11. Brain Acceptance Scenarios

All 8 named cases pass, built from the real production chain (not hand-built verdicts) —
see `test_brain_acceptance.ts` for the full fixtures and assertions:

1. **Downstream conversion deterioration** — stable CTR/CPM/linkClicks, messages drop
   90→30 → `POST_CLICK`, `REFRESH_CREATIVE` correctly forbidden. **PASS.**
2. **Creative fatigue** — frequency+75%/CTR-25%/CPC+30% together (all three corroborating)
   with no funnel break → `CREATIVE_FATIGUE` anomaly, `DELIVERY`-classified diagnosis; one
   signal alone confirmed insufficient. **PASS.**
3. **Auction pressure** — every funnel ratio held identical, cost-per-result +40% →
   `EFFICIENCY`, not a stage blame. **PASS.**
4. **Insufficient data** — a 40-impression sample → `INSUFFICIENT_DATA`, no alert, no
   fabricated recommendation. **PASS.**
5. **Conflicting signals** — an 18% ratio drop clears the funnel's 15% materiality floor
   but not the anomaly layer's 22.5% significance floor → diagnosis stands (`POST_CLICK`),
   anomaly correctly declines to alert; the two facets arbitrate, they don't contradict.
   **PASS.**
6. **Traffic KPI clicks=100/linkClicks=37** — `resolveResult('traffic', {...})` resolves 37
   directly; the funnel-level trace built from the same disagreeing counters confirms the
   chain is fed `linkClicks`, never raw `clicks`. **PASS.**
7. **LLM conflict CTR 3.1% vs 2.4%** — the brain trace has no narration field to depend on;
   the real `formatAdlyticContextForPrompt()` keeps the structured `- CTR: 3.1%` line ahead
   of the `## Adlytic brain narration` section carrying the conflicting `2.4%` text.
   **PASS.**
8. **Multi-tenant** — two unrelated campaigns (`POST_CLICK` vs `EFFICIENCY`) traced
   interleaved produce byte-identical repeated results — no shared mutable state.
   Database-level tenant isolation for the AI-tool's own query is separately proven by
   `test_anomaly_authority.ts`. **PASS.**

`ADLYTIC_BRAIN_ACCEPTANCE_TESTS_GREEN = YES` (8/8).

---

## 12. Production Risks Remaining

Ranked by severity, all documented rather than silently accepted:

1. **(P1, real, deferred)** `getDashboard.ts`'s workspace-wide `cmoFeedV2` Brain feed is not
   cross-checked against `reconcileIntelligence()`/`permitAction()` for `REFRESH_CREATIVE` —
   unlike the campaign-inspector's `timeline`, which now is. A merchant could see a
   dashboard-level Brain suggestion to refresh creative for a campaign whose funnel
   diagnosis says the creative is healthy. Deferred because a correct fix means computing
   full per-campaign funnel intelligence for every unique campaign in a 7-day ledger feed,
   inside the already-heavily-optimized hot dashboard-load path — a real performance
   question needing load-testing, not a rushed patch under time pressure.
2. **(P2, documented, low current exposure)** `getDashboard.ts:919-924`'s `priorityAction`
   selection has no `source` filter on the `Recommendation` row it picks — found by the
   final audit's LLM-loop investigation. Currently gated behind `AI_AGENT_V2_ENABLED`
   (off by default) and the displayed *text* is always a canned, actionCode-keyed label
   (never the AI's free text) — but if that flag is ever enabled, an AI-agent-authored
   `actionCode` could reach `/ai/chat`'s "reconciled across the deterministic engines"
   grounding block. Narrower now that `saveRecommendation.ts` itself guards every write via
   `permitAction()` (this pass) — a forbidden action can no longer be *persisted* by the
   agent in the first place, which substantially reduces this path's remaining exposure.
3. **(P2, documented, judged benign)** `syncLifetimeTotals()` and
   `discoverCampaignOnDemand()` run with no advisory lock. Investigated and NOT fixed:
   the former writes only `AdAccount.lifetimeSpendMinor`/`lifetimeSyncedAt`, columns no
   other writer touches; the latter does idempotent current-metadata upserts with no
   stale-snapshot decision logic. Neither is the same defect class as
   `reconcileCampaignStatuses()`'s snapshot-race (which this pass did fix).
4. **(P3, documented)** `campaign_history_rollups` and `recommendation_logs`'
   `campaignId IS NULL` rows are not purged on a single-account deletion within a
   multi-account workspace (§10).
5. **(P3, cordon adjacency)** `mapMetaCampaignFields()`/`resolveCampaignStatusFromMeta()`
   sit outside the three named cordon mappers (§6).

No P0 production risk remains open — every P0-severity finding from the final audit was
fixed in this pass (§ "Removed Duplicate Authorities", the final-audit commit).

---

## 13. Future Enhancements

- Dedicated strangler-sequence audit for V5 (`AdlyticIntelligenceSystem.ts`) retirement:
  redirect reads → prove parity → stop writes → prove no callers → remove code.
- Dedicated audit for Brain (`AdlyticBrain.ts`)'s relationship to the canonical chain —
  this pass added a narrow annotation at one surface; a fuller reconciliation (or a
  deliberate decision to retire/merge/keep-separate-with-full-boundary-labeling) needs its
  own scoped investigation, given Brain's size (11 layers) and the performance question
  raised in §12.
- `campaign_history_rollups` recompute-on-partial-disconnect design (needs product
  direction: does removing one of several accounts in a workspace warrant a rollup
  recompute from the remaining accounts, or is leaving it stale acceptable?).
- Dead-schema cleanup migration for `AiAnomalyState` + `AiSignal`, once independently
  re-confirmed still unreferenced at that time.
- Dead-code removal pass for the ~15 zero-caller exported functions found by the final
  audit (§8), ideally after adding lint/dead-code tooling this repo currently lacks.
- Meta connection/onboarding lifecycle audit (`metaOAuth.ts`, `MetaConnection`,
  manual-token-paste flow) — explicitly deferred throughout this entire engagement per the
  user's standing instruction; the natural next major body of work.
- Cordon-hardening pass folding `mapMetaCampaignFields()`/`resolveCampaignStatusFromMeta()`
  into the three named mapper functions for full architectural consistency.
