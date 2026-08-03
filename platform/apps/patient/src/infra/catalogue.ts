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
import type { CatalogueHit, CataloguePort, Fetched, SearchResponse } from "../ports.js";

export interface SearchCache {
  read(query: string): Promise<{ readonly value: SearchResponse; readonly at: number } | null>;
  write(query: string, value: SearchResponse, at: number): Promise<void>;
}

/**
 * A row we are allowed to show, and — more importantly — allowed to JUDGE.
 *
 * This used to check `itemId` and `name` only. The three fields the clinical
 * gate reads were not among them, and `gateRequestLine` reads them as plain
 * booleans:
 *
 *   if (item.isControlled) return CONTROLLED_NOT_SUPPORTED   // absent -> falsy
 *   if (!item.requestable) return ITEM_NOT_REQUESTABLE
 *   if (item.requiresPrescription && !image) return PRESCRIPTION_REQUIRED
 *
 * So a hit carrying `requestable: true` but missing `isControlled` was gated as
 * ALLOWED, and D42's "this cannot be requested from the app" never fired for a
 * controlled medicine. Missing `requiresPrescription` did the same to D18.
 *
 * The path that makes this more than theoretical is the CACHE. It stores
 * whatever a previous version of the app wrote, so a device that upgrades
 * across a schema change replays old rows — with no server in the loop to
 * correct them — straight into the gate.
 *
 * A row we cannot judge is a row we must not offer. It is dropped, which is
 * what an unparseable row already did; nothing new is decided here.
 */
const isHit = (v: unknown): v is CatalogueHit => {
  if (typeof v !== "object" || v === null) return false;
  const h = v as Record<string, unknown>;
  return typeof h["itemId"] === "string"
    && typeof h["name"] === "string"
    && typeof h["latinName"] === "string"
    && typeof h["form"] === "string"
    && typeof h["strength"] === "string"
    // The three the clinical gate reads. Absent is not false.
    && typeof h["requestable"] === "boolean"
    && typeof h["requiresPrescription"] === "boolean"
    && typeof h["isControlled"] === "boolean";
};

/** The cache is another untrusted source — it holds what an older build wrote.
 *  Rows that no longer parse are dropped rather than replayed unjudged. */
const usableHits = (value: SearchResponse): SearchResponse =>
  ({ ...value, hits: value.hits.filter(isHit) });

export function makeCatalogue(http: Http, cache: SearchCache, now: () => number): CataloguePort {
  return {
    async search(query, signal): Promise<Fetched<SearchResponse>> {
      const res = await http.get(`/v1/catalogue/search?q=${encodeURIComponent(query)}`, signal);

      if (res.outcome.kind === "accepted") {
        const body = (res.body ?? {}) as Record<string, unknown>;
        const value: SearchResponse = {
          // A type guard, so the filtered array IS CatalogueHit[] and no cast
          // stands between the server's bytes and the clinical gate.
          hits: Array.isArray(body["hits"]) ? body["hits"].filter(isHit) : [],
          at: typeof body["at"] === "number" ? body["at"] : now(),
        };
        await cache.write(query, value, now());
        return { kind: "fresh", value };
      }

      // The network failed the patient; the cache may still serve them. The
      // age travels with it so F2 can label it rather than present it as live.
      const kept = await cache.read(query);
      if (kept) return { kind: "cached", value: usableHits(kept.value), cachedAt: kept.at };
      return { kind: "failed", outcome: res.outcome };
    },
  };
}
