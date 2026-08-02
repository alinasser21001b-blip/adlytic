import { defineConfig } from "vite";

/**
 * The visual review renders the REAL screens with react-native mapped to DOM.
 * Every other alias matches the test runner's, so the review cannot drift from
 * what the tests actually verified.
 */
const at = (p: string) => new URL(`../../${p}`, import.meta.url).pathname;

export default defineConfig({
  resolve: {
    alias: {
      "@dawai/design": at("packages/design/src/index.ts"),
      "@dawai/navigation": at("packages/navigation/src/index.ts"),
      "@dawai/session": at("packages/session/src/index.ts"),
      "@dawai/offline": at("packages/offline/src/index.ts"),
      "@dawai/net": at("packages/net/src/index.ts"),
      "@dawai/domain": at("packages/domain/src/index.ts"),
      "@dawai/observability": at("packages/observability/src/index.ts"),
      "react-native": at("tools/review/rn-web.tsx"),
    },
  },
  esbuild: { jsx: "automatic" },
});
