import { expect, test } from "@playwright/test";

test("patient and pharmacy journeys render without overflow", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: /تحتاج دواء؟/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("dawai-home.png"),
    fullPage: true,
  });

  await page.getByLabel("اسم الدواء").fill("Panadol Extra");
  await page.getByRole("button", { name: "ابحث الآن" }).click();
  await expect(
    page.getByRole("heading", { name: /نتائج قريبة لـ/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: /للصيدلية/ }).click();
  await expect(
    page.getByRole("heading", { name: "مرحبًا، صيدلية الروابي" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("dawai-pharmacy.png"),
    fullPage: true,
  });

  expect(consoleErrors).toEqual([]);
});
