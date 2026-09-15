import { error, json, type RequestHandler } from "@sveltejs/kit";
import { readDeviceInput, toDeviceResponse } from "$lib/server/api";
import { findDevice, insertDevice, updateDeviceById } from "$lib/server/devices";

/**
 * Adds a device, or modifies the matching one if its hostname or MAC address is already on the
 * list. Fields left out are cleared, so a call always describes the device in full.
 */
const addDevice: RequestHandler = async ({ request, url }) => {
	const data = await readDeviceInput(request, url);

	if (!data.hostname && !data.macAddress && !data.ip) {
		error(400, "A device needs at least a hostname, MAC address or IP.");
	}

	const existing =
		(data.hostname && (await findDevice(data.hostname))) ||
		(data.macAddress && (await findDevice(data.macAddress))) ||
		undefined;

	const device = existing ? await updateDeviceById(existing.id, data) : await insertDevice(data);
	if (!device) error(409, "That device was removed while it was being updated.");

	return json(toDeviceResponse(device), { status: existing ? 200 : 201 });
};

export const POST = addDevice;
export const PATCH = addDevice;
