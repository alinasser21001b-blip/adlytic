# 14 — Data model

The 22 declared tables, their constraints, indexes, immutability and deletion
rules — plus the client-side storage, and the second track's schema.

Authority: `docs/technical/model.js` (`TECH.tables`) and
`docs/technical/06-database-architecture.html`.

**None of this exists as a running database in `platform/` — there is no server
(TD-1).** It is the target schema, and it is precise enough to build from.
`dawai-platform/` has a *different*, running schema — §7 below.

---

## 1. Table map by owning service

| Service | Tables |
|---|---|
| `identity-service` | `accounts`, `subjects`, `guardianships`, `peer_grants` |
| `catalogue-service` | `catalogue_items`, `districts` |
| `pharmacy-service` | `pharmacies`, `branches`, `branch_hours`, `staff`, `licences` |
| `marketplace-engine` | `requests`, `request_lines`, `offers`, `offer_lines`, `reservations`, `reservation_lines` |
| `clinical-engine` | `dispense_records` |
| `media-service` | `prescription_images`, `prescription_access` |
| `notification-service` | `watches` |
| `audit-service` | `audit_entries` |

**Each table is owned by exactly one service.** No cross-service writes.

---

## 2. Identity

### `accounts`

```
id, phone_hash, phone_enc, state, name, district_id,
created_at, deletion_effective_at, tombstone_id
```

| Constraint | Why |
|---|---|
| `UNIQUE(phone_hash)` | **D03** — one account per number |
| `state ∈ Account state set` | |

Indexes: `phone_hash`; `state WHERE state='deletion_scheduled'` (a partial index
— the deletion sweep only ever scans the scheduled rows).
Deletion: **soft, then tombstone** (D05). Audit: all writes.

**Phone numbers are hashed for lookup and encrypted for display** — the hash is
what indexes.

### `subjects`

```
id, type, owner_account_id, state, name, birth_year,
memorialised_at, reversible_until
```

| Constraint | Why |
|---|---|
| `type ∈ {self, managed}` | **D01** |
| **`UNIQUE(owner_account_id) WHERE type='self'`** | §9 — an Account owns **exactly one** self Subject. This is the invariant the client relies on to infer the self relationship after `/v1/auth/verify` |
| A managed subject has exactly one active guardianship | |

Deletion: soft.

### `guardianships`

```
id, guardian_account_id, subject_id, state, created_at, ended_at, ended_reason
```

| Constraint | Why |
|---|---|
| **`UNIQUE(subject_id) WHERE state='active'`** | **D01** — exactly one guardian. Two guardians is two people with unresolvable authority over one medical record |

**Deletion: `never — ended, not deleted`.** The record that authority once
existed survives.

### `peer_grants`

```
id, subject_id, grantee_account_id, grantee_phone_hash, scope, state,
invited_at, expires_at, activated_at, revoked_at
```

| Constraint | Why |
|---|---|
| **`scope ∈ {view, order}`** | **No `confirm` scope exists** — §10 change 1: there are no dose events to confirm in Phase 0 |
| `UNIQUE(subject_id, grantee_account_id) WHERE state='active'` | |

`grantee_account_id` is **nullable** — **D02**: an invitation to a number with no
account is the **normal** case, so `grantee_phone_hash` carries it until they
sign in.

Index on `state WHERE state='invited'` — the 7-day expiry sweep.

**Deletion: `never — revoked, so the record that it existed survives` (§9).**

---

## 3. Catalogue

### `catalogue_items`

```
id, name_ar, name_latin, name_ku_reserved, form, strength, pack_size,
requires_prescription, is_controlled, state, version
```

| Constraint | Why |
|---|---|
| **`state='requestable'` requires `pack_size NOT NULL AND requires_prescription NOT NULL AND is_controlled NOT NULL`** | §3 prerequisite 3. **This is the database half of the defect described in `10-clinical-safety.md` §4** — the client half is the `isHit` type guard, and both are needed because the cache can replay rows an old build wrote |

`name_ku_reserved` — **D34**: the Kurdish slot is reserved in the schema and
nowhere else. A font stack for a language we do not ship would be a claim we
cannot honour.

Index: a **normalised search index** on `name_ar, name_latin` — matching the six
folding rules the client applies, so the client and the index agree about what
«بانادول» is.

Deletion: **withdrawn, never removed.** Audit: operator writes.

Prohibitions: **no price** (D08), **no stock**, **never silently autocorrect**.

### `districts`

```
id, city, name_ar, name_latin
```

