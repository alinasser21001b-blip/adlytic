// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  haversineDistanceKm,
  isBranchOpen,
  MATCH_WEIGHTS,
  scoreCandidate,
} from "../services/matching";

describe("matching engine contract", () => {
  it("exposes blueprint-aligned configurable weights", () => {
    expect(MATCH_WEIGHTS.distance).toBeCloseTo(0.28);
    expect(MATCH_WEIGHTS.recentExactAvailability).toBeCloseTo(0.22);
    expect(MATCH_WEIGHTS.responseProbability).toBeCloseTo(0.17);
    expect(MATCH_WEIGHTS.fulfillmentReliability).toBeCloseTo(0.13);
    expect(MATCH_WEIGHTS.openWindowFit).toBeCloseTo(0.1);
    expect(MATCH_WEIGHTS.serviceFit).toBeCloseTo(0.06);
    expect(MATCH_WEIGHTS.workloadBalance).toBeCloseTo(0.04);
  });

  it("computes Baghdad-scale distances", () => {
    const km = haversineDistanceKm(33.3152, 44.3661, 33.32, 44.37);
    expect(km).toBeGreaterThan(0.4);
    expect(km).toBeLessThan(1.2);
  });

  it("respects opening hours in Asia/Baghdad", () => {
    const open = isBranchOpen(
      { "0": [["00:00", "23:59"]], "1": [["00:00", "23:59"]], "2": [["00:00", "23:59"]], "3": [["00:00", "23:59"]], "4": [["00:00", "23:59"]], "5": [["00:00", "23:59"]], "6": [["00:00", "23:59"]] },
      "Asia/Baghdad",
    );
    expect(open).toBe(true);
    const closed = isBranchOpen({ "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] }, "Asia/Baghdad");
    expect(closed).toBe(false);
  });

  it("ranks nearer reliable branches higher and marks organic ranking", () => {
    const request = {
      id: "r1",
      medicine_name: "Augmentin",
      latitude: 33.3152,
      longitude: 44.3661,
      radius_km: 2,
      pickup_preferred: true,
      delivery_preferred: false,
    };
    const near = scoreCandidate(request, {
      id: "b1",
      owner_user_id: "u1",
      latitude: 33.316,
      longitude: 44.367,
      opening_hours: {},
      timezone: "Asia/Baghdad",
      pickup_enabled: true,
      delivery_enabled: false,
      response_rate: 0.9,
      average_response_seconds: 60,
      successful_reservations: 10,
      completed_requests: 10,
      confirmed_not_found: 0,
      recent_exact_score: 0.8,
      open_dispatches: 1,
      spam_ignored: 0,
    });
    const far = scoreCandidate(request, {
      id: "b2",
      owner_user_id: "u2",
      latitude: 33.325,
      longitude: 44.375,
      opening_hours: {},
      timezone: "Asia/Baghdad",
      pickup_enabled: true,
      delivery_enabled: false,
      response_rate: 0.4,
      average_response_seconds: 600,
      successful_reservations: 2,
      completed_requests: 2,
      confirmed_not_found: 2,
      recent_exact_score: 0,
      open_dispatches: 6,
      spam_ignored: 3,
    });
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!.score).toBeGreaterThan(far!.score);
    expect(near!.reasons).toContain("organic");
  });
});

import { describe as d2, expect as e2, it as i2 } from "vitest";
// concurrency covered in core-flow selection; keep ranking weights locked
