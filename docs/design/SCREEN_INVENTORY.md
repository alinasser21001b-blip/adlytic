# Screen Inventory

> **Generated — do not edit.** `npm run design` derives this from
> `docs/product/v3/phase0.js`, the screen contracts, the shared screen
> registry and the navigation graph, merged with the design notes in
> `platform/tools/design/notes.mjs`. Regenerate rather than edit.

| | Count |
| --- | --- |
| Blueprint v3 Phase 0 screens | 133 |
| With an engineering contract | 18 |
| Rendered and photographed | 12 |
| Distinct states rendered | 28 |
| NOT IMPLEMENTED | 115 |
| Exits declared but BLOCKED | 10 |

**How to read this.** Part 1 is the 18 screens that exist,
each with everything a designer needs and nothing they have to ask for. Part 2
is the 115 screens that do not exist yet — design is needed
before Engineering can even write a contract for them.

Two words appear throughout and mean exactly one thing each:

- **FIXED** — a product decision already made in Blueprint v3 and already
  enforced by an automated check. A design that contradicts it cannot be built.
  Raise it as a Blueprint query; do not absorb it into the design.
- **OPEN** — genuinely yours. Engineering has no opinion and will implement
  whatever is specified.

---

## Part 1 — Screens with an engineering contract

---

### `S1` — اليوم

> **Today** · Blueprint group: Subjects · destination: `today`

**Purpose (fixed by Blueprint v3).** What is happening right now

**User goal.** Find out, in one glance, whether anything needs me today.

**Emotional target.** Reassurance. Most days the honest answer is 'nothing', and the screen must make that feel like good news rather than an empty app.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `loading` | a skeleton whose shape matches the content that is coming | skeleton must match the real content |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `teaching` — “هنا راح تشوف حجوزاتك وأدويتك اللي استلمتها” · action: **أطلب أول دواء** → R1 |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `quiet / success` — “كل شي تمام — ما عندك شي يحتاج انتباهك هسه” · no action, deliberately |
| `offline` | whether the content is read-only, and how old it is | read-only: yes · shows age: yes |
| `error` | what failed, whether the user's work survived, and one thing to press | “ما كدرنا نحدّث الصفحة” · work preserved: yes · action: **أعد المحاولة** → S1 |

Blueprint declares: `empty · quiet · loading · offline · stale`. **No state has been rendered — the designer works from this contract alone.**


#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **أطلب دواء** → `R1` (1 tap to outcome) |
| Secondary actions | لمن؟ → `S2`<br>سجل الاستلام → `V8` |
| Back | `none` — root of the Today tab — the OS gesture exits the app |
| Exits | `R1`, `S2` **(BLOCKED — target not built)**, `V2`, `V8` **(BLOCKED — target not built)** |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

Declared. Content is read-only and its age is shown.

#### Loading behaviour

Declared. The skeleton must match the shape of the content that follows — the `skeletonToReal` motion token (150ms) exists to animate that swap and is unimplemented.

#### Error behaviour

“ما كدرنا نحدّث الصفحة” — the user's work **survives**, and there is exactly one recovery action: **أعد المحاولة**.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `S1` — Today (Subjects)
- Entry: E1 · tab
- Exit: Reservation · Dispense history · Subject switcher · Request
- Permission: authenticated, scoped to the active subject
- Offline rule: Active reservations and history from cache, age-labelled
- Clinical note: No prediction, no reminders, no alerts in Phase 0
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

Not yet rendered. The contract exists; no pixels do. The designer is designing this from scratch.

#### FIXED by the Blueprint — design may not change these

- Two DIFFERENT empty states, not one. A brand-new account must be taught; a well-managed patient on a quiet day must be reassured. §22 treats these as separate screens.
- Root of a tab — the OS back gesture exits the app. There is no back control.
- One primary action: أطلب دواء.

#### OPEN to the designer

- Everything about how a live reservation appears here — this screen is the patient's home and a held reservation is the most important thing it can carry.
- Whether the quiet state uses an illustration, a typographic treatment, or nothing at all.
- How the two empties differ visually while remaining the same component.


---

### `E4` — ليش نحتاج رقمك

> **Why we need your number** · Blueprint group: Entry · destination: `entry`

**Purpose (fixed by Blueprint v3).** Explain before the one hard ask

**User goal.** Understand why this app wants my phone number before I give it.

**Emotional target.** Trust, at the single hardest ask in the product. §3.1 forbids a sign-in wall on launch: the account is requested at the first action that needs one, with the reason stated.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| _none_ | This screen has a single default state. | — |

Blueprint declares: `—`. **No state has been rendered — the designer works from this contract alone.**


#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **أدخل رقمي** → `E5` (1 tap to outcome) |
| Secondary actions | none |
| Back | `dismiss` → `S1` |
| Exits | `E5` **(BLOCKED — target not built)** |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `E4` — Why we need your number (Entry)
- Entry: Any action requiring an account
- Exit: Phone entry · back with the action preserved
- Permission: guest
- Offline rule: Available; the ask is queued
- Clinical note: none
- Route guards in code: none

#### Existing implementation notes

Reached only by a guard refusal — no screen exits to it. It is the one screen a guest can be sent to, and E5 (phone entry) does not exist yet, so today it is a dead end.

#### FIXED by the Blueprint — design may not change these

- This screen exists to EXPLAIN before it asks. It may not become a phone-entry form.
- Dismissing returns the patient to what they were doing, with their work preserved (D26).

#### OPEN to the designer

- The entire visual treatment. This is the product's first impression for most users.


---

### `F1` — ابحث

> **Find** · Blueprint group: Find · destination: `find`

**Purpose (fixed by Blueprint v3).** Start anything new

**User goal.** Start looking for a medicine.

**Emotional target.** Invitation. A patient arrives here knowing the name of a medicine and nothing else about the app.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `teaching` — “دوّر باسم الدواء، أو صوّر الوصفة” · action: **صوّر وصفة** → R2 |
| `offline` | whether the content is read-only, and how old it is | read-only: yes · shows age: yes |

