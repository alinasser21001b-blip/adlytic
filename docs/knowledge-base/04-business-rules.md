# 04 — Business rules

Every rule, its exact value, where it is enforced, and **why it exists**.

The "why" column is the important one. A rule whose reason is lost gets softened
by the next person who finds it inconvenient.

---

## 1. The decision register — D01 to D43

Blueprint v3 fixes 43 numbered decisions (`docs/product/v3/register.js`). Every
one is quotable in a `@blueprint` tag and `tools/trace-check.mjs` verifies the
reference resolves.

| # | Decision |
|---|---|
| D01 | Account and Subject are separated; a Subject need not authenticate |
| D02 | A family member without an account can be invited |
| D03 | One phone, one Account, many Subjects — the Iraqi household is first-class |
| D04 | Memorialisation is a Subject state with a defined trigger |
| D05 | Deletion is defined exactly, including what survives on the pharmacy side |
| D06 | A Request carries lines; an Offer answers per line; a Reservation covers one branch |
| D07 | The unit of quantity is the pack, defined by the catalogue |
| D08 | The offer price binds for the reservation window; there is no public price anywhere |
| D09 | The request window is a defined duration per urgency, and it drives routing |
| D10 | The area unit is the curated district; branch location is verified during application |
| D11 | Reliability is one number, defined, banded, and forgiving of the honest case |
| D12 | No preferential routing, and no paid placement, ever |
| D13 | A branch is told when and why it is not receiving requests |
| D14 | The code is the collection right; identity is not checked at the counter |
| D15 | A pharmacy has data rights: an access log, an export, and a way to leave |
| D16 | Phase 0 performs no interaction checking, and says so in the product |
| D17 | Allergies are removed from Phase 0 entirely, including from the permission matrix |
| D18 | Prescription-required items cannot be requested without a prescription image |
| D19 | Confirming a hold is commercial; proposing a substitution is clinical |
| D20 | Phase 0 has no two-person controls because it has no actions that need them |
| D21 | Clinical governance authority and the 2am safety path are Phase 3 prerequisites |
| D22 | The record is built from completed pickups; Phase 0 predicts nothing |
| D23 | Phase 0's exit criterion tests the strategy's riskiest belief |
| D24 | Phase 0 is a closed system: it contains everything it needs and references no later phase |
| D25 | The pharmacy application flow exists as screens |
| D26 | Guest is a first-class state in the navigation model |
| D27 | The outbox is a screen |
| D28 | One rule for clinical data on the device |
| D29 | Two retention promises are narrowed to what is actually true |
| D30 | Notify-me is an entity with a lifecycle |
| D31 | Post-pickup ratings are removed; the price dispute is the only signal collected |
| D32 | One permission model, extended to cover branch settings |
| D33 | Ramadan is a scheduling model, not an exception list |
| D34 | Phase 0 is Arabic only; Kurdish is deferred with the schema reserved |
| D35 | Phase 0 depends on no premium OS capability |
| D36 | Arabic copy is gender-neutral by construction |
| D37 | The two highest-stakes strings are rewritten to be unambiguous and blameless |
| D38 | The pharmacy support channel exists as screens |
| D39 | What a pharmacy owes when it confirms and cannot deliver |
| D40 | The launch district is a configuration value, fixed before Phase 0 opens |
| D41 | Phase 0 is scoped so that it does not depend on the regulatory answer |
| D42 | Controlled substances are refused in Phase 0 |
| D43 | Nobody pays in Phase 0 or Phase 1, and nothing is built that assumes revenue |

---

## 2. Every fixed quantity

**All of these live in one file** — `packages/domain/src/marketplace/rules.ts`
(plus identity constants in `family.ts` and `verification.ts`) — precisely so
that no controller ever needs to know what "soon" means.

