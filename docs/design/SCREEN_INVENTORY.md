# Screen Inventory

> **Generated file — do not edit.** Produced by `npm run design:inventory` from
> `docs/product/v3/phase0.js` (the frozen Blueprint), the screen contracts in
> `apps/patient/src/screens/core-loop.contract.ts`, the shared screen registry
> in `apps/patient/src/screens/gallery.tsx`, and the navigation graph derived
> from those contracts. Regenerate it rather than editing it; a hand-maintained
> inventory disagrees with the build within one slice.

## Summary

| | Count |
| --- | --- |
| Blueprint v3 Phase 0 screens | 133 |
| Screens with an engineering contract | 18 |
| Screens rendered and photographed | 12 |
| Distinct screen **states** rendered | 28 |
| Screens NOT IMPLEMENTED | 115 |
| Exits declared but BLOCKED (target not built) | 10 |

**What "status" means**

- **IMPLEMENTED + RENDERED** — a contract exists, the screen is built, and at
  least one state is photographed in the review dashboard. The designer is
  redesigning something real and can compare against a screenshot.
- **CONTRACTED, NOT RENDERED** — the contract fixes the purpose, the actions,
  the back behaviour and the states, but no pixels exist. The designer is
  designing from the contract.
- **NOT IMPLEMENTED** — nothing exists but the Blueprint row. Design is needed
  before engineering can even write a contract.

---

## Part 1 — Every Blueprint screen

### Entry

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `E1` | Launch | Resolve session before anything renders | loading | NOT IMPLEMENTED | default, loading |
| `E2` | Welcome | Show worth before asking for anything | — | NOT IMPLEMENTED | default, default only |
| `E3` | Guest home | Let a stranger search and browse with no account | empty, loading, offline | NOT IMPLEMENTED | default, empty, loading, offline |
| `E4` | Why we need your number | Explain before the one hard ask | — | CONTRACTED, NOT RENDERED | default, default only |
| `E5` | Phone entry | Take a number | error | NOT IMPLEMENTED | default, error |
| `E6` | Code verification | Verify the number | loading, error, rate-limited | NOT IMPLEMENTED | default, loading, error, error |
| `E7` | Your name | Minimum identity for a pickup counter | error | NOT IMPLEMENTED | default, error |
| `E8` | Your district | Where to search from | error, permission-refused | NOT IMPLEMENTED | default, error, permissionRefused |
| `E9` | Location primer | Explain before the OS dialog — one chance only | — | NOT IMPLEMENTED | default, default only |
| `E10` | Notification primer | Ask when the value is obvious, after the first reservation | — | NOT IMPLEMENTED | default, default only |
| `E11` | Welcome back | Returning device | loading, error | NOT IMPLEMENTED | default, loading, error |
| `E12` | Out of coverage | Say honestly that we have not arrived | — | NOT IMPLEMENTED | default, default only |
| `E13` | Blocked | Suspended, or an unsupported version | per reason | NOT IMPLEMENTED | default, error (varies by reason) |

### Subjects

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `S1` | Today | What is happening right now | empty, quiet, loading, offline, stale | CONTRACTED, NOT RENDERED | default, empty, empty (success variant), loading, offline, offline (age-labelled) |
| `S2` | Subject switcher | Change whose medicine this is | — | NOT IMPLEMENTED | default, default only |
| `S3` | Add a person | Create a managed subject for someone who cannot use a phone | error | NOT IMPLEMENTED | default, error |
| `S4` | Family & access | Who I manage, who sees me, whose record I can see | empty, loading, error | NOT IMPLEMENTED | default, empty, loading, error |
| `S5` | Invite a family member | Send a peer grant, to a number with or without an account | error | NOT IMPLEMENTED | default, error |
| `S6` | Choose scope | How much access, in plain words | — | NOT IMPLEMENTED | default, default only |
| `S7` | Incoming request | Someone wants access to my record | error | NOT IMPLEMENTED | default, error |
| `S8` | Revoke access | Withdraw a grant | two-step | NOT IMPLEMENTED | default, confirmation |
| `S9` | Claim invite | Hand a managed subject their own account | error | NOT IMPLEMENTED | default, error |
| `S10` | Transfer guardianship | Move a managed subject to another account | error | NOT IMPLEMENTED | default, error |
| `S11` | Memorialise subject | Record that a person has died | two-step | NOT IMPLEMENTED | default, confirmation |
| `S12` | Who viewed this record | Make the privacy promise checkable | empty, loading | NOT IMPLEMENTED | default, empty, loading |

