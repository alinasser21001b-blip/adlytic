import { describe, expect, inject, it } from "vitest";
import { PRICE_VERSION } from "../../shared/credits";
import { Client, d1, login, mockState, sleep, TINY_JPEG } from "../support/client";
import { urlOf } from "../support/instances";

// Accounts instance: V2 analyzer, Google login against a fake IdP that checks
// PKCE, a 4-second refill "day" and a 6-second lease.
const ACC = urlOf("accounts");
const DIR = () => inject("d1Dirs").accounts!;
const REFILL = 4000;

async function balance(c: Client) {
  const r = await c.req("GET", "/api/balance");
  expect(r.status).toBe(200);
  return r.body as { freeAvailable: number; freeHeld: number; paidAvailable: number; nextRefillAt: string; unitPriceIQD: number; policyVersion: string; priceVersion: string; serverNow: string };
}

describe("login (Google OIDC with state, nonce, PKCE)", () => {
  it("advertises accounts and refuses checks without a login", async () => {
    const c = new Client(ACC);
    const s = await c.session();
    expect(s.body.accounts).toEqual({ enabled: true, loginAvailable: true, loggedIn: false, paymentsEnabled: false });
    const r = await c.check({ adCopy: "كنبة" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("LOGIN_REQUIRED");
  });

  it("sends a code flow with S256 PKCE, state and nonce, and binds the state to a cookie", async () => {
    const c = new Client(ACC);
    await c.session();
    const start = await c.nav("/api/auth/google/start?returnTo=/r/abc");
    expect(start.status).toBe(302);
    const u = new URL(start.location);
    expect(u.pathname).toBe("/o/oauth2/v2/auth");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("openid");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(u.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(u.searchParams.get("redirect_uri")).toBe(`${ACC}/api/auth/google/callback`);
    expect(c.jar.get("ac_oauth")).toBe(u.searchParams.get("state"));
  });

  it("logs in, creates the account once with 2 free checks, and returns to the page", async () => {
    const c = new Client(ACC);
    expect(await login(c, "sub-first-login", "/r/somewhere")).toBe("/r/somewhere");
    expect(c.jar.has("ac_uid")).toBe(true);
    expect(c.jar.has("ac_oauth")).toBe(false);
    const me = await c.req("GET", "/api/me");
    expect(me.body.user.provider).toBe("google");
    expect(me.body.balance).toMatchObject({ freeAvailable: 2, freeHeld: 0, paidAvailable: 0, unitPriceIQD: 500, priceVersion: PRICE_VERSION, policyVersion: "free-2-plus-1-per-24h-cap-2@1" });
    // Second login (another device) → same account, no second grant.
    const other = new Client(ACC);
    await login(other, "sub-first-login");
    expect((await other.req("GET", "/api/me")).body.user.id).toBe(me.body.user.id);
    const grants = d1(DIR(), `SELECT COUNT(*) AS n FROM free_grants WHERE user_id = '${me.body.user.id}'`);
    expect(grants[0].n).toBe(1);
    // No e-mail or name is stored.
    const cols = d1(DIR(), "PRAGMA table_info(identities)").map((r: { name: string }) => r.name);
    expect(cols).not.toContain("email");
  });

  it.each([
    ["wrong-aud", "failed"],
    ["wrong-nonce", "failed"],
    ["expired", "failed"],
    ["wrong-iss", "failed"],
    ["deny", "cancelled"],
  ])("rejects a bad ID token or a cancel (%s)", async (sub, outcome) => {
    const c = new Client(ACC);
    expect(await login(c, sub)).toBe(`/?auth=${outcome}`);
    expect(c.jar.has("ac_uid")).toBe(false);
  });

  it("rejects a callback whose state does not match the browser's cookie, or is replayed", async () => {
    const c = new Client(ACC);
    await c.session();
    const start = await c.nav("/api/auth/google/start");
    const idp = new URL(start.location);
    idp.searchParams.set("sub", "sub-state");
    const back = new URL((await fetch(idp, { redirect: "manual" })).headers.get("location")!);
    // Attacker's browser (different cookies) tries to finish the victim's login.
    const attacker = new Client(ACC);
    await attacker.session();
    expect((await attacker.nav(back.toString())).location).toBe("/?auth=failed");
    // The real browser finishes once; replaying the same callback fails.
    expect((await c.nav(back.toString())).location).toBe("/");
    c.jar.set("ac_oauth", back.searchParams.get("state")!);
    expect((await c.nav(back.toString())).location).toBe("/?auth=failed");
  });

  it("rejects a PKCE verifier that does not match (token endpoint refuses)", async () => {
    const c = new Client(ACC);
    await c.session();
    const start = await c.nav("/api/auth/google/start");
    const idp = new URL(start.location);
    idp.searchParams.set("sub", "sub-pkce");
    idp.searchParams.set("code_challenge", "A".repeat(43)); // challenge swapped in transit
    const back = (await fetch(idp, { redirect: "manual" })).headers.get("location")!;
    expect((await c.nav(back)).location).toBe("/?auth=failed");
  });

  it("logout ends the session", async () => {
    const c = new Client(ACC);
    await login(c, "sub-logout");
    expect((await c.req("POST", "/api/auth/logout")).status).toBe(204);
    expect((await c.req("GET", "/api/me")).body.user).toBeNull();
    expect((await c.req("GET", "/api/balance")).status).toBe(401);
  });

  it("moves the guest browser's reports into the account (proof: the bound login transaction)", async () => {
    const c = new Client(ACC);
    await c.session();
    const visitor = d1(DIR(), "SELECT id FROM visitors ORDER BY created_at DESC LIMIT 1")[0].id as string;
    const now = Date.now();
    const report = JSON.stringify({ schemaVersion: "1", id: "guestrep01", mode: "text_only", industry: "furniture", goal: "messages", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(), assessments: { hook: { status: "strong" }, messageClarity: { status: "strong" }, visualReadability: { status: "not_assessed" }, callToAction: { status: "strong" } }, shareableTips: [] });
    d1(DIR(), `INSERT INTO analyses (id, visitor_id, idempotency_key, input_hash, status, mode, industry, goal, created_at, reservation_expires_at, expires_at, report_json)
               VALUES ('guestrep01', '${visitor}', 'k-guestrep01-xxxxxxxx', 'h', 'completed', 'text_only', 'furniture', 'messages', ${now}, ${now}, ${now + 86_400_000}, '${report.replace(/'/g, "''")}')`);
    expect((await c.req("GET", "/api/reports/guestrep01")).status).toBe(200);
    await login(c, "sub-migrate");
    // Another device of the same account can now read it…
    const phone = new Client(ACC);
    await login(phone, "sub-migrate");
    expect((await phone.req("GET", "/api/reports/guestrep01")).status).toBe(200);
    // …while the guest cookie alone (logged out) no longer owns it.
    await c.req("POST", "/api/auth/logout");
    expect((await c.req("GET", "/api/reports/guestrep01")).status).toBe(404);
  });
});

describe("free quota: 2 on activation, +1 per period, cap 2", () => {
  it("spends one unit per completed V2 report and refuses the third with the next refill time", async () => {
    const c = new Client(ACC);
    await login(c, "sub-quota");
    const r1 = await c.check({ adCopy: "كنبة مخمل. راسلنا", image: { bytes: TINY_JPEG } });
    expect(r1.status).toBe(200);
    expect(r1.body.schemaVersion).toBe("2");
    expect(r1.body.versions).toMatchObject({ rubricVersion: "rubric-1", knowledgeVersion: expect.stringMatching(/^kb-/), promptVersion: expect.stringMatching(/^v2-/) });
    expect(r1.body.index.shown).toBe(false);
    expect((await c.check({ adCopy: "كنبة مخمل 2" })).status).toBe(200);
    const b = await balance(c);
    expect(b).toMatchObject({ freeAvailable: 0, freeHeld: 0 });
    const r3 = await c.check({ adCopy: "كنبة مخمل 3" });
    expect(r3.status).toBe(429);
    expect(r3.body.error.code).toBe("FREE_QUOTA_EXHAUSTED");
    expect(Number(r3.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Date.parse(b.nextRefillAt)).toBeGreaterThan(Date.parse(b.serverNow));
  });

  it("adds one unit per period and never more than two, even after a long idle time", async () => {
    const c = new Client(ACC);
    await login(c, "sub-refill");
    await c.check({ adCopy: "أ" });
    await c.check({ adCopy: "ب" });
    expect((await balance(c)).freeAvailable).toBe(0);
    const b0 = await balance(c);
    await sleep(Date.parse(b0.nextRefillAt) - Date.parse(b0.serverNow) + 300);
    expect((await balance(c)).freeAvailable).toBe(1);
    await sleep(REFILL);
    expect((await balance(c)).freeAvailable).toBe(2);
    await sleep(REFILL * 2);
    expect((await balance(c)).freeAvailable).toBe(2); // cap: no accumulation
  });

  it("five concurrent checks with two free units: exactly two succeed, one provider call each", async () => {
    const c = new Client(ACC);
    await login(c, "sub-race");
    const before = (await mockState()).calls;
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => c.check({ adCopy: `سباق ${i}` })));
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([200, 200, 429, 429, 429]);
    expect((await mockState()).calls - before).toBe(2);
    const b = await balance(c);
    expect(b.freeAvailable + b.freeHeld).toBeLessThanOrEqual(2);
    expect(b.freeAvailable).toBe(0);
  });

  it("a failed analysis returns the unit; deleting a report does not", async () => {
    const c = new Client(ACC);
    await login(c, "sub-release");
    const f = await c.check({ adCopy: "فشل [[MOCK:500]]" });
    expect(f.status).toBe(503);
    expect((await balance(c)).freeAvailable).toBe(2);
    const ok = await c.check({ adCopy: "نجاح" });
    expect(ok.status).toBe(200);
    expect((await c.req("DELETE", `/api/reports/${ok.body.id}`)).status).toBe(204);
    expect((await balance(c)).freeAvailable).toBe(1);
  });

  it("an expired lease cannot publish and its unit comes back", async () => {
    const c = new Client(ACC);
    await login(c, "sub-lease");
    const slow = await c.check({ adCopy: "بطيء [[MOCK:slow:8000]]" });
    expect(slow.status).toBe(503);
    const b = await balance(c);
    expect(b).toMatchObject({ freeAvailable: 2, freeHeld: 0 });
    const rows = d1(DIR(), `SELECT status, error_code FROM analyses WHERE user_id = (SELECT user_id FROM identities WHERE subject = 'sub-lease')`);
    expect(rows).toEqual([{ status: "failed", error_code: "reservation_expired" }]);
  });

  it("never spends a paid unit without consent, and checks the price version", async () => {
    const c = new Client(ACC);
    await login(c, "sub-paid");
    const uid = (await c.req("GET", "/api/me")).body.user.id as string;
    expect((await c.check({ adCopy: "مدفوع", credit: "paid", priceVersion: PRICE_VERSION })).body.error.code).toBe("INSUFFICIENT_CREDITS");
    d1(DIR(), `UPDATE paid_balance SET available = 3 WHERE user_id = '${uid}'`);
    await c.check({ adCopy: "١" });
    await c.check({ adCopy: "٢" });
    const ask = await c.check({ adCopy: "٣" });
    expect(ask.status).toBe(409);
    expect(ask.body.error.code).toBe("PAID_CONSENT_REQUIRED");
    expect((await balance(c)).paidAvailable).toBe(3);
    expect((await c.check({ adCopy: "٣", credit: "paid", priceVersion: "iqd-400@0" })).body.error.code).toBe("PRICE_CHANGED");
    const paid = await c.check({ adCopy: "٣", credit: "paid", priceVersion: PRICE_VERSION });
    expect(paid.status).toBe(200);
    const b = await balance(c);
    expect(b).toMatchObject({ freeAvailable: 0, paidAvailable: 2 });
    const ledger = d1(DIR(), `SELECT bucket, delta, reason FROM credit_ledger WHERE user_id = '${uid}' AND bucket = 'paid'`);
    expect(ledger).toEqual([{ bucket: "paid", delta: -1, reason: "reserve" }, { bucket: "paid", delta: 0, reason: "consume" }]);
  });
});

describe("ownership with accounts", () => {
  it("another account cannot read, share or delete my report", async () => {
    const a = new Client(ACC);
    await login(a, "sub-owner-a");
    const r = await a.check({ adCopy: "ملكي" });
    expect(r.status).toBe(200);
    const b = new Client(ACC);
    await login(b, "sub-owner-b");
    expect((await b.req("GET", `/api/reports/${r.body.id}`)).status).toBe(404);
    expect((await b.req("POST", `/api/reports/${r.body.id}/share`)).status).toBe(404);
    expect((await b.req("DELETE", `/api/reports/${r.body.id}`)).status).toBe(404);
    expect((await a.req("GET", `/api/reports/${r.body.id}`)).status).toBe(200);
  });

  it("a V2 report shares through the same allowlisted public view", async () => {
    const a = new Client(ACC);
    await login(a, "sub-share");
    const r = await a.check({ adCopy: "كنبة زيتونية بسعر 35000", image: { bytes: TINY_JPEG } });
    const share = await a.req("POST", `/api/reports/${r.body.id}/share`);
    const page = await fetch(share.body.url);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).not.toContain("زيتونية");
    expect(html).not.toContain("35000");
    expect(html).not.toContain("كنبة مخمل"); // evidence text stays private
  });
});

describe("provider billing refusal", () => {
  it("pauses analysis instead of asking to retry, refunds the unit and flags readiness", async () => {
    const c = new Client(ACC);
    await login(c, "sub-billing");
    const r = await c.check({ adCopy: "رصيد [[MOCK:credit]]" });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatchObject({ code: "ANALYSIS_DISABLED", retryable: false });
    expect((await balance(c)).freeAvailable).toBe(2);
    const h = (await (await fetch(`${ACC}/api/health`)).json()) as { ready: boolean; readiness: Record<string, boolean> };
    expect(h.readiness.providerUsable).toBe(false);
    expect(h.ready).toBe(false);
    expect((await c.session()).body.analysisAvailable).toBe(false);
  });
});
