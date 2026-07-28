# CLAUDE DESIGN — BUILD COMMAND
## Product: QAREEB (قريب) — Healthcare Digital Hub · Iraq · Arabic-first · QR-first · WhatsApp-native

**Read this entire document before drawing a single pixel.**
The product strategy below is **decided**. You are not being asked to re-invent the
product. You are being asked to translate a finished product strategy into an
exceptional visual and interactive experience — and to be genuinely creative
*inside* these constraints, not around them.

If you disagree with a strategic decision, note it in one line at the end of your
deliverable. Do not silently redesign it.

---

## 0. WHAT YOU MUST DO, IN ORDER

1. **Review the whole architecture first.** Do not start with the homepage. Start by
   mapping every screen and state listed in §7 and confirming you understand the flow
   in §5.
2. **Build the design system before the screens** (§10). Tokens, type scale, card
   anatomy, chip system, button hierarchy, badge system, states. Everything after
   must consume those tokens.
3. **Design the full product** — all 16 public screens, all 6 admin screens, and all
   listed states. This is a **website**, not a landing page. A beautiful homepage with
   no doctor-results screen is a failed deliverable.
4. **Design mobile at 360 px and 390 px first.** Design desktop after, as a distinct
   layout.
5. **Design in Arabic (RTL) as the primary artefact.** Provide the English (LTR)
   mirror for at least Home, Doctor results, Doctor profile, Booking sheet.
6. **Design every state in §8.** Loading, empty, zero-result, error, offline,
   location-denied, closed, out-of-coverage. These are not optional polish.
7. **Self-review every screen** against the checklist in §14 before you call it done.
   State explicitly which screens you changed as a result of that review.

---

## 1. WHAT THE PRODUCT IS

A mobile-first web platform that connects people in Iraq to **verified healthcare
near them** — doctors, pharmacies, and pharmacy-stocked care products — and hands
them off to **WhatsApp** to complete the interaction.

**It is a shortest-path utility, not a directory.**
The entire product exists to compress this: *"I have a health need"* → *"I am talking
to the right verified person near me"* — **in under 60 seconds, with no account.**

**It is not:** a telemedicine app, an e-commerce store, a hospital website, a
booking engine, or a medical records system. It does not diagnose, does not take
payment, and does not store health data.

---

## 2. WHO IT IS FOR

**Primary — "Umm Zayd", 34, Baghdad.** Mid-range Android, 4G, data-conscious,
Arabic-first, low-to-moderate digital confidence. Decides healthcare for her whole
household. She wants five facts: *which doctor, when are they open, how far, how
much, can I message them now.* She will **not** create an account. She will **not**
type a paragraph. She **will** share a good find into three WhatsApp groups.

**Secondary:** the 2 a.m. "which pharmacy is open" seeker (highest emotional
intensity) · the newcomer in an unfamiliar district · the chronic-care returner ·
and the platform operator, who lives in the admin surface.

Design for a tired parent holding a phone in one hand. Not for a healthy
25-year-old designer on a 15-inch retina screen.

---

## 3. THE PROBLEM IT SOLVES

Today, finding a doctor in Baghdad means asking relatives, scrolling Facebook, or
calling a number that may be wrong. Google Maps knows *buildings*, not
practitioners — no specialty, no evening clinic sessions, no fee, no WhatsApp, and
its Iraq hours data is frequently stale. Instagram has the doctors but no structure.
WhatsApp requires you to already have the number.

**Qareeb's only real asset is curated, verified, current, structured local data:**
specialty · session times · fee · a working WhatsApp number.
**Your design's job is to make that asset feel obvious, trustworthy, and instant.**

---

## 4. HOW IT MUST FEEL

**Calm competence.** The feeling of walking into a good clinic reception: clean,
warm, unhurried, quietly expert. Confident enough not to shout.

| Must feel | Must NOT feel |
|---|---|
| Trustworthy, verified, local, human | Generic hospital website (white + corporate blue + stock photo of a smiling doctor) |
| Fast, light, calm | Generic pharmacy e-commerce (sale badges, red discounts, cart) |
| Premium but unpretentious | Over-designed startup (gradient blobs, glassmorphism, neon) |
| Effortless for a non-technical user | Cold, clinical, bureaucratic, form-heavy |
| Distinctly *of this place* | Template-like, Bootstrap-shaped, or Silicon-Valley-generic |

