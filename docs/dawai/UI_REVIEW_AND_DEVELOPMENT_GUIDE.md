# Dawai UI Review & Development Guide

The preview was a useful artifact. It made Dawai concrete enough to inspect, discuss, and
challenge. It also established a credible visual direction: a calm Iraqi-Arabic interface,
a recognizable forest-and-mint brand, a mobile-first composition, and a visible path from a
medicine request to a pharmacy response.

Keep the product contract in view:

> **Find → Confirm → Compare → Reserve → Pickup**

Dawai is not a medicine catalog, a checkout flow, or a delivery marketplace. It is an Iraqi
request-for-availability network. A patient describes a precise need; nearby verified
pharmacies make time-bounded offers; the patient compares those offers; one pharmacy
acknowledges a short hold; and the patient picks the medicine up.

That distinction changes what “good UI” means. A beautiful card for an available medicine is
not the hard part. The hard parts are ambiguity, silence, weak connectivity, stale offers,
partial stock, prescription handling, an expiring hold, an unavailable item after
confirmation, and two people seeing the same transaction from opposite sides.

The central thesis of this review is:

> **you designed the happy path, but in a two-sided marketplace the unhappy path IS the product.**

This is constructive, not dismissive. The happy path proves that you can compose a coherent
surface. The next standard is higher: every visible claim must follow real domain state,
every interaction must work with a keyboard and screen reader, every Arabic sentence must be
grammatically and bidirectionally safe, and every offer must carry enough evidence to justify
trust.

## Verdict & scorecard

| Area | Score | Honest assessment |
|---|---:|---|
| Visual design / brand | **8/10** | The forest, mint, paper, and restrained coral palette is distinctive without looking clinical or generic. Typography, rounded cards, and the radar motif give Dawai a coherent identity. The missing step is a semantic token system that separates action, urgency, safety, and status. |
| Mobile composition | **7/10** | The preview reads well at a narrow width, has a clear primary action, and uses cards sensibly. It still relies on hard-coded sticky geometry, some targets are below 44 px, fixed navigation needs safe-area testing, and several dense three-column fact rows will struggle with long Arabic content. |
| RTL / Arabic engineering | **4/10** | The document is RTL and some Latin medicine names use isolation, which is a good start. Physical CSS properties, incorrect centering math, unisolated numbers, and incorrect Arabic dual grammar show that RTL is being treated as page direction rather than an engineering constraint. |
| Accessibility | **2/10** | The visual hierarchy is stronger than the semantic hierarchy. The tablist is not a real tab interface, dead links and controls are exposed as actions, focus treatment is missing, emoji carry meaning, status updates are not systematically announced, and reduced-motion behavior is absent. |
| Edge-state product thinking | **3/10** | Waiting, offers, and a successful hold are represented. Clarification, no response, radius expansion, stale data, partial fulfillment decisions, rejected holds, offline mutation, failed pickup, and terminal outcomes are not designed as a complete system. |
| Trust / pharmacy surface | **3/10** | Freshness language is useful, but an offer does not yet prove license verification, opening hours, branch identity, location, or who committed to the price. In Iraq’s medicine market, those are not decorative details; they are the value proposition. |
| Marketplace completeness (patient+pharmacy) | **4/10** | The patient side reaches a plausible offer comparison and the pharmacy has an inbox. The pharmacy cannot yet compose the structured offer shown to the patient, manage a hold, explain no stock, or resolve fulfillment. Half of the marketplace contract is still implied. |

### What the scores mean

**Visual design / brand — 8/10.**  
You have enough visual character to stop redesigning the logo and start designing the
system. Preserve the calm base, the compact Arabic headings, and the “range ring” visual
language. Do not spend the next sprint polishing shadows while the offer contract remains
incomplete.

**Mobile composition — 7/10.**  
The information order is mostly right: medicine, request state, offer facts, action. Test it
at 320 CSS px, with 200% text zoom, with a long pharmacy name, and with the browser’s bottom
chrome present. A composition is not mobile-ready merely because its container is 480 px
wide.

**RTL / Arabic engineering — 4/10.**  
`dir="rtl"` is the beginning, not the end. You need logical CSS, isolated Latin fragments,
Arabic plural categories, locale-aware money, and regression fixtures that mix Arabic,
English, digits, units, punctuation, and IDs.

**Accessibility — 2/10.**  
This is the most serious implementation deficit because it affects basic operability. A
screen reader must hear the changing request state without hearing a countdown every second.
A keyboard user must reach, identify, activate, and recover from every control. Color and
emoji cannot be the only status channels.

**Edge-state product thinking — 3/10.**  
The product becomes valuable precisely when the first pharmacy does not reply. If Dawai
cannot explain what happened, ask consent to expand, preserve the request, and offer a safe
next action, it has recreated the uncertainty of calling pharmacies manually.

**Trust / pharmacy surface — 3/10.**  
“Confirmed four minutes ago” is useful evidence, but incomplete. The patient also needs to
know that this is a verified branch, where it is, whether it will remain open, what exactly
was confirmed, and whether the displayed price is the pickup commitment.

**Marketplace completeness — 4/10.**  
An offer card cannot be designed independently from the pharmacy form that creates it. Every
field shown to the patient must have a source, validation, state transition, owner, and
expiry. Build both sides against one contract.

The verdict is therefore not “the preview is bad.” The verdict is more specific:

> **you designed the happy path, but in a two-sided marketplace the unhappy path IS the product.**

## Part I — Code defects (categories with before/after)

The examples below use the preview as evidence, but the fixes should become project-wide
rules. Do not patch only the two HTML preview files and leave the application architecture
unchanged.

### 1. Broken centering math

The radar center mixes a four-value physical `inset` declaration with a transform whose
horizontal sign does not match the selected edge:

```css
/* Before */
.welcome-radar .center {
  inset: 50% auto auto 50%;
  transform: translate(50%, -50%);
}
```

Four-value `inset` means `top right bottom left`; it does not become logical because the
document is RTL. This sets `left: 50%`, then moves the element another half of its own width
to the right. The result is not centered.

For a decorative item that must sit in the exact center, avoid directional arithmetic:

```css
/* After: direction-independent centering */
.welcome-radar {
  position: relative;
  display: grid;
  place-items: center;
}

.welcome-radar .center {
  position: absolute;
  inset: 0;
  margin: auto;
  inline-size: max-content;
  block-size: max-content;
}
```

If the center element must participate in normal layout, simplify further:

```html
<div class="welcome-radar">
  <span class="radar-center">طلبك</span>
  <span class="radar-point radar-point--one">عرض مؤكد</span>
</div>
```

```css
.welcome-radar {
  display: grid;
  place-items: center;
}

.radar-center {
  grid-area: 1 / 1;
}
```

Use transforms for animation, not as the default way to repair layout. That reduces
subpixel errors and prevents an animation from overwriting the centering transform.

### 2. Physical CSS in an RTL document

The preview uses declarations such as `left`, `right`, `top`, `bottom`,
`border-top`, and physical padding shorthands. Some physical block properties are harmless,
but inline direction must not be encoded as left/right.

```css
/* Before */
.mobile-nav {
  left: 0;
  right: 0;
  border-top: 1px solid var(--line);
}

.explainer-grid article > span {
  top: 0.85rem;
  left: 0.85rem;
}

.medicine-search {
  padding: 0.45rem 0.45rem 0.45rem 0.85rem;
}
```

```css
/* After */
.mobile-nav {
  inset-inline: 0;
  inset-block-end: 0;
  border-block-start: 1px solid var(--line);
}

.explainer-grid article > span {
  inset-block-start: 0.85rem;
  inset-inline-end: 0.85rem;
}

.medicine-search {
  padding-block: 0.45rem;
  padding-inline: 0.45rem 0.85rem;
}
```

Use this mapping everywhere:

| Avoid | Use |
|---|---|
| `left` | `inset-inline-start` or `inset-inline-end`, according to intent |
| `right` | `inset-inline-end` or `inset-inline-start`, according to intent |
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `border-top` | `border-block-start` |
| `border-bottom` | `border-block-end` |
| `width` for component sizing | `inline-size` when the logical dimension is intended |
| `height` for component sizing | `block-size` when the logical dimension is intended |
| `top` | `inset-block-start` |
| `bottom` | `inset-block-end` |

Do not mechanically replace `left` with `inline-start`. First state the design intent.
For example, a “next” arrow belongs at `inline-end`; that is left in RTL and right in LTR.

### 3. Hard-coded sticky offsets

The preview assumes its control bar is always 64 px tall:

```css
/* Before */
.screen {
  min-height: calc(100vh - 64px);
}

.product-header {
  position: sticky;
  top: 64px;
}
```

