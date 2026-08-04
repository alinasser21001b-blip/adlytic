# 11 — Runtime and implementation

How the application actually works: startup, the composition root, dependency
injection, the effect loop, caching, offline, storage, synchronisation,
background work and event flow.

---

## 1. Startup, in order

```
index.html
  └─ apps/patient/web/main.tsx
       1. if VITE_MOCK_API=1 → dynamic import("./mock.js") → installMockApi()
       2. host = browserHost(globalThis.location.origin)
       3. { runtime } = await createRuntime(host)
       4. createRoot(document.getElementById("root")).render(<App rt={runtime} />)
```

Four things worth knowing about those four lines:

1. **The mock is dynamically imported behind a flag.** Unset the flag and the
   module is never imported, so **it never reaches the bundle** — it lands in its
   own 3.6 kB chunk. A real backend replaces it *by absence*.
2. **`baseUrl` is `location.origin`.** The dev server serves the app and the API
   together, so there is no base URL to configure and no CORS to arrange.
3. **Build, then mount.** The runtime must exist before the app can render.
4. **`main.tsx` holds no dispatcher of its own.** The version that did had to
   call `usePatientApp` to get one, and thereby **ran a second independent copy
   of the application state** beside the one `App` owns.

### Async startup inside `createRuntime`

```
deviceId = await deviceIdFrom(host)     // read from store, mint only if absent
sink     = null                          // where the app is listening, once mounted
now      = () => host.clock()            // §21: the correction point for server time
env      = { now, newId, online }
http     = makeHttp(baseUrl, fetch)
ports    = { catalogue, identity, marketplace, media, requests }
```

**The device id is minted once and kept.** The verify contract binds a session to
it, so *a value that changes between launches would ask the patient to verify
again every time they opened the app.*

**`sink` is null before mount and null again after unmount, and both are real
states.** A runtime is built *before* the app can be rendered, so anything that
resolves in that window has nowhere to go — and dropping it is the honest
outcome: *an offer nobody is on screen to see is an offer the next read returns
anyway.*

---

## 2. The composition root

`apps/patient/src/main/runtime.ts`.

> TD-1 has said since the first slice that nothing constructs a Runtime and
> nothing mounts App.tsx, so every screen, the reducer, the ports and the effect
> loop were **proved in isolation and the assembled application had never started
> once.** This is the assembly.
>
> It is the **ONLY** file allowed to read a clock or a random source. Every other
> module takes them as parameters, which is what makes the domain deterministic
> and the store testable; the values have to enter somewhere, and **this is the
> named door.** `tools/layer-check.mjs` enforces that it is the only one.

### What it constructs

| Field | Purpose |
|---|---|
| `catalogue`, `identity`, `marketplace`, `media` | The four ports the effect runner uses |
| `env` | `{ now, newId, online }` |
| `deviceId` | Stable per install |
| `startFlush(outbox)` | Hands the **store's** outbox to the flusher |
| `emit(event, attrs)` | Validates against the closed set, then logs |
| `capture()` | Camera, **or nothing** if the host has none |
| `telemetry` | §8 record sink |
| `connect(send)` | The runtime → app channel; returns its own undo |
| `ticks(onTick)` | The 1 Hz clock; returns its own undo |
| `onVerified`, `onDistrict` | Facts the store may not derive |
| `authority()` | Asks `Authority.authorise` for real |
| `onEffectFailed(effect, cause)` | **Required, not optional** |

### Three details that were each a bug

**`emit` validates the event name.** A name outside `BUSINESS_EVENT` is a defect
in the caller, *and saying so is more useful than sending it.*

**`onEffectFailed` is required.** An effect that rejected used to become an
unhandled promise rejection — `void performEffect(...).then(...)` with no catch —
so the one failure mode the runner is *designed* to produce arrived as a warning
in a console nobody reads. Making it a required field means **the entry point
cannot be written without deciding where failures go.** It takes the effect as
well as the error, because *"something threw" is not actionable and "verifyCode
threw" is.*

**`connect` exists because two things happen that nothing the user did caused:**
a pharmacy answers, and a camera returns a photograph. Both arrive while the app
is idle. The **app registers the sink**, not the host, because the runtime has to
be built before the app's dispatcher exists — and `web/main.tsx` once filled that
gap with a no-op, so *an offer that arrived was read, validated and thrown away,
and R7 counted zero forever no matter how many pharmacies replied.*

---

## 3. Dependency injection — the `Host` interface

