# 04 — Screen Inventory

Every screen, with the one job it has and the states it must ship. **A screen
is not complete until every state in its row exists.** The prototype shipped
happy paths and discovered the rest in production; that is the practice this
inventory exists to end.

State legend: **E** empty · **L** loading · **X** error · **O** offline ·
**P** permission denied · **S** stale/degraded

## Authentication & onboarding — shared shell, per-persona content

| # | Screen | Job | States |
|---|---|---|---|
| A1 | Splash | Resolve session before anything renders | L, X |
| A2 | Onboarding | Explain the trade — what we ask for and what you get | — |
| A3 | Phone entry | Collect a number with correct RTL numeral handling | X |
| A4 | OTP | Verify, with resend and rate-limit feedback | L, X |
| A5 | Profile setup | Name, area, optional date of birth | X |
| A6 | Permission primer | Ask *before* the OS dialog, explaining why | P |
| A7 | Restore | Returning device, previous account found | L, X |
| A8 | Blocked | Suspended, unsupported version, region unavailable | — |

**A6 exists because an OS permission prompt with no context is refused, and iOS
gives you exactly one chance at it.**

## Patient

### Today

| # | Screen | Job | States |
|---|---|---|---|
| P1 | Today | What do I do right now | E, L, X, O, S |
| P2 | Dose detail | Confirm, snooze, skip — with a reason | X, O |
| P3 | Active reservation | Where it is and how long is left | L, X, O, S |
| P4 | Timeline | What has happened to my medication | E, L, X, O |
| P5 | Family switcher (sheet) | Change subject | E, P |

### Medicines

| # | Screen | Job | States |
|---|---|---|---|
| P6 | My medicines | What am I on, what is running out | E, L, X, O |
| P7 | Medicine detail | Everything about one medicine | L, X, O |
| P8 | Schedule editor | When do I take it | X |
| P9 | Refill history | When did I last get it | E, L, O |
| P10 | Interaction info | What this interacts with — and when we could not check | L, X, **UNAVAILABLE** |
| P11 | Stop tracking | End the reminder, not the medicine | — |

**P10 carries a required fourth state.** "We could not check" is a first-class
outcome with its own screen treatment, never a silent absence of warnings.

### Find & request

| # | Screen | Job | States |
|---|---|---|---|
| P12 | Find | Start anything new | E, O |
| P13 | Search results | Catalogue matches, Arabic and Latin | E, L, X, O |
| P14 | Catalogue item | What this medicine is | L, X |
| P15 | Nearby pharmacies | Who is near, open, and close | E, L, X, O, P |
| P16 | Map | The same, spatially | L, X, P |
| P17 | Pharmacy detail | Hours, distance, history with them | L, X, O |
| P18 | Capture | Camera · voice · type | P, X |
| P19 | Prescription review | Confirm what we read, correct what we did not | X, **low-confidence** |
| P20 | Request confirm | Quantity, urgency, area, who it is for | X, O |
| P21 | Live responses | The wait, made legible | E, L, X, O |
| P22 | Compare offers | Choose, with the reasons visible | E, L, X |
| P23 | No offers | Nobody answered — and what to do now | — |
| P24 | Reservation pass | The code, the clock, the address | L, X, O, **expired** |
| P25 | Pickup complete | Done, and what happens next | — |
| P26 | Cancel reservation | Cancel with a reason | X |

**P19's low-confidence state is mandatory.** Iraqi prescriptions are
handwritten and OCR will fail often. The failure path deserves more design
care than the success path, and the confidence gate is enforced server-side —
a client cannot wave a line through.

### Me

| # | Screen | Job | States |
|---|---|---|---|
| P27 | Me | Account root | L, O |
| P28 | Family & access | Who sees my data, whose data I see | E, L, X |
| P29 | Grant request | Approve or refuse, with scope | X |
| P30 | Access scope editor | View / Order / Confirm | X |
| P31 | Access log | Who viewed my record, when, why | E, L |
| P32 | Reservation history | Everything past | E, L, O |
| P33 | Saved pharmacies | Favourites | E, L |
| P34 | My prescriptions | Documents, encrypted | E, L, X |
| P35 | Notification settings | Per category, with quiet hours | — |
| P36 | Language & display | Language, numerals, text size | — |
| P37 | Settings | The rest | — |
| P38 | Delete account | Typed confirmation, 30-day window, cancellation | X |
| P39 | Data export | Take my record with me | L, X |

