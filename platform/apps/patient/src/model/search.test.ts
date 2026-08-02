import { describe, expect, it } from "vitest";
import * as Search from "./search.js";
import type { CatalogueHit, Fetched, SearchResponse } from "../ports.js";

const hit = (over: Partial<CatalogueHit> = {}): CatalogueHit => ({
  itemId: "i1", name: "باراسيتامول", latinName: "Paracetamol",
  form: "أقراص", strength: "500 ملغم",
  requestable: true, requiresPrescription: false, isControlled: false, ...over,
});

const fresh = (hits: readonly CatalogueHit[]): Fetched<SearchResponse> =>
  ({ kind: "fresh", value: { hits, at: 1_000 } });

describe("normalising what people actually type", () => {
  it("folds the six ways one medicine gets typed onto one query", () => {
    const forms = ["أدول", "إدول", "آدول", "ادول", "ا دول", "ادول "];
    expect(new Set(forms.map(Search.normaliseQuery)).size).toBeLessThanOrEqual(2);
    expect(Search.normaliseQuery("أدول")).toBe(Search.normaliseQuery("ادول"));
  });

  it("strips tatweel, which is decoration and never part of a name", () => {
    expect(Search.normaliseQuery("بانــــادول")).toBe("بانادول");
  });

  it("accepts either numeral system, because both appear on Iraqi keyboards", () => {
    expect(Search.normaliseQuery("٥٠٠")).toBe("500");
    expect(Search.normaliseQuery("۵۰۰")).toBe("500");
  });

  it("leaves a Latin name alone — it is what is printed on the box", () => {
    expect(Search.normaliseQuery("Paracetamol 500")).toBe("Paracetamol 500");
  });
});

describe("the search state machine", () => {
  it("an emptied box returns to the teaching state, it does not search for nothing", () => {
    expect(Search.typed("   ").kind).toBe("idle");
    expect(Search.typed("بانادول")).toEqual({ kind: "loading", query: "بانادول" });
  });

  it("a late response for a previous query is dropped", () => {
    const loading = Search.typed("بانادول");
    const stale = Search.resolved(loading, "ادول", fresh([hit()]));
    expect(stale).toBe(loading);
  });

  it("no rows is empty, not error — the catalogue is incomplete, not the patient wrong", () => {
    const s = Search.resolved(Search.typed("زيبرا"), "زيبرا", fresh([]));
    expect(s.kind).toBe("empty");
  });

  it("cached rows are offline with an age, never presented as live", () => {
    const s = Search.resolved(Search.typed("ادول"), "ادول", {
      kind: "cached", value: { hits: [hit()], at: 500 }, cachedAt: 500,
    });
    expect(s).toMatchObject({ kind: "offline", cachedAt: 500 });
    expect(Search.isStale(s)).toBe(true);
  });

  it("a transport failure carries its reason and is not an empty catalogue", () => {
    const s = Search.resolved(Search.typed("ادول"), "ادول", {
      kind: "failed", outcome: { kind: "transient", reason: "status 503" },
    });
    expect(s).toEqual({ kind: "error", query: "ادول", reason: "status 503" });
    expect(Search.shouldReportUnmatched(s)).toBe(false);
  });

  it("only a genuine miss grows the catalogue", () => {
    expect(Search.shouldReportUnmatched(Search.resolved(Search.typed("x"), "x", fresh([])))).toBe(true);
    expect(Search.shouldReportUnmatched(Search.resolved(Search.typed("x"), "x", fresh([hit()])))).toBe(false);
  });
});

describe("availability is the domain's answer, not the list's opinion", () => {
  it("a controlled item is refused at the row, before the tap (D42)", () => {
    expect(Search.availability(hit({ isControlled: true })))
      .toEqual({ requestable: false, refusal: "CONTROLLED_NOT_SUPPORTED" });
  });

  it("a non-requestable item is refused with its own reason", () => {
    expect(Search.availability(hit({ requestable: false })))
      .toEqual({ requestable: false, refusal: "ITEM_NOT_REQUESTABLE" });
  });

  it("a prescription item is requestable and says so — refusing it here would be wrong", () => {
    expect(Search.availability(hit({ requiresPrescription: true })))
      .toEqual({ requestable: true, needsPrescription: true });
  });
});