`apps/patient/src/main/host.ts`. Not a framework: an interface with nine members.

| Member | Browser implementation | Why it is injected |
|---|---|---|
| `baseUrl` | `location.origin` | *A build that guesses its own backend is a build that can point at the wrong one* |
| `clock()` | `Date.now()` | The domain may not read a clock; the root corrects it |
| `newId()` | `crypto.randomUUID()` | Outbox ids and idempotency keys |
| `online()` | `navigator.onLine` | **Advisory only** — the outbox remains the authority on whether something was sent |
| `store` | `localStorage` (fail-soft) | D28: the cache must be able to die with the session key, which only a real store can honour — *so this is an interface, never a Map* |
| `sleep(ms)` | `setTimeout` | Retry backoff and the tick loop, substitutable in tests |
| `random()` | `Math.random()` | Jitter, deterministic under test |
| `camera` | `<input type="file" accept="image/*" capture="environment">` **or `null`** | *A host that cannot take a photograph says so by returning null rather than by pretending* |
| `log(line)` | `console.log` | Structured lines |

**The camera answers with a local uri and nothing else.** It used to answer with
an `imageId` too, *which a platform cannot know* — an id is minted by the media
service when the bytes arrive, so the interface was asking the host either to
talk to the API (a host that does that is not a host) or to make one up.

The browser camera also handles a real cross-browser problem: **dismissing the
picker fires no `change` event in any browser**, so the promise would never settle
and R2 would sit on «تصوير» for ever. It listens for `cancel` where it exists and
falls back to a `focus` + 500 ms check.

**`localStorage` writes are fail-soft**: *a full or disabled store is not a
reason to lose the app — the cache is an optimisation, and every read path
already treats absence as normal.*

---

## 4. The store, and the effect loop

### The round trip

```
        intent
user ────────────▶ dispatch(state, intent, env, authority)
                        │
                        ├──▶ next state ──▶ render
                        └──▶ effects[]  ──▶ perform(effect, ports)
                                                  │
                                                  ▼
                                             port → HTTP
                                                  │
                                              intent ──▶ back to dispatch
```

**No port result ever touches a screen directly.** The reducer is the only door —
which is what keeps "never trust the client" checkable.

**Each effect returns at most one intent.** *An effect that wants to say two
things is two effects, and keeping that rule here means the runner cannot become
a second reducer.*

### The React binding, and the bug it exists to prevent

`usePatientApp` keeps **state and pending effects in ONE reducer**:

> The previous version pushed effects onto a ref from inside the `setState`
> updater. **An updater must be pure**: React re-invokes it — twice on every
> render under StrictMode, and again when a concurrent render is discarded and
> replayed — so every re-invocation appended the same effects again. **The
> observable failure is a patient receiving two verification SMS for one tap and
> the outbox being flushed twice concurrently.**

Effects are **drained by identity, not by count**: if another intent landed
between the render and the drain, its effects are a *different array* and survive.

`perform` runs **after the state is committed**, so an effect can never observe a
state the user has not been shown.

### The ten effects

| Effect | Runner does | Answers with |
|---|---|---|
| `search` | `catalogue.search(query)` | `searchResolved` |
| `requestCode` | `identity.requestCode(e164)` | `codeIssued`, or **nothing** on failure — *the absence of `codeIssued` IS the answer; inventing a synthetic challenge would put a fake id in the session* |
| `verifyCode` | `identity.verify(...)` | `authenticated` \| `codeJudged` \| `codeCheckFailed` |
| `acceptOffer` | `marketplace.accept(...)` | `holdConfirmed` \| `offerGone` \| `openOffer` \| **nothing** on network failure |
| `saveProfile` | `identity.updateMe(name, districtId)` | `profileSaved` \| `profileRefused` \| `profileSaveFailed` |
| `uploadPrescription` | `media.upload(localUri, subjectId)` | `attachPrescription` \| `uploadFailed` |
| `flushOutbox` | `startFlush(outbox)` | nothing — delivery reports through the store |
| `emit` | `emit(event, attrs)` | nothing |
| `capturePrescription` | `capture()` | nothing — the camera answers via `connect` |

The runner ends with an exhaustiveness check:

```ts
default: { const unhandled: never = effect; throw new Error(...) }
```

> The app shipped with **two runners**: this one, complete, imported by nothing,
> and a copy in `App.tsx` that never handled `requestCode` or `verifyCode`. A
> patient submitting a phone number emitted an effect that **fell on the floor**,
> and nothing said so — because an unhandled case in a switch is just a switch
> that ends. **This makes the omission impossible to compile.**

