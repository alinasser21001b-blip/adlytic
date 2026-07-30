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
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
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
      }),
    );
  },
);

const sweep = setInterval(() => {
  void runLifecycleSweep(database).catch((error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "lifecycle-sweep-failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  });
}, 30_000);
sweep.unref();

async function shutdown(signal: string) {
  clearInterval(sweep);
  server.close();
  await database.close();
  console.log(JSON.stringify({ level: "info", message: "shutdown", signal }));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
