# قريب — Qareeb

The healthcare digital hub, built. Arabic-first, RTL-native, QR-first, WhatsApp-native.
Zero backend, zero accounts, zero checkout — a static site.

    npx serve hub          # or open hub/index.html

## The visual language: TIME & PLACE

Five elements carry the identity. Remove the logo and these still identify the product.

| Element | What it is | Where it appears |
|---|---|---|
| **The Ribbon** | A 24-hour time band. Mirrored right-to-left in Arabic, because an Arabic timeline should flow the way Arabic reads. Three densities: `micro` on cards, `day` on profiles/status, `week` as the 7-row *week shape* that replaces a timetable. | Every doctor, pharmacy, hospital and the live city pulse |
| **The Chamfer** | Every surface cuts exactly one corner — always the **leading** one, so the silhouette itself flips with the language (top-right in Arabic, top-left in English). | Cards, buttons, tiles, avatars, sheets, the slip |
| **The Seal** | Verification as a stamped seal (ختم), never a blue checkmark — a blue tick reads as social media and is worth nothing here. | Verified badges, the "sent" stamp |
| **Place tiles** | Location as proud Arabic district names on a tile grid. Never a map, never a dropdown, never a street address (Iraq has no reliable street addressing). | The location sheet, the persistent place tag |
| **Sand, not white** | Warm off-white surfaces. This single token is what stops the product reading as a hospital website. | Everywhere |

Plus the two things `open now` does that a badge cannot: it **lights the leading rail**
of the card, and it **lights its own segment** on that card's ribbon.

## The homepage is a sentence, not a search bar

    أحتاج [ طبيب ⌄ ] قرب [ الكرادة ⌄ ] الآن.

Both blanks are tappable. The location blank opens the place tiles; the need blank opens
the need grid. It is the product's whole proposition in one readable line, and it doubles
as the empty-state engine — when nothing matches, the same sentence proposes the next move.

## Files

    hub/
    ├── index.html        # shell + OG share card meta
    ├── css/qareeb.css    # design system: tokens, ribbon, chamfer, seal, cards, states
    └── js/
        ├── data.js       # districts, specialties+symptom aliases, doctors+sessions,
        │                 # facilities, products, admin metrics  (EDIT THIS)
        └── app.js        # time engine, geo, router, 22 screens, sheets

## Data model

The atomic unit is the **practice session**, not the doctor. An Iraqi doctor typically works
a public-hospital morning shift *and* a private evening clinic — different address, different
hours, different fee. `PracticeSession = practitioner × facility × weekday × time × fee`.
A doctor with no session is never listed. This is what makes "open now" and "next available"
computable at all, and it is what the week ribbon renders.

## Conventions worth keeping

- **24-hour time everywhere.** It aligns in a column and contains no letters, so an Arabic
  RTL line can never reorder it. `12h + ص/ظ/م` inside a forced-LTR run gets mangled.
- **Distances state their approximation once**, in the results header — not with a `~` on
  every card. Repeated tildes are noise and a bidi hazard.
- **No ratings, no stars, no reviews.** Without real volume they are either empty or gamed.
  Trust is carried by the seal, the affiliation, the fee, and "updated N days ago".
- **The page container animates opacity only.** A `transform` on `#app` would make it the
  containing block for `position: fixed` children and detach the bottom nav.

## Configuration

Everything lives at the top of `js/data.js`:

- `CONFIG.emergency.ambulance` — **verify the local number before launch.**
- `CONFIG.defaultDistrict`, `CONFIG.radiusKm`, `CONFIG.radiusSteps`
- `QR_SOURCES` — per-poster codes. `index.html?qr=p1` resolves the district from the poster
  and shows a dismissible "scanned at …" chip. Scan attribution shows up in `#/admin`.

All phone and WhatsApp numbers in `data.js` are deliberate placeholders (`9647700000xxx`).

## Routes

`#/` · `#/needs` · `#/doctors?spec=` · `#/doctor/:id` · `#/pharmacies` · `#/pharmacy/:id`
· `#/hospitals` · `#/hospital/:id` · `#/care` · `#/care/:cat` · `#/product/:id` · `#/search`
· `#/me` · `#/trust` · `#/admin`

Sheets (not routes): location, appointment request, message preview, sent confirmation,
emergency, report-incorrect-info.
