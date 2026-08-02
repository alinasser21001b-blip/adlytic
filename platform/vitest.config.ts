import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    // The domain is pure, so its tests need no environment, no server and no
    // database. That is the point of Rule 3, and it is why these run in
    // milliseconds and can be trusted in a pre-commit hook.
    environment: "node",
    coverage: { include: ["packages/*/src/**/*.ts"], exclude: ["**/*.test.ts"] },
  },
});