Blueprint declares: `empty · offline`. 1 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `F1-empty` — **empty · teaching**. The first thing a new patient sees. It teaches what to do rather than reporting that there is no data.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **دوّر على دواء** → `F2` (1 tap to outcome) |
| Secondary actions | صيدليات قريبة → `F5`<br>صوّر وصفة → `R2` |
| Back | `none` — root of the Find tab |
| Exits | `F2`, `F5` **(BLOCKED — target not built)**, `R2` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

Declared. Content is read-only and its age is shown.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `F1` — Find (Find)
- Entry: Tab · FAB
- Exit: Search · Nearby · Capture
- Permission: guest or authenticated
- Offline rule: Recent items only
- Clinical note: none
- Route guards in code: none

#### Existing implementation notes

F1 and F2 are ONE screen in the implementation — the state of the search decides which contract is live. Pushing results on top of search would make the back gesture clear the query.

#### FIXED by the Blueprint — design may not change these

- Root of a tab. Guest-accessible — no account required to search (§3.1).

#### OPEN to the designer

- Whether the teaching empty carries an illustration.
- The search field's resting appearance and its focused state.


---

### `F2` — نتائج البحث

> **Search** · Blueprint group: Find · destination: `find`

**Purpose (fixed by Blueprint v3).** Find a catalogue item the way people actually type

**User goal.** Find the medicine I am holding, however I happen to spell it.

**Emotional target.** Competence. The app should feel like it understood me.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `loading` | a skeleton whose shape matches the content that is coming | skeleton must match the real content |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `teaching` — “ما لكيناه بقائمتنا — ممكن يكون موجود بالصيدليات” · action: **أطلبه بالاسم مع صورة** → R1 |
| `error` | what failed, whether the user's work survived, and one thing to press | “ما كدرنا نوصل للبحث” · work preserved: yes · action: **أعد المحاولة** → F2 |
| `offline` | whether the content is read-only, and how old it is | read-only: yes · shows age: yes |

