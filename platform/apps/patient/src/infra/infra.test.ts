/**
 * The infrastructure layer, proved against a fake server.
 *
 * @blueprint §21 · net/retry · POST /v1/auth/phone · POST /v1/auth/verify · POST /v1/requests
 * @owner patient-app
 * @why These tests are the first in the product to exercise the full round
 *      trip — store → effect → transport → declared response → intent →
 *      store — with the network scripted rather than imagined. The server here
 *      answers exactly what the API contract declares and nothing else, so a
 *      port that guesses beyond the contract fails against it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { instant } from "@dawai/domain";
import { shouldRetry, DEFAULT_POLICY } from "@dawai/net";
import { empty, enqueue, cancel, type Outbox } from "@dawai/offline";
import { makeHttp, type Fetch } from "./http.js";
import { makeIdentity } from "./identity.js";
import { makeCatalogue, type SearchCache } from "./catalogue.js";
import { flush, resetFlushLane } from "./flush.js";
import { perform, type Ports } from "./perform.js";
import { dispatch, initial, type AppState, type Authority } from "../app/store.js";
import type { Environment } from "../ports.js";

/** A scripted server: each call shifts the next answer. Unscripted calls fail
 *  the test rather than defaulting, so an unexpected request is visible. */
function server(script: readonly { status: number; body?: unknown }[]) {
  const calls: { url: string; method: string; body: unknown; headers: Record<string, string> }[] = [];
  const queue = [...script];
  const fetchImpl: Fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: { ...init.headers } });
    const next = queue.shift();
    if (!next) throw new Error(`unscripted call: ${init.method} ${url}`);
    return { status: next.status, text: async () => (next.body === undefined ? "" : JSON.stringify(next.body)) };
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};
const env: Environment = { now: () => 5_000, newId: () => "id-1", online: () => true };
const permitted: Authority = { hasOrderScope: true, activeSubjectMemorialised: false, districtId: "d1" };

describe("the transport", () => {
  it("classifies a network failure as transient, because losing coverage is normal operation", async () => {
    const http = makeHttp("https://api", async () => { throw new Error("socket closed"); });
    const res = await http.get("/v1/districts");
    expect(res.outcome).toEqual({ kind: "transient", reason: "socket closed" });
  });

  it("a cancelled request is NOT worth retrying", async () => {
    // `transient` means "worth retrying". An abort is the caller saying stop,
    // and retrying it is the transport overruling them — on the outbox path
    // that is a POST the patient cancelled being sent anyway.
    const controller = new AbortController();
    controller.abort();
    const abortError = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const http = makeHttp("https://api", async () => { throw abortError; });
    const res = await http.get("/v1/districts", controller.signal);
    expect(res.outcome.kind).toBe("permanent");
    expect(shouldRetry(res.outcome, 1, DEFAULT_POLICY)).toBe(false);
  });

  it("an AbortError is recognised even without the signal in hand", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const http = makeHttp("https://api", async () => { throw abortError; });
    expect((await http.get("/v1/districts")).outcome.kind).toBe("permanent");
  });

  it("a dropped connection is still transient — the two are told apart", async () => {
    const http = makeHttp("https://api", async () => { throw new Error("socket closed"); });
    const res = await http.get("/v1/districts");
    expect(res.outcome.kind).toBe("transient");
    expect(shouldRetry(res.outcome, 1, DEFAULT_POLICY)).toBe(true);
  });

  it("sends the idempotency key on every attempt, unchanged", async () => {
    const s = server([{ status: 201, body: {} }]);
    const http = makeHttp("https://api", s.fetchImpl);
    await http.post("/v1/requests", { a: 1 }, { idempotencyKey: "key-9" });
    expect(s.calls[0]?.headers["idempotency-key"]).toBe("key-9");
  });
});

describe("the identity port speaks only the declared contract", () => {
  it("maps 202 to a challenge and refuses a 202 without one as a server defect", async () => {
    const ok = server([{ status: 202, body: { challengeId: "ch-7", resendAfter: 60 } }]);
    const good = await makeIdentity(makeHttp("https://api", ok.fetchImpl)).requestCode("+9647701234567");
    expect(good).toEqual({ kind: "fresh", value: { challengeId: "ch-7", resendAfter: 60 } });
    expect(ok.calls[0]?.body).toEqual({ phone: "+9647701234567" });

    const bad = server([{ status: 202, body: {} }]);
    const res = await makeIdentity(makeHttp("https://api", bad.fetchImpl)).requestCode("+9647701234567");
    // Not transient: retrying into a defective server is not a recovery.
    expect(res.kind === "failed" && res.outcome.kind === "permanent").toBe(true);
  });

  it("maps each declared verify response onto its own result", async () => {
    const cases: readonly [number, unknown, unknown][] = [
      [400, { attemptsLeft: 2 }, { kind: "wrongCode", attemptsLeft: 2 }],
      [410, {}, { kind: "expired" }],
      [429, {}, { kind: "tooManyAttempts" }],
      [403, {}, { kind: "suspended" }],
    ];
    for (const [status, body, expected] of cases) {
      const s = server([{ status, body }]);
      const res = await makeIdentity(makeHttp("https://api", s.fetchImpl)).verify("ch-1", "123456", "dev-1");
      expect(res).toEqual({ kind: "fresh", value: expected });
    }
  });
});