**Emotional target:** relief. The user should feel *"oh — that was easy, and I trust it."*

---

## 5. THE MAIN USER JOURNEY (design this end-to-end, it is the product)

```
1. Scans a QR poster at a pharmacy counter
2. Lands DIRECTLY on Home — real content, no splash, no permission wall
   → sees "Baghdad · Karrada" chip, one search field, three clear things to do
3. Taps "Find a doctor"
4. Taps a NEED chip — "Tooth pain" / "وجع أسنان" — not a taxonomy dropdown
5. Sees a list of dentists sorted by open-now + distance
   → each card: name, verified badge, facility, "Open today 4–8 PM", "2.1 km", fee
6. Opens a doctor profile → sees sessions, credentials, fee, verification, updated date
7. Taps "Request appointment"
   → ONE sheet: pick a session chip (next open pre-selected) + name + optional note
8. Sees the EXACT Arabic message that will be sent, in a WhatsApp-style bubble,
   editable, with a reference code
9. Taps "Send on WhatsApp" → wa.me deep link fires
10. Returns → confirmation screen: ref code, what happens next, [Directions] [Save] [Share]
```

**Total: 6 taps, 1 typed field.** For a returning user whose name is remembered: **4 taps.**
If your design makes this longer, your design is wrong.

**The parallel escape hatch:** a secondary **"Message directly"** action, always
present on every doctor profile, that skips the form entirely.
**Never force the form.** Forcing a form before a WhatsApp handoff is the single
biggest conversion killer in this product.

---

## 6. INFORMATION ARCHITECTURE

**Bottom navigation — exactly 4 items, never 5:**
`Home` · `Doctors` · `Pharmacies` · `Care`
(`My` lives in the header. `Hospitals` is a facet, not a tab. `Search` is a
persistent field, not a tab.)

**Pillar weighting is deliberately unequal — express this visually:**
Doctors ≈ 60% · Pharmacies ≈ 30% · Care ≈ 10%.

**The unifying spine — one journey, three moments:** **ASK** (doctor) → **FILL**
(pharmacy) → **CARE** (products). Connected by location, verification, and WhatsApp.

```
ENTRY (QR · URL · shared link) → HOME
HOME → Location chip · Search · Find a doctor · Pharmacy open now · Care · Emergency · Nearby rail
DOCTORS → Need grid → Results → Profile → Request sheet → Message preview → Confirmation
HOSPITALS (facet) → Hospitals near me / Emergency → Hospital profile → doctors inside
PHARMACIES → Nearby (open-now first) → Profile → Call / WhatsApp / Directions
CARE → Categories → Products → Product detail → Order via WhatsApp → Stocking pharmacy
SEARCH → one field → grouped results (Doctors · Specialties · Hospitals · Pharmacies · Products)
MY → My requests · Saved   (localStorage, no account)
TRUST → How we verify · Report incorrect info · Disclaimer · Coverage
ADMIN → Dashboard · Entities · Session grid · Verification/flags · Featured · QR sources
```

---

## 7. SCREENS YOU MUST DESIGN

### PUBLIC — 16 screens (+2 system)

**P1 · QR / Entry resolution**
Purpose: sub-second context handoff. **This is not a splash screen and must not
look like one.** At most a ~400 ms branded transition while the poster code resolves
to a district. If resolution is slow, show Home's skeleton — never a logo on a blank
field. Design the "scanned from CarePlus Pharmacy, Karrada" acknowledgement as a
small dismissible context chip on Home, not as a full screen.

**P2 · Home** — *the most important screen in the product*
Must answer "what can I do here?" in **3 seconds**, above the fold, on a 360×640 screen.
- Location chip (district, tappable, always visible) — the context anchor
- One search field: "Doctor, specialty, pharmacy, or product…"
- **Primary CTA: Find a doctor** — visually dominant, unmistakable
- Secondary: **Pharmacy open now** (with a live open-count if available)
- Tertiary: **Care & products**
- Emergency strip: persistent, low-chroma until touched, one tap to call
- "Near you now" rail: 3 nearest open doctors + 3 nearest open pharmacies
- A quiet trust line: "N verified doctors · N pharmacies in Baghdad"
**Forbidden on Home:** hero image of a smiling doctor, a carousel, a "Why choose us"
three-icon strip, testimonials, a full-screen map.

