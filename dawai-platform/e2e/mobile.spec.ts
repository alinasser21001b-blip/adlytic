import { expect, test, type Page } from "@playwright/test";

/**
 * Mobile viewport matrix. Runs on iPhone SE / iPhone 14 / iPhone 15 Pro Max /
 * small-Android sized projects (chromium engine, device metrics + touch).
 * Asserts the phone experience is designed-for-mobile, not shrunk-from-desktop:
 * no horizontal overflow, ≥44px touch targets, ≥16px inputs (no iOS focus
 * zoom), visible bottom navigation, and a working request wizard.
 */

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(1);
}

test("welcome screen is thumb-ready", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "دواؤك أقرب مما تتوقع." })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  for (const name of [/أنا مريض/, /أنا صيدلية/]) {
    const box = await page.getByRole("link", { name }).boundingBox();
    expect(box, "role card visible").toBeTruthy();
    expect(box!.height, "role card tap height").toBeGreaterThanOrEqual(44);
  }
});

test("auth inputs do not trigger iOS focus zoom", async ({ page }) => {
  await page.goto("/auth/patient/register");
  await expectNoHorizontalOverflow(page);
  for (const label of ["الاسم", "البريد الإلكتروني", "كلمة المرور"]) {
    const field = page.getByLabel(label);
    const fontSize = await field.evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(fontSize, `${label} font-size`).toBeGreaterThanOrEqual(16);
    const box = await field.boundingBox();
    expect(box!.height, `${label} tap height`).toBeGreaterThanOrEqual(44);
  }
});

test("patient shell and request wizard are mobile-first", async ({ page }) => {
  const email = `mobile-${Date.now()}-${Math.floor(Math.random() * 1e6)}@dawai.test`;
  await page.goto("/auth/patient/register");
  await page.getByLabel("الاسم").fill("مريض الجوال");
  await page.getByLabel("رقم الهاتف").fill("07701234567");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill("StrongPassword!234");
  await page.getByRole("checkbox", { name: /سياسة الخصوصية/ }).check();
  await page.getByRole("checkbox", { name: /شروط الاستخدام/ }).check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByRole("heading", { name: "ما الدواء الذي تحتاجه؟" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Bottom navigation: visible, safe-area aware, every item a real tap target.
  const nav = page.getByRole("navigation", { name: "التنقل على الهاتف" });
  await expect(nav).toBeVisible();
  const items = nav.getByRole("link");
  const count = await items.count();
  expect(count).toBe(5);
  for (let index = 0; index < count; index += 1) {
    const box = await items.nth(index).boundingBox();
    expect(box, `nav item ${index} visible`).toBeTruthy();
    expect(box!.height, `nav item ${index} tap height`).toBeGreaterThanOrEqual(44);
  }

  // The request composer is a wizard: step gating, back behavior, sticky CTA.
  await page.goto("/patient/requests/new");
  const next = page.getByRole("button", { name: "متابعة" });
  await expect(next).toBeDisabled();
  await page.getByLabel("اسم الدواء أو وصف واضح").fill("Panadol Extra");
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByLabel("الكمية")).toBeVisible();
  await page.getByRole("button", { name: "زيادة الكمية" }).click();
  await expect(page.getByLabel("الكمية")).toHaveValue("2");
  await next.click();
  await expect(page.getByRole("button", { name: "إرسال الطلب للصيدليات القريبة" })).toBeVisible();
  await page.getByRole("button", { name: "رجوع" }).click();
  await expect(page.getByLabel("الكمية")).toHaveValue("2");
  await expectNoHorizontalOverflow(page);
});