### Find

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `F1` | Find | Start anything new | empty, offline | IMPLEMENTED + RENDERED | default, empty, offline |
| `F2` | Search | Find a catalogue item the way people actually type | empty, loading, error, offline, no-match | IMPLEMENTED + RENDERED | default, empty, loading, error, offline, empty |
| `F3` | Medicine page | What this item is and whether it is near | loading, error, offline | NOT IMPLEMENTED | default, loading, error, offline |
| `F4` | Cannot be requested | Refuse a controlled substance, with the reason | — | NOT IMPLEMENTED | default, default only |
| `F5` | Nearby pharmacies | Who is around, open, and close | empty, loading, error, offline, permission-refused | NOT IMPLEMENTED | default, empty, loading, error, offline, permissionRefused |
| `F6` | Map | The same, spatially | loading, error, permission-refused | NOT IMPLEMENTED | default, loading, error, permissionRefused |
| `F7` | Pharmacy page | Should I go here | loading, error, offline | NOT IMPLEMENTED | default, loading, error, offline |
| `F8` | Opening hours | The full week, exceptions and Ramadan | — | NOT IMPLEMENTED | default, default only |

### Request

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `R1` | Build request | Assemble the lines to ask for | empty, error | IMPLEMENTED + RENDERED | default, empty, error |
| `R2` | Prescription capture | Photograph the paper | permission-refused, error | IMPLEMENTED + RENDERED | default, permissionRefused, error |
| `R3` | Review photo | Confirm the image is readable before it travels | — | IMPLEMENTED + RENDERED | default, default only |
| `R4` | Who is it for | Choose the subject | — | CONTRACTED, NOT RENDERED | default, default only |
| `R5` | How urgent | Set the window honestly | — | CONTRACTED, NOT RENDERED | default, default only |
| `R6` | Confirm request | Final check before it goes | error, offline | IMPLEMENTED + RENDERED | default, error, offline |
| `R7` | Live responses | Make the wait legible | empty, loading, error, offline | IMPLEMENTED + RENDERED | default, empty, loading, error, offline |
| `R8` | Compare offers | Choose, with the reasons visible | empty, loading, error | IMPLEMENTED + RENDERED | default, empty, loading, error |
| `R9` | Offer detail | One offer in full, line by line | error | IMPLEMENTED + RENDERED | default, error |
| `R10` | Accept substitution | Acknowledge a different brand, explicitly | — | NOT IMPLEMENTED | default, default only |
| `R11` | Nobody replied | The honest empty case | — | CONTRACTED, NOT RENDERED | default, default only |
| `R12` | My watches | Notify-me, with a lifecycle | empty | NOT IMPLEMENTED | default, empty |
| `R13` | Queued actions | Everything waiting to send | empty | CONTRACTED, NOT RENDERED | default, empty |

### Reservation

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `V1` | Reserving | The moment between choosing and confirmation | loading | IMPLEMENTED + RENDERED | default, loading |
| `V2` | Reservation | The code, the clock, the address | loading, error, offline, expiring, expired | IMPLEMENTED + RENDERED | default, loading, error, offline, warning treatment, error |
| `V3` | Reservation expired | The window passed | — | NOT IMPLEMENTED | default, default only |
| `V4` | Could not hold | They confirmed and then could not | — | IMPLEMENTED + RENDERED | default, default only |
| `V5` | Cancel reservation | Withdraw | two-step, error | NOT IMPLEMENTED | default, confirmation, error |
| `V6` | Collected | Done, and it enters the record | — | NOT IMPLEMENTED | default, default only |
| `V7` | Report a price difference | The single post-pickup signal | error | NOT IMPLEMENTED | default, error |
| `V8` | Dispense history | What this subject has actually collected | empty, loading, offline | NOT IMPLEMENTED | default, empty, loading, offline |

