# QAREEB — Healthcare Digital Hub
## Product Strategy + Implementation-Ready Design Brief

> Working name: **Qareeb / قريب** ("near", and colloquially "close one").
> Market: Iraq (Baghdad first). Language: Arabic-first, RTL, with English toggle.
> Currency: IQD. Channel: WhatsApp. Entry: QR-first.

---

# 1. PRODUCT EVOLUTION

## 1.1 What the raw idea got right

- **WhatsApp as the transaction layer.** In Iraq, WhatsApp *is* the customer service
  layer. Building a booking engine would be building a thing nobody would use.
- **Location as the organising principle.** Health needs are radius-bound.
- **QR as distribution.** Physical posters in pharmacies/clinics are a real,
  cheap, high-intent acquisition channel in this market.
- **Lightweight-first.** No accounts, no checkout. Correct.

## 1.2 What was weak, and what replaced it

| Weakness in the raw idea | Diagnosis | Replacement |
|---|---|---|
| "A database of doctors who work in hospitals" | Wrong mental model. In Iraq a doctor works a **public hospital shift in the morning** and a **private clinic (عيادة) in the evening**. The evening session is where booking actually happens. | Model **Practitioner → many Practice Sessions** (facility × weekday × time × fee). The product's atomic unit is the *session*, not the doctor. |
| Search by "specialty, hospital, name, location, distance" | This is **librarian taxonomy**. Users don't know "gastroenterology"; they know "معدة" / "my stomach hurts". | **Need-first discovery.** A grid of symptom/need chips maps to specialties behind the scenes. Taxonomy stays available, but is not the front door. |
| Booking form: name, phone, date, time, address, notes (6 fields) | The phone number is **redundant** — WhatsApp already carries the sender's identity. The address is redundant for a clinic visit. A 6-field form before a WhatsApp handoff is the single biggest conversion killer. | **Name + tap a session + optional note.** 1 typed field, ~3 taps. Name persists in localStorage → returning users are 2 taps from sent. Plus a parallel **"Message directly"** escape hatch that skips the form entirely. |
| "Cosmetics" as a third pillar | Grafting a beauty store onto a health utility. Incoherent, and unmonetisable without checkout. | Reframed as **"Care" (العناية)** — dermo-cosmetic and personal-care products **stocked by pharmacies already in the network**. Skin / hair / baby / sun / hygiene. It is not a separate store; it is *the shelf of the pharmacy you can already see on the map*. This makes the third pillar the natural third act of the same journey, and gives the network its commercial engine. |
| Hospitals as a co-equal browse tree | Nobody wakes up wanting "a hospital". They want a person, or they want an ER. | Hospitals become a **facet + profile page**, not a top-level tab — with one exception: **Emergency**, the only case where the building matters more than the person. Hospitals earn their nav presence through the emergency affordance. |
| Ratings / reviews (implied) | With no volume, ratings are either empty (looks dead) or gamed (destroys trust). Fake stars are worse than no stars. | **No ratings at v1.** Trust is carried by: verification badge, hospital affiliation, credentials, **"info updated N days ago"**, and a **"Report incorrect info"** button on every profile. |
| Location permission as a gate | A permission modal on a cold QR scan is a bounce. | **Never gate.** Land on real content using a coarse district default; the location chip is always visible and always tappable; GPS is requested **at the moment it pays off** (tapping "Nearest" / distance sort). |
| Language unspecified | Fatal omission for this market. | **Arabic-first, RTL-native, English toggle.** Not an afterthought layer — the design is authored in Arabic and mirrored to English. |
| No re-entry after WhatsApp | The user leaves the site the instant the handoff fires. | **Confirmation screen + local "My Requests"** ledger with a reference code (e.g. `#A7K2`) embedded in the sent message. |
| No distribution loop | QR alone doesn't compound. | **Share-a-doctor** as a first-class action with rich Open Graph cards (WhatsApp group sharing is the real growth engine here), plus a "sent via Qareeb" footer on every generated message, plus **per-poster QR source tracking** in admin. |

## 1.3 The central product idea

> **Not a directory. A shortest-path utility.**
>
> *From "I have a health need" to "I am talking to the right verified human near me"
> in under 60 seconds, in Arabic, over WhatsApp, without an account.*

## 1.4 Why this instead of Google Maps / Search / Instagram / WhatsApp

