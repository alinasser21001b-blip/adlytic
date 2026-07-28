# QAREEB MEDICINE EXPLORER — Implementation Handoff

**Status:** shipped. Written for the next engineer, describing what is in the
codebase now — not a proposal.

**Files:** `hub/js/data.js` (model + seed) · `hub/js/app.js` (engine + surfaces)
· `hub/css/qareeb.css` §25 (the field) · routes `/explorer` `/rx` `/rx/:variant`
`/need/new` `/need/:id` `/radar` `/radar/:facility`

---

## 1. Product concept

Qareeb's existing model answers *"who near me has this?"* inside Baghdad.
Explorer answers the harder question a patient in Basra actually has:

> **Does this medicine exist anywhere in Iraq, and can I reach it?**

It is a **verified, time-bounded pharmacy availability network**. It is not
medicine e-commerce, not a marketplace, and not a search feature bolted onto a
directory. Nothing is sold, dispensed, reserved, or recommended here.

## 2. Product philosophy

Three commitments the code is built around. Breaking any one of them breaks
the product's reason to exist.

**A verified pharmacy is not a verified shelf.** `verified` means a human
confirmed the pharmacy exists and the number reaches it. It says nothing about
the box. The two are rendered as **two separate statements** and never merged
into one badge — see `sigRow()`.

**A stock claim expires by itself.** Nobody has to remember to retract a stale
claim; it decays against the clock. `SIG_TTL = 4320` minutes (3 days), and past
that a signal is dropped in `signalsFor()` so no screen downstream can render
it. A pharmacy that stops answering stops being shown.

**We match an exact variant, never a molecule.** A 50mg vial is not an answer
to a 2.5mg tablet request. `searchVariants()` deliberately has no
"same-molecule, different-strength" fallback. `alt` names exist for **search
recall only** and are never surfaced as "you could take this instead".

## 3. Data model

```
CITY            id · ar · en · lat/lng · seat_ar/seat_en (نينوى → الموصل)
BRANCH          a pharmacy outside Baghdad; same shape as FACILITY + `city`
RX_MED          molecule · rx:bool · cls_ar · alias[] · cold:bool · variants[]
  VARIANT       id · strength · form · pack · alt[]        ← the unit of matching
SIGNAL          v · fac · m (minutes since claim) · q (band) · dl · st
REQUEST         v · city · qty · urg · rxHeld · m · st · resp[]
```

`m` is minutes-since, not a timestamp, so the seed stays deterministic across
sessions. In production this becomes `confirmedAt` and `m` is derived.

**Extensibility:** `PharmacyBranch`, `AvailabilitySignal`, `MedicineRequest`,
`PharmacyResponse` and `DeliveryCapability` all exist as distinct concepts
already. `Fulfillment` and `ContactEvent` are the natural next tables.

### What a request deliberately does NOT carry

No name, no phone, no age, no condition, no prescription image. A request is a
city, a variant, a quantity band and an urgency — the minimum a pharmacist
needs to answer *"can I help"*. See §11.

## 4. State machines

### Availability signal — `sigState()`

| Band | Age | Meaning |
|---|---|---|
| `live` | < 60 min | confirmed now |
| `fresh` | < 6 h | confirmed today |
| `aging` | < 24 h | within 24h |
| `stale` | < 72 h | shown, dimmed, **not counted as stock** |
| *expired* | ≥ 72 h | dropped entirely |

`available` and `low` are the pharmacy's own claim, narrowed by age. A "we have
plenty" from four days ago is not low stock — it is no information, and it
leaves the network.

### Request — `reqState()`

`published → matched → responded → contacted → fulfilled`, with `expired`
reached by the clock at `REQ_TTL = 4320`. A need nobody answered leaves the
feed on its own rather than sitting there implying the network works.

Patient controls: **close as found** and **withdraw** (`closeNeed()`).

## 5. Surfaces

| Route | What it is |
|---|---|
| `/explorer` | Discovery. Opens on the size of the network, then unanswered needs, then *"not near you — but it exists"*, then just-confirmed, trending, local demand. Editorial bands, one idea each. |
| `/rx` | Variant search. Brand, generic, Arabic, English, strength, form, misspellings. |
| `/rx/:variant` | **The availability field** + live signals + stale signals + who else is looking. |
| `/need/new` | Publish a need. Four questions, plus prescription status only when `rx: true`. |
| `/need/:id` | Request detail, responders, live field while waiting, close/withdraw. |
| `/radar` · `/radar/:id` | Pharmacy Supply Mode. |

### The availability field — the signature component

**Not a map.** A map of Iraq at 390px is four pixels of Basra and a lot of
desert, and it implies a precision about location we do not have. The field is
a *reading*: one governorate per row, engraved marks for the pharmacies
reporting stock, brass for anything under an hour old, a flat dash for "no
data". Same visual vocabulary as the identity's tick rule, so it belongs.

Ordering is **by strength of evidence**, not alphabet and not population: a
city with a ten-minute-old confirmation outranks one with four claims from
yesterday (`availabilityField().rank`).