### Account

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `M1` | Me | Account root | loading, offline | NOT IMPLEMENTED | default, loading, offline |
| `M2` | Profile | Name, number, district | error | NOT IMPLEMENTED | default, error |
| `M3` | Change my number | Identity recovery and number churn | loading, error | NOT IMPLEMENTED | default, loading, error |
| `M4` | Saved pharmacies | My usual places | empty | NOT IMPLEMENTED | default, empty |
| `M5` | My prescriptions | Images I uploaded | empty, loading, error | NOT IMPLEMENTED | default, empty, loading, error |
| `M6` | Notification settings | Per category, with quiet hours | — | NOT IMPLEMENTED | default, default only |
| `M7` | Display | Numerals and text size | — | NOT IMPLEMENTED | default, default only |
| `M8` | Export my record | Take it with me | loading, error | NOT IMPLEMENTED | default, loading, error |
| `M9` | Sign out | Leave this device | — | NOT IMPLEMENTED | default, default only |
| `M10` | Delete account | State exactly what goes and what stays | — | NOT IMPLEMENTED | default, default only |
| `M11` | Managed subject disposition | Transfer or delete each managed subject | error | NOT IMPLEMENTED | default, error |
| `M12` | Confirm deletion | Deliberate friction | error | NOT IMPLEMENTED | default, error |
| `M13` | Deletion scheduled | It is happening, and how to stop it | — | NOT IMPLEMENTED | default, default only |
| `M14` | Help | Answer the common questions without a human | empty | NOT IMPLEMENTED | default, empty |
| `M15` | Contact support | Reach a human with context attached | error, offline | NOT IMPLEMENTED | default, error, offline |

### Pharmacy apply

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `PA1` | I am a pharmacy | Entry for the supply side | — | NOT IMPLEMENTED | default, default only |
| `PA2` | Business details | Name, owner, trade registration | error | NOT IMPLEMENTED | default, error |
| `PA3` | Address and map point | Where the branch physically is | error, permission-refused | NOT IMPLEMENTED | default, error, permissionRefused |
| `PA4` | Storefront photo | Evidence the branch exists | permission-refused, error | NOT IMPLEMENTED | default, permissionRefused, error |
| `PA5` | Licence upload | The pharmacy licence and its expiry | error | NOT IMPLEMENTED | default, error |
| `PA6` | Named pharmacist | Who holds the clinical credential | error | NOT IMPLEMENTED | default, error |
| `PA7` | Submit | Send the application | loading, error | NOT IMPLEMENTED | default, loading, error |
| `PA8` | Application status | Queue position and what happens next | loading | NOT IMPLEMENTED | default, loading |
| `PA9` | Information requested | Exactly what the operator needs | error | NOT IMPLEMENTED | default, error |

