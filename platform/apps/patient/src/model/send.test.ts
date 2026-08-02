import { describe, expect, it } from "vitest";
import { instant } from "@dawai/domain";
import { empty, describe as describeItem, readyToSend } from "@dawai/offline";
import * as Draft from "./draft.js";
import { send, remaining, describeRequest, delivered } from "./send.js";
import type { CatalogueHit, Environment } from "../ports.js";

const hit = (id: string, name: string, over: Partial<CatalogueHit> = {}): CatalogueHit => ({
  itemId: id, name, latinName: id, form: "أقراص", strength: "500 ملغم",
  requestable: true, requiresPrescription: false, isControlled: false, ...over,
});

const env = (online: boolean): Environment => {
  let n = 0;
  return { now: () => 1_000, newId: () => `id-${(n += 1)}`, online: () => online };
};

const draftWith = (...names: readonly string[]) => {
  let d = Draft.newDraft("subject-1", "district-1");
  names.forEach((name, i) => { d = Draft.add(d, hit(`i${i}`, name)).draft; });
  return d;
};

const AT = instant(1_000);

describe("sending while the connection is there", () => {
  it("broadcasts, and the window starts from the urgency the patient chose (D09)", () => {
    const d = Draft.setUrgency(draftWith("بانادول"), "now");
    const r = send(d, empty(), env(true), AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sent.state).toBe("broadcast");
    expect(r.sent.windowEndsAt).toBe(AT + 20 * 60_000);
  });
});

describe("sending while offline (D27)", () => {
  const offline = () => send(draftWith("بانادول"), empty(), env(false), AT);

  it("queues — and the state is 'queued', which is not 'sent'", () => {
    const r = offline();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sent.state).toBe("queued");
  });

  it("shows no countdown, because nobody has been asked yet", () => {
    const r = offline();
    if (!r.ok) return;
    expect(r.sent.windowEndsAt).toBeNull();
    expect(remaining(r.sent.windowEndsAt, "now", AT)).toBeNull();
  });

  it("the only words available for it say it has not been sent", () => {
    const r = offline();
    if (!r.ok) return;
    const item = r.sent.outbox.items[0]!;
    expect(item.state).toBe("queued");
    expect(describeItem(item)).toBe("بانتظار الاتصال");
  });

  it("still goes through the outbox, so there is one delivery path and not two", () => {
    const online = send(draftWith("بانادول"), empty(), env(true), AT);
    if (!online.ok) return;
    expect(online.sent.outbox.items).toHaveLength(1);
    expect(readyToSend(online.sent.outbox)).toHaveLength(1);
  });

  it("carries a stable idempotency key, which is what makes the replay exactly-once", () => {
    const r = offline();
    if (!r.ok) return;
    expect(r.sent.outbox.items[0]!.idempotencyKey).toBe(r.sent.idempotencyKey);
  });
});

describe("what the patient reads in the pending list", () => {
  it("names the medicine, because a list of four 'طلب' tells nobody anything", () => {
    expect(describeRequest(draftWith("بانادول"))).toBe("طلب بانادول");
    expect(describeRequest(draftWith("بانادول", "أموكسيسيلين"))).toBe("طلب بانادول و1 غيره");
  });
});

describe("refusing to send", () => {
  it("an empty draft never reaches the outbox", () => {
    const r = send(Draft.newDraft("s", "d"), empty(), env(true), AT);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.code).toBe("NO_LINES");
  });

  it("a prescription line without its photo never reaches the outbox (D18)", () => {
    let d = Draft.newDraft("s", "d");
    d = Draft.add(d, hit("rx", "أموكسيسيلين", { requiresPrescription: true })).draft;
    const r = send(d, empty(), env(true), AT);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.code).toBe("PRESCRIPTION_REQUIRED");
  });
});

describe("the connection returning", () => {
  it("moves a queued request to broadcast and starts the window then", () => {
    const later = instant(5_000);
    expect(delivered("queued", "today", later)).toEqual({
      state: "broadcast", windowEndsAt: later + 4 * 60 * 60_000,
    });
  });

  it("refuses a transition the published machine does not contain (Rule 5)", () => {
    expect(delivered("closed", "today", AT)).toBeNull();
  });
});

describe("the countdown", () => {
  it("never goes below zero, and reads as a fraction of the window the patient chose", () => {
    const end = instant(AT + 20 * 60_000);
    expect(remaining(end, "now", AT)).toEqual({ ms: 20 * 60_000, fraction: 1 });
    expect(remaining(end, "now", instant(AT + 10 * 60_000))!.fraction).toBeCloseTo(0.5);
    expect(remaining(end, "now", instant(AT + 99 * 60_000))).toEqual({ ms: 0, fraction: 0 });
  });
});