**P3 · Location sheet** — bottom sheet, three equal-dignity options:
`Use my location` · `Choose my area` (district list + search, landmark-based) ·
`Continue without`. **Never blocking, never scolding.** Design the denied state as a
calm, permanent, tappable chip — not an error.

**P4 · Need grid ("Find a doctor")**
A grid of **symptom/need chips** with simple glyphs: Tooth pain · Child fever · Skin ·
Stomach · Bones & joints · Pregnancy · Heart · Eyes · Ear/nose/throat · Mental health ·
Diabetes · General. Below: "Or browse all specialties (A–Z)". **The need grid is the
front door; the taxonomy is the back door.** Do not invert this.

**P5 · Doctor results**
The scanning screen. Filter bar (sticky): `Open now` · `Nearest` · `Specialty` ·
`Facility` · `Fee` · `Doctor gender` (culturally essential — do not omit).
Card must carry, in this priority order:
`Name + title` → `Verified badge` → `Specialty` → `Next open session` → `Distance` →
`Facility` → `Fee` → primary action button.
Design the "N results within 5 km" header AND the auto-expanded-radius variant
("No results within 5 km — showing 15 km").

**P6 · Doctor profile** — the decision screen.
Above the fold: name, title, specialty, verified badge, photo (or a dignified
initial-based avatar — most doctors will have no photo, design for that as the
*default*, not the exception), next open session, distance, fee.
Below: **all sessions across all facilities** (a doctor typically works a hospital
morning shift and a private clinic evening shift — the layout must make this clear
and not confusing) · credentials · languages · services · "Verified · updated 6 days
ago" · "Report incorrect info".
Sticky bottom action bar: **[Request appointment]** primary · **[Message]** ·
**[Call]** · **[Directions]** · **[Share]**.

**P7 · Appointment request sheet** — one step, no scrolling on 360×640.
Session chips (next 7 open sessions, next-open pre-selected) · Name (pre-filled for
returners) · optional collapsed note · a one-line privacy reassurance ·
**[Continue]**. Nothing else. No phone field. No address field. No email.

**P8 · Message preview + WhatsApp handoff** — *the trust moment.*
Render the exact Arabic message in a WhatsApp-style bubble, **editable**, showing
the reference code and the destination ("to Dr. X's clinic · +964 …"). Primary
button: **Send on WhatsApp** in WhatsApp's own green — this is the one place where
borrowing another brand's colour is correct, because it signals *exactly* what will
happen next.

**P9 · Handoff confirmation** — the re-entry point after the user leaves for WhatsApp.
Ref code · what happens next · typical reply time · [Get directions] [Save request]
[Share this doctor] [Find another doctor].

**P10 · Global search** — one field, three states: suggestions (need chips + recent),
grouped results (Doctors · Specialties · Hospitals · Pharmacies · Products), and a
zero-result state that always offers a way forward.

**P11 · Pharmacies nearby** — sorted **open-now first, then distance**.
`Open now` toggle defaults **ON**. `Night duty` badge is prominent and distinct.
Include a small **static map peek** strip — never a full-screen map.
Card actions: `Directions` · `Call` · `WhatsApp`. No booking. Pharmacies are
place-first and time-first.

**P12 · Pharmacy profile** — hours (with a live open/closed state), services
(delivery · night duty · injections · blood pressure · baby formula), a rail of
stocked Care products, contact actions.

**P13 · Hospitals + Hospital profile** — reached from search, doctor cards, or the
emergency affordance. Profile: location, ER availability, departments, contact,
and **the doctors who practise there** (the loop back to P5).

**P14 · Care home + category** — categories by **concern**, not by brand: Skin ·
Hair · Baby · Sun · Hygiene · Supplements · Mother & baby. Frame it as **"the shelf
of the pharmacies near you"** — this is *not* a separate store, and the design must
make that continuity obvious. **No sale badges, no strikethrough prices, no
countdown timers, no cart icon anywhere in this product.**

**P15 · Product detail** — image, name, brand, price in **IQD**, what it's for,
how to use, warnings. Primary action: **Order via WhatsApp** from the *nearest
stocking pharmacy* (named, with distance). Secondary: "Also available at 3 pharmacies
near you" → back into the pharmacy network.

**P16 · My** — requests (ref code, doctor, session, sent-status) and saved items.
**No account, no login, no sign-up prompt anywhere in the public product.**

**System:** `Trust / How we verify` (verification tiers, report info, medical
disclaimer, privacy, coverage) and `Out-of-coverage / 404` (honest, warm, with
"notify me when you launch in [city]" + "browse Baghdad anyway").

