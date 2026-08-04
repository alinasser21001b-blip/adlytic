# 07 — Missing Features

Everything that does not exist and should. Ranked by what breaks without it,
not by effort.

## Tier 0 — the product does not work without these

| # | Missing | Why it is Tier 0 |
|---|---|---|
| 1 | **Real authentication** (phone + OTP, sessions, device binding) | There is no product without accounts |
| 2 | **Nearby pharmacies with real geo** | "Which pharmacy has it" is the question the product exists to answer |
| 3 | **Interactive map** | Distance as a number is not enough; people navigate spatially |
| 4 | **Open/closed state and opening hours** | An offer from a closed pharmacy is worse than no offer |
| 5 | **Distance and honest ETA** | Choosing between offers is impossible without it |
| 6 | **Push notifications** | The entire model is asynchronous; without push the patient must sit and watch |
| 7 | **Prescription image upload with encryption at rest** | The primary input for the target user |
| 8 | **Camera capture with edge detection and retake** | Photographing a paper prescription in bad light is the real task |
| 9 | **Reservation lifecycle enforced server-side** | Client-side state is a suggestion |
| 10 | **Pickup verification** (code / QR) | Without it, a hold cannot be closed |
| 11 | **Offline queue with idempotency** | Iraqi mobile data drops; a lost request is a lost patient |
| 12 | **Pharmacy verification workflow** | Unverified pharmacies stamping clinical authorship is the worst defect found so far |

## Tier 1 — the product is weak without these

| # | Missing | Why |
|---|---|---|
| 13 | Reservation timeline (visible state history) | "What is happening" is the top anxiety question |
| 14 | Live Activity / ongoing notification for the countdown | The countdown belongs on the lock screen |
| 15 | Favourites and usual pharmacy | Repeat is the dominant behaviour in chronic medication |
| 16 | Barcode scanning (pharmacy side) | Fastest possible stock movement capture |
| 17 | QR pickup code | Faster and less error-prone than reading digits aloud |
| 18 | Substitution proposal flow | Generic availability is the common case; today it is invisible |
| 19 | Two-sided family consent with scopes | Exists in the data model, absent from the experience |
| 20 | Access log for the patient | Makes the privacy promise checkable |
| 21 | Account deletion with a real deletion pipeline | App Store 5.1.1(v); currently a dialog that does nothing |
| 22 | Data export | The record is the patient's |
| 23 | Notification preferences with quiet hours | A medication app that wakes people at 3am gets uninstalled |
| 24 | Pharmacy capacity and pause | A pharmacy that cannot pause will stop answering entirely |
| 25 | Decline reasons feeding coverage analytics | The highest-quality signal we can collect, currently discarded |
| 26 | Multi-branch support | Pharmacy chains exist |
| 27 | Staff roles and per-role permissions | A counter device is shared |
| 28 | Licence expiry tracking | Verification that happens once is wrong within a year |
| 29 | The entire Owner console | No operational capability exists today |
| 30 | Audit log surfaced to operators | We record events and nobody can read them |

## Tier 2 — meaningful advantage

| # | Missing | Why |
|---|---|---|
| 31 | Refill prediction from the passive ledger | Turns the app from reactive to anticipatory |
| 32 | Dose reminders with snooze and a skip reason | The skip reason is clinically more valuable than the adherence rate |
| 33 | Adherence view without shame | Streaks are wrong for medication; a missed dose is not a lost game |
| 34 | Price history and price transparency | Pricing is opaque in Iraqi pharmacy retail; this is a genuine differentiator |
| 35 | Widgets (next dose, active reservation) | Zero-friction glanceability |
| 36 | Siri / App Actions shortcuts | "Reorder my mother's medicine" |
| 37 | Photo-to-catalogue medicine recognition | Photograph the box, not the name |
| 38 | Voice search in Iraqi Arabic | Elderly users speak far more readily than they type |
| 39 | Insurance / subsidy eligibility surfacing | Removes the biggest cost surprise |
| 40 | Prescription expiry tracking | Prevents a wasted journey |
| 41 | Cold-chain flag (insulin) | Handling and storage matter clinically |
| 42 | Controlled-substance handling | Regulatory obligation, distinct flow |
| 43 | Pharmacy reliability score | Held and not delivered is the trust-killer; measure it |
| 44 | Patient no-show tracking | The other side of the same trust ledger |
| 45 | In-app support with context attached | Support without context is a second interrogation |
| 46 | Arabic accessibility audit with real screen-reader users | Automated checks do not catch Arabic announcement order |

## Tier 3 — later, deliberately

Named so they are not smuggled in early: delivery, payments and commission,
loyalty, chat between patient and pharmacy, telemedicine, prescription
issuance, wholesale ordering, multi-country.

**Delivery and payments each change the regulatory profile of the product.**
They are not features; they are different companies. Do not add either because
a screen has room.

## Suggested phasing

| Phase | Contains | Definition of done |
|---|---|---|
| **P0 — Foundation** | 1, 2, 3, 4, 5, 9, 11, 12 | One district, twenty pharmacies, a request can be answered |
| **P1 — The loop** | 6, 7, 8, 10, 13, 17, 25 | A patient can go from photo to pickup without phoning anyone |
| **P2 — Trust** | 14, 15, 18, 19, 20, 21, 22, 23, 43, 44 | The privacy and reliability promises are checkable |
| **P3 — Operations** | 24, 26, 27, 28, 29, 30 | The platform can be run by someone who is not an engineer |
| **P4 — Advantage** | Tier 2 | The product is hard to copy |

**P0's definition of done is a market outcome, not a feature list.** If twenty
pharmacies in one district do not reliably answer, no amount of P1 helps.
