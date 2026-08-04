# 07 — Screen catalogue

Blueprint v3 declares **133 screens**. This slice **contracts 22** and **renders
17** of them — the figure `review/data.json` reports. The five contracted
screens that do not render are **S1** (the root substitutes for it, deliberately)
and the four in `NO_COMPONENT`: **R4, R5, R11, R13**.

Source of truth for the contracts:
`platform/apps/patient/src/screens/core-loop.contract.ts`.
Source of truth for the Blueprint: `docs/product/v3/phase0.js`.
Generated view: `review/index.html` (and `review/data.json`).

---

## 0. The 133 screens, by group

| Group | Range | Count | Contracted here |
|---|---|---|---|
| Entry | E1–E13 | 13 | E4, E5, E6, E7, E8 |
| Subjects | S1–S12 | 12 | S1 |
| Find | F1–F8 | 8 | F1, F2 |
| Request | R1–R13 | 13 | R1, R2, R3, R4, R5, R6, R7, R8, R9, R11, R13 |
| Reservation | V1–V8 | 8 | V1, V2, V4 |
| Account | M1–M15 | 15 | — |
| Pharmacy apply | PA1–PA9 | 9 | — |
| Pharmacy | P1–P31 | 31 | — |
| Operator | O1–O24 | 24 | — |
| **Total** | | **133** | **22 (16.5%)** |

---

## 1. What a screen contract contains

Every contracted screen declares, as a **type** (`@dawai/design`
`ScreenContract`), the answers to the three questions the brief says a user must
never have to ask:

| Field | Question it answers | Rule |
|---|---|---|
| `location.title` | **Where am I?** | Never a route name, never an entity id |
| `location.destination` | Which tab/plane it belongs to | A screen belonging to no destination is a screen the user got lost in |
| `purpose` | Why this screen exists | **One sentence.** If it cannot be stated in one, the screen does too much — and `auditContract` counts the sentences |
| `back` | **How do I go back?** | `pop` \| `dismiss(returnsTo)` \| `replace(with, why)` \| `none(why)` |
| `primary` | **What do I do next?** | **Exactly one**, or `null` with `noPrimaryBecause` |
| `primaryWhen` | The primary *for a given state* | Still exactly one at any moment |
| `secondary` | Alternatives | **Max 3** — beyond that a screen stops having an obvious next step |
| `states` | Every state, each with an intentional treatment | See below |
| `exits` | Every destination reachable from here | **A screen with no exit is a trap** |
| `telemetry` | Business events emitted here | From the closed set only |
| `persona` | patient \| pharmacy \| owner \| entry | Role isolation, visible in the contract |

### The state treatments

| Kind | Must carry | Rule |
|---|---|---|
| `loading` | `skeletonMatchesContent: true` | |
| `empty` | `explains`, `action`, `isSuccess` | **§22 — an empty state is the highest-attention moment in the product.** A non-success empty **must** offer one thing to do; spending that moment on "no data" wastes the best teaching opportunity there is |
| `error` | `whatFailed`, `workPreserved`, `action` | **§23 — "something went wrong" is a literal build failure.** `auditContract` regex-rejects it |
| `offline` (**blocked**) | `because` | Shows nothing, because the thing it does cannot happen without a connection. Owes a **reason** |
| `offline` (degraded) | `readOnly`, `showsAge: true` | Shows something cached, and **must label how old it is** (§21) |
| `permissionRefused` | `stillUsable: true`, `alternative` | **Never a wall** |
| `success` | `nextStep` | |

`auditContract()` returns the reasons a contract is not finished.
`tools/ux-check.mjs` additionally verifies the screen id **exists in Blueprint
v3** and that the contract covers **every state the Blueprint declares** for it.

---

## 2. Entry screens

### E4 — «ليش نحتاج رقمك» (Why we need your number)

| | |
|---|---|
| **Purpose** | Explain before the one hard ask |
| **Destination** | `entry` · **Persona** `entry` |
| **Inputs** | The pending intent (D26) — the request the guest already built |
| **Outputs** | Navigation to E5 |
| **Primary** | «أدخل رقمي» → E5 (1 tap) |
| **Back** | `dismiss → S1`. *Not a pop: the action the patient was taking is preserved (D26), so leaving returns them to it rather than unwinding a stack* |
| **States** | none declared |
| **Exits** | E5 |
| **Permissions** | None — it is the screen a guard sends a guest to |
| **Rules** | **§3.1** — the account is requested at the first action that needs one, with the reason stated, never as a wall on launch. Promises the pharmacy sees **the first name only** |
| **Dependencies** | `@dawai/session` `PendingIntent`; `patientInfoStrip` colour (the «طلبك محفوظ» band — a delivered colour with no semantic role, measured explicitly) |

