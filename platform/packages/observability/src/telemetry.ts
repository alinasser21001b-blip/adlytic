/**
 * Telemetry — the closed set of business actions worth emitting.
 *
 * @blueprint §3 · §8 · O12 · O13 · O14 · O15
 * @owner platform-foundation
 * @why Blueprint v3 §3 defines four exit criteria for Phase 0 and puts the
 *      screens that measure them INSIDE Phase 0. Those measurements need
 *      events, and the set is closed so that a metric can never be computed
 *      from an ad-hoc counter somebody added in a controller.
 * @implements observability/telemetry
 */

/**
 * Every business action the platform emits. Closed on purpose: adding one is a
 * deliberate act with a Blueprint reference, not a line in a handler.
 */
export const BUSINESS_EVENT = {
  /** Feeds O12 fill rate — the first Phase 0 exit criterion. */
  REQUEST_BROADCAST: "request.broadcast",
  OFFER_SENT: "offer.sent",
  /** Feeds O14 answer time — median under 15 seconds. */
  REQUEST_ANSWERED: "request.answered",
  REQUEST_UNANSWERED: "request.unanswered",
  /** Feeds O13 honoured rate — the trust metric. */
  RESERVATION_CONFIRMED: "reservation.confirmed",
  RESERVATION_REFUSED: "reservation.refused",
  RESERVATION_COLLECTED: "reservation.collected",
  RESERVATION_EXPIRED: "reservation.expired",
  /** Feeds O15 repeat rate — the gate that tests the strategy's riskiest
   *  belief before Phase 2 is built on it. */
  DISPENSE_RECORDED: "dispense.recorded",
  /** Feeds the branch eligibility panel and coverage. */
  BRANCH_EXCLUDED_FROM_ROUTING: "branch.excluded",
  CLINICAL_GATE_REFUSED: "clinical.gate.refused",
  SEARCH_UNMATCHED: "search.unmatched",
} as const;

export type BusinessEvent = (typeof BUSINESS_EVENT)[keyof typeof BUSINESS_EVENT];

export type TelemetryAttributes = Readonly<Record<string, string | number | boolean>>;

export type TelemetryRecord = {
  readonly event: BusinessEvent;
  readonly at: number;
  readonly correlationId: string;
  /** Attributes are dimensions, never content. A district id is a dimension;
   *  a medicine name is content and does not belong here. */
  readonly attributes: TelemetryAttributes;
};

export interface TelemetrySink { emit(record: TelemetryRecord): void; }

export function createTelemetry(sink: TelemetrySink, now: () => number) {
  return {
    emit(event: BusinessEvent, correlationId: string, attributes: TelemetryAttributes = {}): void {
      sink.emit({ event, at: now(), correlationId, attributes });
    },
  };
}

export const memoryTelemetry = (): TelemetrySink & { records: TelemetryRecord[] } => {
  const records: TelemetryRecord[] = [];
  return { records, emit: (r) => { records.push(r); } };
};
