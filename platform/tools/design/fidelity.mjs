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

/**
 * `Responsive` carries no hand-written verdict for a built screen: it is
 * measured by tools/review/responsive.mjs at every supported width and written
 * into the report from review/responsive.json. A screen that is not built has
 * nothing to measure and keeps its note here.
 */
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
      Layout: ["exact", "Built to the delivery in order: full-bleed cached banner, «حجزك باسم …», light code panel, facts card (pharmacy / expiry / price) as labelled rows with dividers, the cached-counter caption, a centred call link, and «الاتجاهات» as the one footer primary. Both the live and the cached states were compared against turn 4a."],
      Typography: ["exact", "Code renders at the delivered 76px mono; the panel caption at 13px; the «آخر وقت معروف» qualifier is present and set at caption scale beside the expiry, as delivered."],
      Spacing: ["minor", "Gutters and card padding land inside the delivered ranges, but the code panel's vertical padding is 32 (space 7) against a delivered 28 — the 4pt scale has no 28, and adding an off-scale value for one panel would cost more than the 4pt it buys."],
      Colour: ["intended", "Ground, card, sunken banner, line, ink, muted and accent all match, and the light code panel is applied. The panel caption ships at #63726B rather than the delivered #6B7A74 — see DEV-1."],
      Component: ["exact", "`CodePanel`, `FactRow` and `Banner` are built and are what the screen composes. The banner is drawn by the frame from the declared offline treatment, so no screen can state «ما في اتصال» twice."],
      Motion: ["missing", "No transition is implemented anywhere in the product."],
      Icon: ["blocked", "No icon set exists. The back affordance is still the character ‹."],
      Accessibility: ["exact", "44pt floor, accessible labels and measured contrast all enforced on this screen every build."],
      RTL: ["exact", "Direction-driven layout; no physical row reversal, banned at build time."],
    },
  },
  "R7-queued": {
    built: true,
    verdicts: {
      Layout: ["exact", "Built to the delivery: «بانتظار الاتصال», the three-sentence explanation, the outbox card, the card explaining why there is deliberately no counter, then the primary «تمام — خبروني» with «إلغاء الطلب قبل الإرسال» centred beneath it at the bottom edge."],
      Typography: ["exact", "The `title` role now carries the delivered 24px/800, raised while building V2; this screen's heading picked it up with no screen-level change."],
      Spacing: ["exact", "20px gutter, matching the delivered range."],
      Colour: ["exact", "Palette applied."],
      Component: ["intended", "Composed entirely from the framework — Section, Card, Row, Spacer — with no screen-specific primitive. The delivery draws the explain card with a dashed border, which React Native cannot express on a rounded rectangle; it ships as a sunken card. See DEV-7."],
      Motion: ["missing", "None implemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "Enforced."],
      RTL: ["exact", "Enforced."],
    },
  },
  "R7-sent": {
    built: true,
    // The gallery registers this state as R7-waiting; the fidelity report calls
    // it R7-sent, after the delivery's own name for it. Stated rather than
    // inferred, because a prefix match silently reported it as unmeasured.
    states: ["R7-waiting"],
    verdicts: {
      Layout: ["minor", "Title, sub-line, the ring card and the bottom action pair are all built as delivered. The per-pharmacy responder list is absent — see CLR-6 and DEV-8; it is the delivery\'s main body, so the sent state is visibly thinner than the design."],
      Typography: ["exact", "Title at the delivered 24/800; the ring figure in mono tabular at headline scale, as delivered."],
      Spacing: ["exact", "Within the delivered ranges."],
      Colour: ["exact", "Palette applied. The delivered declined-dot #5E7A6E has no role and is recorded as an extra."],
      Component: ["intended", "`Dial` is built and is the delivered ring, drawn with clipped rotated half-discs because React Native has no conic gradient — same arc, no new dependency, geometry proved by test. The responder row is not built: no responder entity exists in the domain (DEV-8)."],
      Motion: ["missing", "`dwTick` on thinking dots is specified and unimplemented — the screen's whole point is that something is happening."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "The dial carries the fraction as an accessible percentage plus a label, so the arc is never the only thing conveying it — tested."],
      RTL: ["exact", "Enforced."],
    },
  },
  R8: {
    built: true,
    verdicts: {
      Layout: ["minor", "Built to the delivery: «العروض (ن)» with the ordering rule beneath, then rows carrying name and price as baseline peers, coverage as n-of-m beside distance, the amber missing line, and the caveats as tags. The trailing add affordance is gone. Missing: the readiness chip (no such field exists — DEV-10) and the «وسّع البحث» footer link (not a Blueprint exit — DEV-11)."],
      Typography: ["minor", "Name and price now sit at the same headline weight as delivered, and prices read «د.ع» across the product. The delivery sets the currency suffix at 11px, which is below the caption role and outside the type scale; it renders at caption size."],
      Spacing: ["exact", "14px card padding, 10px gaps — inside the delivered ranges."],
      Colour: ["exact", "All rows identical: same card, same 1px line, no highlight. Matches the delivery's central requirement."],
      Component: ["exact", "`Tag` is built and is what every caveat renders through, with one neutral treatment so no tag can be dressed up to favour a pharmacy. `ActionCard` gained an affordance choice rather than being forked."],
      Motion: ["missing", "Offer arrival stagger (~200ms) unimplemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "Enforced. Row labels name the pharmacy and the ACT — «افتح عرض …», so a screen reader user is told the tap opens rather than reserves. The two new text-on-line pairs the tags introduced are now measured by the contrast gate (17 pairs, was 14)."],
      RTL: ["exact", "Enforced."],
    },
  },
  R9: {
    built: true,
    verdicts: {
      Layout: ["minor", "Built to the delivery in full: «دواء غير اللي طلبته», the neutrality sentence, asked and offered side by side with BOTH names in both scripts, the verbatim quote signed by its verified author, both consent statements, and two identical answers. The two comparison cards do not equalise height (DEV-14), and the answers sit inside the card rather than pinned at the bottom (DEV-15)."],
      Typography: ["exact", "Heading at the delivered 24/800, the quote at body scale, captions at 13. Prices read «د.ع»."],
      Spacing: ["exact", "Within the delivered ranges."],
      Colour: ["exact", "Both answers share the same #142720 fill and 2px #2ECF9A border — the delivery's non-negotiable."],
      Component: ["exact", "Composed from Section, Row, Grow, Card, Bidi and Choice — no screen-specific primitive. `Choice` gained a spoken label so shortening «أوافق على البديل» to «أوافق» did not strip the subject from a screen reader."],
      Motion: ["missing", "None implemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "Radio semantics with selection state, identical weight for both answers, and a spoken label naming the medicine each answer refers to. Both answers clear the 44pt floor at every measured width."],
      RTL: ["exact", "Enforced."],
    },
  },
  E4: {
    built: true,
    states: ["E4-guarded", "E4-direct"],
    verdicts: {
      Layout: ["minor", "Built to the delivery: the preserved-request strip, the poster promise, the privacy sentence, then «أدخل رقمي» with «مو هسه — رجعني لطلبي» centred beneath it. The delivered phone field is absent — see DEV-16; Blueprint v3 puts phone entry on E5, so a field here would be either inert or a second place a number can be typed."],
      Typography: ["exact", "The promise renders at the delivered 28/800 through the `poster` role, added while building V2 and used here for the first time."],
      Spacing: ["exact", "Gutter and stack gaps inside the delivered ranges."],
      Colour: ["exact", "Palette applied, and the delivered info surface #0F2A1E now exists as a token with both of its text pairs measured by the contrast gate."],
      Component: ["intended", "Composed from Section, Row, Primary and Secondary plus one new piece, `InfoStrip`. No TextField is used because no field is drawn — DEV-16."],
      Motion: ["missing", "None implemented."],
      Icon: ["blocked", "No icon set."],
      Accessibility: ["exact", "The reason shown is the guard\'s own string, so what a screen reader announces is what the redirect said. Both controls clear the 44pt floor at every measured width, and the way out is a labelled control rather than only a chevron."],
      RTL: ["exact", "Direction-driven; the strip mixes weights inside one run without splitting the sentence."],
    },
  },
};

/* ── Deviations ─────────────────────────────────────────────────────────── */

export const DEVIATIONS = [
  {
    id: "DEV-16",
    what: "E4 draws no phone field; the delivery shows «+964» beside a masked «77_ ___ ____».",
    why: "Blueprint v3 separates the two: E4 explains («Explain before the one hard ask») and E5 takes the number («Phone entry»). Drawing a field on E4 gives one of two bad outcomes — a decoration that does nothing when tapped, which is the placeholder pattern this project forbids, or a second place in the product where a phone number can be entered. The primary keeps the contract\'s «أدخل رقمي» and leads to E5 rather than the delivery\'s «أرسل الرمز», which belongs to the merged screen the delivery drew.",
    temporary: false,
    designApproved: false,
    productApproved: false,
    debt: "None for E4. E5–E8 remain unbuilt and are tracked as TD-4.",
  },
  {
    id: "DEV-14",
    what: "The asked and offered cards do not equalise their heights.",
    why: "The offered card carries a price line and is therefore taller. Equalising needs a height-stretch escape hatch on `Card` that nothing else wants, and the two cards are a comparison of facts rather than two answers competing — the two ANSWERS are pixel-identical, which is the part §4 R10 governs.",
    temporary: true,
    designApproved: false,
    productApproved: false,
    debt: "Give Card an optional fill so a row of cards can equalise.",
  },
  {
    id: "DEV-15",
    what: "The two answers sit inside the substitution card rather than pinned at the bottom of the screen.",
    why: "The delivery draws one substitution and pins one pair of buttons. R9 can carry several — an offer may substitute more than one line — and a single pinned pair cannot answer them all, nor say which one it is answering. Each substitution owns its own answers, directly beneath the comparison they refer to.",
    temporary: false,
    designApproved: false,
    productApproved: false,
    debt: "None. Confirm with Design that a multi-substitution offer keeps per-card answers.",
  },
  {
    id: "DEV-9",
    what: "R8 states distance in bands — «قريبة منك» / «أقل من كيلومتر» / «حوالي ٣ كم» — where the delivery prints «١٫١ كم».",
    why: "`distanceM` is measured from the district centroid, and the domain says so in as many words: presented as a rough distance, never as a live position, because Phase 0 does not track the patient. A decimal kilometre would claim a precision the number does not have, on the screen where the patient decides how far to walk with a sick child. The delivery's precision is a visual choice; the imprecision of the underlying figure is a fact.",
    temporary: false,
    designApproved: false,
    productApproved: false,
    debt: "None. Confirm with Design that banded distance is acceptable, or deliver real positioning first.",
  },
  {
    id: "DEV-10",
    what: "R8 rows carry no readiness chip («جاهز هسه» / «جاهز خلال ١٥ د»).",
    why: "No readiness field exists on an Offer. The domain knows `openNow` — whether the branch is open — which is a different fact and is rendered as its own tag. Inventing a preparation time on the screen where a patient decides where to walk would be inventing an entity and a promise at once.",
    temporary: true,
    designApproved: false,
    productApproved: false,
    debt: "Needs a readiness field on Offer, and a pharmacy-side way to set it truthfully.",
  },
  {
    id: "DEV-11",
    what: "R8 has no «ما يعجبك شي؟ وسّع البحث» footer link.",
    why: "Blueprint v3 gives R8 two exits — offer detail and reserving. Widening the search is neither, and adding an exit a screen is not declared to have would put a destination in the navigation graph that the Blueprint does not contain.",
    temporary: true,
    designApproved: false,
    productApproved: false,
    debt: "Needs a Blueprint revision adding the exit, or Design dropping the link.",
  },
  {
    id: "DEV-6",
    what: "R7 queued lists outbox ENTRIES with their delivery state, not individual medicines with pack counts.",
    why: "The delivery lists «أموكسيسيلين ٢٥٠/٥ شراب — علبة» per line. The outbox holds REQUESTS, and an outbox item's payload is opaque to the UI by design, so a per-medicine breakdown would mean either casting through the offline boundary or inventing lines. What ships is what the outbox actually knows: the entry's own label and its real delivery state.",
    temporary: true,
    designApproved: false,
    productApproved: false,
    debt: "Needs either a per-line outbox projection or Design accepting the entry-level list.",
  },
  {
    id: "DEV-7",
    what: "R7 queued draws the «no counter on purpose» card as a sunken card, not the delivered dashed outline.",
    why: "React Native cannot draw a dashed border on a rounded rectangle. Sinking the card below the content plane carries the same meaning — this is a remark about the screen rather than content — using the Note/Card treatment already used everywhere else for exactly that.",
    temporary: false,
    designApproved: false,
    productApproved: false,
    debt: "None. Confirm the substitution with Design.",
  },
  {
    id: "DEV-8",
    what: "R7 sent does not render the per-pharmacy responder list.",
    why: "Two independent blocks. CLR-6 is an open PRODUCT question — whether naming a pharmacy that declined may be disclosed before it chose to answer. And no responder entity exists in the domain: the model knows the window and the offer count, nothing per pharmacy. Building it would mean inventing an entity and answering a product question inside implementation, both forbidden. The sent state is visibly thinner than the delivery as a result, and that emptiness is the honest rendering of what is known.",
    temporary: true,
    designApproved: false,
    productApproved: false,
    debt: "Blocked on CLR-6, then on a responder projection in the Marketplace domain.",
  },
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
    id: "CLR-7",
    question: "Should a workflow screen show flow progress at all?",
    context: "Every screen in the request flow renders «تنتظر الردود — الخطوة ٤ من ٦» beneath its title. The turn-4 delivery shows no progress row on any of the five screens — it shows a device status bar instead.",
    screenshot: "review/screenshots/R7-waiting.png",
    current: "Progress renders on R1, R2, R6, R7, R8 and V1, derived from the declared flow.",
    design: "Turn 4 shows no progress indicator on V2, R7, R8, R9 or E4.",
    whyBlocked: "The Blueprint requires every screen to answer «where am I», and the flow progress is how that is currently answered. Whether the delivery INTENDS to drop it, or simply did not draw chrome, is a question only Design can answer — removing it would weaken a Blueprint guarantee on a guess.",
    options: [
      "Keep the progress row as built.",
      "Drop it on modal workflow screens, where the title already answers «where am I».",
      "Replace it with a non-numeric form the delivery would accept.",
    ],
    recommendation: "Keep it until Design rules. The separator defect it had — a middle dot beside Arabic-Indic digits read as a numeral, so «٤/٦» rendered as «٤/٦٠» — is fixed independently; it now reads «الخطوة ٤ من ٦».",
  },
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
