/**
 * Turning a screen contract into something a component can render.
 *
 * @blueprint §4 · §22 · §23 · §26 · R1 · R6 · R7 · S1
 * @owner patient-app
 * @why The three questions every screen must answer — where am I, what should
 *      I do now, what happens if I press this — are already declared in the
 *      contract, and the flow already knows where the screen sits in the
 *      journey. Resolving them here means a component receives the answers
 *      instead of composing them, so a screen physically cannot render without
 *      a header, a back behaviour and exactly one primary action, and the
 *      state a screen shows is looked up from its declared treatments rather
 *      than improvised at the point of failure.
 */
import type { ScreenContract, StateTreatment } from "@dawai/design";
import { progressAt, resolveBack, type Flow, type NavGraph, type BackResult } from "@dawai/navigation";

/** Which of the contract's declared treatments is live right now. */
export type Phase =
  | { readonly kind: "ready" }
  | { readonly kind: "loading" }
  /** `isSuccess` distinguishes S1's two empties — the new account that must be
   *  taught from the well-managed patient who is simply having a quiet day. */
  | { readonly kind: "empty"; readonly isSuccess: boolean }
  /**
   * No payload. It carried a `detail` that seven screens filled in — a refusal
   * code, a branch name, the literal "upload" — and that nothing anywhere ever
   * read: the frame draws the contract's declared sentence and the screen adds
   * whatever varies as its own line, which is the pattern E6 uses for the
   * attempts remaining. A field the whole presentation layer feeds and no
   * renderer consumes is a promise that something downstream is using it.
   */
  | { readonly kind: "error" }
  | { readonly kind: "offline"; readonly ageMs: number | null }
  | { readonly kind: "permissionRefused" };

/**
 * A top-level destination the user can move to at any time.
 *
 * `title` is the ROOT SCREEN's own contract title — «اليوم», «ابحث» — never a
 * second label written beside it, because two names for one destination is one
 * name and one thing that can disagree with the header the tab opens.
 */
export type Tab = {
  /** The root screen the tab opens. */
  readonly id: string;
  readonly title: string;
  readonly destination: ScreenContract["location"]["destination"];
};

/**
 * Destinations that sit ABOVE the tabs rather than inside one.
 *
 * A modal is temporary and layered over whatever it interrupted; the sign-in
 * chain is an interruption of the same kind (§3.1 — it is reached because an
 * action needed an account, and it returns to that action). Leaving the tabs
 * visible under either invites a tap that abandons work the screen has just
 * promised to keep (D26).
 */
const COVERS_THE_TABS: ReadonlySet<string> = new Set(["modal", "entry"]);

/**
 * Whether this screen sits INSIDE a tab, or arrived from outside the app.
 *
 * `back: replace` is a screen that took the stack rather than joining one, and
 * both screens that declare it say why in the contract: "there is no stack
 * behind a notification". A patient reading a pickup code at a counter did not
 * navigate to that screen and is not browsing a tab — they were told.
 *
 * The cost was measured rather than argued. V2 belongs to `today`, so it drew
 * the tabs; at 320pt the 78pt they take pushed «اتصال بالصيدلية» off the
 * bottom of the screen Blueprint v3 says must never fail, on the phone size
 * with the least room to lose. Leaving is still one tap — `replace` renders a
 * back control that lands on Today, which has the tabs.
 */
const arrivedFromOutside = (back: ScreenContract["back"]): boolean => back.kind === "replace";

/**
 * Whether a destination is one of the tabs, or one that covers them.
 *
 * Exported because "is this a tab" is asked twice — the frame asks it to
 * decide whether to draw them, and the contracts are asked it to work out
 * WHICH screens are the roots. Two copies of that set would be one set and one
 * thing that can disagree, and the disagreement is visible: `back: none` alone
 * put V1 in the tab bar, because V1 declares no back for a completely
 * different reason — a hold request is in flight — and a patient waiting on a
 * pharmacy was offered «نحجز لك» as a place to navigate to.
 */
export const isTabDestination = (d: ScreenContract["location"]["destination"]): boolean =>
  !COVERS_THE_TABS.has(d);