Blueprint declares: `empty · loading · error · offline · no-match`. 5 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `F2-loading` — **loading**. A skeleton shaped like the rows that are coming, so the page does not jump when they arrive.
- `F2-results` — **results**. Three rows covering all three clinical answers: ordinary, prescription-required (D18), and controlled (D42) — refused on the row, before the tap.
- `F2-empty` — **empty · miss**. §13.1 — the catalogue is incomplete, not the patient wrong. The miss feeds catalogue growth.
- `F2-offline` — **offline**. Cached rows, labelled with their age. Never presented as live.
- `F2-error` — **error**. §23 — what failed, that the work survived, and one thing to press.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **أطلب هذا الدواء** → `R1` (1 tap to outcome) |
| Secondary actions | شوف التفاصيل → `F3` |
| Back | `pop` |
| Exits | `F3` **(BLOCKED — target not built)**, `R1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

Declared. Content is read-only and its age is shown.

#### Loading behaviour

Declared. The skeleton must match the shape of the content that follows — the `skeletonToReal` motion token (150ms) exists to animate that swap and is unimplemented.

#### Error behaviour

“ما كدرنا نوصل للبحث” — the user's work **survives**, and there is exactly one recovery action: **أعد المحاولة**.

#### Analytics-visible behaviour

- `search.unmatched` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `F2` — Search (Find)
- Entry: F1
- Exit: Medicine page · Request · Not found
- Permission: guest or authenticated
- Offline rule: Cached items only, stated
- Clinical note: Never silently corrects a medicine name
- Route guards in code: none

#### Existing implementation notes

The row IS the tap target; a filled button per row put three competing primaries on one screen. Query normalisation folds tatweel, أ/إ/آ, ى, ة and both numeral systems onto one query.

#### FIXED by the Blueprint — design may not change these

- A miss is never 'no results'. §13.1: the catalogue is incomplete, not the patient wrong — and the miss feeds catalogue growth via search.unmatched.
- A controlled item is refused ON THE ROW, before the tap (D42). It renders as information, not as a disabled control.
- A prescription-required item warns before it is added (D18).

#### OPEN to the designer

- How the three clinical answers are distinguished at a glance — ordinary, prescription-required, controlled.
- Result row density and hierarchy: Arabic name, Latin name, strength, form.


---

### `R1` — طلب جديد

> **Build request** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Assemble the lines to ask for

**User goal.** Assemble everything I need before I send it.

**Emotional target.** Control. This is where a request stops being an idea.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `teaching` — “ضيف الدواء اللي تحتاجه — تكدر تضيف لحد ٨” · action: **دوّر على دواء** → F2 |
| `error` | what failed, whether the user's work survived, and one thing to press | “هذا الدواء ما ينطلب من التطبيق” · work preserved: yes · action: **شوف السبب** → F4 |

Blueprint declares: `empty · error`. 3 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `R1-empty` — **empty · teaching**. An empty draft states the line limit as a fact rather than waiting to enforce it as a wall.
- `R1-lines` — **ready**. The pack stepper (D07), the remaining-line count, and a prescription line naming what it still needs.
- `R1-refused` — **error · refusal**. D42 refused in place. The draft the patient already built stays on screen behind it.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **كمّل** → `R6` (1 tap to outcome) |
| Secondary actions | ضيف دواء ثاني → `F2`<br>صوّر الوصفة → `R2`<br>لمن؟ → `R4` |
| Back | `dismiss` → `S1` |
| Exits | `F2`, `R2`, `R4`, `R6` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

“هذا الدواء ما ينطلب من التطبيق” — the user's work **survives**, and there is exactly one recovery action: **شوف السبب**.

#### Analytics-visible behaviour

- `clinical.gate.refused` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `R1` — Build request (Request)
- Entry: FAB · F2 · F3 · Dispense history
- Exit: Prescription capture · Confirm
- Permission: authenticated, subject with Order scope or self or guardian
- Offline rule: Buildable; sending is queued
- Clinical note: A prescription-required line cannot proceed without an image
- Route guards in code: `requireSession` (D26 · §3.2), `requireOrderScope` (§5 clinical matrix), `blockMemorialised` (D04)

#### Existing implementation notes

Presented as a modal (destination: modal) but renders as a full screen, because no sheet chrome exists.

#### FIXED by the Blueprint — design may not change these

- Maximum 8 lines, stated as a visible fact rather than enforced as a wall.
- The unit is the pack (D07). There is no other unit.
- A prescription line blocks sending until its photo is attached (D18), and the reason sits beside the disabled control.
- A refusal appears in place and the rest of the draft stays on screen.

#### OPEN to the designer

- The quantity stepper.
- How a line still needing a prescription is marked.
- Whether lines are reorderable or swipe-deletable.


---

### `R6` — تأكيد الطلب

> **Confirm request** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Final check before it goes

**User goal.** Check it once, then send it.

**Emotional target.** Calm before commitment. The only screen in the loop meant to be read rather than used.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `error` | what failed, whether the user's work survived, and one thing to press | “ما وصل الطلب” · work preserved: yes · action: **أعد الإرسال** → R6 |
| `offline` | whether the content is read-only, and how old it is | read-only: no · shows age: yes |

Blueprint declares: `error · offline`. 2 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `R6-online` — **ready**. D09's three windows, each stating its real duration so the choice is informed.
- `R6-offline` — **offline**. D27 — the button promises only what the app can do without a connection.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **أرسل الطلب** → `R7` (1 tap to outcome) |
| Secondary actions | غيّر الاستعجال → `R5` |
| Back | `pop` |
| Exits | `R5`, `R7`, `R13` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

Declared. Content is still editable and its age is shown.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

“ما وصل الطلب” — the user's work **survives**, and there is exactly one recovery action: **أعد الإرسال**.

#### Analytics-visible behaviour

- `request.broadcast` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `R6` — Confirm request (Request)
- Entry: R1
- Exit: Live responses · Queued
- Permission: authenticated
- Offline rule: Queued, shown as queued and never as sent
- Clinical note: Carries the no-interaction-check disclosure immediately above the send action
- Route guards in code: `requireSession` (D26 · §3.2), `requireOrderScope` (§5 clinical matrix), `blockMemorialised` (D04)

#### Existing implementation notes

The urgency selector uses radio semantics. Exactly one filled control on the screen.

#### FIXED by the Blueprint — design may not change these

- Each urgency window states its real duration, because a patient choosing between them deserves the number.
- Offline, the button promises only what the app can do: 'send it when the connection returns' (D27).

#### OPEN to the designer

- The summary's hierarchy: which reads first, the medicines or the urgency.


---

### `R7` — ننتظر الردود

> **Live responses** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Make the wait legible

**User goal.** Understand how long I am waiting and whether anything is happening.

**Emotional target.** Contained anxiety. This is the most anxious moment in the product.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `loading` | a skeleton whose shape matches the content that is coming | skeleton must match the real content |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `quiet / success` — “ننتظر أول رد” · no action, deliberately |
| `error` | what failed, whether the user's work survived, and one thing to press | “انقطع الاتصال” · work preserved: yes · action: **أعد الاتصال** → R7 |
| `offline` | whether the content is read-only, and how old it is | read-only: yes · shows age: yes |

Blueprint declares: `empty · loading · error · offline`. 2 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `R7-waiting` — **empty · waiting**. A bar with a value rather than a spinner: the patient learns how much longer, not merely that something is happening.
- `R7-queued` — **offline · queued**. D27 at its most important: no countdown, no progress bar, and the words come from the outbox.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **شوف العرض الواصل** → `R8` (1 tap to outcome) |
| Secondary actions | ألغِ الطلب → `S1` |
| Back | `dismiss` → `S1` |
| Exits | `R8`, `R11`, `S1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

Declared. Content is read-only and its age is shown.

#### Loading behaviour

Declared. The skeleton must match the shape of the content that follows — the `skeletonToReal` motion token (150ms) exists to animate that swap and is unimplemented.

#### Error behaviour

“انقطع الاتصال” — the user's work **survives**, and there is exactly one recovery action: **أعد الاتصال**.

#### Analytics-visible behaviour

- `request.answered` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.
- `request.unanswered` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `R7` — Live responses (Request)
- Entry: R6
- Exit: Compare offers · Nobody replied · Cancel
- Permission: the requester
- Offline rule: Shows the last known responder state, age-labelled
- Clinical note: none
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

The two forms — queued and broadcast — are visually unrelated today and both need design.

#### FIXED by the Blueprint — design may not change these

- A QUEUED request shows no countdown and no progress element at all — a bar over a request nobody has received is a lie (D27).
- A broadcast request shows how much of the window is left.
- Waiting with nothing yet is a SUCCESS state, not an absence: we asked, and nobody has answered yet.

#### OPEN to the designer

- What the wait looks like. A bar was chosen over a spinner because a spinner says 'working' and nothing about how much longer.


---

### `R8` — قارن العروض

> **Compare offers** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Choose, with the reasons visible

**User goal.** Choose where to walk, with a sick child, using reasons I can check.

**Emotional target.** Clarity under pressure. The most consequential screen in the product.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `loading` | a skeleton whose shape matches the content that is coming | skeleton must match the real content |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `teaching` — “ما وصل عرض بعد” · action: **ارجع للانتظار** → R7 |
| `error` | what failed, whether the user's work survived, and one thing to press | “هذا العرض انسحب قبل ثواني” · work preserved: yes · action: **شوف العروض الباقية** → R8 |

