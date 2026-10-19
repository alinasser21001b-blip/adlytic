import { describe, expect, inject, it } from "vitest";
import { Client, d1, login } from "../support/client";
import { urlOf } from "../support/instances";

// Re-check: a new check compared, on the server and without another provider call,
// with an earlier report the same owner holds — never with anyone else's.
const ACC = urlOf("accounts");
const DIR = () => inject("d1Dirs").accounts!;

describe("re-check", () => {
  it("compares with the owner's earlier report: the CTA fix is applied, no extra provider call", async () => {
    const c = new Client(ACC);
    await login(c, "sub-recheck-owner");
    const first = await c.check({ adCopy: "كنبة مخمل زيتوني" });
    expect(first.status).toBe(200);
    expect(first.body.fixes[0].dimension).toBe("cta");

    const again = await c.check({ adCopy: "كنبة مخمل زيتوني. راسلنا على الخاص [[MOCK:cta_fixed]]", parentId: first.body.id });
    expect(again.status).toBe(200);
    const r = again.body.recheck;
    expect(r).toMatchObject({ parentId: first.body.id, parentCreatedAt: first.body.createdAt, copyChanged: true });
    expect(r.fixes).toEqual([expect.objectContaining({ dimension: "cta", outcome: "applied", change: first.body.fixes[0].change })]);
    expect(r.dimensions.find((d: { dimension: string }) => d.dimension === "cta")).toMatchObject({ before: "needs_improvement", after: "strong", change: "improved" });
    expect(r.dimensions.find((d: { dimension: string }) => d.dimension === "offer_clarity").change).toBe("same");
    expect(r.summaryAr).toContain("الإصلاحات المطبّقة: ١ من ١");
    const [row] = d1(DIR(), `SELECT provider_calls, parent_id FROM analyses WHERE id = '${again.body.id}'`);
    expect(row).toEqual({ provider_calls: 1, parent_id: first.body.id });
    // Stored with the report: reopening it shows the same comparison.
    expect((await c.req("GET", `/api/reports/${again.body.id}`)).body.report.recheck).toEqual(r);
  });

  it("a fix not yet applied is reported as such", async () => {
    const c = new Client(ACC);
    await login(c, "sub-recheck-notyet");
    const first = await c.check({ adCopy: "كنبة مخمل" });
    const again = await c.check({ adCopy: "كنبة مخمل", parentId: first.body.id });
    expect(again.body.recheck.fixes[0].outcome).toBe("not_yet");
    expect(again.body.recheck.copyChanged).toBe(false);
  });

  it("another owner's report is never used and nothing of it leaks", async () => {
    const a = new Client(ACC);
    await login(a, "sub-recheck-a");
    const mine = await a.check({ adCopy: "عطر عود ملكي سري" });
    const b = new Client(ACC);
    await login(b, "sub-recheck-b");
    const theirs = await b.check({ adCopy: "ساعة رجالية", parentId: mine.body.id });
    expect(theirs.status).toBe(200);
    expect(theirs.body.recheck).toBeUndefined();
    expect(JSON.stringify(theirs.body)).not.toContain("عطر عود ملكي سري");
    expect(d1(DIR(), `SELECT parent_id FROM analyses WHERE id = '${theirs.body.id}'`)).toEqual([{ parent_id: null }]);
  });

  it("a malformed parent id is refused before anything is spent", async () => {
    const c = new Client(ACC);
    await login(c, "sub-recheck-bad");
    const before = (await c.req("GET", "/api/balance")).body.freeAvailable;
    const r = await c.check({ adCopy: "كنبة", parentId: "../../etc/passwd" });
    expect(r.status).toBe(400);
    expect((await c.req("GET", "/api/balance")).body.freeAvailable).toBe(before);
  });

  it("the public share page never shows the comparison", async () => {
    const c = new Client(ACC);
    await login(c, "sub-recheck-share");
    const first = await c.check({ adCopy: "كنبة مخمل" });
    const again = await c.check({ adCopy: "كنبة مخمل. راسلنا على الخاص [[MOCK:cta_fixed]]", parentId: first.body.id });
    const share = await c.req("POST", `/api/reports/${again.body.id}/share`);
    const html = await (await fetch(share.body.url)).text();
    expect(html).not.toContain("الإصلاحات المطبّقة");
    expect(html).not.toContain(first.body.fixes[0].change);
  });
});