`UNIQUE(city, name_ar)`. **D10** — the area unit is the *curated* district.
No geometry column: **a district is stored, a GPS coordinate never is** (D29).

---

## 4. Pharmacy

### `pharmacies`

`id, business_name, owner_account_id, named_pharmacist_account_id, state`.
Owner and named pharmacist recorded **separately** (§3.3) — they are frequently
different people. Closed, never removed.

### `branches`

```
id, pharmacy_id, district_id, verified_point, address_text, storefront_image_id,
radius_km, capacity_open_reservations, paused_until, state, eligibility_reason
```

| Constraint | Why |
|---|---|
| **`verified_point NOT NULL` before `state='verified'`** | **D10** — the operator sets the map point at approval; an unverified point cannot route |

`eligibility_reason` is a **column**, because **D13** requires a branch to be told
*why* it is not receiving — the reason is state, not a log line.

Indexes: `district_id`, `state`, `pharmacy_id` — the three axes routing queries on.

### `branch_hours`

```
id, branch_id, kind, weekday, opens, closes, date, hijri_range
```

| Constraint | Why |
|---|---|
| `kind ∈ {standard, exception, ramadan}` | |
| **Ramadan rows carry `hijri_range`, not a Gregorian date** | **D33** — Ramadan is a *scheduling model*, not an exception list. A Gregorian date would need re-entering every year and would drift |

### `staff`

```
id, branch_id, account_id, role, pin_hash, licence_id, state, invited_at
```

| Constraint | Why |
|---|---|
| `role ∈ {assistant, pharmacist, manager}` | |
| **`role='pharmacist'` requires a verified `licence_id`** | **D19** — the clinical/commercial split, at the schema level |
| **At least one active manager per branch** | §10 change 5 — `LAST_MANAGER_CANNOT_BE_REMOVED` |

`pin_hash` — the per-person branch PIN. *The PIN identifies who acted; the
session proves the device.*

### `licences`

```
id, pharmacy_id, holder_account_id, document_image_id, expires_at, state,
verified_by, verified_at
```

`state ∈ {submitted, valid, expiring, lapsed}`. Deletion: **never**.

Index: `expires_at WHERE state IN ('valid','expiring')` — a partial index so the
60/30/7-day warning sweep is cheap.

---

## 5. Marketplace

### `requests`

```
id, subject_id, actor_account_id, parent_request_id, district_id, urgency,
window_ends_at, state, idempotency_key, created_at
```

| Constraint | Why |
|---|---|
| **`urgency ∈ {now, today, soon}` mapping to 20m/4h/48h exactly** | **D09** |
| **1..8 lines** | §2 Request |
| **`UNIQUE(idempotency_key)`** | The client's key, stable across retries — this is what makes the replay exactly-once |

`subject_id` and `actor_account_id` are **separate columns**, because §2
invariant 1 says they are frequently different people. `parent_request_id` is
D06's child-request link.

Indexes: `subject_id`; **`state, window_ends_at`** (the expiry sweep);
`district_id` (routing).

### `request_lines`

```
id, request_id, item_id, packs, prescription_image_id, state
```

| Constraint | Decision |
|---|---|
| `packs >= 1` | **D07** — the unit is the pack |
| **`prescription_image_id NOT NULL` when the item `requires_prescription`** | **D18** |
| **The item must not be `is_controlled`** | **D42** |

> No upper bound on `packs`. Blueprint v3 does not state one, and inventing a
> ceiling would be an invented business rule — **TD-16**.

### `offers`

```
id, request_id, branch_id, staff_account_id, readiness, state,
sent_at, withdrawn_at, idempotency_key
```

| Constraint | Why |
|---|---|
| **`UNIQUE(request_id, branch_id)`** | **One answer per branch per request** |
| **Withdrawal only while `state='sent'`** | **D08** — the correction path exists *only before acceptance*; after acceptance the price binds |
| `UNIQUE(idempotency_key)` | |

`staff_account_id` — who answered, for the audit.

### `offer_lines`

```
id, offer_id, request_line_id, answer, price, substitute_item_id, note,
unavailable_reason, authorised_by_staff_id
```

| Constraint | Decision |
|---|---|
| `answer ∈ {available, unavailable, substitute}` | **D08** |
| `price NOT NULL` when `answer <> 'unavailable'` | D08 |
| `unavailable_reason NOT NULL` when `answer='unavailable'` | **D13** — a reason, always |
| **`substitute` requires `authorised_by_staff_id` with a verified pharmacist licence** | **D19** — the schema-level guarantee behind R9's «صيدلي مُجاز» |