### ADMIN — 6 screens

**A1 Login** · **A2 Dashboard** (scans by QR source · searches · **zero-result
searches** — the most valuable growth signal, give it real estate · requests sent ·
top specialties · top districts) · **A3 Entity list** (one generic table pattern
serving doctors/hospitals/pharmacies/products; bulk actions; verification column) ·
**A4 Entity editor** — must include a **weekly session grid** (a purpose-built
weekday × time control, *not* a list of form rows — this is the highest-frequency
admin task) plus a WhatsApp-number validator and a verification toggle ·
**A5 Verification & flags queue** (work queues with one decision per item) ·
**A6 Featured slots + QR generator** (per-poster codes with district hint and scan
attribution).

Admin may be denser and more utilitarian than the public product, but it must use
**the same design tokens**. It must not look like a different company built it.

---

## 8. STATES YOU MUST DESIGN (not optional)

For every list and profile screen: **loading (skeleton, never a spinner)** · **empty** ·
**zero-results** · **error / offline** · **stale data**.

Product-specific states, each of which must be designed explicitly:
- **Location denied** — calm, permanent, tappable chip. Never a red error.
- **Location unavailable / timed out** — falls back to district silently.
- **No doctors nearby** — auto-expand radius and *say so*.
- **No pharmacies open now** — show nearest opening soon + "opens at 8:00 AM".
- **Doctor closed today** — show the next open session prominently; keep
  "Message anyway" available.
- **Doctor not accepting requests** — profile stays visible, request button disabled
  with a reason, message/call still offered.
- **Doctor practises at multiple facilities** — sessions grouped by facility, with
  the *nearest / next-open* surfaced on the card.
- **Hospital with 200 doctors** — search-within + department filter, never an
  infinite dump.
- **Missing WhatsApp number** — hide the WhatsApp action entirely, promote Call.
  Never render a broken link.
- **Incomplete doctor data** — the card must not collapse; design graceful
  degradation for missing photo / fee / bio.
- **Out of coverage** (QR scanned in a city not yet live) — warm, honest, with a
  path forward.
- **Slow connection** — skeletons, progressive image loading, no layout shift.
- **Returning user** — name remembered, recent searches, saved doctors surfaced.

---

## 9. RESPONSIVE BEHAVIOUR

**Mobile (360–430 px) — the primary design target. ~85% of traffic.**
Single column · bottom nav (4 items) · bottom sheets, never centre modals ·
sticky bottom action bar on profiles · 48 px minimum touch targets · safe-area
insets · primary actions in the thumb zone · **no horizontal scrolling except
deliberate rails.**

**Tablet (768–1024 px):** two-column results; sheets become side panels.

**Desktop (1024 px+):** **a genuinely different layout, not a stretched phone.**
Persistent left filter/search rail + results column + detail pane. Top nav replaces
bottom nav. Max content width ~1200 px. Show a real map alongside the pharmacy list
here — desktop can afford it, mobile cannot.

**Performance is a design constraint:** interactive in **under 3 seconds on a
mid-range Android over 4G**. No hero video. No full icon library. No web font loaded
for a single weight. Skeletons over spinners. If a design choice costs more than
100 KB, justify it.

---

## 10. DESIGN SYSTEM — BUILD THIS FIRST

**Language & direction:** **Arabic-first, RTL-native.** Design the Arabic artefact as
the source of truth; English/LTR is the mirror. Directional icons flip; logos, phone
numbers and Latin brand names do not. Use **Western numerals (0–9)** — standard in
Iraqi digital contexts — and make them **tabular** so distances, times and prices
align down a list.

**Typography:** an Arabic-first pairing with a genuine Latin companion — e.g. **IBM
Plex Sans Arabic** with **IBM Plex Sans**. Avoid the over-used defaults that make
every Arabic site look identical. Maximum 3 weights. Arabic needs more line-height
than Latin — set the scale in Arabic and adapt, not the reverse.

**Colour — no random palettes. Reason from the emotion:**
- **Primary:** a deep, grounded **teal / petrol** — health without the corporate-blue
  cliché, and culturally warm in the region.
- **Surface:** **warm off-white / sand**, never pure `#FFFFFF`. *This single choice is
  what stops it reading as a hospital website.*
