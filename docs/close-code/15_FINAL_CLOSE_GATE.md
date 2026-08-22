# 15 — Final close gate

```
ARCHITECTURAL_AUTHORITY_MAP_COMPLETE = YES
DATA_VALIDITY_OVERCLAIM              = 0
PERIOD_METRIC_SEMANTICS_AUDITED      = YES
UNEXPLAINED_DECISION_AUTHORITY_GAPS  = 0
LLM_CAN_OVERRIDE_CANONICAL_DECISION  = NO
LLM_CAN_CREATE_CANONICAL_EVIDENCE    = NO
META_CORDON_BYPASSES                 = 0
DUPLICATE_INTELLIGENCE_AUTHORITIES   = 0
DUPLICATE_CRITICAL_PERSISTENCE_OWNERS = 0
CURRENT_HEAD_CONTAINS_NO_LIVE_SECRET = YES
TOKEN_IN_URL_PATHS                   = 0
VALIDATION_MIGRATION_RISK            = CLOSED
DEPLOYMENT_BUILD_IDENTITY            = PROVEN (in code; see blocker for live)
ADMIN_INFORMATION_ARCHITECTURE_COMPLETE = YES
ADMIN_DUPLICATE_TRUTH_SURFACES       = 0
ADMIN_AUTHORIZATION_GAPS             = 0
ADMIN_DESTRUCTIVE_ACTION_SAFETY      = PASS
OBSERVATORY_READ_ONLY                = YES
OBSERVATORY_REDERIVES_INTELLIGENCE   = NO
TYPECHECK                            = PASS
TARGETED_TESTS                       = PASS
TEST_ALL_RUN_1                       = PASS
TEST_ALL_RUN_2                       = PASS
TEST_ALL_IDENTICAL                   = YES
CI                                   = configured (.github/workflows)

FINAL_VALIDATION_SERVICE_HEALTHY        = UNKNOWN   ← blocker
FINAL_VALIDATION_SERVICE_BUILD_IDENTITY = UNKNOWN   ← blocker

OPEN_CLOSE_BLOCKERS = 1
```

## The blocker

`FINAL_VALIDATION_SERVICE_HEALTHY` and `..._BUILD_IDENTITY` require a Railway
deploy of the final candidate and a `/api/health` read. Railway is unreachable
from the build environment: `backboard.railway.app:443` returns a 403 CONNECT
policy denial, there is no CLI and no credentials, and the service URL is
blocked by the same policy.

These two values cannot be produced here, and no amount of further repository
work changes that. `CLOSE_CODE_STATUS = NOT_CLOSED`, with that single blocker
named rather than a closure claim resting on unverified work.

## What live validation must confirm

1. `/api/health`: `status=ok`, `db=ok`, `role=api`, `runsBackgroundSync=false`,
   `bullmq=disabled`, `build.resolved=true`, `build.shortCommit` = the final
   candidate, `build.branch=claude/brain-admin-v2-integration`.
2. Admin console loads; admin auth works; the Observatory is reachable **from
   the navigation**, not just by URL.
3. Deterministic decision ownership is correct; Action Authority equals the
   real jurisdiction; the LLM pane holds narration only.
4. Temporal UNKNOWN semantics stay honest.

## And the part a validation deploy cannot answer

**Reach and frequency will read UNKNOWN, and that is correct.** The validation
service is `SERVICE_ROLE=api` with no migration and no background sync — it is
structurally a reader. Period truth needs the migration applied **and a worker
pass**. See the rollout plan in doc 07. Do not read UNKNOWN there as a defect.
