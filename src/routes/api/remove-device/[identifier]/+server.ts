import { error, json, type RequestHandler } from "@sveltejs/kit";
import { toDeviceResponse } from "$lib/server/api";
import { deleteDeviceById, findDevice } from "$lib/server/devices";

/** Removes a device from the list by its hostname, id or MAC address. */
const removeDevice: RequestHandler = async ({ params }) => {
	const identifier = params.identifier!;

	const device = await findDevice(identifier);
	if (!device) error(404, `No device known as "${identifier}".`);

	const removed = await deleteDeviceById(device.id);
	if (!removed) error(409, "That device was already removed.");

	return json({ removed: toDeviceResponse(removed) });
};

export const POST = removeDevice;
export const DELETE = removeDevice;