Blueprint declares: `empty · loading · error`. 3 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `R8-offers` — **ready · three answers**. Coverage before price, order stated as not-a-ranking (D12), reliability as a band (D11), a substitution flagged as needing consent, and the missing medicine named rather than counted.
- `R8-empty` — **empty**. No offer has arrived yet. The way back to waiting is the action, in thumb reach.
- `R8-withdrawn` — **ready · one withdrawn**. An offer withdrawn between render and tap is shown as unavailable rather than as a control that will fail.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **احجز من هنا** → `V1` (1 tap to outcome) |
| Secondary actions | شوف تفاصيل العرض → `R9` |
| Back | `pop` |
| Exits | `R9`, `V1`, `R7` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

Declared. The skeleton must match the shape of the content that follows — the `skeletonToReal` motion token (150ms) exists to animate that swap and is unimplemented.

#### Error behaviour

“هذا العرض انسحب قبل ثواني” — the user's work **survives**, and there is exactly one recovery action: **شوف العروض الباقية**.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `R8` — Compare offers (Request)
- Entry: R7
- Exit: Offer detail · Reserving
- Permission: the requester
- Offline rule: Read-only; choosing requires a connection
- Clinical note: Coverage per offer (‘٢ من ٣’) · substitution is flagged and never pre-accepted
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

The densest screen in the product. Must be verified at 320pt. Any visual treatment that elevates one pharmacy breaks D12.

#### FIXED by the Blueprint — design may not change these

- NO RANKING (D12). No weighting, no paid placement, no 'recommended' badge. The order is coverage then price, both printed on every row, and the screen SAYS SO.
- Coverage before price: an offer that cannot supply the medicine is not cheaper, it is incomplete.
- Reliability is a BAND, never a number or a percentage (D11).
- The missing medicine is NAMED, not counted.
- A withdrawn offer renders as information, not as a control that will reject the tap.
- A substitution is flagged as needing consent and can never be silently accepted (§4 R10).

#### OPEN to the designer

- The row's internal hierarchy — six facts compete: branch, distance, coverage, missing items, price, reliability.
- How a partial offer is distinguished from a complete one at a glance.


---

### `R2` — صوّر الوصفة

> **Prescription capture** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Photograph the paper

**User goal.** Photograph the paper prescription in my hand.

**Emotional target.** Guidance without judgement.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `permissionRefused` | still usable, and naming the alternative | alternative: “تكدر تكتب اسم الدواء بدل الصورة” |
| `error` | what failed, whether the user's work survived, and one thing to press | “ما نكدر نقرأ الوصفة من هذي الصورة” · work preserved: yes · action: **صوّر مرة ثانية بضوء أكثر** → R2 |

Blueprint declares: `permission-refused · error`. 2 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `R2-camera` — **ready**. Says what a PHARMACIST will need to read, because Phase 0 reads nothing itself (D18). The alternative to the camera is offered before it is needed.
- `R2-refused` — **permission refused**. Never a wall: the alternative IS the primary action. Offering a disabled camera button would be offering a bolted door.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **صوّر** → `R3` (1 tap to outcome) |
| Secondary actions | اكتب الاسم بدال الصورة → `R1` |
| Back | `pop` |
| Exits | `R3`, `R1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

“ما نكدر نقرأ الوصفة من هذي الصورة” — the user's work **survives**, and there is exactly one recovery action: **صوّر مرة ثانية بضوء أكثر**.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `R2` — Prescription capture (Request)
- Entry: R1
- Exit: Review photo · type instead
- Permission: authenticated
- Offline rule: Captured and queued with the request
- Clinical note: Not machine-read in Phase 0; the pharmacist reads it
- Route guards in code: none

#### Existing implementation notes

The camera is NOT implemented (TD-9). The screen dispatches a capture effect that nothing handles.

#### FIXED by the Blueprint — design may not change these

- Phase 0 reads NOTHING (D18). No OCR, no extraction, no validation. The screen may never claim to have understood the image.
- A camera refusal is never a wall — the alternative becomes the primary action.
- Failures name the fixable condition, never the person (D37).

#### OPEN to the designer

- The camera viewfinder overlay: framing guides, torch control, shutter.
- How the guidance is shown without covering the subject.


---

### `R3` — شوف الصورة

> **Review photo** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Confirm the image is readable before it travels

**User goal.** Decide whether the photo I just took is readable.

**Emotional target.** Confidence in my own judgement.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| _none_ | This screen has a single default state. | — |

Blueprint declares: `—`. 2 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `R3-review` — **ready**. The patient judges legibility because nothing else does — so the screen states what 'clear' means instead of asking them to guess.
- `R3-failed` — **error**. The upload failed; the photo survived. D37 — the failure names the fixable condition, never the person.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **واضحة — كمّل** → `R1` (1 tap to outcome) |
| Secondary actions | صوّر مرة ثانية → `R2` |
| Back | `pop` |
| Exits | `R1`, `R2` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `R3` — Review photo (Request)
- Entry: R2
- Exit: R1
- Permission: authenticated
- Offline rule: Available
- Clinical note: The patient judges legibility, not an algorithm
- Route guards in code: none

#### Existing implementation notes

PLACEHOLDER. A grey 192pt box is rendered instead of the photograph. This is the most visible unfinished thing in the product.

#### FIXED by the Blueprint — design may not change these

- The PATIENT judges legibility, because nothing else does. The screen states what a pharmacist will need to see rather than asking 'is it clear?'.
- Retaking discards — two photos of one paper is a choice nobody asked for.

#### OPEN to the designer

- The whole photo viewer: aspect handling, zoom, the checklist's relationship to the image.


---

### `R4` — لمن الدواء؟

> **Who is it for** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Choose the subject

**User goal.** Say who this medicine is for.

**Emotional target.** Care. Often the answer is a parent or a child, not the person holding the phone.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| _none_ | This screen has a single default state. | — |

Blueprint declares: `—`. **No state has been rendered — the designer works from this contract alone.**


#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **اختر** → `R1` (1 tap to outcome) |
| Secondary actions | ضيف شخص → `S3` |
| Back | `dismiss` → `R1` |
| Exits | `R1`, `S3` **(BLOCKED — target not built)** |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `R4` — Who is it for (Request)
- Entry: R1
- Exit: R1
- Permission: self · managed · granted with Order
- Offline rule: Available
- Clinical note: The request is bound to a subject, and the acting account is recorded separately
- Route guards in code: none

#### Existing implementation notes

Not rendered. Exits to S3 (add a person), which is not built.

#### FIXED by the Blueprint — design may not change these

- Every clinical read is scoped to the chosen subject.
- Returns to R1 with the lines intact.

#### OPEN to the designer

- How a person is represented — initials, photo, relationship, age.


---

### `R5` — شكد مستعجل؟

> **How urgent** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** Set the window honestly

**User goal.** Say how urgently I need this.

**Emotional target.** Honesty. Choosing 'now' should not feel like the default.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| _none_ | This screen has a single default state. | — |

Blueprint declares: `—`. **No state has been rendered — the designer works from this contract alone.**


#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **اختر** → `R1` (1 tap to outcome) |
| Secondary actions | none |
| Back | `dismiss` → `R1` |
| Exits | `R1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `R5` — How urgent (Request)
- Entry: R1
- Exit: R1
- Permission: authenticated
- Offline rule: Available
- Clinical note: now 20m · today 4h · خلال يومين 48h — the window drives routing
- Route guards in code: none

