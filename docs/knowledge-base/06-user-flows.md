# 06 — User Flows

Flows for the shipped product (`dawai-platform`) are described first per role, with API endpoints named (`server/routes/*.ts`). Blueprint v3 flow names (screen IDs like `R1`, `F2`) are cross-referenced where useful for future implementers working from `platform/`.

## Patient

**Register/login** → `POST /api/v1/auth/register`, `POST /api/v1/auth/login`; session cookie/bearer issued. Alternative failure: wrong credentials, account suspended.

**Search (no request)**: `GET /api/v1/medicines/search`, `GET /api/v1/availability` — public, no auth required. Shows sourced/time-stamped signals, not a guarantee. Decision point: "just checking" vs "I need it now" — the latter continues to Request.

**Create a request** (`POST /api/v1/patient/requests`): enter medicine (name/description), optional box or prescription photo (`POST /api/v1/files`, `attachment_kind ∈ {PRESCRIPTION, BOX_IMAGE}`), quantity (≤20), urgency, coarse location or GPS. System matches → dispatches to ≤6 branches within 2 km. Failure path: `NEEDS_CLARIFICATION` if the medicine name is ambiguous (`POST /api/v1/patient/requests/:id/clarify`); `NO_MATCH` if nothing responds — patient must explicitly expand radius (`POST /api/v1/patient/requests/:id/expand`) to 5 km then 10 km.

**Review offers** (`GET /api/v1/patient/requests/:id/offers`): compare by best-match/distance/price; each offer shows freshness of confirmation.

**Reserve** (`POST /api/v1/patient/requests/:id/reservations`): selects exactly one offer → reservation `PENDING_ACK`. Patient waits for pharmacy ACK (push/in-app notification). On ACK: 15-minute hold begins, directions/contact/chat unlock (`GET/POST /api/v1/conversations/*`, scoped to that reservation only). Failure paths: pharmacy rejects (`REJECTED`, request reopens per the 5-minute-grace "honoured rate" rule from Blueprint v3, though that specific grace-window naming is a v3-track concept — the shipped equivalent is the ack-deadline/hold-expiry timers); ack deadline passes (`EXPIRED`, request reopens); patient cancels at any point (`POST /api/v1/patient/requests/:id/cancel`, allowed even during an active hold).

**Pickup**: pharmacy marks `READY` then `COMPLETED` (or `NO_SHOW`/`FAILED`). Patient sees resolution in history (`GET /api/v1/patient/requests`).

**Ancillary**: saved pharmacies (`GET/POST/DELETE /api/v1/patient/saved-pharmacies*`), notifications inbox (`GET /api/v1/patient/notifications`, `POST .../:id/read`), profile (`GET/PUT /api/v1/patient/profile`), account deletion (`POST /api/v1/auth/account/delete`).

## Patient — Family proxy variant

Owner (e.g., an adult child) adds a family member (`POST /api/v1/clinical/family`), the member/witness must grant consent (`POST /api/v1/clinical/family/:linkId/grant`) before any proxy action is possible — `consent_granted_at` stays NULL otherwise. With `ORDER` or `CONFIRM` scope, the proxy can create requests / confirm dose events on the owner's or the linked member's behalf, always attributed to the acting account (`confirmed_by_user_id`/`confirmed_via_family_member_id`). Revocation (`POST .../revoke`) is immediate. Failure path: attempting a scope-exceeding action returns 403; attempting an action against a nonexistent/never-granted link returns 404 (indistinguishable-refusal rule).

## Patient — Dose adherence flow

Create/confirm a dose schedule (`POST /api/v1/clinical/schedules`) — `sig_source` defaults to `PATIENT_SELF_REPORT` unless a pharmacy account is the confirming party. Log a dose event (`POST /api/v1/clinical/schedules/:id/events`), optionally offline with a `client_event_id` for idempotent replay. View the adherence timeline (`GET /api/v1/clinical/timeline`). Snooze a reorder suggestion (`POST /api/v1/clinical/schedules/:id/snooze`) — always wins over any days-of-cover nag. Attention events surface as the single Pill Bar (`GET /api/v1/clinical/attention`, `POST .../:id/dismiss` — blocked with 409 for `SEV_ALERT`).

## Pharmacy (Owner / Staff)

**Onboarding** (`POST /api/v1/pharmacy/onboarding`): register business + branch + license documents (`POST /api/v1/files`, purpose `PHARMACY_LICENSE`/`PHARMACIST_ID`) → `PENDING` verification. Failure: admin rejects → `REJECTED`; can resubmit.

**Operate**: dashboard (`GET /api/v1/pharmacy/dashboard`), inbox of dispatched requests ranked by match (`GET /api/v1/pharmacy/inbox`, `GET .../:requestId`), respond with a structured offer (`POST /api/v1/pharmacy/inbox/:requestId/offers`) or decline (`POST .../decline`). Manage settings — hours, pickup/delivery, `accepting_requests` pause switch (`PUT /api/v1/pharmacy/settings`).

**Fulfill a reservation**: acknowledge (`POST /api/v1/pharmacy/reservations/:id/acknowledge` — this is what starts the 15-min hold), mark ready (`.../ready`), then complete (`.../complete`), fail (`.../fail`), or no-show (`.../no-show`).

**Inventory** (passive ledger): record a movement (`POST /api/v1/pharmacy/inventory/movements`, additive delta, offline-idempotent via `client_event_id`), view current on-hand (`GET /api/v1/pharmacy/inventory/on-hand`) and the raw ledger (`GET /api/v1/pharmacy/inventory`). A `COUNT`-reason zero-delta movement raises `sku_trust` on agreement.

**Reliability**: private metrics accrue automatically from response/completion behavior — not directly editable.

## Administrator

**Verification queue**: list pending pharmacies (`GET /api/v1/admin/verifications`), review one with its documents (`GET .../:pharmacyId`), approve (`POST .../approve` — requires a license document present, per the hardened rule) or reject (`POST .../reject` with reason).

**User/pharmacy management**: list/suspend/restore users and pharmacies (`GET /api/v1/admin/users`, `POST .../:id/suspend`, `.../restore`; same for pharmacies).

**Oversight**: request trace view (`GET /api/v1/admin/requests`, `GET .../:id` — dispatch → offer → reservation chain), reports queue (`GET /api/v1/admin/reports`, `POST .../:id/resolve`), audit log (`GET /api/v1/admin/audit-events`), pilot-metrics dashboard (`GET /api/v1/admin/dashboard`).

## Guardian (Blueprint v3 concept — proxy-analog above is the shipped equivalent)

In Blueprint v3, a Guardian is unilateral authority over a *managed Subject* (a dependent who cannot consent, e.g. a young child) — distinct from a *PeerGrant*, which is mutual and requires the grantee's approval. The shipped product does not distinguish unilateral-guardian vs mutual-peer authority; `family_members.proxy_scope` always requires the member's (or witness's) consent, i.e. it structurally matches v3's PeerGrant more than its Guardianship. This is a real product-model gap if the guardian-of-a-minor use case matters for the pilot — see `19-open-decisions.md`.

## Guest

Can search medicines/availability and browse verified public branches (`GET /api/v1/pharmacies*`) without an account. Cannot create a request, reserve, or message. Per `docs/dawai/FINAL_MVP_READINESS.md`, the *API* supports this (public routes exist) but the *UI* is still largely account-gated — a documented, non-blocking gap, not a missing capability at the API layer.
