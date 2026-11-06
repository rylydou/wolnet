import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";

// Same database as `src/lib/server/db/index.ts`.
const dataDir = resolve(process.env.WOL_DATA_DIR ?? "data");

export default defineConfig({
	schema: "./src/lib/server/db/schema.ts",
	out: "./migrations",
	dialect: "sqlite",
	dbCredentials: { url: resolve(dataDir, "data.sqlite") },
});
