# 13 — API contracts

The 67 declared endpoints, the four global rules, the responses the client
actually handles, and the two known contradictions.

Authority: `docs/technical/model.js` (`TECH.endpoints`) and
`docs/technical/05-api-contracts.html`.
Client-side statement of the same contracts: `platform/apps/patient/src/ports.ts`.

---

## 1. The four global rules

1. **TLS everywhere, including between services.**
2. **Every state-changing call carries an `Idempotency-Key` header**, enforced at
   the gateway (D27). The client mints it **once, at enqueue** —
   > a key minted inside a transport would be new on every call and every retry
   > would be a second acceptance.
3. **Replaying a state-changing call returns the original result.** This is what
   stops a retry from becoming a second reservation at a second pharmacy. It is
   also why `409` classifies as `duplicate` (success), never as an error.
4. **A response the contract does not declare is a transport failure**, never a
   new outcome invented at the adapter.

Plus two enforced at the gateway: **audience-scoped tokens** (a patient token is
rejected at a pharmacy endpoint) and **rate limits per account and per branch**.

---

## 2. The 67 endpoints

### Identity and account (19)

| Method | Path |
|---|---|
| POST | `/v1/auth/phone` |
| POST | `/v1/auth/verify` |
| POST | `/v1/auth/session/refresh` |
| DELETE | `/v1/auth/session` |
| GET | `/v1/me` |
| PATCH | `/v1/me` |
| POST | `/v1/me/phone-change` |
| POST | `/v1/me/delete` |
| POST | `/v1/subjects` |
| POST | `/v1/subjects/{id}/claim-invite` |
| POST | `/v1/subjects/{id}/transfer` |
| POST | `/v1/subjects/{id}/memorialise` |
| POST | `/v1/subjects/{id}/memorialise/reverse` |
| GET | `/v1/subjects/{id}/access-log` |
| POST | `/v1/subjects/{id}/export` |
| GET | `/v1/grants` |
| POST | `/v1/grants` |
| POST | `/v1/grants/{id}/approve` |
| POST | `/v1/grants/{id}/revoke` |

### Catalogue and geography (5)

`GET /v1/catalogue/search` · `GET /v1/catalogue/items/{id}` · `GET /v1/districts` ·
`GET /v1/branches` · `GET /v1/branches/{id}`

### Marketplace, patient side (11)

| Method | Path | Note |
|---|---|---|
| POST | `/v1/requests` | The only write the patient app makes today |
| GET | `/v1/requests/{id}` | Polled every 3 s while any branch is thinking |
| POST | `/v1/requests/{id}/cancel` | ⚠️ **TD-20 — contradicts the §6 machine** |
| POST | `/v1/requests/{id}/widen` | R11 |
| POST | `/v1/offers/{id}/accept` | **The most consequential call the patient app makes** |
| GET | `/v1/reservations/{id}` | |
| POST | `/v1/reservations/{id}/cancel` | V5 |
| POST | `/v1/reservations/{id}/price-dispute` | D31 · ⚠️ BD-2 — no entity |
| GET | `/v1/subjects/{id}/dispense-history` | The medication record |
| POST | `/v1/watches` · DELETE `/v1/watches/{id}` | D30 |
| POST | `/v1/prescriptions` · DELETE `/v1/prescriptions/{id}` | Multipart |

### Pharmacy (22)

Applications (`POST`/`GET /v1/pharmacy/applications`), staff sign-in, inbox,
eligibility, offer, withdraw, reservations, confirm, cannot-hold, handover,
prescription read, hours, coverage, pause, staff add/remove, performance,
access-log, export, close.

### Operator (10)

`GET /v1/ops/overview` · `GET /v1/ops/verification-queue` ·
`POST /v1/ops/applications/{id}/decide` · `POST /v1/ops/branches/{id}/suspend` ·
`GET /v1/ops/catalogue/unmatched` · `PUT /v1/ops/catalogue/items/{id}` ·
`GET /v1/ops/metrics/{name}` · `POST /v1/ops/support-sessions` ·
`GET /v1/ops/audit`

---

## 3. The endpoints the client actually implements

Six, behind five ports. `ports.ts` states each one as **the declared responses
and nothing else**, so a screen cannot receive an answer the contract does not
contain.

### `POST /v1/auth/phone` — `IdentityPort.requestCode`

```
→ { phone: "+9647701234567" }
← 202 { challengeId, resendAfter }
```

A 202 **without** a `challengeId` is treated as a **permanent failure**, not a
network blip — *pretending it was one would make the patient retry into the same
wall.*

`resendAfter` is **the server's word** on when another SMS may be requested; the
client renders it, never decides it.

**The verification code is never in a response.** The dev server prints it to the
terminal, because the contract does not carry it and *returning it would be
inventing a response field.*

### `POST /v1/auth/verify` — `IdentityPort.verify`

```
→ { challengeId, code, deviceId }
← 200 { account, subjects[], session }
← 400 wrong_code { attemptsLeft }
← 410 challenge_expired
← 429 too_many_attempts
← 403 account_suspended
```

Mapped to five typed variants, matched **by declared status**. Anything else is a
transport failure.

