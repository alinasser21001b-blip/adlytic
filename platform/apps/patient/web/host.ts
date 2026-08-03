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
    /**
     * A photograph, from the one camera a browser has.
     *
     * `<input type="file" accept="image/*" capture="environment">` opens the
     * rear camera on a phone and a file picker on a desktop, which is the right
     * behaviour in both places: R2 asks for a picture of a piece of paper, and
     * on a laptop the paper has usually already been photographed.
     *
     * It answers with a `blob:` url and nothing else — the id belongs to the
     * media service, and `MediaPort` reads these bytes back through `fetch`.
     * Null when the patient dismissed the picker, which is not a failure and
     * must not be reported as one.
     */
    camera: () => new Promise<{ readonly localUri: string } | null>((resolve) => {
    const doc = globalThis.document;
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";

    let answered = false;
    const answer = (value: { readonly localUri: string } | null) => {
      if (answered) return;
      answered = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      answer(file ? { localUri: URL.createObjectURL(file) } : null);
    });
    // Dismissing the picker fires no `change` in any browser, so the promise
    // would never settle and R2 would sit on «تصوير» for ever. `cancel` is
    // supported where it exists; the focus fallback covers the rest.
    input.addEventListener("cancel", () => answer(null));
    globalThis.addEventListener("focus", () => {
      globalThis.setTimeout(() => { if (input.files?.length === 0) answer(null); }, 500);
    }, { once: true });

    doc.body.appendChild(input);
    input.click();
  }),
    log: (line) => { globalThis.console.log(line); },
  };
}
