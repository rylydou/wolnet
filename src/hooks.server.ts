import type { ServerInit } from "@sveltejs/kit/hooks";
import { startStatusChecks, stopStatusChecks } from "#lib/server/status.ts";

export const init: ServerInit = () => {
	startStatusChecks();

	// The Bun adapter sends this once it has stopped taking requests. The status checks' timer
	// would otherwise keep the process running.
	process.once("sveltekit:shutdown", stopStatusChecks);
};
