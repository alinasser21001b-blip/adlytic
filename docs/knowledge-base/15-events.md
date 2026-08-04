# 15 — Events

## Shipped product (`dawai-platform`) — durable-row events, no broker

There is no message bus/broker in `dawai-platform`. "Events" are represented as durable database rows written synchronously in the same transaction as the triggering action, then consumed asynchronously:

- **`notifications`** — the durable, user-facing event record (`event_type`, `title`, `body`, `resource_type`/`resource_id`).
- **`notification_outbox`** — the delivery-channel projection: `channel ∈ {IN_APP, WEB_PUSH, APNS, FCM, SMS}`, `status ∈ {PENDING, DELIVERED, FAILED}`, retried with backoff (`attempts`, `next_attempt_at`). Payload is deliberately minimal — `{eventType, resourceId}` — never PHI, medicine names, or coordinates (`server/services/notifications.ts`). Consumed by adapters that don't yet exist for APNs/FCM/SMS (they'd read `PENDING` rows and mark `DELIVERED`/`FAILED`; today `WEB_PUSH`... unclear if wired — see `17-known-limitations.md`); an unconfigured provider must leave rows `PENDING`, never fake `DELIVERED`.
- **`notification_delivery_logs`** — per-attempt audit of outbox delivery attempts.
- **`attention_events`** — the clinical/product "needs attention" feed, a separate channel from `notifications`, consumed by the client-side Pill Bar rather than a push channel.
- **`audit_events`** — the audit/compliance event log; every mutating action writes one via `writeAudit()` regardless of outcome (`SUCCESS`/`DENIED`/`FAILED`).

Known event types observed via `event_type`/`resource_type` usage in the routes/services (not an exhaustive enumerated list — no central event-type registry file was found; this is a gap, see `18-technical-debt.md`): request dispatched, offer received, reservation acknowledged/ready/completed/failed/no-show/expired, verification approved/rejected, attention SEV_ALERT/ACTION_REQUIRED/etc. raised.

**Lifecycle-driven "events"**: `worker.ts`'s 30-second sweep (`services/lifecycle.ts::runLifecycleSweep`) is the mechanism that turns time-based conditions (hold expired, ack deadline passed, request window elapsed) into actual state transitions and notification rows — it is effectively the platform's only scheduler/event-timer, there is no separate cron or delayed-job system.

## Blueprint v3 event architecture (`docs/technical/04-event-architecture.html`) — spec only, not implemented as running infrastructure

54 named events, each with a declared producer, at least one consumer (an event with no consumer fails the v3 validator — "a log line pretending to be an event"), payload shape, side effects, whether it's audited, retry semantics, and an idempotency key. Explicit universal rule: **every event is at-least-once unless marked otherwise, so every consumer must be idempotent on its stated key** — *"Iraqi mobile networks make redelivery the normal case, not the edge case — a duplicate dispense record or a duplicate reservation would be a clinical defect, not an inconvenience."* This framing rationale is worth carrying into `dawai-platform` work even though the event catalogue itself is unimplemented there: it's exactly why `dose_events`/`stock_movements` dedupe by `client_event_id` (see `10-clinical-safety.md`).

Representative events (full 54-event catalogue is in the source doc, not reproduced here): `account.created`, `account.deletion.scheduled`, `account.deleted`, `subject.created`, `subject.claimed`, `subject.memorialised`(+`.reversed`), `guardianship.transferred`, `grant.invited`/`.requested`/`.activated`/`.revoked`/`.expired`, `catalogue.item.published`/`.withdrawn`, `search.unmatched` (not audited, best-effort retry — the sole intentionally-lossy event in the catalogue), `request.created`/`.broadcast`/`.unanswered`/... The notifier (`notification-service`) is reached **only by event, never by direct call**, specifically to prevent a dependency cycle with the core services — enforced by the v3 architecture validator.

## Reconciliation

`dawai-platform` implements the *behavior* the v3 event catalogue prescribes (idempotent consumers, minimal outbox payloads, audited writes, never-fake-delivered) without implementing the *catalogue itself* (no named/typed/broker-routed event objects — everything is a row write). If/when `platform/`'s services are ever deployed for real, they would need an actual message transport (not specified in any doc reviewed) to realize the "producer → event → consumer" model — this is itself an open architecture question, see `19-open-decisions.md`.