**Special navigation behaviour.** «مو هسه — رجعني لطلبي» must return to the
*request*, not to Today. A contract's `back` names one fixed screen, so the
reducer distinguishes the two cases by whether a pending action exists. This was
a real defect (TD-19).

### E5 — «رقم موبايلك» (Your mobile number)

| | |
|---|---|
| **Purpose** | Take a number |
| **Inputs** | Free text — held **verbatim**, never rewritten as you type («a field that rewrites keystrokes is a field people fight») |
| **Outputs** | `POST /v1/auth/phone` → `{ challengeId, resendAfter }` |
| **Primary** | «أرسل الرمز» → E6 · **Back** `pop` |
| **Errors** | «الرقم مو مكتمل» + «صحّح الرقم». `MALFORMED_NUMBER` and `UNSUPPORTED_COUNTRY` are **two different sentences** |
| **Offline** | **`blocked`** — «ما نكدر نرسل الرمز بدون نت — الرسالة تنرسل هسه أو ما تنرسل» |
| **Rules** | Iraqi mobile prefixes 75/77/78/79; accepts four written forms + Arabic-Indic digits, spaces and dashes |
| **API** | `POST /v1/auth/phone` |

### E6 — «الرمز» (The code)

| | |
|---|---|
| **Purpose** | Verify the number |
| **Inputs** | 6 digits, cleaned (`cleanCode`) |
| **Outputs** | `POST /v1/auth/verify` → account + subject, or one of four refusals |
| **Primary** | «تأكيد» → E7 · **Secondary** «غيّر الرقم» → E5 · **Back** `pop` |
| **States** | `loading` (on the control, not screen-wide), `error` «الرمز مو صحيح», `offline` **blocked** |
| **Rules** | 5 attempts · 10-minute code lifetime · 45-second resend cooldown · **expiry checked before the attempt is counted** · a verdict for a non-current challenge is discarded |
| **Related** | `Verification.ChallengeMachine`; `identity-service` |

**Four failures, four recoveries** — the screen must not collapse them. It counts
down the resend in **seconds**, which is why the app ticks at 1 Hz.

### E7 — «اسمك» (Your name)

| | |
|---|---|
| **Purpose** | **Minimum** identity for a pickup counter — the word *minimum* is the whole specification |
| **Inputs** | Free text; trimmed and collapsed and **nothing else** — no transliteration, no capitalisation, no "correction" |
| **Outputs** | Held until E8; sent together with the district |
| **Primary** | «كمّل» → E8 · **Back** `pop` · **Error** «محتاجين اسمك» |
| **Rules** | Shows the patient **what will actually be shared** — `firstNameOnly()` — because E4 promised it and a promise kept by a different screen is one nobody can check |

### E8 — «منطقتك» (Your district)

| | |
|---|---|
| **Purpose** | Where to search from |
| **Inputs** | A search box over the **bundled** district list, matching on district **or city** so a patient who thinks in city names finds their district |
| **Outputs** | `PATCH /v1/me { name, districtId }` — **both in one call** |
| **Primary** | «خلص» → S1, then D26's replay · **Back** `pop` |
| **Errors** | «ما اخترت منطقة»; `OUTSIDE_COVERAGE` → E12's sentence (**our failing, not theirs**) |
| **Permission refused** | «اختر منطقتك من القائمة — ما نحتاج موقعك» — **never a wall**; the list was always the route |
| **Rules** | **Location is never requested.** The bundled list is a *design requirement*: a picker that needs a network call cannot be shown to a patient with no signal, and one that asks for GPS is the moment a cautious person stops |
| **Known gaps** | **TD-17** — the four bundled districts are placeholders; Blueprint v3 carries no coverage map. **TD-25** — no declared treatment for a save that could not be *made* |

---

## 3. Today

### S1 — «اليوم» (Today) ⚠️ *contracted; visual open to the designer*

| | |
|---|---|
| **Purpose** | What is happening right now |
| **Destination** | `today` · root of the tab |
| **Primary** | «أطلب دواء» → R1 · **Secondary** «لمن؟» → S2, «سجل الاستلام» → V8 |
| **Back** | `none` — *"root of the Today tab; the OS gesture exits the app"* |
| **States** | `loading`; **two different `empty` states**; `offline` (readOnly, showsAge); `error` |
| **Exits** | R1, S2, V2, V8 |
| **Guards** | `requireSession` |