### The two facts the store may not derive

`onVerified` and `onDistrict` are separate ports rather than reducer state,
because §5 rule 2 forbids the store from deriving a permission, and the
composition root is the only thing positioned to answer `authority()`. Both are
called **before** the corresponding intent is returned, so *the authority the
reducer reads on the very next dispatch already knows.*

Without `onVerified`, "a patient who had just verified their number was refused
order scope on the request they verified in order to send" (TD-4). Without
`onDistrict`, "every request went out with `districtId: ""`" (TD-18).

---

## 5. HTTP transport

**One transport. Every byte that leaves the app goes through `infra/http.ts`.**

> One transport rather than fetch-per-port, because the rules that make the
> network survivable are cross-cutting and must not be re-remembered per call.

| Rule | Implementation |
|---|---|
| Every response classified identically | `@dawai/net` `classify(status)` — a 409 is a duplicate **everywhere** and never a failure somewhere |
| A network error is **transient** | *A phone walking out of coverage is normal operation in this product, not an exception* |
| A **cancellation is not a network failure** | Aborts are named **before** the network case (an `AbortError` is an `Error` like any other) and classified `permanent` with reason `CANCELLED` — *retrying something the caller deliberately abandoned is the transport overruling it* |
| Every state-changing call carries `idempotency-key` | Set once at enqueue, stable across retries |
| `fetch` is **injected** | Not for testability alone — so this module works from React Native, a web review and a Node test *without believing three different lies about what the global environment holds* |
| Multipart sets **no** content-type | The platform writes it with the boundary it generated; a hand-written header without that boundary produces a body no server can parse |
| Body parsing never guesses | `JSON.parse` in a try; `null` otherwise. **The caller knows the declared shape; the transport does not** |

Methods: `get`, `post`, `patch`, `postForm`.

---

## 6. Caching

**Exactly one thing is cached: catalogue search.** Deliberately.

`infra/catalogue.ts`:

- Every **fresh** response is written through to the cache.
- A **failed** fetch falls back to it, answering `cached` **with the WRITE
  time** — *so the age the screen shows is when the data was true, not when it
  was retrieved.*
- A **cancelled** search does **not** fall through: *nobody is waiting for it —
  they typed something else — and answering it from the cache would put a stale,
  age-labelled result into a race it should have left.*
- Cached rows are re-validated through `isHit` on the way out: **the cache is
  another untrusted source** — it holds what an older build wrote.

**What is deliberately NOT cached** — `infra/requests.ts`:

> F2 caches search because a catalogue is the same tomorrow; **an offer is a live
> commitment with a price and a state, and showing a stale one would tell a
> patient a pharmacy is holding something it has withdrawn.** A failed read is a
> failed read.

The cache is a **port** (`SearchCache`), not a `Map`, because where bytes live is
a platform decision and **D28 requires the encrypted cache to die with the
session key — which only an injected store can honour.**

Storage layout: `dawai.search.<query>` → `{ value, at }`; `dawai.deviceId`. An
entry that fails to parse is treated as **absent** — *"a cache entry we cannot
parse is one an older build wrote in a shape this one does not know; the network
path runs and rewrites it."*

---

## 7. Offline and the outbox

### The two rules that carry the weight

> Iraqi mobile data drops routinely, so **offline is a normal state rather than an
> error.** Two rules carry the weight: a queued request is **NEVER** presented as
> sent, and a replay after reconnection must land **exactly once.** A duplicate
> reservation or a duplicate dispense record would be a **clinical defect**, not
> an inconvenience.

### The flush engine — `infra/flush.ts`

**One flush at a time, per outbox.** A module-level `inFlight` promise:

> Two concurrent flushes both see an item as `queued`, both mark it sending, and
> both POST it. The idempotency key means the server keeps one write, but the
> second reply lands on an item the first already resolved and the later
> `onChange` snapshot overwrites the earlier — **so the store's outbox goes
> backwards.** A single lane is the only shape where "exactly once" is a property
> rather than a hope.

Callers fire this on connectivity change, app open and manual retry — all three
can arrive together — so a second call **joins** the run in progress.

**One item at a time, in order.** *Parallel delivery would be faster and wrong:
the outbox's ordering promise is per subject, and the simplest correct
implementation of "never overtake" is "one lane".*

**The live outbox is re-read between items** via `deps.current()`:

