/**
 * Per-screen and per-component design notes.
 *
 * This is the ONLY hand-authored input to the design package. Everything else —
 * purposes, states, actions, exits, guards, analytics, usage counts, the
 * diagrams — is derived from the code by tools/design/build.mjs.
 *
 * What lives here is the part no repository can know: what the user is trying
 * to achieve, which decisions the Blueprint has already closed, and which are
 * genuinely open to the designer. Keeping it in one file means a designer's
 * question is answered in one place rather than in six documents that drift.
 */

/** Screens with an engineering contract. Keyed by Blueprint id. */
export const SCREEN_NOTES = {
  S1: {
    goal: "Find out, in one glance, whether anything needs me today.",
    emotion: "Reassurance. Most days the honest answer is 'nothing', and the screen must make that feel like good news rather than an empty app.",
    fixed: [
      "Two DIFFERENT empty states, not one. A brand-new account must be taught; a well-managed patient on a quiet day must be reassured. §22 treats these as separate screens.",
      "Root of a tab — the OS back gesture exits the app. There is no back control.",
      "One primary action: أطلب دواء.",
    ],
    open: [
      "Everything about how a live reservation appears here — this screen is the patient's home and a held reservation is the most important thing it can carry.",
      "Whether the quiet state uses an illustration, a typographic treatment, or nothing at all.",
      "How the two empties differ visually while remaining the same component.",
    ],
    notes: "Not yet rendered. The contract exists; no pixels do. The designer is designing this from scratch.",
  },
  E4: {
    goal: "Understand why this app wants my phone number before I give it.",
    emotion: "Trust, at the single hardest ask in the product. §3.1 forbids a sign-in wall on launch: the account is requested at the first action that needs one, with the reason stated.",
    fixed: [
      "This screen exists to EXPLAIN before it asks. It may not become a phone-entry form.",
      "Dismissing returns the patient to what they were doing, with their work preserved (D26).",
    ],
    open: ["The entire visual treatment. This is the product's first impression for most users."],
    notes: "Reached only by a guard refusal — no screen exits to it. It is the one screen a guest can be sent to, and E5 (phone entry) does not exist yet, so today it is a dead end.",
  },
  F1: {
    goal: "Start looking for a medicine.",
    emotion: "Invitation. A patient arrives here knowing the name of a medicine and nothing else about the app.",
    fixed: ["Root of a tab. Guest-accessible — no account required to search (§3.1)."],
    open: ["Whether the teaching empty carries an illustration.", "The search field's resting appearance and its focused state."],
    notes: "F1 and F2 are ONE screen in the implementation — the state of the search decides which contract is live. Pushing results on top of search would make the back gesture clear the query.",
  },
  F2: {
    goal: "Find the medicine I am holding, however I happen to spell it.",
    emotion: "Competence. The app should feel like it understood me.",
    fixed: [
      "A miss is never 'no results'. §13.1: the catalogue is incomplete, not the patient wrong — and the miss feeds catalogue growth via search.unmatched.",
      "A controlled item is refused ON THE ROW, before the tap (D42). It renders as information, not as a disabled control.",
      "A prescription-required item warns before it is added (D18).",
    ],
    open: [
      "How the three clinical answers are distinguished at a glance — ordinary, prescription-required, controlled.",
      "Result row density and hierarchy: Arabic name, Latin name, strength, form.",
    ],
    notes: "The row IS the tap target; a filled button per row put three competing primaries on one screen. Query normalisation folds tatweel, أ/إ/آ, ى, ة and both numeral systems onto one query.",
  },
  R1: {
    goal: "Assemble everything I need before I send it.",
    emotion: "Control. This is where a request stops being an idea.",
    fixed: [
      "Maximum 8 lines, stated as a visible fact rather than enforced as a wall.",
      "The unit is the pack (D07). There is no other unit.",
      "A prescription line blocks sending until its photo is attached (D18), and the reason sits beside the disabled control.",
      "A refusal appears in place and the rest of the draft stays on screen.",
    ],
    open: ["The quantity stepper.", "How a line still needing a prescription is marked.", "Whether lines are reorderable or swipe-deletable."],
    notes: "Presented as a modal (destination: modal) but renders as a full screen, because no sheet chrome exists.",
  },
  R2: {
    goal: "Photograph the paper prescription in my hand.",
    emotion: "Guidance without judgement.",
    fixed: [
      "Phase 0 reads NOTHING (D18). No OCR, no extraction, no validation. The screen may never claim to have understood the image.",
      "A camera refusal is never a wall — the alternative becomes the primary action.",
      "Failures name the fixable condition, never the person (D37).",
    ],
    open: ["The camera viewfinder overlay: framing guides, torch control, shutter.", "How the guidance is shown without covering the subject."],
    notes: "The camera is NOT implemented (TD-9). The screen dispatches a capture effect that nothing handles.",
  },
  R3: {
    goal: "Decide whether the photo I just took is readable.",
    emotion: "Confidence in my own judgement.",
    fixed: [
      "The PATIENT judges legibility, because nothing else does. The screen states what a pharmacist will need to see rather than asking 'is it clear?'.",
      "Retaking discards — two photos of one paper is a choice nobody asked for.",
    ],
    open: ["The whole photo viewer: aspect handling, zoom, the checklist's relationship to the image."],
    notes: "PLACEHOLDER. A grey 192pt box is rendered instead of the photograph. This is the most visible unfinished thing in the product.",
  },
  R4: {
    goal: "Say who this medicine is for.",
    emotion: "Care. Often the answer is a parent or a child, not the person holding the phone.",
    fixed: ["Every clinical read is scoped to the chosen subject.", "Returns to R1 with the lines intact."],
    open: ["How a person is represented — initials, photo, relationship, age."],
    notes: "Not rendered. Exits to S3 (add a person), which is not built.",
  },
  R5: {
    goal: "Say how urgently I need this.",
    emotion: "Honesty. Choosing 'now' should not feel like the default.",
    fixed: ["Exactly three windows (D09): 20 minutes, 4 hours, 2 days. No fourth option exists and the durations are fixed."],
    open: ["How the three are presented — and how to make 'today' feel like a legitimate choice rather than a compromise."],
    notes: "Not rendered as its own screen. The choice currently lives inline on R6.",
  },
  R6: {
    goal: "Check it once, then send it.",
    emotion: "Calm before commitment. The only screen in the loop meant to be read rather than used.",
    fixed: [
      "Each urgency window states its real duration, because a patient choosing between them deserves the number.",
      "Offline, the button promises only what the app can do: 'send it when the connection returns' (D27).",
    ],
    open: ["The summary's hierarchy: which reads first, the medicines or the urgency."],
    notes: "The urgency selector uses radio semantics. Exactly one filled control on the screen.",
  },
  R7: {
    goal: "Understand how long I am waiting and whether anything is happening.",
    emotion: "Contained anxiety. This is the most anxious moment in the product.",
    fixed: [
      "A QUEUED request shows no countdown and no progress element at all — a bar over a request nobody has received is a lie (D27).",
      "A broadcast request shows how much of the window is left.",
      "Waiting with nothing yet is a SUCCESS state, not an absence: we asked, and nobody has answered yet.",
    ],
    open: ["What the wait looks like. A bar was chosen over a spinner because a spinner says 'working' and nothing about how much longer."],
    notes: "The two forms — queued and broadcast — are visually unrelated today and both need design.",
  },
  R8: {
    goal: "Choose where to walk, with a sick child, using reasons I can check.",
    emotion: "Clarity under pressure. The most consequential screen in the product.",
    fixed: [
      "NO RANKING (D12). No weighting, no paid placement, no 'recommended' badge. The order is coverage then price, both printed on every row, and the screen SAYS SO.",
      "Coverage before price: an offer that cannot supply the medicine is not cheaper, it is incomplete.",
      "Reliability is a BAND, never a number or a percentage (D11).",
      "The missing medicine is NAMED, not counted.",
      "A withdrawn offer renders as information, not as a control that will reject the tap.",
      "A substitution is flagged as needing consent and can never be silently accepted (§4 R10).",
    ],
    open: [
      "The row's internal hierarchy — six facts compete: branch, distance, coverage, missing items, price, reliability.",
      "How a partial offer is distinguished from a complete one at a glance.",
    ],
    notes: "The densest screen in the product. Must be verified at 320pt. Any visual treatment that elevates one pharmacy breaks D12.",
  },
  R9: {
    goal: "Understand exactly what I am agreeing to before I agree.",
    emotion: "Informed consent. Not reassurance — comprehension.",
    fixed: [
      "Consent is EXPLICIT, per line, and never pre-ticked (§4 R10).",
      "Both answers carry identical visual weight. A filled 'agree' beside an outlined 'refuse' is a nudge, and a nudged consent is not consent.",
      "The pharmacist's note appears VERBATIM (D19). The app never paraphrases a clinical statement.",
      "Refusing costs nothing — the line joins a child request (D06) — and the screen says so.",
      "The decision appears BEFORE the price breakdown.",
    ],
    open: ["How 'what you asked for' and 'what they have' are compared visually.", "How an answered proposal differs from an unanswered one, without colour alone."],
    notes: "Safety-critical. Any asymmetry between the two answers is a clinical-consent defect, not a style preference. Closed TD-5.",
  },
  R11: {
    goal: "Decide what to do when nobody answered.",
    emotion: "Not abandonment. The honest empty case, with a way forward.",
    fixed: ["The request may be widened or watched; abandoning is an explicit choice, never a default."],
    open: ["Everything. Not rendered."],
    notes: "Exits to R12 (watches), which is not built.",
  },
  R13: {
    goal: "See what is waiting to be sent, and cancel it if I want.",
    emotion: "Transparency. Nothing is happening in secret.",
    fixed: [
      "NO primary action — a list of pending work whose only action is per-item cancellation.",
      "The wording of each item comes from the outbox, so no screen can invent a friendlier phrase for 'not yet sent' (D27).",
    ],
    open: ["How a pending item, a failed item and a sending item differ."],
    notes: "Not rendered. The only contracted screen that deliberately has no primary action.",
  },
  V1: {
    goal: "Wait a few seconds while the pharmacy is asked to set my medicine aside.",
    emotion: "Brief, contained suspense.",
    fixed: [
      "NO COUNTDOWN. The clock starts at 'held' and nowhere earlier — a timer before stock is committed counts down to a disappointment.",
      "Un-poppable: a hold request is in flight and going back would leave the patient unsure whether it happened.",
      "No primary action. The patient waits, and the screen says they need not wait here.",
    ],
    open: ["What 'we are asking' looks like without becoming a progress bar for something with no measurable progress."],
    notes: "One of two screens with no primary action, and the only one that cannot be left by any control.",
  },
  V2: {
    goal: "Show a code at a counter and get my medicine.",
    emotion: "Certainty. Blueprint v3 says this screen MUST NEVER FAIL.",
    fixed: [
      "The code is the largest element on the screen, grouped so it can be read aloud over a phone.",
      "It renders from cache when offline, and a cached countdown is labelled as last known — presenting it as live sends someone to a lapsed hold.",
      "Arrives by notification, so there is no stack behind it; back replaces to Today.",
      "The remaining time is worded in hours, not minutes — '120 دقيقة' makes a patient do arithmetic before knowing whether to walk or hurry.",
    ],
    open: [
      "How the code is presented — this is the single most important visual element in the product.",
      "How urgency escalates as the hold nears expiry, without colour alone.",
      "Whether the code is copyable, and what long-press does.",
    ],
    notes: "Must be legible in bright sunlight, one-handed, possibly with a child on the other arm. Design at 200% text scale first, not last.",
  },
  V4: {
    goal: "Understand that the pharmacy could not hold it, and see what happens next.",
    emotion: "Disappointment absorbed, momentum kept.",
    fixed: [
      "D39 — the request re-opens AUTOMATICALLY. The action moves the patient forward rather than asking them to start again.",
      "Names the situation, never the pharmacist and never the patient (D37). Stock moves; saying so plainly is the honest version.",
    ],
    open: ["How to deliver bad news without alarm."],
    notes: "Arrives by notification. There is no stack behind it.",
  },
};

