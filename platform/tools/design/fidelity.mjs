/**
 * Design fidelity — the delivered spec as data, plus the judgement calls.
 *
 * `DELIVERED` is transcribed from the Night Mint handoff README and the turn-4
 * canvas. It is the thing the repository is diffed AGAINST, so colour and
 * typography fidelity are computed rather than claimed — a palette that drifts
 * is caught by the same run that reports it.
 *
 * Everything else is judgement, recorded here so the report can be generated
 * rather than written. A fidelity report written by hand is a self-assessment;
 * one generated from a spec is a comparison.
 */

/* ── The delivered specification ────────────────────────────────────────── */

export const DELIVERED = {
  name: "Night Mint (ليل النعناع)",
  turn: "4a",
  frameWidth: 360,
  scheme: "dark",
  numerals: "arabic-indic",

  /** Palette as handed over, mapped to the repository's semantic roles. */
  palette: {
    surface: "#0D1A15",
    surfaceRaised: "#142720",
    surfaceSunken: "#1B2B22",
    line: "#1E3A2D",
    ink: "#F3F7F2",
    inkMuted: "#9FC6B6",
    inkSubtle: "#8FA89C",
    accent: "#2ECF9A",
    onAccent: "#0B241B",
  },

  /** Values the delivery names that the role system does not cover. */
  extra: {
    infoSurface: "#0F2A1E",
    warning: "#E8B34B",
    warningSurface: "#2A2314",
    warningText: "#D8C9A4",
    alertGround: "#7A150F",
    alertInk: "#FFFFFF",
    codePanel: "#F7F4EE",
    codePanelInk: "#16211D",
    codePanelMuted: "#6B7A74",
    declinedDot: "#5E7A6E",
  },

  fonts: {
    arabic: { family: "IBM Plex Sans Arabic", weights: [400, 500, 600, 700, 800], licence: "OFL" },
    mono: { family: "IBM Plex Mono", weights: [500, 600], licence: "OFL", scope: "digits, codes, prices, Latin runs — never Arabic" },
  },

  /** Sizes observed in the turn-4 canvas, by role. */
  type: {
    caption: [12, 13],
    meta: [13, 14],
    body: [15, 16, 17],
    title: [20, 24],
    poster: [26, 34],
    code: [44, 76],
  },

  radii: { card: [14, 18], button: 16, chip: [6, 8], pill: 999, phone: 28 },
  spacing: { gutter: [18, 22], cardPadding: [14, 16], stackGap: [10, 14] },
  primaryHeight: 56,

  motion: {
    dwPulse: { duration: 1800, easing: "ease-out", loop: true, what: "radar / responder pulse, scale 1→2.6, opacity .55→0" },
    dwTick: { duration: 1600, easing: "ease-in-out", loop: true, what: "thinking dot, opacity 1→.35→1" },
    dwSweep: { duration: 4500, easing: "linear", loop: true, what: "radar sweep rotation" },
    dwFloat: { duration: null, easing: null, loop: true, what: "float, translateY 0→-6" },
    offerArrival: { duration: 200, easing: null, loop: false, what: "stagger per arriving offer row" },
  },
};

/** Turn-4 screens, in the delivery's own priority order. */
export const TURN4 = [
  ["V2", "Reservation (cached-first)"],
  ["R7-queued", "Waiting · queued"],
  ["R7-sent", "Waiting · sent"],
  ["R8", "Offers"],
  ["R9", "Substitution consent"],
  ["E4", "Why we need your number"],
];

export const CATEGORIES = [
  "Layout", "Typography", "Spacing", "Colour", "Component",
  "Motion", "Icon", "Accessibility", "RTL", "Responsive",
];

/**
 * Per-screen verdicts. One of:
 *   exact     — matches the delivery
 *   minor     — differs in a way a designer would call a nit
 *   intended  — deliberate, with a reason recorded in DEVIATIONS
 *   missing   — not built
 *   blocked   — cannot be built until something outside Engineering lands
 */
