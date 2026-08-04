# 18 — Technical debt register

**The register itself lives in `platform/tools/review/debt.mjs`** and is published
by the review dashboard. This file mirrors it with the surrounding context.

> Debt is only real if it is **visible and owned**. Every item carries an impact,
> a priority, an owner and the slice that will resolve it. **An item leaves this
> register by being FIXED — never by being quietly deleted**, which is why each
> resolved item stays with its resolution recorded.

`tools/debt-check.mjs` is a build gate: **every `TD-n` referenced in source must
resolve to exactly one register entry**, and every inert control must be named.

---

## 1. Open items — 20

| ID | Priority | Owner | Summary | Blocked? |
|---|---|---|---|---|
| **TD-1** | **critical** | platform-foundation | **No device build and no backend** | — |
| **TD-2** | high | patient-app | Screenshots are DOM renders, not device captures | Device build |
| **TD-3** | high | patient-app | Screen transitions not implemented (11 of 13 motion tokens unspent) | — |
| **TD-21** | high | notification-service | **Offers reach the patient by POLLING, not by being told** | Device build / push |
| **TD-20** | high | marketplace-engine | R7's «ألغِ الطلب» cancels nothing | **API ↔ §6 machine contradiction** |
| **TD-23** | high | patient-app | **R7 does not end** | **R11 undesigned** |
| **TD-24** | high | patient-app | R1's guards contradict §3.1, and are bypassed | **§4 ↔ §3.1 contradiction** |
| **TD-10** | high | design | Night Mint is dark-only | Daylight palette |
| **TD-12** | high | patient-app | Composite cards announce only their label | **Spoken-content decision** |
| **TD-14** | high | patient-app | **V2 renders two controls that do nothing** | Device build + decision |
| **TD-8** | high | marketplace-engine | Acceptance uses offer line ids, not request line ids | Stage 5 |
| **TD-22** | medium | patient-app | Arabic plural forms unverified for Iraqi dialect | Copy review |
| **TD-25** | medium | patient-app | E8 has no treatment for a save that could not be made | **Needs a sentence** |
| **TD-17** | medium | patient-app | Bundled district list is placeholder | **Needs the coverage list** |
| **TD-11** | medium | design | V2 caption deviates from the delivery for contrast | Design confirmation |
| **TD-6** | medium | patient-app | V2 freshness hard-coded live | Stage 5 |
| **TD-7** | medium (partial) | platform-foundation | Performance entirely unmeasured | Device build |
| **TD-13** | medium | platform-foundation | Outbox cancel refuses silently while sending | **Product answer** |
| **TD-15** | medium | patient-app | A screen can be opened without the state it needs | **Product answer + S1** |
| **TD-16** | low | marketplace-engine | Nothing bounds packs per line | **Needs a Blueprint quantity** |

---

## 2. The items in full

### TD-1 — no device build, no backend · **critical**

A host now exists and the composition root is assembled, so **the loop can be
walked by a person rather than only by a test suite — which is how the E4
navigation defect was found.**

> `react-native-web` **is not React Native**, so no phone has run this, and the
> dev server invents DATA to exercise BEHAVIOUR the contracts already declare —
> **it is not a backend.** No session token is stored or refreshed, and
> `deviceId`/`baseUrl` still have no production source.

**Unexercised:** native gestures, platform chrome, safe-area insets, keyboard
avoidance, real latency, pagination, token refresh, TLS, **server-side
authorization**.

### TD-2 — screenshots are DOM renders · high

**Verified:** layout, hierarchy, typography, colour, spacing, tap targets.
**Not verified:** native gestures, platform chrome, safe-area insets, keyboard
avoidance, animation.

### TD-3 — screen transitions · high

Measured: **13 motion tokens declared, 2 spent** (`errorShake`, `offerArrival`).
The 11 unspent include **every token that describes moving between screens** —
`screenPush`, `sheetPresent`, `sheetDrag`.

> The app root swaps a component per `state.screen` with nothing in between.
> Going from a request to the sign-in ask is **a cut rather than a movement**, and
> §27 says each of those tokens *teaches* something. **Losing that is losing the
> one cue that tells a patient whether they went deeper or sideways.**