| Quantity | Value | Constant | Decision | Why this number |
|---|---|---|---|---|
| Urgency `now` window | **20 minutes** | `WINDOW_MS.now` | D09 | The patient is waiting right now |
| Urgency `today` window | **4 hours** | `WINDOW_MS.today` | D09 | The default. Middle of three |
| Urgency `soon` window | **2 days** | `WINDOW_MS.soon` | D09 | Labelled «خلال يومين» — *deliberately not "this week"* |
| Max lines per request | **8** | `MAX_REQUEST_LINES` | §2 Request | More is a shopping list a pharmacist cannot answer at a counter |
| Min packs per line | **1** | `Marketplace.packs` | D07 | The unit is the pack |
| Max packs per line | **none** | — | — | **Not stated by the Blueprint. TD-16.** 1,000,000 is accepted |
| Refusal grace | **5 minutes** | `REFUSAL_GRACE_MS` | D11 | Refusing within 5 min of confirming is the honest "sold since" case; v1 penalised a structurally guaranteed event |
| Honoured min sample | **10** | `HONOURED_MIN_SAMPLE` | D11 | Below this, a band would be noise; the answer is `new` |
| Honoured window | **60 days** | `HONOURED_WINDOW_MS` | D11 | Recent behaviour, not history |
| `trusted` threshold | **≥ 95%** | `honouredBand` | D11 | |
| Managed subject limit | **6** | `MANAGED_SUBJECT_LIMIT` | §4 S3 | A household, not a directory |
| Peer invite TTL | **7 days** | `INVITE_TTL_MS` | D02 | |
| Memorial reversal window | **30 days** | `MEMORIAL_REVERSAL_MS` | D04 | |
| Account deletion window | **30 days** | `DELETION_WINDOW_MS` | D05 | Signing in cancels it |
| Code attempts | **5** | `Verification.MAX_ATTEMPTS` | E6 | |
| Code lifetime | **10 minutes** | `CODE_LIFETIME_MS` | E6 | |
| Resend cooldown | **45 seconds** | `Onboarding.RESEND_AFTER_MS` | E6 | A resend that works instantly invites three codes, only the last of which works — which then reads as the app sending broken codes |
| Code length | **6 digits** | `Onboarding.CODE_LENGTH` | E6 | |
| Watches per subject | **5** | (declared, not implemented) | D30 | |
| Watch expiry | **14 days** | (declared) | D30 | |
| Licence warnings | **60 / 30 / 7 days** | `VerificationMachine` | §6 | |
| Retry attempts | **6** | `DEFAULT_POLICY.maxAttempts` | §21 | |
| Retry base / cap | **1s / 60s** | `DEFAULT_POLICY` | §21 | Deliberately patient — Iraqi mobile data returns in bursts, and a tight loop spends the user's battery and data allowance to no purpose |
| Watch poll interval | **3 seconds** | `WATCH_INTERVAL_MS` | TD-21 | Transport, not product. Nothing a patient sees derives from it |
| UI tick | **1 second** | `TICK_MS` | E6 | E6 counts in seconds; a countdown that lags its own unit reads as broken |
| Iraq UTC offset | **+03:00, permanent** | `IRAQ_UTC_OFFSET_MINUTES` | §3, D40 | Iraq abolished daylight saving in 2008 — there is no second offset |

---

## 3. Routing — the five rules (§8)

`Marketplace.route(facts) → RoutingDecision`. **All five are required. There is
no ranking, no weight, and no score** — the function returns a boolean and a
notification time.

Evaluated in this order (order matters: the first failure is the reason reported):

1. **`verifiedWithCurrentLicence`** → else `not_verified`
2. **`coversDistrict`** → else `outside_coverage`
3. **NOT `marksAnyRequestedItemNotCarried`** → else `not_carried`
4. **NOT `paused`** → else `paused`
5. **NOT `atCapacity`** → else `at_capacity`

Then:
- `openNow` → **routed, notify now**
- `opensWithinWindow` → **routed, notification deferred to opening time**
- otherwise → not routed, reason `closed`

**Why the deferred case exists (D09):** this is the one rule that replaced v1's
*three contradictory answers* to the closed-pharmacy case. A branch opening
inside the request window is a branch that can still help.

**Why every exclusion carries a reason (D13):** v1 filtered branches out silently
and then judged them inactive for not answering.

> **Known contradiction — BD-10.** Routing rule 5 excludes a branch that marked an
> item "not carried", but the stock module was removed from Phase 0, so **nothing
> persists the mark.** Rule 5 is documented and unimplementable. The decline
> reason is recorded on `offer_lines` only.