### Pharmacy

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `P1` | Staff sign-in | Who is at the counter now | error | NOT IMPLEMENTED | default, error |
| `P2` | Branch picker | Which branch am I working | empty | NOT IMPLEMENTED | default, empty |
| `P3` | Requests | Is anything waiting for me | empty, loading, error, offline, stale, paused, closed | NOT IMPLEMENTED | default, empty, loading, error, offline, offline (age-labelled), informational, informational |
| `P4` | Eligibility panel | Why I am or am not receiving requests | — | NOT IMPLEMENTED | default, default only |
| `P5` | Request detail | Decide in seconds | loading, error, expired | NOT IMPLEMENTED | default, loading, error, error |
| `P6` | Compose offer | Answer per line in under fifteen seconds | error, offline | NOT IMPLEMENTED | default, error, offline |
| `P7` | Unavailable, and why | One tap, and the best signal we collect | — | NOT IMPLEMENTED | default, default only |
| `P8` | Offer sent | Confirm, and be explicit that it is not a reservation | — | NOT IMPLEMENTED | default, default only |
| `P9` | Withdraw offer | The correction path for a mistyped price | error | NOT IMPLEMENTED | default, error |
| `P10` | Reservations | What I have physically committed | empty, loading, error, offline | NOT IMPLEMENTED | default, empty, loading, error, offline |
| `P11` | Reservation detail | Confirm, decline, or hand over | loading, error | NOT IMPLEMENTED | default, loading, error |
| `P12` | Confirm reservation | The moment of commitment | error, offline | NOT IMPLEMENTED | default, error, offline |
| `P13` | Cannot hold, and why | Reason capture; this is a trust event | error | NOT IMPLEMENTED | default, error |
| `P14` | Handover | Verify the code and complete | error, mismatch | NOT IMPLEMENTED | default, error, error |
| `P15` | Prescription viewer | Read the prescription while the reservation is live | loading, error | NOT IMPLEMENTED | default, loading, error |
| `P16` | Completed | Done | — | NOT IMPLEMENTED | default, default only |
| `P17` | Branch settings | Settings root | loading | NOT IMPLEMENTED | default, loading |
| `P18` | Opening hours | The week | error | NOT IMPLEMENTED | default, error |
| `P19` | Exceptions | Holidays and one-off closures | empty | NOT IMPLEMENTED | default, empty |
| `P20` | Ramadan schedule | A complete alternative week, activated by date | — | NOT IMPLEMENTED | default, default only |
| `P21` | Coverage and capacity | How far, how many at once, and pause | error | NOT IMPLEMENTED | default, error |
| `P22` | Staff | Who works here and what they may do | empty, error | NOT IMPLEMENTED | default, empty, error |
| `P23` | Invite staff | Add a person | error | NOT IMPLEMENTED | default, error |
| `P24` | Licence | Status, expiry, renewal | error, expiring, expired | NOT IMPLEMENTED | default, error, warning treatment, error |
| `P25` | Performance | Fill rate, answer time, honoured rate, and what I should stock | empty, loading, offline | NOT IMPLEMENTED | default, empty, loading, offline |
| `P26` | Branch access log | Every platform-side read of my record | empty, loading | NOT IMPLEMENTED | default, empty, loading |
| `P27` | Branch export | Take my own data | loading, error | NOT IMPLEMENTED | default, loading, error |
| `P28` | Close branch | Leave the platform | two-step, error | NOT IMPLEMENTED | default, confirmation, error |
| `P29` | Branch help | Answers, and the on-call number | — | NOT IMPLEMENTED | default, default only |
| `P30` | Contact support | Reach a human with the branch and context attached | error, offline | NOT IMPLEMENTED | default, error, offline |
| `P31` | Queued actions | Everything waiting to send | empty | NOT IMPLEMENTED | default, empty |

### Operator

