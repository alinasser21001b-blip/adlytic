/**
 * State machine — Rule 5, enforced by construction.
 *
 * @blueprint §6 · §5 rule 3
 * @owner platform-foundation
 * @why Rule 5 says every state transition must come from the published state
 *      machine: no implicit transitions, no magic transitions, no undocumented
 *      transitions. A machine written as `if (state === "held") state = "collected"`
 *      cannot honour that — the transitions are scattered and nobody can list
 *      them. Here a machine IS its transition table, so a transition that the
 *      Blueprint does not contain is unrepresentable rather than merely
 *      forbidden, and the table can be diffed against the published diagram.
 * @implements domain/machine
 */
import { type Result, ok, err } from "./result.js";
import { type Refusal, refuse, REFUSAL } from "./refusal.js";

/**
 * One published transition. `bp` is the Blueprint reference for THIS edge, not
 * for the machine — so a reviewer can check a single arrow against the diagram
 * without reading the whole file.
 */
export type Transition<S extends string, E extends string> = {
  readonly from: S;
  readonly on: E;
  readonly to: S;
  readonly bp: string;
};

export type Machine<S extends string, E extends string> = {
  readonly name: string;
  readonly bp: string;
  readonly initial: readonly S[];
  readonly terminal: readonly S[];
  readonly transitions: readonly Transition<S, E>[];
};

export function defineMachine<S extends string, E extends string>(
  m: Machine<S, E>,
): Machine<S, E> {
  return m;
}

/**
 * Attempt a transition. Returns the next state, or ILLEGAL_TRANSITION with the
 * attempted edge in the detail so the log names exactly what was tried.
 */
export function transition<S extends string, E extends string>(
  m: Machine<S, E>,
  from: S,
  on: E,
): Result<S, Refusal> {
  const t = m.transitions.find((x) => x.from === from && x.on === on);
  if (!t) return err(refuse(REFUSAL.ILLEGAL_TRANSITION, { machine: m.name, from, on }));
  return ok(t.to);
}

export function can<S extends string, E extends string>(m: Machine<S, E>, from: S, on: E): boolean {
  return m.transitions.some((x) => x.from === from && x.on === on);
}

export function statesOf<S extends string, E extends string>(m: Machine<S, E>): readonly S[] {
  const s = new Set<S>([...m.initial, ...m.terminal]);
  for (const t of m.transitions) { s.add(t.from); s.add(t.to); }
  return [...s];
}

export function eventsFrom<S extends string, E extends string>(m: Machine<S, E>, from: S): readonly E[] {
  return m.transitions.filter((t) => t.from === from).map((t) => t.on);
}

/**
 * Structural audit of a published machine. Every state must be reachable from
 * an initial state, and every non-terminal state must have an exit — the two
 * properties Blueprint v3 §10 checked by hand for every diagram. Running it as
 * a test is how that check stays true after the tenth change.
 */
export function audit<S extends string, E extends string>(m: Machine<S, E>): readonly string[] {
  const problems: string[] = [];
  const states = statesOf(m);

  const reachable = new Set<S>(m.initial);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of m.transitions)
      if (reachable.has(t.from) && !reachable.has(t.to)) { reachable.add(t.to); grew = true; }
  }
  for (const s of states) if (!reachable.has(s)) problems.push(`${m.name}: state "${s}" is unreachable`);

  for (const s of states) {
    if (m.terminal.includes(s)) continue;
    if (!m.transitions.some((t) => t.from === s)) problems.push(`${m.name}: state "${s}" has no exit`);
  }

  for (const t of m.transitions) if (!t.bp) problems.push(`${m.name}: ${t.from}--${t.on}->${t.to} has no Blueprint reference`);

  const seen = new Set<string>();
  for (const t of m.transitions) {
    const k = `${t.from}|${t.on}`;
    if (seen.has(k)) problems.push(`${m.name}: two transitions leave "${t.from}" on "${t.on}" — nondeterministic`);
    seen.add(k);
  }

  if (!m.terminal.length) problems.push(`${m.name}: no terminal state declared`);
  return problems;
}
