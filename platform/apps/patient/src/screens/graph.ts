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
import { resolveView, type Phase } from "../model/view.js";
import type { ScreenView } from "../model/view.js";
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
 * S1 is missing too, and is deliberately NOT in that list.
 *
 * Its visual is open to the designer — how a live reservation appears there,
 * whether the quiet state is illustrated, how its two empty states differ —
 * so drawing it would be inventing the most-seen screen in the product.
 *
 * But it is the only missing screen the root SUBSTITUTES for: every exit that
 * names S1 means "leave this and go to Today", and the root answers with the
 * entry to the one journey that is built. Removing those exits would take
 * «تمام — خبروني» off R7's offline state and leave a live request with no
 * acknowledged way out, which is a worse answer than a stand-in that the root
 * documents. Listing it here would also make it un-navigable, and the app
 * STARTS on it.
 *
 * The one exit that this stand-in does not serve is E4's «مو هسه — رجعني
 * لطلبي», which names the patient's request rather than Today; the store
 * answers that one from D26's preserved action instead of from the graph.
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
): ScreenView => resolveView(contractFor(id), phase, GRAPH, history, PATIENT_FLOWS, skippedSteps);