**P31 and P39 are not optional.** An access log makes the privacy promise
checkable rather than merely stated, and export is what makes the record the
patient's rather than ours.

## Pharmacy

| # | Screen | Job | States |
|---|---|---|---|
| F1 | Staff sign-in | Who is at the counter now | X |
| F2 | Branch picker | Which branch am I working | E |
| F3 | Inbox | Anything waiting for me | E, L, X, O, S |
| F4 | Request detail | Decide in seconds | L, X |
| F5 | Compose offer | Price, readiness, substitution | X, O |
| F6 | Unavailable + reason | Say why — it feeds coverage data | — |
| F7 | Offer sent | Confirmation, and it is not a hold | — |
| F8 | Holds | What is physically committed | E, L, X, O |
| F9 | Hold detail | Confirm, decline, or hand over | L, X |
| F10 | Confirm hold | This commits stock and starts the clock | X |
| F11 | Cannot hold | Reason capture — this is a trust event | — |
| F12 | Handover | Verify the code, complete | X |
| F13 | Stock | What we have, and how much we trust it | E, L, X, O |
| F14 | SKU detail | One product's movement | L, X |
| F15 | Spot count | Reconcile — a matching count is a valid, valuable result | X |
| F16 | Low-trust SKUs | What needs counting | E, L |
| F17 | Opening hours | Including exceptions and holidays | X |
| F18 | Coverage & capacity | How far, how many at once, pause | X |
| F19 | Promotions | Offers, with policy limits enforced | E, X |
| F20 | Staff & roles | Who may confirm a hold | E, X, P |
| F21 | Analytics | Fill rate, response time, missed requests | E, L, O |
| F22 | Customers | Returning patients, no clinical detail | E, L |
| F23 | Licence & verification | Status, expiry, renewal | X, **expired** |
| F24 | Closed / paused | We are not accepting right now | — |

**F15's design must permit a count that agrees with the ledger.** The prototype
rejected zero-variance counts, which inverted the entire trust signal: only a
count that disagreed could be recorded, so confidence could never rise by
confirming the ledger was right.

## Owner

| # | Screen | Job |
|---|---|---|
| O1 | Overview | What needs a human today |
| O2 | Verification queue | Pharmacies awaiting approval |
| O3 | Pharmacy record | Everything about one pharmacy |
| O4 | Licence review | Documents, expiry, decision |
| O5 | Suspension | Suspend, with reason and notice |
| O6 | User search | Find a user |
| O7 | User record | Account, not clinical content |
| O8 | Support session | Consented, banner-visible, time-boxed |
| O9 | Access history | Every staff read of this user |
| O10 | Medicine catalogue | Curate |
| O11 | Medicine editor | One entry |
| O12 | Ingredient mapping | What is in what |
| O13 | Duplicate review | Merge candidates from normalisation |
| O14 | Categories | Therapeutic taxonomy |
| O15 | Knowledge releases | Publish, review, withdraw |
| O16 | Clinical claims | Every claim, source, reviewer, expiry |
| O17 | Alert analytics | What fires, what gets overridden |
| O18 | Interaction rules | The rule set and its coverage |
| O19 | Safety incidents | Reports and investigations |
| O20 | Coverage map | Where we are dense and where we are thin |
| O21 | Fill rate | Requests answered, by area and hour |
| O22 | Cohorts | Retention |
| O23 | Funnels | Where people stop |
| O24 | Feature flags | With owners and removal versions |
| O25 | Release governance | The manifest, gates, and evidence |
| O26 | Broadcast composer | Reach, throttle, preview, kill-switch |
| O27 | Support tickets | Queue |
| O28 | Roles & permissions | Grants, break-glass |
| O29 | Audit log | Immutable, searchable, exportable |
| O30 | System settings | Configuration |

**Counts:** 8 auth · 39 patient · 24 pharmacy · 30 owner = **101 screens**,
before per-state variants. That number is the honest scope of what is being
proposed, and it is the reason phasing appears in [07](07-gap-analysis.md).