describe("the catalogue port keeps F2's offline promise", () => {
  const memoryCache = (): SearchCache & { store: Map<string, { value: never; at: number }> } => {
    const store = new Map();
    return {
      store,
      read: async (q) => store.get(q) ?? null,
      write: async (q, value, at) => { store.set(q, { value, at }); },
    };
  };

  it("serves the cache with its WRITE time when the network fails", async () => {
    const cache = memoryCache();
    const s = server([
      { status: 200, body: { hits: [{ itemId: "i1", name: "بانادول" }], at: 4_000 } },
      { status: 503, body: {} },
    ]);
    const port = makeCatalogue(makeHttp("https://api", s.fetchImpl), cache, () => 5_000);

    await port.search("بانادول");
    const offline = await port.search("بانادول");
    expect(offline.kind).toBe("cached");
    if (offline.kind === "cached") expect(offline.cachedAt).toBe(5_000);
  });

  it("fails honestly when there is no cache to fall back to", async () => {
    const s = server([{ status: 503, body: {} }]);
    const port = makeCatalogue(makeHttp("https://api", s.fetchImpl), memoryCache(), () => 5_000);
    expect((await port.search("x")).kind).toBe("failed");
  });
});

describe("the flusher", () => {
  // The delivery lane is module state, so a suite must start from a known one.
  beforeEach(() => resetFlushLane());

  const queued = (): Outbox => enqueue(empty(), {
    id: "o-1", operation: "POST /v1/requests", label: "طلب بانادول",
    payload: { subjectId: "s1" }, idempotencyKey: "key-1", queuedAt: 1_000, subjectId: "s1",
  });

  it("retries a transient failure and lands the item, one accepted state at the end", async () => {
    const s = server([{ status: 503 }, { status: 503 }, { status: 201, body: {} }]);
    const states: string[] = [];
    const out = await flush(queued(), {
      http: makeHttp("https://api", s.fetchImpl),
      random: () => 0, sleep: noSleep,
      onChange: (o) => states.push(o.items[0]!.state),
    });
    expect(out.items[0]?.state).toBe("accepted");
    expect(s.calls.length).toBe(3);
    // Every attempt carried the same key — that is what makes three sends one write.
    expect(new Set(s.calls.map((c) => c.headers["idempotency-key"]))).toEqual(new Set(["key-1"]));
  });

  it("treats a duplicate as success, because the earlier attempt landed", async () => {
    const s = server([{ status: 409 }]);
    const out = await flush(queued(), { http: makeHttp("https://api", s.fetchImpl), random: () => 0, sleep: noSleep, onChange: () => {} });
    // The outbox resolves duplicate to accepted BY DESIGN: the server already
    // has it, and surfacing that as anything but success teaches the user to
    // distrust a screen that is telling the truth.
    expect(out.items[0]?.state).toBe("accepted");
    expect(out.items[0]?.attempts).toBe(1);
  });

  it("exhausts the policy back to QUEUED — visible, never dropped", async () => {
    const s = server(Array.from({ length: 6 }, () => ({ status: 503 })));
    const out = await flush(queued(), {
      http: makeHttp("https://api", s.fetchImpl),
      policy: { maxAttempts: 6, baseDelayMs: 1, maxDelayMs: 2 },
      random: () => 0, sleep: noSleep, onChange: () => {},
    });
    expect(out.items[0]?.state).toBe("queued");
    expect(s.calls.length).toBe(6);
  });

  it("does NOT send an item the user cancelled while an earlier one was in flight", async () => {
    // The defect this replaces: flush threaded a private copy and re-read
    // ITSELF, so a cancel on R13 during a flush moved a label and the request
    // went anyway. The cancel has to happen mid-run, because that is the only
    // moment the two copies can disagree.
    let box = enqueue(empty(), {
      id: "o-1", operation: "POST /v1/requests", label: "أ",
      payload: {}, idempotencyKey: "k-1", queuedAt: 1, subjectId: "s1",
    });
    box = enqueue(box, {
      id: "o-2", operation: "POST /v1/requests", label: "ب",
      payload: {}, idempotencyKey: "k-2", queuedAt: 2, subjectId: "s2",
    });

    let live = box;
    // ONE response scripted. A second call means o-2 was delivered, and the
    // scripted server throws rather than inventing an answer.
    const s = server([{ status: 201, body: {} }]);
    const out = await flush(box, {
      http: makeHttp("https://api", s.fetchImpl),
      random: () => 0, sleep: noSleep,
      onChange: (o) => {
        // The user presses cancel on o-2 while o-1 is being delivered.
        live = cancel(o, "o-2");
      },
      current: () => live,
    });

    expect(s.calls.length, "the cancelled item was delivered anyway").toBe(1);
    expect(out.items.find((i) => i.id === "o-2")?.state).toBe("cancelled");
    expect(out.items.find((i) => i.id === "o-1")?.state).toBe("accepted");
  });

  it("runs one lane: a second flush joins the first rather than double-posting", async () => {
    // Two concurrent flushes both saw an item as queued, both marked it
    // sending, and both POSTed it — the server deduplicated on the key, but
    // the later onChange snapshot dragged the store's outbox backwards.
    let released: () => void = () => {};
    const gate = new Promise<void>((r) => { released = r; });
    let calls = 0;
    const slow: Fetch = async (_u, _i) => { calls += 1; await gate; return { status: 201, text: async () => "{}" }; };

    const a = flush(queued(), { http: makeHttp("https://api", slow), random: () => 0, sleep: noSleep, onChange: () => {} });
    const b = flush(queued(), { http: makeHttp("https://api", slow), random: () => 0, sleep: noSleep, onChange: () => {} });
    released();
    const [ra, rb] = await Promise.all([a, b]);

    expect(calls, "the same item was POSTed twice by concurrent flushes").toBe(1);
    expect(rb).toBe(ra); // the second call joined the first, it did not start a run
  });

  it("never lets one subject's stuck item strand another subject's", async () => {
    let box = enqueue(empty(), {
      id: "o-1", operation: "POST /v1/requests", label: "أ",
      payload: {}, idempotencyKey: "k-1", queuedAt: 1, subjectId: "father",
    });
    box = enqueue(box, {
      id: "o-2", operation: "POST /v1/requests", label: "ب",
      payload: {}, idempotencyKey: "k-2", queuedAt: 2, subjectId: "child",
    });
    // The father's request fails permanently; the child's succeeds.
    const s = server([{ status: 422 }, { status: 201, body: {} }]);
    const out = await flush(box, { http: makeHttp("https://api", s.fetchImpl), random: () => 0, sleep: noSleep, onChange: () => {} });
    expect(out.items.find((i) => i.id === "o-1")?.state).toBe("rejected");
    expect(out.items.find((i) => i.id === "o-2")?.state).toBe("accepted");
  });
});