#### Existing implementation notes

Not rendered as its own screen. The choice currently lives inline on R6.

#### FIXED by the Blueprint — design may not change these

- Exactly three windows (D09): 20 minutes, 4 hours, 2 days. No fourth option exists and the durations are fixed.

#### OPEN to the designer

- How the three are presented — and how to make 'today' feel like a legitimate choice rather than a compromise.


---

### `R9` — تفاصيل العرض

> **Offer detail** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** One offer in full, line by line

**User goal.** Understand exactly what I am agreeing to before I agree.

**Emotional target.** Informed consent. Not reassurance — comprehension.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `error` | what failed, whether the user's work survived, and one thing to press | “هذا العرض انسحب” · work preserved: yes · action: **ارجع للعروض** → R8 |

Blueprint declares: `error`. 3 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `R9-undecided` — **ready · consent outstanding**. §4 R10 — neither answer is pre-selected and both carry identical visual weight. The offer cannot be reserved until the question is answered.
- `R9-agreed` — **ready · consent given**. Once answered, the offer can proceed. The decision can still be changed until the offer is accepted.
- `R9-refused` — **ready · substitution refused**. Refusing costs nothing: D06 sends the refused line to a child request, and the screen says so — a patient who thinks 'no' loses the order will say yes to a brand they did not want.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **احجز من هنا** → `V1` (1 tap to outcome) |
| Secondary actions | none |
| Back | `pop` |
| Exits | `V1`, `R8`, `R10` **(BLOCKED — target not built)** |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

“هذا العرض انسحب” — the user's work **survives**, and there is exactly one recovery action: **ارجع للعروض**.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `R9` — Offer detail (Request)
- Entry: R8
- Exit: Reserve · back
- Permission: the requester
- Offline rule: Read-only
- Clinical note: A substitution shows the pharmacist's name and note, and requires explicit acknowledgement
- Route guards in code: none

#### Existing implementation notes

Safety-critical. Any asymmetry between the two answers is a clinical-consent defect, not a style preference. Closed TD-5.

#### FIXED by the Blueprint — design may not change these

- Consent is EXPLICIT, per line, and never pre-ticked (§4 R10).
- Both answers carry identical visual weight. A filled 'agree' beside an outlined 'refuse' is a nudge, and a nudged consent is not consent.
- The pharmacist's note appears VERBATIM (D19). The app never paraphrases a clinical statement.
- Refusing costs nothing — the line joins a child request (D06) — and the screen says so.
- The decision appears BEFORE the price breakdown.

#### OPEN to the designer

- How 'what you asked for' and 'what they have' are compared visually.
- How an answered proposal differs from an unanswered one, without colour alone.


---

### `R11` — ما رد أحد

> **Nobody replied** · Blueprint group: Request · destination: `modal`

**Purpose (fixed by Blueprint v3).** The honest empty case

**User goal.** Decide what to do when nobody answered.

**Emotional target.** Not abandonment. The honest empty case, with a way forward.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| _none_ | This screen has a single default state. | — |

Blueprint declares: `—`. **No state has been rendered — the designer works from this contract alone.**


#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **وسّع البحث** → `R7` (1 tap to outcome) |
| Secondary actions | خبّرني إذا توفّر → `R12`<br>جرّب بعدين → `S1` |
| Back | `dismiss` → `S1` |
| Exits | `R7`, `R12` **(BLOCKED — target not built)**, `S1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- `request.unanswered` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `R11` — Nobody replied (Request)
- Entry: R7
- Exit: Widen · Watch · Try later
- Permission: the requester
- Offline rule: Available
- Clinical note: Distinguishes ‘nobody answered’ from ‘nobody has it’
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

Exits to R12 (watches), which is not built.

#### FIXED by the Blueprint — design may not change these

- The request may be widened or watched; abandoning is an explicit choice, never a default.

#### OPEN to the designer

- Everything. Not rendered.


---

### `R13` — بانتظار الإرسال

> **Queued actions** · Blueprint group: Request · destination: `me`

**Purpose (fixed by Blueprint v3).** Everything waiting to send

**User goal.** See what is waiting to be sent, and cancel it if I want.

**Emotional target.** Transparency. Nothing is happening in secret.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `empty` | an explanation, and — for the teaching variant — exactly one action | `quiet / success` — “ما في شي بانتظار الإرسال” · no action, deliberately |
| `error` | what failed, whether the user's work survived, and one thing to press | “ما كدرنا نرسل هذا الطلب” · work preserved: yes · action: **أعد المحاولة** → R13 |

Blueprint declares: `empty`. **No state has been rendered — the designer works from this contract alone.**


#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **none** — a list of pending work — the only action is per-item cancellation |
| Secondary actions | ألغِ → `R13` |
| Back | `pop` |
| Exits | `S1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

