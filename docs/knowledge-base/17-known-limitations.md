# 17 — Known limitations

An honest account of what is incomplete, what is mocked, what is missing, what
requires a backend, and what blocks release.

**Nothing here is hedged.** If you are reporting status to anyone, report from
this file.

---

## 1. The headline: there is no backend

**TD-1, critical.** This is the root of at least five other limitations.

What exists:

- A **browser host** (`apps/patient/web/host.ts`) implementing the `Host`
  interface against browser globals, and a composition root that assembles the
  application. **The app has been started and used in a page.**
- A **development server** (`tools/devserver/api.mjs`) answering the declared v1
  contracts on the same origin.

What that is not:

> `react-native-web` **is not React Native**, so no phone has run this. The dev
> server invents **DATA** (nine catalogue rows, three branches) to exercise
> **BEHAVIOUR** the contracts already declare — **it is not a backend.** No
> session token is stored or refreshed, and `deviceId`/`baseUrl` still have no
> production source.

What remains unexercised, in the register's own words:

> Everything a device and a server bring: **native gestures, platform chrome,
> safe-area insets and keyboard avoidance** are untested because no React Native
> project exists, and **real latency, pagination, token refresh, TLS and
> server-side authorization** are untested because nothing behind the port is
> real.

### What "no backend" specifically means

| Absent | Consequence |
|---|---|
| Server-side authorization | **Every permission in `09-permissions.md` is a design, not a running control** |
| Session tokens | Closing the app signs out. Stated honestly in the code rather than faked |
| Push notifications | Offers arrive by **polling** (TD-21) |
| Server clock | The countdown correction is **zero** — stated at the one line where a server offset would be applied |
| Scheduled jobs | Nothing expires a request, a reservation, a watch, a licence or a scheduled deletion |
| Real ids | Request line ids are minted by the server; the client has none (**TD-8**) |
| Persistence | The mock resets on reload |

---

## 2. What is mocked, and exactly how honestly

`tools/devserver/api.mjs` — and it is careful about the distinction:

> Where it invents, it invents **DATA** (a catalogue of real Iraqi pharmacy
> stock, three pharmacies in Karrada) **and never BEHAVIOUR**: no endpoint here
> answers anything the contract does not describe.

| Mocked | Real about it |
|---|---|
| 9 catalogue rows | Include `i-tramadol` (**controlled**), so D42 is reachable; and three prescription-required items, so D18 is reachable |
| 3 Karrada branches | Carry all three honoured bands and one closed branch |
| Covered districts `d1, d2, d3` | **Deliberately not `d4`**, which the bundled list offers as uncovered — *so the declared `invalid_district` path is reachable rather than theoretical* |
| Offers on a timer | *The one honest way to show R7's wait without a pharmacy app* |
| Prescription upload | **Counts the bytes and discards them**, logging «not stored (D18)» |
| Verification code | **Printed to the terminal, never returned in a response** — the contract does not carry it |
| 8 MB image limit | A number this server needs to answer 413 at all; *the real limit is the media service's and is not declared in the contract* |

The static preview build (`VITE_MOCK_API=1`) imports **the same `handle`
function** — one implementation of the contracts, not two that drift. It lands in
its own 3.6 kB chunk and a build without the flag never carries it.

**The mock resets on reload.** Say this out loud when demoing.

---

## 3. What is missing from the patient app

### Screens

**22 of 133 Blueprint screens are contracted (16.5%). 17 render** — the figure
`review/data.json` reports. Five contracted screens do not: S1, plus the four in
`NO_COMPONENT`.

| Missing | Why |
|---|---|
| **S1** | Visual open to the designer. The root **substitutes** for it, deliberately, and the reason is documented at the substitution site |
| **R4** | Subject switcher — arrives with the family slice |
| **R5** | Urgency as a modal — R6 sets it inline today |
| **R11** | *"OPEN to the designer: **Everything. Not rendered.**"* — this is what blocks TD-23 |
| **R13** | The outbox screen — arrives with the offline slice |
| 111 others | Later slices |