### `reservations`

```
id, offer_id, branch_id, subject_id, code, state, requested_at, held_at,
expires_at, resolved_at, refusal_reason, confirmed_by_staff_id,
seconds_since_confirm_on_refusal
```

| Constraint | Why |
|---|---|
| **`held_at NOT NULL` before `expires_at` is set** | §6 — **the clock starts at `held`.** A countdown before anyone has committed stock counts down to a disappointment |
| **`UNIQUE(code) WHERE state='held'`** | **D14** — the code is the collection right; two live holds may not share one |
| **`expires_at` computed from server time only** | §21 — a user changing their phone clock must not change a reservation |

`seconds_since_confirm_on_refusal` exists **solely for D11's five-minute grace** —
the honest "sold since" case must be distinguishable from a branch that never
had it.

Indexes: `branch_id, state`; `subject_id`; `code WHERE state='held'` (the counter
lookup); `expires_at WHERE state='held'` (the expiry sweep).

**Deletion: `pseudonymised on account deletion, never removed` (D05)** — the
pharmacy's side of the record survives.

### `reservation_lines`

`id, reservation_id, offer_line_id, packs, state`.
Constraint: **only lines the patient accepted (D06)** — a refused or undecided
substitution is not among them.

---

## 6. Clinical, media, notifications, audit

### `dispense_records` — the medication record

```
id, subject_id, reservation_id, item_id, packs, branch_id, price, dispensed_at
```

| Property | Value |
|---|---|
| Constraint | **APPEND ONLY — no UPDATE and no DELETE permission is granted to any role** (§2 invariant 2) |
| Constraint | `UNIQUE(reservation_id)` — a collection writes **exactly one** |
| Immutable | **YES** |
| Deletion | Only via the account-deletion cascade |
| Audit | **Insert only** |
| Written by | `clinical-engine`, on `reservation.collected`, **and by nothing else** (D22) |

Index: `subject_id, dispensed_at` (the history); `item_id`.

### `prescription_images`

`id, subject_id, storage_ref, encrypted_key_ref, uploaded_at, deleted_at`.

**Encrypted at rest; the key is never stored beside the object** — `storage_ref`
and `encrypted_key_ref` are separate columns for exactly that reason.

Deletion: **hard, on patient request** (§4 M5). Audit: **all writes AND all
reads.**

### `prescription_access` — how D18 becomes real

`id, image_id, branch_id, reservation_id, granted_at, revoked_at`.

`revoked_at` is set when the reservation resolves. Deletion: **never** — the
record of who could see what, and when, is itself evidence. Audit: **all writes
and all reads.**

### `watches`

`id, subject_id, item_id, district_id, state, created_at, expires_at`.
**Max 5 active per subject; `expires_at = created_at + 14 days`** (D30).
Index: `item_id, district_id WHERE state='active'` — the match query.

### `audit_entries`

```
id, actor_account_id, actor_tombstone_id, subject_id, branch_id,
action, target_ref, reason, occurred_at, payload_digest
```

| Property | Value |
|---|---|
| Constraint | **APPEND ONLY — no principal, including the operator, holds UPDATE or DELETE** (§5) |
| Constraint | **Actor replaced by tombstone on account deletion, entry preserved** (D05) |
| Immutable | **YES** · Deletion: **never** |
| Content | **`payload_digest` — a digest, not the content.** The audit records *that* a read occurred, never *what* was read |

Indexes: `subject_id, occurred_at`; `actor_account_id, occurred_at`;
`branch_id, occurred_at` — the three access-log projections (S12, O23, P26).

---

## 7. Data-protection rules, as schema facts

| Rule | Where it lives in the schema |
|---|---|
| One account per phone (D03) | `UNIQUE(accounts.phone_hash)` |
| Phone hashed for lookup, encrypted for display | `phone_hash` + `phone_enc` |
| No GPS ever (D29) | No coordinate column on `accounts`, `requests` or `subjects`; `branches.verified_point` is the **branch's** operator-set location |
| Only unmatched searches are retained (D29) | **No search table at all** — modelled as an event (⚠️ BD-4) |
| Prescription key apart from object | `storage_ref` vs `encrypted_key_ref` |
| Access is time-bounded | `prescription_access.revoked_at` |
| Deletion preserves accountability | `guardianships`: ended not deleted · `peer_grants`: revoked not deleted · `reservations`: pseudonymised · `audit_entries`: actor tombstoned |
| Nothing is silently mutable | `dispense_records` and `audit_entries` are `imm: YES` |

---

