import { defineEnvVars } from "@sveltejs/kit/env";
import z from "zod";

export const variables = defineEnvVars({
	WOL_DB_AUTO_MIGRATE: {
		description: "Whether to automatically migrate the database.",
		schema: z.stringbool().default(true),
	},
	WOL_DATA_DIR: {
		description:
			"Directory holding persistent state (the SQLite database). Defaults to `data/` in the project root; the Docker image sets it to `/data`.",
		schema: z.string().default("data"),
	},
});
