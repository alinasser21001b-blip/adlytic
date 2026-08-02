/**
 * The change log for the current slice.
 *
 * Authored rather than derived. A changelog generated from commit subjects
 * describes what was typed; this describes what changed for the user and why,
 * which is the only version worth reading. Every entry here is checkable
 * against the code in the same push.
 */
export const SLICE = {
  name: "Patient · Vertical slice 3",
  workflow: "Prescription capture (R2–R3) + explicit substitution consent (R9–R10)",
  milestone: "The consent journey, end to end — the safety-critical path",
  status: "complete",
  next: "Nobody-answered → widen or watch (R11, R12), then the outbox screen (R13). The onboarding chain E5–E8 remains the gap that keeps a guest from completing any journey.",
};

export const CHANGELOG = {
  Added: [
    "R2 and R3 — photographing the prescription. R3 exists because Phase 0 reads nothing (D18): the patient is the only judge of legibility, so the screen states what a pharmacist will need to see rather than asking 'is it clear?' and leaving them to guess.",
    "R9 and R10 — explicit substitution consent, closing TD-5. Per line, never pre-ticked, with no constructor that produces agreement; undecided is treated as NOT agreed when computing what gets reserved.",
    "The consent gate in the reducer: an offer containing a substitution cannot be reserved until every proposal has an answer, and tapping reserve takes the patient to the decision rather than refusing them.",
    "A camera refusal state that is never a wall — the alternative becomes the primary action rather than sitting behind a disabled camera button.",
    "Release readiness and screen health in the dashboard, both derived.",
  ],
  Improved: [
    "V2 said «120 دقيقة», which made a patient do arithmetic before knowing whether to walk or hurry. It now reads «ساعتين» — hours are how people hold time.",
    "The substitution decision moved above the price breakdown. It had been below the fold, so the patient saw a disabled button and a note about a choice they could not see — on the one screen where the choice IS the screen.",
    "Both consent answers carry identical visual weight and announce their selection to a screen reader. A filled 'agree' beside an outlined 'refuse' is a nudge, and a nudged consent is not consent.",
  ],
  Fixed: [
    "R1's empty-state action rendered mid-screen instead of in thumb reach. A screen passing `null` for its footer read as claiming the slot, which suppressed the state's own action — `null` and `undefined` now mean different things, and only `undefined` means 'I have no footer'.",
    "Two numeral systems could appear in one glance: a server-supplied address carried Arabic-Indic digits beside Western prices. Normalisation now happens where text is rendered, so no call site has to remember — and the rule is checked on every registered screen state.",
    "The substitute medicine rendered as an item id rather than a name, hidden by a cast in the test fixture. A patient was being asked to consent to «x1». The fixture is typed now, and the offer line carries the substitute's name.",
  ],
  Refactored: [
    "ONE screen registry, two consumers. The gallery the review photographs and the audit the tests run are the same list, and it lives in the app rather than beside the review tooling. A screen state cannot be photographed without being audited, or audited without appearing in the review.",
    "The product rules — one primary, the 44pt floor, readable labels, no repeated action, one numeral system, explained disabled states — now run over every registered state automatically. They were previously asserted per screen, in two files, with the helpers copied between them.",
    "Substitution proposals are derived once in the offers model. The reducer had begun building the same list in two places, which is where two copies drift.",
  ],
  "Technical debt removed": [
    "TD-5 (critical) resolved: substitution consent is explicit, per line, and enforced in the reducer as well as the screen.",
    "The duplicated render-test helpers are gone — 149 rule assertions are now generated from the registry rather than written by hand, and they covered the seven new states the moment those were registered.",
  ],
};

/** Honest limits of this slice. Never omitted, never softened. */
export const LIMITATIONS = [
  "The camera is not implemented (TD-9). R2 and R3 are complete in state, navigation, consent and tests, but no photograph can be taken until a device build exists — R2 is labelled MOCKED in the dashboard.",
  "Acceptance is computed against the offer's own line ids because the client has no server-assigned request line ids yet (TD-8). Correct against fixtures, wrong the moment a real server assigns ids.",
  "The screenshots are the real component tree rendered through a DOM adapter, not device captures. They prove layout, hierarchy, typography, colour, spacing and tap-target size. They do not prove native gestures, platform chrome or animation.",
  "No infrastructure exists yet (Stage 5). The catalogue and request ports are types with test fakes behind them; nothing talks to a server.",
  "115 of the 133 Blueprint screens are not built. Nine are referenced by an exit in this slice and are listed as known gaps; no control navigates to any of them.",
  "The sign-in chain (E5 → E8) is not built, so a guest who touches an action needing an account reaches E4 and stops there.",
  "Animation timing tokens exist but no transition is implemented yet — state changes are instant.",
];