**Two hard-won details:**

- A **200 without an account or a subject** is a permanent failure. §2 says the
  self subject is created atomically with the account, *so a 200 always carries
  at least one subject; its absence is a defect.*
- A **400 without `attemptsLeft`** is a permanent failure. It used to default to
  `0`, and **the store reads 0 as exhausted** — *a patient's FIRST wrong digit
  would have told them they had used all five attempts and spent the challenge.*
  The field is declared on this response, so its absence is a server defect and
  is named like every other one **rather than guessed into the harshest possible
  meaning.**

**Nothing here retries.** *A verification is a conversation, not a queued write:
retrying a code submission behind the patient's back could spend their attempts
on their behalf, which is the one thing the attempt budget exists to prevent.*

> The `session` token is **not stored** by this build (TD-1). Closing the app
> signs out, honestly.

### `PATCH /v1/me` — `IdentityPort.updateMe`

```
→ { name?, districtId? }
← 200
← 400 { error: "invalid_district" }
```

**Both fields go in one call**, because the contract takes both and *an account
with a name and no district is one that cannot make a request* — two calls would
leave exactly that state if the second failed.

`invalid_district` is a **real possibility, not defensive coding**: the district
list this build ships is **bundled** (TD-17) and is not the server's coverage
map, so a district the client accepted can still be one the server does not
serve.

A **failed call is not a refusal** and gets its own intent (`profileSaveFailed`).

### `GET /v1/catalogue/search` — `CataloguePort.search`

```
→ ?q=<normalised query>
← 200 { hits: CatalogueHit[], at: number }

CatalogueHit = { itemId, name, latinName, form, strength,
                 requestable, requiresPrescription, isControlled }
```

The **three clinical flags travel on the row** so a screen never has to ask a
second service before it can refuse — *D42 refuses a controlled item at the
moment it is tapped.*

`at` is **server time the rows were produced**, shown as age when served from
cache.

Every row passes `isHit` — **all three booleans required by `typeof`**, because
*absent is not false*. See `10-clinical-safety.md` §4.

This is the **only cached endpoint**, and a superseded search is **aborted**
rather than merely ignored.

### `POST /v1/requests` — via the outbox

```
→ { subjectId, urgency, districtId,
    lines: [{ itemId, packs, prescriptionImageId }] }
   Idempotency-Key: <client-minted, stable across retries>
← 201 { request, windowEndsAt, branchesAsked }
```

**`windowEndsAt` comes from the server.** D09 fixes three windows and **the
client does not compute which one applies** — it reads the field, defensively:
*absent means the watch has no end it can trust.*

The `requestId` in the body is **the only handle the app will ever have** on what
it just created; dropping it meant *R7 counted zero offers forever.*

### `GET /v1/requests/{id}` — `RequestsPort.read`

```
← 200 { responders: { asked, replied, thinking }, offers: Offer[] }
```

`responders` is the contract's own breakdown and **R7 needs all three**:

> A patient watching a countdown wants to know how many pharmacies are **still
> thinking**, not only how many have answered. A screen that shows «٢ ردّوا»
> without «٣ لسه يفكرون» reads as though the answers have stopped.

**Not cached, deliberately.** *An offer is a live commitment with a price and a
state, and showing a stale one would tell a patient a pharmacy is holding
something it has withdrawn.*

Guarded per offer, per line and per answer. A line whose answer cannot be read is
**dropped** rather than guessed — *an offer that loses a line is visibly partial
(R8 draws «يغطي ٢ من ٣»), whereas an offer with an unreadable line silently
misrepresents what is being promised.*

`honoured` is the **one** field allowed to be absent (D11 — `null` when there are
too few samples). Absent and null mean the same thing, and `normalise()` makes it
explicitly `null` so nothing downstream distinguishes "no band" from "field
missing".

### `POST /v1/offers/{id}/accept` — `MarketplacePort.accept`

```
→ { acceptedLineIds: string[], substitutionAcknowledged: boolean }
   Idempotency-Key: <minted by the reducer that decided to accept>
← 201 { reservation, childRequestId? }
← 409 { error: "offer_withdrawn" }
← 409 { error: "offer_expired" }
← 400 { error: "substitution_not_acknowledged" }
← 404 { error: "not_found_or_not_yours" }
```

**`acceptedLineIds` carries the consent decisions**: a substitution the patient
refused is simply **not in it** (D06 sends that line to a child request).

**The two 409s are separate variants** because they are separate things to a
patient: *a pharmacy took the offer back, or the patient took too long*, and R8's
error state names which. A port that collapsed them would make that impossible.

**The response order matters, and it was wrong the other way round:**

> **A reservation in the body IS the answer, whatever the status.** 409 is three
> different things on this endpoint: `offer_withdrawn`, `offer_expired`, and a
> **REPLAY** — the contract's third rule says a repeated state-changing call
> returns the original result, and the transport classifies every 409 as a
> duplicate. Reading the status alone cannot tell them apart, so **the body
> decides**: a hold means a hold happened, and only its absence makes this a
> refusal.
>
> Checking `duplicate` first turned a withdrawn offer into an unreadable
> reservation.

