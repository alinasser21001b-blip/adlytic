# TASK FOR CLAUDE DESIGN — QAREEB v2

Copy everything below the line into Claude Design.

---

# QAREEB (قريب) — Design System v2 + New Surfaces

You are designing the next generation of a **live, deployed** Arabic-first
healthcare platform for Baghdad. This is not a concept. The product ships at
`qareeb-iq.netlify.app` and a working design language already exists. Your job
is to **evolve and expand it**, not replace it — and to design the surfaces
that do not exist yet.

Read all of this before drawing anything.

## 1. What the product actually is (this changed — read carefully)

Qareeb is **not** a doctor directory. Iraq already has three (IRAQDR, Doctoury,
Clinicbooking). Research repositioned the product around a gap nobody owns:

> **Iraq has chronic medicine shortages.** The painful, weekly, unowned question
> is not "which doctor" — asked a few times a year and already served — but
> **"who has this medicine right now?"**

Google Maps knows buildings, not stock. Instagram has no inventory concept.
WhatsApp answers 1:1 — you message six pharmacies one at a time. A pharmacy
*chain* cannot build this: routing a customer to a competitor who has the drug
is against its own interest. It needs a neutral party. **That is the moat.**

The product is now **two-sided**:
- **Demand:** patients find medicine, doctors, pharmacies → hand off to WhatsApp
- **Supply:** pharmacies see their own unmet demand → subscribe

## 2. What already exists (do not redesign from zero)

**Routes:** `/` home · `/needs` · `/doctors` · `/doctor/:id` · `/med/:id` ·
`/pharmacies` · `/pharmacy/:id` · `/hospitals` · `/hospital/:id` · `/care` ·
`/product/:id` · `/search` · `/me` · `/trust` · `/partner/:id` · `/admin`

**Signature components that must survive and get stronger:**

| Component | What it does |
|---|---|
| **The Ribbon** | 24h time band, mirrored right-to-left in Arabic. Petrol = hospital shift, amber = private clinic, black marker = now |
| **Week strip (`wk7`)** | 7 cells س ح ن ث ر خ ج, Saturday-first. Filled = working, hollow = not, ringed = today, dotted = next open. **State by fill AND shape, never colour alone** |
| **Intent tiles** | Home's three live tiles carrying computed counts |
| **The Seal** | Verification as a stamp — never a blue tick |
| **The issued slip** | WhatsApp handoff as a receipt with perforated tear edge + mono ref code |
| **Place tiles** | District + landmark (الكرادة / ساحة كهرمانة). Never a map, never a street address |

**Current tokens** (evolve, don't discard):
```
--sand #FAF8F5   --card #FFFFFF   --ink #1A1A18   --ink-3 #6B6862
--petrol #0E5450 --amber-b #E0A029 --coral #C1121F
--pharm #7FB8A4  --cosm #C88A72   --wa #128C3E
type: 8 steps, 3 weights (400/600/700), Arabic body line-height 1.75
radii: 12 / 14 / 999 only
```

## 3. Non-negotiable constraints

1. **Arabic is authored, not translated.** RTL-native. 24-hour time (no ص/م —
   it gets mangled by bidi inside LTR runs). Western numerals, tabular.
2. **Arabic marks the feminine, never the masculine.** «دكتور» is neutral.
3. **No accounts, no cart, no checkout, no ratings, no stars.** Trust =
   verification + "updated N days ago" + report-incorrect-info.
4. **WhatsApp is the transaction layer**, always previewed before sending.
5. **Amber means time. Coral means emergency.** Load-bearing — never decorative.
6. **Time beats distance.** Doctors rank by soonest slot, never by proximity.
7. Mobile-first at **375px**. 48px touch targets. Must work on a mid-range
   Android over throttled 4G — no hero video, no heavy libraries.
8. Never gate, never scold. Every empty state routes somewhere.

## 4. What to design — in priority order

### A. THE DOCTOR PARTNER DASHBOARD (does not exist — highest value)
A pharmacy partner surface exists at `/partner/:id`. The doctor equivalent
does not. A doctor scanning a partner QR must understand in ten seconds why
to participate. The answer is **their own demand data**, not a feature list:
how many people searched their specialty in their district, how many requests
they received, response rate, and what they are missing. Design the screen,
its empty state (a new doctor with no leads yet), and a subscription tier.

### B. AN EXPANDED VISUAL SYSTEM
Take the existing language further:
- A richer surface hierarchy (the app is currently flat — one card style)
- Data visualisation for the partner/admin dashboards (demand over time,
  district heat, response rates) — **must work in RTL**
- An illustration or graphic language for empty states that is Iraqi and
  not generic healthcare stock
- Dark theme refinement

### C. THE MEDICINE AVAILABILITY SCREEN, ELEVATED
`/med/:id` is the product's wedge and currently looks like a list. Design it
as the flagship: confirmation freshness as the primary visual, the scarcity
state as something that motivates action rather than reporting failure.

### D. ONBOARDING FOR QR ENTRY
A first-time user scanning a poster at a pharmacy counter. Currently they land
on home with a context chip. Design something better that does not become a
blocking carousel.

## 5. Deliverable — this format matters for handoff

Return **a single self-contained HTML design board** containing:

1. **A visible component CSS block** — real classes with real values, not
   screenshots. This is how the code gets implemented, so the CSS must be
   readable and copy-able from the file.
2. Each screen at **375px width**, in **Arabic RTL**, with realistic long
   content: «د. زينب محمد عبدالحسين» · «طب الأطفال وحديثي الولادة» ·
   «مستشفى الكاظمية التعليمي» · «أنسولين خلطي 30/70».
3. **Every state**: loading skeleton, empty, zero-result, error, offline.
4. A token sheet: colours with contrast ratios, type scale, spacing, radii.
5. Light **and** dark.

Do not return images only. The CSS text is the deliverable.

## 6. What will be rejected

Corporate blue + white + stock photo of a smiling doctor · a cart or checkout ·
stars or reviews · a full-screen map homepage · gradient blobs · glassmorphism ·
a testimonial carousel · onboarding carousels · Arabic treated as translated
English · anything that needs more than 100KB to render.

---

**Then send the resulting HTML file back to Claude Code to implement.**
