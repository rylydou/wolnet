import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/lib/server/db/schema",
	out: "./migrations",
	dialect: "sqlite",
	dbCredentials: { url: "./database.db" },
	verbose: true,
});