The bar wraps. Its height changes with viewport width, Arabic font metrics, zoom, and the
number of preview tabs. A fixed offset will eventually place the product header under the
bar or leave an unexplained gap.

Measure the actual bar and expose the measurement as a CSS custom property:

```css
:root {
  --bar-h: 0px;
}

.preview-bar {
  position: sticky;
  inset-block-start: 0;
}

.screen {
  min-block-size: calc(100dvh - var(--bar-h));
}

.product-header {
  position: sticky;
  inset-block-start: var(--bar-h);
}
```

```js
const previewBar = document.querySelector(".preview-bar");

if (previewBar) {
  const syncBarHeight = () => {
    const height = Math.ceil(previewBar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--bar-h", `${height}px`);
  };

  const observer = new ResizeObserver(syncBarHeight);
  observer.observe(previewBar);
  syncBarHeight();
}
```

In the production application, the preview bar does not exist, so the app header should
normally use `inset-block-start: 0`. Do not carry preview-only geometry into product
components.

Use `100dvh`, not only `100vh`, where mobile browser chrome changes the dynamic viewport.
Keep a tested fallback if you support older WebViews:

```css
.screen {
  min-block-size: calc(100vh - var(--bar-h));
  min-block-size: calc(100dvh - var(--bar-h));
}
```

### 4. Wrong Arabic dual form

`2 عروض` is not acceptable product Arabic. For exactly two, use the dual form:
`عرضان`. Arabic has six plural categories, so concatenating a number and one plural noun is
not a complete solution.

```html
<!-- Before -->
<h2>2 عروض</h2>

<!-- After for a static preview -->
<h2>عرضان</h2>
```

For application data, centralize the grammar:

```js
const arabicPluralRules = new Intl.PluralRules("ar");
const arabicInteger = new Intl.NumberFormat("ar-IQ", {
  maximumFractionDigits: 0,
});

export function formatOfferCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError("Offer count must be a non-negative safe integer");
  }

  const n = arabicInteger.format(count);

  switch (arabicPluralRules.select(count)) {
    case "zero":
      return "لا عروض";
    case "one":
      return "عرض واحد";
    case "two":
      return "عرضان";
    case "few":
      return `${n} عروض`;
    case "many":
      return `${n} عرضًا`;
    default:
      return `${n} عرض`;
  }
}
```

Test representative values rather than only `1` and `2`:

```js
const cases = [0, 1, 2, 3, 7, 11, 26, 102];

for (const count of cases) {
  console.log(count, formatOfferCount(count));
}
```

The exact editorial wording may vary by sentence. `Intl.PluralRules` chooses a category; it
does not write Arabic for you. Keep one reviewed phrase table for offers, pharmacies,
minutes, requests, and medicines.

### 5. Contradictory countdown copy

A timer is a claim about a specific server-side deadline. It must not be displayed while the
same panel still says the system is waiting for an event that has not happened. In Dawai,
the 15-minute hold countdown starts only after:

```text
patient_selected → pharmacy_hold_acknowledged
```

Do not assemble the panel from unrelated booleans:

```js
// Before: contradictory states can coexist.
if (request.sent) {
  statusText.textContent = "ننتظر ردود الصيدليات";
}

if (reservation.expiresAt) {
  countdown.hidden = false;
}
```

Render one explicit state:

```js
function getReservationViewModel(request, reservation, nowMs) {
  switch (request.status) {
    case "ACTIVE_RADIUS_2KM":
    case "ACTIVE_RADIUS_5KM":
    case "ACTIVE_RADIUS_10KM":
      return {
        kind: "finding",
        title: "ننتظر ردود الصيدليات",
        showCountdown: false,
      };

    case "HOLD_PENDING":
      return {
        kind: "pending",
        title: "اخترت العرض وننتظر تأكيد الصيدلية",
        showCountdown: false,
      };

    case "HOLD_ACTIVE": {
      const remainingMs =
        Date.parse(reservation.expiresAt) - nowMs;

      return {
        kind: "held",
        title: "أكدت الصيدلية حفظ الكمية",
        showCountdown: remainingMs > 0,
        remainingMs: Math.max(0, remainingMs),
      };
    }

    case "HOLD_EXPIRED":
      return {
        kind: "expired",
        title: "انتهت مهلة الحجز",
        showCountdown: false,
      };

    default:
      return {
        kind: "unknown",
        title: "نحدّث حالة طلبك",
        showCountdown: false,
      };
  }
}
```

Derive countdown time from `expiresAt` and the server clock, not from “900 seconds since this
component mounted.” Recalculate on visibility change so a backgrounded phone does not show a
stale timer.

Do not put the ticking seconds in a continuously assertive live region. Announce meaningful
thresholds, such as five minutes remaining and expiry.

### 6. Dead controls

The second offer CTA looks functional but has no handler:

```html
<!-- Before -->
<button class="primary-cta" type="button">
  حجز للاستلام
</button>
```

If it represents a real selectable offer, wire it through the same selection path and pass
the offer identity:

```html
<!-- After -->
<button
  class="primary-cta"
  type="button"
  data-select-offer="OFF-203"
>
  حجز للاستلام
</button>
```

```js
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-select-offer]");
  if (!button) return;

  const offerId = button.dataset.selectOffer;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");

  try {
    await selectOffer(offerId);
  } catch (error) {
    showActionError(error);
    button.disabled = false;
  } finally {
    button.removeAttribute("aria-busy");
  }
});
```

If the partial offer is intentionally not reservable, say why:

```html
<button
  class="secondary-cta"
  type="button"
  aria-describedby="partial-offer-explanation"
>
  مراجعة الكمية الجزئية
</button>
<p id="partial-offer-explanation">
  المتوفر علبة واحدة من أصل علبتين. راجع التفاصيل قبل الاختيار.
</p>
```

The preview also declares a `tablist` without implementing the tab contract:

```html
<!-- Before: visually tab-like, semantically incomplete -->
<div class="tabs" role="tablist">
  <button class="active" data-screen="welcome">الترحيب</button>
  <button data-screen="patient">المريض</button>
</div>
```

A real tab interface needs `role="tab"`, `aria-selected`, `aria-controls`, roving
`tabindex`, `role="tabpanel"`, and arrow-key behavior:

```html
<div class="tabs" role="tablist" aria-label="شاشات المعاينة">
  <button
    id="tab-welcome"
    role="tab"
    aria-selected="true"
    aria-controls="welcome"
    tabindex="0"
    data-screen="welcome"
  >
    الترحيب
  </button>
  <button
    id="tab-patient"
    role="tab"
    aria-selected="false"
    aria-controls="patient"
    tabindex="-1"
    data-screen="patient"
  >
    المريض
  </button>
</div>

<section
  id="welcome"
  role="tabpanel"
  aria-labelledby="tab-welcome"
>
  ...
</section>

<section
  id="patient"
  role="tabpanel"
  aria-labelledby="tab-patient"
  hidden
>
  ...
</section>
```

```js
const tabs = [...document.querySelectorAll('[role="tab"]')];

function activateTab(nextTab, { focus = true } = {}) {
  for (const tab of tabs) {
    const selected = tab === nextTab;
    const panel = document.getElementById(tab.getAttribute("aria-controls"));

    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
  }

  if (focus) nextTab.focus();
}

for (const tab of tabs) {
  tab.addEventListener("click", () => activateTab(tab, { focus: false }));
  tab.addEventListener("keydown", (event) => {
    const current = tabs.indexOf(tab);
    const previous = event.key === "ArrowRight";
    const next = event.key === "ArrowLeft";

    if (!previous && !next && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();

    if (event.key === "Home") return activateTab(tabs[0]);
    if (event.key === "End") return activateTab(tabs.at(-1));

    const delta = next ? 1 : -1;
    activateTab(tabs[(current + delta + tabs.length) % tabs.length]);
  });
}
```

For a simple preview switcher, ordinary buttons without `role="tablist"` are also valid.
Use tab semantics only when you implement them fully.

## Part II — RTL/Arabic engineering rules (permanent)

These are permanent engineering constraints. Put them in linting, shared utilities,
component APIs, visual tests, and code review. A checklist that depends on memory will decay.

### Rule 1: use logical properties

Write layout in terms of block and inline flow:

```css
.offer-card {
  margin-block-end: var(--space-3);
  padding-block: var(--space-4);
  padding-inline: var(--space-4);
  border-inline-start: 4px solid var(--status-accent);
}

.offer-card__action {
  margin-inline-start: auto;
}

.bottom-nav {
  inset-inline: 0;
  inset-block-end: 0;
}
```

Allow physical properties only when the concept is physically fixed, such as a camera
preview coordinate or a transform matrix. Require a comment for exceptions.

Add a Stylelint rule so the codebase rejects regressions:

