# 20 — Next priorities

What to do next, in order, with the reasoning for the order and the definition of
done for each.

---

## 0. Before anything else

**Read `19-open-decisions.md` §1 and get an answer.**

Everything below assumes `platform/` is the product. If that is wrong, most of
this list is wrong, and the sooner that is known the less work is discarded.

**One question settles it:** does Phase 0 perform interaction checking — yes or
no? (Or equivalently: phone+OTP or email+password; Account/Subject or
users-with-roles.)

---

## Priority 1 — A backend for `platform/`

**Why first:** TD-1 is the root of TD-6, TD-8, TD-14, TD-21 and every "unverified"
row in `16-testing.md` §8. **No pilot can run without it, and no permission in
this knowledge base is a running control until it exists.**

**What already makes this cheaper than it looks:**

- **67 endpoints are declared** with methods, paths and responses.
- **22 tables are declared** with columns, constraints, indexes, immutability and
  deletion rules — precise enough to write DDL from.
- **54 events are declared** with payloads, triggers, side effects, audit
  requirements, retry semantics and idempotency keys.
- **Every business rule already exists as a pure, tested function** in
  `@dawai/domain`. A server importing that package inherits the rules rather than
  reimplementing them — *which is the entire point of Rule 3.*
- **`tools/devserver/api.mjs` is an executable specification** of the six
  endpoints the client uses, including the refusal paths.
- **`dawai-platform/` has directly reusable server patterns**: encrypted object
  storage with magic-byte inspection, image re-encoding and EXIF stripping; a
  durable notification outbox; a lifecycle worker; idempotency and rate-limit
  middleware; PGlite for zero-setup local dev and isolated tests.

### Order within Priority 1

1. **Schema** — the 22 tables, with **every declared constraint**. The
   constraints are where the invariants live: `UNIQUE(subject_id) WHERE
   state='active'`, `held_at NOT NULL before expires_at`, `state='requestable'`
   requiring all three clinical flags, append-only `dispense_records`.
2. **`identity-service`** — phone+OTP, sessions, device binding, and **the single
   `authorise` question**, which already exists in the domain. Every other
   service depends on it.
3. **`api-gateway`** — TLS, token audience, **idempotency enforcement**, rate
   limits, audit envelope. **No business logic** (its own forbidden list).
4. **`catalogue-service`** — search with the same six folding rules the client
   applies, so the index and the client agree about what «بانادول» is.
5. **`marketplace-engine`** — requests, the five routing rules, windows, offers,
   reservations. The rules are `Marketplace.*`; the server orchestrates them.
6. **`media-service`** — encrypted storage and the
   granted/revoked access lifecycle that makes D18 real.
7. **`clinical-engine`** — the gates (already written) and **the single writer of
   `dispense_records`**.
8. **`audit-service`** — append-only, backpressure rather than dropping.
9. **`pharmacy-service`** and **`notification-service`**.

**Definition of done:** the patient app runs against it with `VITE_MOCK_API`
unset; the five **permission** tests from the declared test model pass —
especially *"a request for another account's subject returns byte-identical
output to a request for a subject that does not exist"*; `npm run check` and the
smoke scripts pass unchanged.

**While doing it, fix TD-8** — acceptance keyed on request line ids rather than
offer line ids. It is correct today only because the fixture makes them the same,
and it **breaks the moment a real server assigns ids.**

---

## Priority 2 — Unblock the four frozen-document contradictions

**Why second:** they cost days of decision latency and nothing of engineering
time. Ask all four in one conversation.

| Ask | Of whom | Smallest resolution |
|---|---|---|
| **TD-24** — can a guest assemble a draft? | Product | **R1 loses `requireSession`.** It is what the drawn product already does; the guard list is what is out of step |
| **TD-20** — can a broadcast request be cancelled? | Product + architecture | Either §6 gains the edge, or §4 R7 loses the control, or the control is reinterpreted as "stop notifying me" — **which needs new copy** |
| **TD-23** — draw R11 | Design | Three exits already declared: widen → R7, watch → R12, later → S1 |
| **TD-25** — one sentence for E8 | Copy | «ما كدرنا نحفظ — جرّب مرة ثانية» or better |

