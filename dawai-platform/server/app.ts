import { randomUUID } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { config } from "./config";
import type { Database } from "./db/client";
import { ApiError } from "./errors";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { clinicalRoutes } from "./routes/clinical";
import { fileRoutes } from "./routes/files";
import { patientRoutes } from "./routes/patient";
import { pharmacyRoutes } from "./routes/pharmacy";
import { publicRoutes } from "./routes/public";
import { sharedRoutes } from "./routes/shared";
import type { AppVariables } from "./types";

export function createApp(database: Database) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (context, next) => {
    const requestId = context.req.header("X-Request-ID") ?? randomUUID();
    context.set("requestId", requestId);
    context.set("db", database);
    context.header("X-Request-ID", requestId);
    await next();
  });
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", config.webOrigin],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: "no-referrer",
    }),
  );
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (origin === config.webOrigin ? origin : ""),
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
        "Idempotency-Key",
        "X-Request-ID",
      ],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 12 * 1024 * 1024,
      onError: (context) =>
        context.json(
          {
            error: {
              code: "BODY_TOO_LARGE",
              message: "حجم الطلب أكبر من المسموح.",
              requestId: context.get("requestId"),
              timestamp: new Date().toISOString(),
            },
          },
          413,
        ),
    }),
  );

  app.get("/health/live", (context) =>
    context.json({ status: "ok", service: "dawai-api" }),
  );
  app.get("/health/ready", async (context) => {
    await database.query("SELECT 1 AS ready");
    return context.json({ status: "ready", database: "connected" });
  });

  app.route("/api/v1/auth", authRoutes(database));
  app.route("/api/v1", publicRoutes(database));
  app.route("/api/v1/patient", patientRoutes(database));
  app.route("/api/v1/pharmacy", pharmacyRoutes(database));
  app.route("/api/v1/admin", adminRoutes(database));
  app.route("/api/v1/files", fileRoutes(database));
  app.route("/api/v1/clinical", clinicalRoutes(database));
  app.route("/api/v1", sharedRoutes(database));

  app.notFound((context) =>
    context.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "المسار المطلوب غير موجود.",
          requestId: context.get("requestId") ?? randomUUID(),
          timestamp: new Date().toISOString(),
        },
      },
      404,
    ),
  );

  app.onError((error, context) => {
    const requestId = context.get("requestId") ?? randomUUID();
    if (error instanceof ZodError) {
      return context.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "تحقق من البيانات المدخلة.",
            details: error.issues.map((issue) => ({
              field: issue.path.join("."),
              code: issue.code,
              message: issue.message,
            })),
            requestId,
            timestamp: new Date().toISOString(),
          },
        },
        422,
      );
    }
    if (error instanceof ApiError) {
      if (error.status === 429 && typeof error.details === "object") {
        const retryAfter = (error.details as { retryAfterSeconds?: number })
          .retryAfterSeconds;
        if (retryAfter) context.header("Retry-After", String(retryAfter));
      }
      return context.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId,
            timestamp: new Date().toISOString(),
          },
        },
        error.status,
      );
    }

    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        name: error.name,
        message: error.message,
      }),
    );
    return context.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "حدث خطأ غير متوقع. أعد المحاولة.",
          requestId,
          timestamp: new Date().toISOString(),
        },
      },
      500,
    );
  });

  return app;
}
