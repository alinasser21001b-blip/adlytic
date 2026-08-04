# 09 — Permissions

Authority, scopes, the four enforcement rules, the permission matrices, role
isolation and session security.

---

## 1. The four enforcement rules (§5)

Everything about permissions in this system reduces to four rules. Learn them in
this form; they are quoted almost verbatim in half a dozen files.

### Rule 1 — Hidden UI is not a permission. The client enforces nothing.

A guard exists so a user is not shown a door that will be slammed. **The server
refuses regardless.** Three places state this:

- `packages/navigation/src/guards.ts` — in its own docblock.
- `apps/patient/src/app/store.ts` `doSend` — re-runs the guard **at the action**,
  because "a screen opened while permitted may be acted on after the grant was
  revoked, and the disabled button is a courtesy, not a control".
- `apps/patient/src/ports.ts` on `accept()` — "the server refuses without it —
  the client's gate is a courtesy, the server's is the control".

### Rule 2 — Authority is checked **where the work happens**.

Not at the gateway. `api-gateway`'s forbidden list is explicit: *"Perform the
authority check itself — authority is checked where the work happens (§5 rule 2)"*
is a **prohibition on the gateway**. The gateway checks token audience; the owning
service checks authority.

Each permission is enforced in **exactly one layer** — the owning service.

### Rule 3 — A missing relationship and a forbidden one are indistinguishable.

One refusal, `NOT_FOUND_OR_NOT_YOURS`, for both.

> v1's family endpoint **became an identity oracle** by returning 403 where it
> should have returned 404.

The test that holds it: *"A request for another account's subject returns
byte-identical output to a request for a subject that does not exist."*

### Rule 4 — Least privilege wins on ambiguity.

Where several relationships could apply, the **narrowest sufficient** one is
used — **never the first found**.

---

## 2. The single authority question

There is exactly **one** function, and it has exactly **one** refusal.

```ts
authorise(
  relationships: Relationship[],
  account: AccountId,
  subject: SubjectId,
  need: Scope,
  subjectFacts: { memorialised: boolean },
): Result<Relationship, Refusal>
```

**Every clinical call resolves this one question: may principal P act on subject
S at scope X.**

### Scopes

```
view  (rank 1)
order (rank 2)
```

Ordered and additive. **There is no `confirm` scope in Phase 0**, because there
are no dose events to confirm (§10 change 1). The database enforces it:
`peer_grants.scope ∈ {view, order}`.

### Relationships

| Kind | Satisfies | Narrowness |
|---|---|---|
| `peer(view)` | `view` only | 1 (narrowest) |
| `peer(order)` | `view`, `order` | 2 |
| `guardian` | any scope | 10 |
| `self` | any scope | 20 (widest) |

### The algorithm

1. Filter to relationships matching **this** account **and** subject.
2. Keep the **sufficient** ones (`self`/`guardian` always; `peer` only if
   `RANK[scope] >= RANK[need]`).
3. None → **`NOT_FOUND_OR_NOT_YOURS`**.
4. Sort by narrowness ascending and take the first (**Rule 4**).
5. **D04** — if the subject is memorialised and the need is `order` →
   `SUBJECT_MEMORIALISED`. `view` stays open for existing grant holders.

`identity-service`'s forbidden list adds: **never return a boolean for
authority** — it throws (server-side) or returns a `Result` (in the domain), so a
caller cannot forget to handle it.

---

## 3. How the client asks

The store **never derives a permission** (§5 rule 2). It receives an `Authority`
value on every dispatch:

```ts
type Authority = {
  hasOrderScope: boolean            // from the domain's answer, not computed
  activeSubjectMemorialised: boolean
  districtId: string
}
```

Supplied by the composition root (`main/runtime.ts` `authority()`), which calls
`Authority.authorise` for real.

### The one inference the runtime makes, and why it is legitimate

```ts
relationships = [...session.relationships,
                 { kind: "self", account: verified.account, subject: verified.subject }]
```

Justified by a **domain-model invariant, not a guess**:

> §9 — an Account always owns exactly one self Subject, created **ATOMICALLY**
> with it by `POST /v1/auth/verify`. The relationship exists the instant the
> account does, so a client that has just been handed both ids by that endpoint
> **knows** the self relationship holds.
>
> Nothing here bypasses the check; it **supplies the fact the check needs**. If
> the domain refuses — a memorialised subject, for instance (D04) — the refusal
> stands, exactly as it would for a grant that came from a server.

