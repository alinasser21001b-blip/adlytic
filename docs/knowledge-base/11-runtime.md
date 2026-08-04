# 11 — Runtime

## Startup sequence (`dawai-platform`)

1. `server/index.ts` — entry point for the API process. Creates the DB connection (`db/client.ts::createDatabase`, PostgreSQL in production, PGlite in dev/test), optionally runs migrations (`{migrate: true/false}` flag; production separates migration into its own job — `compose.yaml`), calls `bootstrapAdmin()` if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set (idempotent — no-op if the account already exists), then builds and serves the Hono app via `@hono/node-server` (`server/app.ts::createApp`).
2. `server/app.ts::createApp(database)` wires: request-id middleware → `secureHeaders` (strict CSP: `default-src 'self'`, no inline scripts, `frame-ancestors: none`) → CORS restricted to `config.webOrigin` with credentials → mounts each route module under `/api/v1/*` → a top-level error handler translating `ApiError`/`ZodError` to consistent JSON responses (`errors.ts`).
3. `worker.ts` — a **separate process** (`npm run start:worker`), no HTTP server. Runs `runLifecycleSweep(database)` immediately, then on a 30-second `setInterval`. Handles `SIGTERM`/`SIGINT` for graceful shutdown (clears the interval, closes the DB, exits). This is where reservation/offer/request expirations and notification retries actually get flipped — nothing in the request path itself expires anything by side effect; expiry is a scheduled sweep.

## Composition / DI

There is no formal DI container. `Database` (the PGlite/Postgres client wrapper) is constructed once at startup and threaded through Hono's context (`context.set("db", database)`, typed via `AppVariables` in `types.ts`), so every route/service accesses it via `context.get("db")` or receives it as a parameter — a pragmatic, explicit-parameter-passing style rather than a magic-DI-container style. Config (`config.ts`) is a single module-level object read once from `process.env` at import time (fail-closed for required production vars).

## Caching

No dedicated caching layer/CDN found in the reviewed code. `Cache-Control: no-store` is explicitly set on the file-decryption response (never cache sensitive content) — beyond that, request-response is direct-to-Postgres/PGlite per call. Availability signals (`availability_signals`) function as a cache-like read model but are a real table with explicit `expires_at`, not an application cache.

## Offline & sync

**Shipped product**: `README.md` (Arabic) states the local dev/test story clearly, but production offline support is limited — `docs/dawai/FINAL_MVP_READINESS.md` lists **"True offline mutation queue"** as a documented, non-blocking gap: *"SW caches shell; does not invent progress"* — i.e. a service worker caches the app shell for offline load, but there is no client-side mutation queue that replays writes once connectivity returns. The two places where offline-safe replay genuinely exists are server-side idempotency mechanisms designed to *tolerate* a future offline queue once built: `dose_events` and `stock_movements` both accept a `client_event_id` and are deduplicated via partial unique indexes, so a client-side queue can be added later without a server change (see `10-clinical-safety.md` §3, §5).

**Blueprint v3 / `platform/packages/offline`**: designs a real client-side outbox (`D27`: queue writes offline, replay exactly once; a queued action must never be presented to the user as "sent" until it actually sends — this exact wording appears as a forbidden behavior for both the Patient App and Pharmacy App in `docs/technical/01-system-architecture.html`). `@dawai/offline`'s `index.ts` is the package implementing this queue abstraction, consumed (in principle) by `platform/apps/patient`. Not wired to `dawai-platform`.

## Storage

- `server/storage/encrypted-files.ts` — encryption/decryption pipeline (see `10-clinical-safety.md` §8 for the exact steps).
- `server/storage/object-store.ts` — pluggable backend: local filesystem under `STORAGE_PATH` for single-node deployments, or an S3-compatible SigV4 adapter for multi-node (credentials/bucket are external, adapter is ready per `FINAL_MVP_READINESS.md`).

## Background jobs

Only one background process exists: the lifecycle worker (`worker.ts`, above). It is intentionally **idempotent and safe to run as multiple instances** in a multi-node deployment — `ARCHITECTURE.md` lists "one or more idempotent lifecycle workers" as a supported production topology, though the outbox claim mechanism is noted as "optimistic claim; fine for single worker" with `SKIP LOCKED`-style multi-node claiming marked **PARTIAL** in `FINAL_MVP_READINESS.md` — i.e. running >1 worker today risks duplicate-claim races on outbox rows; this needs attention before horizontally scaling the worker (see `18-technical-debt.md`).

## Event flow (server-internal)

There is no message broker / event bus in `dawai-platform` — "events" are represented as durable rows (`notifications`, `notification_outbox`, `attention_events`, `audit_events`) written synchronously inside the same request/transaction that causes them, then consumed asynchronously by the worker sweep or by client polling/websocket-less refresh. This is a deliberate simplicity choice for a modular monolith at pilot scale. Contrast with Blueprint v3's formal 54-event catalogue with declared producers/consumers/retry semantics (`docs/technical/04-event-architecture.html`) — see `15-events.md` for the reconciliation.

## Environment / configuration

Required in production (`config.ts`, fail-closed if missing): `DATABASE_URL`, `SESSION_PEPPER`, `STORAGE_ENCRYPTION_KEY`, `WEB_ORIGIN`. One-time bootstrap only: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (must be removed after first use — leaving them set does not re-create the admin, since bootstrap is idempotent on "does this email already exist", but leaving credentials in an env file is itself a hygiene issue). Feature flag: `MVP_DELIVERY_ENABLED` (default `false`) gates the delivery-fulfillment path out of the primary CTA. `TRUST_PROXY` controls whether `X-Forwarded-For` is honored for rate-limiting. `MALWARE_SCAN_URL` is optional (unset by default; `FINAL_MVP_READINESS.md` lists it as an external blocker/nice-to-have, not required).

`@dawai/config` (`platform/packages/config/src/{env,flags,secrets}.ts`) is the equivalent config-loading package for the `platform/` track, unused by `dawai-platform`.
