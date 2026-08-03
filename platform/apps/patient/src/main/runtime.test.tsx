/**
 * @blueprint §3 · §5 · §8 · §21 · F2 · D26 · D28
 * @owner patient-app
 * @why TD-1: every screen, the reducer, the ports and the effect loop were
 *      proved in isolation, and the assembled application had never started.
 *      These tests start it — a real Runtime built by `createRuntime`, driving
 *      the real store through the real effect loop — so "a patient can search"
 *      is a fact about the composed app rather than about its pieces.
 */
import { describe, expect, it } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { usePatientApp } from "../App.js";
import { createRuntime, deviceIdFrom, searchCache, authorityFrom, NO_SESSION } from "./runtime.js";
import type { Host, Store } from "./host.js";
import type { Intent } from "../app/store.js";
import { asAccountId, asSubjectId } from "@dawai/domain";
import { empty as emptyOutbox, enqueue } from "@dawai/offline";
import { resetFlushLane } from "../infra/flush.js";

/** The flusher awaits real promises; this drains the microtask queue enough
 *  times for a one-item delivery to finish. */
const settled = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

const memoryStore = (): Store & { seen: Map<string, string> } => {
  const seen = new Map<string, string>();
  return {
    seen,
    read: async (k) => seen.get(k) ?? null,
    write: async (k, v) => { seen.set(k, v); },
  };
};

const hit = (over: Record<string, unknown> = {}) => ({
  itemId: "i1", name: "بانادول", latinName: "Panadol", form: "أقراص", strength: "500mg",
  requestable: true, requiresPrescription: false, isControlled: false, ...over,
});

/** A host with no platform under it: fixed clock, counted ids, memory store. */
const testHost = (over: Partial<Host> = {}): Host & { store: Store & { seen: Map<string, string> } } => {
  const store = memoryStore();
  let n = 0;
  return {
    baseUrl: "https://api.test",
    clock: () => 1_700_000_000_000,
    newId: () => `id-${++n}`,
    online: () => true,
    store,
    sleep: async () => {},
    random: () => 0.5,
    camera: null,
    log: () => {},
    ...over,
    // `store` is preserved through the spread so a caller overriding other
    // fields still gets the one this helper hands back.
    ...(over.store ? {} : { store }),
  } as Host & { store: Store & { seen: Map<string, string> } };
};

/** The real fetch, replaced by a script. Everything else is production code. */
const scriptFetch = (reply: (url: string) => { status: number; body: unknown }) =>
  (async (url: string) => {
    const { status, body } = reply(String(url));
    return { status, text: async () => JSON.stringify(body) };
  }) as never;

describe("TD-1 — the assembled application starts", () => {
  it("mints a device id once and keeps it", async () => {
    // The verify contract binds a session to it; a value that changed between
    // launches would ask the patient to verify again every time.
    const host = testHost();
    const first = await deviceIdFrom(host);
    const second = await deviceIdFrom(host);
    expect(first).toBe(second);
    expect(host.store.seen.get("dawai.deviceId")).toBe(first);
  });

  it("builds a runtime with every port the effect loop needs", async () => {
    const { runtime } = await createRuntime(testHost());
    for (const key of ["catalogue", "identity", "env", "deviceId", "startFlush", "emit", "capture", "telemetry", "authority", "onEffectFailed", "onVerified"] as const)
      expect(runtime[key], key).toBeDefined();
  });

  it("a guest has no order scope, so the first action needing one sends them to E4 (D26)", async () => {
    const { runtime } = await createRuntime(testHost());
    expect(runtime.authority().hasOrderScope).toBe(false);
  });
});

describe("F2 — a patient searches, through the composed app", () => {
  const mount = (rt: Parameters<typeof usePatientApp>[0]) => {
    const seen: { send: (i: Intent) => void; state: ReturnType<typeof usePatientApp>["state"] | null } =
      { send: () => {}, state: null };
    function Probe() {
      const app = usePatientApp(rt);
      seen.send = app.send;
      seen.state = app.state;
      return null;
    }
    let r: TestRenderer.ReactTestRenderer;
    act(() => { r = TestRenderer.create(<Probe />); });
    return { seen, unmount: () => act(() => { r.unmount(); }) };
  };
  const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

  it("typing reaches the catalogue and the results come back", async () => {
    const host = testHost();
    globalThis.fetch = scriptFetch(() => ({ status: 200, body: { hits: [hit()], at: 1 } }));
    const { runtime } = await createRuntime(host);
    const app = mount(runtime);

    await act(async () => { app.seen.send({ kind: "typed", raw: "بانادول" }); });
    await settle();

    expect(app.seen.state?.search.kind, JSON.stringify(app.seen.state?.search)).toBe("results");
    app.unmount();
  });

  it("the results are cached, so F2 can keep its offline promise (§21)", async () => {
    const host = testHost();
    globalThis.fetch = scriptFetch(() => ({ status: 200, body: { hits: [hit()], at: 1 } }));
    const { runtime } = await createRuntime(host);
    const app = mount(runtime);
    await act(async () => { app.seen.send({ kind: "typed", raw: "بانادول" }); });
    await settle();

    expect([...host.store.seen.keys()].some((k) => k.startsWith("dawai.search."))).toBe(true);
    app.unmount();
  });

  it("with the network down, the cache answers and is labelled as cached", async () => {
    const host = testHost();
    globalThis.fetch = scriptFetch(() => ({ status: 200, body: { hits: [hit()], at: 1 } }));
    const { runtime } = await createRuntime(host);
    const app = mount(runtime);
    await act(async () => { app.seen.send({ kind: "typed", raw: "بانادول" }); });
    await settle();
    app.unmount();

    // Same host, same store — a second launch with no network at all.
    globalThis.fetch = (async () => { throw new Error("no network"); }) as never;
    const { runtime: offlineRt } = await createRuntime(host);
    const app2 = mount(offlineRt);
    await act(async () => { app2.seen.send({ kind: "typed", raw: "بانادول" }); });
    await settle();

    // §21 — never presented as live.
    expect(app2.seen.state?.search.kind).toBe("offline");
    app2.unmount();
  });

  it("a cache entry an older build wrote is ignored, not served half-understood", async () => {
    const host = testHost();
    await host.store.write("dawai.search.بانادول", "{ not json at all");
    globalThis.fetch = (async () => { throw new Error("no network"); }) as never;
    const { runtime } = await createRuntime(host);
    const app = mount(runtime);
    await act(async () => { app.seen.send({ kind: "typed", raw: "بانادول" }); });
    await settle();

    expect(app.seen.state?.search.kind).toBe("error");
    app.unmount();
  });
});

