import {
  runLifecycleSweep
} from "./chunk-VG7NKIZF.js";
import {
  createDatabase
} from "./chunk-CHICJPPN.js";

// server/worker.ts
var database = await createDatabase({ migrate: false });
async function tick() {
  const result = await runLifecycleSweep(database);
  console.log(
    JSON.stringify({
      level: "info",
      message: "lifecycle-sweep-complete",
      ...result
    })
  );
}
await tick();
var interval = setInterval(() => void tick(), 3e4);
async function shutdown() {
  clearInterval(interval);
  await database.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
//# sourceMappingURL=worker.js.map