---

## 4. Clinical gates (§7)

`packages/domain/src/clinical/gates.ts`. **`GateOutcome` is `"ALLOWED" |
"REFUSED"`. There is no `SAFE`, no `CLEAR` and no `CHECKED`, deliberately** —
D16 removed interaction checking from Phase 0 entirely, so a value meaning "we
looked and it is fine" would be a lie the type system permitted.

### `gateRequestLine(item, hasPrescriptionImage)`

Order matters:

1. `isControlled` → **`CONTROLLED_NOT_SUPPORTED`** (D42) — refused at the moment
   it is tapped, not after a round trip; this is why the three clinical flags are
   carried on the catalogue row.
2. `!requestable` → `ITEM_NOT_REQUESTABLE`
3. `requiresPrescription && !hasPrescriptionImage` → **`PRESCRIPTION_REQUIRED`**
   (D18)
4. otherwise `ALLOWED`

> `ALLOWED` means only *"this line may be created"*. It carries no clinical claim
> whatsoever, which is why the type is not called `SafetyResult`.

The gate is asked **three times** on different questions, and the difference is
deliberate:

| Caller | `hasPrescriptionImage` | Question being asked |
|---|---|---|
| `model/search.ts` `availability()` | `true` | *Could this ever be requested?* Answering "no" to a prescription item a patient is holding the paper for would be wrong |
| `model/draft.ts` `add()` | `true` | Drafting — the photo may still be taken at R2 |
| `model/draft.ts` `validate()` | the real value | At send. **A disabled button is a courtesy, never a control** (§5 rule 1) |

### `mayConfirmReservation(staff)` — always ALLOWED

Deliberately unconditional for **any signed-in staff member** (**D19**). The
parameter is kept so the call site reads the same as its clinical sibling.

> v1 required a pharmacist for every confirmation, which no real Iraqi pharmacy
> could honour on an evening shift — **producing an audit log full of
> attestations that were routinely false, which is worse than no control.**

### `mayProposeSubstitution(staff)` — pharmacist + verified licence only

`role !== 'pharmacist' || !licenceVerified` → `SUBSTITUTION_REQUIRES_PHARMACIST`.
Confirming a hold is **commercial**; proposing a substitution is **clinical**
(D19). In the pharmacy app the substitution control is **absent, not disabled** —
a disabled control invites a workaround.

### `gateHandover(checklist, anyLineRequiresPrescription, staff)`

Three fixed items, all recorded (§7 control 2):

- `allergyAsked` and `packsConfirmed` — **always required**.
- `prescriptionSeen` — required **only** when a line was prescription-required,
  and only a **verified pharmacist** may attest it (`REQUIRES_PHARMACIST`).

---

## 5. Substitution consent (§4 R10)

`apps/patient/src/model/consent.ts`. This module exists because of a defect the
review registered at **critical** (TD-5): R8 could show a substitution and let a
patient accept the offer containing it. **A flag on a row is not consent.**

Three rules make it consent rather than a formality:

1. **Never pre-ticked.** `begin()` sets every proposal to `undecided`, and
   **there is no constructor that produces `agreed`.**
2. **Per line, not per offer.** Agreeing to one substitution is not agreeing to
   another.
3. **Refusing does not lose the rest of the order.** D06 already puts unfilled
   lines into a child request, so a refused substitution follows the same path as
   an out-of-stock line. *A patient who believes refusing loses the order will
   agree to a brand they did not want.*

`linesToReserve()` excludes **both** refused and **undecided** lines — *treating
undecided as agreement is the exact failure §4 R10 exists to prevent.*

`acceptance(offer, held)` is the single decision point. Consent held for a
**different** offer counts as **no consent**, deliberately: carrying decisions
across offers would be the app agreeing to a substitution on the patient's behalf.

A blocked acceptance is not a refusal the patient must dismiss — the reducer
sends them to **R9 to make the decision** rather than telling them they cannot.

---

## 6. Acceptance and coverage (D06)

`Marketplace.accept(allRequestLineIds, acceptedLineIds)`:

