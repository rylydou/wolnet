import { defineEnvVars } from "@sveltejs/kit/env";
import z from "zod";

export const variables = defineEnvVars({
	WOL_DATA_DIR: {
		description: "Where the database is kept. The Docker image sets it to `/data`.",
		schema: z.string().default("data"),
	},
	WOL_DB_AUTO_MIGRATE: {
		description: "Update the database to the latest version on start.",
		schema: z.stringbool().default(true),
	},
});
