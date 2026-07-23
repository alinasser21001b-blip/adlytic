// Smoke tests — verify the app boots, the auth guard works, and the API is up.
// No seeded data required, so these run against any environment.
import { test, expect } from '@playwright/test';

test.describe('adlytic · smoke', () => {
  test('login page renders with email + password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('input#email[type="email"]')).toBeVisible();
    await expect(page.locator('input#password[type="password"]')).toBeVisible();
  });

  test('unauthenticated /campaigns redirects to /login', async ({ page }) => {
    // The client guard (init(): no token → window.location = '/login') should fire.
    await page.goto('/campaigns');
    await page.waitForURL(/\/login/, { timeout: 12_000 });
    expect(page.url()).toContain('/login');
  });

  test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 12_000 });
    expect(page.url()).toContain('/login');
  });

  test('/api/health responds and reports its service role', async ({ request }) => {
    const res = await request.get('/api/health');
    // 200 when DB is reachable, 503 when degraded — both return JSON with role.
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty('service', 'adlytic');
    expect(body).toHaveProperty('role');
    expect(['api', 'worker', 'combined']).toContain(body.role);
  });

  test('CSV export requires auth (401 without a token)', async ({ request }) => {
    const res = await request.get('/api/workspaces/does-not-matter/export/campaigns.csv');
    expect(res.status()).toBe(401);
  });
});