- empty acceptance → `NOTHING_ACCEPTED`
- an accepted id not in the request → `NOT_FOUND_OR_NOT_YOURS`
- returns `{ reservedLineIds, childRequestLineIds }`

`childRequestLineIds` become a child request **automatically**, so the patient
never re-enters a line.

**Coverage is shown as «عندها ٢ من ٣» — never a percentage.** `coverage()`
returns a `[number, number]` tuple. `OfferSummary.missing` names *which* lines are
missing, because the patient's question is always "which one".

**Totals are for the lines this offer can actually supply.** An offer that fills
two of three must not be compared on a total that pretends it filled all three.

---

## 7. Offer ordering (D12)

`Offers.forReading(summaries)` — named `forReading`, **not `rank`**.

1. **Coverage descending** — an offer that cannot supply the medicine is not
   cheaper, it is incomplete.
2. **Total price ascending.**
3. **Ties keep arrival order**, so nothing is reshuffled while the patient is
   reading.

Both keys are printed on every row, so **a patient can check the order
themselves**. D12 forbids ranking, weighting and paid placement; a score would be
an opinion the patient cannot audit.

**Prices are exact, never rounded.** The first version rounded to the nearest
thousand and displayed 8,500 as «٩ ألف» — a price the patient would not be
charged, on a screen whose whole purpose is comparing prices. It also made the
stated ordering unverifiable, because two different totals printed identically.
(Resolved: TD-0c.)

---

## 8. Reliability — the honoured rate (D11)

```
total = collected + countedFailures
total < 10          → "new"
collected/total ≥ 0.95 → "trusted"
otherwise           → "needs_attention"
```

A refusal **within 5 minutes** of confirming does not count (`refusalCounts`).

> Returns a **BAND, never a number**. A decimal invites an argument about a
> number instead of about the behaviour, and it is shown to patients.

---

## 9. Authority (§5)

`Authority.authorise(relationships, account, subject, need, subjectFacts)` —
**one function, one refusal.**

Scopes are ordered and additive: `view` (1) < `order` (2). **There is no
`confirm` scope in Phase 0**, because there are no dose events to confirm.

Rules:

- `self` and `guardian` relationships satisfy any scope; `peer` satisfies a need
  only if `RANK[grant.scope] >= RANK[need]`.
- No sufficient relationship → **`NOT_FOUND_OR_NOT_YOURS`**, the *same* refusal
  as a subject that does not exist (§5 rule 3). *A caller cannot learn whether a
  subject exists by the shape of the answer.*
- **§5 rule 4 — least privilege wins on ambiguity.** Where several relationships
  could apply, the **narrowest sufficient** one is used, never the first found.
  Narrowness: `peer(view)` < `peer(order)` < `guardian` < `self`.
- **D04** — a memorialised subject refuses `order` and allows `view`.

Two more system-wide rules:

- **§5 rule 1** — hidden UI is not a permission; the client enforces nothing.
- **§5 rule 2** — authority is checked **where the work happens**, not at the
  gateway. `api-gateway`'s forbidden list says so explicitly.

---

## 10. Family rules (§9)

| Rule | Behaviour | Why |
|---|---|---|
| `canAddManagedSubject` | Refuses the 7th | §4 S3 |
| `inviteStillValid` | Refuses after 7 days | D02 |
| `canReverseMemorialisation` | Refuses after 30 days | D04 |
| `claim(alreadySelf)` | Refuses `ALREADY_SELF`; otherwise guardianship **ends**, former guardian keeps a **revocable `view`** grant | D01. Handing back `order` by default would make the claim cosmetic |
| `checkDispositions` | Every managed subject decided **exactly once**, and every disposition must name a subject this guardian actually manages | D05 |

`checkDispositions` carries two fixes worth reading, both recorded in the source:

- It checked only that every managed subject was *decided*, so **a disposition
  naming someone else's subject was accepted** and handed back as an instruction
  to transfer or delete their record.
- Two entries for one subject — one `transfer`, one `delete` — **both passed**,
  leaving the caller holding contradictory instructions about a person's medical
  record. *D05 says the choice is explicit; two choices is not one.*

**There is no default disposition, deliberately:** a default here silently
decides the fate of another person's medical record.

---

## 11. Verification (E5, E6)