“ما كدرنا نرسل هذا الطلب” — the user's work **survives**, and there is exactly one recovery action: **أعد المحاولة**.

#### Analytics-visible behaviour

- None emitted from this screen.

#### Blueprint references

- Screen row: `R13` — Queued actions (Request)
- Entry: Offline banner · Me
- Exit: Cancel a queued action
- Permission: authenticated
- Offline rule: This is the offline screen
- Clinical note: A queued request is never presented as sent
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

Not rendered. The only contracted screen that deliberately has no primary action.

#### FIXED by the Blueprint — design may not change these

- NO primary action — a list of pending work whose only action is per-item cancellation.
- The wording of each item comes from the outbox, so no screen can invent a friendlier phrase for 'not yet sent' (D27).

#### OPEN to the designer

- How a pending item, a failed item and a sending item differ.


---

### `V1` — نحجز لك

> **Reserving** · Blueprint group: Reservation · destination: `modal`

**Purpose (fixed by Blueprint v3).** The moment between choosing and confirmation

**User goal.** Wait a few seconds while the pharmacy is asked to set my medicine aside.

**Emotional target.** Brief, contained suspense.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `loading` | a skeleton whose shape matches the content that is coming | skeleton must match the real content |

Blueprint declares: `loading`. 1 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `V1-requesting` — **loading**. The clock starts at held and nowhere earlier — no countdown here, because nothing has been set aside yet.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **none** — the pharmacy is being asked to set stock aside; the patient waits |
| Secondary actions | none |
| Back | `none` — a hold request is in flight; the screen resolves to V2 or V4 on its own |
| Exits | `V2`, `V4`, `R8` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

Declared. The skeleton must match the shape of the content that follows — the `skeletonToReal` motion token (150ms) exists to animate that swap and is unimplemented.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- `reservation.confirmed` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.
- `reservation.refused` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `V1` — Reserving (Reservation)
- Entry: R8 · R9
- Exit: Reservation · Could not hold
- Permission: the requester
- Offline rule: Blocked
- Clinical note: Says plainly that the pharmacy is being asked to set stock aside
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

One of two screens with no primary action, and the only one that cannot be left by any control.

#### FIXED by the Blueprint — design may not change these

- NO COUNTDOWN. The clock starts at 'held' and nowhere earlier — a timer before stock is committed counts down to a disappointment.
- Un-poppable: a hold request is in flight and going back would leave the patient unsure whether it happened.
- No primary action. The patient waits, and the screen says they need not wait here.

#### OPEN to the designer

- What 'we are asking' looks like without becoming a progress bar for something with no measurable progress.


---

### `V2` — محجوز لك

> **Reservation** · Blueprint group: Reservation · destination: `today`

**Purpose (fixed by Blueprint v3).** The code, the clock, the address

**User goal.** Show a code at a counter and get my medicine.

**Emotional target.** Certainty. Blueprint v3 says this screen MUST NEVER FAIL.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| `loading` | a skeleton whose shape matches the content that is coming | skeleton must match the real content |
| `error` | what failed, whether the user's work survived, and one thing to press | “ما كدرنا نحدّث الوقت المتبقي” · work preserved: yes · action: **أعد المحاولة** → V2 |
| `offline` | whether the content is read-only, and how old it is | read-only: yes · shows age: yes |

