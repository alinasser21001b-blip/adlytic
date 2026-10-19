import { useEffect, useState } from "react";
import type { CatalogView } from "../../../shared/credits";
import { newIdempotencyKey } from "../check/api";
import { accountApi, fmtIQD } from "./api";

/** Bundles from the server catalog. The price shown is the server's; the order carries its version. */
export function BuyChecks() {
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    accountApi.catalog().then(setCatalog).catch(() => setCatalog(null));
  }, []);

  if (!catalog?.paymentsEnabled) return null;

  async function buy(productId: string) {
    setBusy(productId);
    setError("");
    try {
      const o = await accountApi.createOrder(productId, catalog!.priceVersion, newIdempotencyKey());
      if (o.redirectUrl) location.assign(o.redirectUrl);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "تعذّر بدء الدفع. حاول مرة أخرى.");
      setBusy(null);
    }
  }

  const single = catalog.products.find((p) => p.units === 1);
  return (
    <section className="buy" aria-labelledby="buy-title">
      <h3 id="buy-title">فحوص إضافية — {fmtIQD(catalog.unitPriceIQD)} للفحص</h3>
      <div className="bundles">
        {catalog.products
          .filter((p) => p.available)
          .map((p) => (
            <button key={p.productId} type="button" className="bundle" onClick={() => void buy(p.productId)} disabled={busy !== null}>
              <span className="bundle-units">
                <bdi>{p.units}</bdi> فحوص
              </span>
              <span className="bundle-price">{fmtIQD(p.priceIQD)}</span>
              <span className="bundle-note">{busy === p.productId ? "جارٍ التحويل إلى زين كاش…" : "ادفع عبر زين كاش"}</span>
            </button>
          ))}
      </div>
      {single && !single.available && single.noteAr && <p className="meta">{single.noteAr}</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Shown after ZainCash sends the customer back: the server has already asked ZainCash for the real status. */
export function PaymentBanner({ onSettled }: { onSettled: () => void }) {
  const params = new URLSearchParams(location.search);
  const initial = params.get("payment");
  const orderId = params.get("order");
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (state !== "pending" || !orderId) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      accountApi
        .order(orderId)
        .then((o) => {
          if (o.status === "paid") setState("success");
          else if (o.status === "failed" || o.status === "expired") setState("failed");
        })
        .catch(() => {});
      if (tries > 20) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [state, orderId]);

  useEffect(() => {
    if (state === "success") onSettled();
  }, [state, onSettled]);

  if (!state) return null;
  const text =
    state === "success"
      ? "تم الدفع وأُضيفت الفحوص إلى رصيدك."
      : state === "failed"
        ? "لم يكتمل الدفع حسب زين كاش، ولم نُضف فحوصاً. إذا خُصم مبلغ من محفظتك فتواصل معنا مع رقم الطلب."
        : state === "pending"
          ? "ننتظر تأكيد زين كاش للدفع… سنحدّث رصيدك تلقائياً."
          : "لم نتعرف على عملية الدفع.";
  return (
    <div className={`banner ${state}`} role="status">
      <p>{text}</p>
      <button
        type="button"
        className="btn ghost small"
        onClick={() => {
          history.replaceState(null, "", location.pathname);
          setState(null);
        }}
      >
        إغلاق
      </button>
    </div>
  );
}