**A success with a body that cannot be read is a failure**, deliberately: *the
hold exists at the pharmacy and the patient has no code for it. Saying so is the
only honest answer available.*

The reservation guard refuses a hold missing **any** field, and a hold **line**
missing any field refuses the **whole hold** — *a line dropped here would be
medicine the patient paid for and does not see listed.*

### `POST /v1/prescriptions` — `MediaPort.upload`

```
→ multipart: image (bytes) + subjectId
← 201 { imageId }
← 413 { error: "too_large" }
← 415 { error: "unsupported_type" }
```

**The port takes a local uri, not bytes** — *turning a uri into bytes is a
platform question: a `blob:` url in a browser and a `file://` path on a device
are read differently, and neither is the store's business.*

**Content-type is deliberately not set** — the platform writes it with the
multipart boundary it generated, and a hand-written header without that boundary
produces a body no server can parse.

The two refusals are kept apart because *a photograph that is too big can be
taken again smaller, and one in a format nobody accepts cannot.*

A **201 with no `imageId`** is a failure: *the draft would attach `undefined` and
the request would carry a prescription that does not exist.*

An **unreadable local uri is permanent**, not transient: *retrying will not make
the uri resolve.*

---

## 4. Transport classification

`@dawai/net` `classify(status)` — applied **identically to every response by the
one transport**, so a 409 is a duplicate everywhere and never a failure somewhere.

| Status | Outcome | Meaning |
|---|---|---|
| 2xx | `accepted` | |
| **409** | **`duplicate`** | **Success** — the earlier attempt landed |
| 408, 425, 429 | `transient` | Worth retrying |
| 5xx | `transient` | Worth retrying |
| anything else | `permanent` | The server understood and refused |
| no status (network) | `transient` | *A phone walking out of coverage is normal operation in this product* |
| aborted | `permanent`, reason `CANCELLED` | **Not** a network failure — *retrying something the caller deliberately abandoned is the transport overruling it* |

Retry policy: **6 attempts, 1 s base, 60 s cap, exponential with full jitter.**

---

## 5. Contract-shaped failures worth naming

Every one of these was a real bug, and each is now a named permanent failure
rather than a guess:

| Response | Old behaviour | Now |
|---|---|---|
| 202 with no `challengeId` | Treated as retryable | **Permanent** — `"202 without challengeId"` |
| 200 with no account/subject | Crash or undefined | **Permanent** — `"200 without account/subject"` |
| 400 with no `attemptsLeft` | Defaulted to `0` → **told the patient they were locked out on the first wrong digit** | **Permanent** — `"400 without attemptsLeft"` |
| 201 with no `imageId` | Attached `undefined` | **Permanent** — `"201_without_imageId"` |
| 2xx with an unreadable reservation | Silent | **Permanent** — `"unreadable_reservation"` |
| Catalogue row missing a clinical flag | **Gated ALLOWED** | **Row dropped** |
| Offer line with an unreadable answer | Rendered `undefined` | **Line dropped** |

---

## 6. The two contract contradictions

### TD-20 — `POST /v1/requests/{id}/cancel` vs the §6 Request machine

The endpoint is declared (200 `{ request }`, 404, 409 `already_accepted`). A
patient on R7 is in `broadcast` or `answered`. **The Request machine has no
outgoing edge for a cancellation from either.** Its only two are
`cancelFromOutbox` (queued → draft — a request that never left the device) and
`abandon` (from `unanswered` or `partially_filled`).

The domain model agrees with the machine and **not** the endpoint: it lists eight
Request states and the producer of each, and **no state is produced by that
route.**

> It cannot be built: calling the endpoint would return a request in a state the
> client has no edge to reach, and adding that edge is **inventing a state
> transition**, which Rule 5 and the forbidden list both refuse. **This is not a
> gap in the Blueprint but a contradiction between two frozen documents**, and it
> needs one of them to move: either §6 gains the transition, or §4 R7 loses the
> control.

Meanwhile R7's «ألغِ الطلب» **states an outcome and produces none**, on a live
request other people are working on.

### BD-10 — routing rule 5 vs Phase 0's scope

Routing rule 5 excludes a branch that marked an item "not carried", and P7 offers
it as a decline reason — **but the stock module was removed from Phase 0, so
nothing persists the mark.** Rule 5 is documented and unimplementable; the decline
reason is recorded on `offer_lines` only.

---

## 7. Contract testing

Release pipeline **Stage 2 — Contract**: contract tests against the model in
`docs/technical/`, and **an undeclared response field fails the build.**

`docs/technical/validate.mjs` runs 11 architecture checks (V1–V11) that verify
the model is internally consistent: every event has a producer and consumers,
every endpoint maps to a service, every entity has a table, every gap is
recorded. `.github/workflows/technical-architecture.yml` runs it, and **all 11
must pass.**

In `platform/`, the client-side equivalent is the **port type**: adding a
response variant that the contract does not declare requires editing `ports.ts`,
where the declared list is written out in the docblock beside it — which is
exactly the review moment that catches an invented response.
