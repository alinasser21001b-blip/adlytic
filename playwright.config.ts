// ════════════════════════════════════════════════════════════════════════
//  playwright.config.ts — browser/E2E smoke tests.
//
//  Run:  npm run test:e2e            (against PLAYWRIGHT_BASE_URL or :3001)
//        PLAYWRIGHT_BASE_URL=https://adlytic-production.up.railway.app npm run test:e2e
//
//  These are intentionally light smoke tests — they assert the app boots, the
//  auth guard works, and /api/health responds. They do NOT need seeded data,
//  so they run against any environment (local, staging, prod) safely.
//
//  This config lives OUTSIDE tsconfig's `include` (src/**), so it never affects
//  the production build. Install the runner once with:  npm i -D @playwright/test
//  Chromium is resolved via PLAYWRIGHT_BROWSERS_PATH (preinstalled in CI images).
// ════════════════════════════════════════════════════════════════════════

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Honor an explicit binary if the image pins one; otherwise Playwright
        // resolves Chromium from PLAYWRIGHT_BROWSERS_PATH.
        launchOptions: process.env['PLAYWRIGHT_CHROMIUM_PATH']
          ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] }
          : {},
      },
    },
  ],
});