> `onChange` only pushes OUT. Without a way back IN, a flush works from the
> private copy it started with, and **a user who cancels a queued request on R13
> mid-flush watches it send anyway** — the code even *claimed* to re-read "the
> live outbox" while re-reading its own snapshot.

**`merge(mine, live)`** — both statements matter:

> The live outbox wins on **membership**; this run wins on the **item it is
> holding.** The store may have enqueued or cancelled since this run began, so its
> item set is authoritative — but the store has not seen the attempt counter this
> run just incremented. **A terminal decision the store made — cancelled — always
> wins.**

**Head-of-line blocking is per subject.** A subject whose head item gave up this
run is added to `blocked`, so later items for that subject wait — *or writes
overtake each other.*

### Per-item delivery

```
POST path  (operation is stored as "POST /v1/requests" — the declared route,
            split here rather than re-derived, so the outbox row a user reads
            and the call that is made cannot disagree)
  accepted  → onAccepted(item, body) → markAccepted
  duplicate → markDuplicate → accepted     ← 409 IS success
  permanent → markRejected
  transient → shouldRetry? sleep(delayFor(attempt, policy, random)) : requeue(markRejected(...))
```

`onAccepted` exists because the 201 body carries **the only handle the app will
ever have** on the thing it just created:

> POST /v1/requests answers with `{ request, windowEndsAt, branchesAsked }`, and
> the request id in there is what every later call about it is keyed by.
> **Dropping the body meant the app sent a request and then had no way to ask
> about it, so R7 counted zero offers forever.**
>
> The body is `unknown` and **stays that way** — this module delivers writes; it
> has no business knowing what a request looks like.

It fires **only for `accepted`**: a duplicate means an earlier attempt landed and
*the server is not obliged to replay its body*.

---

## 8. Synchronisation — the watch loop

**There is no push. Offers arrive by polling** (TD-21).

```ts
watch(requestId, windowEndsAt):
  loop:
    if windowEndsAt !== null && clock() >= windowEndsAt  → stop
    seen = await requests.read(requestId)
    if failed → sleep(3s); continue        ← a dropped connection is not the end of the wait
    for each offer → onIntent({ kind: "offerArrived", offer })
    if responders.thinking === 0 → stop
    sleep(3s)
```

**Why it is honest rather than pretending to be push:**

> §8 says the patient is TOLD when pharmacies reply, and being told is a push
> notification — which a browser build cannot receive and a device build does not
> exist to. Reading the declared endpoint on an interval is the honest stand-in:
> **it produces the same intents a push would, from the same contract, so the app
> above this line cannot tell the difference and does not need to.** It is
> registered as TD-21 rather than left to look like the intended design.

**The window stop was a real bug fix.** Stopping only when every branch had
answered was wrong *in the direction that costs a patient something*:

> A branch that is asked and never answers is **ORDINARY** — it is why D09 has a
> window at all and why R11 exists — so `thinking` stays above zero indefinitely
> and this polled every three seconds for as long as the app was open. **On the
> longest window that is a request every three seconds for two days**, on the
> phones and the data plans this product is for.

`windowEndsAt` comes from the **server's** 201 (`windowEndsAtOf(body)`), read
defensively — *"a field that is not a number is a field we do not have"* — and
D09's windows are never computed client-side.

---

## 9. The tick loop

One timer for the whole app, at **1 Hz**, running **only while a screen that
draws a clock is on top**:

```ts
const SHOWS_TIME = new Set(["F1", "F2", "E6", "R7", "V2"]);
```

> Named rather than inferred, because "does this screen show time" is a fact
> about what each one renders and inferring it would mean guessing.

**Why 1 second:** E6 counts in seconds — «تكدر تطلب رمز جديد بعد ٤٥ ثانية» — *and
a countdown that lags its own unit reads as broken.* The minute-granular ones
(R7's window, V2's hold) cost a re-render they do not strictly need; **one timer
for the app is worth more than four that each know their own unit.**

**The bug it fixed:** `env.now()` is read during render, and nothing re-rendered.
*Measured in a browser: a six-minute hold still read «٦ دقائق» after two minutes,
and E6's resend counter stayed at forty-five seconds forever* — which is a dead
end on the way *into* the product, because the resend appears only at zero.

It is driven by `host.sleep` rather than a raw timer, *for the same reason the
clock is: this file is the one door those come through, and a test substitutes
both together.*

---

## 10. Event flow

### Client-internal

