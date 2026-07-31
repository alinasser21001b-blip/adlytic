import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("Dawai routed product shell", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "سجّل الدخول للمتابعة.",
              requestId: "test",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  it("starts with an explicit patient or pharmacy choice", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "كيف ستستخدم دوائي؟" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /أنا مريض/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /أنا صيدلية/ }),
    ).toBeInTheDocument();
  });

  it("routes patients to a dedicated registration form", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("link", { name: /أنا مريض/ }));
    expect(
      await screen.findByRole("heading", { name: "أنشئ حسابك" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("رقم الهاتف")).toBeInTheDocument();
  });

  it("keeps pharmacy registration in its own role flow", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("link", { name: /أنا صيدلية/ }));
    expect(
      await screen.findByText(/حساب الصيدلية منفصل/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(window.location.pathname).toBe("/auth/pharmacy/register"),
    );
  });
});
