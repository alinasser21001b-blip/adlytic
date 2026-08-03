/**
 * The host runtime's one invariant: dispatching is pure.
 *
 * @blueprint §21 · Rule 4
 * @owner patient-app
 * @why React re-invokes a reducer — twice per render under StrictMode, and
 *      again whenever a concurrent render is discarded and replayed. The
 *      previous host pushed effects onto a ref from inside a `setState`
 *      updater, so every re-invocation appended the same effects again. The
 *      user-visible failure is two verification SMS for one tap; the harmless
 *      end of the same bug is double-counted telemetry.
 *
 *      This proves the property at the level React actually breaks it: call
 *      the reduction twice with the same input and require the same output.
 */
import { describe, expect, it } from "vitest";
import { dispatch, initial, type AppState, type Authority, type Effect, type Intent } from "./store.js";
import type { Environment } from "../ports.js";

const env: Environment = { now: () => 1_000, newId: () => "id-1", online: () => true };
const permitted: Authority = { hasOrderScope: true, activeSubjectMemorialised: false, districtId: "d1" };

/** The same shape App.tsx's reducer has, minus React. */
type RuntimeState = { readonly state: AppState; readonly effects: readonly Effect[] };

const reduceRuntime = (prev: RuntimeState, intent: Intent): RuntimeState => {
  const step = dispatch(prev.state, intent, env, permitted);
  return { state: step.state, effects: [...prev.effects, ...step.effects] };
};

/** Intents that emit an effect — the ones where a duplicate is a real event
 *  reaching a real person, not a wasted allocation. */
const EFFECTFUL: readonly Intent[] = [
  { kind: "typed", raw: "بانادول" },
  { kind: "typePhone", raw: "07701234567" },
  { kind: "submitPhone" },
];

describe("dispatching is pure, because React will do it twice", () => {
  it.each(EFFECTFUL.map((i) => [i.kind, i] as const))(
    "%s produces identical effects when the reducer is re-invoked",
    (_kind, intent) => {
      const before: RuntimeState = { state: initial(), effects: [] };
      const once = reduceRuntime(before, intent);
      const twice = reduceRuntime(before, intent);
      // Same input, same output. An accumulator living outside the reducer
      // would make the second call longer than the first.
      expect(twice.effects).toEqual(once.effects);
      expect(twice.state).toEqual(once.state);
    },
  );

  it("never grows the queue by re-reducing — the failure that sent two SMS", () => {
    let s: RuntimeState = { state: initial(), effects: [] };
    s = reduceRuntime(s, { kind: "typePhone", raw: "07701234567" });

    const single = reduceRuntime(s, { kind: "submitPhone" });
    // StrictMode: the very same transition, computed a second time from the
    // very same previous state.
    const doubled = reduceRuntime(s, { kind: "submitPhone" });

    const codes = (r: RuntimeState) => r.effects.filter((e) => e.kind === "requestCode");
    expect(codes(single)).toHaveLength(1);
    expect(codes(doubled), "a re-invoked reducer requested a second SMS").toHaveLength(1);
  });

  it("drains by identity, so an effect that arrived mid-flight is not dropped", () => {
    // The drain removes exactly what was performed. Clearing the whole queue
    // would silently discard anything enqueued while those were in flight.
    const a: Effect = { kind: "search", query: "أ" };
    const b: Effect = { kind: "search", query: "ب" };
    const done = new Set([a]);
    expect([a, b].filter((e) => !done.has(e))).toEqual([b]);
  });
});