```js
// stylelint.config.mjs
export default {
  rules: {
    "property-disallowed-list": [
      [
        "left",
        "right",
        "margin-left",
        "margin-right",
        "padding-left",
        "padding-right",
        "border-left",
        "border-right",
        "border-left-color",
        "border-right-color",
        "border-left-style",
        "border-right-style",
        "border-left-width",
        "border-right-width",
      ],
      {
        message:
          "Use CSS logical properties; document rare physical-coordinate exceptions.",
      },
    ],
  },
};
```

Also search generated component styles in CI. A lint rule that covers only `.css` files but
misses CSS-in-JS is not enough.

### Rule 2: isolate mixed-direction content

Latin medicine names, strengths, request IDs, prices, phone numbers, and countdowns are
directional islands inside Arabic sentences. Isolate the entire semantic unit:

```html
<p>
  الدواء:
  <bdi dir="ltr">Augmentin 625 mg</bdi>
</p>

<p>
  رقم الطلب:
  <bdi dir="ltr">DW-4821</bdi>
</p>

<p>
  السعر:
  <bdi dir="ltr">12,000 د.ع</bdi>
</p>

<time dir="ltr" datetime="PT14M32S">14:32</time>
```

Use `<bdi>` for user- or data-provided text whose direction may vary. Use `dir="ltr"` for a
known LTR unit such as a timer or Latin drug presentation.

Do not scatter isolated spans around one dosage:

```html
<!-- Avoid: punctuation and unit can reorder independently. -->
Augmentin <span>625</span> <span>mg</span>
```

```html
<!-- Prefer: one protected semantic token. -->
<bdi dir="ltr">Augmentin 625 mg tablets</bdi>
```

### Rule 3: format IQD as integer money

Store Iraqi dinars as integers. The product contract explicitly forbids float money.
If a future contract needs fractional dinars, store the smallest supported unit as integer
fils and convert only for display; never store `12.5` in a floating-point money column. The
current Dawai MVP contract uses integer `price_iqd`, because pickup prices are quoted in
whole dinars, while `Intl.NumberFormat("ar-IQ")` owns the visible locale formatting.

```ts
const iqdFormatter = new Intl.NumberFormat("ar-IQ", {
  style: "currency",
  currency: "IQD",
  currencyDisplay: "symbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatIqd(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("IQD value must be a non-negative safe integer");
  }

  return iqdFormatter.format(value);
}
```

```tsx
<bdi dir="ltr">{formatIqd(12_000)}</bdi>
```

Do not parse formatted prices back into numbers. Pass integer `price_iqd` through APIs,
validation, database constraints, analytics, and audit events.

If the Iraqi market uses an editorial form such as `د.ع`, keep it in one formatter and test
the output. Do not hard-code commas or assume Western digits.

### Rule 4: protect dosage digits

Dosage identity is safety-critical. Never allow the bidi algorithm to separate or reorder
the drug name, strength, unit, form, and pack:

```tsx
type PresentationProps = {
  brand: string;
  strength: string;
  form?: string;
  pack?: string;
};

export function MedicinePresentation({
  brand,
  strength,
  form,
  pack,
}: PresentationProps) {
  const value = [brand, strength, form, pack].filter(Boolean).join(" · ");

  return <bdi dir="ltr">{value}</bdi>;
}
```

Test adversarial fixtures:

```ts
const presentations = [
  "Augmentin 625 mg",
  "Vitamin D3 50,000 IU",
  "Co-Diovan 160/12.5 mg",
  "NPH/Regular 70/30",
  "أموكسيسيلين 500 mg",
  "Panadol Extra — 24 tablets",
];
```

Screenshot those fixtures in RTL at narrow widths. Also assert that copied text preserves
the intended order.

### Rule 5: self-host and subset Arabic fonts

The preview depends entirely on Google Fonts. That is fragile on weak Iraqi networks and may
introduce a third-party request before essential text paints.

Self-host WOFF2 assets, subset them to the glyph ranges you actually need, and keep a robust
system fallback:

```css
@font-face {
  font-family: "Dawai Arabic";
  src: url("/fonts/dawai-arabic-core.woff2") format("woff2");
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  unicode-range:
    U+0600-06FF,
    U+0750-077F,
    U+08A0-08FF,
    U+FB50-FDFF,
    U+FE70-FEFF;
}

:root {
  font-family:
    "Dawai Arabic",
    Tahoma,
    Arial,
    sans-serif;
}
```

Do not make the Arabic subset so narrow that Iraqi names, Arabic presentation forms, or
Kurdish expansion render as tofu. Build separate core Arabic, Latin, and optional Sorani
subsets, then test real content.

Preload only the above-the-fold regular face:

```html
<link
  rel="preload"
  href="/fonts/dawai-arabic-core.woff2"
  as="font"
  type="font/woff2"
  crossorigin
>
```

Do not preload every weight. That turns a font optimization into a bandwidth regression.

### Rule 6: make Arabic content a tested interface

Centralize reviewed copy for:

- request states;
- offer and pharmacy counts;
- minute and distance phrases;
- exact, partial, orderable, and alternative-review offer types;
- expiry and retry messages;
- prescription and safety warnings;
- offline and last-known-state messages.

Avoid sentence construction by concatenation:

```js
// Avoid
`${count} عروض` + " من " + `${pharmacyCount} صيدليات`
```

Use a message function with full-sentence variants:

```js
export function describeOfferArrival(offerCount, pharmacyCount) {
  return `${formatOfferCount(offerCount)} من ${formatPharmacyCount(
    pharmacyCount,
  )}`;
}
```

For production scale, use an ICU MessageFormat-compatible localization layer. Keep medical
and legal copy under human review; machine translation is not acceptance testing.

## Part III — Design critique

### Coral is doing two jobs

Coral currently means both “press this primary action” and “time-sensitive or warning.” A
user should not have to infer whether coral is interactive, urgent, or dangerous.

Split the semantics:

```css
:root {
  --action: #c94f39;
  --action-hover: #ad3f2d;
  --action-text: #ffffff;

  --urgency: #a85b17;
  --urgency-surface: #fff3dc;
  --urgency-text: #6f3905;

  --danger: #a52a2a;
  --danger-surface: #fde9e7;
  --danger-text: #751c1c;

  --success: #21695d;
  --success-surface: #e5f4ef;
  --success-text: #12463f;
}
```

Then bind tokens to meaning:

| Meaning | Token | Example |
|---|---|---|
| Primary user action | `--action` | “Send request”, “Reserve for pickup” |
| Time pressure | `--urgency` | “Offer expires in 3 minutes” |
| Destructive or failed | `--danger` | “Cancel hold”, “Pharmacy could not fulfill” |
| Confirmed positive state | `--success` | “Pharmacy acknowledged hold” |

Never rely on color alone. Pair the color with a label, icon with accessible name, or
structural placement.

### The trust surface is too empty

The offer card currently shows pharmacy name, district, distance, price, preparation, and
freshness. That is necessary but not sufficient in an Iraqi medicine marketplace.

Every exact offer should be able to show:

- verified pharmacy badge;
- license number or a safely truncated public identifier;
- verification authority and last verification date;
- branch address and map pin;
- opening state and “open until” time;
- pharmacist confirmation timestamp;
- exact medicine presentation and quantity confirmed;
- offer expiry;
- pickup-only fulfillment mode in the MVP;
- price commitment language;
- prescription-required badge where applicable;
- an accessible path to report “confirmed but unavailable.”

An example hierarchy:

```text
Verified branch
صيدلية الروابي
License: BGD-•••-1842 · verified 12 Jul 2026
المنصور · 0.8 كم · مفتوحة حتى 11:00 م

Augmentin 625 mg · tablets · 1 pack
Confirmed by the pharmacy 4 minutes ago

12,000 IQD
The pickup price confirmed by this pharmacy

[Reserve for pickup]
Offer expires at 10:42
```

Do not show a badge that merely means “this record exists in Dawai.” “Verified” must map to
a documented license pipeline.

### Price is a commitment, not decoration

The price should not look like a catalog estimate. It is part of the pharmacy’s structured,
time-bounded offer.

Use explicit Arabic framing:

> **السعر عند الاستلام كما أكّدته الصيدلية**

Also state what can legitimately change, if anything. If the price depends on presentation,
pack size, or prescription review, do not show a final price before those are fixed.

Recommended offer fields:

```ts
type OfferPrice = {
  amountIqd: number;
  presentationId: string;
  quantity: number;
  confirmedAt: string;
  expiresAt: string;
  commitment: "PICKUP_PRICE_CONFIRMED";
};
```

If the patient reports a mismatch at pickup, store it as a trust outcome. Do not hide price
disputes in a generic support category.

### The antibiotic demo needs a prescription badge

Augmentin is an antibiotic. Using it as the primary demo without an Rx/prescription
indicator normalizes a medically and regulatorily sensitive flow.