## 8. Missing tables — the four modelling gaps

| Gap | Severity | Missing table |
|---|---|---|
| **BD-1** | blocker | **Saved pharmacies** (M4). Per Account or per Subject? Capped? Does it survive branch closure? |
| **BD-2** | blocker | **Price disputes** (V7/O22, D31). `price.dispute.raised` is an event; there is no entity, no lifecycle, no rule for whether it affects the honoured rate |
| **BD-3** | blocker | **Support tickets** (M15/P30/O20/O21). Four screens, no entity, no states, no ownership |
| **BD-4** | major | **Unmatched searches** (O10, D29). *D29 says the term is stored but not for how long or against what*, so **D29's retention promise is unverifiable until answered** |
| **BD-5** | blocker | **Consented support sessions** (O19) |
| **BD-7** | major | **Exports** (M8/L02/P27) — an artifact with an expiry and no entity |
| **BD-8** | major | **Device registrations** — push is unimplementable without one |
| **BD-9** | minor | The **outbox** — correctly absent, because it is client-side only. *Recorded so a reader does not mistake its absence from the ERD for an omission* |

---

## 9. Client-side storage

`platform/` stores exactly **two** kinds of thing, in `localStorage` via the
`Store` interface:

| Key | Value | Lifetime |
|---|---|---|
| `dawai.deviceId` | A minted UUID | **Permanent** — the verify contract binds a session to it, so a value that changed between launches would ask the patient to verify again every time |
| `dawai.search.<query>` | `{ value: SearchResponse, at: number }` | Until overwritten |

**What is deliberately NOT stored:**

- **No session token.** `POST /v1/auth/verify` answers with one and *nothing here
  models or stores it yet (TD-1) — writing an account id to disk and treating a
  later launch as signed in would be the app claiming an authenticated session it
  does not hold.* **Closing the app signs out, honestly.**
- **No offers.** They are live commitments; a stale one would misinform.
- **No reservations.** V2's cached-countdown path is implemented and photographed
  but never exercised against real cache eviction (**TD-6**).
- **No outbox persistence.** The outbox lives in reducer state for the session.

An entry that fails to parse is treated as **absent** — *an older build wrote it
in a shape this one does not know; the network path runs and rewrites it.*
Writes are **fail-soft** — *the cache is an optimisation, and every read path
already treats absence as normal.*

**The target rule is D28:** the local cache holds subjects, active reservations,
dispense history and viewed catalogue items, **encrypted with an OS-backed key**,
and **sign-out destroys the key and therefore the cache.** `localStorage` cannot
honour that, which is exactly why `Store` is an interface and not a `Map`.

---

## 10. The second track's schema — `dawai-platform/`

A **different**, running schema. Seven migrations:

| Migration | Adds |
|---|---|
| `0001_init` | Users (roles `PATIENT`/`PHARMACY`/`ADMIN`), sessions, pharmacies, branches, medicines, `medicine_requests`, dispatches, `pharmacy_offers`, reservations, messaging, notifications, audit, rate limits, idempotency |
| `0002_production_hardening` | Constraints and indexes |
| `0003_mvp_conformance` | MVP conformance fixes |
| `0004_clinical_core` | Family proxy consent, dose schedules, dose events, passive inventory ledger, attention system, model-output audit log |
| `0005_interaction_safety` | **Severity-tiered drug interaction checking** |
| `0006_clinical_integrity` | Offline dedupe scoping, attention-expiry interaction, deterministic proxy authority, reconciliation-count constraint, backfill |
| `0007_review_round2` | Adversarial-review fixes |

**This schema contradicts Blueprint v3 in four structural ways**, and they are the
reason the two tracks cannot simply be merged:

1. `users` with a role column vs `Account` / `Subject` / `Guardianship` /
   `PeerGrant`.
2. Email + Argon2id password vs phone + OTP (**"no password exists, so none can
   leak"**).
3. **Migrations 0005–0007 build a drug-interaction engine, which D16 explicitly
   removed from Phase 0** — and §7's stated reason is that *a partial check a
   user believes is complete is more dangerous than a stated absence*.
4. Dose schedules and dose events exist, while Blueprint v3 §10 change 1 removed
   the `confirm` scope **because there are no dose events to confirm**.

Its own strengths, worth carrying forward if a convergence happens: encrypted
object storage with magic-byte inspection, image re-encoding and EXIF stripping;
a durable notification outbox with a lifecycle worker; idempotency and rate
limiting as first-class middleware; PGlite for zero-setup local development and
isolated tests.

See `19-open-decisions.md` §1.