| Screen | Name | Purpose | Blueprint states | Status | Designed states required |
| --- | --- | --- | --- | --- | --- |
| `O1` | Overview | What needs a human today | loading, empty | NOT IMPLEMENTED | default, loading, empty |
| `O2` | Verification queue | Applications awaiting a decision | empty, loading | NOT IMPLEMENTED | default, empty, loading |
| `O3` | Application review | Documents, address, storefront, named pharmacist | loading, error | NOT IMPLEMENTED | default, loading, error |
| `O4` | Decision | Approve, request more, or reject with a reason | error | NOT IMPLEMENTED | default, error |
| `O5` | Branch record | Everything about one branch | loading | NOT IMPLEMENTED | default, loading |
| `O6` | Suspend branch | Stop a branch, reversibly | two-step | NOT IMPLEMENTED | default, confirmation |
| `O7` | Expiring licences | Who must renew, and when | empty | NOT IMPLEMENTED | default, empty |
| `O8` | Catalogue | Curate items | loading, empty | NOT IMPLEMENTED | default, loading, empty |
| `O9` | Item editor | One item: names, pack size, prescription and controlled flags | error | NOT IMPLEMENTED | default, error |
| `O10` | Unmatched searches | What people asked for and we did not have | empty | NOT IMPLEMENTED | default, empty |
| `O11` | Districts | The curated area list | — | NOT IMPLEMENTED | default, default only |
| `O12` | Fill rate | Phase 0's first exit metric | loading, empty | NOT IMPLEMENTED | default, loading, empty |
| `O13` | Honoured rate | Phase 0's second exit metric | loading | NOT IMPLEMENTED | default, loading |
| `O14` | Answer time | How fast branches answer | loading | NOT IMPLEMENTED | default, loading |
| `O15` | Repeat rate | The gate that tests the strategy's riskiest belief | loading | NOT IMPLEMENTED | default, loading |
| `O16` | Coverage | Districts by branch count and fill rate | loading | NOT IMPLEMENTED | default, loading |
| `O17` | People | Find an account | empty, loading | NOT IMPLEMENTED | default, empty, loading |
| `O18` | Account record | What we may see without consent | loading | NOT IMPLEMENTED | default, loading |
| `O19` | Support session | Consented, time-boxed, banner-visible | loading, refused, expired | NOT IMPLEMENTED | default, loading, error, error |
| `O20` | Support queue | Tickets from both sides | empty, loading | NOT IMPLEMENTED | default, empty, loading |
| `O21` | Ticket | One conversation with its context | error | NOT IMPLEMENTED | default, error |
| `O22` | Price disputes | Where the offer price was not honoured | empty | NOT IMPLEMENTED | default, empty |
| `O23` | Audit log | Every action, immutable and searchable | loading | NOT IMPLEMENTED | default, loading |
| `O24` | Audit entry | One action in full | — | NOT IMPLEMENTED | default, default only |

---

## Part 2 — Screens with an engineering contract

Each of these has a **binding contract**. The designer may change how any of it
looks. The designer may **not** silently change the primary action, the back
behaviour, the set of states, or the exits — those are product decisions frozen
in Blueprint v3, and a design that contradicts one is a Blueprint amendment
that has to be raised, not absorbed.

### `S1` — اليوم

**Purpose.** What is happening right now

| Property | Value |
| --- | --- |
| Destination | today |
| Back behaviour | `none` |
| Primary action | **أطلب دواء** → R1 |
| Secondary actions | لمن؟ → S2; سجل الاستلام → V8 |
| Exits | R1, S2 (BLOCKED), V2, V8 (BLOCKED) |
| Route guards | requireSession |
| Analytics emitted | none |
| Blueprint states | empty · quiet · loading · offline · stale |

**States that must be designed (0 currently rendered):**

- _No state has been rendered yet. Every state below is a design gap._

**Declared treatments:** `loading`, `empty`, `empty`, `offline`, `error`


### `E4` — ليش نحتاج رقمك

**Purpose.** Explain before the one hard ask

| Property | Value |
| --- | --- |
| Destination | entry |
| Back behaviour | `dismiss` → S1 |
| Primary action | **أدخل رقمي** → E5 |
| Secondary actions | none |
| Exits | E5 (BLOCKED) |
| Route guards | none |
| Analytics emitted | none |
| Blueprint states | — |

**States that must be designed (0 currently rendered):**

- _No state has been rendered yet. Every state below is a design gap._

**Declared treatments:** none — this screen has a single default state.


### `F1` — ابحث

**Purpose.** Start anything new

