/**
 * The browser entry point — where the application actually starts.
 *
 * @blueprint §3 · TD-1
 * @owner patient-app
 * @why TD-1's remaining half: the composition root existed and nothing mounted
 *      it. This mounts it.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.js";
import { createRuntime } from "../src/main/runtime.js";
import { browserHost } from "./host.js";

/** Same origin: the dev server serves the app and the API together, so there
 *  is no base URL to configure and no CORS to arrange. */
const host = browserHost(globalThis.location.origin);

async function start() {
  /**
   * The callback is how a host answers back with an intent — the camera uses
   * it. A browser host has no camera (TD-9), so nothing calls it here, and
   * wiring a second `usePatientApp` to capture `send` would have created a
   * SECOND independent app state beside the one `App` owns.
   */
  const { runtime } = await createRuntime(host, () => {});
  const container = globalThis.document.getElementById("root");
  if (!container) throw new Error("no #root to mount into");
  createRoot(container).render(createElement(App, { rt: runtime }));
}

void start();
