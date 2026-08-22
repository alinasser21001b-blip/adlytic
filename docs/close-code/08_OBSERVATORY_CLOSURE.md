# 08 — Brain Observatory final closure

```
OBSERVATORY_READ_ONLY            = YES
OBSERVATORY_REDERIVES_INTELLIGENCE = NO
```

48 assertions in `test_brain_observatory.ts`.

## Read-only, structurally

- **Generic write traps.** The fake Prisma is a proxy: *any* model, *any* write
  method, plus `$executeRaw`, `$executeRawUnsafe`, `$queryRaw`,
  `$queryRawUnsafe` and `$transaction`. A companion test fires
  `recommendation`, `syncJob`, `adAccount` and raw-SQL writes to prove the trap
  is real rather than vacuous.
- **Module graph walked at runtime**, asserting the assembler reaches no
  `bullmq`, `ioredis`, queue, `metaClient`, `syncAccount`, `backgroundScheduler`
  or orchestrator module — so a transitive import three levels down is caught.
  This is why the period-fact read is a **database** read: the sync owns the
  Meta call.
- **No network call, no enqueue, no threshold, no metric arithmetic** in the
  assembler; no ratio arithmetic, no family decision, no write request in the
  page. The arithmetic guard is negative-tested.

## What it exposes

**Object identity** — internal entity type/id, Meta entity type/id, parent
account, parent campaign, insights query level, DailyStat ownership level.

**Temporal truth** — requested span, current/prior windows, the actual stored
dates (not a count), dates without rows, row count, coverage basis, temporal
coverage, `lastSyncedAt`, sync age, freshness inputs, settlement, and the
legacy data status labelled non-authoritative.

**Meta truth** — fact kind, metric identity, current/prior values, canonical
source, observed vs derived vs `NOT_MEASURED`.

**Semantics** — raw Meta objective, resolved family, primary KPI, result unit,
classification confidence.

**Intelligence** — funnel, anomaly, evidence, diagnosis, counter-evidence,
canonical decision, canonical recommendation, authority relation, action audit
over exactly `PERMIT_ACTION_DOMAIN`, and the outside-veto-domain surface.

**LLM** — narration only, `authoritative: false`, a `narratesDecision` pointer,
and an ownership note naming DecisionEngine. No `brainAction*` field.

**Trace** — all six `LAYER_ORDER` layers, each with status, conclusion,
`canonicalSource`, `inputSource` and an absence reason when not reached.

## Integration

The Observatory is now reachable from every admin surface under INTELLIGENCE
in the shared information architecture. Before this closure it was mounted,
gated and tested — but listed in none of the three navigation maps, so it could
only be reached by typing its URL.
