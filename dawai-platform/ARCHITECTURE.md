# Dawai Technical Architecture

## Boundary

Dawai is a modular monolith with three independently authorized clients:

- Patient
- Pharmacy
- Admin

The browser is never an authorization boundary. Every resource query is constrained by
the authenticated user, patient ownership, pharmacy branch, dispatch, or admin role.

## Runtime

```text
Browser / future iOS / future Android
               │
               │ REST /api/v1
               ▼
         Hono Node API
        ┌──────┼──────────┐
        ▼      ▼          ▼
 PostgreSQL  encrypted   notification
             objects       outbox
        ▲                   │
        └──── worker ───────┘
```

Production runs:

1. one migration job;
2. one or more stateless API processes;
3. one or more idempotent lifecycle workers;
4. managed PostgreSQL;
5. private durable storage mounted at `STORAGE_PATH` for a single node, or an
   object-store implementation for multiple nodes.

PGlite is restricted to local development and isolated tests.

## Authentication

- Passwords: Argon2id.
- Sessions: 32 random bytes; only a SHA-256+pepper digest is stored.
- Web: HttpOnly, Secure in production, SameSite=Lax cookie plus rotating CSRF
  token and exact Origin check.
- Native: the same opaque token can be sent as `Authorization: Bearer`.
- Session revocation is immediate after user/pharmacy suspension.
- Client role selection changes presentation only; API middleware enforces role.

## Core state machines

```text
Request:
ACTIVE → HOLD_PENDING → RESERVED → READY → COMPLETED
   ├── NO_MATCH → ACTIVE after explicit radius expansion
   ├── CANCELLED
   ├── EXPIRED
   └── BLOCKED

Offer:
ACTIVE → HOLD_PENDING → HELD → FULFILLED
   ├── WITHDRAWN
   ├── SUPERSEDED
   ├── FAILED
   └── EXPIRED

Reservation:
PENDING_ACK → ACTIVE → READY → COMPLETED
        ├── REJECTED
        ├── FAILED
        ├── CANCELLED
        └── EXPIRED
```

The hold timer starts on pharmacy acknowledgement, never on patient selection.
Database conditional updates and a partial unique index enforce one live reservation
per request.

## Matching

1. Select verified, active, accepting branches inside a geographic bounding box.
2. Calculate Haversine distance.
3. Exclude closed branches using the branch IANA timezone and opening periods.
4. Score distance, response rate, response speed, and pickup/delivery fit.
5. Dispatch at most six branches at 2 km, then eight new branches at 5/10 km.
6. Radius expands only after a patient action.

PostGIS can replace the repository query later without changing the API contract.

## Availability

`availability_signals` is append-only and always carries `source`, `observed_at`,
and `expires_at`.

Sources:

- `PHARMACIST_CONFIRMATION`
- `MANUAL_STOCK`
- `POS_SYNC`
- `REALTIME_SYNC`

An offer writes a short pharmacist-confirmed signal. Pharmacy inventory pages write
manual signals. POS and real-time integrations use the same table and API projection.
No static catalogue row is presented as live stock.

## Sensitive uploads

1. Byte and pixel limit.
2. PNG/JPEG/WebP magic-byte check.
3. Full image decode.
4. Rotation, bounded resize, JPEG re-encode, and metadata stripping.
5. Random file ID and storage key.
6. AES-256-GCM with random 96-bit nonce.
7. AAD binds file, owner, and purpose.
8. Ciphertext on disk; nonce/tag/metadata in PostgreSQL.
9. Authorization before decryption and audited access.
10. `Cache-Control: no-store` on the decrypting response.

A non-selected pharmacy cannot access a prescription. A selected pharmacy gains
temporary access only while its acknowledged hold is active.

## Notifications

Every notification is durable in `notifications`. `notification_outbox` contains a
generic payload:

```json
{
  "eventType": "OFFER_RECEIVED",
  "resourceId": "opaque-id"
}
```

The payload contains no medicine, patient, prescription, or exact location. APNs,
FCM, Web Push, and SMS adapters consume this outbox without changing product APIs.

## API groups

```text
/api/v1/auth/*             registration, sessions, status, CSRF, logout
/api/v1/medicines/*        reference search
/api/v1/availability       recent availability signals
/api/v1/pharmacies/*       verified public branches
/api/v1/patient/*          profile, requests, offers, reservations, saved branches
/api/v1/pharmacy/*         onboarding, inbox, offers, inventory, reservations, settings
/api/v1/admin/*            verification, users, pharmacies, traces, reports, audit
/api/v1/files/*            secure upload, audited read, deletion
/api/v1/conversations/*    active reservation messages
/api/v1/notifications/*    durable notification inbox
```

All mutation bodies use strict Zod schemas. Retryable creation/selection operations
require an `Idempotency-Key`.

## Mobile conversion

The backend requires no rewrite for native clients:

- REST URLs and contracts are UI-independent.
- opaque Bearer sessions do not depend on browser cookies;
- role authorization is server-side;
- camera uploads use multipart images;
- coordinates are numeric API fields;
- routes are deep-linkable;
- push providers consume an existing outbox;
- countdowns use server timestamps;
- web navigation and domain logic are separate.

A native client must keep its opaque token in Keychain/Keystore and should add PKCE
if an external identity provider is introduced.

## Production configuration

Required:

- `DATABASE_URL`
- `SESSION_PEPPER`
- `STORAGE_ENCRYPTION_KEY`
- `WEB_ORIGIN`

The application fails closed in production when these are missing. `ADMIN_EMAIL` and
`ADMIN_PASSWORD` are one-time bootstrap inputs and must be removed after first use.

## Deployment limitations requiring operator decisions

These are external launch gates, not hidden code placeholders:

- Iraqi federal/KRG legal approval for prescription and delivery handling.
- Managed PostgreSQL backup/PITR configuration.
- Production object storage and KMS when running more than one API node.
- APNs/FCM/SMS provider credentials and privacy agreements.
- Verified production pharmacy registry data.
- TLS, DNS, monitoring, and incident-response ownership.