/** Components in apps/patient/src/ui/kit.tsx. */
export const COMPONENT_NOTES = {
  Screen: {
    purpose: "The frame every screen renders through. It is the reason no screen can ship without answering 'where am I' and 'how do I go back'.",
    variants: ["header with back (pop/replace)", "header without back (tab root)", "with flow progress", "with sticky slot", "with screen footer", "with state footer", "no footer"],
    interactions: ["back press", "scroll", "sticky slot behaviour on scroll"],
    a11y: "The title is the screen's accessible name. The back control has a 44pt hit area and an explicit label.",
    motion: "screenPush 350ms on push; sheetPresent 300ms for modal destinations; sheetDrag follows the finger 1:1.",
    rtl: "Header runs right-to-left by direction, NOT by row-reverse — reversing inside an RTL container double-reverses and puts back on the wrong edge. This shipped once.",
    responsive: "Title must truncate to one line. Progress caption must not wrap at 320pt.",
    constraints: "Footer padding is 16 + 24pt bottom, a guessed approximation of a home indicator, not a real safe-area inset.",
  },
  Primary: {
    purpose: "The one dominant action. At most one per screen, counted from the rendered tree every build.",
    variants: ["default", "disabled", "busy"],
    interactions: ["press", "long-press (undefined)", "disabled press (no-op, but the reason must be visible)"],
    a11y: "accessibilityState carries disabled and busy. A disabled primary MUST have a visible explanation near it — the build checks that something readable is on screen.",
    motion: "No press animation exists. errorShake (200ms) is declared for validation failure and unused.",
    rtl: "Label centres; no directional content.",
    responsive: "Full-width in the footer. Must hold a long Arabic label at 200% text without truncating — 'أرسله أول ما يرجع الاتصال' is the longest today.",
    constraints: "48pt tall, above the 44pt floor, because §25 raises the patient primary specifically.",
  },
  Secondary: {
    purpose: "Never competes with the primary: no fill, no accent background.",
    variants: ["default", "with a distinct spoken label"],
    interactions: ["press"],
    a11y: "Supports a spoken label different from the visible text, so repeated row actions are distinguishable to a screen reader while the visible text stays short.",
    motion: "None specified.",
    rtl: "Groups of secondaries lay out right-to-left.",
    responsive: "Up to three appear in a row on R1 and must wrap legibly at 320pt.",
    constraints: "44pt minimum. Adjacent secondaries need a specified minimum gap so two are not mistaken for one.",
  },
  ActionCard: {
    purpose: "A whole card that is itself the action. Replaced a filled button per row, which put three competing primaries on one screen.",
    variants: ["default", "muted (unavailable)"],
    interactions: ["press anywhere on the card"],
    a11y: "The label names the subject — 'أضف بانادول للطلب', not 'أضف' — so a screen reader moving down a list says which row it is on.",
    motion: "responderArrive 200ms when a new offer enters the list. Unimplemented.",
    rtl: "Content column leads; the affordance trails.",
    responsive: "R8's row carries six facts. Verify at 320pt.",
    constraints: "The affordance is a '+' character in a 32pt accent circle. Both the glyph and the circle are inventions.",
  },
  InfoCard: {
    purpose: "Information, not an action. A refused item renders as information rather than a control that would reject the tap.",
    variants: ["default", "muted"],
    interactions: ["none — deliberately not pressable"],
    a11y: "No role; content carries its own semantics.",
    motion: "None.",
    rtl: "Inherits.",
    responsive: "Nests one level (R9 puts the pharmacist's note inside the consent card).",
    constraints: "Most-used container: 14 usages. Padding, radius and 1px border are all invented.",
  },
  Choice: {
    purpose: "One answer among two, where the choice itself is the point. Used only for substitution consent.",
    variants: ["selected", "unselected"],
    interactions: ["press", "change after answering — allowed until the offer is accepted"],
    a11y: "radio role with accessibilityState.selected. Without it a patient using TalkBack cannot tell which answer they gave.",
    motion: "None specified. A selection change should not animate in a way that implies the app made the choice.",
    rtl: "Two side by side; the longer label ('لا، أريد اللي طلبته') must not force a different height.",
    responsive: "Both labels must fit at 320pt without truncation — a truncated consent option is a consent defect.",
    constraints: "SAFETY-CRITICAL. Both options must remain visually equal in weight. Selection is currently a 2px accent border only, which is colour-alone.",
  },
  StateBlock: {
    purpose: "Renders whichever treatment the screen's contract declared. It cannot fall through to a generic message.",
    variants: ["loading", "empty (teaching)", "empty (quiet/success)", "error", "offline", "permissionRefused", "success (never used)"],
    interactions: ["the treatment's single action, which moves to the footer when the screen has no footer of its own"],
    a11y: "loading carries progressbar role. Errors must not rely on colour alone.",
    motion: "skeletonToReal 150ms. Unimplemented, and the skeleton's shape does not match any real content.",
    rtl: "Inherits.",
    responsive: "Fills the screen and centres; must not push its action out of thumb reach at 200% text.",
    constraints: "Six treatments, every dimension invented. The success treatment has never been rendered.",
  },
  Label: {
    purpose: "All text. 5 type roles × 7 colour roles.",
    variants: ["display", "title", "headline", "body", "caption"],
    interactions: ["none"],
    a11y: "display and caption are barred from clinical content by type — a dosage in caption is a compile error.",
    motion: "None.",
    rtl: "textAlign right, writingDirection rtl. Normalises Arabic-Indic digits to Western at render, so no call site can leak a second numeral system.",
    responsive: "Must reflow at 200%.",
    constraints: "Letter-spacing is always 0. Arabic is connected and tracking breaks the joins.",
  },
  Digits: {
    purpose: "Countdowns, prices, quantities, the reservation code.",
    variants: ["body", "headline", "title", "display"],
    interactions: ["none — but the reservation code should arguably be selectable"],
    a11y: "Read as a number by screen readers; the reservation code is grouped in pairs so it can be read aloud.",
    motion: "A ticking countdown must not reflow.",
    rtl: "Numbers run LTR inside RTL text.",
    responsive: "The code is the largest element on V2 and must survive 200% text.",
    constraints: "Requires a TABULAR figures face. None is bundled, so digits currently change width as they tick.",
  },
  Bidi: {
    purpose: "Isolates a Latin run inside Arabic — drug names, codes, prices — so it does not reorder.",
    variants: ["body", "headline", "caption", "title"],
    interactions: ["none"],
    a11y: "Correct reading order for screen readers.",
    motion: "None.",
    rtl: "This IS the RTL component. Unisolated, a price beside Arabic reorders and the patient reads the wrong number.",
    responsive: "Mixed-script lines wrap unpredictably; verify at 320pt.",
    constraints: "Correct by construction. Needs only the Arabic/Latin font pairing.",
  },
  RedirectNote: {
    purpose: "Says why a guard sent the user here, so a screen never appears for no reason.",
    variants: ["one"],
    interactions: ["none"],
    a11y: "Should be announced on arrival — currently it is not.",
    motion: "None.",
    rtl: "Inherits.",
    responsive: "One or two lines.",
    constraints: "Entirely invented.",
  },
};

/** Components the build needs and does not have. */
export const MISSING_COMPONENTS = [
  ["TabBar", "S1, F1 and all eight declared destinations", "No top-level navigation exists. S1 and F1 declare 'root of a tab' and there are no tabs."],
  ["Sheet / modal chrome", "R1, R4, R5, R7 (destination: modal)", "Modals render as full screens; the 'temporary and layered above' signal is absent."],
  ["TextField", "F1/F2 search, and 28 form screens in Entry and Account", "One inline search field was improvised. No focus, error or disabled state exists."],
  ["PhotoViewer", "R3", "A grey placeholder box renders instead of the prescription."],
  ["DestructiveConfirm", "V5, and the 'two-step' Blueprint state kind", "The first destructive action will invent its own pattern."],
  ["Toast / transient confirmation", "the undoDwell motion token (4000ms)", "The token has nothing to animate."],
  ["Badge", "the inbox destination", "Nothing can show pending work."],
  ["FocusRing", "accessibility", "Assistive input hardware is unusable — nothing renders focus."],
  ["PullToRefresh", "every cached list", "Not implemented, no specification."],
];