| Property | Value |
| --- | --- |
| Destination | find |
| Back behaviour | `none` |
| Primary action | **دوّر على دواء** → F2 |
| Secondary actions | صيدليات قريبة → F5; صوّر وصفة → R2 |
| Exits | F2, F5 (BLOCKED), R2 |
| Route guards | none |
| Analytics emitted | none |
| Blueprint states | empty · offline |

**States that must be designed (1 currently rendered):**

- `F1-empty` — **empty · teaching**. The first thing a new patient sees. It teaches what to do rather than reporting that there is no data.

**Declared treatments:** `empty`, `offline`


### `F2` — نتائج البحث

**Purpose.** Find a catalogue item the way people actually type

| Property | Value |
| --- | --- |
| Destination | find |
| Back behaviour | `pop` |
| Primary action | **أطلب هذا الدواء** → R1 |
| Secondary actions | شوف التفاصيل → F3 |
| Exits | F3 (BLOCKED), R1 |
| Route guards | none |
| Analytics emitted | `search.unmatched` |
| Blueprint states | empty · loading · error · offline · no-match |

**States that must be designed (5 currently rendered):**

- `F2-loading` — **loading**. A skeleton shaped like the rows that are coming, so the page does not jump when they arrive.
- `F2-results` — **results**. Three rows covering all three clinical answers: ordinary, prescription-required (D18), and controlled (D42) — refused on the row, before the tap.
- `F2-empty` — **empty · miss**. §13.1 — the catalogue is incomplete, not the patient wrong. The miss feeds catalogue growth.
- `F2-offline` — **offline**. Cached rows, labelled with their age. Never presented as live.
- `F2-error` — **error**. §23 — what failed, that the work survived, and one thing to press.

**Declared treatments:** `loading`, `empty`, `error`, `offline`


### `R1` — طلب جديد

**Purpose.** Assemble the lines to ask for

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `dismiss` → S1 |
| Primary action | **كمّل** → R6 |
| Secondary actions | ضيف دواء ثاني → F2; صوّر الوصفة → R2; لمن؟ → R4 |
| Exits | F2, R2, R4, R6 |
| Route guards | requireSession, requireOrderScope, blockMemorialised |
| Analytics emitted | `clinical.gate.refused` |
| Blueprint states | empty · error |

**States that must be designed (3 currently rendered):**

- `R1-empty` — **empty · teaching**. An empty draft states the line limit as a fact rather than waiting to enforce it as a wall.
- `R1-lines` — **ready**. The pack stepper (D07), the remaining-line count, and a prescription line naming what it still needs.
- `R1-refused` — **error · refusal**. D42 refused in place. The draft the patient already built stays on screen behind it.

**Declared treatments:** `empty`, `error`


### `R6` — تأكيد الطلب

**Purpose.** Final check before it goes

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `pop` |
| Primary action | **أرسل الطلب** → R7 |
| Secondary actions | غيّر الاستعجال → R5 |
| Exits | R5, R7, R13 |
| Route guards | requireSession, requireOrderScope, blockMemorialised |
| Analytics emitted | `request.broadcast` |
| Blueprint states | error · offline |

**States that must be designed (2 currently rendered):**

- `R6-online` — **ready**. D09's three windows, each stating its real duration so the choice is informed.
- `R6-offline` — **offline**. D27 — the button promises only what the app can do without a connection.

**Declared treatments:** `error`, `offline`


### `R7` — ننتظر الردود

**Purpose.** Make the wait legible

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `dismiss` → S1 |
| Primary action | **شوف العروض** → R8 |
| Secondary actions | ألغِ الطلب → S1 |
| Exits | R8, R11, S1 |
| Route guards | requireSession |
| Analytics emitted | `request.answered`, `request.unanswered` |
| Blueprint states | empty · loading · error · offline |

**States that must be designed (2 currently rendered):**

- `R7-waiting` — **empty · waiting**. A bar with a value rather than a spinner: the patient learns how much longer, not merely that something is happening.
- `R7-queued` — **offline · queued**. D27 at its most important: no countdown, no progress bar, and the words come from the outbox.

