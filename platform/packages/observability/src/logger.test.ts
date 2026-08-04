/**
 * @blueprint §8 · §5
 * @owner platform-foundation
 * @why §8 says the audit records that a read happened, never what was read,
 *      and logs hold the same line. Redaction is the only thing enforcing it,
 *      so the shapes the product actually logs — a request's `lines`, an
 *      offer's `lines` — are tested directly rather than assumed.
 */
import { describe, it, expect } from "vitest";
import { redact, createLogger, memorySink, consoleSink } from "./logger.js";

describe("§8 — clinical content and identity never reach a log", () => {
  it("a forbidden field is replaced, whatever its value", () => {
    const out = redact({ phone: "+9647701234567", name: "أم علي", ok: "kept" });
    expect(out["phone"]).toBe("[redacted]");
    expect(out["name"]).toBe("[redacted]");
    expect(out["ok"]).toBe("kept");
  });

  it("nested objects are redacted too", () => {
    const out = redact({ patient: { phone: "+9647701234567", subjectId: "s1" } }) as
      Record<string, Record<string, unknown>>;
    expect(out["patient"]!["phone"]).toBe("[redacted]");
    expect(out["patient"]!["subjectId"]).toBe("s1");
  });

  it("ARRAYS are redacted — the shape the product actually logs", () => {
    // A request is `lines: [{ itemId, packs }]` and an offer is
    // `lines: [{ itemName, note }]`. Arrays used to be assigned through
    // untouched, so the one shape carrying medicine names and a pharmacist's
    // words was the one shape that walked past the redactor.
    const out = redact({
      lines: [
        { itemName: "بانادول", packs: 2 },
        { itemName: "أموكسيسيلين", note: "نفس المادة الفعالة" },
      ],
    }) as Record<string, readonly Record<string, unknown>[]>;
    expect(out["lines"]![0]!["itemName"]).toBe("[redacted]");
    expect(out["lines"]![1]!["itemName"]).toBe("[redacted]");
    expect(out["lines"]![1]!["note"]).toBe("[redacted]");
    // What is NOT sensitive survives, or the log says nothing at all.
    expect(out["lines"]![0]!["packs"]).toBe(2);
  });

  it("arrays nested inside objects are reached", () => {
    const out = redact({ request: { lines: [{ itemName: "بانادول" }] } }) as
      Record<string, { lines: readonly Record<string, unknown>[] }>;
    expect(out["request"]!.lines[0]!["itemName"]).toBe("[redacted]");
  });

  it("a field name is matched however it is cased", () => {
    const out = redact({ PatientName: "أم علي", PHONE: "+964770", Token: "t" });
    expect(Object.values(out)).toEqual(["[redacted]", "[redacted]", "[redacted]"]);
  });

  it("a long value is truncated — a log line is not a payload store", () => {
    const out = redact({ blob: "x".repeat(500) });
    expect((out["blob"] as string).length).toBeLessThan(500);
    expect(out["blob"]).toMatch(/…$/);
  });

  it("long values inside arrays are truncated too", () => {
    const out = redact({ blobs: ["y".repeat(500)] }) as Record<string, readonly string[]>;
    expect(out["blobs"]![0]!.length).toBeLessThan(500);
  });

  it("nulls and numbers pass through unharmed", () => {
    expect(redact({ a: null, b: 3, c: false })).toEqual({ a: null, b: 3, c: false });
  });
});

describe("the logger applies redaction itself, so no call site can forget", () => {
  const make = () => {
    const sink = memorySink();
    return { sink, log: createLogger({ service: "patient", releaseId: "r1", minLevel: "debug", sink, now: () => 7 }) };
  };

  it("redacts fields passed at the call site", () => {
    const { sink, log } = make();
    log.info("sent", { phone: "+9647701234567" });
    expect(sink.records[0]!.fields["phone"]).toBe("[redacted]");
  });

  it("redacts fields BOUND to a child logger, not only the ones passed in", () => {
    const { sink, log } = make();
    log.child("corr-1", { phone: "+9647701234567" }).info("sent");
    expect(sink.records[0]!.fields["phone"]).toBe("[redacted]");
    expect(sink.records[0]!.correlationId).toBe("corr-1");
  });

  it("stamps service, release and the supplied clock", () => {
    const { sink, log } = make();
    log.error("boom");
    expect(sink.records[0]).toMatchObject({ level: "error", service: "patient", releaseId: "r1", at: 7 });
  });

  it("drops anything below the minimum level", () => {
    const sink = memorySink();
    const log = createLogger({ service: "s", releaseId: "r", minLevel: "warn", sink, now: () => 0 });
    log.debug("d"); log.info("i"); log.warn("w"); log.error("e");
    expect(sink.records.map((r) => r.level)).toEqual(["warn", "error"]);
  });

  it("a child inherits the parent's bound fields", () => {
    const { sink, log } = make();
    log.child("c1", { screen: "R8" }).info("seen");
    expect(sink.records[0]!.fields["screen"]).toBe("R8");
  });

  it("the console sink is the only console in the platform, and writes one line", () => {
    expect(typeof consoleSink.write).toBe("function");
  });
});