**A grant over someone else's record is NOT inferred.** `GET /v1/me` carries
`grants[]` and no port reads it yet, **so a guardian or a peer still has no order
scope in this build.**

Until a session exists there are no relationships, so `authorise` refuses and the
app has view-only authority — **which is exactly what a guest is**, and what
sends them to E4 at the first action that needs an account (D26).

---

## 4. Guest as a first-class state (D26)

A guest is not an unauthenticated error. It is a modelled session state.

| Guest may | Guest may not |
|---|---|
| Browse (F1) | Send a request (R6) |
| Search (F2) | Reserve (V1) |
| See catalogue detail | See a reservation (V2) |
| **Assemble a draft request** (see the caveat) | Anything with `requireSession` |

**§3.1:** the account is requested at the **first action that requires one, with
the reason stated** — never as a wall on launch.

> **The unresolved contradiction — TD-24.** The Blueprint gives R1 the guards
> `requireSession · requireOrderScope · blockMemorialised`, but §3.1 forbids a
> sign-in wall and D26 preserves the interrupted work — and E4 is drawn showing a
> draft that **only a guest could have built**. Both cannot hold. Today
> `addItem` calls `navigate` rather than `open`, so R1's guards are never asked,
> and **that bypass is the only reason the product works end to end.** A guard
> that one path enforces and another does not **is not a guard** (§5 rule 1).
> Resolution requires one of two frozen documents to move.

---

## 5. The permission matrices

Blueprint v3 §5 declares four matrices. Their load-bearing rows:

### Clinical matrix

| Principal | Dispense history | Prescription image | Write clinical |
|---|---|---|---|
| Self subject | ✅ | ✅ own | via collection only |
| Guardian of a managed subject | ✅ | ✅ | via collection only |
| Peer, `view` | ✅ | ✅ | ❌ |
| Peer, `order` | ✅ | ✅ | ❌ |
| **Pharmacy staff** | **❌** | ✅ **only while their reservation is live** (D18) | ❌ |
| **Operator** | ❌ outside a consented session (O19) | ❌ | **❌ no mechanism exists** |
| Memorialised subject | `view` ✅ · `order` ❌ | | |

The declared test: *"Every cell is exercised, positive and negative. **A
pharmacist reading a dispense history fails.**"*

**D17** — allergies are removed from Phase 0 **entirely, including from the
permission matrix**. There is no row for them because there is no data.

### Marketplace matrix

| Rule | Enforcement |
|---|---|
| **A branch may not see requester identity before acceptance** | The projection **does not contain it, so it cannot leak — it is not there** |
| After acceptance, the branch sees **the first name only** | `firstNameOnly()`, promised on E4, shown on E7 |
| No price is visible outside an offer made to this patient | **D08** — there is no public price anywhere |

Declared test: *"**No branch-facing response body contains a patient name or
phone, at any endpoint, in any state.**"*

### Branch configuration matrix (D32)

| Role | Answer requests | Confirm holds | Propose substitution | Branch settings |
|---|---|---|---|---|
| `assistant` | ✅ | **✅** | ❌ **control absent** | read-only |
| `pharmacist` (verified licence) | ✅ | ✅ | **✅** | read-only |
| `manager` | ✅ | ✅ | only if also a verified pharmacist | ✅ |

**The row v1 got wrong, and the test that names it:** *"An assistant confirming a
reservation **SUCCEEDS** — this is the row v1 got wrong."*

**D19:** confirming a hold is **commercial**; proposing a substitution is
**clinical**.

> v1 required a pharmacist for every confirmation, which no real Iraqi pharmacy
> could honour on an evening shift — **producing an audit log full of
> attestations that were routinely false, which is worse than no control.**

**Structural rule:** at least one active manager per branch;
`LAST_MANAGER_CANNOT_BE_REMOVED` (§10 change 5).

### Platform matrix

**What the operator cannot do**, from `owner-console`'s forbidden list:

- Write into a clinical record — **no mechanism exists**.
- Read identified clinical data outside a **consented** support session (O19).
- **Modify the audit log** — no principal, including the operator, holds UPDATE
  or DELETE on `audit_entries`.
- Broadcast, bulk-export or grant roles — **absent in Phase 0** (**D20**: no
  two-person controls, *because Phase 0 has no action that needs one*).

> **BD-5, blocker.** The consented support session (O19) has a screen and rules
> but **no entity, no state machine and no consent-capture surface on the patient
> side.** An endpoint stub returns `awaitingConsent`. O19 cannot be built.

