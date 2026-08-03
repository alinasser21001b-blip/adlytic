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

/** Whether a screen exists in this build. Blueprint v3 has 133 patient-side
 *  screens and this slice contracts 22 of them; the rest arrive with their
 *  slice. Nothing renders a control that leads to a screen that is not here —
 *  a button that does nothing is the defect this check exists to prevent, and
 *  the set shrinks to empty as the remaining slices land. */
export const isBuilt = (screen: string): screen is ScreenId => CONTRACTS.has(screen);

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