describe("the full round trip — store to server to store", () => {
  const ports = (fetchImpl: Fetch): Ports => ({
    catalogue: makeCatalogue(makeHttp("https://api", fetchImpl), { read: async () => null, write: async () => {} }, () => 5_000),
    identity: makeIdentity(makeHttp("https://api", fetchImpl)),
    env, deviceId: "dev-1",
    startFlush: () => {}, emit: () => {}, capture: () => {},
  });

  it("E5 to E7 against the declared responses, ending authenticated on the interrupted screen", async () => {
    const s = server([
      { status: 202, body: { challengeId: "ch-1", resendAfter: 45 } },
      { status: 400, body: { attemptsLeft: 4 } },
      { status: 200, body: { account: { accountId: "acc-1" }, subjects: [{ subjectId: "sub-1" }], session: {} } },
    ]);
    const p = ports(s.fetchImpl);

    let state: AppState = initial();
    const go = async (intent: Parameters<typeof dispatch>[1]) => {
      const step = dispatch(state, intent, env, permitted);
      state = step.state;
      for (const e of step.effects) {
        const answer = await perform(e, p);
        if (answer) state = dispatch(state, answer, env, permitted).state;
      }
    };

    await go({ kind: "typePhone", raw: "٠٧٧٠١٢٣٤٥٦٧" }); // Arabic-Indic, as typed
    await go({ kind: "submitPhone" });
    expect(state.onboarding.challenge?.challengeId).toBe("ch-1");
    expect(s.calls[0]?.body).toEqual({ phone: "+9647701234567" });

    await go({ kind: "typeCode", raw: "111111" });
    await go({ kind: "submitCode", at: instant(5_000) });
    expect(state.onboarding.codeRefusal).toBe("WRONG_CODE");
    expect(state.onboarding.challenge?.used).toBe(1); // mirrors the server's 4 left

    await go({ kind: "typeCode", raw: "123456" });
    await go({ kind: "submitCode", at: instant(6_000) });
    expect(state.session.state).toBe("authenticated");
    expect(s.calls[2]?.body).toEqual({ challengeId: "ch-1", code: "123456", deviceId: "dev-1" });
  });
});
