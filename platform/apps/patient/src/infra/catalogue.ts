/**
 * CataloguePort over the declared search contract, cached because §21 says so.
 *
 * @blueprint §13.1 · §21 · GET /v1/catalogue/search
 * @owner catalogue-service
 * @why F2's offline state promises cached results labelled with their age, and
 *      a promise a screen makes is one this port has to keep: every fresh
 *      response is written through to the cache, and a failed fetch falls back
 *      to it — answering `cached` with the WRITE time, so the age the screen
 *      shows is when the data was true, not when it was retrieved.
 *
 *      The cache is a port, not a Map, because where bytes live is a platform
 *      decision (SQLite on device, memory in tests) and D28 requires the
 *      encrypted cache to die with the session key — which only an injected
 *      store can honour.
 */
import type { Http } from "./http.js";
import type { CataloguePort, Fetched, SearchResponse } from "../ports.js";

export interface SearchCache {
  read(query: string): Promise<{ readonly value: SearchResponse; readonly at: number } | null>;
  write(query: string, value: SearchResponse, at: number): Promise<void>;
}

const isHit = (v: unknown): boolean => {
  const h = v as Record<string, unknown>;
  return typeof h?.["itemId"] === "string" && typeof h?.["name"] === "string";
};

export function makeCatalogue(http: Http, cache: SearchCache, now: () => number): CataloguePort {
  return {
    async search(query, signal): Promise<Fetched<SearchResponse>> {
      const res = await http.get(`/v1/catalogue/search?q=${encodeURIComponent(query)}`, signal);

      if (res.outcome.kind === "accepted") {
        const body = (res.body ?? {}) as Record<string, unknown>;
        const hits = Array.isArray(body["hits"]) ? body["hits"].filter(isHit) : [];
        const value: SearchResponse = {
          hits: hits as SearchResponse["hits"],
          at: typeof body["at"] === "number" ? body["at"] : now(),
        };
        await cache.write(query, value, now());
        return { kind: "fresh", value };
      }

      // The network failed the patient; the cache may still serve them. The
      // age travels with it so F2 can label it rather than present it as live.
      const kept = await cache.read(query);
      if (kept) return { kind: "cached", value: kept.value, cachedAt: kept.at };
      return { kind: "failed", outcome: res.outcome };
    },
  };
}