The UI should state:

```html
<span class="rx-badge">
  يتطلب وصفة ومراجعة صيدلي
</span>
```

The badge does not decide Iraqi legal requirements by itself. Classification must come from
an approved medicine dataset and legal review. The UI rule is simpler: if a presentation is
classified as prescription-only, every patient and pharmacy surface must preserve that fact.

Do not imply that uploading an image automatically authorizes dispensing. Say that the
pharmacy reviews the prescription and may require the original at pickup.

### Components are duplicated across screens

The preview repeats brand markup, headers, status badges, offer structure, and bottom
navigation. Copy-paste makes future accessibility and RTL fixes inconsistent.

Extract at least:

```tsx
<Brand variant="compact" />

<StatusBadge
  tone="success"
  label="حجز مؤكد"
/>

<OfferCard
  offer={offer}
  onSelect={selectOffer}
  selectionState={selectionState}
/>

<BottomNav
  role="patient"
  current="requests"
/>
```

The extraction boundary should follow behavior, not only matching pixels:

- `Brand` owns the mark’s accessible treatment and text variants.
- `StatusBadge` maps domain status to reviewed label and semantic tone.
- `OfferCard` owns trust evidence, offer type, expiry, price framing, and action policy.
- `BottomNav` owns target size, current-page semantics, safe-area padding, and role-specific
  destinations.

The third paste is a component. The second paste is a warning.

### Accessibility must shape the visual system

Add visible `:focus-visible` treatment:

```css
:where(a, button, input, select, textarea):focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}
```

Use minimum 44 × 44 CSS px targets:

```css
:where(button, [role="button"], .bottom-nav a) {
  min-inline-size: 44px;
  min-block-size: 44px;
}
```

Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Decorative emoji should be `aria-hidden="true"`. Functional icons need text or an accessible
name. Do not use the pharmacy emoji as the only indication that a card belongs to a verified
pharmacy.

## Part IV — Missing states

### Design one lifecycle, not disconnected screens

Use a full request state machine as the source of UI truth:

```text
DRAFT
  ├─ incomplete identity ───────────────→ NEEDS_CLARIFICATION
  ├─ controlled/unsafe ────────────────→ BLOCKED_SAFETY
  └─ validated + consented ────────────→ ACTIVE_RADIUS_2KM

NEEDS_CLARIFICATION
  ├─ clarified ────────────────────────→ ACTIVE_RADIUS_2KM
  ├─ cancelled ────────────────────────→ CANCELLED_BY_PATIENT
  └─ timeout ──────────────────────────→ EXPIRED_NO_RESPONSE

ACTIVE_RADIUS_2KM
  ├─ valid offer ──────────────────────→ OFFERED
  ├─ consent to expand ────────────────→ ACTIVE_RADIUS_5KM
  ├─ cancel ───────────────────────────→ CANCELLED_BY_PATIENT
  └─ request expires ──────────────────→ EXPIRED_NO_RESPONSE

ACTIVE_RADIUS_5KM
  ├─ valid offer ──────────────────────→ OFFERED
  ├─ consent to expand ────────────────→ ACTIVE_RADIUS_10KM
  ├─ retry/edit ───────────────────────→ DRAFT
  └─ request expires ──────────────────→ EXPIRED_NO_RESPONSE

ACTIVE_RADIUS_10KM
  ├─ valid offer ──────────────────────→ OFFERED
  ├─ retry/edit ───────────────────────→ DRAFT
  └─ request expires ──────────────────→ EXPIRED_NO_RESPONSE

OFFERED
  ├─ patient selects exact/eligible offer → HOLD_PENDING
  ├─ all offers expire ────────────────→ EXPIRED_OFFERS
  ├─ new offer ────────────────────────→ OFFERED
  └─ cancel ───────────────────────────→ CANCELLED_BY_PATIENT

HOLD_PENDING
  ├─ pharmacy acknowledges ────────────→ HOLD_ACTIVE
  ├─ pharmacy rejects/cannot fulfill ──→ PHARMACY_COULD_NOT_FULFILL
  ├─ acknowledgement timeout ──────────→ OFFERED or EXPIRED_OFFERS
  └─ patient cancels ──────────────────→ CANCELLED_BY_PATIENT

HOLD_ACTIVE
  ├─ pickup confirmed ─────────────────→ FULFILLED
  ├─ timer expires ────────────────────→ HOLD_EXPIRED
  ├─ pharmacy cannot fulfill ──────────→ PHARMACY_COULD_NOT_FULFILL
  ├─ patient does not arrive ──────────→ PATIENT_NO_SHOW
  └─ patient cancels ──────────────────→ CANCELLED_BY_PATIENT
```

The terminal states are:

- `FULFILLED`;
- `CANCELLED_BY_PATIENT`;
- `EXPIRED_NO_RESPONSE`;
- `EXPIRED_OFFERS`;
- `HOLD_EXPIRED`;
- `PHARMACY_COULD_NOT_FULFILL`;
- `PATIENT_NO_SHOW`;
- `BLOCKED_SAFETY`.

`ALTERNATIVE_REVIEW_REQUIRED` is not a reservable success state. It is a decision state
attached to an offer or request item and must lead to qualified human review.

### UI contract for every state

| State | Patient sees | Pharmacy sees | Primary next action |
|---|---|---|---|
| `DRAFT` | Editable medicine, quantity, area, Rx status | Nothing | Complete and send |
| `NEEDS_CLARIFICATION` | Exact ambiguity and candidate presentations | Nothing | Select or provide clearer input |
| `ACTIVE_RADIUS_2KM` | Real dispatch count, last event, 2 km scope | Matched request in inbox | Wait or cancel |
| `ACTIVE_RADIUS_5KM` | Explicitly expanded scope and new branches | Newly eligible request | Wait or cancel |
| `ACTIVE_RADIUS_10KM` | Final broad scope and honest expectations | Newly eligible request | Wait, edit, or end |
| `OFFERED` | Comparable active offers plus continued-search status | Sent offer and its expiry | Compare and select |
| `HOLD_PENDING` | Selected offer; waiting for pharmacy acknowledgement; no hold timer | Acknowledge exact quantity | Pharmacy acknowledges or rejects |
| `HOLD_ACTIVE` | Reference, exact branch, directions, phone, expiry | Active hold and patient contact allowed by policy | Pickup |
| `FULFILLED` | Success and optional factual outcome feedback | Completed reservation | Close |
| `EXPIRED_NO_RESPONSE` | No pharmacy replied; options preserved | Request closed | Retry/edit/end |
| `EXPIRED_OFFERS` | Offers are no longer valid | Offers expired | Re-request confirmation |
| `HOLD_EXPIRED` | Reservation released | Stock no longer held | Ask again |
| `PHARMACY_COULD_NOT_FULFILL` | Apology, reason category, safe recovery | Failure reason and audit | Return to valid offers or retry |
| `PATIENT_NO_SHOW` | Hold ended | No-show recorded privately | Start a new request if needed |
| `BLOCKED_SAFETY` | Neutral safety explanation and appropriate direction | No unsafe broadcast | End or lawful review route |

Do not show “error” for an expected no-offer outcome. Show what the system did, what it knows,
and what the patient can do next.

### Zero-offers escalation ladder

Zero offers is not one empty screen. It is a timed, consent-driven ladder:

1. **Wait in 0–2 km.**  
   Show how many suitable open pharmacies received the request and the last real event.

2. **Ask to expand from 2 km to 5 km.**  
   Explain the consequence: farther pickup, more pharmacies, no change to prescription
   privacy. Do not expand silently.

3. **Ask to expand from 5 km to 10 km.**  
   Reserve this for rare products or explicit patient choice. State approximate travel
   implications.

4. **Offer a retry with correction.**  
   Let the patient change spelling, presentation, quantity, timing, or area without
   re-uploading everything.

5. **End honestly.**  
   Say that no pharmacy confirmed availability during this request window. Preserve a
   reference and offer a new request later.

Example 2 km empty state:

```text
No pharmacy has confirmed the medicine yet

We sent your request to 6 open, verified pharmacies within 2 km.
The last response was checked at 10:24.

[Expand the search to 5 km]
[Edit the medicine details]
[End this request]
```

Do not say “not available in Baghdad.” The evidence only supports “no selected pharmacy
confirmed it during this window.”