**Declared treatments:** `loading`, `empty`, `error`, `offline`


### `R8` — قارن العروض

**Purpose.** Choose, with the reasons visible

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `pop` |
| Primary action | **احجز من هنا** → V1 |
| Secondary actions | شوف تفاصيل العرض → R9 |
| Exits | R9, V1, R7 |
| Route guards | requireSession |
| Analytics emitted | none |
| Blueprint states | empty · loading · error |

**States that must be designed (3 currently rendered):**

- `R8-offers` — **ready · three answers**. Coverage before price, order stated as not-a-ranking (D12), reliability as a band (D11), a substitution flagged as needing consent, and the missing medicine named rather than counted.
- `R8-empty` — **empty**. No offer has arrived yet. The way back to waiting is the action, in thumb reach.
- `R8-withdrawn` — **ready · one withdrawn**. An offer withdrawn between render and tap is shown as unavailable rather than as a control that will fail.

**Declared treatments:** `loading`, `empty`, `error`


### `R2` — صوّر الوصفة

**Purpose.** Photograph the paper

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `pop` |
| Primary action | **صوّر** → R3 |
| Secondary actions | اكتب الاسم بدال الصورة → R1 |
| Exits | R3, R1 |
| Route guards | none |
| Analytics emitted | none |
| Blueprint states | permission-refused · error |

**States that must be designed (2 currently rendered):**

- `R2-camera` — **ready**. Says what a PHARMACIST will need to read, because Phase 0 reads nothing itself (D18). The alternative to the camera is offered before it is needed.
- `R2-refused` — **permission refused**. Never a wall: the alternative IS the primary action. Offering a disabled camera button would be offering a bolted door.

**Declared treatments:** `permissionRefused`, `error`


### `R3` — شوف الصورة

**Purpose.** Confirm the image is readable before it travels

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `pop` |
| Primary action | **واضحة — كمّل** → R1 |
| Secondary actions | صوّر مرة ثانية → R2 |
| Exits | R1, R2 |
| Route guards | none |
| Analytics emitted | none |
| Blueprint states | — |

**States that must be designed (2 currently rendered):**

- `R3-review` — **ready**. The patient judges legibility because nothing else does — so the screen states what 'clear' means instead of asking them to guess.
- `R3-failed` — **error**. The upload failed; the photo survived. D37 — the failure names the fixable condition, never the person.

**Declared treatments:** none — this screen has a single default state.


### `R4` — لمن الدواء؟

**Purpose.** Choose the subject

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `dismiss` → R1 |
| Primary action | **اختر** → R1 |
| Secondary actions | ضيف شخص → S3 |
| Exits | R1, S3 (BLOCKED) |
| Route guards | none |
| Analytics emitted | none |
| Blueprint states | — |

**States that must be designed (0 currently rendered):**

- _No state has been rendered yet. Every state below is a design gap._

**Declared treatments:** none — this screen has a single default state.


### `R5` — شكد مستعجل؟

**Purpose.** Set the window honestly

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `dismiss` → R1 |
| Primary action | **اختر** → R1 |
| Secondary actions | none |
| Exits | R1 |
| Route guards | none |
| Analytics emitted | none |
| Blueprint states | — |

**States that must be designed (0 currently rendered):**

- _No state has been rendered yet. Every state below is a design gap._

**Declared treatments:** none — this screen has a single default state.


### `R9` — تفاصيل العرض

**Purpose.** One offer in full, line by line

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `pop` |
| Primary action | **احجز من هنا** → V1 |
| Secondary actions | none |
| Exits | V1, R8, R10 (BLOCKED) |
| Route guards | none |
| Analytics emitted | none |
| Blueprint states | error |

**States that must be designed (3 currently rendered):**

