import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as serverConfig from "../config";
import * as schema from "./schema";
import { Database } from "bun:sqlite";

export * as schema from "./schema";

export const client = new Database("./data/sqlite.db");
// export const orm = drizzle({ client, schema, relations: schema.relations, casing: 'snake_case' });
export const orm = drizzle({ client, schema, relations: schema.relations, casing: "snake_case" });

if (serverConfig.autoMigrate) {
	try {
		await migrate(orm, { migrationsFolder: "migrations" });
	} catch (error) {
		console.error("Failed to run database migrations:", error);
		throw error;
	}
}
