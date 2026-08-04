# 01 — Product vision

---

## 1. The one-sentence version

**Dawai tells a patient which nearby pharmacy has their medicine and holds it
for them, so they stop making eleven phone calls.**

---

## 2. Who this is actually for

The product's design decisions only make sense once you accept who the median
user is. Blueprint v3 §25 states it plainly, and `packages/design/src/a11y.ts`
repeats it in code:

> the target user is frequently **elderly, low-vision or has a tremor**, and
> this is the **median** user rather than an edge case.

That single sentence produces:

- 44pt minimum touch targets everywhere, 48pt for primary patient actions
  (`tokens/space.ts` — `tap`).
- Nothing clinical below 16pt, enforced by type: `TypeStyle.clinicalAllowed` is
  `false` on `caption`, and `assertClinicalRole()` throws
  (`tokens/type.ts`).
- Every text-on-background pair *measured*, not eyeballed —
  "amber on cream failed at 4.08:1 in the prototype and looked fine"
  (`a11y.ts`). The test measures **84 renderable pairs across 3 personas × 2
  schemes**, plus four extra pairs that live outside a persona palette.
- The reservation code set at **76pt** — the largest thing in the product,
  because it is what a patient holds up at a counter (`tokens/type.ts` `code`).

### The persona the identity model was rebuilt for

The single most far-reaching change from v1 to v3, quoted from
`packages/domain/src/identity/family.ts`:

> This is the change that reaches furthest in the product, because **v1 could
> not represent its own primary persona**: it required an elderly woman who uses
> only WhatsApp to own a smartphone and approve on her own device. Managed
> subjects exist so that the median chronic patient is **representable at all**.

Hence **D01**: an `Account` (who signs in) and a `Subject` (whose medicine it is)
are separate, and a Subject need not ever authenticate. **D03**: one phone, one
Account, many Subjects — the Iraqi household is first-class, not a workaround.

---

## 3. The three experiences and their emotional targets

§25 gives the three apps deliberately opposite targets. The semantic colour
roles are **identical across all three** so a component never knows which persona
it is in — a component that branches on persona is where role isolation starts to
rot (`tokens/color.ts`).

| App | Target | Why | Palette |
|---|---|---|---|
| **Patient** | **Calm** | The user is frightened. Speed only matters *because waiting is frightening.* | "Night Mint" — deep green ground, mint as the only signal colour |
| **Pharmacy** | **Fast** | Used one-handed, at speed, with a customer waiting | Dense, dark, high contrast; 56pt primary targets |
| **Owner** | **Certain** | Decisions about other people's businesses | Neutral, tabular |

---

## 4. The eight product commitments

These are the promises the product makes to its users. Each is enforced
structurally somewhere in the codebase, and the enforcement point is named.

### 4.1 We will never make you sign in before we have given you anything

**§3.1**. A guest browses, searches and assembles a request. The account is
requested at the **first action that requires one, with the reason stated** —
never as a wall on launch. `ROUTE_GUARDS` leaves `F1` and `F2` deliberately
unguarded, and says so in a comment.

E4 is the one hard ask in the whole product, and it is a screen whose entire
purpose is *"explain before the one hard ask"*.

### 4.2 We will never lose what you were doing

**D26**. `@dawai/session`'s `PendingIntent` carries the screen and an opaque
draft through authentication and replays it on the other side. `takePending`
returns the intent *and clears it in one call*, which is what stops a replay
loop and makes "replayed" a fact rather than a flag someone must remember to set.

E4 is drawn showing «طلبك محفوظ: أموكسيسيلين + باراسيتامول» — the request the
guest built, named back to them, before they are asked for anything.

### 4.3 We will never tell you something was sent when it was not

**D27**. `@dawai/offline`'s `describe()` is the **only** function a screen may
use to word an outbox item, so no screen can invent a friendlier word for "not
yet sent". `model/send.ts` returns the request's *machine state* (`queued` or
`broadcast`) rather than a boolean, so the distinction is structural.

### 4.4 We will never show you a countdown for something nobody has committed

The `Reservation` machine's clock starts at `held`. V1 (the moment between
choosing and confirmation) shows **no timer at all**. From
`marketplace/machines.ts`:

> The clock starts HERE and nowhere earlier. A countdown before anyone has
> committed stock counts down to a disappointment.

And §21: countdowns run on **server time, never the device's** — a user changing
their phone clock must not change a reservation. `shared/instant.ts` makes time a
parameter rather than an ambient global so that this is structurally true rather
than a convention.

### 4.5 We will never rank pharmacies, and nobody can pay to be first

**D12**. `Marketplace.route()` returns a boolean and a notification time,
**never a score**. Every eligible branch is asked simultaneously. The patient's
list is ordered by `Offers.forReading()` — coverage, then price, then arrival
order — and it is called `forReading` rather than `rank` because both keys are
printed on every row, so **a patient can check the order themselves**.

