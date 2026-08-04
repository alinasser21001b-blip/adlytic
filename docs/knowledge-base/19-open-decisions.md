# 19 — Open decisions

Decisions that are **not engineering's to make**, stated with enough context that
whoever owns them can decide without re-deriving anything.

Each entry names: the question, why it is open, what depends on it, the options
with their consequences, and a recommendation where engineering has one.

---

## 1. 🔴 Which Dawai is the product? — the two-track question

**Owner: product leadership. Nothing else on this list matters as much.**

### The question

This repository contains two complete, non-interoperating implementations of
Dawai. Which one is the product, and what happens to the other?

| | `platform/` | `dawai-platform/` |
|---|---|---|
| Spec | **Blueprint v3 (frozen)** | v1 blueprint + a later clinical wave |
| Identity | `Account` / `Subject` / `Guardianship` / `PeerGrant` | `users` with roles `PATIENT`/`PHARMACY`/`ADMIN` |
| Auth | **Phone + OTP** — *no password exists, so none can leak* | Email + Argon2id password |
| Entities | `Request`/`RequestLine`/`Offer`/`OfferLine`/`Reservation` | `medicine_requests`/`dispatches`/`pharmacy_offers`/`reservations` |
| Clinical posture | **D16: no interaction checking, and says so in the product** | **A severity-tiered interaction engine** (migrations 0005–0007) |
| Dose events | **None** — §10 change 1 removed the `confirm` scope *because there are none* | Dose schedules and dose events exist |
| Backend | **None** (TD-1) | Hono + PostgreSQL, sessions, worker, encrypted storage |
| Architecture gates | **9 checkers + negative tests + measured contrast + derived nav graph** | None of these |
| Deployment | **The live preview URL** (root `netlify.toml` → `base = "platform"`) | `Dockerfile`, `fly.toml`, `render.yaml` |
| Activity | **The last ~15 commits** | Earlier |

### Why it is open

These are **not two views of one system.** They use different entity names,
different authentication, and in one place **directly contradicting clinical
policy**: Blueprint v3's §7 argues that a partial check a user believes is
complete is *more dangerous than a stated absence*, and `dawai-platform`'s
migrations 0005–0007 build exactly the check D16 removed.

Merging them is not a refactor. It is a product decision about which model of
identity, which authentication, and which clinical posture Dawai has.

### What depends on it

Everything. Every hour spent on either track is an hour that may be discarded.
`platform/` cannot ship without a backend; `dawai-platform/` cannot ship
Blueprint v3's product. **Both are blocked, on different things, and the
resolution to each is the other's existence.**

### Options

| Option | Consequence |
|---|---|
| **A. `platform/` is the product; build its backend** | Keeps Blueprint v3, the identity model, the gates and the design system. Costs a backend build. `dawai-platform`'s server patterns — encrypted object storage with magic-byte inspection and EXIF stripping, the notification outbox, the lifecycle worker, idempotency and rate-limit middleware, PGlite for zero-setup dev — are **directly reusable** |
| **B. `dawai-platform/` is the product; retro-fit Blueprint v3** | Keeps a running backend. Costs an identity-model migration (`users` → `Account`/`Subject`/`Guardianship`), an auth change, a clinical-policy reversal, and **loses every architecture gate** unless they are ported |
| **C. Both, for different markets** | Two products, two teams, twice the maintenance. Nothing in the repository supports this |
| **D. Neither; a third** | Discards both. Not recommended |

### Engineering's recommendation

**Option A.** The reasoning is narrow and does not depend on preference:

1. **The clinical contradiction only resolves one way.** D16's argument is a
   safety argument. Adopting `dawai-platform`'s interaction engine means arguing
   the opposite in a document that is currently frozen.
2. **The identity model is the harder half, and `platform/` has it.** `Account`
   vs `Subject` exists because *v1 could not represent its own primary persona*.
   Retro-fitting it into a `users`-with-roles schema is a migration of every
   clinical row.
3. **A backend is a known quantity; the gates are not.** Ports of
   `trace-check`, `layer-check`, `ux-check`, measured contrast and the derived
   navigation graph into an existing codebase are each a project.
