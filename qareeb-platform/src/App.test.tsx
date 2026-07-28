import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { GUDEA_UNAVAILABLE_MESSAGE } from "./domain/gudea";

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

function startScenario(label: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
  fireEvent.click(
    screen.getByRole("button", { name: "تثبيت هوية الدواء" }),
  );
}

describe("Arabic patient journey integration", () => {
  it("keeps simulation and active location labels visible", () => {
    render(<App />);

    expect(screen.getAllByText("محاكاة تفاعلية").length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText(/الموقع النشط: المنصور، بغداد/),
    ).toBeVisible();
    expect(screen.getByText(/لا مخزون حقيقياً/)).toBeVisible();
  });

  it("requires an explicit exact presentation selection for an ambiguous name", () => {
    render(<App />);
    startScenario("اسم ملتبس");

    expect(
      screen.getByRole("heading", { name: "أي عرض تقصد تحديداً؟" }),
    ).toBeVisible();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(1);
    const continueButton = screen.getByRole("button", {
      name: "اعتماد هذا العرض",
    });
    expect(continueButton).toBeDisabled();

    fireEvent.click(radios[0]);
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(screen.getByText("الاسم العلمي (INN)")).toBeVisible();
  });

  it("keeps RX upload and note controls behind explicit consent (AC-02)", () => {
    render(<App />);
    startScenario("بوصفة");

    expect(
      screen.queryByLabelText(/ملاحظة للصيدلي المقبول فقط/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "متابعة بموافقة آمنة" }),
    );
    expect(
      screen.getByRole("heading", { name: "موافقة محددة وقابلة للسحب" }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "منح الموافقة وفتح أدوات الوصفة",
      }),
    );
    expect(
      screen.getByLabelText(/ملاحظة للصيدلي المقبول فقط/),
    ).toBeVisible();
    expect(screen.getByText("استخدام وصفة محاكاة")).toBeVisible();
  });

  it("blocks controlled medicine before any public broadcast", () => {
    render(<App />);
    startScenario("دواء خاضع");
    fireEvent.click(screen.getByRole("button", { name: "عرض المسار الآمن" }));

    expect(
      screen.getByRole("heading", {
        name: "هذا العرض لا يدخل شبكة التوفر العامة",
      }),
    ).toBeVisible();
    expect(screen.queryByTestId("broadcast-allowlist")).not.toBeInTheDocument();
    expect(screen.getByText(/لم يُنشأ أي بث/)).toBeVisible();
  });

  it("shows honest Gudea fallback without blocking the journey (AC-08)", async () => {
    render(<App />);
    startScenario("Gudea غير متاح");

    await waitFor(() => {
      expect(
        screen.getAllByText(GUDEA_UNAVAILABLE_MESSAGE).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getByRole("button", { name: "متابعة بموافقة آمنة" }),
    ).toBeEnabled();
  });

  it("reaches a complete temporary hold only after emitted success events", async () => {
    vi.useFakeTimers();
    render(<App />);
    startScenario("حجز ناجح");
    fireEvent.click(screen.getByRole("button", { name: "طلب تأكيد التوفر" }));

    expect(screen.getByRole("heading", { name: "نبض الرف" })).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_200);
    });

    expect(
      screen.getByRole("heading", {
        name: "أكدت الصيدلية العرض وبدأ الحجز",
      }),
    ).toBeVisible();
    expect(screen.getByRole("timer")).toHaveTextContent(
      "بدأ العدّاد بعد حدث HoldActivated فقط",
    );
    expect(screen.getByText("السعر المؤكد من الصيدلية")).toBeVisible();
    expect(screen.getByRole("link", { name: "الاتجاهات" })).toBeVisible();
    expect(screen.getByRole("link", { name: "اتصال" })).toBeVisible();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeVisible();
  });
});

