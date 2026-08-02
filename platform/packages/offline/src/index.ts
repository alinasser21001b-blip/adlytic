/**
 * @dawai/offline — the outbox.
 *
 * @blueprint §21 · D27 · §6 Session & outbox · R13
 * @owner platform-foundation
 * @why Iraqi mobile data drops routinely, so offline is a normal state rather
 *      than an error. Two rules carry the weight: a queued request is NEVER
 *      presented as sent, and a replay after reconnection must land exactly
 *      once. A duplicate reservation or a duplicate dispense record would be a
 *      clinical defect, not an inconvenience.
 * @implements offline/outbox
 */

export type OutboxState = "queued" | "sending" | "accepted" | "duplicate" | "rejected" | "cancelled";

export type OutboxItem = {
  readonly id: string;
  /** The operation, in domain terms. Shown on R13 so the user reads what is
   *  waiting rather than a route. */
  readonly operation: string;
  readonly label: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Client-generated and stable across every retry. This is what makes the
   *  replay exactly-once. */
  readonly idempotencyKey: string;
  readonly queuedAt: number;
  readonly state: OutboxState;
  readonly attempts: number;
  readonly lastError?: string;
  /** Ordering key. The outbox is ordered PER SUBJECT so one subject's writes
   *  cannot overtake each other, while unrelated subjects do not block. */
  readonly subjectId: string;
};

export type Outbox = { readonly items: readonly OutboxItem[] };

export const empty = (): Outbox => ({ items: [] });

export function enqueue(o: Outbox, item: Omit<OutboxItem, "state" | "attempts">): Outbox {
  // A repeated key is the same intent, not a second one — a double tap on a
  // slow connection must not create two requests.
  if (o.items.some((i) => i.idempotencyKey === item.idempotencyKey)) return o;
  return { items: [...o.items, { ...item, state: "queued", attempts: 0 }] };
}

/**
 * What may be sent now: the oldest queued item per subject, and no more.
 * Sending two writes for one subject concurrently is how a schedule change
 * overtakes the thing it applies to.
 */
export function readyToSend(o: Outbox): readonly OutboxItem[] {
  const bySubject = new Map<string, OutboxItem>();
  for (const i of o.items) {
    if (i.state !== "queued") continue;
    const held = bySubject.get(i.subjectId);
    if (!held || i.queuedAt < held.queuedAt) bySubject.set(i.subjectId, i);
  }
  // A subject with an in-flight item waits.
  for (const i of o.items) if (i.state === "sending") bySubject.delete(i.subjectId);
  return [...bySubject.values()];
}

const patch = (o: Outbox, id: string, f: (i: OutboxItem) => OutboxItem): Outbox =>
  ({ items: o.items.map((i) => (i.id === id ? f(i) : i)) });

export const markSending = (o: Outbox, id: string): Outbox =>
  patch(o, id, (i) => ({ ...i, state: "sending", attempts: i.attempts + 1 }));

export const markAccepted = (o: Outbox, id: string): Outbox =>
  patch(o, id, (i) => ({ ...i, state: "accepted" }));

/** A duplicate resolves to accepted, never to an error. The server already has
 *  it, which is success — surfacing it as a failure teaches the user to
 *  distrust a screen that is telling the truth. */
export const markDuplicate = (o: Outbox, id: string): Outbox =>
  patch(o, id, (i) => ({ ...i, state: "accepted" }));

export const markRejected = (o: Outbox, id: string, error: string): Outbox =>
  patch(o, id, (i) => ({ ...i, state: "rejected", lastError: error }));

export const requeue = (o: Outbox, id: string): Outbox =>
  patch(o, id, (i) => ({ ...i, state: "queued" }));

/** The user may cancel before it sends — R13's only action. */
export function cancel(o: Outbox, id: string): Outbox {
  const item = o.items.find((i) => i.id === id);
  if (!item || item.state === "sending" || item.state === "accepted") return o;
  return patch(o, id, (i) => ({ ...i, state: "cancelled" }));
}

/** Accepted and cancelled items leave; everything else stays visible, because
 *  D27 requires pending work to be visible rather than silently queued. */
export const prune = (o: Outbox): Outbox =>
  ({ items: o.items.filter((i) => i.state !== "accepted" && i.state !== "cancelled") });

export const pendingCount = (o: Outbox): number =>
  o.items.filter((i) => i.state === "queued" || i.state === "sending" || i.state === "rejected").length;

/**
 * D27 — a queued request is never presented as sent. This is the only function
 * a screen may use to describe an item, so no screen can invent a friendlier
 * word for "not yet sent".
 */
export function describe(i: OutboxItem): string {
  switch (i.state) {
    case "queued": return "بانتظار الاتصال";
    case "sending": return "قيد الإرسال";
    case "rejected": return "ما وصل — تكدر تعيد المحاولة";
    case "cancelled": return "ملغى";
    case "accepted": return "تم الإرسال";
    case "duplicate": return "تم الإرسال";
  }
}
