import type { Balance, CatalogView, OrderView } from "../../../shared/credits";
import { ApiFailure } from "../check/api";

export interface Me {
  user: { id: string; createdAt: string; provider: "google" } | null;
  balance: Balance | null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (!res.ok) {
    let code = "INTERNAL";
    let message = "حدث خطأ غير متوقع. حاول مرة أخرى.";
    let retryable = true;
    try {
      const b = (await res.json()) as { error: { code: string; message: string; retryable?: boolean } };
      ({ code, message } = b.error);
      retryable = b.error.retryable ?? false;
    } catch {
      /* keep defaults */
    }
    throw new ApiFailure(res.status, code, message, retryable);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const accountApi = {
  me: () => call<Me>("/api/me"),
  logout: () => call<void>("/api/auth/logout", { method: "POST" }),
  catalog: () => call<CatalogView>("/api/payments/catalog"),
  order: (id: string) => call<OrderView>(`/api/payments/orders/${encodeURIComponent(id)}`),
  createOrder: (productId: string, priceVersion: string, idempotencyKey: string) =>
    call<{ orderId: string; status: string; redirectUrl?: string }>("/api/payments/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, priceVersion, idempotencyKey }),
    }),
};

export function loginHref(returnTo = location.pathname): string {
  return `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}

export function fmtIQD(n: number): string {
  return `${n.toLocaleString("en-US")} د.ع`;
}

export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60_000);
  if (mins <= 1) return "خلال دقيقة";
  if (mins < 60) return `بعد ${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `بعد ${h} ساعة و${m} دقيقة` : `بعد ${h} ساعة`;
}
