import { expect, test, type Page } from "@playwright/test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function register(
  page: Page,
  role: "patient" | "pharmacy",
  input: { name: string; email: string },
) {
  await page.goto(`/auth/${role}/register`);
  await page.getByLabel("الاسم").fill(input.name);
  await page.getByLabel("رقم الهاتف").fill("07701234567");
  await page.getByLabel("البريد الإلكتروني").fill(input.email);
  await page.getByLabel("كلمة المرور").fill("StrongPassword!234");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
}

async function login(
  page: Page,
  role: "patient" | "pharmacy" | "admin",
  email: string,
  password = "StrongPassword!234",
) {
  await page.goto(`/auth/${role}/login`);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
}

test("complete patient, pharmacy, and admin marketplace journey", async ({
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`.replaceAll(/[^a-z0-9]/gi, "");
  const pharmacyEmail = `pharmacy-${suffix}@example.test`;
  const patientEmail = `patient-${suffix}@example.test`;
  const pharmacyName = `صيدلية الاختبار ${suffix.slice(-5)}`;
  const license = `IQ-${suffix.slice(-12)}`;
  const consoleErrors: string[] = [];

  const pharmacyContext = await browser.newContext({ locale: "ar-IQ" });
  const pharmacyPage = await pharmacyContext.newPage();
  pharmacyPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`pharmacy:${message.text()}`);
  });
  await register(pharmacyPage, "pharmacy", {
    name: "الصيدلي أحمد",
    email: pharmacyEmail,
  });
  await expect(
    pharmacyPage.getByRole("heading", { name: "عرّفنا بفرعك" }),
  ).toBeVisible();
  await pharmacyPage.getByLabel("اسم الصيدلية").fill(pharmacyName);
  await pharmacyPage.getByLabel("اسم الصيدلي المسؤول").fill("الصيدلي أحمد");
  await pharmacyPage
    .getByRole("textbox", { name: "الهاتف", exact: true })
    .fill("07701112222");
  await pharmacyPage.getByLabel("رقم إجازة الصيدلية").fill(license);
  await pharmacyPage.getByLabel("اسم الفرع").fill("فرع المنصور");
  await pharmacyPage.getByLabel("العنوان").fill("شارع 14 رمضان، المنصور");
  await pharmacyPage.getByLabel("أقرب معلم").fill("قرب الساحة");
  await pharmacyPage.getByLabel("يفتح الفرع").fill("00:00");
  await pharmacyPage.getByLabel("يغلق الفرع").fill("23:59");
  await pharmacyPage.locator('input[type="file"]').setInputFiles({
    name: "license.png",
    mimeType: "image/png",
    buffer: png,
  });
  await pharmacyPage.getByRole("button", { name: "إرسال طلب التحقق" }).click();
  await expect(
    pharmacyPage.getByRole("heading", { name: "طلب التحقق قيد المراجعة" }),
  ).toBeVisible();

  const adminContext = await browser.newContext({ locale: "ar-IQ" });
  const adminPage = await adminContext.newPage();
  adminPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`admin:${message.text()}`);
  });
  await login(
    adminPage,
    "admin",
    "admin@dawai.test",
    "AdminPassword234",
  );
  await expect(
    adminPage.getByRole("heading", { name: "إدارة دوائي" }),
  ).toBeVisible();
  await adminPage.goto("/admin/verifications");
  const application = adminPage.locator("article").filter({ hasText: pharmacyName });
  await expect(application).toBeVisible();
  await application.getByRole("link", { name: "فتح الملف" }).click();
  await expect(
    adminPage.getByRole("heading", { name: pharmacyName }),
  ).toBeVisible();
  await adminPage.getByRole("button", { name: "اعتماد الصيدلية" }).click();
  await expect(adminPage.getByText("تم اعتماد الصيدلية.")).toBeVisible();

  await pharmacyPage.reload();
  await expect(
    pharmacyPage.getByRole("heading", { name: "الطلبات القريبة اليوم" }),
  ).toBeVisible();

  const patientContext = await browser.newContext({ locale: "ar-IQ" });
  const patientPage = await patientContext.newPage();
  patientPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`patient:${message.text()}`);
  });
  await register(patientPage, "patient", {
    name: "مريض الاختبار",
    email: patientEmail,
  });
  await expect(
    patientPage.getByRole("heading", { name: "ما الدواء الذي تحتاجه؟" }),
  ).toBeVisible();
  await patientPage.goto("/patient/requests/new");
  await patientPage.getByLabel("اسم الدواء أو وصف واضح").fill("Augmentin");
  await patientPage.getByLabel("القوة \(إن عُرفت\)").fill("625 mg");
  await patientPage.getByLabel("الشكل").fill("أقراص");
  await patientPage.locator('input[type="file"]').setInputFiles({
    name: "prescription.png",
    mimeType: "image/png",
    buffer: png,
  });
  await patientPage
    .getByRole("button", { name: "إرسال الطلب للصيدليات القريبة" })
    .click();
  await expect(patientPage.getByText(/أُرسل إلى [1-9]\d* صيدليات/)).toBeVisible();
  const requestUrl = patientPage.url();

  await pharmacyPage.goto("/pharmacy/inbox");
  const requestCard = pharmacyPage.locator("article").filter({ hasText: "Augmentin" });
  await expect(requestCard).toBeVisible();
  await requestCard.getByRole("link", { name: "مراجعة ورد سريع" }).click();
  await pharmacyPage.getByLabel("السعر الكلي IQD").fill("12000");
  await pharmacyPage.getByLabel("الكمية المتاحة").fill("2");
  await pharmacyPage.getByRole("checkbox").last().check();
  await pharmacyPage
    .getByRole("button", { name: "إرسال العرض للمريض" })
    .click();
  await expect(
    pharmacyPage.getByRole("heading", { name: "طلبات قريبة بانتظارك" }),
  ).toBeVisible();

  await patientPage.goto(requestUrl);
  const offerCard = patientPage.locator("article").filter({ hasText: pharmacyName });
  await expect(offerCard).toBeVisible();
  await offerCard.getByRole("button", { name: "اختيار وطلب الحجز" }).click();
  await expect(
    patientPage.getByRole("heading", { name: "بانتظار تأكيد الصيدلية" }),
  ).toBeVisible();

  await pharmacyPage.goto("/pharmacy/reservations");
  await pharmacyPage.getByRole("button", { name: "تأكيد الحجز" }).click();
  await pharmacyPage.getByRole("button", { name: "الدواء جاهز" }).click();
  await pharmacyPage.getByRole("button", { name: "تأكيد الاستلام" }).click();
  await expect(pharmacyPage.getByText("COMPLETED")).toBeVisible();

  await patientPage.reload();
  await expect(
    patientPage.getByRole("heading", { name: "اكتمل الاستلام" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      patientPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);

  await patientPage.screenshot({
    path: testInfo.outputPath("completed-patient-journey.png"),
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);

  await pharmacyContext.close();
  await patientContext.close();
  await adminContext.close();
});
