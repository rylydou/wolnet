import * as env from "$app/env/private";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "./schema.ts";

export { schema };

// `data/` during development, `/data` in Docker.
const dataDir = resolve(env.WOL_DATA_DIR);
mkdirSync(dataDir, { recursive: true });

export const orm = drizzle({ client: new Database(resolve(dataDir, "data.sqlite"), { create: true }) });

if (env.WOL_DB_AUTO_MIGRATE) {
	await migrate(orm, { migrationsFolder: resolve("migrations") });
}
