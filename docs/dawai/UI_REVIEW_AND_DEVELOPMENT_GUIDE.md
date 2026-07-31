# Dawai (دوائي) — Full Critique, Competitive Research & Development Guide

**Audience:** the developer of `dawai-ui-preview.html`
**Reviewer roles:** software critic · web designer · app (UX/UI) designer
**Scope:** the static UI preview on `cursor/build-dawai-platform-291f`, the product design it implies, and how you should grow from here
**Status:** the mechanical code fixes listed in Part I are already applied on branch `claude/dawai-ui-review-6w4x26` — diff that branch against the original to see every change in context.

---

## 0. How to read this document

This is written directly to you, the person who built the preview. It is long on purpose: it is a critique, a research comparison against real products in the same space, a technical roadmap, and career advice — in that order. If you only have one hour, read **Part I** (defects), **Part IV** (missing product states), and **Part X** (the checklist). Everything else is there for when you start building the real app.

One framing rule before anything else, because it explains most of the critique:

> **You designed the happy path. In a two-sided marketplace, the unhappy path *is* the product.**

A patient who gets three offers in five minutes needs almost no design. The patient who gets **zero offers**, the pharmacy that wants to say **"I have a substitute, not the exact drug"**, the reservation that **expires while the patient is in traffic** — those are the moments that decide whether Dawai earns trust or gets uninstalled. Keep that in mind through every section below.

---

## 1. Verdict and scorecard

| Dimension | Score | Summary |
|---|---|---|
| Visual design & brand | **8/10** | Coherent palette, good Arabic type pairing, confident identity. Best part of the work. |
| Product thinking (happy path) | **7/10** | The request → offers → hold flow is genuinely well-conceived. Freshness timestamps and privacy masking show real insight. |
| Product thinking (edge states) | **3/10** | No empty, error, expired, cancelled, or offline states. Pharmacy offer-composition screen missing entirely. |
| Code correctness | **5/10** | Real bugs: broken centering math, physical CSS properties in an RTL document, hard-coded sticky offsets, wrong Arabic dual form. |
| Accessibility | **2/10** | No focus styles, unlabeled inputs, unannotated emoji, broken ARIA pattern, sub-minimum text sizes and tap targets. |
| Architecture readiness | **4/10** | 4× duplicated header and nav, scattered inline styles, no tokens/component discipline that would survive a framework port. |
| Regulatory awareness | **4/10** | Good instinct on privacy masking; missing Rx handling, pharmacy licensing display, price disclaimers. |

**Overall: a strong designer's first draft with a junior engineer's implementation.** That is not an insult — it is a precise diagnosis, and every gap listed here is fixable with habits, not talent. The visual instinct is above average; the engineering discipline needs to catch up to it.

---

## 2. What you did right (keep doing these)

Credit where due, because these choices are ahead of most first drafts in this space:

1. **The reverse-marketplace concept itself.** Every competitor in the region (Chefaa, Vezeeta) is an *inventory e-commerce* model: browse a catalog, order, hope stock data is right. You inverted it: the patient broadcasts a need and pharmacies **confirm availability in real time**. In a market where Iraqi pharmacies reportedly run 20–40% daily stock-outs, confirmed availability is the product. This is a real differentiator — protect it.
2. **Freshness as a first-class UI element.** "آخر تأكيد قبل 4 د · صالح حتى 10:42" is exactly the right instinct. Stale availability data is the #1 failure mode of every medicine-finder; you made staleness visible. Most funded competitors don't do this.
3. **Privacy masking before commitment.** "لا يظهر اسم المريض ولا الهاتف ولا الوصفة قبل الحجز المؤكد" — showing pharmacies only the approximate area and the drug until the patient commits is correct marketplace design *and* correct health-data design.
4. **The safety line.** "دوائي لا يشخّص ولا يصف" — stating clearly what the platform does *not* do is rare and valuable. It positions the pharmacist, not an algorithm, as the medical decision-maker. Keep this sentence on every surface where it matters.
5. **The countdown-starts-after-confirmation rule.** The idea that the hold timer only starts once the pharmacy confirms is subtle, fair-to-both-sides marketplace mechanics. (The implementation contradicts it — see Part I — but the *rule* is right.)
6. **Type and color system.** Noto Kufi for display + IBM Plex Sans Arabic for body is a professional pairing. The forest/mint/coral palette with CSS custom properties shows systems thinking.
7. **Mobile-first shell** with `env(safe-area-inset-bottom)`, sticky headers, and a 480px column — the right frame for the market you're targeting.

