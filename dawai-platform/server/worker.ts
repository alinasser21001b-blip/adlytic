import { createDatabase } from "./db/client";
import { runLifecycleSweep } from "./services/lifecycle";

const database = await createDatabase({ migrate: false });

async function tick() {
  const result = await runLifecycleSweep(database);
  console.log(
    JSON.stringify({
      level: "info",
      message: "lifecycle-sweep-complete",
      ...result,
    }),
  );
}

await tick();
const interval = setInterval(() => void tick(), 30_000);

async function shutdown() {
  clearInterval(interval);
  await database.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