```
BUSINESS_EVENT (closed set of 12)
  ↓ store emits an { kind: "emit" } effect
  ↓ runtime.emit validates the name against the set
  ↓ host.log(JSON.stringify({ level, message, attributes }))
```

Emitted today: `search.unmatched` (F2, on `empty` only), `clinical.gate.refused`
(R1), `request.broadcast` (**only when broadcast, never when queued**),
`request.answered` (**on the first offer only** — the moment the wait stops being
open-ended), `reservation.confirmed`, `reservation.refused`.

Telemetry records carry event, `at`, `correlationId` and **dimensions, never
content** — *"a district id is a dimension, a medicine name is not."*

### Server-side (declared, not built)

54 events across 8 producers, each with a payload, a trigger, a side effect, an
audit requirement, a retry semantic and an idempotency key. Full catalogue in
`15-events.md`.

---

## 11. Background work

| Work | Where | Status |
|---|---|---|
| Outbox flush | Client, `infra/flush.ts` | ✅ built |
| Request watch (poll) | Client, `main/runtime.ts` | ✅ built (stand-in for push — TD-21) |
| UI tick | Client, `App.tsx` + `runtime.ticks` | ✅ built |
| Request window expiry → `unanswered` | Server | ❌ nothing fires it (TD-23) |
| Reservation expiry → `expired` | Server | ❌ no server |
| `reservation.expiring` at 30 and 5 minutes | notification-service | ❌ |
| Licence expiry sweep (60/30/7) | pharmacy-service | ❌ |
| Watch expiry at 14 days | notification-service | ❌ |
| Account deletion at 30 days | identity-service | ❌ |
| Deferred branch notification at opening time (D09) | notification-service | ❌ |

`dawai-platform/` **does** run a lifecycle worker — `npm run start:worker`, a
sweep every 30 s over its own state machine and notification outbox.

---

## 12. The development server

`platform/tools/devserver/api.mjs`. **Not product.**

> It answers exactly what the contract declares — the same statuses, the same
> shapes, the same refusals. **Where it invents, it invents DATA** (a catalogue
> of real Iraqi pharmacy stock, three pharmacies in Karrada) **and never
> BEHAVIOUR**: no endpoint here answers anything the contract does not describe.

- 9 catalogue rows including `i-tramadol` (`isControlled: true`), so **D42 is
  reachable**, and three prescription-required items, so **D18 is reachable**.
- 3 Karrada branches with the three honoured bands (`trusted`, `new`,
  `needs_attention`) and one closed.
- Covered districts `d1, d2, d3` — **deliberately not `d4`**, which the app's
  bundled list offers as uncovered, *so the declared `invalid_district` path is
  reachable rather than theoretical.*
- **Offers arrive on a timer**, because in the product they arrive when
  pharmacists answer — *the one honest way to show R7's wait without a pharmacy
  app.*
- The verification code is **printed to the terminal**, never returned in a
  response: *the contract does not carry it and returning it would be inventing a
  response field.*
- A prescription upload counts the bytes and discards them, logging
  «not stored (D18)».
- 8 MB image limit — a number this server needs in order to answer 413 at all;
  the real limit is the media service's and is not declared in the contract.

The same `handle` function is imported by `web/mock.ts` for the static preview
build — **one implementation of the contracts, not two that drift.**

### Walking scripts

```
node tools/devserver/smoke.mjs          the whole loop, screen by screen
node tools/devserver/smoke-offline.mjs  offline, wrong code, queued send
```

Neither is a gate. *They print what a patient would see and any error the page
raised, because **every defect found in the running app so far was found by
pressing a button rather than by reading.***

---

## 13. Runtime invariants

| Invariant | Held by |
|---|---|
| Only one module reads a clock or randomness | `tools/layer-check.mjs` + `Host` |
| The reducer is pure | It returns effects rather than performing them |
| An effect kind with no runner is a compile error | `never` exhaustiveness in `perform` |
| At most one intent per effect | The runner's signature |
| Exactly-once delivery | Client-minted idempotency key + single flush lane + 409-as-success |
| Per-subject write ordering | `readyToSend` + the `blocked` set |
| A cancel is never overtaken | `merge` — cancelled always wins |
| No stale offer is ever shown | Offers are not cached, at all |
| Cached search is always age-labelled | `Fetched.cached` carries `cachedAt`; the contract requires `showsAge` |
| A countdown never runs on an unsent request | `windowEndsAt` is null while `queued` |
| An unregistered telemetry name is reported, not sent | `runtime.emit` |
| A failed effect always reaches a handler | `onEffectFailed` is required |
