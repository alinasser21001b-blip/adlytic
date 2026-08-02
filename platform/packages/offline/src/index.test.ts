/**
 * @blueprint §21 · D27 · R13
 * @owner platform-foundation
 * @why Two rules carry the weight: a queued request is never shown as sent,
 *      and a replay lands exactly once. A duplicate reservation would be a
 *      clinical defect, so both get direct tests.
 */
import { describe, it, expect } from "vitest";
import { empty, enqueue, readyToSend, markSending, markAccepted, markDuplicate, markRejected, requeue, cancel, prune, pendingCount, describe as describeItem } from "./index.js";

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