| Alternative | What it fails at |
|---|---|
| **Google Maps** | Knows buildings, not practitioners. No specialty search, no evening clinic sessions, no fee, no direct WhatsApp. Iraq POI data is stale and hours are frequently wrong. |
| **Google Search** | Returns Facebook pages and dead listings. No distance logic, no structure. |
| **Instagram** | Doctors and pharmacies are there, but unstructured, unsearchable by specialty+distance, and hours live in Stories that expire. |
| **WhatsApp** | Requires you to *already have the number*. That is exactly the gap. |
| **Asking family** | The current default. Slow, biased, and the reason the market is winnable. |

**The moat is not technology. It is _curated, verified, current, local structured data_ —
specialty, session times, fee, and a working WhatsApp number — that nobody else has assembled.**

## 1.5 The promise (headline territory)

> **"احجز عند أقرب طبيب — برسالة وحدة."**
> *"The right doctor near you. One message away."*

## 1.6 Pillar hierarchy — deliberately unequal

| Pillar | Weight | Role |
|---|---|---|
| **Doctors** | ~60% | The reason to scan the QR. Acquisition. |
| **Pharmacies** | ~30% | The reason to come back. Retention. Killer feature: **"Open now / Night duty"**. |
| **Care (products)** | ~10% | The reason it makes money. Monetisation. |

**Unifying spine — one journey, three moments:**
**ASK** (doctor) → **FILL** (pharmacy) → **CARE** (products).
Connective tissue: **location + verification + WhatsApp**. Same card anatomy, same
action grammar, same trust language across all three. That is what makes it one
ecosystem rather than three apps in a trench coat.

---

# 2. FINAL PRODUCT ARCHITECTURE

## 2.1 Positioning

**Category:** Local health access utility (not a marketplace, not a directory, not a clinic app).
**One-liner:** The fastest way to reach verified healthcare near you in Iraq.
**Anti-positioning:** Not a telemedicine app. Not an e-commerce store. Not a hospital website.
Qareeb does not diagnose, does not process payment, does not hold medical records.

## 2.2 Users

**Primary persona — "Umm Zayd", 34, Baghdad.**
Mid-range Android, 4G, data-conscious, Arabic-first, low-to-moderate digital confidence.
Deciding for the whole household (kids, parents, herself). Wants: *which doctor, when
are they open, how far, how much, and can I message them now.* Will not create an
account. Will not type a paragraph. Will share a good find into three WhatsApp groups.

**Secondary users**
- The night seeker (2 a.m., "which pharmacy is open?") — highest emotional intensity.
- The newcomer / traveller (new district, no network of family recommendations).
- The chronic-care returner (same doctor, same pharmacy, repeatedly).
- **Supply side:** doctors' secretaries, pharmacy owners, hospital admin — they never
  log into the public site; they receive WhatsApp messages and (later) manage a listing.
- **Platform operator:** the curation/verification team. Admin is a first-class product.

## 2.3 Primary user intents (design must serve these in rank order)

1. "Find me a **[specialty/symptom]** doctor near me, open soon." *(dominant)*
2. "Find **Dr. [name]** — I have the name, I need the number and hours."
3. "Which pharmacy near me is **open right now**?"
4. "Where is **[hospital]** and who works there?"
5. "I need **[product]** — who has it near me?"
6. **Emergency** — "nearest ER, now." *(rare, but must never be more than one tap away)*

## 2.4 Information architecture

