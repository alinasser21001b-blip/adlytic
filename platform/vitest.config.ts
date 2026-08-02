import { defineConfig } from "vitest/config";

export default defineConfig({
  // Workspace packages resolve to source, so a test never runs against a stale
  // build and the domain stays a single compilation unit.
  resolve: {
    alias: {
      "@dawai/design": new URL("./packages/design/src/index.ts", import.meta.url).pathname,
      "@dawai/domain": new URL("./packages/domain/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    // The domain is pure, so its tests need no environment, no server and no
    // database. That is the point of Rule 3, and it is why these run in
    // milliseconds and can be trusted in a pre-commit hook.
    environment: "node",
    coverage: { include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"], exclude: ["**/*.test.ts"] },
  },
});