**The two empty states are the most instructive thing in the catalogue.** §22
names both and the Blueprint declares both:

- `isSuccess: false` — **a brand-new account with nothing yet.** It must
  **teach**: «هنا راح تشوف حجوزاتك وأدويتك اللي استلمتها» + «أطلب أول دواء».
- `isSuccess: true` — **a well-managed patient on an ordinary day.** It is
  **reassurance, not absence**: «كل شي تمام — ما عندك شي يحتاج انتباهك هسه», and
  `action: null`, because *offering an action here would invent urgency the user
  does not have.*

`model/view.ts` `treatmentFor()` matches on `isSuccess` for exactly this reason —
*picking the first one would greet a new user with "everything is fine" and no
way to start.*

**Why S1 has no component but is still `isBuilt`.** Its visual is open to the
designer. It is nonetheless the **only** missing screen the app root substitutes
for: every exit naming S1 means "leave this and go to Today". Removing those
exits would take «تمام — خبروني» off R7's offline state and leave a live request
with no acknowledged way out — a worse answer than a documented stand-in. And the
app **starts** on it.

---

## 4. Find

### F1 — «ابحث» (Find)

| | |
|---|---|
| **Purpose** | Start anything new · **Destination** `find`, tab root |
| **Primary** | «دوّر على دواء» → F2 · **Secondary** «صيدليات قريبة» → F5, «صوّر وصفة» → R2 |
| **Back** | `none` — root of the Find tab |
| **States** | `empty` (teaching: «دوّر باسم الدواء، أو صوّر الوصفة» + «صوّر وصفة»); `offline` readOnly showsAge |
| **Guards** | **`[]` — deliberately unguarded.** *A guest browses and searches before giving us anything (§3.1)* |

### F2 — «نتائج البحث» (Search results)

| | |
|---|---|
| **Purpose** | Find a catalogue item **the way people actually type** |
| **Inputs** | The query, normalised through six Arabic folding rules |
| **Outputs** | `GET /v1/catalogue/search` → rows carrying the **three clinical flags** |
| **Primary** | «أطلب هذا الدواء» → R1 · **Secondary** «شوف التفاصيل» → F3 |
| **States** | `loading` · `empty` **§13.1** «ما لكيناه بقائمتنا — ممكن يكون موجود بالصيدليات» + «أطلبه بالاسم مع صورة» · `error` «ما كدرنا نوصل للبحث» · `offline` readOnly **showsAge** |
| **Telemetry** | `search.unmatched` — **on `empty` only, never on `error`** |
| **Guards** | `[]` |
| **Rules** | `Search.availability()` asks the clinical gate per row, so **D42 refuses a controlled item at the moment it is tapped, not after a round trip.** Cached rows carry their age and are never presented as live. A superseded search is **aborted** |

---

## 5. Request

### R1 — «طلب جديد» (New request)

| | |
|---|---|
| **Purpose** | Assemble the lines to ask for |
| **Destination** | `modal` · **Back** `dismiss → S1` |
| **Inputs** | Catalogue hits, pack counts, urgency, subject, prescription image |
| **Outputs** | A `Draft` value (survives an interruption unchanged — D26) |
| **Primary** | «كمّل» → R6 · **Secondary** «ضيف دواء ثاني» → F2, «صوّر الوصفة» → R2, «لمن؟» → R4 |
| **States** | `empty` «ضيف الدواء اللي تحتاجه — تكدر تضيف لحد ٨» + «دوّر على دواء» · `error` «هذا الدواء ما ينطلب من التطبيق» + «شوف السبب» → F4 |
| **Telemetry** | `clinical.gate.refused` |
| **Guards (declared)** | `requireSession`, `requireOrderScope`, `blockMemorialised` |
| **Rules** | Max 8 lines; duplicate medicine merges; packs < 1 removes; one photo attaches to every line that needs one; the remaining-line count is shown so the limit is a fact rather than a wall |

> **TD-24 — an unresolved contradiction, and the reason the product works.** The
> Blueprint gives R1 those three guards, but **§3.1 forbids a sign-in wall** and
> **D26 preserves the interrupted work** — E4 is drawn showing a draft only a
> *guest* could have built. Both cannot hold. Today `addItem` calls `navigate`
> rather than `open`, so **it never asks the guards**, and that bypass is the
> only reason the loop closes. It is visible: R2's «اكتب الاسم بدال الصورة» goes
> through the declared exit and *does* run the guards, so a guest is sent to sign
> in by a control that offered to let them type instead.

