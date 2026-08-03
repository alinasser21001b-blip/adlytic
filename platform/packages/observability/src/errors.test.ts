/**
 * @blueprint §8 · §5 rule 3 · §23
 * @owner platform-foundation
 * @why "Every failure must produce actionable logs" and §8's "record that it
 *      happened, never what it was" pull in opposite directions, and this
 *      module is where they meet. Both halves are tested: a report carries
 *      what failed and whether the work survived, and it carries no patient
 *      content on either the log path or the sink path.
 */
import { describe, it, expect } from "vitest";
import { createErrorReporter, memoryErrorSink } from "./errors.js";
import { createLogger, memorySink } from "./logger.js";

const make = () => {
  const sink = memorySink();
  const errors = memoryErrorSink();
  const log = createLogger({ service: "patient", releaseId: "r1", minLevel: "debug", sink, now: () => 1 });
  return { sink, errors, report: createErrorReporter(errors, log) };
};

describe("a refusal is expected, and is not an error", () => {
  it("goes to the log at info and never to the error sink", () => {
    // Reporting refusals as errors trains the team to ignore errors, which is
    // how a real one gets missed.
    const { sink, errors, report } = make();
    report.refusal("acceptOffer", "OFFER_WITHDRAWN", "c1");
    expect(sink.records[0]!.level).toBe("info");
    // Under `refusalCode`, not `code`: the latter means a patient's pickup
    // code and is redacted, which erased the one field that makes a refusal
    // diagnosable.
    expect(sink.records[0]!.fields["refusalCode"]).toBe("OFFER_WITHDRAWN");
    expect(errors.reports).toHaveLength(0);
  });
});

describe("§23 — a report answers what failed, and whether the work survived", () => {
  it("an unexpected failure reaches both the log and the sink", () => {
    const { sink, errors, report } = make();
    report.unexpected({ operation: "sendRequest", workPreserved: true, correlationId: "c1", cause: new Error("socket closed") });
    expect(sink.records[0]!.level).toBe("error");
    expect(sink.records[0]!.fields["workPreserved"]).toBe(true);
    expect(sink.records[0]!.fields["cause"]).toBe("socket closed");
    expect(errors.reports[0]).toMatchObject({ severity: "unexpected", operation: "sendRequest", workPreserved: true });
  });

  it("critical is reported as critical, not as one more error", () => {
    const { errors, report } = make();
    report.critical({ operation: "reserve", workPreserved: false, correlationId: "c2", cause: "no response" });
    expect(errors.reports[0]!.severity).toBe("critical");
  });

  it("a non-Error cause is still stated rather than dropped", () => {
    const { sink, report } = make();
    report.unexpected({ operation: "x", workPreserved: false, correlationId: "c3", cause: 42 });
    expect(sink.records[0]!.fields["cause"]).toBe("42");
  });
});

describe("§8 — a failure report carries no patient content, by either path", () => {
  it("context is redacted in the log", () => {
    const { sink, report } = make();
    report.unexpected({
      operation: "sendRequest", workPreserved: true, correlationId: "c1", cause: new Error("x"),
      context: { phone: "+9647701234567", subjectId: "s1" },
    });
    expect(sink.records[0]!.fields["phone"]).toBe("[redacted]");
    expect(sink.records[0]!.fields["subjectId"]).toBe("s1");
  });

  it("context is redacted in the SINK too — the path that leaves the device", () => {
    // These were the identical fields, redacted on the way to the log and raw
    // on the way to the crash reporter.
    const { errors, report } = make();
    report.unexpected({
      operation: "sendRequest", workPreserved: true, correlationId: "c1", cause: new Error("x"),
      context: { phone: "+9647701234567", lines: [{ itemName: "بانادول" }] },
    });
    const ctx = errors.reports[0]!.context as Record<string, unknown>;
    expect(ctx["phone"]).toBe("[redacted]");
    expect((ctx["lines"] as readonly Record<string, unknown>[])[0]!["itemName"]).toBe("[redacted]");
  });

  it("a report with no context stays without one", () => {
    const { errors, report } = make();
    report.critical({ operation: "x", workPreserved: false, correlationId: "c1", cause: "y" });
    expect(errors.reports[0]!.context).toBeUndefined();
  });
});

describe("a pickup code is still never logged", () => {
  it("the reservation code stays redacted — the rename did not widen anything", () => {
    const { sink, report } = make();
    report.refusal("verify", "WRONG_CODE", "c1", { code: "4KD2P9" });
    expect(sink.records[0]!.fields["code"]).toBe("[redacted]");
    expect(sink.records[0]!.fields["refusalCode"]).toBe("WRONG_CODE");
  });
});
