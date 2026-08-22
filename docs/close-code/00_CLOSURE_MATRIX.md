# 00 — Closure matrix

Status of every item in the remediation program, against current repository
truth. `CLOSED_PROVEN` requires a test that fails when the defect is
reintroduced; observability alone never earns it.

Legend: `CLOSED_PROVEN` · `LIVE_VALIDATED` · `PARTIAL` · `OBSERVABILITY_ONLY_FIX`
· `OPEN_CLOSE_BLOCKER` · `OPEN_NON_BLOCKING_DEBT` · `NOT_TESTED` · `NOT_APPLICABLE`

| # | Requirement | Owner | Test | Status | Behav. | Observ. |
|---|---|---|---|---|---|---|
| 1 | Meta ingestion cordon | `mappers/insightMapper.ts` | `test_meta_cordon_sync_purge` | CLOSED_PROVEN | YES | YES |
| 2 | Insight mapping | `mappers/insightMapper.ts` | `test_logic`, `test_worker` | CLOSED_PROVEN | YES | YES |
| 3 | Creative mapping | `workers/syncAccount.ts` | `test_worker` | CLOSED_PROVEN | YES | YES |
| 4 | Result semantics | `analytics/resultSemantics.ts` | `test_result_semantics_*` | CLOSED_PROVEN | YES | YES |
| 5 | Campaign purpose | `lib/campaignPurpose.ts` | `test_campaign_purpose` | CLOSED_PROVEN | YES | YES |
| 6 | KPI family resolution | `lib/objectiveKpis.ts` | `test_objective_kpi*` | CLOSED_PROVEN | YES | YES |
| 7 | Evidence contract | `analytics/evidence.ts` | `test_evidence_contract` | CLOSED_PROVEN | YES | YES |
| 8 | Evidence authority boundary | `analytics/evidence.ts` | `test_evidence_authority_boundary` | CLOSED_PROVEN | YES | YES |
| 9 | Anomaly ownership | `analytics/intelligence/anomaly.ts` | `test_anomaly_authority` | CLOSED_PROVEN | YES | YES |
| 10 | Funnel diagnosis | `analytics/funnel/diagnose.ts` | `test_analytics`, `test_golden_archetypes` | CLOSED_PROVEN | YES | YES |
| 11 | Hierarchy reconciliation | `analytics/intelligence/hierarchy.ts` | `test_intelligence` | CLOSED_PROVEN | YES | YES |
| 12 | Confidence taxonomy | `analytics/confidence.ts` | `test_brain_observatory` §D1 | CLOSED_PROVEN | YES | YES |
| 13 | **Data validity** | `services/entityIntelligence.ts` | `test_brain_observatory` | **CLOSED_PROVEN** | YES | YES |
| 14 | **Period metric semantics** | `services/periodInsights.ts` | `test_period_metric_semantics` | **CLOSED_PROVEN** | YES | YES |
| 15 | **Funnel reach estimator** | `analytics/funnel/compute.ts` | `test_period_metric_semantics` §4b | **CLOSED_PROVEN** | YES | YES |
| 16 | DecisionEngine ownership | `engine/DecisionEngine.ts` | `test_diagnosis_decision_ownership` | CLOSED_PROVEN | YES | YES |
| 17 | Recommendation ownership | `analytics/intelligence/recommend.ts` | `test_recommendation_ownership` | CLOSED_PROVEN | YES | YES |
| 18 | permitAction authority boundary | `hierarchy.ts::PERMIT_ACTION_DOMAIN` | `test_brain_observatory` §10 | CLOSED_PROVEN | YES | YES |
| 19 | Action code domains | `hierarchy.ts`, `DecisionEngine.ts` | `test_brain_observatory` §10 | CLOSED_PROVEN | YES | YES |
| 20 | `getDashboard` authority filtering | `services/getDashboard.ts` | `test_cmofeed_authority_guard` | CLOSED_PROVEN | YES | YES |
| 21 | CMO Feed authority semantics | `applyCmoFeedAuthorityGuard` | `test_cmofeed_authority_guard` | CLOSED_PROVEN | YES | YES |
| 22 | LLM narration boundary | `services/BrainPersistence.ts` | `test_brain_observatory` §10 | CLOSED_PROVEN | YES | YES |
| 23 | V5 / legacy-active | `services/aiContextBuilderV5.ts` | `test_v5_legacy_disposition` | PARTIAL (bounded) | YES | YES |
| 24 | DailyStat persistence ownership | `repositories/dailyStatsRepo.ts` | `test_meta_cordon_sync_purge` | CLOSED_PROVEN | YES | YES |
| 25 | Sync ownership | `workers/syncAccount.ts` | `test_worker` | CLOSED_PROVEN | YES | YES |
| 26 | Advisory locking | `lib/advisoryLock.ts` | `test_orchestrator` | CLOSED_PROVEN | YES | YES |
| 27 | Idempotent upsert | `dailyStatsRepo`, `periodInsights` | `test_period_insight_rollout` | CLOSED_PROVEN | YES | YES |
| 28 | Account purge ownership | `services/accountDataPurge.ts` | `test_meta_cordon_sync_purge` | CLOSED_PROVEN | YES | YES |
| 29 | Capability probe | `services/metaCapabilityProbe.ts` | `test_probe_discovery` | CLOSED_PROVEN | YES | YES |
| 30 | **Token transport security** | `services/metaClient.ts` | `test_security_invariants` | **CLOSED_PROVEN** | YES | YES |
| 31 | Change-radar persistence | `services/refresh/refreshEngine.ts` | `test_refresh_engine` | CLOSED_PROVEN | YES | YES |
| 32 | Dependency drift | `intelligence/metaDependencyGraph.ts` | `test_dependency_drift` | CLOSED_PROVEN | YES | YES |
| 33 | Release / CI gates | `.github/workflows` | `test_deploy_gate` | CLOSED_PROVEN | YES | YES |
| 34 | Brain Observatory | `services/brainObservatory.ts` | `test_brain_observatory` (48) | CLOSED_PROVEN | YES | YES |
| 35 | Temporal truth | `brainObservatory.ts::temporal` | `test_brain_observatory` §8–9 | CLOSED_PROVEN | YES | YES |
| 36 | Build identity | `lib/buildIdentity.ts` | `test_deploy_gate` | CLOSED_PROVEN | YES | YES |
| 37 | Validation deployment config | `railway.validation.json` | `test_validation_deployment_safety` | CLOSED_PROVEN | YES | YES |
| 38 | **PeriodInsight rollout safety** | `services/periodInsights.ts` | `test_period_insight_rollout` | **CLOSED_PROVEN** | YES | YES |
| 39 | **Admin information architecture** | `web/pages/adminSurfaceNav.ts` | `test_admin_os` §1 | **CLOSED_PROVEN** | YES | YES |
| 40 | **Admin status vocabulary** | `web/pages/adminStatus.ts` | `test_admin_os` §2 | **CLOSED_PROVEN** | YES | YES |
| 41 | **Admin authorization** | `api/adminGuard.ts` | `test_admin_os` §3 | **CLOSED_PROVEN** | YES | YES |
| 42 | Admin UI containment | admin pages | `test_admin_os` §4 | CLOSED_PROVEN | YES | YES |
| 43 | Admin console page merge | `adminConsolePage` / `adminOsPage` | — | OPEN_NON_BLOCKING_DEBT | n/a | YES |
| 44 | Security & Audit admin section | — | `test_admin_os` §1 | OPEN_NON_BLOCKING_DEBT | n/a | YES |
| 45 | `recommend.ts` ungoverned actions | `recommend.ts::templateFor` | matrix, doc 03 | OPEN_NON_BLOCKING_DEBT | n/a | YES |
| 46 | **Live validation** | Railway | — | **OPEN_CLOSE_BLOCKER** | NO | NO |

**Close blockers: 1** (item 46). Everything else is closed or classified as
non-blocking debt with a named reopening trigger in doc 13.
