import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Dawai core journeys", () => {
  it("opens direct search results without creating a request", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("اسم الدواء"), {
      target: { value: "Panadol Extra" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ابحث الآن" }));

    expect(
      screen.getByRole("heading", { name: /نتائج قريبة لـ/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("بحث مباشر · بدون إرسال طلب")).toBeInTheDocument();
  });

  it("creates a medicine request and enters matching", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /اكتب طلبك/ }));
    expect(
      screen.getByRole("heading", { name: "أخبرنا ما الدواء الذي تحتاجه" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /ابحث في الصيدليات القريبة/ }),
    );

    expect(
      screen.getByRole("heading", { name: "نبحث عن دوائك الآن…" }),
    ).toBeInTheDocument();
    expect(screen.getByText("DW-2841")).toBeInTheDocument();
  });

  it("switches to the active pharmacy inbox", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /للصيدلية/ }));

    expect(
      screen.getByRole("heading", { name: "مرحبًا، صيدلية الروابي" }),
    ).toBeInTheDocument();
    expect(screen.getByText("طلبان جديدان")).toBeInTheDocument();
  });

  it("lets a pharmacy prepare and submit a structured offer", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /للصيدلية/ }));
    fireEvent.click(
      screen.getAllByRole("button", { name: /متوفر — أرسل عرضًا/ })[0],
    );
    expect(
      screen.getByRole("heading", { name: "أكّد ما يمكنك توفيره" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: /إرسال العرض للمريض/ }),
    );

    expect(
      screen.getByRole("heading", { name: "المريض يرى عرضك الآن" }),
    ).toBeInTheDocument();
  });
});
