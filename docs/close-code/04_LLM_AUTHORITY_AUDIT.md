# 04 — LLM / AI authority closure

```
LLM_CAN_CREATE_CANONICAL_EVIDENCE = NO
LLM_CAN_ALTER_CANONICAL_EVIDENCE  = NO
LLM_CAN_RAISE_CONFIDENCE          = NO
LLM_CAN_OVERRIDE_DIAGNOSIS        = NO
LLM_CAN_OWN_CANONICAL_DECISION    = NO
LLM_CAN_BYPASS_ACTION_AUTHORITY   = NO
V5_BOUNDARY_SAFE                  = YES (LEGACY_ACTIVE, bounded)
LLM_AUTHORITY_GAPS                = 0
```

## Writer census

Canonical artefacts and everything that writes them:

| Artefact | Writers | Any AI path? |
|---|---|---|
| `detected_issues` (Evidence) | `repositories/detectedIssuesRepo.ts` | no |
| `campaign_brain_snapshots.action` | `services/BrainPersistence.ts` | **no** — value comes from `decideCampaignAction()` |
| `campaign_brain_snapshots.narration_json` | narration cron | yes — prose only |
| `recommendations` | `repositories/recommendationsRepo.ts`, `agent/tools/saveRecommendation.ts` | the agent tool, and it is guarded |
| `period_insights` | `workers/syncPeriodInsights.ts` | no |

No module under `services/ai/` or `services/agent/` imports
`reconcileIntelligence` or `diagnoseFunnel`. The engines cannot be driven from
an AI path at all.

## The decision is deterministic

`BrainPersistence` writes `action: result.decision.action`, straight from
`decideCampaignAction(physics, confidence, pattern, recovery)` — a pure
function. `narrationJson` is written on a separate cron path and cleared when
the decision materially changes.

Rendering that action inside a pane headed `authoritative: false` attributed
engine output to the LLM. It now lives under `decision.canonicalDecision` with
`producer` naming DecisionEngine and `deterministic: true`; `llmLayer` carries
narration plus a `narratesDecision` **pointer**. Asserted: `llmLayer` has no
`brainAction*` field, and the page renders the decision in the DECISION
section, not the LLM one.

## The one AI write path is guarded

`saveRecommendation.ts` resolves the entity's canonical intelligence and calls
`permitAction(args.actionCode, entityIntelligence)` before persisting, so an
AI-authored recommendation faces the same veto as any other producer. Its
ungoverned codes are catalogued in doc 03.

## V5

`aiContextBuilderV5.ts` is `LEGACY_ACTIVE`. It consumes canonical output and
labels it AUTHORITATIVE in the prompt; it produces no canonical artefact and
holds no write path. Bounded, and covered by `test_v5_legacy_disposition`.