NN/g’s empty-state guidance is directly relevant: communicate system status, teach the user
what the state means, and provide a direct path to the next task
([NN/g: Designing Empty States](https://www.nngroup.com/articles/empty-state-interface-design/)).

### The pharmacy offer-composition form is half the marketplace

The current pharmacy inbox ends at “available — send an offer.” That button must open a
structured form. Otherwise the patient’s offer card has no accountable source.

Minimum fields:

| Field | Type | Validation |
|---|---|---|
| Offer type | Exact / partial / orderable / alternative review | Required |
| Brand / presentation | Canonical reference plus display value | Must be explicit |
| Strength | Structured value and unit | Must match exact offer |
| Dosage form | Controlled vocabulary | Required |
| Pack and quantity | Integer or approved quantity band | Greater than zero |
| Price | Integer IQD | Non-negative safe integer |
| Ready time | Now or minute estimate | Bounded |
| Fulfillment | Pickup for MVP | No hidden delivery |
| Offer validity | Server expiry | Within policy |
| Prescription review | Required / reviewed / original at pickup | From classification |
| Note | Short operational note | No medical advice |

Example form contract:

```ts
type PharmacyOfferDraft =
  | {
      type: "EXACT";
      presentationId: string;
      quantity: number;
      priceIqd: number;
      preparationMinutes: number;
      prescriptionReview: "NOT_REQUIRED" | "REVIEW_AT_PICKUP";
    }
  | {
      type: "PARTIAL";
      presentationId: string;
      requestedQuantity: number;
      availableQuantity: number;
      priceIqd: number;
      preparationMinutes: number;
    }
  | {
      type: "ORDERABLE";
      presentationId: string;
      availableAt: string;
      estimatedPriceIqd?: number;
    }
  | {
      type: "ALTERNATIVE_REVIEW_REQUIRED";
      proposedPresentationId: string;
      note: string;
    };
```

The form should take less than 15 seconds for the common exact case. Prefill the requested
presentation, provide large response-type controls, and reveal only relevant fields. Speed
must not erase correctness.

### Substitute-drug decisions must never be automatic

Never transform a generic match, spelling similarity, same active ingredient, or pharmacy
suggestion into a reservable exact offer.

Use:

```text
ALTERNATIVE_REVIEW_REQUIRED
```

Required UI behavior:

- label the item “alternative proposed for review,” not “recommended alternative”;
- show the requested and proposed presentations side by side;
- do not enable the normal reserve button;
- identify who must review it under applicable policy;
- log the patient’s decision without implying clinical consent;
- return to exact offers if review cannot be completed safely.

An algorithm may retrieve candidates. It may not make the substitution decision.

### No-stock reasons are training data

“Not available” is useful to the patient but insufficient for operations and matching.
Capture a quick reason:

```ts
type NoStockReason =
  | "NOT_CARRIED"
  | "SOLD_OUT_TODAY"
  | "PRESENTATION_MISMATCH"
  | "SUPPLIER_SHORTAGE"
  | "PRESCRIPTION_CANNOT_BE_REVIEWED"
  | "BRANCH_CLOSING"
  | "REQUEST_UNCLEAR"
  | "OTHER";
```

Use those reasons to:

- stop repeatedly notifying branches that never carry a presentation;
- detect a spelling or presentation mismatch;
- distinguish local stockout from supplier shortage;
- improve radius and branch ranking;
- build anonymized unmet-demand signals;
- identify where the catalog or classifier is weak.

Do not use honest declines to punish pharmacies. If pharmacies fear a ranking penalty, they
will ignore requests or falsely confirm them.

## Part V — Competitive research

Competitive research should change a decision, not decorate a roadmap. Dawai should borrow
proven structures while preserving a sharper operating promise.

### What to learn

**Chefaa — build a chronic refill loop after the core transaction works.**  
Chefaa explicitly positions prescription upload, reminders, recurring medicine access, and
ongoing-treatment support as part of its service
([Chefaa About](https://chefaa.com/eg-en/about-us)). Reporting on the company connects its
origin to medicine shortages, describes recurring delivery and refill behavior, and notes
that pharmacy-confirmed alternatives are part of its operation
([TechCabal, 30 June 2025](https://techcabal.com/2025/06/30/chefaa-e-pharmacy/)).

For Dawai, the lesson is not “add delivery now.” The lesson is to remember successful
presentations, ask consent for a future reminder, and make the next request easier after the
availability-to-hold loop is reliable.

**Vezeeta — make licensed human trust visible.**  
Vezeeta’s ePharmacy story combines prescription upload, payment and delivery options,
teleconsultation, and 24/7 access to licensed pharmacists
([WAYA](https://waya.media/vezeeta-epharmacy/)). Dawai should not copy that broad service
portfolio in the MVP. It should copy the clarity that a licensed professional and a
verified operation stand behind the transaction.

**Tata 1mg — provide medicine information, but refuse algorithmic substitutes.**  
Tata 1mg emphasizes medicine information, uses, side effects, safety warnings, expert
advice, prescription/list upload, and “genuine medicines”
([App Store listing](https://apps.apple.com/us/app/tata-1mg-healthcare-app/id554578419)).
Dawai can learn from the separation between product information and transaction actions.
However, Dawai’s safety policy must remain stricter than a content or retail recommendation
surface: information can support recognition, but no algorithm should approve a substitute.

**GoodRx — use structured medicine pickers and spelling recovery.**  
GoodRx demonstrates the value of starting from a structured drug identity and location
before comparing pharmacy options
([GoodRx](https://www.goodrx.com/)). Dawai should use tolerant spelling search, aliases, and
explicit strength/form/pack pickers. It must add what a discount or catalog comparison does
not guarantee: a recent pharmacy-confirmed offer and a hold.

**MetaPharma — treat unmet demand as operational data.**  
MetaPharma’s Iraqi supplier-facing service states that pharmacies spend significant time on
supplier ordering and reports daily missing-item pressure, positioning aggregated requests
as a way to connect pharmacy demand with suppliers
([MetaPharma](https://www.metapharma.net/supplies_service/index?locale=en)). Dawai’s
patient-request and no-stock events can become privacy-preserving shortage intelligence.
That should improve matching and operations before it becomes a commercial analytics
product.

### Positioning table

| Product | Primary promise | Availability basis | Trust mechanism | Lesson for Dawai |
|---|---|---|---|---|
| Chefaa | Ongoing medicine access and pharmacy fulfillment | Partner fulfillment and pharmacy operation | Pharmacist support, prescription handling, repeat-care loop | Add refill continuity only after the core request loop is reliable |
| Vezeeta ePharmacy | Integrated healthcare and pharmacy fulfillment | In-house/partner operational fulfillment | Licensed pharmacists, wider healthcare brand | Make professional and branch verification explicit |
| Tata 1mg | Broad digital pharmacy, information, tests, and consultation | Catalog plus fulfillment network | Medicine information, accreditations, genuine-medicine claim | Help users identify the product; never let content become automatic substitution |
| GoodRx | Compare prices and discount options | Structured drug and pharmacy pricing data | Recognizable comparison workflow | Borrow structured pickers and spelling recovery, then add actual confirmation |
| MetaPharma | Connect Iraqi pharmacy demand to suppliers | Pharmacy purchase requests and supplier supply | B2B account and supplier network | No-stock reasons can improve matching and expose unmet demand |
| Dawai | Find a nearby, executable medicine offer | **Pharmacy-confirmed offer followed by acknowledged hold** | License verification, timestamp, exact presentation, price commitment, hold | **Availability true by construction** |

Dawai’s differentiator is:

> **availability true by construction**

That means the UI may call something “available for pickup” only when a pharmacy has made a
recent structured offer and acknowledged the hold. A catalog association is useful for
matching; it is not availability. A historical signal is useful for ranking; it is not a
promise. A patient selection is useful intent; it is not a hold until the pharmacy
acknowledges it.

### Why the Iraqi trust context matters

Reporting on Iraq describes persistent shortages, price volatility, weak oversight, and
counterfeit or illegally imported medicines
([Shafaq News](https://shafaq.com/en/Report/Iraq-s-Pharmaceutical-Crisis-shortages-counterfeit-drugs-and-ineffective-reforms)).
Treat individual estimates in reporting cautiously, but the product implication is clear:
branch verification, medicine identity, price evidence, and fulfillment outcomes cannot be
hidden behind a generic “available” label.

Dawai must not claim that its UI solves counterfeit medicine risk. It can reduce risk through
verified pharmacy participation, traceable offers, approved medicine references, reporting,
and eventual official integrations. Those controls need operational ownership.

### Research sources

- [Chefaa — About us](https://chefaa.com/eg-en/about-us)
- [TechCabal — How a cancer diagnosis birthed Egypt’s Chefaa](https://techcabal.com/2025/06/30/chefaa-e-pharmacy/)
- [WAYA — The Journey to Vezeeta’s ePharmacy](https://waya.media/vezeeta-epharmacy/)
- [Tata 1mg — App Store listing](https://apps.apple.com/us/app/tata-1mg-healthcare-app/id554578419)
- [GoodRx](https://www.goodrx.com/)
- [Shafaq News — Iraq’s Pharmaceutical Crisis](https://shafaq.com/en/Report/Iraq-s-Pharmaceutical-Crisis-shortages-counterfeit-drugs-and-ineffective-reforms)
- [MetaPharma — supplies service](https://www.metapharma.net/supplies_service/index?locale=en)
- [NN/g — Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/)

## Part VI — Architecture roadmap

Build in this order:

```text
tokens
  ↓
shared components
  ↓
explicit state machine in UI
  ↓
SSE/polling truth
  ↓
PWA offline honesty
```

### 1. Tokens

Create one semantic source for color, spacing, typography, radius, elevation, motion, target
size, and layer order.

```css
:root {
  --color-bg: #fbfaf6;
  --color-surface: #ffffff;
  --color-text: #17201f;
  --color-text-muted: #5d6967;
  --color-border: #d8dcd8;
  --action: #c94f39;
  --urgency: #a85b17;
  --success: #21695d;
  --danger: #a52a2a;
  --focus: #1f6feb;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 0.5rem;
  --radius-md: 0.875rem;
  --radius-lg: 1.25rem;

  --target-min: 44px;
  --layer-header: 20;
  --layer-nav: 30;
  --layer-dialog: 50;
}
```

No component should invent a new green because the existing one “looks close.”

### 2. Shared components

Prioritize components that encode product rules:

1. `MedicinePresentation`
2. `Money`
3. `StatusBadge`
4. `PharmacyTrustBlock`
5. `OfferCard`
6. `RequestTimeline`
7. `EmptyState`
8. `AsyncAction`
9. `BottomNav`
10. `Brand`

Keep domain decisions out of generic styling props:

```tsx
// Avoid
<Badge color="orange">...</Badge>

// Prefer
<StatusBadge status={request.status} />
```

The second form gives one reviewed mapping for Arabic copy, color, icon, and assistive text.

### 3. Explicit state machine in UI

Do not spread state logic across `isLoading`, `hasOffers`, `selected`, `expired`, and
`reservation` booleans. Impossible combinations will appear.

Use a discriminated union:

```ts
type RequestViewState =
  | { type: "DRAFT"; draft: RequestDraft }
  | { type: "NEEDS_CLARIFICATION"; candidates: Presentation[] }
  | { type: "ACTIVE"; radiusKm: 2 | 5 | 10; lastEventAt: string }
  | { type: "OFFERED"; offers: Offer[]; searchStillActive: boolean }
  | { type: "HOLD_PENDING"; selectedOffer: Offer }
  | { type: "HOLD_ACTIVE"; reservation: Reservation }
  | { type: "FULFILLED"; outcome: FulfillmentOutcome }
  | { type: "TERMINAL"; reason: TerminalReason };
```

Then render exhaustively:

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled request state: ${JSON.stringify(value)}`);
}
```

Every backend state needs an owned frontend projection and a test fixture.

### 4. SSE/polling truth

SSE is useful for request events and offer arrivals, but it is not truth by itself. The
database/API state is authoritative.

Recommended behavior:

1. Fetch a request snapshot.
2. Open an SSE stream from the snapshot’s event cursor.
3. Apply idempotent events by event ID/version.
4. Re-fetch after reconnect, gap detection, visibility return, or version mismatch.
5. Fall back to bounded polling if SSE is unavailable.
6. Stop real-time work in terminal states.

```ts
type RequestEvent = {
  id: string;
  requestId: string;
  version: number;
  type: string;
  occurredAt: string;
};
```

Do not animate fake progress while no events arrive. Say:

```text
Last update received at 10:24
Connection interrupted; we are showing the last confirmed state
```

Polling should use backoff and visibility awareness:

```ts
const intervals = [3_000, 5_000, 10_000, 15_000];
```

Reset to a short interval after a user action or visibility return. Add jitter to avoid a
thundering herd.

### 5. PWA offline honesty

Cache the shell, icons, and safe static reference data. Do not cache prescription images,
authenticated API bodies, exact locations, phone numbers, or active reservation responses
in a general service-worker cache.

When offline:

- show the last confirmed state and timestamp;
- disable actions that require server confirmation;
- never start a local hold countdown without a server expiry;
- keep unsent drafts locally only if policy allows and they contain no sensitive image;
- label queued actions as “not sent”;
- retry only idempotent mutations with an idempotency key;
- require a fresh server snapshot before claiming success.

The correct offline message is:

```text
You are offline. This is the last state confirmed at 10:24.
No reservation or cancellation will be confirmed until the connection returns.
```

The wrong message is “Still searching…” when the device cannot reach Dawai.

## Part VII — Performance budget

The target environment is a mid-range Android phone on throttled 3G, not a developer laptop
on fiber. Define budgets before adding libraries.

### Experience targets

| Metric | Budget | Measurement |
|---|---:|---|
| LCP | ≤ 2.5 s at p75; ≤ 3.0 s in repeatable throttled lab run | Patient home and offer list |
| INP | ≤ 200 ms at p75 | Search, sort, offer selection, pharmacy quick reply |
| CLS | ≤ 0.10 | Font swap, status updates, offer arrival |
| TTFB | ≤ 800 ms on pilot production | Cached and uncached HTML/API separately |
| First useful shell | ≤ 3 s on throttled 3G | Brand, request state, primary action |
| Offline shell return | ≤ 1 s after first successful visit | No sensitive data included |

### Transfer budgets

| Asset | Initial-route budget, compressed | Rule |
|---|---:|---|
| JavaScript | ≤ 90 KB gzip for public/patient shell | Route-split pharmacy and admin |
| CSS | ≤ 35 KB gzip | Purge dead preview styles; prefer shared primitives |
| Fonts | ≤ 100 KB WOFF2 initially | One Arabic core variable face or minimum weights |
| Icons | ≤ 15 KB | SVG sprite/components; no emoji dependency |
| Initial HTML + critical JSON | ≤ 35 KB gzip | No embedded prescription or giant catalog |
| Total first-load transfer | ≤ 300 KB compressed | Excluding a user-initiated upload |

These are budgets, not universal laws. If one must be exceeded, record the decision and
offset the cost elsewhere.

### Implementation rules

- Ship no client library without measuring its compressed and executed cost.
- Route-split patient, pharmacy, and admin surfaces.
- Do not download the medicine catalog on startup; query or incrementally cache it.
- Reserve image dimensions to prevent layout shift.
- Use skeletons only when they preserve the final geometry and do not misstate empty data.
- Keep offer-card DOM shallow; a live list may receive multiple updates.
- Virtualize only after measuring. For the MVP, a small bounded offer list does not need it.
- Prefer CSS for decorative radar rings.
- Use `content-visibility` carefully on long noninteractive histories, not active offers.
- Debounce text lookup, but do not delay normal button feedback.

### Avoid layout thrash

Do not alternate DOM reads and writes in a loop:

```js
// Avoid
for (const card of cards) {
  const height = card.offsetHeight;
  card.style.minHeight = `${height + 8}px`;
}
```

Batch reads, then writes:

```js
const heights = cards.map((card) => card.getBoundingClientRect().height);

requestAnimationFrame(() => {
  cards.forEach((card, index) => {
    card.style.setProperty("--measured-h", `${heights[index]}px`);
  });
});
```

Prefer CSS layout so no measurement is needed.

### Font performance

- Self-host WOFF2.
- Subset Arabic and Latin while preserving Iraqi and Sorani needs.
- Use `font-display: swap`.
- Preload only the critical regular face.
- Avoid separate downloads for 400, 500, 600, 700, and 800 if one carefully subset variable
  font is smaller.
- Test fallback metrics; use metric overrides if the swap causes CLS.
- Render meaningful text immediately even if the brand face is late.

### Performance verification

Run:

- Lighthouse or WebPageTest with a documented mobile/throttled profile;
- real-user Web Vitals segmented by route, device class, and network type;
- bundle analysis in CI;
- a font-size budget check;
- Playwright traces for offer selection and pharmacy reply;
- an API latency distribution for request snapshot, offer create, select, and hold ACK.

Do not celebrate a fast static preview while the real application hydrates a large bundle or
polls every page continuously.

## Part VIII — Security & regulatory

This section defines product controls, not Iraqi legal advice. Federal Iraqi and, where
relevant, Kurdistan Region legal review must approve prescription, retention, dispensing,
and pharmacy-verification policies before launch.

### Prescription image retention and TTL

Prescription images are sensitive health data. “We may need it later” is not a retention
policy.

Define:

- the exact purpose of upload;
- who can access it before and after offer selection;
- the event that grants access;
- the event that revokes access;
- the maximum TTL;
- deletion behavior for originals, derivatives, backups, and logs;
- what non-content audit metadata remains;
- how a patient requests deletion where applicable.

A defensible default design is:

```text
Upload encrypted
  → no pharmacy access during broadcast
  → temporary selected-pharmacy access only after acknowledged hold
  → revoke at terminal state
  → delete content after the shortest approved operational TTL
  → retain minimal non-content audit evidence under a separate policy
```

Do not copy a sample duration into production without legal and operational approval. Encode
the approved TTL as policy/configuration, test cleanup, and alert on overdue deletion.

### Notifications must reveal no phone or medicine

Lock-screen and provider payloads should be generic:

```json
{
  "eventType": "OFFER_RECEIVED",
  "resourceId": "opaque-id"
}
```

Do not include:

- patient name;
- phone number;
- medicine name;
- prescription status;
- diagnosis;
- exact location;
- pharmacy contact details;
- free-text medical notes.

Fetch sensitive content only after authentication and authorization. Configure notification
analytics so third parties do not receive medicine-linked event labels.

### Phone reveal creates disintermediation risk

After a hold is acknowledged, Dawai may reveal the phone number needed for pickup
coordination. That is operationally useful but allows the patient and pharmacy to leave the
platform.

Do not try to solve this by hiding safety-critical contact. Instead:

- delay reveal until one offer is selected and acknowledged;
- expose only the minimum contact data;
- retain a reservation reference and expiry;
- make in-product completion easier than an off-platform workaround;
- ask both parties for the factual outcome;
- monitor repeat off-platform patterns without intrusive surveillance;
- define how fees, if introduced later, avoid incentivizing circumvention.

The value must come from matching, trusted confirmation, and hold coordination, not from
holding a phone number hostage.

### Pharmacy license verification pipeline

A verification badge needs a pipeline:

```text
Application
  → identity and branch evidence collected
  → license checked against authoritative source/manual process
  → reviewer and evidence recorded
  → branch approved with jurisdiction and expiry
  → periodic reverification
  → suspension on expiry, mismatch, complaint, or authority notice
  → auditable reinstatement or rejection
```

Model at least:

```ts
type PharmacyVerification = {
  branchId: string;
  jurisdiction: "IRAQ_FEDERAL" | "KRG";
  licenseIdentifier: string;
  status: "PENDING" | "VERIFIED" | "EXPIRED" | "SUSPENDED" | "REJECTED";
  verifiedAt?: string;
  expiresAt?: string;
  verifiedBy?: string;
  evidenceRef?: string;
  reason?: string;
};
```

Do not allow an expired or suspended branch to receive new requests. Show patients a
public-safe identifier, not the uploaded license document.

### No medical-advice copy

Dawai organizes availability. It does not diagnose, prescribe, choose a dose, or recommend a
substitute.

Avoid:

```text
This alternative is suitable for you.
You should take two tablets.
This medicine will treat your symptoms.
```

Use:

```text
The pharmacy proposed a different presentation for professional review.
Dawai does not determine whether a substitute is appropriate.
The pharmacist may require the original prescription at pickup.
```

Keep emergency redirection separate from medical advice. If a request indicates an
emergency, do not leave the patient in a long availability animation; show the approved
urgent-care direction.

### Additional controls

- Enforce authorization server-side; hiding a button is not access control.
- Use opaque IDs in external links and notifications.
- Require idempotency keys for request creation, offer selection, and reservation actions.
- Audit prescription access, license decisions, hold failures, and fulfillment disputes.
- Strip image metadata and re-encode uploads.
- Reject oversized, malformed, or unsupported files before storage.
- Encrypt sensitive objects and keep keys outside the database.
- Avoid third-party analytics on prescription and reservation routes.
- Apply rate limits without blocking legitimate weak-network retries.
- Redact medicine and identity data from logs, traces, crash reports, and support exports.
- Threat-model pharmacy account takeover and patient-to-patient IDOR.

## Part IX — Advice to the programmer

### 1. Look at what you build

Open the preview and the real application on a phone. Use a low-end or mid-range Android
device when possible.

Check:

- 320 px and 360 px widths;
- 200% text zoom;
- Arabic plus long Latin medicine names;
- slow 3G and intermittent offline;
- software keyboard open;
- safe-area and browser bottom bar;
- dark outdoor lighting;
- one-handed reach;
- screen reader and keyboard navigation.

Do not use screenshots as the only review. Press every control. Let the timer expire. Turn
the network off while selecting an offer.

### 2. Let machines remember rules

Put durable rules in:

- Stylelint for logical properties;
- ESLint for unsafe patterns;
- TypeScript discriminated unions for state;
- schema validation for integer IQD;
- unit tests for Arabic plurals;
- accessibility checks for semantic regressions;
- visual fixtures for bidi and long content;
- CI budgets for JavaScript, CSS, and fonts.

Memory is not a quality system.

### 3. Design states before screens

Before drawing a new page, write:

1. entry state;
2. source event;
3. displayed evidence;
4. allowed actions;
5. error and timeout;
6. next states;
7. accessibility announcement;
8. analytics outcome;
9. sensitive data visible;
10. offline behavior.

If you cannot answer those, the screen is not specified.

### 4. The third paste is a component

When you paste a pattern for the third time, stop and extract it. The component must own the
repeated behavior and semantics, not just a class name.

Good extraction candidates:

- medicine presentation;
- offer facts;
- trust badge;
- async submit;
- empty state;
- countdown;
- role-specific navigation;
- status label.

Do not build a universal `Card` with 30 Boolean props. Extract domain components with clear
contracts.

### 5. Write decisions down

Use ADR-lite documents for decisions that will otherwise be reopened:

```md
Title: ADR-007 — Hold countdown starts after pharmacy acknowledgement

Status: Accepted
Date: 2026-07-31

Context:
Patient selection does not prove the pharmacy physically held stock.

Decision:
Start the 15-minute countdown only after a server-recorded pharmacy ACK.

Consequences:
The UI needs HOLD_PENDING and HOLD_ACTIVE states.
Offline clients cannot invent an active hold.
```

Keep each ADR short. Record why, not a diary of implementation.

### 6. Steal flows structurally, not skins

Study how mature products:

- disambiguate medicine identity;
- collect prescriptions;
- compare offers;
- recover spelling;
- explain empty states;
- expose trust;
- handle expiry;
- support chronic repetition.

Do not copy their colors, card shapes, illustrations, or claims. Their operating model may be
a retailer, insurer, coupon platform, or delivery pharmacy. Dawai’s operating model is a
confirmed request and hold network.

### Short reading list

- [NN/g — Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/)
- [Inclusive Components](https://inclusive-components.design/) — practical semantic
  component patterns
- [RTL Styling 101](https://rtlstyling.com/posts/rtl-styling/) — direction-aware CSS and
  bidirectional layout
- [W3C — Structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir)
- [Web Almanac — Performance](https://almanac.httparchive.org/en/2024/performance) — field
  performance patterns and costs
- [web.dev — Core Web Vitals](https://web.dev/articles/vitals) — measurement definitions

## Part X — 30/60/90 plan + Definition of Done

### First 30 days: repair the foundation

**Goal:** remove accessibility and RTL debt, define reusable visual semantics, and complete
the offer contract on both sides.

Deliver:

- logical-property migration and Stylelint enforcement;
- correct radar centering and measured preview-bar offset;
- real tab semantics or removal of false tab roles;
- keyboard focus, target size, reduced motion, and accessible status regions;
- centralized Arabic plural, date, distance, and IQD formatters;
- bidi-safe `MedicinePresentation`, `Money`, `RequestReference`, and `Countdown`;
- semantic tokens including separate `--action` and `--urgency`;
- extracted `Brand`, `StatusBadge`, `OfferCard`, and `BottomNav`;
- pharmacy trust block with license status, hours, map pin, and confirmation evidence;
- Rx badge and approved prescription copy for the Augmentin demo;
- zero-offers state at 2 km with consent-driven 5 km expansion;
- complete pharmacy offer-composition form;
- no-stock reason capture;
- accessibility baseline with automated and manual results.

Exit evidence:

- no disallowed physical inline CSS in application styles;
- all preview controls either work or are explicitly noninteractive;
- 0, 1, 2, 3, 11, and 102 offer-count fixtures pass;
- keyboard-only completion of patient comparison and pharmacy offer creation;
- screen-reader labels reviewed in Arabic;
- exact, partial, orderable, and alternative-review offers render correctly.

### By 60 days: connect UI state to server truth

**Goal:** make the lifecycle reliable under real timing and weak connectivity.

Deliver:

- explicit request/offer/reservation state projections in the frontend;
- exhaustive state rendering with impossible-state prevention;
- `HOLD_PENDING` and `HOLD_ACTIVE` separated in copy and behavior;
- SSE event stream or equivalent real-time channel with versioned events;
- bounded, visibility-aware polling fallback;
- reconnect snapshot and gap recovery;
- trustworthy “last updated” timestamps;
- PWA offline shell that caches no sensitive API or prescription data;
- disabled/queued mutation policy with idempotency keys;
- structured medicine picker with aliases and spelling recovery;
- alternative-review comparison that cannot auto-reserve;
- tests for hold rejection, offer expiry, radius expansion, and offline selection;
- trust outcomes for price mismatch and confirmed-not-found.

Exit evidence:

- a network interruption cannot create a false active hold;
- a backgrounded phone returns to the correct server-derived countdown;
- duplicate events do not duplicate offers or transitions;
- a stream gap causes snapshot recovery;
- a terminal request stops polling;
- the no-offer ladder works through 2 → 5 → 10 km with explicit consent.

### By 90 days: improve continuity and operational quality

**Goal:** prove repeat value without weakening the MVP promise.

Deliver:

- consent-based refill-loop experiment for successfully fulfilled chronic medicines;
- easy repeat request with presentation review, not blind reorder;
- operations trust dashboard;
- pharmacy verification expiry and reverification workflow;
- no-stock and unmet-demand analysis;
- performance pass against the defined mobile/3G budgets;
- real-user Web Vitals;
- pharmacy response-time and truthful-decline analysis;
- offer-to-hold and hold-to-pickup funnel review;
- prescription TTL cleanup audit;
- pilot copy review with Iraqi Arabic speakers and pharmacists.

Trust metrics:

| Metric | Why it matters |
|---|---|
| Confirmed-not-found rate | Detects false availability |
| Price mismatch at pickup | Tests price commitment |
| Hold acknowledgement latency | Measures pharmacy operational readiness |
| Hold-to-pickup success | Measures executable value |
| Honest decline rate | Indicates whether pharmacies can say no safely |
| License reverification coverage | Protects verified status |
| Prescription access outside active hold | Must remain zero |
| Expired sensitive objects past TTL | Must remain zero |

Do not launch the refill experiment as automatic recurring fulfillment. Ask consent, preserve
medicine identity, and run a new availability confirmation.

### Per-screen Definition of Done

Every patient, pharmacy, and operations screen must pass this checklist before it is done.

#### Product state

- [ ] The screen has one named domain state or an explicit combination allowed by the state
  model.
- [ ] Entry events and exit transitions are documented.
- [ ] The primary action maps to a real API/domain transition.
- [ ] Every visible status comes from server truth or is labeled as local/unconfirmed.
- [ ] Loading, empty, error, stale, offline, and terminal behavior are designed.
- [ ] Retry behavior is idempotent.
- [ ] The screen does not imply that search, offer, selection, and hold are equivalent.

#### Accessibility

- [ ] Semantic heading order is valid.
- [ ] Landmarks and navigation have useful accessible names.
- [ ] Every control has a programmatic name, role, state, and keyboard behavior.
- [ ] Focus order follows visual and task order.
- [ ] Focus remains visible and is restored after dialogs or route changes.
- [ ] Touch targets are at least 44 × 44 CSS px.
- [ ] Text and meaningful UI components meet WCAG AA contrast.
- [ ] Status updates use a restrained `aria-live` strategy.
- [ ] Countdown seconds are not announced continuously.
- [ ] Error summaries link to invalid fields.
- [ ] Color, motion, and emoji are not the only meaning channels.
- [ ] Reduced motion is respected.
- [ ] The screen works at 200% text zoom without losing content or actions.

#### RTL and Arabic

- [ ] CSS uses logical properties.
- [ ] The layout is reviewed in RTL, not merely mirrored.
- [ ] Latin medicine names, strengths, IDs, prices, phone numbers, and timers are isolated
  with `<bdi>` or `dir="ltr"`.
- [ ] Dosage digits and units cannot reorder.
- [ ] Arabic pluralization covers zero, one, two, few, many, and other.
- [ ] Dates, times, distance, and IQD use centralized `Intl` formatters.
- [ ] Arabic copy was read as a full sentence, not assembled from fragments.
- [ ] Long Iraqi branch and district names wrap safely.
- [ ] Mixed Arabic/Latin fixtures have screenshot coverage.

#### Empty, error, and loading states

- [ ] Loading is visually distinct from a true empty result.
- [ ] Empty state says what the system checked.
- [ ] Empty state gives a direct, safe next action.
- [ ] Error state preserves valid user input.
- [ ] Weak-network failure shows the last confirmed timestamp.
- [ ] Retry does not duplicate the request, offer, selection, or hold.
- [ ] Terminal state explains whether the patient can retry, edit, or end.
- [ ] No state makes a city-wide availability claim from a limited dispatch.

#### Trust and safety

- [ ] Pharmacy verification status has a real source.
- [ ] License identifier, branch, hours, and map location are available where relevant.
- [ ] Offer shows exact presentation, quantity, confirmation time, and expiry.
- [ ] Price is framed as the pharmacy-confirmed pickup commitment.
- [ ] Rx medicine shows prescription-review requirements.
- [ ] No alternative can be auto-reserved.
- [ ] No medical advice or dosage recommendation is generated.
- [ ] Sensitive data exposure is minimized for the current state.
- [ ] Lock-screen notification payload remains generic.
- [ ] Reporting paths exist for confirmed-not-found and price mismatch.

#### Interaction quality

- [ ] The primary CTA is unique and state-appropriate.
- [ ] Destructive actions require clear wording and recovery where possible.
- [ ] Disabled controls explain why when the reason is not obvious.
- [ ] Async actions show pending state and prevent accidental duplicates.
- [ ] Success is confirmed by server response, not button animation.
- [ ] Timers derive from server timestamps.
- [ ] Sort and filter controls have labels and preserve selection.
- [ ] Navigation identifies the current page.
- [ ] Browser back behavior does not repeat a mutation.

#### Performance

- [ ] Route stays within JavaScript, CSS, font, and total-transfer budgets.
- [ ] LCP element is identified and measured.
- [ ] Images and dynamic blocks reserve space.
- [ ] No avoidable layout read/write loop exists.
- [ ] Polling stops or slows when hidden and stops at terminal state.
- [ ] Arabic font fallback remains readable before the webfont arrives.
- [ ] The screen is tested on throttled 3G and a mid-range Android profile.
- [ ] Sensitive API data is not placed in a service-worker cache.

#### Observability and operations

- [ ] State-transition failures have structured, redacted logs.
- [ ] User-visible error has a trace/reference that support can use.
- [ ] Product outcome events distinguish no response, no stock, expiry, rejection, no-show,
  and fulfillment.
- [ ] Metrics do not include raw medicine, prescription, phone, or exact location unless an
  approved purpose requires it.
- [ ] The screen can be reconstructed from auditable events for a dispute.
- [ ] Analytics naming does not leak health data to third parties.

### Screen-specific release matrix

| Screen | Must prove before release |
|---|---|
| Patient home | Search and request are visibly different; medicine input is bidi-safe; no dead quick action |
| Request composer | Identity, quantity, coarse location, consent, Rx status, validation, and draft recovery work |
| Clarification | No candidate is auto-selected; differences in strength/form/pack are visible |
| Finding status | Real radius, dispatch count, event time, cancel, offline state, and no fake progress |
| Zero offers | 2 → 5 → 10 km consent ladder, edit, retry, and honest end state |
| Offer comparison | Trust evidence, price commitment, exact/partial distinction, expiry, and accessible sort |
| Hold pending | No countdown; selected offer visible; pharmacy acknowledgement status clear |
| Hold active | Server-derived countdown, reference, branch, directions, contact, Rx reminder, cancel/expiry |
| Fulfillment outcome | Pickup, not found, price mismatch, no-show, and neutral feedback paths |
| Pharmacy inbox | Minimal patient data, ranked requests, expiry, pause/capacity state, accessible quick reply |
| Offer composer | Structured exact/partial/orderable/alternative types, integer IQD, validation, fast completion |
| Pharmacy hold | ACK/reject, exact quantity, timer after ACK, contact policy, ready/fulfilled/failed actions |
| Verification admin | Evidence, jurisdiction, reviewer, expiry, suspension, audit, least-privilege access |

### Final release gate

A screen is not done because it matches the design file. It is done when:

1. its state contract is explicit;
2. both sides of the marketplace agree on the data;
3. the Arabic is correct;
4. bidi content is safe;
5. keyboard and screen-reader operation works;
6. empty, error, loading, stale, offline, and terminal states are present;
7. trust evidence is sourced;
8. every control works;
9. the mobile performance budget passes;
10. logs and analytics preserve health-data boundaries.

The preview fixes live in `dawai-ui-preview.html` and `docs/dawai/UI_PREVIEW.html`; product contracts remain `PRODUCT_BLUEPRINT_AR.md` + `ARCHITECTURE.md`.