```
ENTRY  ── QR (poster / pharmacy counter / clinic card)  ─┐
       ── Direct URL                                     ├─→  HOME (context-resolved)
       ── Shared WhatsApp link (deep link to entity)     ─┘

HOME
 ├── Location chip (always visible, always editable)        ← the context anchor
 ├── One search field (doctors · specialties · hospitals · pharmacies · products)
 ├── PRIMARY: "Find a doctor"          → Need grid
 ├── SECONDARY: "Pharmacy open now"    → Pharmacies (open-now default ON)
 ├── TERTIARY: "Care & products"       → Care home
 ├── Emergency strip (persistent, low-chroma until tapped)
 └── Nearby rail (mixed: 3 nearest open doctors / 3 nearest open pharmacies)

DOCTORS
 ├── Need grid (symptom chips → specialty)   ← primary front door
 ├── Results (filter: specialty · facility · open-now · distance · fee · gender)
 ├── Doctor profile
 │    ├── Sessions (all facilities, all weekdays, next-open highlighted)
 │    ├── Fee · credentials · languages · verification · last-updated
 │    ├── PRIMARY  → Request appointment (sheet)
 │    ├── SECONDARY→ Message directly · Call · Directions · Share
 │    └── Facility link → Hospital profile
 ├── Appointment request sheet  (Name + session tap + optional note)
 ├── WhatsApp message preview   (editable, Arabic, with ref code)
 └── Handoff confirmation       (what happens next · save · directions)

HOSPITALS  (facet-level, not top-level nav)
 ├── Hospitals near me / Emergency now
 └── Hospital profile → doctors inside · departments · location · contact · ER flag

PHARMACIES
 ├── Nearby list (sorted: open-now → distance; "Night duty" badge)
 ├── Map peek (static strip) — list is primary, map is secondary
 └── Pharmacy profile → hours · services (delivery / night duty / injections /
                        blood pressure / baby formula) · products stocked ·
                        Call · WhatsApp · Directions

CARE (products)
 ├── Category grid (Skin · Hair · Baby · Sun · Hygiene · Supplements · Mother)
 ├── Product list / filters (concern, brand, price)
 ├── Product detail → "Order via WhatsApp" (from the nearest stocking pharmacy)
 └── Stocked-at rail → Pharmacy profile              ← the loop back into the network

SEARCH (global, one field, multi-entity, Arabic-tolerant)
 └── Suggestions → grouped results (Doctors · Specialties · Hospitals · Pharmacies · Products)

MY  (no account — localStorage only)
 ├── My requests (ref code, doctor, session, status: sent)
 └── Saved doctors / pharmacies / products

TRUST
 └── How we verify · report incorrect info · medical disclaimer · privacy · coverage

ADMIN (separate authenticated surface)
 └── Dashboard · Entities · Sessions · Verification queue · Flags ·
     Featured slots · Products · Taxonomy · Coverage/geo · QR generator + sources
```

## 2.5 Location strategy — **three-tier context resolution**

Location is never a gate. It resolves in this order, and the user can override at any time:

| Tier | Trigger | UX |
|---|---|---|
| **T1 — Precise** | User grants GPS (asked in-context, never on landing) | Exact distances, "nearest" sorting, walk/drive time |
| **T2 — Chosen** | User taps the location chip and picks a district | District-level distance ("Karrada · ~2 km"), full functionality |
| **T3 — Inferred / default** | QR poster carries a district param, or fallback to city centre | Everything works; a persistent, honest chip reads *"Baghdad · set your area for exact distance"* |

**Rules:**
- The location chip is the most persistent UI element after the search field.
- Denied permission is a **first-class state**, never an error. Copy is never scolding.
- Manual picker is **landmark- and district-based**, not street-address based —
  Iraq has no reliable street addressing. Never ask a user to type an address.
- Radius defaults to 5 km, auto-expands to 10 → 25 km when results are thin,
  and **says so explicitly** ("No results within 5 km — showing 15 km").

## 2.6 Search strategy

- **One field, multi-entity, always reachable.** Never two search boxes.
- **Arabic-tolerant matching:** normalise أ/إ/آ→ا, ة→ه, ى→ي, strip tashkeel;
  match Arabic and English names and specialty synonyms bidirectionally.
- **Symptom→specialty aliases** are first-class data ("وجع أسنان" → Dentistry).
- Empty state = the **need grid**, not a blank box.
- Zero results = never a dead end: expand radius, relax filters, offer
  "search all of Baghdad", offer "tell us what you were looking for".

## 2.7 Booking + WhatsApp handoff (the money path)

```
Doctor profile
   │
   ├── [Request appointment]  ← PRIMARY, high-contrast
   │      └── Sheet, ONE step, no scroll on a 360×640 screen:
   │            • Session chips: next 7 open sessions, pre-selected = next open
   │            • Name (persisted from localStorage for returners)
   │            • Note (optional, collapsed)
   │            → [Continue]
   │
   ├── Message preview  ← the trust moment
   │      • The exact Arabic message, rendered in a WhatsApp-like bubble
   │      • Editable
   │      • Ref code #A7K2 shown
   │      → [Send on WhatsApp]  (wa.me deep link)
   │
   └── Confirmation (on return / on blur)
          • "Sent to Dr. X's clinic"  • ref code  • typical reply time
          • [Get directions] [Save this request] [Share this doctor]
```

**"Message directly"** is always present as a secondary action and skips the form
entirely — pre-filling only a greeting. Never force the form.

Generated message template (Arabic primary):