### R2 — «صوّر الوصفة» (Photograph the prescription)

| | |
|---|---|
| **Purpose** | Photograph the paper · **Primary** «صوّر» → R3 |
| **Secondary** | «اكتب الاسم بدال الصورة» → R1 |
| **States** | `permissionRefused` (`stillUsable: true`, alternative stated) · `error` «ما نكدر نقرأ الوصفة من هذي الصورة» + «صوّر مرة ثانية بضوء أكثر» |
| **API** | `POST /v1/prescriptions` — multipart `image` + `subjectId` → 201 `{ imageId }`, 413, 415 |
| **Events** | `prescription.uploaded` |
| **Rules** | **D18** — Phase 0 reads nothing. **D37** — the failure names the condition, never the person. The photograph **survives** an upload failure |

### R3 — «شوف الصورة» (Check the image)

| | |
|---|---|
| **Purpose** | Confirm the image is readable **before it travels** |
| **Primary** | «واضحة — كمّل» → R1 (this is what triggers the upload) · **Secondary** «صوّر مرة ثانية» → R2 |
| **States** | none |
| **Rules** | **The patient judges legibility, not an algorithm** (D18). `LEGIBILITY_CHECKS` states what "clear" means: drug name, dose, doctor's stamp. **There is deliberately no automatic path from captured to attached** |

### R4 — «لمن الدواء؟» ❌ *contracted, no component*

Choose the subject. `dismiss → R1`. Exits R1, S3. *"The subject switcher; arrives
with the family slice."* Changing the subject does **not** clear the lines.

### R5 — «شكد مستعجل؟» ❌ *contracted, no component*

Set the window honestly. Exactly three options (**D09**). *"R6 sets it inline
today."*

### R6 — «تأكيد الطلب» (Confirm the request)

| | |
|---|---|
| **Purpose** | Final check before it goes |
| **Primary** | «أرسل الطلب» → R7 · **Secondary** «غيّر الاستعجال» → R5 |
| **States** | `error` «ما وصل الطلب» + «أعد الإرسال» · **`offline` `readOnly: false`, `showsAge: true`** — D27: a queued request is never presented as sent |
| **Exits** | R5, R7, R13 |
| **Telemetry** | `request.broadcast` — **only when actually broadcast** |
| **API** | `POST /v1/requests` → 201 `{ request, windowEndsAt, branchesAsked }` |
| **Rules** | `Draft.validate()` re-asks both clinical gates and the line-count rule **at the action** — a disabled button is a courtesy, never a control |

### R7 — «ننتظر الردود» (Waiting for answers)

| | |
|---|---|
| **Purpose** | **Make the wait legible** |
| **Back** | `dismiss → S1`. *The request is live; leaving drops to Today with it still running, which the screen says* |
| **Inputs** | `GET /v1/requests/{id}` → `responders { asked, replied, thinking }` + offers |
| **Primary** | «شوف العرض الواصل» → R8 |
| **`primaryWhen`** | `offline` → «تمام — خبروني» → S1 · **`empty` → `null`** |
| **Secondary** | «ألغِ الطلب» → S1 |
| **States** | `loading` · `empty` «ننتظر أول رد» (`action: null`, `isSuccess: true`) · `error` «انقطع الاتصال» + «أعد الاتصال» · `offline` readOnly showsAge |
| **Telemetry** | `request.answered`, `request.unanswered` |
| **Known gaps** | **TD-21** polling not push · **TD-23** the window never elapses · **TD-20** «ألغِ الطلب» does nothing |

**Why `empty` has a `null` primary.** «شوف العرض الواصل» over zero offers
promises an offer that does not exist and leads to an empty list. `resolveView`
keys on **presence, not truthiness**, so a declared `null` means "this state
offers nothing" rather than "no opinion" — using `??` there is exactly how R7
kept offering the button after the contract said not to.

### R8 — «قارن العروض» (Compare the offers)

