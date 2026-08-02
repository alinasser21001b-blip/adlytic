import { defineConfig } from "vitest/config";

export default defineConfig({
  // Workspace packages resolve to source, so a test never runs against a stale
  // build and the domain stays a single compilation unit.
  resolve: {
    alias: {
      "@dawai/design": new URL("./packages/design/src/index.ts", import.meta.url).pathname,
      "@dawai/navigation": new URL("./packages/navigation/src/index.ts", import.meta.url).pathname,
      "@dawai/session": new URL("./packages/session/src/index.ts", import.meta.url).pathname,
      "@dawai/offline": new URL("./packages/offline/src/index.ts", import.meta.url).pathname,
      "@dawai/net": new URL("./packages/net/src/index.ts", import.meta.url).pathname,
      "@dawai/domain": new URL("./packages/domain/src/index.ts", import.meta.url).pathname,
      "@dawai/observability": new URL("./packages/observability/src/index.ts", import.meta.url).pathname,
      // React Native's entry point is Flow-typed source only Metro parses.
      // The double maps each primitive onto a host element of the same name and
      // passes every prop through, so a rendered tree still carries the real
      // accessibility roles, labels and handlers.
      "react-native": new URL("./tools/rn-test-double.tsx", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    // The domain is pure, so its tests need no environment, no server and no
    // database. That is the point of Rule 3, and it is why these run in
    // milliseconds and can be trusted in a pre-commit hook.
    environment: "node",
    coverage: { include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"], exclude: ["**/*.test.ts"] },
  },
});