```
السلام عليكم، أود حجز موعد.

الطبيب: {{doctor}}
العيادة: {{facility}} — {{district}}
الموعد المطلوب: {{weekday}} {{date}} — {{time_range}}
الاسم: {{patient_name}}
{{#note}}ملاحظة: {{note}}{{/note}}

الرمز: #{{ref}}
—
عبر قريب · {{short_url}}
```

## 2.8 Trust & verification system

Two tiers only. More tiers = noise.

| Tier | Badge | Meaning |
|---|---|---|
| **Verified** | Solid badge + "موثّق" | Identity, credentials, affiliation and WhatsApp number confirmed by the operator |
| **Listed** | No badge, muted "معلومات عامة" note | Publicly-sourced information, not yet confirmed |

Supporting trust mechanics:
- **"Updated N days ago"** on every profile. Staleness > 90 days downgrades display.
- **"Report incorrect info"** on every profile → admin flag queue. Free data hygiene.
- **Medical disclaimer**, permanent and quiet: Qareeb does not provide medical advice.
- **Emergency line**, configurable per market, always one tap from Home
  (Iraq ambulance number — operator must verify before launch).
- **Privacy line:** no account, no health data stored, the request goes straight to
  the clinic. Say it out loud on the booking sheet.
- **No ratings, no stars, no review counts at v1.**

## 2.9 Data architecture concept

```
Geo            : Governorate → District → (optional) Landmark
Facility       : id, type[hospital|clinic|pharmacy|store], name_ar/en, geo,
                 coords, phone, whatsapp, hours[], flags[er|night_duty|delivery],
                 verification, updated_at
Practitioner   : id, name_ar/en, title, specialties[], subspecialties[],
                 credentials[], languages[], gender, photo, bio_short,
                 whatsapp, accepting_requests(bool), verification, updated_at
PracticeSession: practitioner_id, facility_id, weekday, start, end, fee_iqd,
                 booking_channel, notes            ← powers "open now" & "next open"
Specialty      : id, name_ar/en, icon, symptom_aliases[], parent
Product        : id, name_ar/en, brand, category, concern_tags[], price_iqd,
                 images[], stocked_at[facility_ids]
Category/Brand : taxonomy for Care
Request        : ref, practitioner_id, session_id, name, note, created_at,
                 source_qr, status(sent)          ← analytics only, never medical data
Flag           : entity, field, reported_value, reporter_meta, status
QRSource       : code, label(poster location), district_hint, scans
```

Invariant: **a doctor is never displayed without at least one PracticeSession.**
No session = no listing.

## 2.10 Admin architecture

Admin is a real surface, designed, not "just a CRUD".
- **Dashboard:** scans by QR source, searches (incl. **zero-result searches** — the
  single most valuable growth signal), requests sent, top specialties, top districts.
- **Entity manager:** one generic table pattern for doctors / hospitals / pharmacies / products.
- **Session editor:** a **weekly grid**, not a list of rows. This is the highest-frequency
  admin task and deserves a purpose-built control.
- **Verification queue** and **flag queue** as work queues with a decision per item.
- **WhatsApp validator:** format-check `964…`, flag numbers that bounce.
- **Featured slots:** operator-controlled placement (the ad product).
- **QR generator:** per-poster codes with district hint + scan attribution.
- **Coverage editor:** which districts are live; drives the out-of-coverage state.

## 2.11 Scalability (design must not block these)

City expansion (Basra, Erbil, Mosul) · Kurdish locale · labs & radiology as a fourth
facility type · home-visit nursing · doctor self-service portal · paid featured
placement · insurance filters · in-app chat replacing wa.me. **None of these are
designed now** — but nav, card anatomy, and the facility model must not forbid them.

---

# 3. SCREEN INVENTORY

Sheets and overlays are **states**, not screens. This is the minimum complete set.

## Public — 16 screens

