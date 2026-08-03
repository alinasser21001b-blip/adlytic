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

export default defineConfig({
  root: at("../.."),
  plugins: [devApi()],
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
  build: { outDir: at("../../dist-web"), emptyOutDir: true },
});