`packages/domain/src/identity/verification.ts`.

Blueprint v3 declares **four distinct ways E6 can fail**, and they are not
variations of one error. Each leads somewhere different:

| Failure | Refusal | Recovery |
|---|---|---|
| Wrong code, attempts left | `WRONG_CODE` (with `left`) | Try again |
| Attempts exhausted | `ATTEMPTS_EXHAUSTED` | Start over |
| Expired code | `CODE_EXPIRED` | Request a new code |
| SMS never arrived | (no verdict) | Resend, or another route |

> Modelling them as one "invalid" would collapse four recoveries into a shrug.

**Expiry is checked BEFORE the attempt is counted.** *A code that has run out of
time is not a wrong answer, and spending one of a patient's five attempts on the
clock having moved would be the app punishing them for its own timing.*

`submit()` returns a **refusal** for a wrong code (so the caller cannot treat it
as progress) and `consumeAttempt()` applies the count separately — *losing the
count would give a patient unlimited guesses; doing both in one call would let
either happen by accident.*

**The server is the authority.** The client mirrors `attemptsLeft` from the
server's response into the challenge so the domain's count and the screen's
sentence cannot disagree. A client that could decide it had one more attempt
would be a client that could decide it had a hundred.

### Phone parsing (E5)

Accepts `07701234567`, `7701234567`, `+9647701234567`, `009647701234567`, plus
Arabic-Indic digits, spaces and dashes — *because a number copied out of a
contacts app or read off a SIM card carries all of them, and rejecting a real
number for its punctuation is the app refusing to do work the patient can see is
trivial.*

Valid Iraqi mobile prefixes after the trunk zero: **75, 77, 78, 79** (Zain,
Asiacell, Korek), then 8 more digits.

**`UNSUPPORTED_COUNTRY` is distinct from `MALFORMED_NUMBER`.** An explicit
international prefix that is not Iraq's is *a number we cannot serve*, not a
number typed wrong — *telling someone their correct number is malformed is the
app blaming them for our coverage.*

### Name and district (E7, E8)

`cleanName` trims and collapses whitespace and **does nothing else**: no
transliteration, no capitalisation, no "correction". *A person's name is not the
app's to tidy, and a patient who sees their name altered learns that this app
edits what it is told.*

`firstNameOnly` derives what a pharmacy sees at pickup, so **E7 can show the
patient what will be shared before they submit it**.

`checkDistrict` returns `OUTSIDE_COVERAGE` — **E12's case, and not the patient's
mistake.** *We have not arrived there yet, and that is our failing rather than
theirs.*

---

## 12. Search normalisation (§4 F2)

`Search.normaliseQuery` folds, in order: Arabic-Indic and Extended-Arabic digits
→ Western; tatweel removed; `أ إ آ ٱ → ا`; `ى → ي`; `ة → ه`; harakat removed;
whitespace collapsed.

> An Iraqi patient types the same medicine six ways, and sending those through
> unchanged turns a present medicine into "not in our list" — **the single
> cheapest way to lose someone on their first search.**

**Case folding is a no-op and is deliberately not applied** (declared in the test
model). Digit folding goes through `@dawai/design`'s `toWesternDigits` so the
query normaliser and the render-time numeral pass cannot disagree — it previously
existed as four copies of the same two `.replace` calls.

**A miss grows the catalogue, a failure does not.** `shouldReportUnmatched`
returns true only for `empty`, never for `error` — counting a dropped connection
as a missing medicine would send the catalogue team after items that exist
(§13.1, D29).

---

## 13. Offline and delivery rules (§21, D27)

