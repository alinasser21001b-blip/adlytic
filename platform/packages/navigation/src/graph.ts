/**
 * The navigation graph — derived from the screen contracts, never hand-wired.
 *
 * @blueprint §5 · §4
 * @owner patient-app
 * @why Principle 2 says the app must never feel like a collection of pages and
 *      must never dead-end. Hand-wiring navigation makes both of those a matter
 *      of vigilance. Deriving the graph from the contracts makes an orphan
 *      screen and a trap into findable graph properties, and means back
 *      behaviour is answered once rather than re-decided on every screen.
 * @implements navigation/graph
 */
import type { Flow } from "./flow.js";

/** The shape the graph needs from a contract. Structural, so navigation does
 *  not import the design package and create a cycle. */
export type NavScreen = {
  readonly id: string;
  readonly exits: readonly string[];
  readonly back:
    | { readonly kind: "pop" }
    | { readonly kind: "dismiss"; readonly returnsTo: string }
    | { readonly kind: "replace"; readonly with: string; readonly why: string }
    | { readonly kind: "none"; readonly why: string };
  readonly destination: string;
};

export type NavGraph = {
  readonly screens: ReadonlyMap<string, NavScreen>;
  readonly entryPoints: readonly string[];
};

export function buildGraph(screens: readonly NavScreen[]): NavGraph {
  return {
    screens: new Map(screens.map((s) => [s.id, s])),
    // A screen reached by a tab bar or a notification has no parent in the
    // stack. Seeding reachability from Today alone reports a correct tab root
    // as unreachable, which is a bug in the check and not in the app.
    entryPoints: screens.filter((s) => s.back.kind === "none" || s.back.kind === "replace").map((s) => s.id),
  };
}

/** Screens no entry point can reach. Each one is a screen a user cannot get to. */
export function unreachable(g: NavGraph): readonly string[] {
  const seen = new Set(g.entryPoints);
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...seen]) {
      for (const e of g.screens.get(id)?.exits ?? [])
        if (g.screens.has(e) && !seen.has(e)) { seen.add(e); grew = true; }
    }
  }
  return [...g.screens.keys()].filter((id) => !seen.has(id));
}

/** Screens with nowhere to go and no way back. */
export function traps(g: NavGraph): readonly string[] {
  return [...g.screens.values()]
    .filter((s) => s.exits.length === 0 && s.back.kind === "none")
    .map((s) => s.id);
}

/** Exits naming a screen that does not exist — a button that goes nowhere. */
export function danglingExits(g: NavGraph): readonly string[] {
  const out: string[] = [];
  for (const s of g.screens.values())
    for (const e of s.exits) if (!g.screens.has(e)) out.push(`${s.id} → ${e}`);
  return out;
}

/**
 * Back, resolved once for the whole app.
 *
 * `history` is the live stack. A pop with an empty history is not an error —
 * it is a tab root, and the answer is to stay, not to crash or to exit
 * silently. Principle 2: back must be predictable, including at the edges.
 */
export type BackResult =
  | { readonly kind: "pop"; readonly to: string }
  | { readonly kind: "replace"; readonly to: string }
  | { readonly kind: "stay"; readonly why: string }
  | { readonly kind: "exitApp" };

export function resolveBack(g: NavGraph, current: string, history: readonly string[]): BackResult {
  const s = g.screens.get(current);
  if (!s) return { kind: "stay", why: "unknown screen" };
  switch (s.back.kind) {
    case "pop": {
      const to = history[history.length - 1];
      // A pop with nothing beneath means the screen was deep-linked into. Land
      // on its destination root rather than leaving the user nowhere.
      return to === undefined
        ? { kind: "replace", to: rootOf(g, s.destination) }
        : { kind: "pop", to };
    }
    case "dismiss": return { kind: "replace", to: s.back.returnsTo };
    case "replace": return { kind: "replace", to: s.back.with };
    case "none": return history.length === 0
      ? { kind: "exitApp" }
      : { kind: "stay", why: s.back.why };
  }
}

function rootOf(g: NavGraph, destination: string): string {
  for (const s of g.screens.values())
    if (s.destination === destination && s.back.kind === "none") return s.id;
  return g.entryPoints[0] ?? destination;
}

/**
 * A deep link resolves to a full stack, never a bare screen.
 *
 * Landing on a detail with no parent traps the user, and a notification is the
 * most common way to arrive somewhere with no history. The stack is built by
 * walking back from the target to an entry point.
 */
export function stackFor(g: NavGraph, target: string): readonly string[] {
  const s = g.screens.get(target);
  if (!s) return [];
  const stack: string[] = [target];
  let cursor = s;
  const guard = new Set<string>([target]);
  while (cursor.back.kind === "pop" || cursor.back.kind === "dismiss") {
    const parentId = cursor.back.kind === "dismiss"
      ? cursor.back.returnsTo
      : parentOf(g, cursor.id);
    if (!parentId || guard.has(parentId)) break;
    guard.add(parentId);
    stack.unshift(parentId);
    const parent = g.screens.get(parentId);
    if (!parent) break;
    cursor = parent;
  }
  if (cursor.back.kind === "replace") stack.unshift(cursor.back.with);
  return stack;
}

/** The screen that most plainly leads here. Deterministic: first by declaration
 *  order, so a deep-linked stack is the same every time. */
function parentOf(g: NavGraph, id: string): string | null {
  for (const s of g.screens.values()) if (s.exits.includes(id)) return s.id;
  return null;
}

/** Every screen that belongs to a flow must be in the graph, or a user can
 *  begin a journey they cannot finish. */
export function flowGaps(g: NavGraph, flows: readonly Flow[]): readonly string[] {
  const out: string[] = [];
  for (const f of flows) {
    for (const s of f.steps) if (!g.screens.has(s.screen)) out.push(`${f.id}: step "${s.screen}" is not in the graph`);
    if (!g.screens.has(f.completesAt)) out.push(`${f.id}: completes at "${f.completesAt}", which is not in the graph`);
    if (!g.screens.has(f.abandonsTo)) out.push(`${f.id}: abandons to "${f.abandonsTo}", which is not in the graph`);
  }
  return out;
}
