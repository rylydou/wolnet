import { error, json, type RequestHandler } from "@sveltejs/kit";
import { readDeviceInput, toDeviceResponse } from "$lib/server/api";
import { DeviceConflict, findDevice, insertDevice, updateDeviceById } from "$lib/server/devices";

/**
 * Adds a device, or updates the matching one if its hostname or MAC address is already on the
 * list. `POST` replaces the device, so the call describes it in full and a field left out is
 * cleared; `PATCH` merges, leaving anything not mentioned as it was.
 */
const saveDevice =
	(merge: boolean): RequestHandler =>
	async ({ request, url }) => {
		const data = await readDeviceInput(request, url);

		if (!data.hostname && !data.macAddress && !data.ip) {
			error(400, "A device needs at least a hostname, MAC address or IP.");
		}

		const existing =
			(data.hostname && (await findDevice(data.hostname))) ||
			(data.macAddress && (await findDevice(data.macAddress))) ||
			undefined;

		let device;
		try {
			device = existing ? await updateDeviceById(existing.id, data, { merge }) : await insertDevice(data);
		} catch (cause) {
			// A hostname, IP or MAC that belongs to some *other* device: the caller's to resolve.
			if (cause instanceof DeviceConflict) error(409, cause.message);
			throw cause;
		}

		if (!device) error(409, "That device was removed while it was being updated.");

		return json(toDeviceResponse(device), { status: existing ? 200 : 201 });
	};

export const POST = saveDevice(false);
export const PATCH = saveDevice(true);
