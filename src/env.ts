import { defineEnvVars } from "@sveltejs/kit/env";
import z from "zod";

export const variables = defineEnvVars({
	WOL_DB_AUTO_MIGRATE: {
		description: "Whether to automatically migrate the database.",
		schema: z.stringbool().default(true),
	},
});