---

## Part I — Code defects (found and fixed)

Every item below was a real bug in the shipped file. All are now fixed on this branch; study the diffs, because each one teaches a category of mistake, not just an instance.

### I.1 Broken centering math (the radar)

```css
/* Before — pushes the element RIGHT of center by half its own width */
.welcome-radar .center { inset: 50% auto auto 50%; transform: translate(50%, -50%); }

/* After */
.welcome-radar .center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
```

`left: 50%` positions the element's left edge at center; you must then pull it **back** by half its width (`-50%`), not push it further. **Lesson:** never trust positioning code by reading it — open the page and look. This bug was visible on first render.

### I.2 Physical CSS properties in an RTL document

Your document declares `dir="rtl"`, but the stylesheet used physical properties (`left`, `right`, four-value `padding` shorthand) in several places:

```css
/* Before — the extra padding lands next to the button, not next to the text start */
.medicine-search { padding: 0.45rem 0.45rem 0.45rem 0.85rem; }

/* After */
.medicine-search { padding: 0.45rem; padding-inline-start: 0.85rem; }
```

Same class of fix applied to `.welcome-radar .p1/.p2/.p3` and `.explainer-grid article > span` (now `inset-inline-start`/`inset-inline-end`). **Rule to internalize:** in any document that has — or might ever have — both directions, *default to logical properties* (`padding-inline`, `margin-block`, `inset-inline-start`, `border-start-start-radius`). Reach for physical properties only when something is genuinely physical (e.g., a shadow direction). This must become muscle memory for you; you are building for an RTL-first market.

### I.3 Hard-coded sticky offset

```css
/* Before */ .product-header { position: sticky; top: 64px; }
```

64px was the *assumed* height of the preview bar — but the bar is `flex-wrap: wrap`, so on narrow screens it wraps to two lines (~100px) and the product header slides underneath it. Fixed with a custom property synced from the measured height:

```css
:root { --bar-h: 64px; }
.product-header { top: var(--bar-h); }
```
```js
function syncBarHeight() {
  const bar = document.querySelector(".preview-bar");
  if (bar) document.documentElement.style.setProperty("--bar-h", bar.offsetHeight + "px");
}
window.addEventListener("resize", syncBarHeight);
syncBarHeight();
```

**Lesson:** any time you hard-code a magic number that describes another element's geometry, you have created a bug that fires the moment that element changes. Measure, or restructure so you don't need the number.

### I.4 Wrong Arabic dual form

`<h2>2 عروض</h2>` → `<h2>عرضان</h2>`. Arabic has six plural categories, and template strings like `${n} عروض` will be wrong for most values of n. When you move to JS rendering, use the platform's own pluralization instead of hand-rolled conditionals:

```js
const pr = new Intl.PluralRules("ar");
const OFFERS = {
  zero: "لا عروض بعد",
  one: "عرض واحد",
  two: "عرضان",
  few: (n) => `${n} عروض`,      // 3–10
  many: (n) => `${n} عرضًا`,    // 11–99
  other: (n) => `${n} عرض`,
};
function offersLabel(n) {
  const rule = pr.select(n);            // "zero" | "one" | "two" | "few" | "many" | "other"
  const v = OFFERS[rule];
  return typeof v === "function" ? v(n) : v;
}
```

**Lesson:** `Intl.PluralRules`, `Intl.NumberFormat("ar-IQ")`, and `Intl.DateTimeFormat` exist so you never hand-format locale-sensitive strings. Learn all three now; they will save you dozens of bugs.

### I.5 Contradictory countdown

The hold screen says "العد التنازلي يبدأ فقط بعد أن تؤكد الصيدلية" next to a frozen `14:32` with no indication confirmation happened. In a static preview this reads as a logic error to any reviewer. When you implement it:

