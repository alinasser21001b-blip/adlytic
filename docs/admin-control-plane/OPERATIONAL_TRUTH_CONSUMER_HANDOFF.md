# Operational Truth — backend contract for the Admin presentation layer

**Audience:** whoever owns the Admin Control Plane UI.
**Status:** backend shipped. No presentation file was touched by this change.
**Rule this encodes:** the Admin renders. It does not diagnose. Every state
below is machine-readable, so nothing needs to string-match an Arabic sentence.

---

## 1. Why the contract changed

One scalar (`OpsStatus`) was answering six unrelated questions. That produced
these on a real console, none of which were true:

| Shown | Actually |
|---|---|
| `Redis — not tested` | Redis is deliberately absent; nothing needs it |
| `Queue — disabled / failed` | background work runs in-process and succeeds |
| `Meta readiness 0 / 500` | telemetry was unreadable; nothing was measured |
| `AI — not tested` | the deterministic Brain is fine; only narration is unconfigured |
| `Workspace — not selected` | a viewer choice, folded into subsystem health |
| a 48-hour-old success | rendered as current health, with no timestamp |

The fix is dimensional, not more enum values.

---

## 2. Endpoints

| Endpoint | Change | Cache |
|---|---|---|
| `GET /api/admin/ops` | **adds** `assessments[]` | `no-store` |
| `GET /api/admin/meta-usage` | **adds** `readiness{}` | `no-store` |
| `GET /api/admin/graph/runtime` | overlay states **add** canonical fields | `no-store` |

All three are `requirePlatformAdmin`-gated and now send
`Cache-Control: no-store, no-cache, must-revalidate, private`. Caching is not
disabled anywhere else.

`GET /api/health` is deliberately unchanged and stays boring — process, config,
DB. A Meta outage or an LLM outage must never make Railway restart a healthy app.

---

## 3. The canonical object

`assessments[]` on `/api/admin/ops`. One entry per subsystem.

```jsonc
{
  "key": "queue",
  "health": "HEALTHY",              // HEALTHY DEGRADED FAILED BLOCKED UNKNOWN
  "reasonCode": "QUEUE_IN_PROCESS_FALLBACK",
  "summary": "ينفّذ داخل العملية — BullMQ معطّل بالإعداد ولا حاجة له في هذا النمط",
  "detail": null,                   // LTR technical line, sanitized
  "configuration": "NOT_CONFIGURED",// CONFIGURED NOT_CONFIGURED NOT_APPLICABLE
  "requiredness": "NOT_REQUIRED",   // REQUIRED OPTIONAL NOT_REQUIRED
  "measurement": "OBSERVED",        // OBSERVED NOT_TESTED NOT_MEASURABLE UNKNOWN
  "context": "NOT_APPLICABLE",      // SELECTED NOT_SELECTED NOT_APPLICABLE
  "mode": "IN_PROCESS",             // subsystem-specific, optional
  "observedAt": null,               // ISO string, or null ⇔ never observed
  "freshness": "UNKNOWN",           // CURRENT STALE UNKNOWN
  "severity": "NONE",               // NONE INFO WARNING ERROR  ← colour from THIS
  "actionability": "NONE",          // NONE INFO WAIT OPERATOR_ACTION USER_CONTEXT
  "source": "adminOpsHealth:config.features.bullmqEnabled",
  "evidence": "enqueueOrFallback runs the original in-process body…"
}
```

### Rendering rules

1. **Colour from `severity`.** Never from `health` alone — a `HEALTHY`
   subsystem that is `NOT_CONFIGURED`/`NOT_REQUIRED` is `severity: NONE` and
   must be visually quiet.
2. **Never parse `summary`.** It is human copy and will be reworded.
3. **`observedAt: null` means never observed.** Do not render "just now".
4. **`freshness: STALE`** — show the age, keep the value; stale evidence is
   still evidence.
5. **`context: NOT_SELECTED`** is a viewer prompt, not a fault. Pair with
   `actionability: USER_CONTEXT`.

---

## 4. Reason codes

Stable, `SCREAMING_SNAKE`, unique. Full list in
`src/services/operationalTruth.ts` (`OPS_REASON_CODES`).

| Code | Means | Suggested treatment |
|---|---|---|
| `REDIS_ABSENT_BY_DESIGN` | optional, nothing needs it | quiet / neutral |
| `QUEUE_IN_PROCESS_FALLBACK` | background work runs in-process | quiet, show mode |
| `QUEUE_BULLMQ_ACTIVE` | BullMQ is the executor | quiet, show mode |
| `QUEUE_BULLMQ_ENABLED_BUT_BROKER_DOWN` | asked for BullMQ, broker gone; still running | warning |
| `BACKGROUND_NOT_REQUIRED_FOR_ROLE` | `SERVICE_ROLE=api` reader | quiet |
| `BACKGROUND_RECENT_SUCCESS` | a sync succeeded within 48h | ok |
| `META_NO_TOKEN` | no stored token | operator: reconnect |
| `META_TOKEN_EXPIRED` | token past expiry | operator: reconnect |
| `META_ACCOUNT_DISABLED_BY_META` | Meta's own `account_status` ≠ 1, and `accountDeliveryHold()` says the account is halted (DISABLED, UNSETTLED, PENDING_*, CLOSED, or an unrecognised code) | operator: Meta-side |
| `META_ACCOUNT_GRACE_PERIOD` | `account_status` = `IN_GRACE_PERIOD` — still delivering, will stop unless the balance is paid; `accountDeliveryHold()` reports `halted: false` | operator: eventually, not urgently |
| `META_ACCOUNT_INACTIVE_LOCALLY` | our record is not ACTIVE | operator: platform-side |
| `META_NO_ACCOUNT_CONNECTED` | nothing linked yet | context, not a fault |
| `BRAIN_DETERMINISTIC_OK` | canonical chain needs no provider | ok |
| `LLM_NOT_CONFIGURED` | narration only; Brain unaffected | quiet |
| `TELEMETRY_UNAVAILABLE` | cannot measure — render no number | info |
| `CONTEXT_NOT_SELECTED` | viewer must choose | prompt |