export const SCREENS = {
  V2: {
    built: true,
    verdicts: {
      Layout: ["missing", "The delivery leads with a cached banner, then a LIGHT code panel on the dark ground, then a facts card (pharmacy / expiry / price) as labelled rows. The build still renders the pre-design layout: dark code panel, separate branch card, separate line-item card. Structure differs throughout."],
      Typography: ["missing", "Code is delivered at 76px mono; the build renders it at the `display` role, 34px. The «آخر وقت معروف» expiry qualifier and the panel caption are not present."],
      Spacing: ["minor", "Card padding and stack gaps come from the 4pt scale and land inside the delivered 14–16 / 10–14 ranges, but the delivered 28px code-panel padding has no 4pt token (24 or 32)."],
      Colour: ["exact", "Ground, card, line, ink, muted and accent all match. Code panel present in tokens; not yet applied to the screen."],
      Component: ["missing", "Needs a light-panel component and a labelled facts row. Neither exists; the screen composes InfoCard instead."],
      Motion: ["missing", "No transition is implemented anywhere in the product."],
      Icon: ["blocked", "No icon set exists. The back affordance is still the character ‹."],
      Accessibility: ["exact", "44pt floor, accessible labels and measured contrast all enforced on this screen every build."],
      RTL: ["exact", "Direction-driven layout; no physical row reversal, banned at build time."],
      Responsive: ["missing", "Rendered and checked at 390pt only. The delivery is 360pt and the brief requires 320/360/430."],
    },
  },
  "R7-queued": {
    built: true,
    verdicts: {
      Layout: ["minor", "The build has the right shape — title, explanation, no countdown — but lacks the delivered outbox card listing the queued lines and the dashed card that explains why there is no timer."],
      Typography: ["minor", "Title renders at `title` 22px against a delivered 24px/800. The 800 weight is not in the type scale."],
      Spacing: ["exact", "20px gutter, matching the delivered range."],
      Colour: ["exact", "Palette applied."],
      Component: ["missing", "The dashed explain card is a new component; the outbox line list is not built."],
      Motion: ["missing", "None implemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "Enforced."],
      RTL: ["exact", "Enforced."],
      Responsive: ["missing", "390pt only."],
    },
  },
  "R7-sent": {
    built: true,
    verdicts: {
      Layout: ["missing", "The delivery replaces the bar with a conic-gradient ring plus a per-pharmacy responder list (replied / thinking / declined). The build renders a linear progress bar and an offer count."],
      Typography: ["minor", "Ring time is delivered as 15px mono tabular; the build uses the `display` role."],
      Spacing: ["exact", "Within the delivered ranges."],
      Colour: ["exact", "Palette applied. The delivered declined-dot #5E7A6E has no role and is recorded as an extra."],
      Component: ["missing", "Conic ring and responder row are both new components."],
      Motion: ["missing", "`dwTick` on thinking dots is specified and unimplemented — the screen's whole point is that something is happening."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["minor", "The ring needs a text equivalent; a conic gradient conveys progress by shape alone."],
      RTL: ["exact", "Enforced."],
      Responsive: ["missing", "390pt only."],
    },
  },
  R8: {
    built: true,
    verdicts: {
      Layout: ["minor", "Row content and order match the delivery — name, exact price, coverage as n-of-m, distance, band chips, readiness, amber missing-line. The build additionally renders a trailing add affordance the delivery does not have, and states the ordering rule above the list as delivered."],
      Typography: ["minor", "Price is delivered at 19px mono 700 with an 11px currency suffix; the build renders one `title` run with no suffix scaling."],
      Spacing: ["exact", "14px card padding, 10px gaps — inside the delivered ranges."],
      Colour: ["exact", "All rows identical: same card, same 1px line, no highlight. Matches the delivery's central requirement."],
      Component: ["minor", "Chips are not a component — they are inline Labels. The delivery uses them on every row."],
      Motion: ["missing", "Offer arrival stagger (~200ms) unimplemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "Enforced. Row labels name the pharmacy."],
      RTL: ["exact", "Enforced."],
      Responsive: ["missing", "The densest screen in the product, checked at 390pt only. The brief singles it out for 320pt."],
    },
  },
  R9: {
    built: true,
    verdicts: {
      Layout: ["minor", "Requested-vs-offered as two equal cards, verbatim pharmacist quote, scope note and two equal answers — all as delivered. The build orders them consent-first, then the price breakdown; the delivery has no price breakdown on this screen."],
      Typography: ["minor", "The delivery shows the Arabic name and the Latin name as separate lines inside each card; the build does the same. Sizes differ (16px/12px delivered vs the 17px/13px roles)."],
      Spacing: ["exact", "Within the delivered ranges."],
      Colour: ["exact", "Both answers share the same #142720 fill and 2px #2ECF9A border — the delivery's non-negotiable."],
      Component: ["exact", "`Choice` already renders two visually identical answers with radio semantics."],
      Motion: ["missing", "None implemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "Radio role and selected state; both answers equal in weight, enforced by test."],
      RTL: ["exact", "Enforced."],
      Responsive: ["missing", "390pt only."],
    },
  },
  E4: {
    built: false,
    verdicts: {
      Layout: ["missing", "Contract exists; no pixels. The delivery specifies a preserved-request banner, poster-scale promise copy, and a phone field with LTR mono runs."],
      Typography: ["missing", "28px/800 poster type is above the `title` role and has no token."],
      Spacing: ["missing", "Not built."],
      Colour: ["exact", "Palette available; the delivered info surface #0F2A1E has no role and is recorded as an extra."],
      Component: ["missing", "No TextField component exists anywhere in the product."],
      Motion: ["missing", "None implemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["missing", "Not built."],
      RTL: ["missing", "Not built."],
      Responsive: ["missing", "Not built."],
    },
  },
};

/* ── Deviations ─────────────────────────────────────────────────────────── */

export const DEVIATIONS = [
  {
    id: "DEV-1",
    what: "V2 code-panel caption ships at #63726B, not the delivered #6B7A74.",
    why: "The delivered value measures 4.10:1 on #F7F4EE — below the 4.5:1 body floor the build enforces. It is the line telling the patient what to do with the code, on the screen Blueprint v3 says must never fail. #63726B is the nearest value in the same hue family that clears, at 4.61:1.",
    temporary: true,
    designApproval: true,
    productApproval: false,
    debt: "TD-11",
  },
  {
    id: "DEV-2",
    what: "The patient app forces the dark scheme and ignores the device's light preference.",
    why: "The delivery is dark-only; its daylight sibling is a known open item in the handoff README. Rendering the device's light preference would ship a scheme nobody drew. `patientLight` aliases `patientDark` so nothing renders half-designed.",
    temporary: true,
    designApproval: true,
    productApproval: false,
    debt: "TD-10",
  },
  {
    id: "DEV-3",
    what: "An alphanumeric reservation code is left in Latin digits and marked LTR, rather than converted to Arabic-Indic like every other number.",
    why: "Converting only the digits of `4KD2P9` produced «٤K D٢ P٩» — one token in two scripts, worse than either system. A code is read aloud to a pharmacist and typed into their system, so it must be one alphabet. The delivery shows a purely numeric code («٤٧ ٢٩»), which would need no exemption — see CLR-1.",
    temporary: true,
    designApproval: false,
    productApproval: true,
    debt: null,
  },
  {
    id: "DEV-4",
    what: "The one-numeral-system rule now exempts isolated Latin runs.",
    why: "The delivery itself places «أوجمنتين ٦٢٥» and \"Augmentin 625\" on adjacent lines, so both systems legitimately appear on one screen. The rule was tightened to what §25 actually protects: two systems inside ARABIC text.",
    temporary: false,
    designApproval: false,
    productApproval: false,
    debt: null,
  },
  {
    id: "DEV-5",
    what: "Turn-3 screens (welcome, guest search, capture sheet, My medicines, quiet Today, safety layer) are not implemented.",
    why: "Out of scope for this pass, which takes turn 4 — the delivery. The handoff also flags that the safety layer may be cut by v3/D18 and says to confirm with Product before building it.",
    temporary: true,
    designApproval: false,
    productApproval: true,
    debt: null,
  },
];

/* ── Clarification requests ─────────────────────────────────────────────── */

export const CLARIFICATIONS = [
  {
    id: "CLR-1",
    title: "Is the reservation code numeric or alphanumeric?",
    context: "V2 is the screen Blueprint v3 says must never fail. The code is its largest element and is read aloud to a pharmacist.",
    screenshot: "review/screenshots/V2-held.png",
    current: "The build's fixture is `4KD2P9` — six alphanumeric characters, grouped in pairs, rendered in Latin because mixing scripts inside one token is worse than either system (DEV-3).",
    design: "Turn 4 V2 shows «٤٧ ٢٩» — four Arabic-Indic digits in two pairs, 76px mono.",
    why: "The alphabet of the code is a product decision with real operational weight: it sets the collision space, whether a pharmacist can type it on an Arabic keypad, and whether the Arabic-Indic conversion applies at all. Blueprint v3 does not fix it, and Engineering picking one would be inventing product behaviour.",
    options: [
      "Numeric only, 4 digits, as drawn — matches the delivery exactly and needs no script exemption, but 4 digits is a small collision space if codes are reused within a district.",
      "Numeric only, 6 digits — same rendering, materially larger space.",
      "Alphanumeric, as the fixture — largest space, but must stay Latin and therefore breaks the all-Arabic-Indic surface the delivery draws.",
    ],
    recommendation: "Numeric, 6 digits, grouped in pairs («٤٧ ٢٩ ٣١»). It keeps the delivery's rendering and its all-Arabic-Indic surface, removes the script exemption entirely, and is still readable aloud in three short groups.",
  },
  {
    id: "CLR-2",
    title: "IBM Plex Mono has no Arabic-Indic glyphs.",
    context: "The handoff specifies IBM Plex Mono for digits, codes and prices — 'never Arabic' — but the numerals throughout the delivery are Arabic-Indic (٤٧ ٢٩, ٨٬٥٠٠), which are Arabic-script characters.",
    screenshot: "review/screenshots/V2-held.png",
    current: "No font is bundled, so everything renders in a system fallback. In the browser mock the same substitution happens silently, which is why the mismatch is not visible in the canvas.",
    design: "Turn 4 sets the 76px code and all prices in IBM Plex Mono with `font-variant-numeric: tabular-nums`.",
    why: "A font either contains a glyph or it does not; Engineering cannot resolve this by choosing a value. On device the substitution will differ from the mock, and the tabular-figures guarantee — which §27 requires so a countdown does not jitter — would be lost precisely where it matters.",
    options: [
      "Use IBM Plex Sans Arabic for Arabic-Indic digits and verify its figures are tabular, keeping IBM Plex Mono only for genuine Latin runs.",
      "Switch the surface to Latin digits, which IBM Plex Mono does contain — contradicts the delivery.",
      "Nominate a different Arabic mono face that has both.",
    ],
    recommendation: "Option 1. Confirm IBM Plex Sans Arabic's Arabic-Indic figures are tabular (or supply a face that is), and scope IBM Plex Mono to Latin runs only. This keeps the delivery's numeral system and preserves the no-jitter guarantee.",
  },
  {
    id: "CLR-3",
    title: "R8 rows: does the delivery intend a tap affordance?",
    context: "R8's rows are the action — there is no primary button, which both the delivery and the Blueprint require.",
    screenshot: "review/screenshots/R8-offers.png",
    current: "Each row carries a trailing 32pt mint circle as its affordance, introduced before the design landed.",
    design: "Turn 4 R8 has no affordance on any row. The subtitle says «افتح أي عرض حتى تشوف تفاصيله».",
    why: "Removing it makes the rows read as static text with no signal that they are tappable; keeping it adds a mint element the delivery does not have, on the one screen where visual equality between pharmacies is a hard requirement.",
    options: [
      "Remove the circle and rely on the subtitle plus a pressed state.",
      "Replace it with a low-contrast chevron on every row — equal across rows, so neutrality holds.",
      "Keep the mint circle.",
    ],
    recommendation: "Option 2, once an icon set exists. A chevron is the platform-conventional 'this row opens' signal, carries no emphasis, and is identical on every row so it cannot elevate one pharmacy. Until then, option 1 with a pressed state.",
  },
  {
    id: "CLR-4",
    title: "Poster type (28px/800) and the 800 weight are outside the type scale.",
    context: "E4's promise line is 28px/800; R7 and R8 titles are 24px/800. The scale has five roles, the largest non-display being `title` at 22px/700.",
    screenshot: "review/screenshots/R8-offers.png",
    current: "Titles render at `title` 22px/700. The delivery reads noticeably heavier.",
    design: "Turn 4 uses 24px/800 for screen titles and 26–34px/800 for poster lines; the handoff lists an 800 weight for poster headers.",
    why: "Adding a type role or a weight changes the token contract every screen is built on, and the design system deliberately bars `display` from clinical content. Engineering should not add a sixth role or an eighth weight unilaterally.",
    options: [
      "Raise `title` to 24px/800 and add a `poster` role at 28–34px/800.",
      "Keep the scale and accept lighter titles.",
      "Reuse `display` (34px/700) for poster lines, with its clinical bar intact.",
    ],
    recommendation: "Option 1. The delivery uses both consistently across six screens, so they are part of the system rather than one-offs — and adding them once is cheaper than every screen deviating.",
  },
  {
    id: "CLR-5",
    title: "Four delivered colours have no semantic role.",
    context: "The role system has 15 names; the delivery names values that do not map onto any of them.",
    screenshot: "review/screenshots/R8-offers.png",
    current: "Recorded as `extra` values, unused by any component: info surface #0F2A1E (E4 banner), warning surface #2A2314 with text #D8C9A4, alert ground #7A150F (safety world), declined dot #5E7A6E (R7).",
    design: "Each appears in exactly one place in turns 3–4.",
    why: "A colour with no role is a colour a component cannot name, so it either gets hard-coded — which the design system forbids — or the role set grows. Engineering can do neither without Design.",
    options: [
      "Add roles: `infoSurface`, `warningSurface`, `onWarningSurface`, `alertGround`, `inkDisabled`.",
      "Fold them into existing roles and accept the shift.",
      "Confirm they are one-offs and allow a documented exception list.",
    ],
    recommendation: "Option 1 for `infoSurface` and the warning pair, which recur across screens; option 3 for the safety-world ground, which the handoff itself flags as possibly cut by v3/D18.",
  },
  {
    id: "CLR-6",
    title: "R7 'sent' shows named pharmacies before any offer arrives.",
    context: "The delivery lists «صيدلية الرشيد» as replied and «صيدلية الليل ٢٤» / «صيدلية النور» as thinking, while the request is still open.",
    screenshot: "review/screenshots/R7-waiting.png",
    current: "The build shows a count only — «سألنا الصيدليات القريبة» — and names no pharmacy until an offer exists.",
    design: "Turn 4 R7-sent names four pharmacies with per-pharmacy status.",
    why: "This is a product question, not a visual one. Revealing which pharmacies were asked, and that a named pharmacy declined, discloses commercial behaviour before any of them chose to answer. D12 forbids ranking; whether it also forbids exposing non-participation is not something Engineering can read off the Blueprint.",
    options: [
      "Show names and per-pharmacy status, as delivered.",
      "Show anonymous status only — «٤ صيدليات · ١ ردّت · ٢ تفكّر».",
      "Show names only once a pharmacy has replied.",
    ],
    recommendation: "Option 2 until Product rules on it. It preserves the delivery's core feeling — that something is actively happening, with several parties involved — without publishing a named pharmacy's decision not to answer.",
  },
];
