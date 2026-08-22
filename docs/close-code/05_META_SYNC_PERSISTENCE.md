# 05 — Meta ingestion, sync and persistence closure

```
META_CORDON_GAPS          = 0
PERSISTENCE_OWNERSHIP_GAPS = 0
SYNC_OWNERSHIP_SAFE       = YES
PURGE_OWNERSHIP_SAFE      = YES
```

## Cordon

Raw Meta interpretation stops at `mappers/insightMapper.ts`. Nothing
downstream reparses `actions[]` — enforced by `test_meta_cordon_sync_purge`.
Overlapping Meta action representations are resolved once, in the mapper,
so they cannot be double-counted downstream.

Metric identity is preserved end to end: `ctr` is Meta's clicks(ALL) ÷
impressions and is labelled "CTR — all clicks"; link CTR is derived in the
canonical window context and labelled derived. Entity ids cannot be confused —
the Observatory states internal type/id, Meta type/id, insights query level and
DailyStat ownership level explicitly.

## Persistence ownership

| Model | Writer | Reader | Canonical owner | Duplicate writer | Idempotency key | Purge owner |
|---|---|---|---|---|---|---|
| `DailyStat` | `workers/syncAccount.ts` → `repositories/dailyStatsRepo.ts` | analytics, dashboard | `dailyStatsRepo` | none (`mockMeta` is dev-only) | `(entityType, entityId, date)` | `accountDataPurge` |
| `PeriodInsight` | `workers/syncPeriodInsights.ts` → `services/periodInsights.ts` | `buildEntityFunnel` | `periodInsights` | none | `(entityType, entityId, since, until)` | bounded prune + `accountDataPurge` |
| `DetectedIssue` | `repositories/detectedIssuesRepo.ts` | diagnose, Observatory | `detectedIssuesRepo` | none | `(entityType, entityId, date, issueCode)` | `accountDataPurge` |
| `CampaignBrainSnapshot` | `services/BrainPersistence.ts` | Brain, Observatory | `BrainPersistence` | none | `(campaignId, tickDate)` | `accountDataPurge` |
| `Recommendation` | `repositories/recommendationsRepo.ts`, `agent/tools/saveRecommendation.ts` | dashboard | `recommendationsRepo` | the agent tool, ownership-split by source | `(entityType, entityId, date, actionCode)` | `accountDataPurge` |

The recommendation split is deliberate and tested: the AI agent may not
overwrite a recommendation it did not author (`test_recommendation_ownership`).

## Locking

`lib/advisoryLock.ts` is the single implementation. Held by
`backgroundScheduler`, `queue/reconcileCampaignsProcessor`, `metaWebhook` and
`orchestrator/engine`, so scheduler, manual and BullMQ paths serialise on the
same key. Same account serialises; different accounts proceed independently.

## Idempotency

Every write above is an upsert on a natural key, so a re-sync converges rather
than duplicating. `PeriodInsight` adds bounded retention: the analysis window
advances daily and yesterday's keys become permanently unreachable (the reader
matches spans exactly), so rows whose span ends before the sync's re-request
horizon are pruned.

## Failure honesty

A failed period fetch leaves no row and the reader reports UNKNOWN. A failed
campaign sync is logged and non-fatal, and does not mark the account synced.
Nothing writes a misleading success.

## Purge

`services/accountDataPurge.ts` is the single owner; `metaDataDeletion.ts`
handles Meta's own deletion callback and funnels into it.