## 6. Search behaviour

`searchVariants()` scores across molecule, brand, alias, strength, form and
pack. Misspelling tolerance via `lev()`, capped at distance 2 and
short-circuited on length — Arabic transliteration of drug names varies a lot
(ميثوتركسات / ميثوتريكسات / ميثوتريكسيت are one request) and a patient hunting a
rare medicine is the last person who should be punished for a letter.

Verified working: `زاريلتو 20` → Rivaroxaban 20mg · `ميثوتركسات` (misspelt) →
ميثوتريكسيت · `methotrexate 2.5` → the 2.5mg tablet, not the vial.

## 7. Matching — `radarFor(facilityId)`

A pharmacy is shown a request when it is **in the same governorate**, OR when
it **has ever signalled that exact variant**. The second clause is the network
effect: a Baghdad pharmacy learns that someone in Basra needs what it happens
to be holding. Ranked: held-stock first, then urgency, then age.

## 8. Pharmacy supply workflow

A pharmacy cannot claim stock casually. `confirmSupply()` opens a deliberate,
itemised confirmation requiring identity, variant, quantity **band**, and
delivery capability, then `submitSupply()` records it as a **claim with a
timestamp**, not as truth.

Quantity is a band (`many` / `few` / `low`), never an integer. A pharmacy
forced to promise a count will either lie or refuse to answer, and the count is
wrong by the time the patient arrives.

## 9. Contact flow

Never jump to WhatsApp. `contactPharmacy()` shows who is being contacted, their
verification state, the age of their claim, and **the exact message**, then the
patient sends it themselves from their own WhatsApp.

The copy states the two things the system cannot know:

> ما نكدر نأكد وصولها، ولا الصيدلية حجزت لك شي إلا إذا كالتلك هي.

This is consistent with the app-wide handoff model (`opened / sent /
abandoned`) — there is no `delivered` state anywhere in Qareeb, because nothing
in the architecture can observe one.

## 10. Trust model

Trust is systematic, not decorative. Three independent facts, never merged:

1. **Pharmacy verification** — durable, human-checked, `.mark` seal.
2. **Claim age** — perishable, always stated in words (`sigAge()`), colour only
   confirms.
3. **Quantity band** — approximate by design.

No ratings. No stars. No review counts. If a reputation system is added later,
base it on operational signals only — response rate, response time, claim
freshness — and label what each one means.

## 11. Safety constraints — non-negotiable

- **No substitution.** `alt` is search recall, never a suggestion. No
  "equivalent to" anywhere.
- **No clinical content.** No dosage, no diagnosis, no appropriateness.
- **Prescription medicines** (`rx: true`) are labelled as such; the UI states
  the pharmacist will ask for the prescription. Choosing "I don't have one yet"
  shows a note that a pharmacist cannot dispense without it and routes to a
  doctor. Qareeb never reads, stores, or interprets a prescription.
  *(Iraqi MoH framework bars dispensing prescription medicines without one —
  Explorer handles discovery and connection, not dispensing.)*
- **No patient identity is ever published.**
- **No open marketplace.** Only pharmacies already in the verified network can
  signal supply.
- **Every claim expires.**

## 12. Arabic / RTL

Authored in Arabic, not translated. 24-hour time, Western tabular numerals
LTR-embedded so bidi cannot reorder them. Durations use `countAr()` with the
**genitive dual** after prepositions (`قبل ساعتين`, not `قبل 2 ساعات`).
Governorates whose seat has its own name render the seat (نينوى → الموصل),
because that is what people say out loud.

## 13. Responsive

Mobile-first at 375px. Hit size is separated from visual size — an inert
`::after` extends every control to 44px without changing the design (app layer
§20). Beyond 560px the column stops rather than stretching: a measuring
instrument has a fixed scale.

## 14. QA checklist — current results

| Check | Result |
|---|---|
| Horizontal overflow, 6 breakpoints × 25 routes | **none** |
| Touch targets < 44px effective | **none** |
| Contrast, **both** surfaces, per text node | **no failures** |
| Distinct radii | `0 / 10 / 999` only |
| Console errors | **none** |
| Expired signal leakage | dropped in `signalsFor()` — verified |
| Data validator | 0 errors |

## 15. Known gaps and future work

- **Seed data is synthetic.** Every phone/WhatsApp number is a placeholder
  (`9647700000xxx`). Signals, requests and trends are illustrative. **Must be
  replaced before launch.**
- No persistence beyond `localStorage`; a published need lives in the browser.
  A real deployment needs the backend and the `Fulfillment`/`ContactEvent`
  tables.
- Admin operator view (verification queue, reported-inaccurate-stock,
  suspicious behaviour) is **not built** — `supplyDemand()` exists and returns
  the city-level gap data an operator map needs, but the screen is not there.
- No pharmacy authentication. `/radar/:id` is open; production needs the
  pharmacy to prove it is that branch before it can signal supply. **This is
  the single most important gap** — without it the "no fake availability"
  guarantee rests on nothing.
