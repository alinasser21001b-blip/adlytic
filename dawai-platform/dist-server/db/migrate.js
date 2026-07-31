import {
  createDatabase
} from "../chunk-CHICJPPN.js";

// server/db/migrate.ts
var database = await createDatabase({ migrate: true });
await database.close();
console.log("Dawai database migration complete.");
//# sourceMappingURL=migrate.js.map