**Definition of done:** each item either moves to `RESOLVED` with how, or its
register entry names the specific decision that was made and why it did not
resolve.

**Note the dependency:** TD-20's options B and C both require TD-23 first — *a
patient with no cancel and no window end has no exit at all.*

---

## Priority 3 — A device build

**Why third:** it converts six "unverified" rows into either "verified" or "a
real defect", and it is the only way to close TD-2, TD-3 and half of TD-14.

**What it unlocks:**

- Native gestures, platform chrome, safe-area insets, keyboard avoidance
  (**TD-2**).
- Screen transitions — 11 unspent motion tokens, including every one that
  describes moving *between* screens (**TD-3**).
- Maps handoff and dialer for V2 (**TD-14**).
- Push, once BD-8 answers the device-registration question (**TD-21**).
- Performance measurement — startup, render, navigation latency, memory, bundle
  size (**TD-7**).
- Encrypted storage that can actually honour D28's "sign-out destroys the key".

**The host interface is already the right shape.** A device host is *a handful of
one-line functions*, which is exactly what `main/host.ts` was designed to make
possible. `apps/patient/web/host.ts` is the worked example.

---

## Priority 4 — The missing screens

In dependency order, not size order.

| Screen | Why this order |
|---|---|
| **S1 (Today)** | The app **starts** on it and the root currently substitutes for it. It also makes **TD-15 reachable**, so TD-15's product answer is needed alongside |
| **R11** | Unblocks TD-23 — R7's promise |
| **R13** | Unblocks the outbox surface (D27 says *the outbox is a screen*) and half of TD-13 |
| **R4** | Needed by the family slice; also the first screen where `Authority.authorise` is exercised for a subject that is not self |
| **R5** | Smallest — R6 sets urgency inline today |

Then the light palette (**TD-10**), which is a prerequisite for the contrast gate
being able to see a light-scheme regression at all.

**Definition of done for each:** a contract that `ux-check` accepts, a component,
render tests through the double, screenshots in every declared state, and a
`review/.baseline.json` update.

---

## Priority 5 — The accessibility content decision

**TD-12.** A screen-reader user currently makes the most consequential decision in
the product — which pharmacy to reserve from — **without hearing anything the
decision is based on.**

The engineering fix is small once the content rule exists. **The content rule
does not exist**, and §25 states none, so implementation must not invent one.

**Needed:** which fields a composite card announces, in which order, and how to
word coverage («يغطي ٢ من ٣») and the honoured band aloud, in Iraqi Arabic.

---

## Priority 6 — The pharmacy app

**Why sixth, not earlier:** the loop already runs, played by a dev server. A real
pharmacy app is what makes it a *product*, but every hour spent on it before a
backend exists is an hour spent against a mock.

**What is already done:** both machines (`Verification`, `BranchEligibility`),
the routing rules, the offer answer rules, `mayConfirmReservation`,
`mayProposeSubstitution`, `gateHandover`, and 40 declared screens.

**Start with P3 → P6 → P10 → P14** — the inbox, the offer, the hold, the handover.
That is the pharmacy's core loop and it closes the patient's.

**Three rules to carry in from day one:**

1. **The inbox projection contains no patient identity** — *it cannot leak; it is
   not there.*
2. **The substitution control is ABSENT for a non-pharmacist, not disabled** — *a
   disabled control invites a workaround.*
3. **Any signed-in staff member may confirm** (D19) — *this is the row v1 got
   wrong, and a control no evening shift can honour produces an audit log full of
   attestations that are routinely false.*

---

## Priority 7 — The owner console