- **Time accent:** a warm **amber**, used only for open-now / closing-soon / night-duty.
- **Emergency:** a restrained **coral-red**, used **nowhere else in the product**.
- **Text:** deep warm ink, never pure black.
- **Success:** used only for confirmations. WhatsApp green appears **only** on the
  WhatsApp handoff button.
Deliver full light and dark token sets. Every pair must clear **4.5:1**.

**Card anatomy — one canonical card, four variants.**
`thumb/avatar` · `title line` · `qualifier line` · `meta-chip row` · `one primary action`.
Doctor, Pharmacy, Hospital and Product cards are **variants of the same object**.
This single decision is what makes three verticals read as one ecosystem. Do not
design three different card languages.

**Chips:** one chip system serving filters, needs, sessions and meta. Three states
(default / selected / disabled), two sizes. Chips do the work that dropdowns do
elsewhere — they are faster on mobile and more legible in Arabic.

**Buttons:** exactly three levels — primary (filled) · secondary (outline) ·
tertiary (text). **One primary per screen. No exceptions.**

**Badges:** `Verified` · `Open now` · `Night duty` · `Emergency` · `Featured`.
Each must be legible without colour (icon + text) for accessibility.

**Map:** list is primary; map is a **static peek** on mobile and a real panel on
desktop. Navigation is handed off to Google Maps. **A full-screen map homepage is
forbidden.**

**Motion:** functional only. 150–250 ms, ease-out, for sheets, chips and
skeleton→content. No parallax, no scroll-jacking, no decorative loops. Honour
`prefers-reduced-motion`.

**Accessibility:** 4.5:1 minimum · never colour-only meaning · visible focus states ·
labelled inputs · 48 px targets · logical RTL reading order.

---

## 11. HOW THE MECHANICS WORK (bake these into the design, do not invent alternatives)

**Location — three tiers, never a gate.**
`Precise` (GPS, requested **in context** when the user taps "Nearest", never on
landing) → `Chosen` (user picks a district; the manual picker is **district- and
landmark-based, never street-address**, because Iraq has no reliable street
addressing — never ask a user to type an address) → `Inferred` (QR poster district
hint, or city default). The location chip is the **second-most-persistent element
after search** and is always tappable. Radius defaults to 5 km and auto-expands to
10 → 25 km when results are thin, **announcing the expansion**.

**Doctors.** A doctor is a **practitioner with many practice sessions** — typically a
hospital morning shift *and* a private evening clinic, at different addresses with
different fees. The card shows the **nearest / next-open** session; the profile shows
all of them. **A doctor with no session is never listed.** Show the **fee in IQD** —
"how much is the consultation" is the second question every Iraqi patient asks.
Include **doctor gender** as a filter; it is a genuine cultural requirement here.

**Hospitals.** Not a top-level tab. A facet and a profile, reached from search, from
a doctor card, or from the **Emergency** affordance — the one case where the building
matters more than the person. Hospital profiles list the doctors who practise there.

**Pharmacies.** Place-first, time-first, **no booking**. Actions: Directions · Call ·
WhatsApp. The killer feature is **"open now" and "night duty"** — at 2 a.m. this is
the most valuable screen in the product. Design it for someone anxious, in the dark,
in a hurry.

**Care (products).** **Not a separate store.** These are products stocked by the
pharmacies already in the network — organised by **concern** (skin, hair, baby, sun,
hygiene), not by brand. Every product routes to a **named nearby pharmacy** via
WhatsApp. **There is no cart, no checkout, no payment, no wishlist-as-commerce, no
discount badges** anywhere in this product.