| Rule | Where |
|---|---|
| A queued request is **never** presented as sent | `@dawai/offline` `describe()`; `model/send.ts` returns a machine state, not a boolean |
| A replay after reconnection lands **exactly once** | Client-minted `idempotencyKey`, stable across every retry |
| A repeated key is the **same intent**, not a second one | `enqueue()` deduplicates — a double tap on a slow connection must not create two requests |
| The outbox is ordered **per subject** | `readyToSend()` returns the oldest queued item per subject; a subject with an in-flight item waits; unrelated subjects do not block |
| A **409 is success** | `classify` → `duplicate`; `markDuplicate` → `accepted`. Surfacing it as a failure teaches the user to distrust a screen that is telling the truth |
| An exhausted item is **requeued and visible**, never dropped | `flush.ts` — silently abandoning a queued request is exactly the failure the outbox exists to prevent |
| Accepted and cancelled items leave; everything else stays visible | `prune()` — D27 requires pending work to be visible |
| A cancellation may not be overtaken by a send | `flush.ts` re-reads the **live** outbox between items and `merge`s: live wins on membership, the in-flight run wins on the item it holds, and a `cancelled` decision always wins |
| Backoff has **full jitter** | When a cell tower returns, every queued device retries at once, and identical backoff turns a recovery into a thundering herd |

---

## 14. Rules the patient app enforces on itself

Small, easily-lost rules found in `apps/patient/src/`:

- **Adding the same medicine twice is one line with more packs**, not two lines —
  two identical lines would consume the D07 line budget and confuse a pharmacist.
- **A pack count below 1 removes the line**, because a stepper that stops at one
  traps a user trying to undo a mis-tap.
- **Changing the subject mid-draft does not clear the lines** — the patient
  realising this is for their mother should not have to type it all again.
- **One prescription photo attaches to every line that needs one** — one photo
  commonly covers the whole paper, rather than photographing the same sheet four
  times.
- **A captured photo is not attached until the patient confirms it is readable
  (R3)** — skipping it means a blurred photo reaches a pharmacist who cannot
  dispense, and the patient discovers it at the counter.
- **Retaking discards the previous image** — two photos of one paper is a choice
  the patient did not ask to make.
- **A late search response is dropped by query**, not by sequence number — on a
  slow connection a stale response overwrites the current one and the user
  watches their results change under their thumb. The catalogue port also
  **aborts** the superseded request, because typing «بانادول» opened seven
  concurrent requests and threw six answers away.
- **A cancelled search must not fall through to the cache** — nobody is waiting
  for it; answering it from cache would put a stale age-labelled result into a
  race it should have left.
- **The first offer is announced; later ones update silently** — the first offer
  is the moment the wait stops being open-ended.
- **A withdrawn offer stays in the list, marked unavailable** — removing it means
  a patient who tapped a pharmacy watches it vanish and is told an offer was
  withdrawn, with no way to tell which one it had been.
- **A verdict for a challenge that is no longer current is discarded** — it
  arrives whenever a patient presses resend while a submission is in flight, and
  the old challenge's "wrong" would spend an attempt the patient never made.
- **A failed call is never reported as a refusal.** Three separate places state
  this: a failed accept is not D39's "the pharmacy declined"; a failed
  `PATCH /v1/me` is not `DISTRICT_REQUIRED`; a failed verify is
  `codeCheckFailed`, not a verdict. *Blaming someone for a network is the one
  thing these screens must not do.*

---

## 15. Arabic language rules (D34, D36)

`packages/design/src/arabic.ts`. Arabic does not have one plural — a counted noun
takes **four** forms, and the agreement runs past the noun into the pronouns
after it.

| Category | Applies to | Form |
|---|---|---|
| `one` | exactly 1 | Numeral normally dropped: «دقيقة», not «١ دقيقة» |
| `two` | exactly 2 | **The dual**, which English does not have and which is most often missed: «دقيقتين», «محاولتين» |
| `few` | 3–10 (mod 100) | Numeral stated, broken plural: «٥ دقائق» |
| `many` | 11+ **and zero** | Numeral stated, noun returns to the **singular**: «١٥ دقيقة» |

It shipped wrong: a cached search said «آخر تحديث قبل ١ دقائق» ("1 minutes
ago"), and a patient on their fourth attempt was told «باقيلك ٢ محاولات» where
Arabic wants the dual. The categories are **CLDR's**, so a translator can check
them against a published table rather than against someone's memory.

Digits stay Western inside this module — every string passes through the render
layer, which converts to Arabic-Indic **once** (§25).

> **Not verified: the dialect.** This product is written in Iraqi Arabic, and
> some inflections differ from Modern Standard. Registered as **TD-22**.

**D36** — Arabic copy is gender-neutral **by construction**, not by review.
