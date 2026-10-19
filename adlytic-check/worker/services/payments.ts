import { CATALOG, PRICE_VERSION, UNIT_PRICE_IQD, type CatalogView, type OrderView, type ProductId } from "../../shared/credits";
import { config, HttpError, randomToken, sha256Hex, type Bindings, type Ctx } from "../lib";
import { requireUser } from "./auth";
import { recordEvent } from "./events";

// Paid checks through ZainCash Payment Gateway API v2 (docs.zaincash.iq, read
// via search excerpts only — see research S18). The flow is built so that no
// unverified input can move credits:
//   init (server→gateway, OAuth2 client credentials) → customer pays on ZainCash
//   → redirect back (a hint) / webhook (a hint) → INQUIRY (server→gateway) is the
//   only thing that can mark an order paid → credits granted once (ledger UNIQUE).
// Field names below follow the published v2 excerpts and are isolated in
// `zaincashGateway` so they can be corrected against the full docs without
// touching the order/credit logic.

export interface GatewayInit {
  transactionId: string;
  redirectUrl: string;
}
export type GatewayStatus = "paid" | "failed" | "pending";

export interface PaymentGateway {
  readonly name: string;
  init(order: { orderId: string; amountIQD: number; successUrl: string; failureUrl: string; description: string }): Promise<GatewayInit>;
  inquiry(transactionId: string): Promise<{ status: GatewayStatus; amountIQD: number | null; raw: string }>;
}

const ZAINCASH_BASE = { uat: "https://pg-api-uat.zaincash.iq", production: "https://pg-api.zaincash.iq" } as const;

function gatewayBase(env: Bindings): string {
  const e = env as unknown as Record<string, string | undefined>;
  const cfg = config(env);
  if (!cfg.production && e.ZAINCASH_BASE_URL) return e.ZAINCASH_BASE_URL;
  return e.ZAINCASH_ENV === "production" ? ZAINCASH_BASE.production : ZAINCASH_BASE.uat;
}