- `R9-undecided` — **ready · consent outstanding**. §4 R10 — neither answer is pre-selected and both carry identical visual weight. The offer cannot be reserved until the question is answered.
- `R9-agreed` — **ready · consent given**. Once answered, the offer can proceed. The decision can still be changed until the offer is accepted.
- `R9-refused` — **ready · substitution refused**. Refusing costs nothing: D06 sends the refused line to a child request, and the screen says so — a patient who thinks 'no' loses the order will say yes to a brand they did not want.

**Declared treatments:** `error`


### `R11` — ما رد أحد

**Purpose.** The honest empty case

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `dismiss` → S1 |
| Primary action | **وسّع البحث** → R7 |
| Secondary actions | خبّرني إذا توفّر → R12; جرّب بعدين → S1 |
| Exits | R7, R12 (BLOCKED), S1 |
| Route guards | requireSession |
| Analytics emitted | `request.unanswered` |
| Blueprint states | — |

**States that must be designed (0 currently rendered):**

- _No state has been rendered yet. Every state below is a design gap._

**Declared treatments:** none — this screen has a single default state.


### `R13` — بانتظار الإرسال

**Purpose.** Everything waiting to send

| Property | Value |
| --- | --- |
| Destination | me |
| Back behaviour | `pop` |
| Primary action | none — a list of pending work — the only action is per-item cancellation |
| Secondary actions | ألغِ → R13 |
| Exits | S1 |
| Route guards | requireSession |
| Analytics emitted | none |
| Blueprint states | empty |

**States that must be designed (0 currently rendered):**

- _No state has been rendered yet. Every state below is a design gap._

**Declared treatments:** `empty`, `error`


### `V1` — نحجز لك

**Purpose.** The moment between choosing and confirmation

| Property | Value |
| --- | --- |
| Destination | modal |
| Back behaviour | `none` |
| Primary action | none — the pharmacy is being asked to set stock aside; the patient waits |
| Secondary actions | none |
| Exits | V2, V4, R8 |
| Route guards | requireSession |
| Analytics emitted | `reservation.confirmed`, `reservation.refused` |
| Blueprint states | loading |

**States that must be designed (1 currently rendered):**

- `V1-requesting` — **loading**. The clock starts at held and nowhere earlier — no countdown here, because nothing has been set aside yet.

**Declared treatments:** `loading`


### `V2` — محجوز لك

**Purpose.** The code, the clock, the address

| Property | Value |
| --- | --- |
| Destination | today |
| Back behaviour | `replace` → S1 |
| Primary action | **خذني للصيدلية** → V2 |
| Secondary actions | اتصل بالصيدلية → V2; ألغِ الحجز → V5 |
| Exits | V5 (BLOCKED), V7 (BLOCKED), S1 |
| Route guards | requireSession |
| Analytics emitted | `reservation.collected` |
| Blueprint states | loading · error · offline · expiring · expired |

**States that must be designed (3 currently rendered):**

- `V2-held` — **ready**. The screen that must never fail. The code is the largest thing on it, grouped so it can be read aloud at a counter.
- `V2-last` — **ready · nearly expired**. The countdown turns urgent near the end rather than staying calm to the last minute.
- `V2-cached` — **offline**. The code still renders from cache; the countdown says it is the last thing we heard. Presenting it as live would send someone to a lapsed hold.

**Declared treatments:** `loading`, `error`, `offline`


### `V4` — ما كدرت الصيدلية تحجز

**Purpose.** They confirmed and then could not

| Property | Value |
| --- | --- |
| Destination | today |
| Back behaviour | `replace` → S1 |
| Primary action | **شوف العروض الجديدة** → R8 |
| Secondary actions | أوقف الطلب → S1 |
| Exits | R8, S1 |
| Route guards | requireSession |
| Analytics emitted | `reservation.refused` |
| Blueprint states | — |

**States that must be designed (1 currently rendered):**

- `V4-refused` — **ready**. D39 — they confirmed and then could not. It names the situation rather than the pharmacist, and the request has already re-opened.

**Declared treatments:** none — this screen has a single default state.

