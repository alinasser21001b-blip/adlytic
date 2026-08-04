# 09 — Permissions

## Shipped model (`dawai-platform`)

### Authentication
- Email + password (Argon2id hashing), not phone+OTP. `server/security/auth.ts`.
- Opaque session tokens: 32 random bytes generated server-side; only a SHA-256(+`SESSION_PEPPER`) digest is stored in `sessions.token_hash` — the raw token never touches the database.
- Web transport: HttpOnly, Secure-in-production, `SameSite=Lax` cookie, plus a rotating CSRF token (`csrf_token_hash`) validated against an exact `Origin` check on state-changing requests (`GET /api/v1/auth/csrf` issues it).
- Native/future transport: the same opaque token sent as `Authorization: Bearer <token>` — no separate auth mechanism needed for a native client (`ARCHITECTURE.md` "Mobile conversion").
- Session revocation is immediate on user or pharmacy suspension — checked, not just set-and-forget (`requireAuth` presumably re-validates `sessions.revoked_at`/`expires_at` and `users.status` on every call; verify in `server/security/auth.ts` if changing this path).
- `POST /api/v1/auth/logout-all` revokes every session for the account (multi-device sign-out).

### Authorization
- **Role is enforced server-side on every request; client role selection is presentation only** (`ARCHITECTURE.md` — "the browser is never an authorization boundary"). `users.role ∈ {PATIENT, PHARMACY, ADMIN}` gates which route module a request can reach.
- Within `PHARMACY`, further scoping is by ownership: a pharmacy-role user only sees/mutates data for the branch(es) under `pharmacies.owner_user_id = <their id>`.
- Within `PATIENT`, resource ownership is by `patient_id`/`owner_user_id` matching the authenticated user, or — for proxy actions — by a live `family_members` link with sufficient `proxy_scope` (see `04-business-rules.md` rules 13–17).
- `ADMIN` routes require the `ADMIN` role and nothing else (no finer-grained admin permission tiers exist in the shipped schema — a gap relative to Blueprint v3's richer operator model; see `17-known-limitations.md`).
- Idempotency-Key enforcement (`security/idempotency.ts`) is not authorization but is part of the same "don't trust the client to behave" posture: retryable mutating endpoints require it, keyed per `(principal_id, operation, key)`.
- Rate limiting (`security/rate-limit.ts`) is per-key (account/IP), backed by the `rate_limits` table; `TRUST_PROXY` config controls whether `X-Forwarded-For` is honored for the IP component (hardened per `FINAL_MVP_READINESS.md` to respect real proxy config in production).

### What's audited
Nearly every mutating route calls `writeAudit()` (`services/audit.ts`) writing to `audit_events` with actor, role, action, resource, and `result ∈ {SUCCESS, DENIED, FAILED}` — including *denied* attempts, which is what makes the audit trail useful for detecting probing/abuse, not just successful changes.

### Known authorization limitations (see `17-known-limitations.md` for full list)
- Admins can still decrypt prescription files by role — `FINAL_MVP_READINESS.md` flags this as needing an operational procedure, not a code control, for the pilot.
- No MFA / email verification / phone OTP in the shipped auth flow — explicitly deferred as "external product ops."
- Exact coordinates are still stored server-side for matching math even though a `coarse_geohash` exists for lower-sensitivity use — see privacy notes in `10-clinical-safety.md`.

## Blueprint v3 permission model (`docs/technical/08-security-architecture.html`, `docs/technical/05-api-contracts.html`) — design target, not implemented

Four enforcement rules stated as absolute: (1) hidden UI is not a permission — the client enforces nothing; (2) authority is checked where the work happens, never at the gateway/entry point; (3) a missing relationship is indistinguishable from a forbidden one in the response; (4) least privilege wins on ambiguity — the narrowest applicable grant is used, never the first one found.

Authentication is phone + one-time code for patients (no password to leak), a per-person branch PIN + session for pharmacy staff (PIN identifies *who* acted, session proves *which device*), and a fully separate credential set for operators (no shared identity with any patient/staff account). Device binding: a refresh token is bound to a device id; mismatch forces re-verification. Access tokens are short-lived and **audience-scoped to one persona** — a patient token is rejected outright at a pharmacy endpoint (stronger than role-check-on-read; the token itself can't even reach the wrong service class). `identity-service::authority.check(principal, subject, scope)` is the single question every clinical call resolves, and it **throws rather than returning a boolean** so a caller cannot forget to handle a refusal — the same pattern the shipped `requirePatientAuthority()` already independently adopted (rule 16 in `04-business-rules.md`), suggesting this was a considered choice carried across both tracks even though the surrounding models differ.

Rule-of-thumb for future work: rule 2 ("authority checked where the work happens, not at the gateway") and rule 3 ("indistinguishable refusal") are both already honored in the shipped code's proxy-authority handling — treat them as binding conventions for any new authorization code in `dawai-platform`, independent of which product-blueprint track you're implementing against.
