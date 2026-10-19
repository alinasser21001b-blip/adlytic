import { describe, expect, inject, it } from "vitest";
import { PRICE_VERSION } from "../../shared/credits";
import { Client, d1, login, newKey } from "../support/client";
import { MOCK, urlOf } from "../support/instances";

// ZainCash v2 against a local fake gateway. Credits move only after a
// server-to-server inquiry says "paid" with the exact amount.
const ACC = urlOf("accounts");
const DIR = () => inject("d1Dirs").accounts!;

async function paid(c: Client): Promise<number> {
  return (await c.req("GET", "/api/balance")).body.paidAvailable;
}

async function order(c: Client, productId = "check_5", key = newKey()) {
  return c.req("POST", "/api/payments/orders", { productId, priceVersion: PRICE_VERSION, idempotencyKey: key });
}

/** Customer pays on the gateway page and comes back to our return URL. */
async function payAndReturn(c: Client, redirectUrl: string, query = "") {
  const gw = await fetch(`${redirectUrl}${query}`, { redirect: "manual" });
  const back = gw.headers.get("location")!;
  return { back, final: (await c.nav(back)).location };
}

describe("payments catalog", () => {
  it("prices in integer IQD, 500 per check, single unit withheld with a reason", async () => {
    const r = await new Client(ACC).req("GET", "/api/payments/catalog");
    expect(r.body).toMatchObject({ priceVersion: PRICE_VERSION, unitPriceIQD: 500, paymentsEnabled: true, provider: "zaincash" });
    const byId = Object.fromEntries((r.body.products as Array<{ productId: string }>).map((p) => [p.productId, p]));
    expect(byId.check_1).toMatchObject({ units: 1, priceIQD: 500, available: false });
    expect((byId.check_1 as unknown as { noteAr: string }).noteAr).toContain("رسوم");
    expect(byId.check_5).toMatchObject({ units: 5, priceIQD: 2500, unitPriceIQD: 500, available: true });
    expect(byId.check_10).toMatchObject({ units: 10, priceIQD: 5000, unitPriceIQD: 500, available: true });
  });
});

describe("purchase flow", () => {
  it("refuses guests, stale prices and unavailable products", async () => {
    const guest = new Client(ACC);
    await guest.session();
    expect((await order(guest)).status).toBe(401);
    const c = new Client(ACC);
    await login(c, "sub-pay-guards");
    expect((await c.req("POST", "/api/payments/orders", { productId: "check_5", priceVersion: "iqd-450@0", idempotencyKey: newKey() })).body.error.code).toBe("PRICE_CHANGED");
    expect((await order(c, "check_1")).status).toBe(400);
    expect((await order(c, "check_999")).status).toBe(400);
  });

  it("credits exactly once after the gateway confirms — return replay and webhook do not double it", async () => {
    const c = new Client(ACC);
    await login(c, "sub-pay-ok");
    const key = newKey();
    const o = await order(c, "check_5", key);
    expect(o.status).toBe(201);
    expect(o.body.redirectUrl).toMatch(/\/zc\/pay\//);
    // Same idempotency key → same order, no second gateway transaction.
    expect((await order(c, "check_5", key)).body.orderId).toBe(o.body.orderId);
    const { back, final } = await payAndReturn(c, o.body.redirectUrl);
    expect(final).toBe(`/?payment=success&order=${o.body.orderId}`);
    expect(await paid(c)).toBe(5);
    await c.nav(back); // browser refresh / replay
    const hook = await fetch(`${ACC}/api/payments/zaincash/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalReferenceId: o.body.orderId }) });
    expect(hook.status).toBe(200);
    expect(await paid(c)).toBe(5);
    const uid = (await c.req("GET", "/api/me")).body.user.id;
    expect(d1(DIR(), `SELECT delta, reason FROM credit_ledger WHERE user_id = '${uid}' AND reason = 'purchase'`)).toEqual([{ delta: 5, reason: "purchase" }]);
    expect((await c.req("GET", `/api/payments/orders/${o.body.orderId}`)).body).toMatchObject({ status: "paid", units: 5, amountIQD: 2500 });
  });

  it("a failed payment credits nothing", async () => {
    const c = new Client(ACC);
    await login(c, "sub-pay-fail");
    const o = await order(c);
    const { final } = await payAndReturn(c, o.body.redirectUrl, "?result=fail");
    expect(final).toBe(`/?payment=failed&order=${o.body.orderId}`);
    expect(await paid(c)).toBe(0);
  });

  it("a forged return or webhook for an unpaid order credits nothing", async () => {
    const c = new Client(ACC);
    await login(c, "sub-pay-forge");
    const o = await order(c);
    const fakeToken = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ data: { externalReferenceId: o.body.orderId, currentStatus: "SUCCESS" } })).toString("base64url")}.`;
    expect((await c.nav(`/api/payments/return?order=${o.body.orderId}&token=${fakeToken}`)).location).toBe(`/?payment=pending&order=${o.body.orderId}`);
    await fetch(`${ACC}/api/payments/zaincash/webhook`, { method: "POST", body: fakeToken });
    expect(await paid(c)).toBe(0);
  });

  it("a paid amount different from the order is never credited", async () => {
    const c = new Client(ACC);
    await login(c, "sub-pay-amount");
    const o = await order(c);
    const { final } = await payAndReturn(c, o.body.redirectUrl, "?amount=500");
    expect(final).toBe(`/?payment=pending&order=${o.body.orderId}`);
    expect(await paid(c)).toBe(0);
  });

  it("orders are private to their owner", async () => {
    const a = new Client(ACC);
    await login(a, "sub-pay-owner-a");
    const o = await order(a);
    const b = new Client(ACC);
    await login(b, "sub-pay-owner-b");
    expect((await b.req("GET", `/api/payments/orders/${o.body.orderId}`)).status).toBe(404);
  });

  it("purchased units pay for a check only with consent", async () => {
    const c = new Client(ACC);
    await login(c, "sub-pay-spend");
    const o = await order(c);
    await payAndReturn(c, o.body.redirectUrl);
    expect(await paid(c)).toBe(5);
    await c.check({ adCopy: "أ" });
    await c.check({ adCopy: "ب" });
    expect((await c.check({ adCopy: "ج" })).body.error.code).toBe("PAID_CONSENT_REQUIRED");
    expect((await c.check({ adCopy: "ج", credit: "paid", priceVersion: PRICE_VERSION })).status).toBe(200);
    expect(await paid(c)).toBe(4);
  });

  it("the gateway webhook needs no browser Origin, every other mutation still does", async () => {
    expect((await fetch(`${ACC}/api/payments/zaincash/webhook`, { method: "POST", body: "{}" })).status).toBe(200);
    expect((await fetch(`${ACC}/api/payments/orders`, { method: "POST", body: "{}" })).status).toBe(403);
    expect(MOCK).toMatch(/^http:\/\/127\.0\.0\.1/);
  });
});