4. **The deployed URL already serves `platform/`.**

### What is needed to decide

A ruling on: (a) does Phase 0 perform interaction checking — **yes or no**;
(b) is authentication phone+OTP or email+password; (c) is the identity model
Account/Subject or users-with-roles. **Any one of the three settles it.**

---

## 2. 🔴 `POST /v1/requests/{id}/cancel` vs the §6 Request machine — TD-20

**Owner: product + technical architecture. Two frozen documents disagree.**

### The question

Can a patient cancel a request that has already been broadcast?

### Why it is open

- **§4 R7** declares the control «ألغِ الطلب», and the API model declares
  `POST /v1/requests/{id}/cancel` → 200 `{ request }`, 404, 409 `already_accepted`.
- **§6's Request machine has no outgoing edge for a cancellation** from
  `broadcast` or `answered`. Its only two are `cancelFromOutbox` (queued → draft
  — a request that never left the device) and `abandon` (from `unanswered` or
  `partially_filled`).
- **The domain model agrees with the machine, not the endpoint:** it lists eight
  Request states and the producer of each, and no state is produced by that route.

Calling the endpoint would return a request in a state the client has no edge to
reach. **Adding the edge is inventing a state transition, which Rule 5 refuses.**

### What depends on it

Today «ألغِ الطلب» **states an outcome and produces none**, on a live request
other people are working on. A patient who wants to stop a request believes they
have.

### Options

| Option | Consequence |
|---|---|
| **A. §6 gains `broadcast/answered --cancel--> closed`** | The control works. Pharmacies that have already answered must be told; `offer.sent` responses become moot mid-flight. Needs a new event or a reuse of `request.unanswered` |
| **B. §4 R7 loses the control** | Nothing to build. The patient's only exit from a live request is to leave the screen and let the window elapse — **which today never happens (TD-23)**, so B requires TD-23 to be resolved first |
| **C. Reinterpret it as "stop notifying me"** | The request stays live for the pharmacies; the patient stops being told. Honest, small, and needs new copy — the control cannot keep saying «ألغِ» |

Engineering has **no recommendation** — this is a promise to a patient, not a
technical choice. Note only that **B and C both depend on TD-23**, because a
patient with no cancel and no window end has no exit at all.

---

## 3. 🔴 R1's guards vs §3.1 and D26 — TD-24

**Owner: product. Two frozen sections contradict each other.**

### The question

Can a **guest** assemble a draft request?

- **§4** gives R1 the permission *"authenticated, subject with Order scope or self
  or guardian"* and the guards `requireSession · requireOrderScope ·
  blockMemorialised`.
- **§3.1** forbids a sign-in wall and requests the account **at the first action
  that needs one**.
- **D26** preserves the interrupted work, and **E4 is drawn showing
  «طلبك محفوظ: أموكسيسيلين + باراسيتامول» — a draft only a guest could have
  built.**

**If R1 needs a session, no guest can assemble the request E4 promises to keep.**

### Current state

`addItem` calls `navigate` rather than `open`, so R1's guards are never asked.
**That bypass is the only reason the product works end to end** — and it is
visible: R2's «اكتب الاسم بدال الصورة» goes through the declared exit, *does* run
the guards, and sends a guest to sign in by a control that offered to let them
type instead.

### Options

| Option | Consequence |
|---|---|
| **A. R1 loses `requireSession`** | Matches §3.1, D26 and E4's drawing. The guard moves to R6 (send), where it already is. **Smallest change, and it makes the existing behaviour honest** |
| **B. §3.1 and D26 say where a guest assembles a draft instead** | A pre-account draft screen the Blueprint does not currently have |
| **C. Keep both and formalise the bypass** | **Rejected by engineering.** A guard that one path enforces and another does not is not a guard (§5 rule 1) |

**Recommendation: A.** It is what the drawn product already does; the guard list
is what is out of step.

---

## 4. 🟠 R11's design — TD-23

**Owner: design.** Design package entry: **«OPEN to the designer: Everything. Not
rendered.»**

R11 is the honest empty case — *nobody answered.* Without it:

- Nothing fires `windowElapsed`, so a request stays `broadcast` forever;
- R7's promise («إذا خلصت بدون رد، نكلّك الصدك ونقترح شنو تسوي») **is not kept**;
- `widen` (R11's primary) and `request.unanswered` have no surface.

**Required to unblock**: R11 drawn, with its three declared exits (widen → R7,
watch → R12, later → S1). The machine edge and the event already exist.

---

## 5. 🟠 The daylight palette — TD-10

**Owner: design.** Night Mint is dark-only. `patientLight` aliases `patientDark`
so nothing renders half-designed — **and that means the contrast gate cannot
catch a light-scheme regression.**

Also open in the same delivery:

- **R-5** — is `success` distinct from `accent`? Design did not distinguish them,
  and the delivery uses mint for "replied — offer arrived". **Held equal rather
  than invented.**
- **TD-11** — V2's caption ships at `#63726B` because the delivered `#6B7A74`
  measures 4.10:1, below the 4.5 floor, on the screen that must never fail.
  **Reverts on confirmation of a replacement.**
