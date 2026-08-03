/**
 * The declared v1 contracts, answered in the page.
 *
 * @blueprint §4 · TD-1 · TD-26
 * @owner patient-app
 * @why A deployed build had no API, so it showed the first screen and stopped:
 *      no medicines, no sign-in, no offers. Product decided the review build
 *      should carry the mock rather than let a missing backend stop visual
 *      progress, so this is that decision and not an invention.
 *
 *      It runs THE SAME `handle` the dev server runs — tools/devserver/api.mjs,
 *      one implementation of the contracts, not a second one that would drift
 *      from it. That file imports nothing from node: it speaks `req`/`res`, so
 *      the only thing missing in a browser is those two objects, which is all
 *      this file supplies.
 *
 *      It is loaded ONLY when the build asks for it (VITE_MOCK_API), so a real
 *      backend replaces it by not setting that flag. Nothing here is reachable
 *      from a production bundle built without it.
 */
import { handle } from "../../../tools/devserver/api.mjs";

/** Everything `api.mjs` touches on the response, and nothing more. */
type MockRes = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

/**
 * `api.mjs` reads a JSON body through node's stream events, and a multipart
 * body by async-iterating the request. Both are the same bytes arriving; this
 * supplies them from what `fetch` was handed.
 */
function requestFor(url: string, init: RequestInit | undefined, body: Uint8Array) {
  const listeners: Record<string, ((chunk?: unknown) => void)[]> = {};
  const headers = new Headers(init?.headers ?? {});
  return {
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    headers: Object.fromEntries(headers.entries()),
    on(event: string, cb: (chunk?: unknown) => void) {
      (listeners[event] ??= []).push(cb);
      // Deliver on the next turn, so a caller that registers `data` and then
      // `end` in the same statement receives them in that order.
      if (event === "end") {
        queueMicrotask(() => {
          for (const fn of listeners["data"] ?? []) fn(new TextDecoder().decode(body));
          cb();
        });
      }
      return this;
    },
    async *[Symbol.asyncIterator]() {
      yield body;
    },
  };
}

const bytesOf = async (init: RequestInit | undefined): Promise<Uint8Array> => {
  const b = init?.body;
  if (b === undefined || b === null) return new Uint8Array();
  if (typeof b === "string") return new TextEncoder().encode(b);
  if (b instanceof Blob) return new Uint8Array(await b.arrayBuffer());
  if (b instanceof FormData) {
    // Only the byte COUNT matters to the prescription route (D18 stores
    // nothing), so the parts are concatenated rather than re-encoded as a
    // multipart body no one will parse.
    let total = new Uint8Array();
    for (const [, value] of b.entries()) {
      const part = value instanceof Blob
        ? new Uint8Array(await value.arrayBuffer())
        : new TextEncoder().encode(String(value));
      const joined = new Uint8Array(total.length + part.length);
      joined.set(total);
      joined.set(part, total.length);
      total = joined;
    }
    return total;
  }
  return new Uint8Array();
};

/**
 * Install the mock in front of `fetch`.
 *
 * Only /v1/ is intercepted — `handle` itself answers `false` for anything
 * else, and everything else on the page (the bundle, images, a blob: url the
 * camera produced) must reach the real network untouched.
 */
export function installMockApi(): void {
  const real = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, globalThis.location.href).pathname;
    if (!path.startsWith("/v1/")) return real(input as RequestInfo, init);

    // A multipart FormData carries no content-type until the platform writes
    // one with its boundary; `api.mjs` refuses without it, exactly as a server
    // would, so it is supplied here where the platform normally would.
    const headers = new Headers(init?.headers ?? {});
    if (init?.body instanceof FormData && !headers.has("content-type"))
      headers.set("content-type", "multipart/form-data; boundary=----mock");

    const body = await bytesOf(init);
    const req = requestFor(url, { ...init, headers }, body);

    return await new Promise<Response>((resolve) => {
      const out: Record<string, string> = {};
      const res: MockRes = {
        statusCode: 200,
        setHeader(name, value) { out[name.toLowerCase()] = value; },
        end(payload) {
          resolve(new Response(payload ?? "", { status: res.statusCode, headers: out }));
        },
      };
      void Promise.resolve(handle(req as never, res as never)).then((handled) => {
        // `handle` returns false for a path it does not own. Nothing below /v1/
        // is owned by anything else, so this is a route that does not exist —
        // and a 404 is what the app already knows how to show.
        if (handled === false) resolve(new Response("{}", { status: 404 }));
      });
    });
  }) as typeof fetch;
}
