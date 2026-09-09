/**
 * The patient graph, derived from the patient contracts.
 *
 * @blueprint §5 · §4
 * @owner patient-app
 * @why These three things are properties of the CONTRACTS: which screens this
 *      build has, how they connect, and which declared exits it cannot yet
 *      honour. None of them is a property of the reducer.
 *
 *      They lived in app/store.ts, so every screen that needed to know whether
 *      a destination exists imported the composition root to find out — a
 *      presentation module reaching into the module that owns dispatch,
 *      effects and every intent in the product. The dependency now runs one
 *      way: screens and the store both read the contracts, and neither reads
 *      the other.
 */
import { buildGraph, guardDestinations, ROUTE_GUARDS, type NavGraph } from "@dawai/navigation";
import { isTabDestination, resolveView, type Phase } from "../model/view.js";
import type { ScreenView, Tab } from "../model/view.js";
import { PATIENT_FLOWS } from "./flows.js";
import type { ScreenContract } from "@dawai/design";
import { CORE_LOOP, type ScreenId } from "./core-loop.contract.js";

const CONTRACTS: ReadonlyMap<string, ScreenContract> = new Map(CORE_LOOP.map((c) => [c.id, c]));

/** Built once from the contracts, so navigation is never hand-wired. */
export const GRAPH: NavGraph = buildGraph(
  CORE_LOOP.map((c) => ({ id: c.id, exits: c.exits, back: c.back, destination: c.location.destination })),
  // A guard destination is arrived at without any screen exiting to it.
  guardDestinations(ROUTE_GUARDS),
);

/**
 * Contracted, and with no component to draw it.
 *
 * A contract is not a screen. These five have a full contract — states,
 * exits, guards, a primary — and nothing that renders them, so the app root
 * falls through to `default` when a patient arrives. Each is here with the
 * reason it cannot simply be built, because "not built yet" and "cannot be
 * built yet" are different facts and only one of them is a scheduling
 * question.
 */
const NO_COMPONENT: Readonly<Record<string, string>> = {
  R4: "the subject switcher; arrives with the family slice",
  R5: "urgency as a modal; R6 sets it inline today",
  R11: "the honest empty case; arrives with the marketplace slice",
  R13: "the outbox screen; arrives with the offline slice",
};

/**
 * S1 used to be here, as a screen the root SUBSTITUTED for.
 *
 * It no longer is. Every exit that names S1 means "leave this and go to
 * Today", and for as long as Today had no component the root answered them
 * with the SEARCH screen — so the back out of a live reservation, and R7's
 * «تمام — خبروني» on a queued request, both landed on a search box that said
 * nothing about the hold or the request the patient had just left.
 *
 * What made it look un-buildable was the design package's open questions, and
 * re-reading them against Blueprint v3 §4 they are visual rather than
 * behavioural: the row fixes the purpose, the five states, the four exits, the
 * offline rule and the clinical rule, and §22 already says what distinguishes
 * the two empties. Composing those from the same tokens and primitives as the
 * other seventeen screens is not inventing a screen. What each state SHOWS is
 * in `model/today.ts`; what remains genuinely open is recorded as TD-27.
 */

/**
 * Whether this build can actually SHOW a screen.
 *
 * Blueprint v3 has 133 patient-side screens and this slice contracts 22 of
 * them; the rest arrive with their slice. Nothing renders a control that leads
 * to a screen that is not here — a button that does nothing is the defect this
 * check exists to prevent, and the set shrinks to empty as the slices land.
 *
 * It used to test only `CONTRACTS.has`, which made that promise false and
 * produced the worst version of the defect it was written to prevent: the
 * control rendered, the tap succeeded, `open` allowed it, and the root's
 * `default` drew the SEARCH screen. R1's «لمن؟» — the control for saying who
 * the medicine is for — replaced the request a patient had just built with a
 * search box. The navigation gates could not see it: they prove the CONTRACT
 * graph has no unreachable screen and no trap, and every one of these passes
 * that.
 *
 * A contract this build cannot draw is now indistinguishable, to everything
 * that asks, from a screen it does not contract at all — which is what
 * callers were always assuming.
 */
export const isBuilt = (screen: string): screen is ScreenId =>
  CONTRACTS.has(screen) && !(screen in NO_COMPONENT);

/** The contracted screens with nothing to draw them, so the gap is countable
 *  from outside this module rather than only readable inside it. */
export const NOT_DRAWN: readonly string[] = Object.keys(NO_COMPONENT).sort();

/** The contract for a screen this build has. */
export const contractFor = (id: ScreenId): ScreenContract => CONTRACTS.get(id)!;

/**
 * The top-level destinations, DERIVED rather than listed.
 *
 * A tab is a screen that declares itself the root of one: `back: none` is the
 * contract's way of saying "the OS gesture leaves the app from here", and
 * Blueprint v3 says the same thing twice over — S1's entry is «E1 · tab» and
 * both S1 and F1 give "root of the … tab" as the reason they have no back
 * control. So the tab bar is not a new navigation idea; it is the one the
 * contracts have been describing since they were written, and the app not
 * having it is why F1 and S1 could each only be reached from the other's
 * absence.
 *
 * The destination is what makes it a tab, not the missing back control alone.
 * V1 also declares `back: none`, for an unrelated reason — a hold request is in
 * flight and going back would leave the patient unsure whether it happened —
 * and it sits in `modal`, which covers the tabs rather than being one. Testing
 * only for the missing back put «نحجز لك» in the tab bar, offered to a patient
 * as somewhere to go while a pharmacy was deciding.
 *
 * `isBuilt` filters, for the same reason it filters everywhere else: a tab
 * that opens a screen with no component is the inert control this project has
 * already paid for once (TD-19). Order is declaration order, so the tabs do
 * not reshuffle between screens.
 */
export const TABS: readonly Tab[] = CORE_LOOP
  .filter((c) => c.back.kind === "none" && isTabDestination(c.location.destination) && isBuilt(c.id))
  .map((c) => ({ id: c.id, title: c.location.title, destination: c.location.destination }));

/** Every exit the contracts declare that this build cannot yet honour. Each
 *  one is a real Blueprint v3 screen — ux-check proves that — and each is
 *  owned by a later slice. Listed so the gap is countable rather than
 *  discovered by a user pressing something inert. */
export const NOT_YET_BUILT: readonly string[] = [...new Set(
  CORE_LOOP.flatMap((c) => c.exits).filter((e) => !CONTRACTS.has(e)),
)].sort();

/**
 * What a screen presents, resolved from its contract.
 *
 * Every screen asked the same question with the same two ambient answers:
 * `resolveView(contract(id), phase, GRAPH, history, PATIENT_FLOWS)`, sixteen
 * times. The graph and the flows are not a screen's to supply — a screen knows
 * its own id, its phase and where the user came from, and nothing else in that
 * call varied. Four screens had also each grown a private
 * `contract = (id) => CORE_LOOP.find(...)!` to reach the first argument: four
 * linear scans and four non-null assertions for a lookup this module already
 * has as a Map, keyed by a type that makes an unknown id impossible.
 */
export const viewOf = (
  id: ScreenId,
  phase: Phase,
  history: readonly string[],
  skippedSteps: readonly string[] = [],
): ScreenView => resolveView(contractFor(id), phase, GRAPH, history, PATIENT_FLOWS, skippedSteps, TABS);
