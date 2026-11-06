/** Helpers for the routes in `src/routes/api`. */

import { error } from "@sveltejs/kit";
import type z from "zod";
import * as devices from "./devices.ts";

/** Reads a JSON request body and checks it against `schema`. */
export const readJson = async <Schema extends z.ZodType>(request: Request, schema: Schema) => {
	const body = await request.json().catch(() => error(400, "The request body must be JSON."));

	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		error(400, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" "));
	}

	return parsed.data as z.output<Schema>;
};

/** Finds a device by id, hostname, IP, or MAC address, or responds 404. */
export const findDevice = async (handle: string) =>
	(await devices.find(handle)) ?? error(404, `No device called "${handle}".`);

/** Runs a change to the device list, and turns problems the user can fix into error responses. */
export const tryChange = async <Result>(change: () => Promise<Result>) => {
	try {
		return await change();
	} catch (cause) {
		if (cause instanceof devices.DeviceError) error(cause.status, cause.message);
		throw cause;
	}
};
