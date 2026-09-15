import * as env from "$app/env/private";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export * as schema from "./schema";

export const db = new Database("./database.db", { create: true });
export const orm = drizzle({ client: db, relations: schema.relations });

if (env.WOL_DB_AUTO_MIGRATE) {
	try {
		await migrate(orm, { migrationsFolder: "migrations" });
	} catch (error) {
		console.error("Failed to run database migrations:", error);
		throw error;
	}
}
