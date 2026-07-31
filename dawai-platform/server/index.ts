import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { config } from "./config";
import { createDatabase } from "./db/client";
import { createApp } from "./app";
import { bootstrapAdmin } from "./routes/admin";
import { runLifecycleSweep } from "./services/lifecycle";

const database = await createDatabase({ migrate: config.nodeEnv !== "production" });
await bootstrapAdmin(database, config.adminEmail, config.adminPassword);
const app = createApp(database);

if (config.nodeEnv === "production") {
  // Serve built assets and public PWA files before the SPA catch-all.
  // Without this, /manifest.webmanifest and icons become index.html.
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("/manifest.webmanifest", serveStatic({ path: "./dist/manifest.webmanifest" }));
  app.get("/dawai-icon.svg", serveStatic({ path: "./dist/dawai-icon.svg" }));
  app.get("/sw.js", serveStatic({ path: "./dist/sw.js" }));
  app.get("/offline.html", serveStatic({ path: "./dist/offline.html" }));
  app.get("*", async (context, next) => {
    const pathname = new URL(context.req.url).pathname;
    if (pathname.startsWith("/api/") || pathname.startsWith("/health/")) {
      return next();
    }
    const candidate = join(process.cwd(), "dist", pathname.replace(/^\//, ""));
    if (
      pathname !== "/" &&
      !pathname.includes("..") &&
      existsSync(candidate) &&
      !pathname.endsWith(".html")
    ) {
      return serveStatic({ path: `./dist${pathname}` })(context, next);
    }
    return serveStatic({ path: "./dist/index.html" })(context, next);
  });
}

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "dawai-api-listening",
        port: info.port,
        mode: config.nodeEnv,
        deployEnv: config.deployEnv,
      }),
    );
  },
);

const shouldSweep =
  config.runLifecycleInApi && process.env.DISABLE_API_LIFECYCLE !== "true";
const sweep = shouldSweep
  ? setInterval(() => {
      void runLifecycleSweep(database).catch((error) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "lifecycle-sweep-failed",
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
      });
    }, 30_000)
  : null;
sweep?.unref();

async function shutdown(signal: string) {
  if (sweep) clearInterval(sweep);
  server.close();
  await database.close();
  console.log(JSON.stringify({ level: "info", message: "shutdown", signal }));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