The item is careful to state what *is* built: `Enter`, `Pulse` and `Shake` are
real `Animated` components with native-driver and reduced-motion support, on
eight call sites. *This item used to say no transition existed at all, which was
wrong and understated the code while overstating the gap.*

### TD-21 — polling, not push · high

The composition root re-reads `GET /v1/requests/{id}` every three seconds while
any branch is still thinking, and stops when none is.

> **Behaviourally equivalent above the port** — the same intents arrive from the
> same contract, so no screen and no reducer can tell the difference — **and
> materially different below it.** The app must be **OPEN and on screen** for an
> offer to arrive, so a patient who locks their phone during a four-hour window
> learns nothing until they look; and a twenty-minute window costs **hundreds of
> requests and the battery to make them**, on the phones and networks this product
> is for.
>
> It is a **stand-in for the notification channel, not the design.**

### TD-20 — R7's cancel · high · **blocked**

**Two corrections are recorded on this item rather than overwritten**, which is
the register working as intended:

1. It first said the behaviour was unstated and therefore blocked — that read
   only the screen contract and **was wrong**: `POST /v1/requests/{id}/cancel` is
   declared in the API model.
2. It then said the client half was buildable — **also wrong**, and this is the
   real finding: **the API contract and the §6 state machine disagree.**

A patient on R7 is in `broadcast` or `answered`. The Request machine's only two
relevant edges are `cancelFromOutbox` (queued → draft — a request that never left
the device) and `abandon` (from `unanswered` or `partially_filled`). **The domain
model agrees with the machine and not the endpoint.**

> A control that states an outcome and produces none, **on a live request other
> people are working on** — a patient who wants to stop a request believes they
> have. **This is not a gap in the Blueprint but a contradiction between two
> frozen documents, and it needs one of them to move.**

### TD-23 — R7 does not end · high · **blocked**

At zero the dial shows «٠» and R7 goes on saying «انرسل — ننتظر الردود»
indefinitely, while its own copy promises «إذا خلصت بدون رد، نكلّك الصدك ونقترح
شنو تسوي».

The store half is declared and buildable. **The screen it leads to is R11, whose
design entry reads «OPEN to the designer: Everything. Not rendered.»**

> Moving the request with nowhere to land would change the state and nothing a
> patient can see, **so the state is left honest rather than moved into a screen
> that does not exist.** The polling itself now stops at the window (it did not
> before), **so this costs a patient a broken promise rather than a battery.**

### TD-24 — R1's guards vs §3.1 · high · **blocked**

> Both cannot hold: if R1 needs a session, **no guest can assemble the request E4
> promises to keep.** Today `addItem` calls `navigate` rather than `open`, so it
> never asks the guards, and **that bypass is the only reason the product works
> end to end.**
>
> **A guard that one path enforces and another does not is not a guard** (§5 rule
> 1). It is visible: R2's «اكتب الاسم بدال الصورة» goes through the declared exit,
> `open` runs the guards, and **a guest is sent to sign in by a control that
> offered to let them type instead** — walked in a browser.
>
> Fixing the symptom would mean routing that control around the guard as well,
> which is **weakening a rule to make code pass** rather than resolving the
> contradiction.

### TD-12 — composite-card accessibility · high · **blocked**

> On R8 an offer card reads as «افتح عرض صيدلية الرشيد» alone — **the price, the
> coverage, the substitution flag, the distance and the honoured band are all
> rendered and none of them is spoken.**
>
> A patient using TalkBack or VoiceOver makes **the most consequential decision in
> the product** without hearing anything the decision is based on. **The visible
> card and the spoken card are different products.**
>
> The engineering defect is clear; the fix is not, because what an offer card
> should announce, in which order, **in Iraqi Arabic**, is a content decision.
> §25 and the Blueprint state no spoken-content rule for a composite card, **so
> implementation must not invent one.**

### TD-14 — V2's inert controls · high · **blocked**

Two of V2's three actions **do nothing at all, with no message and no fallback**
— on the screen §4 calls *the screen that must never fail*, the one a patient
stands in front of a pharmacy holding. The rendered review page `V2-held.html`
contains both labels.