**Nothing renders a control that leads to a screen with no component.**
`isBuilt` means *contracted **and** drawable*, and it did not always — see TD-19.

### Whole applications

- **Pharmacy app** (PA1–PA9, P1–P31) — Stage 7, blocked on Stages 2, 3, 5.
- **Owner console** (O1–O24) — Stage 8, same.

The domain rules and both pharmacy machines are implemented and tested; only the
clients are absent.

### Capability gaps

| Missing | Register |
|---|---|
| Screen transitions — 11 of 13 motion tokens unspent, including every one describing movement *between* screens | **TD-3** |
| Maps handoff and dialer (V2's «الاتجاهات», «اتصال بالصيدلية») | **TD-14** |
| Light colour scheme | **TD-10** |
| Composite-card screen-reader content | **TD-12** |
| A ceiling on packs per line | **TD-16** |
| Real district coverage | **TD-17** |

---

## 4. What is incomplete rather than absent

These are the ones that will bite, because they **look** finished.

### R7 never ends — TD-23

The dial counts down for real. **At zero it shows «٠» and goes on saying
«انرسل — ننتظر الردود» indefinitely.** The screen's own copy promises the
opposite: «إذا خلصت بدون رد، نكلّك الصدك ونقترح شنو تسوي».

Nothing fires `windowElapsed`, so the request stays `broadcast` forever. The
store half is declared and buildable — §6 has the edge and `request.unanswered`
is a registered event — **but the screen it leads to is R11, which is
undesigned.** Moving the request with nowhere to land would change the state and
nothing a patient can see, so **the state is left honest rather than moved into a
screen that does not exist.**

### R7's cancel does nothing — TD-20

«ألغِ الطلب» dispatches `open S1` and nothing else. **The request stays broadcast
to every pharmacy that was asked**, and a patient who wanted to stop it believes
they have.

**It cannot be built.** See §6 below.

### R1's guards are bypassed — TD-24

`addItem` calls `navigate` rather than `open`, so R1's declared guards never run.
**That bypass is the only reason the product works end to end.**

It is visible: R2's «اكتب الاسم بدال الصورة» goes through the declared exit,
*does* run the guards, and sends a guest to sign in **by a control that offered to
let them type instead** — walked in a browser.

*A guard that one path enforces and another does not is not a guard (§5 rule 1),
and the same screen answers differently depending on how you arrive.*

### V2 renders two dead controls — TD-14

The contract declares «الاتجاهات» (primary) and «اتصال بالصيدلية» (secondary),
`ReservationScreen` draws both, and `App.tsx` wires both to `noop`. **Tapping
either does nothing at all, with no message and no fallback** — on the screen §4
calls *the screen that must never fail*, the one a patient stands in front of a
pharmacy holding.

A third declared secondary — «ألغِ الحجز» → V5 — **is not rendered at all**,
because `isBuilt` silently drops it and the screen never uses the prop.

*This is the exact defect the `isBuilt` filter exists to prevent, in the one
category `isBuilt` cannot express, because a dialer and a map are device
capabilities rather than screens.*

### A screen can be opened without the state it needs — TD-15

`open` runs the route guards and `isBuilt`, **neither of which knows** that V2
without a reservation, R9 without an offer, or R3 without a capture has nothing
to draw. `App.tsx` claimed the reducer prevented this; **it does not.**

Not reachable today — nothing rendered dispatches it, and the only declared exit
into V2 belongs to S1, which this build does not contain. **It becomes reachable
the moment S1 lands, and through D26's replay of a pending screen** — both
ordinary paths, not edge cases.

### The outbox cancel refuses silently — TD-13

`cancel` returns the outbox **unchanged by reference** while an item is
`sending`, so the reducer stores the same value, the screen re-renders
identically, and **the patient's cancel produces no signal of any kind.** With
the default policy that window is ~30 seconds across six attempts, and `flush`
re-reads the live outbox **between items, never between retries** — which is not
where the waiting happens.

### Line ids are the wrong ids — TD-8

Acceptance is computed against **the offer's** line ids rather than **the
request's**, because request line ids are minted by the server and the client has
none. *Correct today because they are the same fixture, and **wrong the moment a
real server assigns ids**.*

### E8 says nothing when a save fails — TD-25

A patient on a bad connection presses «خلص» and **watches it do nothing, twice.**
The alternative available without a product decision is worse: the first version
answered a dropped connection with `DISTRICT_REQUIRED` — *telling a patient who
DID choose a district that they had not.* **Blaming someone for a network is the
one thing this screen must not do**, so it asserts nothing instead.

---

## 5. What is unverified

| Area | Status | Register |
|---|---|---|
| Native behaviour | Screenshots are **DOM renders of the real component tree, not device captures**. Layout, hierarchy, typography, colour, spacing and tap targets are verified; **native gestures, platform chrome, safe-area insets, keyboard avoidance and animation are NOT** | TD-2 |
| Performance | **Entirely unmeasured** — startup, render, navigation latency, memory, bundle size. *The dashboard reports these as **NOT VERIFIED** rather than green.* Module count and source size are measured | TD-7 |
| Cached countdown | Implemented and photographed, **never exercised against real cache eviction** | TD-6 |
| Arabic dialect | The four plural forms are **engineering's reading of the grammar**, not a native speaker's. «دوائين», «٣ أدوية تحتاج وصفة» and «اثنين غيرهم» need a native Iraqi reader | TD-22 |
| Light scheme | `patientLight` aliases `patientDark`, **so the contrast gate cannot catch a light-scheme regression** | TD-10 |
| Screen-reader content | The visible card and the spoken card **are different products** | TD-12 |

---

## 6. What is blocked, and on what

**Five items cannot be fixed in code.** Each needs a decision from outside
engineering.

| Item | Blocked on | Nature |
|---|---|---|
| **TD-20** — R7's cancel | **Two frozen documents contradict each other.** The API declares `POST /v1/requests/{id}/cancel`; the §6 machine has no edge for it from `broadcast` or `answered`. *Adding the edge is inventing a state transition, which Rule 5 refuses.* **Either §6 gains the transition, or §4 R7 loses the control** | Contradiction |
| **TD-24** — R1's guards | **§4's guard list and §3.1/D26 contradict each other.** If R1 needs a session, no guest can assemble the request E4 promises to keep. *Fixing the symptom would mean routing that control around the guard as well, which is weakening a rule to make code pass* | Contradiction |
| **TD-23** — R7's ending | **R11 is undesigned** («OPEN to the designer: Everything.») | Design |
| **TD-25** — E8's failure sentence | **Needs copy**, which is not engineering's to write | Copy |
| **TD-12** — composite-card a11y | **What an offer card should announce, in which order, in Iraqi Arabic, is a content decision.** §25 and the Blueprint state no rule for composite cards, **so implementation must not invent one** | Product/design |
| **TD-13** — cancelling in-flight writes | **A POST that may already have been accepted cannot simply be dropped.** The honest options — refuse visibly, or cancel and reconcile against the idempotency key — differ in what the patient is promised | Product |
| **TD-14** — inert V2 controls | Needs a device build **and** a decision on inert declared controls | Product + platform |
| **TD-15** — screens without state | **What a patient should see when the reservation behind V2 is gone is a product decision.** No redirect was invented | Product |
| **TD-16** — pack ceiling | **Blueprint v3 does not state one.** *Any ceiling chosen here would be an invented business rule* | Product |
| **TD-17** — district coverage | **Needs the coverage list as a product input** | Product |
| **TD-10 / TD-11** | Needs the daylight palette / a confirmed caption colour | Design |

**This is the healthiest thing in the register.** Ten of the twenty open items
are blocked on someone else's decision and **say so precisely**, rather than
being resolved by an engineer guessing.

---

## 7. The eleven Blueprint gaps (BD-1 … BD-11)

Declared in the frozen technical model. Four are **blockers**.

| Gap | Sev | What is missing | Blocks |
|---|---|---|---|
| **BD-1** | blocker | **Saved pharmacies** (M4) have no entity | M4 |
| **BD-2** | blocker | **Price disputes** — a screen (V7), an operator queue (O22) and a decision (D31), with no entity | O22 |
| **BD-3** | blocker | **Support tickets** on four screens with no entity, states or ownership | M15, P30, O20, O21 |
| **BD-5** | blocker | **Consented support session** (O19) — no entity, no machine, **no patient-side consent surface** | O19 |
| **BD-4** | major | **Unmatched searches** — a retention promise (D29) and a screen (O10) with no entity. **D29's promise is unverifiable** | O10 |
| **BD-6** | major | **Invites** live inside other machines — an invite cannot be listed, resent or cancelled | Resend/cancel |
| **BD-7** | major | **Exports** — an artifact with an expiry and no entity | M8, L02, P27 |
| **BD-8** | major | **Device registration** — push is unimplementable; D35 removed premium capabilities **without stating the delivery fallback** | All push |
| **BD-10** | major | **Routing rule 5** excludes a branch that marked an item "not carried", but the stock module was removed, so **nothing persists the mark** | Rule 5 |
| **BD-9** | minor | The outbox has no entity — **correctly**, since it is client-side only. *Recorded so a reader does not mistake its absence for an omission* | — |
| **BD-11** | minor | **Observed availability** — no rule for what a patient sees when the count is **zero** versus **unknown**. *§13 of v1 insisted these are different; v3's §8 does not carry the distinction forward* | Display rule |

---

## 8. What blocks release

Ordered by what would stop a pilot from being safe or honest.

### Hard blockers

1. **No backend (TD-1).** No server-side authorization, no persistence, no
   sessions. **A pilot cannot run.**
2. **No device build (TD-1, TD-2).** The product is a phone app for people
   standing in pharmacies.
3. **No pharmacy app.** The loop needs a second side; today a script plays it.
4. **No push (TD-21, BD-8).** *The app must be OPEN and on screen for an offer to
   arrive*, so a patient who locks their phone during a four-hour window learns
   nothing until they look.

### Correctness blockers

5. **TD-8** — acceptance is keyed on the wrong ids and **breaks the moment a real
   server assigns them.**
6. **TD-23** — R7 makes a promise the product does not keep, on the screen whose
   entire job is making a wait legible.
7. **TD-20** — a control that states an outcome and produces none, **on a live
   request other people are working on.**
8. **TD-24** — a guard that one path enforces and another does not.

### Honesty blockers

9. **TD-14** — two inert controls on the screen that must never fail.
10. **TD-12** — a screen-reader user makes the most consequential decision in the
    product without hearing what it is based on.

### Product blockers

11. **TD-17** — the coverage list is placeholder data.
12. **BD-1 to BD-5** — four blocker-severity gaps in the frozen model.

### What does *not* block a pilot

The domain layer, the state machines, the design tokens, the accessibility
measurements, the navigation graph, the outbox engine, the retry policy and the
type-guard discipline are **complete and proven**. They are the reason this list
can be written precisely.

---

## 9. The other track, honestly

`dawai-platform/` **is** deployable and **does** have a backend, sessions,
migrations, encrypted storage and a lifecycle worker. Its own limitations:

- It implements a **different product model** — `users` with roles, email+password
  — that contradicts Blueprint v3's identity architecture.
- **Migrations 0005–0007 build a drug-interaction engine that D16 explicitly
  removed from Phase 0**, and §7's stated reason is that a partial check a user
  believes is complete is more dangerous than a stated absence. Whether the
  interaction data is real (DDInter/openFDA ingestion) is listed as remaining
  work in its own docs.
- It carries none of `platform/`'s architecture gates: no trace check, no layer
  check, no UX contract, no measured contrast, no derived navigation graph.
- iOS packaging exists as a Capacitor shell but is blocked on **external** items:
  an Apple Developer account, macOS/Xcode and APNs credentials.

**Neither track is releasable today, and they are blocked on different things.**
That is the substance of `19-open-decisions.md` §1.
