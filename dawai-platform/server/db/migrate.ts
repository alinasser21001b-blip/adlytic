import { createDatabase } from "./client";

const database = await createDatabase({ migrate: true });
await database.close();
console.log("Dawai database migration complete.");