describe("the cache and the authority are the host's, not the app's", () => {
  it("a cache round-trips through whatever store the host supplied", async () => {
    const host = testHost();
    const cache = searchCache(host);
    await cache.write("q", { hits: [], at: 5 }, 7);
    expect(await cache.read("q")).toEqual({ value: { hits: [], at: 5 }, at: 7 });
  });

  it("no session means no scope — the store never derives a permission (§5 rule 2)", () => {
    expect(authorityFrom(NO_SESSION.relationships, null, null, false, "d1").hasOrderScope).toBe(false);
  });
});

describe("verifying a number is what grants order scope", () => {
  it("a verified account may order for itself, and could not before", async () => {
    // The gap this closes: the store learned who signed in and the RUNTIME did
    // not, so `authority()` still answered from an empty relationship set and
    // the R6 guard refused a patient on the request they had just verified in
    // order to send. §9 fixes the missing fact — an Account always owns exactly
    // one self Subject, created atomically by POST /v1/auth/verify.
    const { runtime } = await createRuntime(testHost());
    expect(runtime.authority().hasOrderScope).toBe(false);

    runtime.onVerified("acc-1", "sub-1");

    expect(runtime.authority().hasOrderScope).toBe(true);
  });

  it("and the domain still decides — a memorialised subject is refused (D04)", async () => {
    // The relationship is supplied, never the verdict. If `authorise` refuses,
    // the refusal stands exactly as it would for a grant from a server.
    const { runtime } = await createRuntime(testHost(), () => ({
      ...NO_SESSION, memorialised: true,
    }));
    runtime.onVerified("acc-1", "sub-1");
    expect(runtime.authority().hasOrderScope).toBe(false);
    expect(runtime.authority().activeSubjectMemorialised).toBe(true);
  });

  it("a grant over SOMEONE ELSE is not inferred from signing in", async () => {
    // GET /v1/me carries grants[] and no port reads it yet, so a guardian or a
    // peer still has no order scope in this build. Only the self relationship
    // is a domain-model invariant; anything wider would be an invented
    // permission (§5 rule 2, and the forbidden list).
    const { runtime } = await createRuntime(testHost(), () => ({
      ...NO_SESSION, subject: asSubjectId("someone-else"),
    }));
    runtime.onVerified("acc-1", "sub-1");
    // The authority answers for the SELF subject the server named, not for the
    // one the host was carrying.
    expect(runtime.authority().hasOrderScope).toBe(true);
    expect(authorityFrom([], asAccountId("acc-1"), asSubjectId("someone-else"), false, "").hasOrderScope).toBe(false);
  });
});

describe("a request the patient sends actually leaves the device", () => {
  it("the outbox the flusher delivers is the STORE's, and the reply comes back", async () => {
    /**
     * The defect this pins: `flushOutbox` said only "there is work", and the
     * runtime answered by flushing an outbox of its own that the reducer had
     * never touched. It was empty on every launch, so `readyToSend` returned
     * nothing and no POST /v1/requests was ever made — while R7 said «انرسل»
     * from the store's own optimistic state. Found by watching a browser's
     * network panel, not by any test in this repository.
     */
    const posted: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { method: string }) => {
      if (init.method === "POST") posted.push(String(url).replace("https://api.test", ""));
      return {
        status: 201,
        text: async () => JSON.stringify({ request: { requestId: "req-1" }, windowEndsAt: 0, branchesAsked: 2 }),
      };
    }) as never;

    try {
      resetFlushLane();
      const { runtime } = await createRuntime(testHost());
      const reported: Intent[] = [];
      runtime.connect((i) => { reported.push(i); });

      const queued = enqueue(emptyOutbox(), {
        id: "o-1", subjectId: "s-1", idempotencyKey: "k-1", queuedAt: 0,
        operation: "POST /v1/requests", label: "طلب دواء",
        payload: { subjectId: "s-1", urgency: "today", districtId: "d1", lines: [] },
      });

      runtime.startFlush(queued);
      await settled();

      expect(posted).toEqual(["/v1/requests"]);
      // And the delivery reports back, so the store — the owner — sees it.
      expect(reported.some((i) => i.kind === "outboxChanged")).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