| # | Screen | Purpose / primary action |
|---|---|---|
| P1 | **QR / Entry resolution** | Sub-second context handoff. *Not a splash.* Resolves poster code → district → renders Home. |
| P2 | **Home** | Answer "what can I do here?" in 3 seconds. Primary: Find a doctor. |
| P3 | **Location sheet** | Grant GPS / pick district / continue without. Never blocking. |
| P4 | **Need grid (Find a doctor)** | Symptom/specialty chips → results. The main front door. |
| P5 | **Doctor results** | Scan, compare, filter, sort. Primary: open a profile. |
| P6 | **Doctor profile** | Decide + act. Primary: Request appointment. |
| P7 | **Appointment request sheet** | One step. Primary: Continue. |
| P8 | **Message preview + handoff** | Remove pre-send anxiety. Primary: Send on WhatsApp. |
| P9 | **Handoff confirmation** | Re-entry point after WhatsApp. Primary: Directions / Save. |
| P10 | **Global search** | One field, grouped multi-entity results. |
| P11 | **Pharmacies nearby** | Open-now first. Primary: Directions / WhatsApp. |
| P12 | **Pharmacy profile** | Hours, services, stocked products, contact. |
| P13 | **Hospitals + Hospital profile** | Emergency, location, doctors inside. |
| P14 | **Care home + category** | Browse products by concern. |
| P15 | **Product detail** | Primary: Order via WhatsApp from nearest stocking pharmacy. |
| P16 | **My (requests + saved)** | Return-user value with zero account. |

Plus two system screens: **Trust / About** and **Out-of-coverage & 404**.

## Admin — 6 screens

A1 Login · A2 Dashboard · A3 Entity list (generic table) ·
A4 Entity editor (incl. weekly session grid) · A5 Verification & flags queue ·
A6 Featured slots + QR generator.

## States that must be designed for every list/profile screen

`loading (skeleton)` · `empty` · `zero-results` · `error/offline` ·
`location-denied` · `out-of-coverage` · `stale-data` · `closed-now` ·
`not-accepting-requests` · `missing-whatsapp`.

---

# 4. DESIGN PRINCIPLES

1. **Arabic is the source of truth.** Design RTL first; English is the mirror. Type
   scale, line-height, icon direction and number alignment are all decided in Arabic.
2. **Calm competence, not clinical sterility.** The feeling of a good clinic reception:
   clean, warm, unhurried, quietly expert. Warm off-white surfaces, never pure-white
   hospital glare; deep teal/petrol as primary (health without the corporate-blue
   cliché); a single warm amber reserved for *time* (open now / closing soon); coral-red
   reserved **exclusively** for emergency, used nowhere else.
3. **Time is the hero metric.** Distance and open/closed status carry more visual
   weight than photography. A doctor card's most important line after the name is
   *"Open today 4:00–8:00 PM · 2.1 km"*.
4. **Dense, but airy.** Five facts per card without a spreadsheet feel — achieved with
   typographic hierarchy and a meta-chip row, not with borders and dividers everywhere.
5. **One card anatomy across all three pillars.** Thumb · title · qualifier · meta-chip
   row · one primary action. This single decision is what makes Doctors, Pharmacies and
   Care read as one ecosystem.
6. **List is primary; map is secondary.** Users want a decision, not exploration — and
   bandwidth is expensive. Static map *peeks*, and hand navigation off to Google Maps.
   **A full-screen map homepage is forbidden.**
7. **Never gate, never scold.** Permissions, missing data and empty results are
   designed states with a way forward, not walls.
8. **Every dead end has a door.** Zero results → widen radius. Closed clinic → next
   open session. No WhatsApp → call. Not in your city → notify me.
9. **Motion is functional only.** 150–250 ms, ease-out, for sheets, chips and
   skeleton→content. No parallax, no scroll-jacking, no decorative loops.
   Honour `prefers-reduced-motion`.
10. **Thumb-first.** Bottom nav (max 4), bottom sheets not centre modals, sticky action
    bar on profiles, 48 px targets, safe-area insets.
11. **Desktop is a different layout, not a stretched phone.** Persistent filter rail +
    results + detail pane; max ~1200 px. But mobile wins every trade-off.
12. **Accessibility is non-negotiable.** 4.5:1 contrast, never colour-only meaning
    (open/closed needs icon + text), visible focus states, labelled inputs.
13. **Performance is a design constraint.** Budget: interactive in under 3 s on a
    mid-range Android over 4G. No hero video, no icon libraries pulled wholesale,
    no font loaded for a single weight. Skeletons over spinners.
14. **Trust is typographic, not decorative.** Verified badges, "updated N days ago",
    fee transparency and a quiet disclaimer do more than a stock photo of a smiling
    doctor ever will.
15. **No template smell.** No hero-with-blurred-doctor-photo, no three-icon "Why choose
    us" strip, no testimonial carousel, no gradient CTA blobs, no gradient text,
    no glassmorphism, no e-commerce sale badges.

---

# 5. FINAL CLAUDE DESIGN TASK

*(See the accompanying section in the delivery message — copy-paste ready.)*