| | |
|---|---|
| **Purpose** | Choose, **with the reasons visible** |
| **Primary** | **`null`** — `noPrimaryBecause: "Every offer is its own action; a screen-level primary would choose a pharmacy on the patient's behalf, which D12 forbids."` |
| **Secondary** | «شوف تفاصيل العرض» → R9 · **Exits** R9, V1, R7 |
| **States** | `loading` · `empty` «ما وصل عرض بعد» + «ارجع للانتظار» · `error` «هذا العرض انسحب قبل ثواني» + «شوف العروض الباقية» |
| **Rules** | `Offers.forReading` orders by coverage then price then arrival — **not a ranking** (D12). Coverage as «٢ من ٣», never a percentage. Prices exact, never rounded. A withdrawn offer **stays, marked unavailable** |
| **Known gap** | **TD-12** — the card announces only its label to a screen reader; price, coverage, substitution flag, distance and band are all silent |

### R9 — «تفاصيل العرض» (Offer detail)

| | |
|---|---|
| **Purpose** | One offer in full, line by line |
| **Inputs** | The offer + `ConsentState` — every substitution starts **undecided** |
| **Primary** | «احجز من هنا» → V1 · **Exits** V1, R8, R10 |
| **States** | `error` «هذا العرض انسحب» + «ارجع للعروض» |
| **Rules** | **§4 R10** — per-line consent, never pre-ticked, blocking acceptance. **D19** — the proposal shows **who** made it and whether their licence is verified. The pharmacist's note is shown **verbatim**; the app never paraphrases a clinical statement. Refusing sends the line to the child request (D06) **and the screen says so** |

### R11 — «ما رد أحد» ❌ *contracted, no component*

The honest empty case. Primary «وسّع البحث» → R7; secondary «خبّرني إذا توفّر» →
R12, «جرّب بعدين» → S1. Telemetry `request.unanswered`. **Design package entry:
«OPEN to the designer: Everything. Not rendered.»** — which is what blocks TD-23.

### R13 — «بانتظار الإرسال» ❌ *contracted, no component*

Everything waiting to send (**D27 — the outbox is a screen**). No primary:
*"a list of pending work — the only action is per-item cancellation."* Empty
state is a **success** («ما في شي بانتظار الإرسال»). Item wording comes **only**
from `@dawai/offline` `describe()`.

---

## 6. Reservation

### V1 — «نحجز لك» (Holding for you)

| | |
|---|---|
| **Purpose** | The moment between choosing and confirmation |
| **Back** | **`none`** — *"a hold request is in flight; the screen resolves to V2 or V4 on its own"* |
| **Primary** | **`null`** — *"the pharmacy is being asked to set stock aside; the patient waits"* |
| **States** | `loading` only · **Exits** V2, V4, R8 |
| **Telemetry** | `reservation.confirmed`, `reservation.refused` |
| **Rules** | **No timer.** The clock starts at `held`, not here |
| **API** | `POST /v1/offers/{id}/accept` with an idempotency key minted **once by the reducer** |

### V2 — «محجوز لك» (Reserved for you) — *the screen that must never fail*

| | |
|---|---|
| **Purpose** | The code, the clock, the address |
| **Destination** | `today` · **Back** `replace → S1` (*"the reservation lives on Today; there is no stack behind a notification"*) |
| **Inputs** | `Hold { reservationId, code, branchName, holderName, branchPhone, address, confirmedAt, expiresAt, totalMinor, lines[] }` |
| **Primary** | «الاتجاهات» · **Secondary** «اتصال بالصيدلية», «ألغِ الحجز» → V5 |
| **States** | `loading` · `error` «ما كدرنا نحدّث الوقت المتبقي» · **`offline` readOnly showsAge** — the code stays readable from cache and the countdown is labelled last known |
| **Telemetry** | `reservation.collected` |
| **Design** | The **only inverting surface in the patient app** — a light `patientCodePanel` on the dark ground, so the code reads like something printed. Code type role: **76pt**. Its contrast pairs are measured separately (`EXTRA_PAIRS`) |
| **Rules** | Code grouped in pairs for reading aloud; expiry stated as **Baghdad local wall-clock time**; the holder's name leads («حجزك باسم أم علي») |
| **Known gaps** | **TD-14** — «الاتجاهات» and «اتصال بالصيدلية» are **inert**; «ألغِ الحجز» is not rendered at all. **TD-11** — the caption ships at `#63726B`, not the delivered `#6B7A74`, which measured 4.10:1. **TD-6** — freshness is hard-coded live |

### V4 — «ما كدرت الصيدلية تحجز» (The pharmacy could not hold it)