**Per-account codes.** `workspaces[].connectionReason` carries the same
vocabulary per row. `"1 of 1 blocked"` is now decomposable: the aggregate
`assessments[key=meta].reasonCode` is the *dominant* cause, and `evidence`
carries the breakdown (`META_TOKEN_EXPIRED×2, META_NO_TOKEN×1`).

**`workspaces[].metaDisableReason`** is Meta's raw `disable_reason` integer
(not a label — no canonical mapping exists for it yet, unlike `account_status`
via `accountDeliveryHold()`), present only when the account is DISABLED. When
set, it is appended to the row's `headline` as `"... (سبب Meta: N)"`. Do not
invent a label table from memory; verify against Meta's live Marketing API
docs first, the same rule `metaReadiness.ts`'s policy comment already follows
for its own thresholds.

---

## 5. Meta readiness — `GET /api/admin/meta-usage` → `readiness`

```jsonc
{
  "state": "COLLECTING",            // READY NOT_READY COLLECTING NOT_MEASURABLE
  "reasonCode": "WINDOW_NOT_FULLY_COVERED",
  "policy": {
    "accessTierName": "Marketing API Access Tier",
    "callThreshold": 500, "callWindowDays": 15,
    "errorRateGatePct": 15, "errorWindowCalls": 500,
    "policySource": "SECONDARY_CORROBORATED",
    "policyVerifiedAt": "2026-08-23",
    "policyNote": "Meta primary docs unreachable from the build environment…"
  },
  "telemetry": {
    "measurement": "PARTIAL",       // MEASURED PARTIAL UNAVAILABLE
    "measurementStartedAt": "2026-08-23T…",
    "coveredDays": 1, "windowDays": 15,
    "successfulCalls": 37,          // number | null  ← null means NOT MEASURED
    "errorCalls": 0,
    "recentWindowSize": 37,
    "errorRatePct": 0,
    "errorsByCategory": { "token": 0, "rate_limit": 0, … },
    "latestHeaders": { "observedAt": "…", "appUsage": {…} }
  },
  "meetsCallThreshold": false,      // boolean | null
  "meetsErrorGate": null            // null ⇔ no sample yet
}
```

**The one rule that matters:** `null` means *not measured*. It is never zero.
If `state` is `NOT_MEASURABLE`, render "cannot be measured" and **no numbers** —
do not substitute `0`, and do not render `0 / 500`.

`0` remains legitimate and must be shown when `measurement` is `MEASURED`: an
observed zero is a real result.

`COLLECTING` is not a failure. Show coverage (`coveredDays / windowDays`) and
say history before `measurementStartedAt` is unknown — it is never backfilled.

Also display `policySource`. It currently says the thresholds were corroborated
against secondary sources, **not** read from Meta's own docs (both Meta domains
are unreachable from the build environment). Presenting them as official policy
would be a lie the UI would be telling on the backend's behalf.

---

## 6. Graph runtime overlay

`RuntimeNodeState` now also carries `reasonCode`, `mode`, `observedAt`,
`freshness`, `requiredness` — forwarded from the same assessments, never
recomputed. The graph and the console therefore cannot disagree.

Edges gained an optional `requiredness: REQUIRED | OPTIONAL` and a new kind
`FALLS_BACK_TO`. Schema is **1.1.0** (additive; a 1.0.0 snapshot still validates).

For blast radius: traverse `REQUIRED` edges only. An `OPTIONAL` edge means the
dependant keeps working without the target — which is why a dead Redis must not
grey out background work.

---

## 7. Legacy compatibility

`subsystems[]` is unchanged in shape and still populated. It is now **derived**
from `assessments[]` through the single projection
`toLegacyOpsStatus()` — there is exactly one mapping in the codebase.

The projection deliberately maps an intentionally-absent optional dependency to
`HEALTHY`, not `NOT_TESTED`. **So some badges will change colour without any UI
change, and that is the fix, not a regression.**

Nothing is deprecated yet. Migrate panel by panel; delete nothing until the
Admin reads `assessments[]` everywhere.

### Known cosmetic follow-up (UI-owned)

`src/web/pages/metaReadinessPage.ts` renders legacy usage counters directly and
does not branch on the new `measurement` state. It is the previous-generation
page (`adminOpsHealth` now links to `/admin/meta#quota` instead), so it was
left alone rather than edited across the presentation freeze. When it is
retired or migrated, read `readiness` instead of the legacy `counts`.

---

## 8. What the backend will not do

- Fire a paid LLM request on an Admin page load. `llm_narration` reports
  configuration, not a live probe.
- Return a token, JWT, secret, `Authorization` header, credential-bearing DB
  URL, or a raw Meta error body. `lastSyncError` is passed through
  `scrubString` before it leaves the process.
- Write anything from a read path. Telemetry retention runs in the daily
  maintenance job, never on a console refresh.