export type ScreenView = {
  readonly id: string;
  /** Where am I. Always present — the contract type does not allow otherwise. */
  readonly title: string;
  readonly destination: ScreenContract["location"]["destination"];
  /**
   * The top-level destinations, for the frame to draw.
   *
   * Carried on the view rather than passed to each screen because a tab bar
   * that a screen has to remember to render is a tab bar that some screen will
   * not have. Empty where the screen covers them, so the frame draws nothing
   * without every screen re-deciding the same rule.
   */
  readonly tabs: readonly Tab[];
  /** How far along, when the screen sits inside a flow. Null for a screen that
   *  is not part of a journey; a progress indicator on a standalone screen is
   *  a lie about a journey the user is not on. */
  readonly progress: { readonly step: number; readonly of: number; readonly label: string; readonly goal: string; readonly nextLabel: string | null } | null;
  /** What should I do now. At most one, by contract. */
  readonly primary: ScreenContract["primary"];
  readonly secondary: ScreenContract["secondary"];
  /** What happens if I press back. Resolved against the live stack, so the
   *  answer is the real one and not the declared intention. */
  readonly back: BackResult;
  readonly phase: Phase;
  /** The declared treatment for the live phase, or null when the phase is
   *  `ready`. A missing treatment is a build failure in tools/ux-check.mjs, so
   *  reaching null here at runtime means the phase is ready. */
  readonly treatment: StateTreatment | null;
  readonly telemetry: readonly string[];
};

/**
 * Look up the treatment the contract declared for this phase.
 *
 * The empty case matches on `isSuccess` because §22 gives S1 two empty states
 * with opposite meanings, and picking the first one would greet a new user
 * with "everything is fine" and no way to start.
 */
export function treatmentFor(c: ScreenContract, phase: Phase): StateTreatment | null {
  switch (phase.kind) {
    case "ready": return null;
    case "empty":
      return c.states.find((s) => s.kind === "empty" && s.isSuccess === phase.isSuccess)
        ?? c.states.find((s) => s.kind === "empty")
        ?? null;
    default:
      return c.states.find((s) => s.kind === phase.kind) ?? null;
  }
}

export function resolveView(
  c: ScreenContract,
  phase: Phase,
  graph: NavGraph,
  history: readonly string[],
  flows: readonly Flow[],
  skippedSteps: readonly string[] = [],
  /** Every top-level destination this build can show a root for. Defaults to
   *  none, so a caller that has no tabs — a test, a persona without them —
   *  gets a frame with none rather than having to say so. */
  tabs: readonly Tab[] = [],
): ScreenView {
  let progress: ScreenView["progress"] = null;
  for (const flow of flows) {
    const p = progressAt(flow, c.id, skippedSteps);
    if (!p) continue;
    progress = { step: p.stepIndex, of: p.totalSteps, label: p.label, goal: p.goal, nextLabel: p.next?.label ?? null };
    break;
  }

  const treatment = treatmentFor(c, phase);

  return {
    id: c.id,
    title: c.location.title,
    destination: c.location.destination,
    tabs: COVERS_THE_TABS.has(c.location.destination) || arrivedFromOutside(c.back) ? [] : tabs,
    progress,
    // The state names the primary when it has an opinion; otherwise the
    // screen's own. Resolved here so no screen chooses an action at render.
    //
    // Key PRESENCE, not truthiness: a state that declares `null` is saying it
    // has nothing to offer, and `??` would read that as "no opinion" and fall
    // back to the screen's primary — which is how R7 kept offering «شوف العرض
    // الواصل» over zero offers after the contract said not to.
    primary: treatment && c.primaryWhen && treatment.kind in c.primaryWhen
      ? c.primaryWhen[treatment.kind] ?? null
      : c.primary,
    secondary: c.secondary,
    back: resolveBack(graph, c.id, history),
    phase,
    treatment,
    telemetry: c.telemetry,
  };
}

/**
 * A screen is not renderable if the phase it is in has no declared treatment.
 * ux-check proves this cannot happen for the states the Blueprint declares;
 * this is the runtime half, and it returns a reason rather than throwing so a
 * caller can decide — a patient holding a reservation code must not lose the
 * screen because a treatment was missing.
 */
export function renderability(v: ScreenView): string | null {
  if (v.phase.kind !== "ready" && v.treatment === null)
    return `screen ${v.id} is in phase "${v.phase.kind}" with no declared treatment`;
  return null;
}
