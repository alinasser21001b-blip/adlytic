/**
 * The browser host — one platform, implementing the Host interface.
 *
 * @blueprint §3 · §21 · D28 · TD-2
 * @owner patient-app
 * @why `createRuntime` needs a clock, ids, connectivity, somewhere to keep
 *      bytes and a way to wait. On a device those come from Expo; here they
 *      come from the browser. Nothing in this file decides anything — it is a
 *      dozen one-line answers, which is exactly what the Host interface exists
 *      to make possible.
 */
import type { Host, Store } from "../src/main/host.js";

/** D28 — the cache must be able to die with the session key. localStorage is
 *  what a browser has; a device build supplies encrypted storage instead. */
const localStore: Store = {
  async read(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  async write(key, value) {
    // A full or disabled store is not a reason to lose the app: the cache is an
    // optimisation, and every read path already treats absence as normal.
    try { globalThis.localStorage?.setItem(key, value); } catch { /* nothing to do */ }
  },
};

export function browserHost(baseUrl: string): Host {
  return {
    baseUrl,
    clock: () => Date.now(),
    newId: () => globalThis.crypto.randomUUID(),
    // §21 — advisory only. The outbox stays the authority on what was sent.
    online: () => globalThis.navigator?.onLine ?? true,
    store: localStore,
    sleep: (ms) => new Promise((resolve) => { globalThis.setTimeout(resolve, ms); }),
    random: () => Math.random(),
    // TD-9 — no camera in a browser build. R2 offers typing the name instead,
    // which is the declared alternative rather than a workaround.
    camera: null,
    log: (line) => { globalThis.console.log(line); },
  };
}