Blueprint declares: `loading · error · offline · expiring · expired`. 3 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `V2-held` — **ready**. The screen that must never fail. The code is the largest thing on it, grouped so it can be read aloud at a counter.
- `V2-last` — **ready · nearly expired**. The countdown turns urgent near the end rather than staying calm to the last minute.
- `V2-cached` — **offline**. The code still renders from cache; the countdown says it is the last thing we heard. Presenting it as live would send someone to a lapsed hold.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **الاتجاهات** → `V2` (1 tap to outcome) |
| Secondary actions | اتصال بالصيدلية → `V2`<br>ألغِ الحجز → `V5` |
| Back | `replace` → `S1` — the reservation lives on Today; there is no stack behind a notification |
| Exits | `V5` **(BLOCKED — target not built)**, `V7` **(BLOCKED — target not built)**, `S1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

Declared. Content is read-only and its age is shown.

#### Loading behaviour

Declared. The skeleton must match the shape of the content that follows — the `skeletonToReal` motion token (150ms) exists to animate that swap and is unimplemented.

#### Error behaviour

“ما كدرنا نحدّث الوقت المتبقي” — the user's work **survives**, and there is exactly one recovery action: **أعد المحاولة**.

#### Analytics-visible behaviour

- `reservation.collected` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `V2` — Reservation (Reservation)
- Entry: V1 · S1 · notification
- Exit: Directions · Call · Cancel · Report a price difference
- Permission: requester and subject's grant holders
- Offline rule: Fully readable offline — this is the screen that must never fail
- Clinical note: The countdown runs from server time · the code is the collection right, stated
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

Must be legible in bright sunlight, one-handed, possibly with a child on the other arm. Design at 200% text scale first, not last.

#### FIXED by the Blueprint — design may not change these

- The code is the largest element on the screen, grouped so it can be read aloud over a phone.
- It renders from cache when offline, and a cached countdown is labelled as last known — presenting it as live sends someone to a lapsed hold.
- Arrives by notification, so there is no stack behind it; back replaces to Today.
- The remaining time is worded in hours, not minutes — '120 دقيقة' makes a patient do arithmetic before knowing whether to walk or hurry.

#### OPEN to the designer

- How the code is presented — this is the single most important visual element in the product.
- How urgency escalates as the hold nears expiry, without colour alone.
- Whether the code is copyable, and what long-press does.


---

### `V4` — ما كدرت الصيدلية تحجز

> **Could not hold** · Blueprint group: Reservation · destination: `today`

**Purpose (fixed by Blueprint v3).** They confirmed and then could not

**User goal.** Understand that the pharmacy could not hold it, and see what happens next.

**Emotional target.** Disappointment absorbed, momentum kept.

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
| _none_ | This screen has a single default state. | — |

Blueprint declares: `—`. 1 state(s) rendered and photographed.

**Rendered states** (see `review/index.html` for the screenshots):

- `V4-refused` — **ready**. D39 — they confirmed and then could not. It names the situation rather than the pharmacist, and the request has already re-opened.

#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | **شوف العروض الجديدة** → `R8` (1 tap to outcome) |
| Secondary actions | أوقف الطلب → `S1` |
| Back | `replace` → `S1` — arrives by notification; there is no stack behind it |
| Exits | `R8`, `S1` |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

No offline state declared. The screen is either always available from local state, or is unreachable without a connection.

#### Loading behaviour

No loading state declared — this screen renders from state already in memory.

#### Error behaviour

No error state declared.

#### Analytics-visible behaviour

- `reservation.refused` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.

#### Blueprint references

- Screen row: `V4` — Could not hold (Reservation)
- Entry: V1 · notification
- Exit: See new offers
- Permission: the requester
- Offline rule: Available when it arrives
- Clinical note: Names the branch, apologises plainly, and the request re-opens automatically
- Route guards in code: `requireSession` (D26 · §3.2)

#### Existing implementation notes

Arrives by notification. There is no stack behind it.

#### FIXED by the Blueprint — design may not change these

- D39 — the request re-opens AUTOMATICALLY. The action moves the patient forward rather than asking them to start again.
- Names the situation, never the pharmacist and never the patient (D37). Stock moves; saying so plainly is the honest version.

#### OPEN to the designer

- How to deliver bad news without alarm.


---

## Part 2 — NOT IMPLEMENTED (115 screens)

These have a Blueprint row and nothing else. Priority is by user impact:
the **Entry** group blocks every journey (a guest cannot sign in today), and
**Request/Reservation** completes the loop that already exists.


### Entry — 12 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `E1` | Launch | Resolve session before anything renders | loading | Proceeds offline to the last known state |
| `E2` | Welcome | Show worth before asking for anything | default only | Fully available |
| `E3` | Guest home | Let a stranger search and browse with no account | empty · loading · offline | Browse only, labelled with its age |
| `E5` | Phone entry | Take a number | error | Blocked with a clear reason |
| `E6` | Code verification | Verify the number | loading · error · rate-limited | Blocked with a clear reason |
| `E7` | Your name | Minimum identity for a pickup counter | error | Queued |
| `E8` | Your district | Where to search from | error · permission-refused | District list is bundled |
| `E9` | Location primer | Explain before the OS dialog — one chance only | default only | Available |
| `E10` | Notification primer | Ask when the value is obvious, after the first reservation | default only | Deferred |
| `E11` | Welcome back | Returning device | loading · error | Cached identity only |
| `E12` | Out of coverage | Say honestly that we have not arrived | default only | Available |
| `E13` | Blocked | Suspended, or an unsupported version | per reason | Available |

### Subjects — 11 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `S2` | Subject switcher | Change whose medicine this is | default only | Available from cache |
| `S3` | Add a person | Create a managed subject for someone who cannot use a phone | error | Queued |
| `S4` | Family & access | Who I manage, who sees me, whose record I can see | empty · loading · error | Read from cache |
| `S5` | Invite a family member | Send a peer grant, to a number with or without an account | error | Queued |
| `S6` | Choose scope | How much access, in plain words | default only | Queued |
| `S7` | Incoming request | Someone wants access to my record | error | Queued |
| `S8` | Revoke access | Withdraw a grant | two-step | Queued |
| `S9` | Claim invite | Hand a managed subject their own account | error | Queued |
| `S10` | Transfer guardianship | Move a managed subject to another account | error | Queued |
| `S11` | Memorialise subject | Record that a person has died | two-step | Blocked — must be online |
| `S12` | Who viewed this record | Make the privacy promise checkable | empty · loading | Cached, age-labelled |

### Find — 6 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `F3` | Medicine page | What this item is and whether it is near | loading · error · offline | Cached, age-labelled |
| `F4` | Cannot be requested | Refuse a controlled substance, with the reason | default only | Available |
| `F5` | Nearby pharmacies | Who is around, open, and close | empty · loading · error · offline · permission-refused | Cached list with age; open/closed is suppressed, not guessed |
| `F6` | Map | The same, spatially | loading · error · permission-refused | Last tiles only, stated |
| `F7` | Pharmacy page | Should I go here | loading · error · offline | Cached; hours shown with age |
| `F8` | Opening hours | The full week, exceptions and Ramadan | default only | Cached |

### Request — 2 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `R10` | Accept substitution | Acknowledge a different brand, explicitly | default only | Blocked |
| `R12` | My watches | Notify-me, with a lifecycle | empty | Cached |

### Reservation — 5 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `V3` | Reservation expired | The window passed | default only | Available |
| `V5` | Cancel reservation | Withdraw | two-step · error | Queued |
| `V6` | Collected | Done, and it enters the record | default only | Arrives on reconnect |
| `V7` | Report a price difference | The single post-pickup signal | error | Queued |
| `V8` | Dispense history | What this subject has actually collected | empty · loading · offline | Cached, age-labelled |

### Account — 15 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `M1` | Me | Account root | loading · offline | Cached |
| `M2` | Profile | Name, number, district | error | Queued |
| `M3` | Change my number | Identity recovery and number churn | loading · error | Blocked |
| `M4` | Saved pharmacies | My usual places | empty | Cached |
| `M5` | My prescriptions | Images I uploaded | empty · loading · error | Only images already downloaded |
| `M6` | Notification settings | Per category, with quiet hours | default only | Queued |
| `M7` | Display | Numerals and text size | default only | Local |
| `M8` | Export my record | Take it with me | loading · error | Blocked |
| `M9` | Sign out | Leave this device | default only | Allowed, and it destroys the cache |
| `M10` | Delete account | State exactly what goes and what stays | default only | Blocked |
| `M11` | Managed subject disposition | Transfer or delete each managed subject | error | Blocked |
| `M12` | Confirm deletion | Deliberate friction | error | Blocked |
| `M13` | Deletion scheduled | It is happening, and how to stop it | default only | Available |
| `M14` | Help | Answer the common questions without a human | empty | Bundled content |
| `M15` | Contact support | Reach a human with context attached | error · offline | Queued |

### Pharmacy apply — 9 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `PA1` | I am a pharmacy | Entry for the supply side | default only | Available |
| `PA2` | Business details | Name, owner, trade registration | error | Queued |
| `PA3` | Address and map point | Where the branch physically is | error · permission-refused | Queued |
| `PA4` | Storefront photo | Evidence the branch exists | permission-refused · error | Queued |
| `PA5` | Licence upload | The pharmacy licence and its expiry | error | Queued |
| `PA6` | Named pharmacist | Who holds the clinical credential | error | Queued |
| `PA7` | Submit | Send the application | loading · error | Queued |
| `PA8` | Application status | Queue position and what happens next | loading | Cached |
| `PA9` | Information requested | Exactly what the operator needs | error | Queued |

### Pharmacy — 31 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `P1` | Staff sign-in | Who is at the counter now | error | Cached staff list, PIN verified locally then re-checked |
| `P2` | Branch picker | Which branch am I working | empty | Cached |
| `P3` | Requests | Is anything waiting for me | empty · loading · error · offline · stale · paused · closed | Read-only with age; answers queue |
| `P4` | Eligibility panel | Why I am or am not receiving requests | default only | Cached |
| `P5` | Request detail | Decide in seconds | loading · error · expired | Read-only |
| `P6` | Compose offer | Answer per line in under fifteen seconds | error · offline | Queued |
| `P7` | Unavailable, and why | One tap, and the best signal we collect | default only | Queued |
| `P8` | Offer sent | Confirm, and be explicit that it is not a reservation | default only | Available |
| `P9` | Withdraw offer | The correction path for a mistyped price | error | Blocked |
| `P10` | Reservations | What I have physically committed | empty · loading · error · offline | Read-only |
| `P11` | Reservation detail | Confirm, decline, or hand over | loading · error | Read-only |
| `P12` | Confirm reservation | The moment of commitment | error · offline | Blocked |
| `P13` | Cannot hold, and why | Reason capture; this is a trust event | error | Queued |
| `P14` | Handover | Verify the code and complete | error · mismatch | Blocked |
| `P15` | Prescription viewer | Read the prescription while the reservation is live | loading · error | Blocked |
| `P16` | Completed | Done | default only | Queued |
| `P17` | Branch settings | Settings root | loading | Cached |
| `P18` | Opening hours | The week | error | Queued |
| `P19` | Exceptions | Holidays and one-off closures | empty | Queued |
| `P20` | Ramadan schedule | A complete alternative week, activated by date | default only | Queued |
| `P21` | Coverage and capacity | How far, how many at once, and pause | error | Queued |
| `P22` | Staff | Who works here and what they may do | empty · error | Queued |
| `P23` | Invite staff | Add a person | error | Queued |
| `P24` | Licence | Status, expiry, renewal | error · expiring · expired | Cached |
| `P25` | Performance | Fill rate, answer time, honoured rate, and what I should stock | empty · loading · offline | Cached with age |
| `P26` | Branch access log | Every platform-side read of my record | empty · loading | Cached |
| `P27` | Branch export | Take my own data | loading · error | Blocked |
| `P28` | Close branch | Leave the platform | two-step · error | Blocked |
| `P29` | Branch help | Answers, and the on-call number | default only | Bundled |
| `P30` | Contact support | Reach a human with the branch and context attached | error · offline | Queued |
| `P31` | Queued actions | Everything waiting to send | empty | This is the offline screen |

### Operator — 24 screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
| `O1` | Overview | What needs a human today | loading · empty | Not available offline |
| `O2` | Verification queue | Applications awaiting a decision | empty · loading | — |
| `O3` | Application review | Documents, address, storefront, named pharmacist | loading · error | — |
| `O4` | Decision | Approve, request more, or reject with a reason | error | — |
| `O5` | Branch record | Everything about one branch | loading | — |
| `O6` | Suspend branch | Stop a branch, reversibly | two-step | — |
| `O7` | Expiring licences | Who must renew, and when | empty | — |
| `O8` | Catalogue | Curate items | loading · empty | — |
| `O9` | Item editor | One item: names, pack size, prescription and controlled flags | error | — |
| `O10` | Unmatched searches | What people asked for and we did not have | empty | — |
| `O11` | Districts | The curated area list | default only | — |
| `O12` | Fill rate | Phase 0's first exit metric | loading · empty | — |
| `O13` | Honoured rate | Phase 0's second exit metric | loading | — |
| `O14` | Answer time | How fast branches answer | loading | — |
| `O15` | Repeat rate | The gate that tests the strategy's riskiest belief | loading | — |
| `O16` | Coverage | Districts by branch count and fill rate | loading | — |
| `O17` | People | Find an account | empty · loading | — |
| `O18` | Account record | What we may see without consent | loading | — |
| `O19` | Support session | Consented, time-boxed, banner-visible | loading · refused · expired | — |
| `O20` | Support queue | Tickets from both sides | empty · loading | — |
| `O21` | Ticket | One conversation with its context | error | — |
| `O22` | Price disputes | Where the offer price was not honoured | empty | — |
| `O23` | Audit log | Every action, immutable and searchable | loading | — |
| `O24` | Audit entry | One action in full | default only | — |