- **`alert` was inverted** from the delivery, because Design's alert is a
  *ground* and the role system is text-on-surface. **Flagged in the handoff.**

---

## 6. 🟠 What a composite card announces — TD-12

**Owner: product + design + a native Iraqi Arabic speaker.**

An R8 offer card currently reads as «افتح عرض صيدلية الرشيد» alone. The price,
the coverage, the substitution flag, the distance and the honoured band are
**rendered and silent**.

> What an offer card should announce, **in which order, in Iraqi Arabic**, is a
> content decision. §25 and the Blueprint state no spoken-content rule for a
> composite card, **so implementation must not invent one.**

**Required to unblock**: a spoken-content rule for composite cards — which fields,
in which order, and how to word coverage and the honoured band aloud.

---

## 7. 🟠 Cancelling an in-flight write — TD-13

**Owner: product** (§21 · D27 · R13).

A `POST` that may already have been accepted cannot simply be dropped. The honest
options **differ in what the patient is promised**:

| Option | Promise |
|---|---|
| **A. Refuse visibly while sending** | "You can cancel until it starts sending." Simple, honest, and **the engineering half is unblocked**: a function that can refuse must *say so* rather than returning its input |
| **B. Cancel and reconcile against the idempotency key** | "You can cancel any time." Needs a server-side cancel-by-key and a reconciliation path |

Note the split: **A's engineering half is not blocked.** `cancel` returning its
input unchanged is a defect regardless of which promise is chosen.

---

## 8. 🟠 What a screen shows when its state is gone — TD-15

**Owner: product.**

V2 without a reservation, R9 without an offer, R3 without a capture. §4 V2 says
the reservation lives on Today, **but that is back behaviour, not a fallback.**

Becomes reachable **the moment S1 lands**, and through D26's replay of a pending
screen — both ordinary paths.

**No redirect was invented.** The `Placeholder` is honest about the failure and is
still a screen nobody designed.

---

## 9. 🟠 Inert declared controls — TD-14

**Owner: product + platform.**

V2's «الاتجاهات» and «اتصال بالصيدلية» are declared and do nothing, because there
is no maps handoff and no dialer.

| Option | Consequence |
|---|---|
| **A. Wire them** | Needs a device build (TD-1) |
| **B. Disable with a stated reason** | Honest today; §23 requires the reason |
| **C. Drop them until a device build exists** | Changes the contract, which changes the Blueprint |

**A general question sits underneath this one:** what should the product do with
a declared control whose *capability* — not whose screen — does not exist?
`isBuilt` cannot express it, because a dialer is not a screen.

---

## 10. 🟡 A ceiling on packs per line — TD-16

**Owner: product.** `Marketplace.packs` accepts **1,000,000, verified by probe.**

§2 fixes maximum *lines* at 8. **Blueprint v3 does not state a maximum quantity
per line**, and *any ceiling chosen here would be an invented business rule.*

Consequence is bounded: a pharmacy receives an absurd request and refuses it —
**a pharmacist's attention rather than a patient's safety.**

**Needed: one number.** It then belongs beside `MAX_REQUEST_LINES` in
`marketplace/rules.ts`.

---