**D11** applies the same logic to reliability: it is shown as a **band**
(`trusted` / `new` / `needs_attention`), never a decimal, because a decimal
invites an argument about a number instead of about the behaviour. And a refusal
reported within five minutes of confirming is the honest "sold since" case and
does not count — v1 penalised a structurally guaranteed event.

### 4.6 We will never tell a pharmacy who you are before you have chosen them

§5 marketplace matrix. The branch-facing projection **does not contain patient
identity, so it cannot leak — it is not there.** `patient-app`'s and
`pharmacy-app`'s forbidden lists in `docs/technical/model.js` state this as a
service-level prohibition.

At pickup, a pharmacy sees **the first name only**. E4 promises exactly that
(«تشوف اسمك الأول بس»), and `Onboarding.firstNameOnly()` derives it — so E7 can
*show the patient what will be shared before they submit it*. A promise made on
one screen and kept by a different one is a promise nobody can check.

**D14**: the code is the collection right; identity is not checked at the counter.

### 4.7 We will never claim to have read your prescription

**D18**. Phase 0 performs no OCR, no extraction and no content validation. R3
exists so **the patient** judges legibility, and `LEGIBILITY_CHECKS` tells them
what "clear" means — the drug name, the dose, the doctor's stamp — so they are
not guessing. `media-service`'s forbidden list: "machine-read an image".

The dev server, on receiving a prescription, counts the bytes and discards them,
logging «not stored (D18)».

### 4.8 We will tell a pharmacy why it is not receiving requests

**D13**. A branch is never silently filtered out. `route()` returns an explicit
`RoutingExclusion` reason for every exclusion, and every non-receiving state in
the `BranchEligibility` machine **names itself on the branch home** — which is
why they are *states* rather than a predicate evaluated inside the router. v1
filtered branches out silently and then judged them inactive for not answering.

---

## 5. The v1 → v3 corrections

Blueprint v3 exists because an independent review of v1 found specific, named
failures. Understanding them explains most of the code. The full list is in
`docs/product/review/INDEPENDENT_REVIEW.md`; these are the ones with structural
consequences you will meet immediately:

| v1 failure | v3 answer | Where it lives now |
|---|---|---|
| Could not represent its primary persona — required the patient to own a smartphone | Account/Subject split; managed subjects; guardianship (**D01, D03**) | `identity/family.ts` |
| Family endpoint returned 403 where it should have returned 404, becoming an **identity oracle** | One refusal, `NOT_FOUND_OR_NOT_YOURS`, for both cases (§5 rule 3) | `identity/authority.ts` |
| Required a pharmacist for every confirmation — which no real Iraqi pharmacy could honour on an evening shift, **producing an audit log full of attestations that were routinely false** | Confirming is commercial (any staff); proposing a substitution is clinical (verified pharmacist only) (**D19**) | `clinical/gates.ts` |
| Reliability shown as a decimal, penalising the honest "sold since" case | A band, with a 5-minute grace and a 10-sample minimum (**D11**) | `marketplace/rules.ts` |
| Three contradictory answers to "what happens when the pharmacy is closed" | One rule: a branch opening *inside the window* is routed, with its notification deferred to opening time (**D09**) | `Marketplace.route()` |
| Settled principles, left every load-bearing quantity undefined | Every quantity fixed, once, as an executable constant | `marketplace/rules.ts` |
| Silent branch filtering, then judging branches inactive for not answering | Every exclusion carries a reason and is a visible state (**D13**) | `pharmacy/machines.ts` |
| A substitution shown as a flag on a row and accepted with the offer | Explicit per-line consent, never pre-ticked, blocking acceptance (**§4 R10, D19**) | `model/consent.ts` |
| Interaction checking that was partial and believed complete | Removed entirely from Phase 0, and *said so in the product* (**D16**) | `clinical/gates.ts` |
| Two retention promises that were not actually true | Narrowed to what is true (**D29**): a district is stored, a GPS coordinate never is; only *unmatched* search terms are retained | `catalogue-service` |

---

## 6. What success looks like, and what would falsify the strategy

**Success in Phase 0** is the four exit metrics in §3 clearing their thresholds
in one Baghdad district with human ops support: fill rate, honoured rate, answer
time (median under 15 seconds), and repeat rate.

**The falsifier is D23.** The Phase 0 exit criterion is deliberately chosen to
test *the strategy's riskiest belief* — that a patient who used Dawai once comes
back. If repeat rate fails, the medication-record thesis in §4 of
`00-project-overview.md` is wrong, and Phase 2 must not be built on it. The
decision register is explicit that this gate exists to be *able* to fail.

**What does not count as success:** downloads, session length, engagement.
`notification-service`'s forbidden list contains "send anything for engagement",
and **D31** removed post-pickup ratings. The product measures whether medicine
reached a person, and nothing else.
