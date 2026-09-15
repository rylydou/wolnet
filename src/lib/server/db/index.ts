import * as env from "$app/env/private";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "./schema";

export * as schema from "./schema";

/**
 * Everything that has to survive a restart lives here: `data/` in the project root during
 * development, `/data` inside the container (a volume), both set by `WOL_DATA_DIR`.
 */
export const dataDir = resolve(env.WOL_DATA_DIR);
mkdirSync(dataDir, { recursive: true });

export const db = new Database(resolve(dataDir, "data.sqlite"), { create: true });
export const orm = drizzle({ client: db, relations: schema.relations });

if (env.WOL_DB_AUTO_MIGRATE) {
	try {
		await migrate(orm, { migrationsFolder: resolve("migrations") });
	} catch (error) {
		console.error("Failed to run database migrations:", error);
		throw error;
	}
}
