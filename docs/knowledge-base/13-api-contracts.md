# 13 — API Contracts

## Shipped API (`dawai-platform`) — the real, callable surface

Base: `/api/v1/*`, Hono, JSON. Zod-validated request bodies on every mutation. `Idempotency-Key` header required on retryable creation/selection endpoints (`security/idempotency.ts`). All routes below are read directly from `server/routes/*.ts` handler registrations.

### `routes/public.ts` — no auth required
```
GET  /api/v1/medicines/search
GET  /api/v1/availability
GET  /api/v1/pharmacies
GET  /api/v1/pharmacies/:branchId
```

### `routes/auth.ts`
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
GET  /api/v1/auth/me
GET  /api/v1/auth/status
GET  /api/v1/auth/csrf
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
POST /api/v1/auth/account/delete
```

### `routes/patient.ts` — requires PATIENT session
```
GET  /api/v1/patient/profile               PUT /api/v1/patient/profile
GET  /api/v1/patient/requests              POST /api/v1/patient/requests
GET  /api/v1/patient/requests/:requestId
GET  /api/v1/patient/requests/:requestId/offers
POST /api/v1/patient/requests/:requestId/clarify
POST /api/v1/patient/requests/:requestId/expand
POST /api/v1/patient/requests/:requestId/cancel
POST /api/v1/patient/requests/:requestId/reservations
GET  /api/v1/patient/reservations/:reservationId
GET  /api/v1/patient/saved-pharmacies      POST/DELETE /api/v1/patient/saved-pharmacies/:branchId
GET  /api/v1/patient/notifications         POST /api/v1/patient/notifications/:notificationId/read
```

### `routes/pharmacy.ts` — requires PHARMACY session
```
POST /api/v1/pharmacy/onboarding
GET  /api/v1/pharmacy/profile              PUT /api/v1/pharmacy/settings
GET  /api/v1/pharmacy/dashboard
GET  /api/v1/pharmacy/inbox                GET /api/v1/pharmacy/inbox/:requestId
POST /api/v1/pharmacy/inbox/:requestId/offers
POST /api/v1/pharmacy/inbox/:requestId/decline
GET  /api/v1/pharmacy/reservations
POST /api/v1/pharmacy/reservations/:reservationId/acknowledge
POST /api/v1/pharmacy/reservations/:reservationId/ready
POST /api/v1/pharmacy/reservations/:reservationId/complete
POST /api/v1/pharmacy/reservations/:reservationId/fail
POST /api/v1/pharmacy/reservations/:reservationId/no-show
GET  /api/v1/pharmacy/inventory             GET /api/v1/pharmacy/inventory/on-hand
POST /api/v1/pharmacy/inventory             POST /api/v1/pharmacy/inventory/movements
GET  /api/v1/pharmacy/notifications
```

### `routes/admin.ts` — requires ADMIN session
```
GET  /api/v1/admin/dashboard
GET  /api/v1/admin/verifications            GET /api/v1/admin/verifications/:pharmacyId
POST /api/v1/admin/verifications/:pharmacyId/approve
POST /api/v1/admin/verifications/:pharmacyId/reject
GET  /api/v1/admin/pharmacies
POST /api/v1/admin/pharmacies/:pharmacyId/suspend
POST /api/v1/admin/pharmacies/:pharmacyId/restore
GET  /api/v1/admin/users
POST /api/v1/admin/users/:userId/suspend
POST /api/v1/admin/users/:userId/restore
GET  /api/v1/admin/requests                 GET /api/v1/admin/requests/:requestId
GET  /api/v1/admin/reports                  POST /api/v1/admin/reports/:reportId/resolve
GET  /api/v1/admin/audit-events
```

### `routes/clinical.ts` — requires PATIENT session (proxy-aware)
```
GET  /api/v1/clinical/family                POST /api/v1/clinical/family
POST /api/v1/clinical/family/:linkId/grant  POST /api/v1/clinical/family/:linkId/revoke
POST /api/v1/clinical/schedules
POST /api/v1/clinical/schedules/:scheduleId/events
POST /api/v1/clinical/schedules/:scheduleId/snooze
GET  /api/v1/clinical/timeline
GET  /api/v1/clinical/attention             POST /api/v1/clinical/attention/:eventId/dismiss
POST /api/v1/clinical/interaction-check
POST /api/v1/clinical/interaction-check/:checkId/override
```

### `routes/files.ts`
```
POST   /api/v1/files
GET    /api/v1/files/:fileId
DELETE /api/v1/files/:fileId
```

### `routes/shared.ts` — cross-role
```
GET  /api/v1/conversations
GET  /api/v1/conversations/:conversationId/messages
POST /api/v1/conversations/:conversationId/messages
GET  /api/v1/notifications          POST /api/v1/notifications/:notificationId/read
POST /api/v1/device-tokens          DELETE /api/v1/device-tokens
POST /api/v1/reports
```

### Cross-cutting contract rules
- Strict Zod validation on every request body; unvalidated fields are rejected, not ignored.
- `Idempotency-Key` required on creation/selection mutations (request creation, offer creation, reservation creation) — replaying the same key returns the original result.
- `X-Request-ID` echoed on every response (set by middleware if not supplied by the caller).
- CSRF token required (via `X-CSRF-Token` header, matched against `csrf_token_hash`) for cookie-authenticated state-changing calls; not required for `Authorization: Bearer` calls.
- Errors are `ApiError` instances mapped to structured JSON with a stable error code (`server/errors.ts`) — e.g. `SEV_ALERT_NOT_DISMISSIBLE` (409), and the admin-hardening note in `FINAL_MVP_READINESS.md` implies error codes like `not_found_or_not_yours`-style indistinguishable-refusal responses are a design goal, mirrored from the v3 API contract style below even though shipped error code names weren't individually enumerated in this review pass — check `server/errors.ts` for the exact code list before depending on one.

## `@dawai/contracts` (`platform/packages/contracts/src/index.ts`)

Shared TypeScript types for the Blueprint v3 API surface, intended to be the single source of type truth between `platform/apps/patient` and a future v3-conformant backend. **`dawai-platform`'s server does not import from `@dawai/contracts`**, and `dawai-platform/src/api/client.ts` defines its own request/response types independently — there is currently no shared contract package between the two API surfaces.

## Blueprint v3 API contract (`docs/technical/05-api-contracts.html`) — spec only, 67 endpoints, not implemented as a running server

Three rules stated as universal: (1) authority is checked in the owning service, never at the gateway; (2) a missing relationship and a forbidden one return byte-identical responses; (3) every state-changing call carries an `Idempotency-Key`, and replay returns the original result — never a duplicate, never an error. Endpoint groups: `/v1/auth/*`, `/v1/me*`, `/v1/subjects/*`, `/v1/grants/*`, `/v1/catalogue/*`, `/v1/districts`, `/v1/branches`, plus (documented but not extracted in full in this pass) marketplace, clinical, notification, and media groups. Full detail: fetch and read `docs/technical/05-api-contracts.html` directly if implementing against this spec — it is generated from `docs/technical/model.js` and is internally validated (`validate.mjs`, 11/11 checks).

**Do not conflate the two API surfaces.** A client built against `docs/technical/05-api-contracts.html` (e.g. `/v1/subjects/{id}/claim-invite`) will not work against `dawai-platform`'s running server, which has no `/v1/subjects` route at all.