> **The exact defect the `isBuilt` filter exists to prevent, in the one category
> `isBuilt` cannot express**, because a dialer and a map are device capabilities
> rather than screens.

A separate, smaller problem: `onCancel` is passed as `() => onAction("V5")`,
which `isBuilt` silently drops because V5 is not in this build, **and the screen
never uses the prop** — so the cancel path *looks* wired when it is not.

### TD-8 — the wrong line ids · high

The store held a `requested` variable computed from the submission and then
discarded it, because request line ids are minted by the server.

> Acceptance is computed against the **offer's** own line ids rather than the
> request's. **Correct today because they are the same fixture, and wrong the
> moment a real server assigns ids.**

### TD-10 / TD-11 — the palette · high / medium

**TD-10:** Night Mint is dark-only. `patientLight` is an alias of `patientDark`
so nothing renders half-designed — *which means the contrast gate cannot catch a
light-scheme regression either.*

**TD-11:** V2's code-panel caption ships at `#63726B`, not the delivered
`#6B7A74`, because the designer's value measures **4.10:1** on `#F7F4EE` —
below the 4.5 body floor, **on the screen Blueprint v3 says must never fail.**
*Reverts the moment Design confirms a replacement.*

### TD-13 — silent cancel · medium · **blocked**

`Offline.cancel` returns the outbox **identical by reference** while an item is
`sending`. With the default policy the retry loop holds an item there for roughly
**30 seconds** across six attempts, and `flush` re-reads the live outbox **between
items, never between retries.**

> The comment in `flush.ts` names this exact failure — *"the user's cancel does
> nothing but move a label"* — and guards against it **at the item boundary, which
> is not where the waiting happens.**
>
> Whether a request already on the wire *should* be cancellable is a product
> decision. **The engineering half is unambiguous and unblocked: a function that
> can refuse must say so rather than returning its input.**

### TD-15 — a screen without its state · medium · **blocked**

`open` runs the guards and `isBuilt`, neither of which knows that V2 without a
reservation, R9 without an offer or R3 without a capture has nothing to draw.
**`App.tsx` claimed the reducer prevented this; it does not.**

> Not reachable today. **It becomes reachable the moment S1 lands, and through
> D26's replay of a pending screen** — both ordinary paths, not edge cases. The
> `Placeholder` is honest about the failure but is still a screen nobody
> designed.

### TD-16 — no pack ceiling · low · **blocked**

`Marketplace.packs` refuses zero, negatives and non-integers and accepts
everything else. **1,000,000 packs is ACCEPTED, verified by probe.**

> §2 fixes the maximum LINES at 8, and the module's own docstring says the
> review's central finding was that v1 *"left every load-bearing quantity
> undefined"*. **The quantity per line is such a quantity and Blueprint v3 does
> not state it, so there is nothing to implement: any ceiling chosen here would be
> an invented business rule.**
>
> The consequence is real but bounded — a pharmacy receives an absurd request and
> refuses it, **which costs a pharmacist's attention rather than a patient's
> safety.**

### TD-17 / TD-22 / TD-25 / TD-6 / TD-7

- **TD-17** — four Baghdad districts, three marked covered. The **shape** is the
  Blueprint's; the contents are not. *Nothing in the app hard-codes an id from
  the list and the real one replaces the file wholesale, so this cannot leak into
  logic.* It does mean a patient in a served district may not find it.
- **TD-22** — the plural work fixed what was unambiguously wrong («١ دقائق»,
  «٢ محاولات», «٥ دقيقة»). **The dialect is not verified.** *The risk is a phrase
  that reads as slightly formal rather than one that misinforms.*
- **TD-25** — see `17-known-limitations.md` §4.
- **TD-6** — the cached-countdown path is implemented and photographed but never
  exercised against real cache eviction.
- **TD-7** — *partially addressed*: module count and source size are measured;
  runtime metrics remain unverifiable without a device build. **The dashboard
  reports them as NOT VERIFIED rather than green.**

---

## 3. Resolved — 9

Kept, with **how** each was resolved, so the register records a history rather
than only a backlog.