**Booking.** Name + session tap + optional note. **No phone field** (WhatsApp carries
the sender's identity — asking for it is redundant friction). **No address field.**
Name persists locally for returning users.

**WhatsApp.** Always show a **preview of the exact message** before sending. Always
include a **reference code**. Always provide a **confirmation/return screen**. Always
offer **"Message directly"** as a form-free alternative. The handoff must feel
**intentional and safe**, never like being thrown out of the site.

**Trust.** Two tiers only: **Verified** (badge) and **Listed** (no badge). Plus
"updated N days ago" on every profile, a "Report incorrect info" action on every
profile, a quiet permanent medical disclaimer, and an emergency number always one
tap from Home. **No ratings, no stars, no review counts** — with no volume they are
either dead or gamed, and both destroy trust faster than their absence.

**Sharing.** "Share this doctor" is a **first-class action**. Design the Open Graph
card that appears when a doctor link is pasted into a WhatsApp group — name,
specialty, district, verified badge. WhatsApp group sharing is this product's real
growth engine; that preview card is a designed surface, not an afterthought.

---

## 12. WHAT YOU MUST **NOT** DESIGN

- ❌ Any sign-up, login, account, profile, or password screen in the **public** product
- ❌ A cart, checkout, payment, or order-tracking flow
- ❌ Ratings, stars, review counts, or a testimonial section
- ❌ An in-app chat or messaging system (WhatsApp *is* the channel)
- ❌ A full-screen map homepage or an in-app turn-by-turn navigation experience
- ❌ A doctor/pharmacy self-service portal (v2)
- ❌ Telemedicine, video consultation, prescription upload, or lab results
- ❌ Insurance flows, multi-city switchers, or a blog/CMS
- ❌ A cookie-consent design essay, a splash screen, or an onboarding carousel
- ❌ Dark patterns of any kind — no fake urgency, no fake scarcity, no fake activity counts

---

## 13. DESIGN MISTAKES THAT WILL FAIL THIS BRIEF

1. Designing a beautiful **landing page** and stopping. This is a website with 22 screens.
2. **Corporate blue + pure white + a stock photo of a smiling doctor.** Instant fail.
3. Treating **Arabic/RTL as a translation layer** applied at the end.
4. Putting a **location permission modal** in front of a cold QR scan.
5. Making the **booking form longer** than name + session + note.
6. Sending the user to WhatsApp **without showing the message first**.
7. Designing only the **happy path** — full data, GPS granted, results found, doctor
   open. Real data is sparse and half these users will deny location.
8. Making **Care** look like an e-commerce store — sale badges, cart icons, strikethrough prices.
9. Three different **card languages** for doctors, pharmacies and products.
10. **Photo-dependent** doctor cards. Most doctors will have no photo; design that as the default.
11. **Decorative motion**, parallax, or scroll-jacking on a 4G budget.
12. Burying **"open now"** — it is the single most valuable data point in the product.
13. Cramming **5 items into the bottom nav**, or hiding the primary action off the thumb zone.
14. Designing an **admin surface** that looks like it came from a different company.
15. **Generic template smell**: hero + 3 feature icons + testimonials + gradient CTA + footer.

---

## 14. SELF-REVIEW CHECKLIST — RUN THIS BEFORE YOU FINISH

For every screen, answer honestly:

- [ ] Does it work at **360 px** wide, in **Arabic**, **RTL**, with **no photos**?
- [ ] Is there **exactly one** primary action, and is it in the thumb zone?
- [ ] Can a **tired, non-technical parent** understand this in 3 seconds?
- [ ] Have I designed its **loading**, **empty**, **zero-result** and **error** states?
- [ ] Does it still work with **location denied**?
- [ ] Does every **dead end have a door** out of it?
- [ ] Does it use the **canonical card**, the **chip system**, and the **token palette** —
      or did I invent something local?
- [ ] Would it survive a **4G connection on a mid-range Android**?
- [ ] Does it pass **4.5:1** contrast, with no colour-only meaning?
- [ ] Does it look like it belongs to the **same product** as the other 21 screens?
- [ ] Does it look like **this specific product for this specific place** — or like a
      template that could be any health app in any country?

Then state explicitly: **which screens did you change as a result of this review, and why.**

---

## 15. DELIVERABLE

1. **Design system sheet** — tokens (light + dark), type scale (AR + EN), colour with
   contrast values, card anatomy + 4 variants, chip system, button hierarchy, badge
   system, spacing scale, motion specs.
2. **All 16 public screens + 2 system screens**, mobile, in Arabic/RTL.
3. **All specified states** (§8), rendered — not described in a caption.
4. **Desktop layouts** for Home, Doctor results, Doctor profile, Pharmacies.
5. **English/LTR mirrors** for Home, Doctor results, Doctor profile, Booking sheet.
6. **All 6 admin screens.**
7. **The WhatsApp Open Graph share card.**
8. **A one-page rationale**: the three most interesting creative decisions you made,
   and what you'd challenge in the strategy.

**Be creative — but be creative where it counts:** in the need grid, in how "open
now" is expressed, in the session/time visualisation, in the WhatsApp handoff moment,
in the empty states, and in making three verticals feel like one ecosystem.
**Not** in inventing new navigation patterns, new colour meanings, or a new product.

**Now review the architecture above, build the design system, and design the product.**
