/**
 * The one HTTP transport — every byte that leaves the patient app goes here.
 *
 * @blueprint §21 · net/retry · 05-api-contracts
 * @owner patient-app
 * @why One transport rather than fetch-per-port, because the rules that make
 *      the network survivable are cross-cutting and must not be re-remembered
 *      per call: every response is classified by the SAME `classify` so a 409
 *      is a duplicate everywhere and never a failure somewhere; a network
 *      error is `transient` because a phone walking out of coverage is normal
 *      operation in this product, not an exception; and every state-changing
 *      call carries its idempotency key in a header, which is what makes a
 *      retry safe to attempt at all.
 *
 *      `fetch` is injected. Not for testability alone — because this module
 *      must be usable from React Native, a web review, and a Node test without
 *      believing three different lies about what the global environment holds.
 */
import { classify, type Outcome } from "@dawai/net";

/**
 * The reason a cancelled call carries.
 *
 * A constant rather than a literal because two modules have to agree on it and
 * they are not next to each other: this one produces it, and a caller that
 * supersedes its own request has to recognise it in order to tell "the patient
 * moved on" apart from "the network failed". A string typed twice is a string
 * that can be corrected once.
 */
export const CANCELLED = "cancelled";

export type HttpResponse = {
  readonly status: number;
  readonly outcome: Outcome;
  /** Parsed body, or null when there was none or it was not JSON. The CALLER
   *  knows the declared shape; the transport does not guess. */
  readonly body: unknown;
};

export type Fetch = (url: string, init: {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}) => Promise<{ readonly status: number; text(): Promise<string> }>;

export type Http = {
  get(path: string, signal?: AbortSignal): Promise<HttpResponse>;
  post(path: string, body: Readonly<Record<string, unknown>>, opts?: {
    readonly idempotencyKey?: string;
    readonly signal?: AbortSignal;
  }): Promise<HttpResponse>;
};

export function makeHttp(baseUrl: string, fetchImpl: Fetch, session?: () => string | null): Http {
  const call = async (
    method: string,
    path: string,
    body?: Readonly<Record<string, unknown>>,
    idempotencyKey?: string,
    signal?: AbortSignal,
  ): Promise<HttpResponse> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = session?.();
    if (token) headers["authorization"] = `Bearer ${token}`;
    // The header name the API contract fixes. Stable across retries by
    // construction — the key is minted once, at enqueue.
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method, headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal === undefined ? {} : { signal }),
      });
      let parsed: unknown = null;
      try { parsed = JSON.parse(await res.text()); } catch { /* not JSON; the status still classifies */ }
      return { status: res.status, outcome: classify(res.status), body: parsed };
    } catch (e) {
      // A cancellation is not a network failure. `transient` means "worth
      // retrying", and retrying something the caller deliberately abandoned is
      // the transport overruling it — on the outbox path that is a POST the
      // patient cancelled being sent anyway. Aborts are named separately
      // BEFORE the network case, because an AbortError is an Error like any
      // other and would otherwise read as a dropped connection.
      const aborted = signal?.aborted === true || (e instanceof Error && e.name === "AbortError");
      if (aborted) return { status: 0, outcome: { kind: "permanent", reason: CANCELLED }, body: null };

      // No status at all: the request never completed. On this product's
      // networks that is Tuesday, and it is always worth retrying.
      return {
        status: 0,
        outcome: { kind: "transient", reason: e instanceof Error ? e.message : "network" },
        body: null,
      };
    }
  };

  return {
    get: (path, signal) => call("GET", path, undefined, undefined, signal),
    post: (path, body, opts) => call("POST", path, body, opts?.idempotencyKey, opts?.signal),
  };
}
