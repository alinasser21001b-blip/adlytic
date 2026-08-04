/**
 * @blueprint §21 · D27 · R13
 * @owner platform-foundation
 * @why Two rules carry the weight: a queued request is never shown as sent,
 *      and a replay lands exactly once. A duplicate reservation would be a
 *      clinical defect, so both get direct tests.
 */
import { describe, it, expect } from "vitest";
import { empty, enqueue, readyToSend, markSending, markAccepted, markDuplicate, markRejected, requeue, cancel, prune, pendingCount, describe as describeItem, type Outbox, type OutboxState } from "./index.js";

const item = (id: string, subjectId: string, key: string, at: number) => ({
  id, operation: "createRequest", label: "طلب دواء", payload: {},
  idempotencyKey: key, queuedAt: at, subjectId,
});

describe("D27 — a queued request is never presented as sent", () => {
  it("every non-accepted state describes itself as not yet sent", () => {
    const o = enqueue(empty(), item("1", "s1", "k1", 1));
    expect(describeItem(o.items[0]!)).toBe("بانتظار الاتصال");
    expect(describeItem(markSending(o, "1").items[0]!)).toBe("قيد الإرسال");
    expect(describeItem(markRejected(o, "1", "x").items[0]!)).toMatch(/ما وصل/);
  });
});

describe("exactly once", () => {
  it("a repeated idempotency key does not create a second item", () => {
    let o = enqueue(empty(), item("1", "s1", "k1", 1));
    o = enqueue(o, item("2", "s1", "k1", 2));
    expect(o.items.length).toBe(1);
  });
  it("a duplicate response resolves to accepted, never to an error", () => {
    let o = enqueue(empty(), item("1", "s1", "k1", 1));
    o = markDuplicate(o, "1");
    expect(o.items[0]!.state).toBe("accepted");
  });
});

describe("ordering — one subject's writes cannot overtake each other", () => {
  it("sends only the oldest queued item per subject", () => {
    let o = enqueue(empty(), item("1", "s1", "k1", 1));
    o = enqueue(o, item("2", "s1", "k2", 2));
    o = enqueue(o, item("3", "s2", "k3", 3));
    const ready = readyToSend(o).map((i) => i.id).sort();
    expect(ready).toEqual(["1", "3"]);
  });
  it("a subject with an item in flight waits", () => {
    let o = enqueue(empty(), item("1", "s1", "k1", 1));
    o = enqueue(o, item("2", "s1", "k2", 2));
    o = markSending(o, "1");
    expect(readyToSend(o)).toEqual([]);
  });
  it("an unrelated subject is not blocked", () => {
    let o = enqueue(empty(), item("1", "s1", "k1", 1));
    o = enqueue(o, item("2", "s2", "k2", 2));
    o = markSending(o, "1");
    expect(readyToSend(o).map((i) => i.id)).toEqual(["2"]);
  });
});

describe("R13 — the user can cancel before it sends, and not after", () => {
  it("cancels a queued item", () => {
    const o = cancel(enqueue(empty(), item("1", "s1", "k1", 1)), "1");
    expect(o.items[0]!.state).toBe("cancelled");
  });
  it("refuses to cancel one already in flight", () => {
    let o = markSending(enqueue(empty(), item("1", "s1", "k1", 1)), "1");
    expect(cancel(o, "1").items[0]!.state).toBe("sending");
  });
});

describe("nothing is dropped silently", () => {
  it("a rejected item stays visible and can be requeued", () => {
    let o = markRejected(markSending(enqueue(empty(), item("1", "s1", "k1", 1)), "1"), "1", "500");
    expect(pendingCount(o)).toBe(1);
    o = requeue(o, "1");
    expect(o.items[0]!.state).toBe("queued");
  });
  it("prune removes only settled work", () => {
    let o = enqueue(empty(), item("1", "s1", "k1", 1));
    o = enqueue(o, item("2", "s2", "k2", 2));
    o = markAccepted(o, "1");
    expect(prune(o).items.map((i) => i.id)).toEqual(["2"]);
  });
});

describe("every state an item can reach is accounted for", () => {
  const seed = () => enqueue(empty(), {
    id: "i1", operation: "POST /v1/requests", label: "طلب", payload: {},
    idempotencyKey: "k1", queuedAt: 0, subjectId: "s1",
  });
  const stateOf = (o: Outbox): OutboxState => o.items[0]!.state;

  it("a duplicate resolves to accepted — the server has it, which is success", () => {
    expect(stateOf(markDuplicate(markSending(seed(), "i1"), "i1"))).toBe("accepted");
  });

  /** Every state the PUBLIC API can actually put an item in, driven rather
   *  than listed — a list beside the type goes stale the first time the type
   *  changes, which is how "duplicate" survived in the union after
   *  markDuplicate stopped producing it. */
  const reachable = (): ReadonlySet<OutboxState> => {
    const sending = markSending(seed(), "i1");
    return new Set<OutboxState>([
      stateOf(seed()),
      stateOf(sending),
      stateOf(markAccepted(sending, "i1")),
      stateOf(markDuplicate(sending, "i1")),
      stateOf(markRejected(sending, "i1", "boom")),
      stateOf(requeue(markRejected(sending, "i1", "boom"), "i1")),
      stateOf(cancel(seed(), "i1")),
    ]);
  };

  it("each one is either pruned or counted — nothing can sit in the outbox invisible", () => {
    // A state that prune does not remove and pendingCount does not count is an
    // item that stays forever and appears nowhere.
    for (const state of reachable()) {
      const o: Outbox = { items: [{ ...seed().items[0]!, state }] };
      const pruned = prune(o).items.length === 0;
      const counted = pendingCount(o) === 1;
      expect(pruned || counted, `${state} is neither pruned nor counted`).toBe(true);
    }
  });

  it("each one has wording a screen can show (D27)", () => {
    for (const state of reachable())
      expect(describeItem({ ...seed().items[0]!, state }), state).toBeTruthy();
  });
});