| | |
|---|---|
| **Purpose** | They confirmed and then could not |
| **Back** | `replace → S1` — *"arrives by notification; there is no stack behind it"* |
| **Primary** | **«شوف العروض الجديدة» → R8** — **D39**: the request re-opens automatically, so the primary moves the patient **forward** rather than asking them to start again |
| **Secondary** | «أوقف الطلب» → S1 · **Telemetry** `reservation.refused` |
| **Rules** | Reached **only** on a real refusal. A dropped connection must never land here — *telling a patient their pharmacy declined because a connection dropped would be the app inventing a rejection nobody made* |

---

## 7. Contracted screens with no component

`screens/graph.ts` `NO_COMPONENT`:

| Screen | Reason |
|---|---|
| R4 | The subject switcher; arrives with the family slice |
| R5 | Urgency as a modal; R6 sets it inline today |
| R11 | The honest empty case; arrives with the marketplace slice |
| R13 | The outbox screen; arrives with the offline slice |

**`isBuilt(screen)` means contracted AND drawable.** It used to mean only
"contracted", and that produced the worst version of the defect it exists to
prevent (**TD-19**): R1's «لمن؟» rendered, was tapped, navigated successfully,
and the root's `default` drew the **search screen** over the request the patient
had just built. The navigation gates could not see it — they prove the *contract*
graph has no unreachable screen and no trap, and every one of these passes that.

**Nothing renders a control that leads to a screen `isBuilt` rejects.**

`NOT_YET_BUILT` lists every declared exit this build cannot honour: **F3, F4, F5,
R10, R12, S2, S3, V5, V7, V8** — each a real Blueprint screen (ux-check proves
it), each owned by a later slice.

---

## 8. Screen-level dependency map

| Screen | Domain | Models | Ports / API | Events |
|---|---|---|---|---|
| F1, F2 | `Clinical.gateRequestLine` | `search` | `CataloguePort` · `GET /v1/catalogue/search` | `search.unmatched` |
| R1 | `Clinical.gateRequestLine`, `Marketplace.checkLineCount`, `Marketplace.packs` | `draft` | — | `clinical.gate.refused` |
| R2, R3 | — | `prescription` | `MediaPort` · `POST /v1/prescriptions` | `prescription.uploaded` |
| R6 | `Marketplace.windowEndsAt`, `RequestMachine` | `draft`, `send` | outbox → `POST /v1/requests` | `request.broadcast` |
| R7 | `Marketplace.windowFor` | `send` | `RequestsPort` · `GET /v1/requests/{id}` | `request.answered`, `request.unanswered` |
| R8 | `Marketplace.accept/coverage`, `OfferMachine` | `offers` | (reads R7's data) | — |
| R9 | — (consent is app-level, owned by `clinical-engine`) | `consent`, `offers` | — | — |
| V1 | `ReservationMachine` | `reservation` | `MarketplacePort` · `POST /v1/offers/{id}/accept` | `reservation.confirmed/refused` |
| V2 | `ReservationMachine` | `reservation` | — | `reservation.collected` |
| V4 | `ReservationMachine` | `reservation` | — | `reservation.refused` |
| E5–E8 | `Verification`, `REFUSAL` | `onboarding` | `IdentityPort` · `POST /v1/auth/phone`, `POST /v1/auth/verify`, `PATCH /v1/me` | `account.created`, `subject.created` |

---

## 9. The generated gallery

`npm run review` renders **every contracted screen in every declared state** in a
real browser and produces:

| Artefact | Contents |
|---|---|
| `review/index.html` | The dashboard: progress, screens, gaps, graph, flows, analytics, refusals, design, shots, architecture |
| `review/data.json` | The same, machine-readable (`progress: { blueprintScreens: 133, contracted: 22, rendered: 17, remaining: 111, percentContracted: 16.5 }`) |
| `review/screenshots/` | One PNG per screen **state** — `E6-wrong.png`, `E6-expired.png`, `E6-exhausted.png`, `F2-offline.png`, `R1-empty.png`, `V2-held.html`, … |
| `review/responsive/` | Captures at 320 / 360 / 390 / 430 px |
| `review/.baseline.json` | The regression baseline — `added` / `removed` / `changed` / `unchanged` |
| `review/screens.sha256` | Content hashes |

Screenshots are **DOM renders of the real component tree, not device captures**
(**TD-2**): layout, hierarchy, typography, colour, spacing and tap targets are
verified; native gestures, platform chrome, safe-area insets, keyboard avoidance
and animation are **not**.
