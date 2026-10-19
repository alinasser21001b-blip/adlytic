import { Hono } from "hono";
import { config, errorJson, HttpError, type AppEnv, type Bindings } from "./lib";
import { renderShareNotFound, renderSharePage, SHARE_HEADERS } from "./routes/share-page";
import { handleCheck } from "./services/analysis";
import { handleClientEvent, providerBlocked } from "./services/events";
import { createShare, deleteReport, findSharedView, getReport, listReports, revokeShare } from "./services/reports";
import { currentUser, finishGoogleLogin, logout, requireUser, startGoogleLogin } from "./services/auth";
import { balanceOf, sweepExpiredStatements } from "./services/credits";
import { catalogView, createOrder, getOrder, paymentReturn, paymentWebhook, reconcilePayments } from "./services/payments";
import { createVisitor, currentVisitor, sessionInfo } from "./services/session";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  c.set("requestId", c.req.header("cf-ray") ?? crypto.randomUUID());
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  if (!c.res.headers.has("Referrer-Policy")) c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// Mutations must come from our own origin. No CORS is offered to anyone else.
app.use("/api/*", async (c, next) => {
  const m = c.req.method;
  // The gateway's server-to-server webhook carries no browser Origin; it can only trigger an inquiry.
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && new URL(c.req.url).pathname !== "/api/payments/zaincash/webhook") {
    const origin = c.req.header("origin");
    if (!origin || origin !== new URL(c.req.url).origin) throw new HttpError(403, "FORBIDDEN_ORIGIN");
  }
  await next();
});

app.get("/api/health", async (c) => {
  const cfg = config(c.env);
  let database = false;
  try {
    await c.env.DB.prepare("SELECT 1 AS ok").first();
    database = true;
  } catch {
    database = false;
  }
  const readiness = {
    database,
    analysisEnabled: cfg.analysisEnabled,
    providerConfigured: Boolean(c.env.ANTHROPIC_API_KEY),
    turnstileConfigured: Boolean(c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY),
    abuseHashConfigured: Boolean(c.env.IP_HASH_SECRET),
    // false for 15 min after the provider refused a call for billing reasons
    providerUsable: database ? !(await providerBlocked(c.env.DB)) : false,
  };
  return c.json(
    {
      status: database ? "ok" : "degraded",
      service: "adlytic-check",
      build: c.env.BUILD_ID,
      environment: c.env.ENVIRONMENT,
      ready: Object.values(readiness).every(Boolean),
      readiness,
    },
    database ? 200 : 503,
    { "Cache-Control": "no-store" },
  );
});

app.post("/api/session", async (c) => {
  const visitorId = (await currentVisitor(c)) ?? (await createVisitor(c));
  return c.json(await sessionInfo(c, visitorId), 200, { "Cache-Control": "no-store" });
});

app.get("/api/auth/google/start", startGoogleLogin);
app.get("/api/auth/google/callback", finishGoogleLogin);
app.post("/api/auth/logout", logout);

app.get("/api/me", async (c) => {
  const user = await currentUser(c);
  const cfg = config(c.env);
  return c.json(
    { user: user ? { id: user.id, createdAt: new Date(user.createdAt).toISOString(), provider: "google" } : null, balance: user ? await balanceOf(c.env.DB, user.id, Date.now(), cfg.freeRefillMs) : null },
    200,
    { "Cache-Control": "no-store" },
  );
});

app.get("/api/balance", async (c) => {
  const user = await requireUser(c);
  return c.json(await balanceOf(c.env.DB, user.id, Date.now(), config(c.env).freeRefillMs), 200, { "Cache-Control": "no-store" });
});

app.get("/api/payments/catalog", (c) => c.json(catalogView(c.env), 200, { "Cache-Control": "no-store" }));
app.post("/api/payments/orders", createOrder);
app.get("/api/payments/orders/:id", getOrder);
app.get("/api/payments/return", paymentReturn);
app.post("/api/payments/zaincash/webhook", paymentWebhook);

app.post("/api/check", handleCheck);
app.get("/api/reports", listReports);
app.get("/api/reports/:id", getReport);
app.post("/api/reports/:id/share", createShare);
app.delete("/api/reports/:id/share", revokeShare);
app.delete("/api/reports/:id", deleteReport);
app.post("/api/events", handleClientEvent);

app.get("/s/:token", async (c) => {
  const view = await findSharedView(c.env.DB, c.req.param("token"));
  if (!view) return c.body(renderShareNotFound(), 404, SHARE_HEADERS);
  return c.body(renderSharePage(view), 200, SHARE_HEADERS);
});

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) return errorJson(c, new HttpError(404, "NOT_FOUND"));
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  if (err instanceof HttpError) return errorJson(c, err);
  console.error("[unhandled]", err instanceof Error ? `${err.name}: ${err.message}` : err);
  return errorJson(c, new HttpError(500, "INTERNAL", { retryable: true }));
});

/** Daily purge: expired report text and share links, stale reservations, old counters. */
export async function purgeExpired(db: D1Database, now: number): Promise<void> {
  const day = 86_400_000;
  await db.batch([
    // Credited leases first: their units go back before the generic stale sweep marks them failed.
    ...sweepExpiredStatements(db, now),
    db.prepare("UPDATE analyses SET report_json = NULL, share_token_hash = NULL, share_created_at = NULL WHERE expires_at <= ?1 AND report_json IS NOT NULL").bind(now),
    db.prepare("UPDATE analyses SET status = 'failed', error_code = 'reservation_expired' WHERE status = 'pending' AND reservation_expires_at <= ?1").bind(now),
    db.prepare("DELETE FROM analyses WHERE created_at < ?1").bind(now - 30 * day),
    db.prepare("DELETE FROM rate_buckets WHERE window_start < ?1").bind(now - 2 * day),
    db.prepare("DELETE FROM daily_usage WHERE day < ?1").bind(new Date(now - 90 * day).toISOString().slice(0, 10)),
    db.prepare("DELETE FROM product_events WHERE created_at < ?1").bind(now - 180 * day),
    db.prepare("DELETE FROM visitors WHERE last_seen_at < ?1 AND id NOT IN (SELECT visitor_id FROM analyses)").bind(now - 60 * day),
    db.prepare("DELETE FROM oauth_transactions WHERE expires_at < ?1").bind(now - day),
    db.prepare("DELETE FROM auth_sessions WHERE expires_at < ?1 OR revoked_at < ?1").bind(now - 7 * day),
  ]);
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([purgeExpired(env.DB, Date.now()), reconcilePayments(env).catch((e) => console.error("[payments] reconcile run failed", e instanceof Error ? e.message : e))]));
  },
} satisfies ExportedHandler<Bindings>;
