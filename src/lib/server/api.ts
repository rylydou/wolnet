import { error } from "@sveltejs/kit";
import type { DeviceRow } from "./devices";
import { deviceInput } from "./devices";
import { formatMacAddress } from "$lib/util";

/**
 * Reads a request body as either JSON or a form submission, so the endpoints are equally usable
 * from `fetch`, from `curl -d`, and from a plain HTML form. A body-less request (a bare `DELETE`,
 * say) is treated as an empty object rather than an error.
 */
const readBody = async (request: Request): Promise<Record<string, unknown>> => {
	const contentType = request.headers.get("content-type") ?? "";

	try {
		if (contentType.includes("json")) return await request.json();
		if (contentType.includes("form")) return Object.fromEntries(await request.formData());
	} catch {
		error(400, "Request body could not be parsed.");
	}

	return {};
};

/** Reads and validates a device payload, merging in any query parameters for `GET`-style calls. */
export const readDeviceInput = async (request: Request, url: URL) => {
	const parsed = deviceInput.safeParse({ ...Object.fromEntries(url.searchParams), ...(await readBody(request)) });
	if (!parsed.success)
		error(400, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" "));

	return parsed.data;
};

/** The JSON shape of a device, with the packed MAC address rendered back into its readable form. */
export const toDeviceResponse = (row: DeviceRow) => ({
	id: row.id,
	hostname: row.hostname ?? undefined,
	ip: row.ip ?? undefined,
	macAddress: row.macAddress == null ? undefined : formatMacAddress(row.macAddress),
	comment: row.comment ?? undefined,
	status: row.status,
	statusChangedAt: row.statusChangedAt ?? undefined,
	lastWokenAt: row.lastWokenAt ?? undefined,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});