export function zaincashGateway(env: Bindings): PaymentGateway {
  const base = gatewayBase(env);
  const e = env as unknown as Record<string, string | undefined>;
  let token: { value: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.until > Date.now() + 30_000) return token.value;
    const res = await fetch(`${base}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: e.ZAINCASH_CLIENT_ID ?? "", client_secret: e.ZAINCASH_CLIENT_SECRET ?? "", scope: "payment:read payment:write" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`gateway_token_http_${res.status}`);
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error("gateway_token_missing");
    token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 300) * 1000 };
    return token.value;
  }

  return {
    name: "zaincash",
    async init(o) {
      const res = await fetch(`${base}/api/v2/payment-gateway/transaction/init`, {
        method: "POST",
        headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ amount: o.amountIQD, currency: "IQD", externalReferenceId: o.orderId, successUrl: o.successUrl, failureUrl: o.failureUrl, description: o.description }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`gateway_init_http_${res.status}`);
      const j = (await res.json()) as { data?: { transactionId?: string; redirectUrl?: string }; transactionId?: string; redirectUrl?: string };
      const transactionId = j.data?.transactionId ?? j.transactionId;
      const redirectUrl = j.data?.redirectUrl ?? j.redirectUrl;
      if (!transactionId || !redirectUrl || !/^https?:\/\//.test(redirectUrl)) throw new Error("gateway_init_malformed");
      return { transactionId, redirectUrl };
    },
    async inquiry(transactionId) {
      const res = await fetch(`${base}/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(transactionId)}`, {
        headers: { authorization: `Bearer ${await accessToken()}`, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`gateway_inquiry_http_${res.status}`);
      const j = JSON.parse(raw) as { data?: { currentStatus?: string; status?: string; amount?: number }; currentStatus?: string; status?: string; amount?: number };
      const s = String(j.data?.currentStatus ?? j.data?.status ?? j.currentStatus ?? j.status ?? "").toUpperCase();
      const amount = Number(j.data?.amount ?? j.amount);
      const status: GatewayStatus = /^(SUCCESS|SUCCEEDED|COMPLETED|PAID)$/.test(s) ? "paid" : /^(FAILED|FAILURE|CANCELLED|CANCELED|EXPIRED|REJECTED|DECLINED)$/.test(s) ? "failed" : "pending";
      return { status, amountIQD: Number.isFinite(amount) ? amount : null, raw };
    },
  };
}

export function paymentsReady(env: Bindings): boolean {
  const cfg = config(env);
  const e = env as unknown as Record<string, string | undefined>;
  return cfg.paymentsEnabled && cfg.accountsEnabled && Boolean(e.ZAINCASH_CLIENT_ID && e.ZAINCASH_CLIENT_SECRET);
}

function singleUnitAllowed(env: Bindings): boolean {
  return (env as unknown as Record<string, string | undefined>).SINGLE_UNIT_PURCHASE === "true";
}

export function catalogView(env: Bindings): CatalogView {
  const single = singleUnitAllowed(env);
  return {
    priceVersion: PRICE_VERSION,
    unitPriceIQD: UNIT_PRICE_IQD,
    paymentsEnabled: paymentsReady(env),
    provider: "zaincash",
    products: CATALOG.map((p) => ({
      productId: p.productId,
      units: p.units,
      priceIQD: p.priceIQD,
      unitPriceIQD: p.priceIQD / p.units,
      available: p.units > 1 || single,
      ...(p.units === 1 && !single ? { noteAr: "رسوم الدفع الإلكتروني لا تجعل شراء فحص واحد ممكناً؛ أصغر باقة 5 فحوص بنفس سعر الفحص (500 دينار)." } : {}),
    })),
  };
}

async function logEvent(db: D1Database, orderId: string | null, kind: string, status: string | null, verified: boolean, payload: string | null) {
  await db
    .prepare("INSERT INTO payment_events (order_id, provider, kind, provider_status, verified, payload_hash, created_at) VALUES (?1, 'zaincash', ?2, ?3, ?4, ?5, ?6)")
    .bind(orderId, kind, status, verified ? 1 : 0, payload ? await sha256Hex(payload) : null, Date.now())
    .run();
}

/** POST /api/payments/orders — {productId, priceVersion, idempotencyKey} */
export async function createOrder(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  if (!paymentsReady(c.env)) throw new HttpError(503, "PAYMENTS_UNAVAILABLE", { retryable: false });
  let body: { productId?: string; priceVersion?: string; idempotencyKey?: string };
  try {
    body = JSON.parse(await c.req.text());
  } catch {
    throw new HttpError(400, "INVALID_INPUT");
  }
  if (body.priceVersion !== PRICE_VERSION) throw new HttpError(409, "PRICE_CHANGED", { retryable: false });
  const product = catalogView(c.env).products.find((p) => p.productId === body.productId && p.available);
  if (!product || !/^[A-Za-z0-9_-]{16,64}$/.test(body.idempotencyKey ?? "")) throw new HttpError(400, "INVALID_INPUT");
  const db = c.env.DB;
  const existing = await db
    .prepare("SELECT id, status, provider_tx_id, product_id FROM payment_orders WHERE user_id = ?1 AND idempotency_key = ?2")
    .bind(user.id, body.idempotencyKey)
    .first<{ id: string; status: string; provider_tx_id: string | null; product_id: string }>();
  if (existing) {
    if (existing.product_id !== product.productId) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", { retryable: false });
    return c.json({ orderId: existing.id, status: existing.status }, 200, { "Cache-Control": "no-store" });
  }
  const now = Date.now();
  const orderId = `ord_${randomToken(12)}`;
  await db
    .prepare(
      `INSERT INTO payment_orders (id, user_id, product_id, units, amount_iqd, price_version, provider, status, idempotency_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'zaincash', 'created', ?7, ?8, ?8)`,
    )
    .bind(orderId, user.id, product.productId, product.units, product.priceIQD, PRICE_VERSION, body.idempotencyKey, now)
    .run();
  const origin = new URL(c.req.url).origin;
  let init: GatewayInit;
  try {
    init = await zaincashGateway(c.env).init({
      orderId,
      amountIQD: product.priceIQD,
      successUrl: `${origin}/api/payments/return?order=${orderId}`,
      failureUrl: `${origin}/api/payments/return?order=${orderId}`,
      description: `Adlytic Check — ${product.units} checks`,
    });
  } catch (err) {
    console.warn(`[payments] init failed: ${err instanceof Error ? err.message : "error"}`);
    await db.prepare("UPDATE payment_orders SET status = 'failed', updated_at = ?2 WHERE id = ?1").bind(orderId, Date.now()).run();
    throw new HttpError(503, "PAYMENTS_UNAVAILABLE", { retryable: true });
  }
  await db.prepare("UPDATE payment_orders SET status = 'pending', provider_tx_id = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'created'").bind(orderId, init.transactionId, Date.now()).run();
  await logEvent(db, orderId, "init", "pending", true, null);
  c.executionCtx.waitUntil(recordEvent(db, "payment_started", null, null, { productId: product.productId, amountIQD: product.priceIQD }));
  return c.json({ orderId, status: "pending", redirectUrl: init.redirectUrl }, 201, { "Cache-Control": "no-store" });
}

/**
 * Confirm an order with the gateway and grant credits exactly once.
 * The only path that can set status 'paid'.
 */
export async function settleOrder(env: Bindings, orderId: string, kind: "redirect" | "webhook" | "inquiry" | "reconcile"): Promise<OrderView["status"]> {
  const db = env.DB;
  const order = await db
    .prepare("SELECT id, user_id, units, amount_iqd, provider_tx_id, status FROM payment_orders WHERE id = ?1")
    .bind(orderId)
    .first<{ id: string; user_id: string; units: number; amount_iqd: number; provider_tx_id: string | null; status: OrderView["status"] }>();
  if (!order) throw new HttpError(404, "PAYMENT_NOT_FOUND");
  if (order.status === "paid" || order.status === "failed" || order.status === "expired" || !order.provider_tx_id) return order.status;
  const r = await zaincashGateway(env).inquiry(order.provider_tx_id);
  await logEvent(db, order.id, kind === "reconcile" ? "reconcile" : "inquiry", r.status, true, r.raw);
  const now = Date.now();
  if (r.status === "paid") {
    // Amount must match what we asked for; anything else is held for review, never credited.
    if (r.amountIQD !== null && r.amountIQD !== order.amount_iqd) {
      console.error(`[payments] amount mismatch order=${order.id}`);
      return "pending";
    }
    await db.batch([
      db
        .prepare(`UPDATE paid_balance SET available = available + ?2, updated_at = ?3 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM payment_orders WHERE id = ?4 AND credited_at IS NULL)`)
        .bind(order.user_id, order.units, now, order.id),
      db
        .prepare(
          `INSERT OR IGNORE INTO credit_ledger (user_id, bucket, delta, reason, ref, created_at)
           SELECT ?1, 'paid', ?2, 'purchase', ?3, ?4 WHERE EXISTS (SELECT 1 FROM payment_orders WHERE id = ?3 AND credited_at IS NULL)`,
        )
        .bind(order.user_id, order.units, order.id, now),
      db.prepare(`UPDATE payment_orders SET status = 'paid', paid_at = ?2, credited_at = ?2, updated_at = ?2 WHERE id = ?1 AND credited_at IS NULL`).bind(order.id, now),
    ]);
    return "paid";
  }
  if (r.status === "failed") {
    await db.prepare("UPDATE payment_orders SET status = 'failed', updated_at = ?2 WHERE id = ?1 AND status IN ('created', 'pending')").bind(order.id, now).run();
    return "failed";
  }
  return "pending";
}

/** GET /api/payments/return?order=… — the customer's browser coming back from ZainCash. */
export async function paymentReturn(c: Ctx): Promise<Response> {
  const orderId = c.req.query("order") ?? "";
  if (!/^ord_[A-Za-z0-9_-]{16}$/.test(orderId)) return c.redirect("/?payment=unknown", 302);
  // The redirect token is a hint only; its payload hash is logged, the inquiry decides.
  const hint = c.req.query("token");
  await logEvent(c.env.DB, orderId, "redirect", null, false, hint ?? null);
  let status: OrderView["status"] = "pending";
  try {
    status = await settleOrder(c.env, orderId, "redirect");
  } catch (err) {
    if (err instanceof HttpError) return c.redirect("/?payment=unknown", 302);
    console.warn(`[payments] inquiry on return failed: ${err instanceof Error ? err.message : "error"}`);
  }
  return c.redirect(`/?payment=${status === "paid" ? "success" : status === "failed" ? "failed" : "pending"}&order=${orderId}`, 302);
}

/** POST /api/payments/zaincash/webhook — treated as a hint; the inquiry decides. */
export async function paymentWebhook(c: Ctx): Promise<Response> {
  const raw = (await c.req.text()).slice(0, 16_384);
  const orderId = extractOrderId(raw);
  await logEvent(c.env.DB, orderId, "webhook", null, false, raw);
  if (orderId) {
    try {
      await settleOrder(c.env, orderId, "webhook");
    } catch (err) {
      if (!(err instanceof HttpError)) console.warn(`[payments] webhook inquiry failed: ${err instanceof Error ? err.message : "error"}`);
    }
  }
  return c.json({ received: true }, 200);
}

/** Pull our order id out of a JSON body or a JWT payload without trusting either. */
export function extractOrderId(raw: string): string | null {
  const find = (s: string) => s.match(/ord_[A-Za-z0-9_-]{16}/)?.[0] ?? null;
  const direct = find(raw);
  if (direct) return direct;
  const jwt = raw.match(/[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/);
  if (jwt) {
    try {
      const b64 = jwt[1]!.replace(/-/g, "+").replace(/_/g, "/");
      return find(atob(b64 + "===".slice((b64.length + 3) % 4)));
    } catch {
      return null;
    }
  }
  return null;
}

/** GET /api/payments/orders/:id — owner only. */
export async function getOrder(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  const row = await c.env.DB.prepare("SELECT id, status, product_id, units, amount_iqd, created_at FROM payment_orders WHERE id = ?1 AND user_id = ?2")
    .bind(c.req.param("id") ?? "", user.id)
    .first<{ id: string; status: OrderView["status"]; product_id: string; units: number; amount_iqd: number; created_at: number }>();
  if (!row) throw new HttpError(404, "PAYMENT_NOT_FOUND");
  const view: OrderView = { orderId: row.id, status: row.status, productId: row.product_id, units: row.units, amountIQD: row.amount_iqd, createdAt: new Date(row.created_at).toISOString() };
  return c.json(view, 200, { "Cache-Control": "no-store" });
}

/**
 * Cron: confirm pending orders with the gateway, expire abandoned ones, and
 * check that every paid balance equals its ledger.
 */
export async function reconcilePayments(env: Bindings, now = Date.now()): Promise<void> {
  if (!paymentsReady(env)) return;
  const db = env.DB;
  const run = await db.prepare("INSERT INTO reconciliation_runs (started_at) VALUES (?1) RETURNING id").bind(now).first<{ id: number }>();
  const pending = await db
    .prepare("SELECT id, created_at FROM payment_orders WHERE status IN ('created', 'pending') AND created_at < ?1 ORDER BY created_at LIMIT 50")
    .bind(now - 2 * 60_000)
    .all<{ id: string; created_at: number }>();
  let credited = 0;
  let failed = 0;
  for (const o of pending.results) {
    try {
      const s = await settleOrder(env, o.id, "reconcile");
      if (s === "paid") credited++;
      else if (s === "failed") failed++;
      else if (o.created_at < now - 48 * 3_600_000) {
        await db.prepare("UPDATE payment_orders SET status = 'expired', updated_at = ?2 WHERE id = ?1 AND status IN ('created', 'pending')").bind(o.id, now).run();
      }
    } catch (err) {
      console.warn(`[payments] reconcile ${o.id}: ${err instanceof Error ? err.message : "error"}`);
    }
  }
  const mismatch = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM paid_balance p
       WHERE p.available != COALESCE((SELECT SUM(delta) FROM credit_ledger l WHERE l.user_id = p.user_id AND l.bucket = 'paid'), 0)`,
    )
    .first<{ n: number }>();
  if ((mismatch?.n ?? 0) > 0) console.error(`[payments] ledger mismatch for ${mismatch!.n} account(s)`);
  await db
    .prepare("UPDATE reconciliation_runs SET finished_at = ?2, checked = ?3, credited = ?4, failed = ?5, mismatches = ?6 WHERE id = ?1")
    .bind(run!.id, Date.now(), pending.results.length, credited, failed, mismatch?.n ?? 0)
    .run();
}

export function isProductId(v: string): v is ProductId {
  return CATALOG.some((p) => p.productId === v);
}
