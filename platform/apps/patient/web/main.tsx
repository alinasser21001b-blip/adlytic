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
   * A review build carries the mock; a build without the flag does not, and
   * the module is never imported so it never reaches the bundle. Product asked
   * for this so a missing backend cannot stop the workflow being reviewed.
   */
  if (import.meta.env["VITE_MOCK_API"] === "1") {
    const { installMockApi } = await import("./mock.js");
    installMockApi();
  }

  /**
   * Build, then mount. The app connects itself to the runtime once it is
   * rendered — this file deliberately holds no dispatcher of its own, because
   * the version that did had to call `usePatientApp` to get one and thereby
   * ran a SECOND independent copy of the application state beside the one
   * `App` owns.
   */
  const { runtime } = await createRuntime(host);
  const container = globalThis.document.getElementById("root");
  if (!container) throw new Error("no #root to mount into");
  createRoot(container).render(createElement(App, { rt: runtime }));
}

void start();