## 11. 🟡 The district coverage list — TD-17

**Owner: product.** The bundled list is four Baghdad districts with three marked
covered — *the four E8 has been drawn and reviewed against since it was
designed.*

The **shape** is the Blueprint's (bundled, location never requested, an uncovered
district shown honestly rather than hidden — E12). **The contents are not a claim
product has made.**

*Nothing in the app hard-codes an id from the list and the real one replaces the
file wholesale, so this cannot leak into logic.* It does mean a patient in a
served district may not find it.

---

## 12. 🟡 E8's failure sentence — TD-25

**Owner: copy.** Needs one sentence for «ما كدرنا نحفظ — جرّب مرة ثانية».

Today the control returns from busy and **says nothing**, because the only
alternative available without a decision was worse: the first version answered a
dropped connection with `DISTRICT_REQUIRED` — *telling a patient who did choose a
district that they had not.*

---

## 13. 🟡 The Iraqi dialect — TD-22

**Owner: the person who wrote the original copy.**

The four CLDR plural categories are implemented and every counted string selects
through them. **What is not verified is the dialect.** Three worth a second pair
of eyes: the dual «دوائين», the non-human plural agreement in «٣ أدوية تحتاج
وصفة», and «اثنين غيرهم» on the outbox label.

*Strictly better than what shipped, and not yet confirmed. The risk is a phrase
that reads as slightly formal rather than one that misinforms.*

---

## 14. The eleven Blueprint gaps (BD-1 … BD-11)

Recorded in the frozen technical model with the exact question each needs
answered. **Four are blockers.**

| Gap | Question that must be answered |
|---|---|
| **BD-1** 🔴 | Is a **saved pharmacy** per Account or per Subject? Capped? Does it survive branch closure? |
| **BD-2** 🔴 | What is a **price dispute's** lifecycle? Can a branch respond? Does it resolve, or only accumulate? **Does it affect the honoured rate, which D11 defines without it?** |
| **BD-3** 🔴 | **Support ticket** lifecycle, who may read one, whether a patient ticket may reference a subject, and retention |
| **BD-5** 🔴 | Which patient screen shows the **support-session consent** prompt? How long is it time-boxed? What does the banner appear on? **What happens if the user is offline?** |
| **BD-4** 🟠 | **Unmatched search** retention period, whether a term is linked to an account, how it is aggregated. *Until answered, **D29's retention promise is unverifiable**.* |
| **BD-6** 🟠 | Can an **invite** be resent? Cancelled? How many are allowed? **Does resending extend the 7-day expiry?** |
| **BD-7** 🟠 | **Export** format, link expiry, whether the artifact is retained, **whether an export appears in the access log** |
| **BD-8** 🟠 | **One device or many** per account? What happens when a token is invalidated? **Is there a fallback when push is refused** — the app is usable without it, but nothing says what replaces the alert |
| **BD-10** 🟠 | Is **"not carried"** a persistent branch-level fact, or only a one-off decline reason? If persistent, where does a branch un-mark it, given K9 was removed? |
| **BD-11** 🟡 | Does an observed-availability count of **zero** mean "nobody has it" or "nobody has been asked"? *§13 of v1 insisted these are different; v3's §8 does not carry the distinction forward* |
| **BD-9** ✅ | *None.* The outbox is correctly absent from the ERD because it is client-side only. **Closed by explanation, not by a decision** |

---

## 15. Decision-making protocol

The pattern this project already follows, and should keep following:

1. **State the contradiction precisely**, naming both documents and both
   sections. TD-20 does this in three sentences.
2. **Do not resolve it in code.** *Fixing the symptom would mean weakening a rule
   to make code pass rather than resolving the contradiction* (TD-24).
3. **Register it** with the impact on a **user**, not on the build.
4. **State what would unblock it** — not "needs design" but *"needs a
   spoken-content decision for composite cards"*.
5. **Record corrections rather than overwriting them.** TD-20 carries two.
6. **When it is answered, the answer goes in the code as a comment with its
   reason**, and the item moves to `RESOLVED` with how. TD-18 is the model:
   *"which comes first was stated nowhere, and product answered: the name and the
   district first."*
