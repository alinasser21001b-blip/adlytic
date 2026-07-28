import { describe, expect, it } from "vitest";
import { getMedicine } from "../data/medicines";
import {
  buildScenarioTimeline,
  DEMO_SCENARIOS,
  getScenario,
} from "./scenarios";

function timeline(scenarioId: Parameters<typeof getScenario>[0], canonicalId: string) {
  const medicine = getMedicine(canonicalId);
  expect(medicine).toBeDefined();
  if (!medicine) throw new Error("fixture missing");

  return buildScenarioTimeline({
    scenario: getScenario(scenarioId),
    requestId: "request-demo-123456",
    medicine,
    startedAt: "2026-07-28T10:00:00.000Z",
    auditId: "audit-demo",
  });
}

describe("demo event source", () => {
  it("exposes every approved selectable scenario", () => {
    expect(DEMO_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "success",
      "otc",
      "rx",
      "controlled",
      "ambiguous",
      "gudea-unavailable",
      "decline",
      "timeout",
    ]);
  });

  it("never creates public radar events for the controlled handoff", () => {
    expect(timeline("controlled", "IQ-MED-DIA-5-TAB-20")).toEqual([]);
  });

  it("emits timeout and all-declined outcomes as events rather than inferred time", () => {
    expect(
      timeline("timeout", "IQ-MED-SAL-100-INH-200").at(-1)?.event.type,
    ).toBe("RequestTimedOut");
    expect(
      timeline("decline", "IQ-MED-CET-10-TAB-20").filter(
        (item) => item.event.type === "PharmacyDeclined",
      ),
    ).toHaveLength(2);
  });

  it("puts prescription audit access before RX matching and hold activation", () => {
    const events = timeline("rx", "IQ-MED-AMX-500-CAP-20").map(
      (item) => item.event.type,
    );

    expect(events.indexOf("PrescriptionAccessGranted")).toBeLessThan(
      events.indexOf("PrescriptionMatched"),
    );
    expect(events.indexOf("PrescriptionMatched")).toBeLessThan(
      events.indexOf("HoldActivated"),
    );
  });
});

