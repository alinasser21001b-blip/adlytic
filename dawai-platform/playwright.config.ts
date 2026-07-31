import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "ar-IQ",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "rm -rf .data/e2e && mkdir -p .data/e2e && NODE_ENV=test DAWAI_ENV=test ADMIN_EMAIL=admin@dawai.test ADMIN_PASSWORD=AdminPassword234 PORT=8787 WEB_ORIGIN=http://127.0.0.1:4173 PGLITE_PATH=.data/e2e npx tsx server/index.ts",
      url: "http://127.0.0.1:8787/health/ready",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite preview --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
