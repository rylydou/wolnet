import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";

// Mirrors `src/lib/server/db/index.ts`, but drizzle-kit runs outside SvelteKit so it reads the
// environment directly rather than through `$app/env/private`.
const dataDir = resolve(process.env.WOL_DATA_DIR ?? "data");

export default defineConfig({
	schema: "./src/lib/server/db/schema",
	out: "./migrations",
	dialect: "sqlite",
	dbCredentials: { url: resolve(dataDir, "data.sqlite") },
	verbose: true,
});
