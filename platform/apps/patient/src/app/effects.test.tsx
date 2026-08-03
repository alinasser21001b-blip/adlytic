/**
 * @blueprint §21 · Rule 4
 * @owner patient-app
 * @why The effect loop is the one place where a defect can be silent: it runs
 *      after the state is committed, its result arrives asynchronously, and
 *      nothing downstream is waiting for it. A rejection there used to become
 *      an unhandled promise rejection — a warning in a console nobody reads in
 *      production — including the runner's own exhaustiveness throw, which
 *      exists precisely to be noticed.
 */
import { describe, expect, it } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { usePatientApp, type Runtime } from "../App.js";
import type { Intent } from "./store.js";

const runtime = (over: Partial<Runtime>): Runtime => {
  const base: Runtime = {
  catalogue: { search: async () => ({ kind: "failed", outcome: { kind: "transient", reason: "x" } }) },
  identity: {
    requestCode: async () => ({ kind: "failed", outcome: { kind: "transient", reason: "x" } }),
    verify: async () => ({ kind: "failed", outcome: { kind: "transient", reason: "x" } }),
  },
    marketplace: { accept: async () => ({ kind: "failed", outcome: { kind: "transient", reason: "x" } }) },
  env: { now: () => 1_000, newId: () => "id-1", online: () => true },
  deviceId: "dev-1",
  startFlush: () => {},
  capture: () => {},
  emit: () => {},
  telemetry: { emit: () => {} },
  authority: () => ({ hasOrderScope: true, activeSubjectMemorialised: false, districtId: "d1" }),
  onEffectFailed: () => {},
    onVerified: () => {},
    connect: () => () => {},
    ticks: () => () => {},
  };
  return { ...base, ...over };
};

/** Drives the hook from a real render, because the loop lives in an effect. */
function drive(rt: Runtime) {
  const seen: { send: (i: Intent) => void } = { send: () => {} };
  function Probe() {
    const { send } = usePatientApp(rt);
    seen.send = send;
    return null;
  }
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<Probe />); });
  return { ...seen, unmount: () => act(() => { renderer.unmount(); }) };
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe("an effect that throws is reported, not swallowed", () => {
  it("a rejecting port reaches onEffectFailed with the effect that caused it", async () => {
    // "Something threw" is not actionable; "search threw" is.
    const failures: { kind: string; cause: unknown }[] = [];
    const rt = runtime({
      catalogue: { search: async () => { throw new Error("port exploded"); } },
      onEffectFailed: (effect, cause) => failures.push({ kind: effect.kind, cause }),
    });
    const app = drive(rt);

    await act(async () => { app.send({ kind: "typed", raw: "بانادول" }); });
    await flush();

    expect(failures).toHaveLength(1);
    expect(failures[0]!.kind).toBe("search");
    expect((failures[0]!.cause as Error).message).toBe("port exploded");
    app.unmount();
  });

  it("the loop survives a rejection and keeps performing", async () => {
    // A caught rejection must not poison the queue: the next effect still runs.
    // Before the catch, the first rejection was unhandled and nothing here
    // could observe whether the loop had continued at all.
    let searches = 0;
    const failures: unknown[] = [];
    const rt = runtime({
      catalogue: { search: async () => { searches += 1; throw new Error("boom"); } },
      onEffectFailed: (_e, cause) => failures.push(cause),
    });
    const app = drive(rt);

    await act(async () => { app.send({ kind: "typed", raw: "بانادول" }); });
    await flush();
    await act(async () => { app.send({ kind: "typed", raw: "أموكسيسيلين" }); });
    await flush();

    expect(searches, "the second search never ran").toBe(2);
    expect(failures).toHaveLength(2);
    app.unmount();
  });

  it("an effect that resolves normally never reports a failure", async () => {
    const failures: unknown[] = [];
    const app = drive(runtime({ onEffectFailed: (_e, c) => failures.push(c) }));
    await act(async () => { app.send({ kind: "typed", raw: "بانادول" }); });
    await flush();
    expect(failures).toEqual([]);
    app.unmount();
  });
});