```html
<div class="countdown" role="timer" aria-live="polite" aria-atomic="true">
  <span>⏱ الوقت المتبقي للحجز</span>
  <strong><time id="hold-remaining" datetime="PT14M32S">14:32</time></strong>
</div>
```

- Drive the value from a server-issued `expires_at` timestamp, never from a client-side "start now" — clients sleep, backgrounds, and clock-skew.
- Before pharmacy confirmation, render a *different* state: "بانتظار تأكيد الصيدلية…" with no number at all. Two states, two components.
- `aria-live="polite"` on the *container*, and throttle announcements (announce at minute boundaries, then every 15s under one minute) — a per-second live region is screen-reader torture.

### I.6 Half-wired interactivity

Only the first offer's CTA navigated anywhere; the second offer, all `mobile-nav` links, and both role cards were dead `href="#"`. In a preview shown to stakeholders, dead controls read as *broken*, not *out of scope*. The second offer CTA is now wired; for the rest, either wire them or visually mark them (`aria-disabled="true"` + reduced opacity + a "قريبًا" tag). Never ship a control that looks live and does nothing.

### I.7 Accessibility fixes applied

- **`:focus-visible` outline added globally** — the single highest-impact fix in the file. Before this, a keyboard user navigated blind.
- **`prefers-reduced-motion`** now disables the pulse animation and smooth scrolling.
- **Decorative emoji annotated** with `aria-hidden="true"` (nav icons, pharmacy avatars, radar, quick actions, role cards). Before, a screen reader announced "convenience store" and "leftwards arrow" as content inside every card.
- **Inputs labeled**: search input (`aria-label="اسم الدواء"`) and sort select (`aria-label="ترتيب العروض"`). A placeholder is not a label — it disappears on input and is not reliably announced.
- **Broken ARIA removed**: `role="tablist"` with no `role="tab"`, `aria-selected`, or `tabpanel` is worse than no ARIA (it promises keyboard semantics that don't exist). The switcher is now an honest `<nav>` with `aria-current` toggling. *First rule of ARIA: no ARIA is better than bad ARIA.*
- **Contrast & sizing**: bottom-nav labels bumped from 0.62rem (≈10px, failing) to 0.72rem with `--ink-700` (≈7.4:1 contrast), tap targets to ≥44px, brand tagline likewise.
- **Misc**: `100dvh` alongside `100vh` (iOS browser chrome), `-webkit-backdrop-filter` prefixes, `theme-color` + `description` meta.

### I.8 Remaining accessibility debt (not yet fixed — your queue)

1. **Heading hierarchy**: `<h2>` is used for pharmacy card titles, explainer steps, *and* section headings — three semantic levels, one tag. Offer cards should be `<h3>` under `<h2>العروض المؤكدة</h2>`. Run one pass over the whole document outline.
2. **Meaningful emoji** (🔔 notification bell, status dots) need visually-hidden text alternatives (`.sr-only` utility class — add one).
3. **Status badges** convey state by color+text, fine — but the live dot conveys "active" by animation alone. Pair it with text (it mostly is; keep it that way).
4. **Landmarks**: multiple `<header>`/`<nav>`/`<main>` per page is fine *only because* only one section is visible at a time; when you componentize, make sure hidden screens are `display:none` (they are) or `inert`, so duplicated landmarks never coexist.
5. Test with an actual screen reader (VoiceOver on iOS is your market's dominant one) and with keyboard-only navigation. Ten minutes of this teaches more than any checklist.

---

## Part II — RTL & Arabic engineering rules (internalize these)

You will write Arabic-first UIs for years. These are the standing rules:

1. **Logical properties by default** (I.2 above). Add a lint rule: [`stylelint-use-logical`](https://www.npmjs.com/package/stylelint-use-logical) will flag every physical property automatically. Let the machine remember it for you.
2. **One mechanism for LTR runs inside RTL text.** The file mixed `<bdi dir="ltr">`, `<h1 dir="ltr">`, and `<input dir="ltr">`. Standardize: `<bdi>` for inline runs (drug names inside Arabic sentences), `dir="ltr"` attribute for whole blocks that *are* LTR (a search input for Latin drug names). Write this in a conventions doc so future-you doesn't re-decide it per element.
3. **Numbers and currency:** `12,000 د.ع` hand-formatted with a Latin comma can be reordered by the bidi algorithm depending on context. Use `Intl.NumberFormat("ar-IQ", { style: "currency", currency: "IQD" })` or at minimum wrap the amount in `<bdi>`.
4. **Fonts are your heaviest asset.** Two Google Fonts families × 7 weights over Iraqi mobile networks is a multi-second first paint, and fonts.googleapis.com is not guaranteed reachable. Self-host, subset to Arabic + Latin ranges (`unicode-range`), keep `font-display: swap`, preload only the two weights above the fold. Target: total font payload under 120KB.
5. **`letter-spacing: -0.03em` on `h1`:** be careful — negative tracking degrades connected Arabic script legibility (it was designed for Latin display type). Test with real Kufi headlines; likely remove it for Arabic.

---

## Part III — Design critique (as your web designer)

### III.1 Color semantics are in conflict

`--coral` currently does two contradictory jobs: **primary action** (every CTA) *and* **urgency** (live dot, countdown background). Result: on the hold screen, the "الاتجاهات" button screams as loudly as the expiring timer. A color system is a vocabulary; one word can't mean "go" and "warning."

**Recommendation:** primary actions → `--forest-900` (your brand anchor, currently underused on buttons); reserve coral exclusively for time pressure and destructive/warning contexts. This one change makes every screen calmer and makes urgency actually urgent.

### III.2 The trust surface is empty

The welcome screen promises "الصيدليات الموثقة" — then the offer card shows an emoji avatar, a name, and a distance. The patient is being asked to travel 0.8km on the strength of 🏪. Every credible competitor leads with verification. Each offer card needs, at minimum:

- **License number** (رقم الإجازة) + a "موثقة" checkmark with a tap-through explaining what verification means
- **Open/closed now** with hours (an offer from a pharmacy closing in 10 minutes is a trap)
- A **map thumbnail or static map link** — "0.8 كم" without a direction is weak information
- Later: fulfillment rate ("أكملت 97% من حجوزاتها")

### III.3 Price display reads as a commitment

"12,000 د.ع" in a fact box reads as contractual. Bind the disclaimer to the number, not to a separate line the eye skips: `12,000 د.ع — سعر أكدته الصيدلية، صالح حتى 10:42`. When the hold confirms, restate the price in the reservation card *with the same wording*, so the patient never experiences a price surprise at the counter. Price surprise at pickup is the fastest way to lose both sides of the marketplace.

### III.4 Rx-required is missing and it's not cosmetic

Your demo drug is **Augmentin — an antibiotic**. There is no "يتطلب وصفة" badge anywhere in the flow. This is a regulatory exposure and a patient-safety gap. You need: an Rx badge on search results/offer cards, a prescription-upload requirement gate before an Rx request can be broadcast, and "أحضر الوصفة عند الاستلام" on the hold screen. The pharmacist verifies the prescription at pickup — the platform's job is to set that expectation early.

### III.5 Component duplication will bite you at porting time

The product header appears **4×**, the bottom nav **4×** (one with a redundant inline `grid-template-columns` that repeats the CSS rule), and six elements carry inline `style=""` blobs including an entire styled `<select>`. In static HTML this is tedium; the real cost is that when you port to a framework, every drifted copy becomes a "which one is canonical?" decision. Consolidate *now*: define `.toolbar`, `.sort-select` classes, and treat the four headers as one component that varies by a modifier. **Rule: the third time you paste something, it's a component.**

### III.6 Desktop has no navigation

At ≥900px, `.mobile-nav` is hidden and nothing replaces it — a desktop user of the patient app has zero navigation. Fine for a phone-only preview, but state it in the file ("desktop: preview-bar only") or add a minimal sidebar. Silent capability loss at a breakpoint is a bug class of its own.

---

## Part IV — Product critique: the missing states ARE the product

This is the most important section. Here is the actual lifecycle of a request — every node below is a screen or state, and the preview covers only the three bold ones:

```
draft → broadcasting → **collecting offers** → offers ready → **hold requested**
                │              │                    │               │
                │              ├─ zero offers (T+20min)             ├─ pharmacy confirms → **hold active** → picked up ✅
                │              ├─ partial offers only               ├─ pharmacy rejects/ignores → back to offers
                │              └─ request expires                   ├─ hold expires (patient no-show)
                └─ network lost / retry                             └─ pharmacy cancels (sold out meanwhile)
```

### IV.1 The zero-offers state (build this first)

This is where you will lose the most users, and it is unhandled. Per NN/g's empty-state guidance, an empty state must explain **what's happening, why, and what to do next** — never just a blank list. Design it as an escalation ladder:

- **0–5 min:** reassure — "أُرسل طلبك إلى 3 صيدليات، عادةً يصل أول رد خلال 10 دقائق" (set the expectation with a real median once you have data).
- **T+10 min, no replies:** offer agency — [توسيع النطاق إلى 5 كم] [إرسال لصيدليات إضافية].
- **T+20 min:** honesty — "لم تؤكد أي صيدلية توفر الدواء" + expand radius + notify-me-if-found + (later) pharmacist-suggested alternatives.

A misleading waiting state is worse than an honest failure — users who wait out a spinner that lies develop lasting distrust.

### IV.2 The pharmacy offer-composition screen (half your marketplace is missing)

"متوفر — أرسل عرضًا" currently leads nowhere. This form is the supply side's entire product, and its friction level decides your liquidity. It needs: price (big numeric keypad, IQD formatted), readiness (جاهز الآن / ١٥ د / ٣٠ د chips), quantity confirmation, optional note — **target under 15 seconds to complete**. Pre-fill everything you can.

Equally valuable: **"غير متوفر" must capture a reason** — نفد المخزون / لا نتعامل به / مغلق حاليًا. That single tap is training data for smarter routing later (stop sending dermatology requests to a pharmacy that never stocks dermatologicals) and it's how you avoid burning pharmacies out with irrelevant pings. Notification fatigue on the supply side kills these marketplaces quietly.

### IV.3 The substitute question — decide it explicitly

Iraqi pharmacies are stocked-out of exact SKUs constantly; the *same molecule from another manufacturer* is the daily reality. Your safety line says the platform never substitutes — correct. But the **pharmacist** proposing a substitute in their offer ("نفس المادة الفعالة، شركة مختلفة — بقرار الصيدلي") is consistent with your principle and dramatically improves fill rate. Tata 1mg shows substitutes algorithmically; you should *not* copy that — route it through the pharmacist instead. This is a product decision only you can make, but make it consciously and write it down; don't let the UI decide by omission.

### IV.4 Other missing states, in priority order

1. Request expired (with one-tap re-broadcast)
2. Hold cancelled by pharmacy (rare but trust-critical — apologize, auto-rebroadcast, never dead-end)
3. Loading skeletons (offer cards have a known shape — skeleton them, don't spin)
4. Offline/poor connectivity banner with queued actions (Iraqi mobile networks make this a first-class state, not an edge)
5. Pharmacy dashboard beyond the inbox: today's holds, no-show handling, availability toggle with auto-off at closing time

### IV.5 Prescription privacy needs one sentence

You mask patient identity pre-hold — good. But the 📎 upload needs a trust sentence *at the point of upload*: who sees the prescription image, when, and when it's deleted ("تُحذف صور الوصفات بعد ٣٠ يومًا"). Decide retention now; bolting it on later is much harder.

---

## Part V — Competitive research: where Dawai sits

I researched the products closest to your space. Summary of what each does and what you should take or refuse:

### Chefaa (Egypt) — the regional benchmark
Prescription upload or catalog search → routed to partner pharmacies with stock → delivery in ~90 min; ~5%+ commission per transaction. Their stickiest features are **chronic-care**: scheduled recurring deliveries, refill reminders, medication reminders, and 24/7 pharmacist chat.
**Take:** the chronic-patient loop. A patient who needs Metformin monthly (already in your pharmacy inbox mock!) should be able to say "ذكّرني كل ٣٠ يومًا" → auto-rebroadcast the request. This turns one transaction into a subscription and is your retention engine.
**Refuse:** their catalog-first model — your differentiator is confirmed real-time availability, not an inventory catalog you can't keep truthful.

### Vezeeta Pharmacy (Egypt/KSA/Jordan…) — trust framing
Search, pharmacist chat, or doctor's-note upload; explicitly markets that **all medicines are dispensed from Ministry-of-Health-licensed pharmacies**.
**Take:** the licensing trust language — surface license verification in the UI (Part III.2), not just the pitch deck. Note that even Vezeeta, with heavy funding, runs pharmacy as an extension of a healthcare super-app (doctors + pharmacy + delivery); your focus on the single sharpest pain (availability) is an advantage — don't dilute it early.

### Tata 1mg (India) — content moat
Every drug search returns uses, side effects, interactions, warnings — plus generic substitutes with savings.
**Take (later):** drug information pages. Even a licensed Arabic drug-info dataset one level deep ("ما هذا الدواء؟") adds patient value and SEO surface no Iraqi competitor has.
**Refuse:** algorithmic substitute recommendations — routes around the pharmacist, contradicts your safety line (see IV.3).

### GoodRx (US) — comparison UX patterns
Search drug → form/dosage/quantity pickers → nearby pharmacies with prices → show coupon at pickup. No account needed for core value.
**Take:** (a) structured drug pickers instead of free text alone — form/strength/quantity chips reduce pharmacy-side ambiguity and failed matches; (b) spell-check/autocomplete on drug names (transliterated Arabic→Latin drug names are misspelled constantly — this is a matching-rate feature, not a nicety); (c) saved searches/wallet-style reservation card for repeat purchases; (d) their price-transparency framing.

### MetaPharma (Iraq) — the adjacent B2B
A pharmacy↔supplier ordering network — B2B, not consumer. Two implications: **(1)** no consumer app currently owns "find my medicine in Iraq" — your window is real; **(2)** long-term, the data you accumulate ("47 patients searched for X in Karkh this week, 0 offers") is exactly what pharmacies and suppliers need for purchasing decisions. That aggregated-demand dashboard is a future B2B revenue line MetaPharma doesn't have. Design your event schema now so you're accumulating it from day one (log every request, every no-stock reason, every unfilled search — anonymized).

### Positioning summary

| | Chefaa | Vezeeta | 1mg | GoodRx | **Dawai** |
|---|---|---|---|---|---|
| Model | e-commerce + delivery | super-app + pharmacy | catalog + content | price comparison | **reverse marketplace (broadcast → confirm)** |
| Availability truth | catalog (best-effort) | catalog | catalog | crowd/pricing data | **pharmacist-confirmed, timestamped** |
| Fulfillment | delivery | delivery | delivery | pickup | **pickup + hold window** |
| Medical calls | pharmacist chat | pharmacist chat | algorithmic substitutes | none | **pharmacist-only, platform never decides** |

Your model is the only one whose data is true *by construction* (a pharmacist confirmed it minutes ago). Everything in this report — freshness UI, sub-15s offer form, no-stock reasons, zero-offer escalation — exists to protect that one property.

---

## Part VI — Architecture roadmap (static preview → product)

1. **Extract design tokens first.** Your `:root` block is already a token set — move it to a `tokens.css` (or Tailwind theme) with *semantic* names layered over raw ones: `--color-action: var(--forest-900); --color-urgent: var(--coral);`. The semantic layer is what lets you fix the Part III.1 color conflict in one line.
2. **Component inventory before framework.** From this one file: `AppHeader`, `BottomNav(items)`, `OfferCard`, `StatusBadge(kind)`, `FactGrid`, `Countdown(state)`, `EmptyState(stage)`, `RequestLivePanel`, `QuickReply`. Write this list, then port. Porting screen-by-screen instead of component-by-component is how you end up with four headers again in JSX.
3. **Model the request as an explicit state machine** (Part IV diagram). Whether you use XState or a plain reducer, the states/events/transitions should exist as *data*, with UI as a pure function of state. This single decision forces every missing screen in Part IV to exist, because the machine won't compile without them.
4. **Realtime: SSE before WebSockets.** Offers arriving is a server→client stream; you need nothing bidirectional yet. Server-Sent Events auto-reconnect natively — which matters on flaky networks — and downgrade gracefully to polling. Add WebSockets only when pharmacy chat exists.
5. **Timers are server-truth.** All expiries (`request.expires_at`, `offer.valid_until`, `hold.expires_at`) are server-issued absolute timestamps; clients render countdowns from them and *the server* is the only authority that transitions state on expiry.
6. **PWA + offline early.** Given the market: service worker, app-shell caching, queued mutations with retry, and an honest offline banner. This is cheaper to build in month one than month twelve.
7. **Keep the static preview alive** as a design artifact — but make it honest: one source file per component even if assembled by a trivial build step, so the preview and the app can't drift.

---

## Part VII — Performance budget

Target device: a mid-range Android on a congested 3G/4G network in Baghdad.

| Asset | Current | Budget |
|---|---|---|
| Fonts | 2 families × 7 weights, third-party CDN | self-hosted, subset, ≤120KB, 2 weights preloaded |
| CSS | inline, fine | keep critical CSS inline in the app too |
| JS | ~20 lines, fine | interactive < 200KB gz total in the real app |
| First contentful paint | font-blocked | < 2.5s on Slow 4G — test in DevTools throttling, every release |

Also: replace emoji icons with an SVG sprite in the product (emoji render inconsistently across Android vendors and can't be styled), and lazy-load anything below the fold on the offers list.

---

## Part VIII — Security, privacy, regulatory

1. **Prescription images are medical data.** Encrypt at rest, expiring signed URLs, access limited to the offering pharmacy *after* hold, retention limit stated in-UI (IV.5), and an audit log of every view. Build the audit log from day one — retrofitting one is miserable.
2. **Phone-number brokering.** The hold screen exposes "اتصال". Consider masked/relay calling or in-app contact — the moment raw phone numbers cross the platform, disintermediation ("come, I'll sell to you directly, cancel the app hold") begins. At minimum, log the exchange.
3. **Rx enforcement** (III.4): badge + prescription gate + pickup expectation.
4. **Pharmacy verification pipeline**: license capture at onboarding, manual review step, visible verification state in the UI. "موثقة" must be *checkable*, or it's a liability instead of a feature.
5. **Rate-limit and sign broadcast requests** — a request-broadcast API is a spam cannon against your own pharmacies if unauthenticated.

---

## Part IX — Advice to you, the programmer

You clearly have design sense and product instinct. The gap between this file and professional work is not knowledge you lack — it's **habits you haven't installed yet**. Six, in priority order:

1. **Look at what you built, on real conditions.** The centering bug, the wrapping preview bar, the frozen countdown — all visible in 60 seconds of opening the page on a phone-width viewport. Make a ritual: every change → open it → narrow viewport → keyboard-tab through it → once a week, VoiceOver. You catch 80% of this report's Part I that way, for free.
2. **Let machines remember rules for you.** You should not have to *remember* logical properties, contrast ratios, or ARIA validity. Install: Stylelint (`stylelint-use-logical`), axe DevTools (or Lighthouse a11y) in CI, Prettier, and an HTML validator. Every rule you automate is attention freed for product thinking — which is your actual strength.
3. **Design states before screens.** Before drawing any screen, write its state list: empty / loading / partial / ideal / error / expired. The preview has beautiful ideal states and nothing else — inverting your process (states first, polish second) is the single biggest leap available to you. Sketch the state machine *before* the UI.
4. **The third paste is a component.** Four headers and four navs in one file means the habit isn't installed yet. It applies to CSS (six inline styles), to copy strings, and later to server code.
5. **Write decisions down.** The substitute question (IV.3), the coral conflict (III.1), retention policy (IV.5) — these were decided by omission. Keep a `DECISIONS.md`; one paragraph per decision: context, choice, why. Ten minutes each, and they compound — teams are built on this habit.
6. **Steal from the best, structurally.** You clearly studied good visual design. Do the same for *flows*: install Chefaa and GoodRx, screenshot their empty states, their error recovery, their price displays. Copy the *structure* of what works, then out-execute it in your market with your differentiator (confirmed availability).

**Reading list**, shortest first: NN/g on [empty states](https://www.nngroup.com/articles/empty-state-interface-design/) · MDN on [CSS logical properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values) and [`Intl`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl) · [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) (skim, use as lookup) · *Refactoring UI* (Wathan/Schoger) — it will formalize the visual instincts you already have · the XState docs' introduction to statecharts, even if you never use the library.

---

## Part X — Priority plan and Definition of Done

### Next 30 days
1. ~~Mechanical fixes~~ — **done on this branch** (Part I)
2. Zero-offers escalation state + request-expired state (IV.1, IV.4)
3. Pharmacy offer-composition form + no-stock reasons (IV.2)
4. Rx badge + prescription gate + license number on offer cards (III.4, III.2)
5. De-duplicate header/nav into single sources; kill inline styles

### Days 30–60
6. Color-semantics fix (action=forest, urgency=coral) across all screens
7. Heading-hierarchy pass + sr-only utility + screen-reader test session
8. Self-hosted subset fonts; performance pass on Slow 4G profile
9. State machine written as data; screens regenerated from it
10. `DECISIONS.md` started: substitutes, retention, contact brokering

### Days 60–90
11. SSE offer stream + server-authoritative timers
12. PWA shell + offline queue
13. Chronic-refill reminder loop (the Chefaa lesson)
14. Event logging schema for unmet-demand data (the MetaPharma opportunity)

### Definition of Done — every future screen ships only if:
- [ ] All six states designed (empty / loading / partial / ideal / error / expired)
- [ ] Keyboard-only pass + focus visible on every interactive element
- [ ] Labels on every input; decorative graphics hidden from AT; headings hierarchical
- [ ] Zero physical CSS properties (lint-enforced); LTR runs isolated with `<bdi>`
- [ ] All numbers/dates/plurals through `Intl`
- [ ] Text contrast ≥ 4.5:1; tap targets ≥ 44px
- [ ] No duplicated markup blocks; no inline styles
- [ ] Every timestamp/expiry is server-issued
- [ ] Tested at 360px width on throttled network

---

## Sources

Competitive research referenced above:

- Chefaa: [About](https://chefaa.com/eg-en/about-us) · [Google Play listing](https://play.google.com/store/apps/details?id=app.com.chefaa&hl=en_US) · [TechCabal profile](https://techcabal.com/2025/06/30/chefaa-e-pharmacy/)
- Vezeeta: [ePharmacy launch](https://waya.media/vezeeta-epharmacy/) · [Pharmacy page](https://www.vezeeta.com/en-eg/pharmacy) · [App Store](https://apps.apple.com/eg/app/vezeeta-doctors-pharmacy/id1010281314)
- Tata 1mg: [App Store](https://apps.apple.com/us/app/tata-1mg-healthcare-app/id554578419) · [Google Play](https://play.google.com/store/apps/details?id=com.aranoah.healthkart.plus&hl=en_US) · [Wikipedia](https://en.wikipedia.org/wiki/Tata_1mg)
- GoodRx: [goodrx.com](https://www.goodrx.com/) · [Drug price search](https://www.goodrx.com/search) · [Review](https://www.theseniorlist.com/prescription-discount-card/goodrx/)
- Iraq pharmaceutical context: [Shafaq News on shortages/counterfeits](https://shafaq.com/en/Report/Iraq-s-Pharmaceutical-Crisis-shortages-counterfeit-drugs-and-ineffective-reforms) · [ReliefWeb](https://reliefweb.int/report/iraq/iraq-patients-complain-medicine-shortage) · [MetaPharma](https://www.metapharma.net/supplies_service/index?locale=en)
- Empty/waiting-state design: [NN/g](https://www.nngroup.com/articles/empty-state-interface-design/) · [Pencil & Paper](https://www.pencilandpaper.io/articles/empty-states) · [Eleken](https://www.eleken.co/blog-posts/empty-state-ux)