**Blocked on four blocker-severity gaps** before most of it can be built:
BD-1 (saved pharmacies), BD-2 (price disputes → O22), BD-3 (support tickets →
O20/O21), BD-5 (consented support session → O19). BD-4 blocks O10.

**What can be built now:** the verification queue (O1, O2), suspension (O6),
catalogue curation (O8, O9, O11), the audit log (O23, O24), and — most
importantly — **the four exit metrics (O12–O15)**, whose events are all declared
and whose client emissions already exist.

**Build O12–O15 early even if the rest waits.** D23 makes the repeat-rate gate
*the test of the strategy's riskiest belief*, and a metric with no screen is a
metric nobody reads.

---

## Priority 8 — Ongoing hygiene

Small, cheap, and each closes a real gap:

- **TD-16** — get one number for the pack ceiling; it belongs beside
  `MAX_REQUEST_LINES`.
- **TD-17** — get the real district coverage list; it replaces the file wholesale.
- **TD-22** — have a native Iraqi reader confirm the four plural forms.
- **TD-11** — get a replacement caption colour, or confirm the deviation.
- **TD-6** — exercise the cached-countdown path against real cache eviction.
- **TD-13** — implement the unblocked half: **a function that can refuse must say
  so** rather than returning its input.
- **BD-11** — decide what a patient sees when observed availability is **zero**
  versus **unknown**. *§13 of v1 insisted these are different.*

---

## What NOT to do next

Stated because each is a plausible-looking mistake:

| Don't | Why |
|---|---|
| **Do not add features to `dawai-platform/`** until §1 is decided | Every hour may be discarded |
| **Do not "unify" the two tracks by merging code** | The conflict is a product decision about identity, auth and clinical policy — not a merge conflict |
| **Do not soften an architecture gate to make a change pass** | *Weakening a rule to make code pass rather than resolving the contradiction* is named as the wrong answer in TD-24 |
| **Do not invent a quantity, a coverage list, a spoken-content rule or a failure sentence** | Four separate register entries exist precisely because they were **not** invented. That restraint is why this codebase is trustworthy |
| **Do not add a clinical check of any kind** | D16 and D21. Interaction checking returns in Phase 3, after a named clinical governance authority exists |
| **Do not delete a debt item** | It leaves by being fixed, and its resolution is recorded |
| **Do not clean up the repository root** | It is Adlytic, a different product |
| **Do not hand-edit `docs/design/*`** | Generated by `npm run design`; `docs-check` will notice |
| **Do not skip the walk** | *Every defect found in the running app so far was found by pressing a button rather than by reading* |

---

## A suggested first week

For an engineer starting cold on `platform/`:

| Day | Do |
|---|---|
| **1** | Read `START_HERE.md` and this knowledge base. Run `npm ci && npm run dev`. **Walk the whole loop in a browser** — search, draft, sign in, name, district, send, offers, compare, consent, reserve, read the code. Then `node tools/devserver/smoke-offline.mjs` |
| **2** | Read `packages/domain` end to end. It is ~1,200 lines and it is the whole business. Then `app/store.ts` — 917 lines, and every decision in the product passes through it |
| **3** | Run `npm run check` and read each checker's source. Then `npm run review` and open `review/index.html`. Read `tools/review/debt.mjs` in full |
| **4** | Pick the **smallest** open item you can close without a product decision — TD-13's engineering half is a good candidate — and take it through the whole cycle: rule, test, gate, walk, register |
| **5** | Write down every question this knowledge base did not answer, and **add the answers to it.** That is how it stays the brain |

---

## The standard to hold

The reason this project can be handed over at all is that the code explains
itself: **every module says why it exists, every constant says why it is that
number, and every compromise is registered with what it costs a user.**

Three things to keep doing:

1. **Write the "why" beside the "what".** Not what the code does — *why the
   obvious alternative was wrong.*
2. **Register what you could not finish**, with the impact on a **user** and what
   would unblock it.
3. **Never resolve a contradiction between frozen documents by picking one in
   code.** State it, register it, and ask.