| ID | Was | Resolved by |
|---|---|---|
| **TD-26** | A deployed build had no API and **told the patient the medicine was not in our catalogue** — the catch-all rewrite answered `/v1/catalogue/search` with the HTML document and a 200 | The review build carries the mock — **the same `handle` the dev server runs**, not a second implementation. Also: every deploy on the branch had been **cancelled**, because the root `netlify.toml` base pointed at a folder untouched for months |
| **TD-9** | **R2's shutter was silently inert.** No prescription-required medicine could be requested at all | `Host.camera` now returns **bytes, not an `imageId`** — *the interface was asking the host to do the app's job.* A `MediaPort` uploads them over the declared route. Walked in Chromium |
| **TD-18** | **E7 and E8 were unreachable.** A patient never gave their name, and **every request went out with `districtId: ""`** | Verification carries on to E7; the replay waits for the end of onboarding; `PATCH /v1/me` sends both answers in one call; `onDistrict` tells the composition root. Product answered the ordering question: **the name and the district first** |
| **TD-5** | **critical** — a substitution could be seen on R8 and accepted with the offer. *A flag on a row is not consent* | R9/R10 built. Per line, starts undecided with **no constructor that produces agreement**, treats undecided as **not** agreed, blocks acceptance until every proposal is answered, and **refusing sends the line to the child request** |
| **TD-4** | The sign-in chain E4→E8 **was wired to nothing**, and signing in was half done — the store learned who verified and the runtime did not | The root renders E4–E8; a new `onVerified` port tells the composition root at the moment the server says so; authority is answered from §9's atomic-self-subject invariant. **A grant over someone else is NOT inferred** |
| **TD-19** | `isBuilt` meant *"has a contract"* while its docstring promised *"nothing renders a control that leads to a screen that is not here"*. **R1's «لمن؟» drew the SEARCH screen over the request the patient had just built** | `isBuilt` now means **contracted AND drawable**. S1 stays deliberately in, with the reason stated. **The navigation gates could not see this** — they prove the *contract* graph is sound, and every one of these passed that |
| **TD-0a** | `layer-check` scanned only `.ts`, **so the app layer stopped being checked when it became `.tsx`** | Extended, **and proven with a rejecting case** |
| **TD-0b** | Build output emitted beside sources, so tests ran against a **stale build** | Project references corrected, stray output **banned by layer-check** |
| **TD-0c** | Prices rounded to the nearest thousand — **8,500 displayed as «٩ ألف»** | Exact formatting, with a test asserting **two different totals never print identically** |

---

## 4. What the register teaches

Four patterns worth internalising before you add anything to it.

**1. Corrections are recorded, not overwritten.** TD-20 carries two corrections
in its own text. TD-3 says outright: *"This item used to say no transition existed
at all, which was wrong and understated the code while overstating the gap."* The
register is more useful as a history of what was believed than as a snapshot.

**2. "Not built yet" and "cannot be built yet" are different facts, and only one
is a scheduling question.** `screens/graph.ts` says this at the `NO_COMPONENT`
list, and ten of the twenty open items name the *decision* they are waiting for
rather than the work.

**3. Blocked items state precisely what would unblock them.** Not "needs design"
but *"needs a spoken-content decision for composite cards"*. Not "needs product"
but *"needs a Blueprint quantity, after which it belongs beside
`MAX_REQUEST_LINES` in `marketplace/rules.ts`"*.

**4. The register records what a defect cost a *user*, not what it cost the
build.** «١ دقائق» is described as *what a patient reads at the exact moments the
app is trying to be reassuring.* A wrong clock time is *"confidently wrong rather
than merely inconvenient."* That framing is why these items get fixed.

### Adding an item

```js
{
  id: "TD-nn",
  description: "What is wrong. Include what you measured, not what you assume.",
  impact: "What it costs a USER. Name the screen and the moment.",
  priority: "critical | high | medium | low",
  owner: "<one of the 12 services, or platform-foundation | design>",
  slice: "Where it will be fixed — or 'Blocked — <what would unblock it>'",
  status: "open | partially addressed",
  note: "optional — what has already been done",
}
```

Then cite `TD-nn` in the source comment where the compromise lives.
`tools/debt-check.mjs` verifies the citation resolves.
