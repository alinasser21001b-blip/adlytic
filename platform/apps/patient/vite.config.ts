/**
 * The browser build — how the patient app runs in a page.
 *
 * @blueprint §3 · TD-1 · TD-2
 * @owner patient-app
 */
import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { handle } from "../../tools/devserver/api.mjs";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** The declared v1 contracts, served beside the app so there is no CORS and no
 *  base URL to configure. Development only — it is not in the build. */
const devApi = (): Plugin => ({
  name: "dawai-dev-api",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      void Promise.resolve(handle(req, res)).then((handled) => { if (handled === false) next(); });
    });
  },
});

/**
 * The app answers at `/`.
 *
 * Vite's root is the platform directory, because the aliases below point at
 * package SOURCES that live above the app — so the page itself sat at
 * `/apps/patient/web/index.html` and the obvious URL, the one anybody types,
 * returned nothing at all. "It doesn't work" is the correct reading of a
 * server that answers a five-segment path and 404s its own front door.
 */
const appAtRoot = (): Plugin => ({
  name: "dawai-app-at-root",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === "/" || req.url === "/index.html") req.url = APP_HTML;
      next();
    });
  },
});

const APP_HTML = "/apps/patient/web/index.html";

export default defineConfig({
  root: at("../.."),
  plugins: [devApi(), appAtRoot()],
  /**
   * react-native-web's Animated reads `global`, which exists in a React Native
   * runtime and not in a browser. Without this the app rendered, ran, and then
   * unmounted its entire tree the first time a transition mounted — a blank
   * dark screen with `ReferenceError: global is not defined` in a console
   * nobody had open. It reached R8 and died on the way to R9.
   *
   * The app's own code never touches it; the layer gate forbids browser
   * globals above the host, and this is the host.
   */
  define: { global: "globalThis" },
  /**
   * Copied verbatim to the publish root: `_redirects` and `_headers`, which a
   * static host reads from the output itself rather than from a config file
   * whose location depends on the build's base directory. The deploy that
   * answered 404 at its own front door is why they live here.
   */
  publicDir: at("./web/public"),
  resolve: {
    alias: {
      // The app is written against React Native primitives; react-native-web
      // maps them onto DOM with real behaviour — presses, typing, scrolling
      // and animation — which the review's inert shim deliberately does not.
      "react-native": "react-native-web",
      "@dawai/design": at("../../packages/design/src/index.ts"),
      "@dawai/domain": at("../../packages/domain/src/index.ts"),
      "@dawai/navigation": at("../../packages/navigation/src/index.ts"),
      "@dawai/session": at("../../packages/session/src/index.ts"),
      "@dawai/offline": at("../../packages/offline/src/index.ts"),
      "@dawai/net": at("../../packages/net/src/index.ts"),
      "@dawai/observability": at("../../packages/observability/src/index.ts"),
      "@dawai/contracts": at("../../packages/contracts/src/index.ts"),
    },
  },
  server: { port: 5173, strictPort: false, host: true },
  /**
   * The build needs the entry named outright. `appAtRoot` above answers the
   * front door in DEVELOPMENT only — it is a `configureServer` middleware, and
   * rollup never sees it — so with vite's root at the platform directory the
   * build looked for `platform/index.html`, found nothing, and failed on every
   * invocation. A build script that cannot build is worse than no script.
   */
  build: {
    outDir: at("../../dist-web"),
    emptyOutDir: true,
    rollupOptions: { input: at("./web/index.html") },
  },
});