---

## 6. Role isolation

> **Role isolation is achieved by shipping different navigators, not by branching
> inside one.** A patient build contains no pharmacy route, so the class of leak
> that v1 hit twice is **unrepresentable**.

Enforced at three levels:

1. **Bundle** — an import check per artifact at release: the patient bundle
   contains no pharmacy or operator route; the pharmacy bundle, inverted.
2. **Token** — access tokens are **audience-scoped to one persona**. The gateway
   *"rejects a token whose audience does not match the endpoint's persona"*. A
   patient token is rejected at a pharmacy endpoint.
3. **Contract** — `ScreenContract.persona` makes it visible in the declaration
   itself.

Each client's forbidden list also says it in words: *"Contain any pharmacy or
operator screen"* / *"Contain any patient or operator screen"*.

---

## 7. Authentication

| Principal | Mechanism | Notes |
|---|---|---|
| Patient / applicant | **Phone + one-time code** | **No password exists, so none can leak** |
| Pharmacy staff | Account session **+ per-person branch PIN** | The PIN identifies **who acted**; the session proves the device. **30-minute idle timeout** because the counter device is shared |
| Operator | A separate credential set | **No shared account with any patient or staff identity** |
| Device binding | A refresh token is bound to a device identifier | A mismatch **forces re-verification** |

### Sessions

| Token | Property |
|---|---|
| Access | Short-lived, **audience-scoped to one persona** |
| Refresh | **Device-bound, rotated on use**, revoked on sign-out and on phone change |
| Staff | 30-minute idle timeout |
| Sign-out | **Destroys the local encryption key, and therefore the entire clinical cache** (D28) |

> **Not implemented in `platform/` — TD-1.** `POST /v1/auth/verify` answers with a
> `session` alongside the account, and nothing models or stores that token yet.
> The composition root says so explicitly and refuses to fake it: *"writing an
> account id to disk and treating a later launch as signed in would be the app
> claiming an authenticated session it does not hold. **Closing the app signs
> out, honestly**, until there is a token to keep."*

---

## 8. Device and data protection

| Concern | Rule | Reference |
|---|---|---|
| Local cache | Subjects, active reservations, dispense history and viewed catalogue items, encrypted with an **OS-backed key** | D28 |
| Shared phone | **One account per phone is the model**, so a household cache is expected — **sign-out is the boundary** | D03 · D28 |
| Biometrics | **None in Phase 0** — removed with the other premium OS capabilities | D35 |
| In transit | TLS everywhere, **including between services** | |
| Prescription images | Encrypted at rest; **the key reference is stored apart from the object** | §2 |
| Phone numbers | **Hashed for lookup, encrypted for display** — the hash is what indexes | D03 |
| Audit payloads | **A digest, not the content** — the audit records that a read happened, never what was read | audit-service forbidden list |
| Location | **A district is stored. A GPS coordinate never is, and no location history exists** | D29 |
| Search | **Only terms that matched nothing** are retained | D29 |
| Prescription access | Time-bounded to a live reservation; revoked on resolution | D18 |

The browser build carries the location rule into an HTTP header:
`Permissions-Policy: camera=(self), geolocation=(), microphone=()` — *"geolocation
stays denied: the product asks for a district rather than reading where anyone
is."*

---

## 9. Idempotency and abuse

- **Every state-changing call carries an idempotency key**, enforced at the
  gateway (D27). The client mints it **once, at enqueue** — *"a key minted inside
  a transport would be new on every call and every retry would be a second
  acceptance."*
- Rate limits **per account and per branch** (§8 abuse table).
- The gateway emits an **audit envelope for every request that touches identified
  data**.

---

## 10. Permission gaps

| Gap | Severity | Effect |
|---|---|---|
| **BD-5** | blocker | O19's consented support session has no entity, no machine and **no patient-side consent surface**. The operator's only legitimate route to identified clinical data cannot be built |
| **BD-6** | major | Invites live inside other machines with no entity, so an invite **cannot be listed, resent or cancelled** |
| **TD-24** | high | R1's declared guards and §3.1 contradict each other; the implementation resolves it by **walking around the guard** |
| **TD-1** | critical | No server-side authorization exists in `platform/` at all. Every permission here is a *client courtesy* until a backend enforces it |

That last row is the one to keep in mind: today, **every permission statement in
this document is a design, not a running control**, for the `platform/` track.
`dawai-platform/` does enforce role and ownership server-side — see
`02-architecture.md` §8.
