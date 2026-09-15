import { form, query } from "$app/server";
import { invalid } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { orm, schema } from "$lib/server/db";
import {
	DeviceConflict,
	deleteDeviceById,
	deviceChanged,
	deviceInput,
	insertDevice,
	markDeviceWoken,
	selectDevices,
	updateDeviceById,
} from "$lib/server/devices";
import { scanNetwork } from "$lib/server/discovery";
import { sendMagicPacket } from "$lib/server/wol";
import z from "zod";

export const getDevices = query.live(async function* () {
	while (true) {
		// Subscribe before reading, so a device added while the read is in flight still wakes us.
		const changed = deviceChanged();
		yield await selectDevices();
		await changed;
	}
});

/**
 * Sweeps the local network and reports what answered. A scan takes a few seconds of mostly waiting,
 * so it is a `query` rather than a live one: it runs when the scan dialog is opened and re-runs only
 * when the user asks for it again via `.refresh()`.
 */
export const discoverDevices = query(async () => await scanNetwork());

/** A duplicate hostname, IP or MAC is something the form can fix, so it reads back as a form error. */
const reportConflicts = async <Result>(write: () => Promise<Result>) => {
	try {
		return await write();
	} catch (error) {
		if (error instanceof DeviceConflict) invalid(error.message);
		throw error;
	}
};

export const createDevice = form(deviceInput, async (data) => {
	await reportConflicts(() => insertDevice(data));
});

export const updateDevice = form(deviceInput.extend({ id: z.string().nonempty() }), async ({ id, ...data }) => {
	// The device may have been removed between the list being rendered and this submission.
	if (!(await reportConflicts(() => updateDeviceById(id, data)))) invalid("That device no longer exists.");
});

export const deleteDevice = form(z.object({ id: z.string().nonempty() }), async ({ id }) => {
	// The device may have been removed between the list being rendered and this submission.
	if (!(await deleteDeviceById(id))) invalid("That device no longer exists.");
});

export const wakeDevice = form(z.object({ id: z.string().nonempty() }), async ({ id }) => {
	const [device] = await orm
		.select({ macAddress: schema.devices.macAddress })
		.from(schema.devices)
		.where(eq(schema.devices.id, id));

	if (!device) invalid("That device no longer exists.");
	if (device.macAddress == null) invalid("This device has no MAC address set, so it can't be woken.");

	try {
		await sendMagicPacket(device.macAddress);
	} catch (error) {
		console.error(`Failed to send Wake-on-LAN packet for device ${id}:`, error);
		invalid("Could not send the wake packet. Check the server logs for details.");
	}

	await markDeviceWoken(id);
});
