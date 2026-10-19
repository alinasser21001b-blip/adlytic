import { describe, expect, inject, it } from "vitest";
import { Client, d1, login } from "../support/client";
import { urlOf } from "../support/instances";

// Production analysis settings through the real Worker: the rule base cached, a short
// second rating averaged into the shown index, cache usage recorded per check.
const IDX = urlOf("indexed");
const DIR = () => inject("d1Dirs").indexed!;

describe("shown index from two ratings, with prompt caching", () => {
  it("each check makes the report call plus one levels-only call; the index averages both", async () => {
    const c = new Client(IDX);
    await login(c, "sub-index-1");
    const r = await c.check({ adCopy: "كنبة مخمل زيتوني" });
    expect(r.status).toBe(200);
    expect(r.body.index).toMatchObject({ shown: true, samples: 2 });
    // Report verdicts keep the report's own level; the second rating (cta one higher) only moves the index.
    expect(r.body.dimensions.find((d: { dimension: string }) => d.dimension === "cta").level).toBe(1);
    const [row] = d1(DIR(), `SELECT provider_calls, cache_write_tokens, cache_read_tokens FROM analyses WHERE id = '${r.body.id}'`);
    expect(row.provider_calls).toBe(2);
    // The second call reads what the first wrote (the mock simulates the cache).
    expect(row.cache_read_tokens).toBeGreaterThan(0);
    const h: any = await (await fetch(`${IDX}/api/health`)).json();
    expect(h.capabilities).toMatchObject({ promptCache: true, indexSecondOpinion: true, qualityIndexShown: true });
  });

  it("a failed second rating still returns the report, with a one-rating index", async () => {
    const c = new Client(IDX);
    await login(c, "sub-index-2");
    const r = await c.check({ adCopy: "كنبة [[MOCK:levels_fail]]" });
    expect(r.status).toBe(200);
    expect(r.body.index.shown).toBe(true);
    expect(r.body.index.samples).toBeUndefined();
  });
});
